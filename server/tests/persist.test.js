// Hosted mode: data must survive restarts and crashes when DATABASE_URL (PostgreSQL) is used.
// Runs only with TEST_DATABASE_URL, e.g.  TEST_DATABASE_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { freshPgUrl, ADMIN } from './helpers.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');
const skip = !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL to run the PostgreSQL persistence tests';

const children = new Set();
after(() => { for (const c of children) c.kill('SIGKILL'); });

const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

async function start(env) {
  const port = await freePort();
  // each start gets a NEW empty working folder, like a fresh container on the host
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-persist-'));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, NODE_ENV: 'production', FORCE_SIMULATED: 'true', DISABLE_MARKET_POLL: 'true',
      REQUIRE_EMAIL_VERIFICATION: 'false', RATE_LIMIT_AUTH: '1000', ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, SEED_DEMO: 'false', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child); child.once('exit', () => children.delete(child));
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`server exited:\n${out}`);
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const api = async (method, url, { token, body, form } = {}) => {
    const headers = {}; if (token) headers.authorization = `Bearer ${token}`;
    let payload = form; if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* binary */ }
    return { status: res.status, body: json, text, headers: res.headers };
  };
  const login = async (email, password) => (await api('POST', '/api/auth/login', { body: { email, password } })).body?.token;
  const stop = (signal = 'SIGTERM') => new Promise((r) => { child.once('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); r(); }); child.kill(signal); });
  return { api, login, stop, base, log: () => out };
}

const signal = { pair: 'EURUSD', direction: 'BUY', entry: 1.1, stop_loss: 1.09, tp1: 1.12, timeframe: '1h', risk: 'low', notes: 'persist me' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('hosted mode: users, signals, trades, settings and uploads survive restarts and a hard crash', { skip, timeout: 120000 }, async () => {
  const env = { DATABASE_URL: await freshPgUrl(), JWT_SECRET: 'persist-secret-0123456789abcdef012345' };

  // ---- run 1: create data, then stop normally
  let s = await start(env);
  const reg = await s.api('POST', '/api/auth/register', { body: { name: 'Persist User', email: 'p@test.local', password: 'Persist#2026a', confirmPassword: 'Persist#2026a' } });
  assert.ok([200, 201].includes(reg.status), JSON.stringify(reg.body));
  let admin = await s.login(ADMIN.email, ADMIN.password);
  assert.ok(admin, 'admin login');
  const form = new FormData();
  for (const [k, v] of Object.entries(signal)) form.append(k, String(v));
  form.append('image', new Blob([PNG], { type: 'image/png' }), 'chart.png');
  const sig = await s.api('POST', '/api/signals', { token: admin, form });
  assert.equal(sig.status, 201, JSON.stringify(sig.body));
  const imageUrl = sig.body.signal.imageUrl;
  assert.match(imageUrl, /^\/uploads\/sig-/);
  const vform = new FormData(); vform.append('video', new Blob([Buffer.alloc(4096, 7)], { type: 'video/mp4' }), 'hero.mp4');
  const vid = await s.api('POST', '/api/admin/hero-video', { token: admin, form: vform });
  assert.equal(vid.status, 200, JSON.stringify(vid.body));
  const user = await s.login('p@test.local', 'Persist#2026a');
  const order = await s.api('POST', '/api/trading/orders', { token: user, body: { symbol: 'BTCUSDT', side: 'BUY', type: 'market', qty: 0.01 } });
  assert.ok([200, 201].includes(order.status), JSON.stringify(order.body));
  await s.stop('SIGTERM');

  // ---- run 2: fresh working folder, everything must come back from PostgreSQL
  s = await start(env);
  admin = await s.login(ADMIN.email, ADMIN.password);
  assert.ok(admin, 'admin login after restart');
  const userTok = await s.login('p@test.local', 'Persist#2026a');
  assert.ok(userTok, 'registered user can still sign in after restart');
  const list = await s.api('GET', '/api/signals', { token: admin });
  assert.ok(list.body.rows.some((r) => r.notes === 'persist me'), 'signal kept');
  const img = await fetch(s.base + imageUrl);
  assert.equal(img.status, 200, 'uploaded signal image restored');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  const pub = await s.api('GET', '/api/settings');
  const hero = pub.body?.heroVideoUrl || pub.body?.settings?.heroVideoUrl || vid.body.heroVideoUrl;
  assert.equal((await fetch(s.base + hero)).status, 200, 'hero video restored');
  const trades = await s.api('GET', '/api/trading/portfolio', { token: userTok });
  assert.equal(trades.status, 200);
  assert.ok(JSON.stringify(trades.body).includes('BTCUSDT'), 'paper trade kept');

  // a change confirmed by a response must survive a crash (SIGKILL: no shutdown hook runs)
  const sig2 = await s.api('POST', '/api/signals', { token: admin, body: { ...signal, notes: 'after crash' } });
  assert.equal(sig2.status, 201);
  await s.stop('SIGKILL');

  // ---- run 3
  s = await start(env);
  admin = await s.login(ADMIN.email, ADMIN.password);
  const list3 = await s.api('GET', '/api/signals', { token: admin });
  assert.ok(list3.body.rows.some((r) => r.notes === 'after crash'), 'change confirmed before the crash is kept');
  assert.ok(list3.body.rows.some((r) => r.notes === 'persist me'));
  // deleting the signal also removes its image from storage
  const id = list3.body.rows.find((r) => r.notes === 'persist me').id;
  assert.equal((await s.api('DELETE', `/api/signals/${id}`, { token: admin })).status, 200);
  await s.stop('SIGTERM');

  s = await start(env);
  admin = await s.login(ADMIN.email, ADMIN.password);
  const list4 = await s.api('GET', '/api/signals', { token: admin });
  assert.ok(!list4.body.rows.some((r) => r.notes === 'persist me'), 'deletion kept');
  const gone = await fetch(s.base + imageUrl); // 404, or the SPA page when the client is built
  assert.ok(!(gone.headers.get('content-type') || '').startsWith('image/'), 'deleted image not restored');
  await s.stop('SIGTERM');
});

test('hosted mode: admin user edits, email log and ADMIN_PASSWORD changes are kept across restarts', { skip, timeout: 120000 }, async () => {
  const env = { DATABASE_URL: await freshPgUrl(), JWT_SECRET: 'persist-secret-0123456789abcdef012345' };
  let s = await start(env);
  let admin = await s.login(ADMIN.email, ADMIN.password);
  const c = await s.api('POST', '/api/admin/users', { token: admin, body: { name: 'Made By Admin', email: 'made@test.local', password: 'Made#By2026x', role: 'user', verified: true } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal((await s.api('PATCH', `/api/admin/users/${c.body.user.id}`, { token: admin, body: { name: 'Edited By Admin', balance: 1234 } })).status, 200);
  assert.equal((await s.api('POST', '/api/admin/test-email', { token: admin })).status, 200);
  await s.stop('SIGKILL'); // confirmed changes must already be stored

  // restart with a NEW ADMIN_PASSWORD: it replaces the old one
  const NEW = 'Changed#Env2027';
  s = await start({ ...env, ADMIN_PASSWORD: NEW });
  assert.equal(await s.login(ADMIN.email, ADMIN.password), undefined, 'old env password no longer works');
  admin = await s.login(ADMIN.email, NEW);
  assert.ok(admin, 'new env password works');
  const users = await s.api('GET', '/api/admin/users?q=made@test.local', { token: admin });
  assert.equal(users.body.rows[0]?.name, 'Edited By Admin');
  assert.equal(users.body.rows[0]?.balance, 1234);
  assert.ok(await s.login('made@test.local', 'Made#By2026x'), 'admin-created user can sign in after restart');
  const mails = await s.api('GET', '/api/admin/emails', { token: admin });
  assert.ok(mails.body.rows.some((m) => m.kind === 'test'), 'email log kept');
  // password changed on the Account page survives a restart with the same env
  const ACC = 'Account#Kept2028';
  assert.equal((await s.api('POST', '/api/auth/change-password', { token: admin, body: { currentPassword: NEW, newPassword: ACC, confirmPassword: ACC } })).status, 200);
  await s.stop('SIGTERM');
  s = await start({ ...env, ADMIN_PASSWORD: NEW });
  assert.ok(await s.login(ADMIN.email, ACC), 'Account-page password kept while ADMIN_PASSWORD is unchanged');
  await s.stop('SIGTERM');
});

test('hosted mode refuses to start without JWT_SECRET', { skip, timeout: 30000 }, async () => {
  const env = { DATABASE_URL: await freshPgUrl(), JWT_SECRET: '' };
  await assert.rejects(start(env), /JWT_SECRET must be set/);
});
