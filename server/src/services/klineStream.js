// Live Binance candles: ONE outbound WebSocket per market (spot / USD-M futures) using Binance's combined-stream
// endpoint. Streams are added / removed with SUBSCRIBE / UNSUBSCRIBE messages and reference-counted, so many
// browsers watching BTCUSDT 1m share a single upstream stream. Updates fan out over socket.io rooms.
// Node >= 22 ships a global WebSocket, so no extra dependency. (websocat is only a CLI tool for testing.)
import { INTERVALS } from './symbols.js';

// Tried in order; a host that closes before sending any data (geo-block, outage) rotates to the next one.
// data-stream.binance.vision is Binance's market-data-only mirror of the spot streams.
const list = (env, def) => (env ? env.split(',').map((x) => x.trim()).filter(Boolean) : def);
export const WS_URLS = {
  spot: list(process.env.BINANCE_WS_SPOT, ['wss://stream.binance.com:9443/stream', 'wss://data-stream.binance.vision/stream']),
  futures: list(process.env.BINANCE_WS_FUTURES, ['wss://fstream.binance.com/market/stream', 'wss://fstream.binance.com/stream']),
};
export const MARKETS = new Set(['spot', 'futures']);
const ENABLED = typeof WebSocket === 'function' && process.env.FORCE_SIMULATED !== 'true' && process.env.DISABLE_BINANCE_WS !== 'true';

export const streamName = (symbol, interval) => `${symbol.toLowerCase()}@kline_${interval}`;
export const roomFor = (market, symbol, interval) => `kline:${market}:${symbol}:${interval}`;

/** Binance kline payload -> chart candle. */
export function parseKline(msg) {
  const k = msg?.data?.k || msg?.k; if (!k || !k.s || !k.i) return null;
  return { symbol: k.s, interval: k.i, closed: !!k.x, candle: { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v } };
}

class MarketSocket {
  constructor(market, emit) { this.market = market; this.emit = emit; this.refs = new Map(); this.ws = null; this.id = 1; this.retry = 0; this.lastMsg = 0; this.timer = null; this.host = 0; this.gotData = false; }
  get streams() { return [...this.refs.keys()]; }
  send(method, params) { if (this.ws?.readyState === 1 && params.length) this.ws.send(JSON.stringify({ method, params, id: this.id++ })); }
  add(stream) {
    const n = (this.refs.get(stream) || 0) + 1; this.refs.set(stream, n);
    if (n === 1) { if (this.ws?.readyState === 1) this.send('SUBSCRIBE', [stream]); else this.connect(); }
  }
  remove(stream) {
    const n = (this.refs.get(stream) || 0) - 1;
    if (n > 0) return this.refs.set(stream, n);
    this.refs.delete(stream); this.send('UNSUBSCRIBE', [stream]);
    if (!this.refs.size) this.close();
  }
  connect() {
    if (!ENABLED || this.ws || !this.refs.size) return;
    // initial streams go in the URL; later ones via SUBSCRIBE on the same socket
    const urls = WS_URLS[this.market]; this.gotData = false;
    const ws = new WebSocket(`${urls[this.host % urls.length]}?streams=${this.streams.join('/')}`); this.ws = ws;
    ws.onopen = () => { this.lastMsg = Date.now(); const missing = this.streams; this.send('SUBSCRIBE', missing); };
    ws.onmessage = (ev) => {
      this.lastMsg = Date.now();
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const p = parseKline(m); if (p) { if (!this.gotData) { this.gotData = true; this.retry = 0; } this.emit(this.market, p); }
    };
    ws.onclose = () => { if (this.ws !== ws) return; this.ws = null; if (!this.gotData) this.host++; this.schedule(); };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    clearInterval(this.watch);
    this.watch = setInterval(() => { if (this.ws && Date.now() - this.lastMsg > (this.gotData ? 60e3 : 10e3)) { try { this.ws.close(); } catch { /* */ } } }, 20e3);
    this.watch.unref?.();
  }
  schedule() {
    if (!this.refs.size) return;
    clearTimeout(this.timer);
    const delay = Math.min(30e3, 500 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.connect(), delay); this.timer.unref?.();
  }
  close() { clearTimeout(this.timer); clearInterval(this.watch); const ws = this.ws; this.ws = null; try { ws?.close(); } catch { /* */ } }
  get live() { return this.ws?.readyState === 1 && this.gotData && Date.now() - this.lastMsg < 60e3; }
}

let hub = null;
export function createKlineHub(emit) {
  const sockets = { spot: new MarketSocket('spot', emit), futures: new MarketSocket('futures', emit) };
  hub = {
    enabled: ENABLED,
    subscribe(market, symbol, interval) { sockets[market].add(streamName(symbol, interval)); },
    unsubscribe(market, symbol, interval) { sockets[market].remove(streamName(symbol, interval)); },
    status: () => ({ enabled: ENABLED, spot: { live: sockets.spot.live, streams: sockets.spot.streams }, futures: { live: sockets.futures.live, streams: sockets.futures.streams } }),
    close() { sockets.spot.close(); sockets.futures.close(); },
  };
  return hub;
}
export const klineHub = () => hub;
export const validSub = (b) => b && MARKETS.has(b.market) && /^[A-Z0-9]{2,20}$/.test(b.symbol || '') && !!INTERVALS[b.interval];
