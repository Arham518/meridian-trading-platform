import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok; let userTok; let user2Tok; let userId;
const email = `trader${Date.now()}@example.com`;
const PW = 'Trader#2026a';

before(async () => {
  t = await boot();
  adminTok = await t.login(ADMIN.email, ADMIN.password);
});
after(async () => { await t.close(); });

const sig = (over = {}) => ({ pair: 'EUR/USD', direction: 'BUY', entry: 1.1, stop_loss: 1.095, tp1: 1.106, tp2: 1.112, timeframe: '1h', risk: 'medium', notes: 'API test signal', ...over });

async function readMaster(tok = adminTok) {
  const res = await t.api('GET', '/api/export/master', { token: tok, raw: true });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return wb;
}
const sheetRows = (wb, name) => { const ws = wb.getWorksheet(name); const head = ws.getRow(1).values.slice(1); const out = []; ws.eachRow((r, i) => { if (i > 1) out.push(Object.fromEntries(head.map((h, k) => [h, r.values[k + 1]]))); }); return out; };
async function waitFor(fn, ms = 6000) { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, 250)); } return last; }

test('admin account is created on first run and can log in; bad password rejected', async () => {
  assert.ok(adminTok, 'admin login works');
  const r = await t.api('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'wrong-password-1' } });
  assert.equal(r.status, 401);
  const me = await t.api('GET', '/api/auth/me', { token: adminTok });
  assert.equal(me.body.user.role, 'admin');
  assert.ok(!('password_hash' in me.body.user) && !JSON.stringify(me.body).includes('hash'));
});

test('register validates input, hashes password, rejects duplicates', async () => {
  assert.equal((await t.api('POST', '/api/auth/register', { body: { name: 'A', email: 'bad', password: '123' } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/register', { body: { name: 'Test Trader', email, password: 'alllettersnodigits', confirmPassword: 'alllettersnodigits' } })).status, 400);
  const r = await t.registerVerified(email, 'Test Trader', PW);
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'user');
  userTok = r.body.token; userId = r.body.user.id;
  assert.equal((await t.api('POST', '/api/auth/register', { body: { name: 'Dup', email: email.toUpperCase(), password: PW, confirmPassword: PW, acceptTerms: true } })).status, 409);
  const r2 = await t.registerVerified(`second${Date.now()}@example.com`, 'Second Trader', PW);
  user2Tok = r2.body.token;
  const { db } = await import('../src/db.js');
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email);
  assert.match(row.password_hash, /^\$2[aby]\$/, 'bcrypt hash stored, not plaintext');
});

test('protected routes need a token; admin routes need the admin role', async () => {
  assert.equal((await t.api('GET', '/api/signals')).status, 401);
  assert.equal((await t.api('GET', '/api/trading/portfolio')).status, 401);
  assert.equal((await t.api('GET', '/api/admin/stats', { token: userTok })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/stats', { token: adminTok })).status, 200);
  assert.equal((await t.api('GET', '/api/export/master', { token: userTok })).status, 403);
  assert.equal((await t.api('GET', '/api/export/users', { token: userTok })).status, 403);
  assert.equal((await t.api('GET', '/api/auth/me', { token: 'garbage.token.value' })).status, 401);
});

let signalId;
test('signal CRUD: only admin can create/update/close/delete; users can read', async () => {
  assert.equal((await t.api('POST', '/api/signals', { token: userTok, body: sig() })).status, 403);
  // level validation
  assert.equal((await t.api('POST', '/api/signals', { token: adminTok, body: sig({ stop_loss: 1.2 }) })).status, 400);
  assert.equal((await t.api('POST', '/api/signals', { token: adminTok, body: sig({ direction: 'SELL' }) })).status, 400);
  const c = await t.api('POST', '/api/signals', { token: adminTok, body: sig() });
  assert.equal(c.status, 201);
  assert.equal(c.body.signal.pair, 'EURUSD');
  assert.equal(c.body.signal.status, 'active');
  signalId = c.body.signal.id;

  const list = await t.api('GET', '/api/signals?scope=active', { token: userTok });
  assert.equal(list.status, 200);
  assert.ok(list.body.rows.some((s) => s.id === signalId));
  assert.equal((await t.api('GET', `/api/signals/${signalId}`, { token: userTok })).body.signal.entry, 1.1);

  assert.equal((await t.api('PUT', `/api/signals/${signalId}`, { token: userTok, body: sig({ notes: 'hack' }) })).status, 403);
  const u = await t.api('PUT', `/api/signals/${signalId}`, { token: adminTok, body: sig({ notes: 'Edited analysis', tp1: 1.107 }) });
  assert.equal(u.status, 200); assert.equal(u.body.signal.notes, 'Edited analysis'); assert.equal(u.body.signal.tp1, 1.107);

  assert.equal((await t.api('POST', `/api/signals/${signalId}/close`, { token: userTok, body: { status: 'hit_tp1' } })).status, 403);
  const cl = await t.api('POST', `/api/signals/${signalId}/close`, { token: adminTok, body: { status: 'hit_tp1' } });
  assert.equal(cl.status, 200);
  assert.equal(cl.body.signal.status, 'hit_tp1');
  assert.ok(cl.body.signal.resultPct > 0, 'result % computed automatically');
  assert.ok(cl.body.signal.resultPips > 0, 'forex pips computed');
  assert.ok(cl.body.signal.closedAt);
  const hist = await t.api('GET', '/api/signals?scope=history&status=hit_tp1&q=EURUSD', { token: userTok });
  assert.ok(hist.body.rows.some((s) => s.id === signalId));

  const c2 = await t.api('POST', '/api/signals', { token: adminTok, body: sig({ pair: 'XAUUSD', entry: 2680, stop_loss: 2690, tp1: 2665, tp2: 2650, direction: 'SELL' }) });
  assert.equal(c2.status, 201);
  const st = await t.api('POST', `/api/signals/${c2.body.signal.id}/close`, { token: adminTok, body: { status: 'hit_sl' } });
  assert.ok(st.body.signal.resultPct < 0);
  assert.equal((await t.api('DELETE', `/api/signals/${c2.body.signal.id}`, { token: userTok })).status, 403);
  assert.equal((await t.api('DELETE', `/api/signals/${c2.body.signal.id}`, { token: adminTok })).status, 200);
  assert.equal((await t.api('GET', `/api/signals/${c2.body.signal.id}`, { token: userTok })).status, 404);
});

test('signal image upload (multipart) accepts PNG and rejects other types', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  Object.entries(sig({ pair: 'GBPUSD', entry: 1.29, stop_loss: 1.285, tp1: 1.296, tp2: '' })).forEach(([k, v]) => form.append(k, String(v)));
  form.append('image', new Blob([png], { type: 'image/png' }), 'chart.png');
  const ok = await t.api('POST', '/api/signals', { token: adminTok, form });
  assert.equal(ok.status, 201);
  assert.match(ok.body.signal.imageUrl, /^\/uploads\/sig-.*\.png$/);
  const img = await fetch(t.base + ok.body.signal.imageUrl);
  assert.equal(img.status, 200);
  const bad = new FormData();
  Object.entries(sig()).forEach(([k, v]) => bad.append(k, String(v)));
  bad.append('image', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  assert.equal((await t.api('POST', '/api/signals', { token: adminTok, form: bad })).status, 400);
});

test('signal stats are computed from stored data', async () => {
  const s = (await t.api('GET', '/api/signals/stats', { token: userTok })).body;
  assert.ok(s.total >= 14 && s.wins >= 1 && s.losses >= 1);
  assert.equal(s.winRate, Number(((s.wins / (s.wins + s.losses)) * 100).toFixed(1)));
});

test('watchlist is saved per user', async () => {
  const before = (await t.api('GET', '/api/watchlist', { token: userTok })).body.symbols;
  assert.ok(before.includes('BTCUSDT'));
  assert.equal((await t.api('POST', '/api/watchlist', { token: userTok, body: { symbol: 'DOGEUSDT' } })).status, 201);
  assert.equal((await t.api('POST', '/api/watchlist', { token: userTok, body: { symbol: 'FAKE123' } })).status, 400);
  assert.ok((await t.api('GET', '/api/watchlist', { token: userTok })).body.symbols.includes('DOGEUSDT'));
  assert.ok(!(await t.api('GET', '/api/watchlist', { token: user2Tok })).body.symbols.includes('DOGEUSDT'));
  const del = await t.api('DELETE', '/api/watchlist/DOGEUSDT', { token: userTok });
  assert.ok(!del.body.symbols.includes('DOGEUSDT'));
});

test('market endpoints return quotes and candles (simulated fallback labelled)', async () => {
  const q = (await t.api('GET', '/api/market/quotes')).body;
  assert.ok(q.quotes.length >= 15 && q.quotes.every((x) => x.price > 0));
  const k = (await t.api('GET', '/api/market/klines?symbol=EURUSD&interval=15m&limit=120')).body;
  assert.equal(k.candles.length, 120); assert.equal(k.source, 'simulated');
  assert.ok(k.candles.every((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)));
  assert.equal((await t.api('GET', '/api/market/klines?symbol=NOPE&interval=1h')).status, 400);
});

test('paper trading: market order with SL/TP, live position, close, history, balance', async () => {
  const p0 = (await t.api('GET', '/api/trading/portfolio', { token: userTok })).body;
  assert.equal(p0.balance, 100000);
  // validation
  assert.equal((await t.api('POST', '/api/trading/orders', { token: userTok, body: { symbol: 'BTCUSDT', side: 'BUY', type: 'market', qty: 0 } })).status, 400);
  assert.equal((await t.api('POST', '/api/trading/orders', { token: userTok, body: { symbol: 'BTCUSDT', side: 'BUY', type: 'market', qty: 1000 } })).status, 400, 'insufficient balance');
  const px = (await t.api('GET', '/api/market/quotes')).body.quotes.find((x) => x.symbol === 'BTCUSDT').price;
  assert.equal((await t.api('POST', '/api/trading/orders', { token: userTok, body: { symbol: 'BTCUSDT', side: 'BUY', type: 'market', qty: 0.1, stopLoss: px * 1.1 } })).status, 400, 'SL on the wrong side');
  const o = await t.api('POST', '/api/trading/orders', { token: userTok, body: { symbol: 'BTCUSDT', side: 'BUY', type: 'market', qty: 0.1, stopLoss: px * 0.5, takeProfit: px * 2 } });
  assert.equal(o.status, 201); assert.equal(o.body.filled, true);
  const p1 = (await t.api('GET', '/api/trading/portfolio', { token: userTok })).body;
  assert.equal(p1.open.length, 1);
  assert.ok(p1.balance < 100000 && Math.abs(p1.equity - 100000) < 100000 * 0.01, 'equity ~ unchanged right after opening');
  const tradeId = p1.open[0].id;
  const c = await t.api('POST', `/api/trading/trades/${tradeId}/close`, { token: userTok });
  assert.equal(c.status, 200);
  assert.equal((await t.api('POST', `/api/trading/trades/${tradeId}/close`, { token: userTok })).status, 404, 'cannot close twice');
  assert.equal((await t.api('POST', `/api/trading/trades/${tradeId}/close`, { token: user2Tok })).status, 404, 'cannot close another user\'s trade');
  const p2 = (await t.api('GET', '/api/trading/portfolio', { token: userTok })).body;
  assert.equal(p2.open.length, 0);
  assert.ok(Math.abs(p2.balance - (100000 + c.body.pnl)) < 0.02, 'balance = start + realised P&L');
  const h = (await t.api('GET', '/api/trading/history', { token: userTok })).body;
  assert.equal(h.total, 1); assert.equal(h.rows[0].id, tradeId); assert.equal(h.rows[0].close_reason, 'manual');
  assert.equal((await t.api('GET', '/api/trading/history', { token: user2Tok })).body.total, 0, 'history is per-user');
});

test('paper trading: limit orders reserve cash, fill on price touch, cancel refunds; SL/TP trigger automatically', async () => {
  const { getQuote } = await import('../src/services/market.js');
  const { runEngine } = await import('../src/services/trading.js');
  const q = getQuote('EURUSD');
  const base = (await t.api('GET', '/api/trading/portfolio', { token: user2Tok })).body.balance;
  // limit BUY far below market: stays pending, cash reserved
  const lim = await t.api('POST', '/api/trading/orders', { token: user2Tok, body: { symbol: 'EURUSD', side: 'BUY', type: 'limit', qty: 10000, limitPrice: q.price * 0.9 } });
  assert.equal(lim.status, 201); assert.equal(lim.body.filled, false);
  let p = (await t.api('GET', '/api/trading/portfolio', { token: user2Tok })).body;
  assert.equal(p.pending.length, 1); assert.ok(p.balance < base);
  assert.equal((await t.api('DELETE', `/api/trading/orders/${lim.body.order.id}`, { token: userTok })).status, 404, 'other user cannot cancel');
  assert.equal((await t.api('DELETE', `/api/trading/orders/${lim.body.order.id}`, { token: user2Tok })).status, 200);
  p = (await t.api('GET', '/api/trading/portfolio', { token: user2Tok })).body;
  assert.equal(p.pending.length, 0); assert.ok(Math.abs(p.balance - base) < 0.01, 'refund on cancel');

  // limit that gets touched -> becomes an open position
  const lim2 = await t.api('POST', '/api/trading/orders', { token: user2Tok, body: { symbol: 'EURUSD', side: 'BUY', type: 'limit', qty: 10000, limitPrice: q.price * 0.99, stopLoss: q.price * 0.95 } });
  assert.equal(lim2.body.filled, false);
  q.price = q.price * 0.985; runEngine();
  p = (await t.api('GET', '/api/trading/portfolio', { token: user2Tok })).body;
  assert.equal(p.pending.length, 0); assert.equal(p.open.length, 1, 'limit order filled');
  // stop loss triggers
  q.price = q.price * 0.9; runEngine();
  p = (await t.api('GET', '/api/trading/portfolio', { token: user2Tok })).body;
  assert.equal(p.open.length, 0, 'position closed by stop loss');
  const h = (await t.api('GET', '/api/trading/history', { token: user2Tok })).body;
  assert.equal(h.rows[0].close_reason, 'stop_loss'); assert.ok(h.rows[0].pnl < 0);
  assert.ok(Math.abs(p.balance - (base + h.rows[0].pnl)) < 0.02);
});

test('records: pagination, filters, search', async () => {
  const p1 = (await t.api('GET', '/api/signals?page=1&pageSize=5', { token: userTok })).body;
  assert.equal(p1.rows.length, 5); assert.ok(p1.pages >= 3);
  const p2 = (await t.api('GET', '/api/signals?page=2&pageSize=5', { token: userTok })).body;
  assert.notEqual(p1.rows[0].id, p2.rows[0].id);
  const f = (await t.api('GET', '/api/signals?direction=SELL&status=active', { token: userTok })).body;
  assert.ok(f.rows.every((s) => s.direction === 'SELL' && s.status === 'active'));
  const adminUsers = (await t.api('GET', '/api/admin/records/users?q=second', { token: adminTok })).body;
  assert.equal(adminUsers.total, 1);
  assert.ok(!JSON.stringify(adminUsers).includes('password'));
  const act = (await t.api('GET', '/api/admin/records/activity?success=0', { token: adminTok })).body;
  assert.ok(act.total >= 1, 'failed logins are recorded');
  assert.equal((await t.api('GET', '/api/admin/records/users', { token: userTok })).status, 403);
});

test('admin user management: disable blocks login; role change; cannot self-demote', async () => {
  const dis = await t.api('PATCH', `/api/admin/users/${userId}`, { token: adminTok, body: { status: 'disabled' } });
  assert.equal(dis.body.user.status, 'disabled');
  assert.equal((await t.api('POST', '/api/auth/login', { body: { email, password: PW } })).status, 403);
  assert.equal((await t.api('GET', '/api/auth/me', { token: userTok })).status, 401, 'existing token stops working');
  await t.api('PATCH', `/api/admin/users/${userId}`, { token: adminTok, body: { status: 'active' } });
  userTok = await t.login(email, PW);
  assert.ok(userTok);
  const me = (await t.api('GET', '/api/auth/me', { token: adminTok })).body.user;
  assert.equal((await t.api('PATCH', `/api/admin/users/${me.id}`, { token: adminTok, body: { role: 'user' } })).status, 400);
  assert.equal((await t.api('PATCH', `/api/admin/users/${userId}`, { token: userTok, body: { role: 'admin' } })).status, 403);
});

test('site settings can be changed by admin only', async () => {
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: userTok, body: { site_name: 'Hacked' } })).status, 403);
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: adminTok, body: { site_name: 'Meridian Test' } })).status, 200);
  assert.equal((await t.api('GET', '/api/settings')).body.siteName, 'Meridian Test');
});

test('password change works and requires the current password', async () => {
  assert.equal((await t.api('POST', '/api/auth/change-password', { token: userTok, body: { currentPassword: 'nope', newPassword: 'NewPass#2026b' } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/change-password', { token: userTok, body: { currentPassword: PW, newPassword: 'NewPass#2026b' } })).status, 200);
  assert.ok(await t.login(email, 'NewPass#2026b'));
  assert.equal(await t.login(email, PW), undefined);
});

// ---------------- Excel ----------------
test('EXCEL: per-list download has formatted headers, widths, filters, number formats and green/red conditional fonts', async () => {
  const res = await t.api('GET', '/api/export/signals?status=hit_tp1', { token: userTok, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml/);
  assert.match(res.headers.get('content-disposition'), /\.xlsx/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const ws = wb.getWorksheet('Signals');
  assert.ok(ws.rowCount > 2);
  assert.equal(ws.getRow(1).getCell(1).value, 'ID');
  assert.equal(ws.getRow(1).getCell(1).font.bold, true);
  assert.ok(ws.autoFilter, 'autofilter present');
  assert.ok(ws.views[0].state === 'frozen');
  assert.ok(ws.getColumn(6).width >= 12, 'column widths set');
  const pctCol = ws.getRow(1).values.slice(1).indexOf('Result %') + 1;
  assert.ok(pctCol > 0);
  assert.match(ws.getRow(2).getCell(pctCol).numFmt, /0\.00/);
  assert.ok(ws.conditionalFormattings.length >= 3, 'conditional formatting (green/red fonts) present');
  const rows = sheetRows(wb, 'Signals'); assert.ok(rows.every((r) => r.Status === 'hit_tp1'), 'filter applied to export');
  const my = await t.api('GET', '/api/export/my', { token: userTok, raw: true });
  const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(Buffer.from(await my.arrayBuffer()));
  assert.deepEqual(w2.worksheets.map((s) => s.name).slice(0, 3), ['My trades', 'My orders', 'Signals']);
});

test('EXCEL: master workbook on disk auto-updates when data changes (signal, user, trade, watchlist)', async () => {
  const marker = `MASTER-TEST-${Date.now()}`;
  const wb0 = await readMaster();
  assert.deepEqual(wb0.worksheets.map((w) => w.name), ['Signals', 'Trades', 'Orders', 'Users', 'Watchlists', 'Activity', 'Info']);
  assert.ok(!sheetRows(wb0, 'Signals').some((r) => r['Analysis notes'] === marker));

  // 1) create a signal through the API -> new row appears in the file on disk (no manual rebuild call)
  const c = await t.api('POST', '/api/signals', { token: adminTok, body: sig({ pair: 'AUDUSD', entry: 0.66, stop_loss: 0.655, tp1: 0.667, notes: marker }) });
  assert.equal(c.status, 201);
  const fs = await import('node:fs'); const { config } = await import('../src/config.js');
  const found = await waitFor(async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(config.masterXlsx);
    return sheetRows(wb, 'Signals').find((r) => r['Analysis notes'] === marker);
  });
  assert.ok(found, 'new signal row present in records.xlsx on disk');
  assert.equal(found.Pair, 'AUDUSD'); assert.equal(found.Status, 'active');

  // 2) update it -> the same row changes
  await t.api('POST', `/api/signals/${c.body.signal.id}/close`, { token: adminTok, body: { status: 'hit_sl' } });
  const upd = await waitFor(async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(config.masterXlsx);
    const r = sheetRows(wb, 'Signals').find((x) => x['Analysis notes'] === marker); return r?.Status === 'hit_sl' ? r : null;
  });
  assert.ok(upd, 'status change reflected'); assert.ok(upd['Result %'] < 0);

  // 3) new user registration -> Users + Watchlists sheets
  const em = `excel${Date.now()}@example.com`;
  await t.registerVerified(em, 'Excel Check', PW);
  const usr = await waitFor(async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(config.masterXlsx);
    const u = sheetRows(wb, 'Users').find((r) => r.Email === em);
    return u && sheetRows(wb, 'Watchlists').some((r) => r.User === em) ? { u, wb } : null;
  });
  assert.ok(usr, 'registered user + default watchlist in master file');
  const usersHeaders = usr.wb.getWorksheet('Users').getRow(1).values.join('|').toLowerCase();
  assert.ok(!usersHeaders.includes('password') && !usersHeaders.includes('hash'), 'no password hashes exported');

  // 4) paper trade -> Trades sheet
  const tok = await t.login(em, PW);
  await t.api('POST', '/api/trading/orders', { token: tok, body: { symbol: 'ETHUSDT', side: 'SELL', type: 'market', qty: 1 } });
  const tr = await waitFor(async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(config.masterXlsx);
    return sheetRows(wb, 'Trades').find((r) => r.User === em && r.Symbol === 'ETHUSDT' && r.Side === 'SELL');
  });
  assert.ok(tr, 'paper trade row present'); assert.equal(tr.Status, 'open');

  // 5) delete the signal -> row disappears
  await t.api('DELETE', `/api/signals/${c.body.signal.id}`, { token: adminTok });
  const gone = await waitFor(async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(config.masterXlsx);
    return !sheetRows(wb, 'Signals').some((r) => r['Analysis notes'] === marker);
  });
  assert.ok(gone, 'deleted signal removed from master file');
  assert.ok(fs.readdirSync(config.dataDir).every((f) => !f.endsWith('.tmp')), 'no leftover temp files (atomic rename)');
  const info = (await t.api('GET', '/api/export/master/info', { token: adminTok })).body;
  assert.equal(info.exists, true); assert.equal(info.lastError, null);
});

test('EXCEL: a burst of concurrent changes leaves a valid workbook (debounced + atomic writes)', async () => {
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => t.api('POST', '/api/signals', { token: adminTok, body: sig({ pair: 'USDJPY', entry: 150 + i, stop_loss: 149 + i, tp1: 152 + i, tp2: 154 + i, notes: `burst-${i}` }) })));
  assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => r.body)));
  const { flushMaster } = await import('../src/services/excel.js');
  await flushMaster();
  const wb = await readMaster();
  const bursts = sheetRows(wb, 'Signals').filter((r) => String(r['Analysis notes']).startsWith('burst-'));
  assert.equal(bursts.length, 12);
});
