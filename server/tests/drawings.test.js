// Chart drawings persistence + Binance kline stream parsing.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { parseKline, streamName, roomFor } from '../src/services/klineStream.js';

let t; let a; let b;
before(async () => {
  t = await boot();
  await t.registerVerified('draw-a@example.com', 'Drawer A', 'Trader#2026a'); a = await t.login('draw-a@example.com', 'Trader#2026a');
  await t.registerVerified('draw-b@example.com', 'Drawer B', 'Trader#2026a'); b = await t.login('draw-b@example.com', 'Trader#2026a');
});
after(async () => { await t.close(); });

const line = { id: 'd1', type: 'trend', anchors: [{ time: 1700000000, price: 100 }, { time: 1700003600, price: 110 }], style: { color: '#2962ff', width: 2, dash: 'solid' }, locked: false, visible: true };

test('drawings are saved per user / symbol / interval / market and isolated between users', async () => {
  const url = '/api/drawings?symbol=BTCUSDT&interval=1h&market=spot';
  assert.equal((await t.api('GET', url)).status, 401);
  assert.equal((await t.api('PUT', url, { token: a, body: { drawings: [line] } })).status, 200);
  assert.deepEqual((await t.api('GET', url, { token: a })).body.drawings, [line]);
  assert.deepEqual((await t.api('GET', url, { token: b })).body.drawings, [], 'user B cannot see A\'s drawings');
  assert.deepEqual((await t.api('GET', '/api/drawings?symbol=BTCUSDT&interval=4h&market=spot', { token: a })).body.drawings, []);
  assert.deepEqual((await t.api('GET', '/api/drawings?symbol=BTCUSDT&interval=1h&market=futures', { token: a })).body.drawings, []);
  assert.equal((await t.api('PUT', url, { token: a, body: { drawings: [{ ...line, type: 'nope' }] } })).status, 400);
  assert.equal((await t.api('PUT', url, { token: a, body: { drawings: [{ ...line, anchors: [{ x: 10, y: 20 }] }] } })).status, 400, 'pixel anchors rejected');
  assert.equal((await t.api('PUT', url, { token: a, body: { drawings: [] } })).status, 200);
  assert.deepEqual((await t.api('GET', url, { token: a })).body.drawings, []);
});

test('binance kline messages parse into chart candles', () => {
  const m = { stream: 'btcusdt@kline_1m', data: { e: 'kline', k: { t: 1700000040000, s: 'BTCUSDT', i: '1m', o: '1', h: '2', l: '0.5', c: '1.5', v: '10', x: true } } };
  assert.deepEqual(parseKline(m), { symbol: 'BTCUSDT', interval: '1m', closed: true, candle: { time: 1700000040, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 } });
  assert.equal(parseKline({ result: null, id: 1 }), null);
  assert.equal(streamName('BTCUSDT', '5m'), 'btcusdt@kline_5m');
  assert.equal(roomFor('futures', 'BTCUSDT', '1m'), 'kline:futures:BTCUSDT:1m');
});
