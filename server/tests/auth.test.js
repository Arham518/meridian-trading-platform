import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok; let db; let totp;
const PW = 'Trader#2026a';
const stamp = Date.now();
const mail = (n) => `auth${n}.${stamp}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookieOf = (res) => { const c = res.cookies.find((x) => x.startsWith('rt=')); return c ? c.split(';')[0] : null; };
const login = (identifier, password = PW, extra = {}) => t.api('POST', '/api/auth/login', { body: { identifier, password, ...extra } });

before(async () => {
  t = await boot({ LOCKOUT_BASE_SECONDS: '2', MAIL_COOLDOWN_SECONDS: '2', REFRESH_GRACE_MS: '300', ACCESS_TOKEN_TTL: '15m', RATE_LIMIT_MAIL: '500' });
  adminTok = await t.login(ADMIN.email, ADMIN.password);
  db = (await import('../src/db.js')).db;
  totp = await import('../src/services/totp.js');
});
after(async () => { await t.close(); });

test('register: strong-password rules, confirm password, unique email/username, verification mail sent, token stored hashed', async () => {
  const e = mail(1);
  assert.equal((await t.register(e, 'Auth One', 'short1A!')).status, 400, 'too short');
  assert.equal((await t.register(e, 'Auth One', 'alllowercaseletters')).status, 400, 'one character class');
  assert.equal((await t.register(e, 'Auth One', 'Password#12345')).status, 400, 'common word');
  const mismatch = await t.api('POST', '/api/auth/register', { body: { name: 'Auth One', email: e, password: PW, confirmPassword: 'Different#2026' } });
  assert.equal(mismatch.status, 400); assert.match(mismatch.body.error, /do not match/);
  assert.equal((await t.api('POST', '/api/auth/register', { body: { name: 'Auth One', email: e, password: PW } })).status, 400, 'confirm password required');
  const r = await t.register(e, 'Auth One', PW, { username: 'Auth_One' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.emailVerified, false); assert.equal(r.body.user.username, 'auth_one');
  assert.ok(cookieOf(r) && r.cookies.find((c) => c.startsWith('rt=')).includes('HttpOnly'), 'refresh cookie is httpOnly');
  assert.equal((await t.register(mail(99), 'Other', PW, { username: 'AUTH_one' })).status, 409, 'username unique (case-insensitive)');
  assert.equal((await t.register(e.toUpperCase(), 'Dup', PW)).status, 409);
  const token = t.lastToken(e, 'verify-email'); assert.ok(token, 'verification mail written to dev outbox');
  const html = t.mailsTo(e, 'verify-email')[0];
  assert.match(html, /Confirm your email address/); assert.match(html, /DEV MAIL/);
  const row = db.prepare("SELECT token_hash FROM auth_tokens WHERE type = 'verify_email' AND user_id = ?").get(r.body.user.id);
  assert.notEqual(row.token_hash, token, 'only a hash of the token is stored'); assert.equal(row.token_hash.length, 64);
});

test('unverified users can sign in but are gated from signals and paper trading; verification unlocks it (single use)', async () => {
  const e = mail(1);
  const l = await login(e); assert.equal(l.status, 200);
  const tok = l.body.token;
  const me = await t.api('GET', '/api/auth/me', { token: tok }); assert.equal(me.body.user.emailVerified, false);
  const gate = await t.api('GET', '/api/signals', { token: tok });
  assert.equal(gate.status, 403); assert.equal(gate.body.code, 'email_unverified');
  assert.equal((await t.api('POST', '/api/trading/orders', { token: tok, body: { symbol: 'ETHUSDT', side: 'BUY', type: 'market', qty: 1 } })).status, 403);
  assert.equal((await t.api('GET', '/api/trading/portfolio', { token: tok })).status, 200, 'read-only account data still works');
  assert.equal((await t.api('POST', '/api/auth/verify-email', { body: { token: 'x'.repeat(30) } })).status, 400, 'bogus token');
  const token = t.lastToken(e, 'verify-email');
  const ok = await t.api('POST', '/api/auth/verify-email', { body: { token } }); assert.equal(ok.status, 200);
  assert.equal((await t.api('POST', '/api/auth/verify-email', { body: { token } })).status, 400, 'token is single use');
  assert.equal((await t.api('GET', '/api/signals', { token: tok })).status, 200);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).body.user.emailVerified, true);
  assert.equal((await t.api('POST', '/api/auth/resend-verification', { token: tok })).status, 400, 'already verified');
});

test('resend verification: cooldown, new token supersedes old, expired token rejected, public resend does not reveal accounts', async () => {
  const e = mail(2);
  const r = await t.register(e, 'Auth Two', PW); const tok = r.body.token;
  const first = t.lastToken(e, 'verify-email');
  const tooSoon = await t.api('POST', '/api/auth/resend-verification', { token: tok });
  assert.equal(tooSoon.status, 429); assert.ok(tooSoon.body.retryAfter >= 1);
  await sleep(2200);
  assert.equal((await t.api('POST', '/api/auth/resend-verification', { token: tok })).status, 200);
  assert.equal(t.mailsTo(e, 'verify-email').length, 2);
  const second = t.lastToken(e, 'verify-email'); assert.notEqual(first, second);
  assert.equal((await t.api('POST', '/api/auth/verify-email', { body: { token: first } })).status, 400, 'older link is invalidated');
  db.prepare("UPDATE auth_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE type = 'verify_email' AND user_id = ? AND used_at IS NULL").run(r.body.user.id);
  const exp = await t.api('POST', '/api/auth/verify-email', { body: { token: second } });
  assert.equal(exp.status, 400); assert.equal(exp.body.code, 'invalid_token');
  await sleep(2100);
  const pub = await t.api('POST', '/api/auth/resend-verification', { body: { email: e } }); assert.equal(pub.status, 200);
  const ghost = await t.api('POST', '/api/auth/resend-verification', { body: { email: `nobody${stamp}@example.com` } });
  assert.equal(ghost.status, 200); assert.deepEqual(ghost.body, { ok: true }, 'same answer for unknown address');
  assert.equal(t.mailsTo(e, 'verify-email').length, 3);
  assert.equal(t.mailsTo(`nobody${stamp}@example.com`, 'verify-email').length, 0);
  assert.equal((await t.verify(e)), true);
});

test('login by email or username; remember-me controls cookie persistence; generic error for bad credentials', async () => {
  const e = mail(1);
  assert.equal((await login(e.toUpperCase())).status, 200);
  assert.equal((await login('auth_one')).status, 200, 'username works');
  const bad1 = await login(e, 'Wrong#Password1'); const bad2 = await login(`ghost${stamp}@example.com`, 'Wrong#Password1');
  assert.equal(bad1.status, 401); assert.equal(bad2.status, 401); assert.equal(bad1.body.error, bad2.body.error, 'no user enumeration');
  const rem = await login(e, PW, { remember: true });
  const ck = rem.cookies.find((c) => c.startsWith('rt='));
  assert.match(ck, /Max-Age=\d+/); assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Lax/);
  const ses = await login(e, PW, { remember: false });
  assert.doesNotMatch(ses.cookies.find((c) => c.startsWith('rt=')), /Max-Age/, 'session cookie when remember-me is off');
});

test('lockout: progressive delay after repeated failures, correct password refused while locked, then recovers and resets', async () => {
  const e = mail(3); await t.registerVerified(e, 'Lock Test', PW);
  let last;
  for (let i = 0; i < 4; i++) { last = await login(e, 'Wrong#Password1'); assert.equal(last.status, 401); }
  last = await login(e, 'Wrong#Password1');
  assert.equal(last.status, 429); assert.equal(last.body.code, 'locked'); assert.ok(last.body.retryAfter >= 1);
  const refused = await login(e, PW); assert.equal(refused.status, 429, 'right password refused during lockout');
  await sleep(2300);
  const ok = await login(e, PW); assert.equal(ok.status, 200, 'works once the delay passes');
  assert.equal(db.prepare('SELECT failed_logins FROM users WHERE email = ?').get(e).failed_logins, 0);
  // second lockout is longer (progressive)
  for (let i = 0; i < 5; i++) await login(e, 'Wrong#Password1');
  const again = await login(e, 'Wrong#Password1'); assert.equal(again.status, 429);
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(e).id;
  const acts = db.prepare("SELECT event FROM login_activity WHERE user_id = ?").all(uid).map((r) => r.event);
  assert.ok(acts.includes('account_locked') && acts.includes('login_locked'), 'lockouts are logged');
  await t.api('POST', `/api/admin/users/${uid}/unlock`, { token: adminTok });
  assert.equal((await login(e, PW)).status, 200, 'admin unlock');
});

test('refresh-token rotation: new cookie each time, old one revoked after grace, reuse kills the session', async () => {
  const e = mail(1);
  const l = await login(e, PW, { remember: true }); const rt1 = cookieOf(l);
  const r1 = await t.api('POST', '/api/auth/refresh', { cookie: rt1 }); assert.equal(r1.status, 200);
  const rt2 = cookieOf(r1); assert.ok(rt2 && rt2 !== rt1, 'cookie rotated');
  assert.ok(r1.body.token && r1.body.user.email === e);
  assert.equal((await t.api('GET', '/api/auth/me', { token: r1.body.token })).status, 200);
  const parallel = await t.api('POST', '/api/auth/refresh', { cookie: rt1 }); assert.equal(parallel.status, 200, 'in-flight duplicate inside grace window tolerated');
  assert.equal(cookieOf(parallel), null);
  await sleep(450);
  const reuse = await t.api('POST', '/api/auth/refresh', { cookie: rt1 }); assert.equal(reuse.status, 401, 'stale refresh token rejected');
  assert.equal((await t.api('POST', '/api/auth/refresh', { cookie: rt2 })).status, 401, 'reuse revokes the whole session');
  assert.equal((await t.api('GET', '/api/auth/me', { token: r1.body.token })).status, 401, 'access token of the revoked session dies');
  assert.equal((await t.api('POST', '/api/auth/refresh')).status, 401, 'no cookie');
  assert.equal((await t.api('POST', '/api/auth/refresh', { cookie: 'rt=garbage.value' })).status, 401);
});

test('logout revokes the session; sessions can be listed, revoked individually, and "log out of all devices"', async () => {
  const e = mail(1);
  const a = await login(e); const b = await login(e); const c = await login(e);
  const list = await t.api('GET', '/api/auth/sessions', { token: a.body.token });
  assert.ok(list.body.sessions.length >= 3); assert.equal(list.body.sessions.filter((s) => s.current).length, 1);
  assert.ok(list.body.sessions.every((s) => !('refresh_hash' in s) && !JSON.stringify(s).includes('hash')));
  const lo = await t.api('POST', '/api/auth/logout', { token: b.body.token, cookie: cookieOf(b) }); assert.equal(lo.status, 200);
  assert.equal((await t.api('GET', '/api/auth/me', { token: b.body.token })).status, 401);
  assert.equal((await t.api('POST', '/api/auth/refresh', { cookie: cookieOf(b) })).status, 401);
  const other = list.body.sessions.find((s) => !s.current && s.id !== (list.body.sessions.find((x) => x.current).id));
  const del = await t.api('DELETE', `/api/auth/sessions/${other.id}`, { token: a.body.token }); assert.equal(del.status, 200);
  const ghost = await t.api('DELETE', '/api/auth/sessions/doesnotexist', { token: a.body.token }); assert.equal(ghost.status, 404);
  // permission: another user cannot revoke my session
  const e2 = mail(2); const o = await login(e2);
  const sid = list.body.sessions.find((s) => s.current).id;
  assert.equal((await t.api('DELETE', `/api/auth/sessions/${sid}`, { token: o.body.token })).status, 404);
  assert.equal((await t.api('GET', '/api/auth/me', { token: a.body.token })).status, 200);
  const all = await t.api('POST', '/api/auth/logout-all', { token: a.body.token }); assert.equal(all.status, 200);
  for (const x of [a, c]) { assert.equal((await t.api('GET', '/api/auth/me', { token: x.body.token })).status, 401); assert.equal((await t.api('POST', '/api/auth/refresh', { cookie: cookieOf(x) })).status, 401); }
  assert.equal((await t.api('GET', '/api/auth/me', { token: o.body.token })).status, 200, 'other users are untouched');
});

test('forgot/reset password: generic answer, hashed single-use expiring token, sessions revoked, alert mail', async () => {
  const e = mail(4); await t.registerVerified(e, 'Reset Me', PW);
  const live = await login(e);
  const unknown = await t.api('POST', '/api/auth/forgot-password', { body: { email: `ghost${stamp}@example.com` } });
  const known = await t.api('POST', '/api/auth/forgot-password', { body: { email: e } });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(unknown.body, known.body, 'identical response');
  assert.equal(t.mailsTo(`ghost${stamp}@example.com`, 'reset-password').length, 0); assert.equal(t.mailsTo(e, 'reset-password').length, 1);
  const token = t.lastToken(e, 'reset-password');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM auth_tokens WHERE token_hash = ?").get(token).n, 0, 'plain token never stored');
  const NEW = 'Fresh#Pass2027x';
  assert.equal((await t.api('POST', '/api/auth/reset-password', { body: { token, password: 'weak', confirmPassword: 'weak' } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/reset-password', { body: { token, password: NEW, confirmPassword: 'Other#Pass2027x' } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/reset-password', { body: { token, password: NEW, confirmPassword: NEW } })).status, 200);
  assert.equal((await t.api('POST', '/api/auth/reset-password', { body: { token, password: NEW, confirmPassword: NEW } })).status, 400, 'single use');
  assert.equal((await login(e, PW)).status, 401); assert.equal((await login(e, NEW)).status, 200);
  assert.equal((await t.api('GET', '/api/auth/me', { token: live.body.token })).status, 401, 'old sessions revoked');
  assert.equal(t.mailsTo(e, 'password-changed').length, 1, 'security alert sent');
  // expiry
  await sleep(2100);
  await t.api('POST', '/api/auth/forgot-password', { body: { email: e } });
  const t2 = t.lastToken(e, 'reset-password');
  db.prepare("UPDATE auth_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE type = 'reset_password' AND used_at IS NULL").run();
  const expired = await t.api('POST', '/api/auth/reset-password', { body: { token: t2, password: PW, confirmPassword: PW } });
  assert.equal(expired.status, 400); assert.equal(expired.body.code, 'invalid_token');
});

test('change password needs the current password and signs out other devices (not this one)', async () => {
  const e = mail(5); await t.registerVerified(e, 'Change Pw', PW);
  const here = await login(e); const there = await login(e);
  const NEW = 'Changed#2027pw';
  assert.equal((await t.api('POST', '/api/auth/change-password', { token: here.body.token, body: { currentPassword: 'Wrong#Current1', newPassword: NEW } })).status, 400);
  const ok = await t.api('POST', '/api/auth/change-password', { token: here.body.token, body: { currentPassword: PW, newPassword: NEW, confirmPassword: NEW } });
  assert.equal(ok.status, 200); assert.ok(ok.body.otherSessionsRevoked >= 1);
  assert.equal((await t.api('GET', '/api/auth/me', { token: there.body.token })).status, 401);
  assert.equal((await t.api('GET', '/api/auth/me', { token: here.body.token })).status, 200);
  assert.equal(t.mailsTo(e, 'password-changed').length, 1);
});

test('change email: password required, confirmed from the new address, old address keeps working until then, single use', async () => {
  const e = mail(6); const ne = mail(7); await t.registerVerified(e, 'Mail Mover', PW);
  const s = await login(e); const tok = s.body.token;
  assert.equal((await t.api('POST', '/api/auth/change-email', { token: tok, body: { newEmail: ne, password: 'Wrong#Pass123' } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/change-email', { token: tok, body: { newEmail: mail(1), password: PW } })).status, 409, 'already used');
  assert.equal((await t.api('POST', '/api/auth/change-email', { token: tok, body: { newEmail: ne, password: PW } })).status, 200);
  assert.equal(t.mailsTo(ne, 'change-email').length, 1, 'link goes to the NEW address');
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).body.user.pendingEmail, ne);
  assert.equal((await login(e)).status, 200, 'old email still works before confirmation');
  const token = t.lastToken(ne, 'change-email');
  assert.equal((await t.api('POST', '/api/auth/confirm-email-change', { body: { token: 'z'.repeat(30) } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/confirm-email-change', { body: { token } })).status, 200);
  assert.equal((await t.api('POST', '/api/auth/confirm-email-change', { body: { token } })).status, 400, 'single use');
  assert.equal((await login(ne)).status, 200); assert.equal((await login(e)).status, 401);
  assert.equal(t.mailsTo(e, 'email-changed').length, 1, 'old address is notified');
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).body.user.pendingEmail, null);
});

test('two-factor: QR setup, enable with a valid code, login challenge, replay protection, backup codes, disable', async () => {
  const e = mail(8); await t.registerVerified(e, 'Two Factor', PW);
  const tok = (await login(e)).body.token;
  const setup = await t.api('POST', '/api/auth/2fa/setup', { token: tok });
  assert.equal(setup.status, 200); assert.match(setup.body.qr, /^data:image\/png;base64,/); assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
  const secret = setup.body.secret;
  assert.ok(!db.prepare('SELECT totp_secret FROM users WHERE email = ?').get(e).totp_secret.includes(secret), 'secret encrypted at rest');
  assert.equal((await t.api('POST', '/api/auth/2fa/enable', { token: tok, body: { code: '000000' } })).status, 400);
  const step = totp.currentStep();
  const en = await t.api('POST', '/api/auth/2fa/enable', { token: tok, body: { code: totp.totpAt(secret, step) } });
  assert.equal(en.status, 200); assert.equal(en.body.backupCodes.length, 8);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).body.user.twoFactorEnabled, true);
  const ch = await login(e); assert.equal(ch.status, 200); assert.equal(ch.body.requires2fa, true); assert.ok(ch.body.challenge); assert.equal(ch.body.token, undefined, 'no session before the second factor');
  assert.equal(cookieOf(ch), null);
  const bad = await t.api('POST', '/api/auth/login/2fa', { body: { challenge: ch.body.challenge, code: '123456' } }); assert.equal(bad.status, 401);
  const replay = await t.api('POST', '/api/auth/login/2fa', { body: { challenge: ch.body.challenge, code: totp.totpAt(secret, step) } });
  assert.equal(replay.status, 401, 'a code that was already used cannot be replayed');
  const good = await t.api('POST', '/api/auth/login/2fa', { body: { challenge: ch.body.challenge, code: totp.totpAt(secret, step + 1) } });
  assert.equal(good.status, 200); assert.ok(good.body.token); assert.ok(cookieOf(good));
  assert.equal((await t.api('POST', '/api/auth/login/2fa', { body: { challenge: 'a.b.c', code: '123456' } })).status, 401, 'forged challenge');
  assert.equal((await t.api('GET', '/api/auth/me', { token: ch.body.challenge })).status, 401, 'challenge token is not an access token');
  // backup code: works once
  const code = en.body.backupCodes[0];
  const ch2 = await login(e);
  assert.equal((await t.api('POST', '/api/auth/login/2fa', { body: { challenge: ch2.body.challenge, code } })).status, 200);
  const ch3 = await login(e);
  assert.equal((await t.api('POST', '/api/auth/login/2fa', { body: { challenge: ch3.body.challenge, code } })).status, 401, 'backup code is single use');
  // disable requires password + code
  assert.equal((await t.api('POST', '/api/auth/2fa/disable', { token: good.body.token, body: { password: 'Wrong#Pass123', code: en.body.backupCodes[1] } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/2fa/disable', { token: good.body.token, body: { password: PW, code: en.body.backupCodes[1] } })).status, 200);
  assert.equal((await login(e)).body.requires2fa, undefined);
  assert.equal(t.mailsTo(e, '2fa-enabled').length, 1);
});

test('admin: verification status, resend verification, force reset, disable revokes sessions; users cannot use admin routes', async () => {
  const e = mail(9); const r = await t.register(e, 'Admin Target', PW); const uid = r.body.user.id; const utok = r.body.token;
  const list = await t.api('GET', '/api/admin/users?q=Admin%20Target', { token: adminTok });
  const row = list.body.rows.find((x) => x.id === uid);
  assert.ok(row && row.email_verified_at === null, 'unverified status visible in list');
  assert.ok(!JSON.stringify(list.body).match(/totp_secret|password_hash|refresh_hash|token_hash/), 'no secrets in the users list');
  for (const [m, u] of [['POST', `/api/admin/users/${uid}/resend-verification`], ['POST', `/api/admin/users/${uid}/force-reset`], ['POST', `/api/admin/users/${uid}/unlock`]]) assert.equal((await t.api(m, u, { token: utok })).status, 403, `${u} is admin only`);
  await sleep(2100);
  assert.equal((await t.api('POST', `/api/admin/users/${uid}/resend-verification`, { token: adminTok })).status, 200);
  assert.equal(t.mailsTo(e, 'verify-email').length, 2);
  assert.equal((await t.api('POST', '/api/admin/users/999999/resend-verification', { token: adminTok })).status, 404);
  assert.equal(await t.verify(e), true);
  assert.equal((await t.api('POST', `/api/admin/users/${uid}/resend-verification`, { token: adminTok })).status, 400, 'already verified');
  // force reset
  assert.equal((await t.api('POST', `/api/admin/users/${uid}/force-reset`, { token: adminTok })).status, 200);
  assert.equal((await t.api('GET', '/api/auth/me', { token: utok })).status, 401, 'sessions revoked');
  const blocked = await login(e); assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'password_reset_required');
  const token = t.lastToken(e, 'admin-reset');
  const NEW = 'Forced#Reset2027';
  assert.equal((await t.api('POST', '/api/auth/reset-password', { body: { token, password: NEW, confirmPassword: NEW } })).status, 200);
  assert.equal((await login(e, NEW)).status, 200);
  // disabling kills sessions immediately
  const s = (await login(e, NEW)).body.token;
  await t.api('PATCH', `/api/admin/users/${uid}`, { token: adminTok, body: { status: 'disabled' } });
  assert.equal((await t.api('GET', '/api/auth/me', { token: s })).status, 401);
  assert.equal((await login(e, NEW)).status, 403);
});

test('activity log records auth events and the master Excel workbook (Users + Activity) carries them without secrets', async () => {
  const events = db.prepare('SELECT DISTINCT event FROM login_activity').all().map((r) => r.event);
  for (const ev of ['register', 'email_verified', 'login', 'logout', 'password_reset', 'password_change', 'email_changed', '2fa_enabled', 'account_locked', 'logout_all', 'admin_force_reset']) assert.ok(events.includes(ev), `event ${ev} logged`);
  const res = await t.api('GET', '/api/export/master', { token: adminTok, raw: true });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const head = (n) => wb.getWorksheet(n).getRow(1).values.join('|');
  assert.match(head('Users'), /Email verified/); assert.match(head('Users'), /2FA/);
  assert.doesNotMatch(head('Users').toLowerCase(), /password|hash|secret|token/);
  const cells = []; wb.getWorksheet('Activity').eachRow((r) => cells.push(r.values.join(' ')));
  assert.ok(cells.some((c) => c.includes('email_verified')) || cells.some((c) => c.includes('register')), 'Activity sheet has auth events');
  const mine = await t.api('GET', '/api/auth/activity', { token: adminTok }); assert.equal(mine.status, 200);
});

test('permission checks: auth-protected endpoints reject anonymous callers', async () => {
  for (const [m, u] of [['GET', '/api/auth/sessions'], ['POST', '/api/auth/logout-all'], ['POST', '/api/auth/change-password'], ['POST', '/api/auth/change-email'], ['POST', '/api/auth/2fa/setup'], ['POST', '/api/auth/2fa/enable'], ['GET', '/api/admin/users']]) {
    assert.equal((await t.api(m, u, m === 'GET' ? {} : { body: {} })).status, 401, `${m} ${u}`);
  }
  assert.equal((await t.api('POST', '/api/auth/refresh', { token: adminTok })).status, 401, 'access token alone cannot refresh');
});
