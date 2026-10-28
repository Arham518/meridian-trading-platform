// Admin user management, ADMIN_PASSWORD sync and the email admin tools.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok;
const PW = 'Trader#2026a';
const stamp = Date.now();

before(async () => {
  t = await boot();
  adminTok = await t.login(ADMIN.email, ADMIN.password);
});
after(async () => { await t.close(); });

const admin = (method, url, body) => t.api(method, url, { token: adminTok, body });
const db = async () => (await import('../src/db.js')).db;

test('admin lists all users with search and pagination', async () => {
  await t.register(`listme${stamp}@example.com`, 'List Me', PW, { username: `listme${stamp}`.slice(0, 20) });
  const all = await admin('GET', '/api/admin/users?pageSize=2');
  assert.equal(all.status, 200);
  assert.equal(all.body.rows.length, 2);
  assert.ok(all.body.total >= 5 && all.body.pages >= 3);
  const found = await admin('GET', `/api/admin/users?q=listme${stamp}`.slice(0, 40));
  assert.equal(found.body.total, 1);
  const row = found.body.rows[0];
  for (const k of ['name', 'username', 'email', 'role', 'status', 'email_verified_at', 'balance', 'created_at', 'last_login_at']) assert.ok(k in row, k);
  assert.ok(!('password_hash' in row));
});

test('admin creates a user: validated, unique, stored in the DB, can log in', async () => {
  const email = `created${stamp}@example.com`;
  assert.equal((await admin('POST', '/api/admin/users', { name: 'Weak', email, password: 'short' })).status, 400);
  assert.equal((await t.api('POST', '/api/admin/users', { body: { name: 'No Auth', email, password: PW } })).status, 401);
  const r = await admin('POST', '/api/admin/users', { name: 'Created User', email, username: `cu${stamp}`.slice(0, 20), password: PW, role: 'user', verified: true, balance: 2500 });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, email);
  assert.equal(r.body.user.emailVerified, true);
  assert.equal(r.body.user.balance, 2500);
  assert.equal((await admin('POST', '/api/admin/users', { name: 'Dup', email: email.toUpperCase(), password: PW })).status, 409);
  const row = (await db()).prepare('SELECT * FROM users WHERE email = ?').get(email);
  assert.match(row.password_hash, /^\$2[aby]\$/);
  assert.ok(await t.login(email, PW), 'created user can log in');
  const act = (await db()).prepare("SELECT 1 FROM login_activity WHERE event = 'admin_create_user' AND email = ?").get(email);
  assert.ok(act, 'audit entry written');
});

test('admin edits a user: name, username, email, role, status, verified, balance', async () => {
  const email = `edit${stamp}@example.com`;
  const created = await admin('POST', '/api/admin/users', { name: 'Edit Me', email, password: PW, verified: false });
  const id = created.body.user.id;
  const newEmail = `edited${stamp}@example.com`;
  const r = await admin('PATCH', `/api/admin/users/${id}`, { name: 'Edited Name', username: `ed${stamp}`.slice(0, 20), email: newEmail, role: 'admin', verified: true, balance: 777.5 });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Edited Name');
  assert.equal(r.body.user.email, newEmail);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.user.emailVerified, true);
  assert.equal(r.body.user.balance, 777.5);
  const row = (await db()).prepare('SELECT * FROM users WHERE id = ?').get(id);
  assert.equal(row.email, newEmail); assert.equal(row.role, 'admin'); assert.ok(row.email_verified_at);
  // unique email / username
  assert.equal((await admin('PATCH', `/api/admin/users/${id}`, { email: ADMIN.email })).status, 409);
  // disable revokes their sessions
  const tok = await t.login(newEmail, PW);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).status, 200);
  assert.equal((await admin('PATCH', `/api/admin/users/${id}`, { status: 'disabled', role: 'user' })).status, 200);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).status, 401);
  assert.equal((await admin('PATCH', `/api/admin/users/${id}`, { status: 'active', verified: false })).body.user.emailVerified, false);
  assert.equal((await admin('PATCH', '/api/admin/users/999999', { name: 'Nobody' })).status, 404);
});

test('guards: an admin cannot demote or disable themselves; another admin can be demoted', async () => {
  const me = (await t.api('GET', '/api/auth/me', { token: adminTok })).body.user;
  assert.equal((await admin('PATCH', `/api/admin/users/${me.id}`, { role: 'user' })).status, 400);
  assert.equal((await admin('PATCH', `/api/admin/users/${me.id}`, { status: 'disabled' })).status, 400);
  assert.equal((await t.api('GET', '/api/auth/me', { token: adminTok })).body.user.role, 'admin', 'still admin');
  // with a second admin, either one may demote the other (never themselves)
  const email = `admin2${stamp}@example.com`;
  const second = await admin('POST', '/api/admin/users', { name: 'Second Admin', email, password: PW, role: 'admin' });
  assert.equal(second.body.user.role, 'admin');
  const tok2 = await t.login(email, PW);
  assert.equal((await t.api('GET', '/api/admin/stats', { token: tok2 })).status, 200, 'new admin has admin access');
  assert.equal((await t.api('PATCH', `/api/admin/users/${second.body.user.id}`, { token: tok2, body: { role: 'user' } })).status, 400);
  assert.equal((await admin('PATCH', `/api/admin/users/${second.body.user.id}`, { role: 'user' })).status, 200);
  assert.equal((await t.api('GET', '/api/admin/stats', { token: tok2 })).status, 403, 'demoted admin loses access at once');
});

test('admin sets a new password: old one stops working and every session is revoked', async () => {
  const email = `setpw${stamp}@example.com`;
  const c = await admin('POST', '/api/admin/users', { name: 'Set Pw', email, password: PW });
  const id = c.body.user.id;
  const tok = await t.login(email, PW);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).status, 200);
  assert.equal((await admin('POST', `/api/admin/users/${id}/password`, { password: 'weak' })).status, 400);
  const NEW = 'Brand#New2027x';
  const r = await admin('POST', `/api/admin/users/${id}/password`, { password: NEW, confirmPassword: NEW });
  assert.equal(r.status, 200);
  assert.ok(r.body.sessionsRevoked >= 1);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).status, 401, 'existing session revoked');
  assert.equal(await t.login(email, PW), undefined, 'old password rejected');
  assert.ok(await t.login(email, NEW), 'new password works');
  const me = (await t.api('GET', '/api/auth/me', { token: adminTok })).body.user;
  assert.equal((await admin('POST', `/api/admin/users/${me.id}/password`, { password: NEW })).status, 400, 'own password via Account page');
});

test('ADMIN_PASSWORD sync: a changed env password is applied once, Account-page changes survive an unchanged env', async () => {
  const { ensureAdmin } = await import('../src/bootstrap.js');
  const d = await db();
  // unchanged env: nothing happens
  assert.equal(ensureAdmin({ email: ADMIN.email, password: ADMIN.password }), null);
  const fp = d.prepare("SELECT value FROM settings WHERE key = 'admin_env_fingerprint'").get().value;
  assert.ok(!fp.includes(ADMIN.password), 'only a hash is stored');
  // env password changed -> applied, sessions revoked
  const tok = await t.login(ADMIN.email, ADMIN.password);
  const NEW = 'EnvChanged#2027';
  assert.equal(ensureAdmin({ email: ADMIN.email, password: NEW }).passwordUpdated, true);
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).status, 401, 'old admin sessions revoked');
  assert.equal(await t.login(ADMIN.email, ADMIN.password), undefined);
  let tok2 = await t.login(ADMIN.email, NEW);
  assert.ok(tok2);
  // admin changes the password on the Account page; same env value on the next start keeps it
  const ACC = 'Account#Pass2028';
  assert.equal((await t.api('POST', '/api/auth/change-password', { token: tok2, body: { currentPassword: NEW, newPassword: ACC, confirmPassword: ACC } })).status, 200);
  assert.equal(ensureAdmin({ email: ADMIN.email, password: NEW }), null);
  tok2 = await t.login(ADMIN.email, ACC);
  assert.ok(tok2, 'Account-page password kept');
  // new ADMIN_EMAIL -> that admin is created
  const other = `envadmin${stamp}@example.com`;
  assert.equal(ensureAdmin({ email: other, password: 'Other#Admin2029' }).created, true);
  assert.equal(d.prepare('SELECT role FROM users WHERE email = ?').get(other).role, 'admin');
  // restore the suite's admin password for any later test
  ensureAdmin({ email: ADMIN.email, password: ADMIN.password });
  adminTok = await t.login(ADMIN.email, ADMIN.password);
  assert.ok(adminTok);
});

test('email admin: status, test email without SMTP lands in the outbox list', async () => {
  const st = await admin('GET', '/api/admin/email');
  assert.equal(st.status, 200);
  assert.equal(st.body.mode, 'dev');
  assert.equal(st.body.smtp, null);
  assert.equal((await t.api('POST', '/api/admin/test-email', { token: (await t.registerVerified(`plain${stamp}@example.com`, 'Plain User', PW)).body.token })).status, 403);
  const r = await admin('POST', '/api/admin/test-email');
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'dev');
  assert.equal(r.body.to, ADMIN.email);
  assert.equal(r.body.savedToOutbox, true);
  const list = await admin('GET', '/api/admin/emails?pageSize=50');
  assert.equal(list.status, 200);
  const test1 = list.body.rows.find((m) => m.kind === 'test' && m.to_addr === ADMIN.email);
  assert.ok(test1, 'test email listed');
  assert.equal(test1.status, 'saved');
  assert.ok(list.body.rows.some((m) => m.kind === 'verify-email' && m.link), 'verification emails listed with their link');
  const one = await admin('GET', `/api/admin/emails/${test1.id}`);
  assert.match(one.body.email.html, /test email/i);
  assert.equal((await admin('GET', '/api/admin/emails?q=nothing-matches-this')).body.total, 0);
});
