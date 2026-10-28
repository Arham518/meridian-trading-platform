// Upgrade checks: terms at sign-up, delete user + CSV export, cleanup job, health, SEO files, client IP, CSP, settings.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok;
const PW = 'Trader#2026a';
const stamp = Date.now();
const admin = (method, url, body) => t.api(method, url, { token: adminTok, body });
const db = async () => (await import('../src/db.js')).db;

before(async () => {
  t = await boot({ APP_URL: 'https://example-meridian.test' });
  adminTok = await t.login(ADMIN.email, ADMIN.password);
});
after(async () => { await t.close(); });

test('sign-up requires agreeing to the Terms and Privacy Policy; the time is stored', async () => {
  const email = `terms${stamp}@example.com`;
  const no = await t.api('POST', '/api/auth/register', { body: { name: 'No Terms', email, password: PW, confirmPassword: PW } });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /acceptTerms/);
  const falsy = await t.api('POST', '/api/auth/register', { body: { name: 'No Terms', email, password: PW, confirmPassword: PW, acceptTerms: false } });
  assert.equal(falsy.status, 400);
  const ok = await t.register(email, 'Yes Terms', PW);
  assert.equal(ok.status, 201);
  const row = (await db()).prepare('SELECT terms_accepted_at FROM users WHERE email = ?').get(email);
  assert.ok(row.terms_accepted_at && !Number.isNaN(Date.parse(row.terms_accepted_at)));
  const list = await admin('GET', `/api/admin/users?q=terms${stamp}`);
  assert.ok(list.body.rows[0].terms_accepted_at);
});

test('admin deletes a user: related rows removed, history anonymised, guards enforced', async () => {
  const email = `delete${stamp}@example.com`;
  await t.registerVerified(email, 'Delete Me', PW);
  const tok = await t.login(email, PW);
  const o = await t.api('POST', '/api/trading/orders', { token: tok, body: { symbol: 'BTCUSDT', side: 'BUY', type: 'market', qty: 0.01 } });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  const d = await db();
  const id = d.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  assert.ok(d.prepare('SELECT COUNT(*) n FROM trades WHERE user_id = ?').get(id).n >= 1);

  // a normal user cannot delete anyone
  assert.equal((await t.api('DELETE', `/api/admin/users/${id}`, { token: tok })).status, 403);
  // admin cannot delete themselves (and the only admin)
  const me = d.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN.email).id;
  const self = await admin('DELETE', `/api/admin/users/${me}`);
  assert.equal(self.status, 400); assert.match(self.body.error, /your own account/);

  const r = await admin('DELETE', `/api/admin/users/${id}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.deleted.email, email);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(id).n, 0);
  for (const tbl of ['trades', 'orders', 'watchlists', 'sessions', 'auth_tokens', 'backup_codes']) assert.equal(d.prepare(`SELECT COUNT(*) n FROM ${tbl} WHERE user_id = ?`).get(id).n, 0, tbl);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM login_activity WHERE email = ? OR user_id = ?').get(email, id).n, 0, 'activity anonymised');
  assert.ok(d.prepare('SELECT COUNT(*) n FROM login_activity WHERE email = ?').get(`deleted-user-${id}`).n >= 1);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM mail_log WHERE to_addr = ?').get(email).n, 0, 'mail log anonymised');
  assert.equal(await t.login(email, PW), undefined, 'deleted user cannot sign in');
  assert.equal((await t.api('GET', '/api/auth/me', { token: tok })).status, 401, 'old token no longer works');
  assert.equal((await admin('DELETE', `/api/admin/users/${id}`)).status, 404);
});

test('another admin can be deleted, yourself never (so at least one admin always remains)', async () => {
  const email = `admin2${stamp}@example.com`;
  const c = await admin('POST', '/api/admin/users', { name: 'Second Admin', email, password: PW, role: 'admin' });
  assert.equal(c.status, 201);
  const tok2 = await t.login(email, PW);
  const d = await db();
  const main = d.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN.email).id;
  assert.equal((await t.api('DELETE', `/api/admin/users/${c.body.user.id}`, { token: tok2 })).status, 400, 'self delete blocked');
  assert.equal((await admin('DELETE', `/api/admin/users/${c.body.user.id}`)).status, 200);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND status = 'active'").get().n >= 1, true);
  assert.equal((await admin('DELETE', `/api/admin/users/${main}`)).status, 400);
});

test('admin exports the users list as CSV (no secrets, formula-safe)', async () => {
  const d = await db();
  await t.registerVerified(`csv${stamp}@example.com`, '=HYPERLINK("x")', PW);
  const res = await t.api('GET', '/api/admin/users/export.csv', { token: adminTok, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /users-\d{4}-\d{2}-\d{2}\.csv/);
  const text = await res.text();
  const lines = text.replace(/^\ufeff/, '').trim().split(/\r\n/);
  assert.match(lines[0], /^ID,Name,Username,Email/);
  assert.equal(lines.length - 1, d.prepare('SELECT COUNT(*) n FROM users').get().n);
  assert.ok(!/password|hash|totp_secret/i.test(text));
  assert.ok(text.includes(`"'=HYPERLINK(""x"")"`), 'formula neutralised');
  const filtered = await (await t.api('GET', `/api/admin/users/export.csv?q=csv${stamp}`, { token: adminTok, raw: true })).text();
  assert.equal(filtered.trim().split(/\r\n/).length, 2);
  const userTok = await t.login(`csv${stamp}@example.com`, PW);
  assert.equal((await t.api('GET', '/api/admin/users/export.csv', { token: userTok })).status, 403);
});

test('cleanup job prunes expired sessions and tokens and activity older than 180 days', async () => {
  const d = await db();
  const { runCleanup } = await import('../src/services/cleanup.js');
  const uid = d.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN.email).id;
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  const recent = new Date(Date.now() - 10 * 86400000).toISOString();
  const past = new Date(Date.now() - 3600000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  d.prepare('INSERT INTO sessions (id, user_id, refresh_hash, expires_at) VALUES (?,?,?,?)').run(`exp-${stamp}`, uid, 'h1', past);
  d.prepare('INSERT INTO sessions (id, user_id, refresh_hash, expires_at) VALUES (?,?,?,?)').run(`live-${stamp}`, uid, 'h2', future);
  d.prepare("INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES (?, 'verify_email', ?, ?)").run(uid, `t1-${stamp}`, past);
  d.prepare("INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES (?, 'verify_email', ?, ?)").run(uid, `t2-${stamp}`, future);
  d.prepare("INSERT INTO login_activity (email, event, created_at) VALUES ('old@x.test', 'login', ?)").run(old);
  d.prepare("INSERT INTO login_activity (email, event, created_at) VALUES ('recent@x.test', 'login', ?)").run(recent);
  const r = runCleanup();
  assert.ok(r.sessions >= 1 && r.tokens >= 1 && r.activity >= 1, JSON.stringify(r));
  assert.equal(d.prepare('SELECT COUNT(*) n FROM sessions WHERE id = ?').get(`exp-${stamp}`).n, 0);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM sessions WHERE id = ?').get(`live-${stamp}`).n, 1);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM auth_tokens WHERE token_hash = ?').get(`t1-${stamp}`).n, 0);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM auth_tokens WHERE token_hash = ?').get(`t2-${stamp}`).n, 1);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM login_activity WHERE email = 'old@x.test'").get().n, 0);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM login_activity WHERE email = 'recent@x.test'").get().n, 1);
  assert.ok(await t.login(ADMIN.email, ADMIN.password), 'live sessions still work');
  const h = (await t.api('GET', '/api/health')).body;
  assert.ok(h.cleanup.last.at);
});

test('health reports persistence status', async () => {
  const h = await t.api('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true); assert.equal(h.body.status, 'ok');
  assert.equal(h.body.persist.enabled, !!process.env.DATABASE_URL);
  assert.equal(h.body.persist.ok, true);
  if (process.env.DATABASE_URL) assert.ok(h.body.persist.lastSavedAt, 'a save time is reported in hosted mode');
});

test('robots.txt and sitemap.xml are real files built from APP_URL; unknown files are 404, pages get the app', async () => {
  const robots = await t.api('GET', '/robots.txt', { raw: true });
  assert.equal(robots.status, 200); assert.match(robots.headers.get('content-type'), /text\/plain/);
  const rt = await robots.text();
  assert.match(rt, /Sitemap: https:\/\/example-meridian\.test\/sitemap\.xml/); assert.match(rt, /Disallow: \/admin/);
  const sm = await t.api('GET', '/sitemap.xml', { raw: true });
  assert.equal(sm.status, 200); assert.match(sm.headers.get('content-type'), /xml/);
  const st = await sm.text();
  for (const p of ['/', '/terms', '/privacy', '/risk', '/register']) assert.ok(st.includes(`<loc>https://example-meridian.test${p}</loc>`), p);
  for (const p of ['/nope.xml', '/missing.txt', '/assets/none.js', '/feed.json']) {
    const r = await t.api('GET', p, { raw: true });
    assert.equal(r.status, 404, p);
    assert.ok(!(await r.text()).includes('<div id="root">'), `${p} must not return the app shell`);
  }
  const fs2 = fs; const { config } = await import('../src/config.js');
  if (fs2.existsSync(path.join(config.clientDist, 'index.html'))) {
    for (const p of ['/', '/terms', '/app/signals', '/admin/users']) {
      const r = await t.api('GET', p, { raw: true });
      assert.equal(r.status, 200, p);
      const html = await r.text();
      assert.ok(html.includes('<div id="root">'), p);
      assert.ok(!html.includes('__APP_URL__'), 'APP_URL placeholder replaced');
      if (p === '/') assert.match(html, /property="og:image" content="https:\/\/example-meridian\.test\/og-image\.png"/);
    }
  }
});

test('CSP allows Cloudflare insights; client IP comes from CF-Connecting-IP', async () => {
  const res = await t.api('GET', '/api/health', { raw: true });
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /connect-src [^;]*https:\/\/cloudflareinsights\.com/);
  const email = `ip${stamp}@example.com`;
  await t.registerVerified(email, 'Ip Check', PW);
  const r = await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.77' }, body: JSON.stringify({ email, password: PW }) });
  assert.equal(r.status, 200);
  const d = await db();
  assert.equal(d.prepare("SELECT ip FROM login_activity WHERE email = ? AND event = 'login' ORDER BY id DESC").get(email).ip, '203.0.113.77');
  // garbage in the header is ignored
  await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': 'not-an-ip' }, body: JSON.stringify({ email, password: PW }) });
  assert.notEqual(d.prepare("SELECT ip FROM login_activity WHERE email = ? AND event = 'login' ORDER BY id DESC").get(email).ip, 'not-an-ip');
});

test('hero video URL must be https:// or an uploaded file', async () => {
  const base = { site_name: 'Meridian' };
  assert.equal((await admin('PUT', '/api/admin/settings', { ...base, hero_video_url: 'http://example.com/v.mp4' })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings', { ...base, hero_video_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings', { ...base, hero_video_url: 'https://cdn.example.com/v.mp4' })).status, 200);
  assert.equal((await t.api('GET', '/api/settings')).body.heroVideoUrl, 'https://cdn.example.com/v.mp4');
  assert.equal((await admin('PUT', '/api/admin/settings', { ...base, hero_video_url: '' })).status, 200);
});
