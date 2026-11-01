// v5: collapsed failed sign-ins, hidden IPs in the admin list, symbol search, CSRF origin check.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok;
before(async () => { t = await boot(); adminTok = await t.login(ADMIN.email, ADMIN.password); });
after(async () => { await t.close(); });

test('repeated failed sign-ins for one email show as one row with an attempt count', async () => {
  const email = `nobody${Date.now()}@example.com`;
  for (let i = 0; i < 3; i++) await t.api('POST', '/api/auth/login', { body: { email, password: 'Wrong#Pass123' } });
  const d = (await t.api('GET', '/api/admin/stats', { token: adminTok })).body;
  const rows = d.recentActivity.filter((a) => a.email === email);
  assert.equal(rows.length, 1); assert.equal(rows[0].attempts, 3); assert.equal(rows[0].success, 0);
  assert.ok(!('ip' in rows[0]) && !('user_agent' in rows[0]), 'no IP in the overview payload');
  const rec = (await t.api('GET', '/api/admin/records/activity', { token: adminTok })).body;
  assert.ok(!rec.columns.some((c) => c.key === 'ip' || c.key === 'user_agent'), 'IP / agent columns hidden in the web list');
});

test('symbol search covers the catalogue, ranks exact matches first and validates input', async () => {
  const s = (q) => t.api('GET', `/api/market/search?q=${encodeURIComponent(q)}`).then((r) => r.body);
  assert.equal((await s('eurusd')).results[0].symbol, 'EURUSD');
  assert.equal((await s('gold')).results[0].symbol, 'XAUUSD');
  assert.equal((await s('btc')).results[0].symbol, 'BTCUSDT');
  assert.ok((await s('')).total >= 100, 'catalogue has 100+ static instruments before Binance discovery');
  assert.equal((await t.api('GET', '/api/market/klines?symbol=../../etc&interval=1h')).status, 400);
  const q = (await t.api('GET', '/api/market/quotes?symbols=GBPJPY,XAGUSD,NOPE')).body;
  assert.deepEqual(q.extra.map((x) => x.symbol), ['GBPJPY', 'XAGUSD']);
});

test('state-changing API calls from a foreign origin are refused', async () => {
  const r = await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }) });
  assert.equal(r.status, 403);
  const ok = await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: t.base }, body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }) });
  assert.equal(ok.status, 200);
});
