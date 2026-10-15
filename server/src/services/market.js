import { SYMBOLS, SYMBOL_MAP, INTERVALS } from './symbols.js';
import { config } from '../config.js';

const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api.binance.us'];
const cryptoSymbols = SYMBOLS.filter((s) => s.live).map((s) => s.symbol);

const state = new Map(); // symbol -> quote
let binanceHost = null;
let binanceFails = 0;
let tickListeners = [];
let timers = [];

// ---------- helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const gauss = (rnd) => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const round = (n, d) => Number(n.toFixed(d));

async function getJson(url, timeout = 6000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'meridian-trading/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- quotes ----------
function initQuote(meta) {
  const dayOpen = meta.base * (1 + (gauss(mulberry32(hash(meta.symbol + new Date().toDateString()))) * Math.min(0.01, meta.vol * 12)));
  return {
    symbol: meta.symbol, price: meta.base, open24: dayOpen, high24: Math.max(meta.base, dayOpen) * 1.004,
    low24: Math.min(meta.base, dayOpen) * 0.996, change: 0, changePct: 0, volume: 0, ts: Date.now(), source: 'simulated',
  };
}
for (const s of SYMBOLS) { const q = initQuote(s); q.change = q.price - q.open24; q.changePct = (q.change / q.open24) * 100; state.set(s.symbol, q); }

const useLiveCrypto = () => !config.forceSimulated && binanceFails < 3 && binanceHost;

async function pollBinance() {
  if (config.forceSimulated) return;
  const qs = encodeURIComponent(JSON.stringify(cryptoSymbols));
  const hosts = binanceHost ? [binanceHost, ...BINANCE_HOSTS.filter((h) => h !== binanceHost)] : BINANCE_HOSTS;
  for (const host of hosts) {
    try {
      const rows = await getJson(`${host}/api/v3/ticker/24hr?symbols=${qs}`);
      if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
      for (const r of rows) {
        const q = state.get(r.symbol);
        if (!q) continue;
        q.price = Number(r.lastPrice); q.open24 = Number(r.openPrice); q.high24 = Number(r.highPrice); q.low24 = Number(r.lowPrice);
        q.change = Number(r.priceChange); q.changePct = Number(r.priceChangePercent); q.volume = Number(r.quoteVolume);
        q.ts = Date.now(); q.source = 'binance';
      }
      binanceHost = host; binanceFails = 0;
      return;
    } catch { /* try next host */ }
  }
  binanceFails += 1;
  if (binanceFails === 3) {
    for (const s of SYMBOLS.filter((m) => m.live)) state.get(s.symbol).source = 'simulated';
    console.warn('[market] Binance unreachable - crypto quotes are now SIMULATED (will keep retrying).');
  }
}

function simTick() {
  for (const meta of SYMBOLS) {
    const q = state.get(meta.symbol);
    if (meta.live && useLiveCrypto()) continue;
    const drift = gauss(Math.random) * meta.vol * 0.35 + (meta.base - q.price) / meta.base * 0.0008;
    q.price = round(Math.max(q.price * (1 + drift), meta.base * 0.2), meta.decimals);
    q.high24 = Math.max(q.high24, q.price); q.low24 = Math.min(q.low24, q.price);
    q.change = q.price - q.open24; q.changePct = (q.change / q.open24) * 100; q.ts = Date.now(); q.source = 'simulated';
  }
}

export const getQuote = (symbol) => state.get(symbol);
export const getPrice = (symbol) => state.get(symbol)?.price;
export const getAllQuotes = () => SYMBOLS.map((m) => ({ ...state.get(m.symbol), name: m.name, type: m.type, decimals: m.decimals }));
export const marketStatus = () => ({
  cryptoSource: useLiveCrypto() ? 'binance' : 'simulated', host: binanceHost, others: 'simulated', updatedAt: Date.now(),
});
export const onTick = (fn) => { tickListeners.push(fn); return () => { tickListeners = tickListeners.filter((f) => f !== fn); }; };

export function startMarket() {
  if (config.disableMarketPoll) { timers.push(setInterval(() => { simTick(); emit(); }, 1000)); return; }
  pollBinance().then(emit);
  timers.push(setInterval(() => pollBinance().then(emit), 3000));
  timers.push(setInterval(() => { simTick(); emit(); }, 1000));
}
export function stopMarket() { timers.forEach(clearInterval); timers = []; }
function emit() { const snap = getAllQuotes(); for (const fn of tickListeners) { try { fn(snap); } catch (e) { console.error(e); } } }

// ---------- klines ----------
const klineCache = new Map();
const klineTtl = (interval) => (interval === '1m' ? 8000 : interval === '5m' ? 15000 : 30000);

function simulatedKlines(symbol, interval, limit) {
  const meta = SYMBOL_MAP.get(symbol);
  const step = INTERVALS[interval];
  const rnd = mulberry32(hash(symbol + interval));
  const nowBucket = Math.floor(Date.now() / 1000 / step) * step;
  const vol = meta.vol * Math.sqrt(step / 60) * 0.55;
  let price = meta.base; const out = [];
  for (let i = limit - 1; i >= 0; i--) {
    const open = price;
    const trend = Math.sin((limit - i) / 38) * vol * 0.25;
    const close = open * (1 + gauss(rnd) * vol + trend);
    const hi = Math.max(open, close) * (1 + Math.abs(gauss(rnd)) * vol * 0.55);
    const lo = Math.min(open, close) * (1 - Math.abs(gauss(rnd)) * vol * 0.55);
    out.push({ time: nowBucket - i * step, open, high: hi, low: lo, close, volume: Math.round((0.4 + rnd()) * 1000 * (1 + Math.abs(close - open) / open * 400)) });
    price = close;
  }
  const k = (getPrice(symbol) || meta.base) / out[out.length - 1].close;
  return out.map((c) => ({ time: c.time, open: round(c.open * k, meta.decimals), high: round(c.high * k, meta.decimals), low: round(c.low * k, meta.decimals), close: round(c.close * k, meta.decimals), volume: c.volume }));
}

export async function getKlines(symbol, interval = '1h', limit = 300) {
  const meta = SYMBOL_MAP.get(symbol);
  if (!meta || !INTERVALS[interval]) throw Object.assign(new Error('Unknown symbol or interval'), { status: 400 });
  limit = Math.min(Math.max(Number(limit) || 300, 20), 1000);
  const key = `${symbol}:${interval}:${limit}`;
  const hit = klineCache.get(key);
  if (hit && Date.now() - hit.at < klineTtl(interval)) return hit.data;
  let data; let source = 'simulated';
  if (meta.live && useLiveCrypto() !== false && !config.forceSimulated) {
    const hosts = binanceHost ? [binanceHost, ...BINANCE_HOSTS.filter((h) => h !== binanceHost)] : BINANCE_HOSTS;
    for (const host of hosts) {
      try {
        const rows = await getJson(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        data = rows.map((r) => ({ time: Math.floor(r[0] / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
        source = 'binance'; binanceHost = host; break;
      } catch { /* next */ }
    }
  }
  if (!data) data = simulatedKlines(symbol, interval, limit);
  const result = { symbol, interval, source, candles: data };
  klineCache.set(key, { at: Date.now(), data: result });
  return result;
}

export async function getSparklines() {
  const out = {};
  await Promise.all(SYMBOLS.map(async (s) => {
    try { const k = await getKlines(s.symbol, '1h', 48); out[s.symbol] = k.candles.slice(-24).map((c) => c.close); } catch { out[s.symbol] = []; }
  }));
  return out;
}

// ---------- news ----------
let newsCache = { at: 0, data: null };
const SAMPLE_NEWS = [
  { title: 'Bitcoin holds key support as traders weigh next central bank decision', source: 'Sample headline', link: '#', time: null },
  { title: 'Gold consolidates near record territory ahead of inflation data', source: 'Sample headline', link: '#', time: null },
  { title: 'Dollar index steadies; EUR/USD range tightens into the week\'s close', source: 'Sample headline', link: '#', time: null },
  { title: 'Ethereum network activity rises as layer-2 fees stay low', source: 'Sample headline', link: '#', time: null },
  { title: 'Tech earnings in focus: NVDA and TSLA lead pre-market volume', source: 'Sample headline', link: '#', time: null },
  { title: 'Risk management reminder: size positions before you pick entries', source: 'Sample headline', link: '#', time: null },
];
const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#8217;|&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();

export async function getNews() {
  if (newsCache.data && Date.now() - newsCache.at < 10 * 60 * 1000) return newsCache.data;
  let data;
  try {
    const res = await fetch('https://cointelegraph.com/rss', { signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 meridian' } });
    if (!res.ok) throw new Error('rss');
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).map((m) => {
      const pick = (tag) => decode((m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || '');
      const d = pick('pubDate');
      return { title: pick('title'), link: pick('link'), source: 'Cointelegraph', time: d ? new Date(d).toISOString() : null };
    }).filter((n) => n.title && /^https?:/.test(n.link));
    if (!items.length) throw new Error('no items');
    data = { source: 'live', items };
  } catch {
    data = { source: 'sample', items: SAMPLE_NEWS };
  }
  newsCache = { at: Date.now(), data };
  return data;
}
