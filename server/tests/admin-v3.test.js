// v3 admin: single-user endpoint for the Edit drawer, overview data, audit log for settings, orphan upload cleanup.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok;
const PW = 'Trader#2026a';
const stamp = Date.now();
before(async () => { t = await boot(); adminTok = await t.login(ADMIN.email, ADMIN.password); });
after(async () => { await t.close(); });
const admin = (method, url, body) => t.api(method, url, { token: adminTok, body });

test('GET /admin/users/:id returns one user (no secrets) with recent activity; admin only; 404 for unknown', async () => {
  const email = `edit${stamp}@example.com`;
  await t.registerVerified(email, 'Edit Me', PW);
  await t.login(email, PW);
  const list = await admin('GET', `/api/admin/users?q=edit${stamp}`);
  const id = list.body.rows[0].id;
  const r = await admin('GET', `/api/admin/users/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, email);
  for (const k of ['name', 'username', 'role', 'status', 'balance', 'email_verified_at', 'locked_until']) assert.ok(k in r.body.user, k);
  assert.ok(!('password_hash' in r.body.user) && !('totp_secret' in r.body.user));
  assert.ok(r.body.activity.some((a) => a.event === 'login'));
  assert.equal((await admin('GET', '/api/admin/users/999999')).status, 404);
  const userTok = await t.login(email, PW);
  assert.equal((await t.api('GET', `/api/admin/users/${id}`, { token: userTok })).status, 403);
  assert.equal((await t.api('GET', `/api/admin/users/${id}`)).status, 401);
});

test('full edit flow by id: profile, role, status, balance, password, delete', async () => {
  const email = `flow${stamp}@example.com`;
  const c = await admin('POST', '/api/admin/users', { name: 'Flow User', email, password: PW, verified: true });
  const id = c.body.user.id;
  const p = await admin('PATCH', `/api/admin/users/${id}`, { name: 'Flow Renamed', role: 'admin', balance: 4321.5, status: 'active', verified: true });
  assert.equal(p.status, 200);
  const g = (await admin('GET', `/api/admin/users/${id}`)).body.user;
  assert.equal(g.name, 'Flow Renamed'); assert.equal(g.role, 'admin'); assert.equal(g.balance, 4321.5);
  assert.equal((await admin('PATCH', `/api/admin/users/${id}`, { status: 'disabled', role: 'user' })).status, 200);
  assert.equal((await t.api('POST', '/api/auth/login', { body: { email, password: PW } })).status, 403);
  await admin('PATCH', `/api/admin/users/${id}`, { status: 'active' });
  const np = 'NewFlow#2026b';
  assert.equal((await admin('POST', `/api/admin/users/${id}/password`, { password: np, confirmPassword: np })).status, 200);
  assert.ok(await t.login(email, np));
  assert.equal((await admin('DELETE', `/api/admin/users/${id}`)).status, 200);
  assert.equal((await admin('GET', `/api/admin/users/${id}`)).status, 404);
});

test('admin stats: activity rows carry the user id (also for old rows without one) and latest sign-ups are listed', async () => {
  const s = await admin('GET', '/api/admin/stats');
  assert.equal(s.status, 200);
  const row = s.body.recentActivity.find((a) => a.email === ADMIN.email);
  assert.ok(row && row.user_id, 'admin activity row links to a user');
  assert.ok(Array.isArray(s.body.recentUsers) && s.body.recentUsers.length > 0);
  assert.ok(!('password_hash' in s.body.recentUsers[0]));
  assert.equal(typeof s.body.pendingVerification, 'number');
});

test('settings saves and hero video changes are written to the audit log', async () => {
  const cur = (await admin('GET', '/api/admin/settings')).body.settings;
  assert.equal((await admin('PUT', '/api/admin/settings', { site_name: cur.site_name, tagline: cur.tagline, ads: cur.ads })).status, 200);
  assert.equal((await admin('PUT', '/api/admin/hero-video', { url: 'https://cdn.example/v3.mp4' })).status, 200);
  assert.equal((await admin('DELETE', '/api/admin/hero-video')).status, 200);
  const { db } = await import('../src/db.js');
  const ev = db.prepare("SELECT event FROM login_activity WHERE event LIKE 'admin_%' ORDER BY id DESC LIMIT 5").all().map((r) => r.event);
  for (const e of ['admin_settings', 'admin_hero_video', 'admin_hero_video_removed']) assert.ok(ev.includes(e), e);
});

test('cleanup removes old unreferenced hero / ad uploads but keeps used and fresh ones and signal images', async () => {
  const dir = path.join(t.dir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const mk = (n, ageH) => { const f = path.join(dir, n); fs.writeFileSync(f, 'x'); const tm = (Date.now() - ageH * 3600e3) / 1000; fs.utimesSync(f, tm, tm); return f; };
  const orphan = mk('ad-aaaaaa111111.png', 48); const fresh = mk('ad-bbbbbb222222.png', 1); const used = mk('ad-cccccc333333.png', 48);
  const oldVideo = mk('hero-dddddd444444.mp4', 48); const signal = mk('sig-eeeeee555555.png', 48);
  const cur = (await admin('GET', '/api/admin/settings')).body.settings;
  assert.equal((await admin('PUT', '/api/admin/settings', { site_name: cur.site_name, tagline: cur.tagline, ads: [{ slot: 'landing', type: 'image', title: 'Kept', url: 'https://a.example', image: '/uploads/ad-cccccc333333.png', enabled: true }] })).status, 200);
  const { runCleanup } = await import('../src/services/cleanup.js');
  const r = runCleanup();
  assert.equal(r.uploads, 2);
  assert.ok(!fs.existsSync(orphan) && !fs.existsSync(oldVideo));
  assert.ok(fs.existsSync(fresh) && fs.existsSync(used) && fs.existsSync(signal));
});
