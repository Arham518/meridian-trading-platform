import fs from 'node:fs';
import path from 'node:path';
import { CORE, CORE_SET, SYMBOL_MAP, INTERVALS, allSymbols, registerCrypto } from './symbols.js';
import { config } from '../config.js';

// Real market data from free, keyless public endpoints. Nothing is invented: a symbol without data shows
// source 'unavailable' (no price) until a feed answers. The offline simulator runs only in test mode
// (FORCE_SIMULATED / DISABLE_MARKET_POLL). Last good values are cached in memory and on disk, so a feed
// outage or a restart keeps serving the most recent real price, flagged `stale`.
const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api.binance.us'];
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const GOLD_API = 'https://api.gold-api.com/price';
const SIM = config.forceSimulated || config.disableMarketPoll;
const CACHE_FILE = path.join(config.dataDir, 'market-cache.json');
const STALE_MS = { binance: 90e3, yahoo: 10 * 60e3, metal: 10 * 60e3 };

const state = new Map();   // symbol -> quote
const changed = new Set(); // symbols updated since the last emit
const feedOk = { binance: 0, yahoo: 0, metal: 0 }; // last successful fetch per feed
let tickListeners = [];
let timers = [];

// ---------- helpers ----------
const round = (n, d) => Number(Number(n).toFixed(d));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const decimalsFor = (p) => (p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 4 : p >= 0.01 ? 5 : p >= 0.0001 ? 7 : 8);
async function getJson(url, timeout = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (meridian-trading)', accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
/** Tries each host in turn and remembers the one that worked. */
function hostPool(hosts) {
  let good = hosts[0];
  return async (pathAndQuery, timeout) => {
    let last;
    for (const h of [good, ...hosts.filter((x) => x !== good)]) {
      try { const r = await getJson(h + pathAndQuery, timeout); good = h; return r; } catch (e) { last = e; }
    }
    throw last;
  };
}
const binance = hostPool(BINANCE_HOSTS);
const binanceFutures = hostPool(['https://fapi.binance.com']);
const yahoo = hostPool(YAHOO_HOSTS);

function setQuote(symbol, q, source) {
  const meta = SYMBOL_MAP.get(symbol); if (!meta || !(q.price > 0)) return;
  if (meta.feed !== 'binance' && meta.decimals != null) { q.price = round(q.price, meta.decimals); if (q.open24) q.open24 = round(q.open24, meta.decimals); }
  const prev = state.get(symbol) || {};
  const open24 = q.open24 > 0 ? q.open24 : prev.open24 || q.price;
  const next = {
    symbol, price: q.price, open24, high24: Math.max(q.high24 || 0, q.price), low24: Math.min(q.low24 || Infinity, q.price),
    change: q.price - open24, changePct: q.changePct ?? ((q.price - open24) / open24) * 100,
    volume: q.volume ?? prev.volume ?? 0, bid: q.bid ?? null, ask: q.ask ?? null, ts: q.ts || Date.now(), fetchedAt: Date.now(), source,
  };
  if (prev.price !== next.price || prev.changePct !== next.changePct || prev.source !== source) changed.add(symbol);
  state.set(symbol, next);
  if (meta.decimals == null || (meta.feed === 'binance' && !CORE_SET.has(symbol) && !meta.fixedDecimals)) { meta.decimals = decimalsFor(q.price); meta.fixedDecimals = true; }
}

// ---------- feeds ----------
const cryptoList = () => [...allSymbols()].filter((s) => s.feed === 'binance').map((s) => s.symbol);
const yahooList = (coreOnly) => [...allSymbols()].filter((s) => s.y && (!coreOnly || CORE_SET.has(s.symbol)));

async function discoverBinance() {
  try {
    const info = await binance('/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING', 20000);
    for (const s of info.symbols || []) if (s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.isSpotTradingAllowed !== false) registerCrypto(s.symbol, s.baseAsset);
    searchIndex = null;
  } catch (e) { console.warn('[market] Binance symbol list unavailable:', e.message); }
}

async function pollBinance(symbols) {
  for (const part of chunk(symbols, 100)) {
    const rows = await binance(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(part))}`);
    for (const r of rows) {
      setQuote(r.symbol, { price: +r.lastPrice, open24: +r.openPrice, high24: +r.highPrice, low24: +r.lowPrice, changePct: +r.priceChangePercent,
        volume: +r.quoteVolume, bid: +r.bidPrice || null, ask: +r.askPrice || null, ts: r.closeTime }, 'binance');
    }
  }
  feedOk.binance = Date.now();
}

const futures = new Map(); // Yahoo futures ticker -> { price, pct, closes } (metals use it for the daily change)
async function pollYahoo(metas) {
  for (const part of chunk(metas, 20)) {
    const d = await yahoo(`/v8/finance/spark?symbols=${encodeURIComponent(part.map((m) => m.y).join(','))}&range=1d&interval=5m`);
    for (const m of part) {
      const r = d?.[m.y]; const price = r?.fulldayPrice ?? r?.close?.at?.(-1);
      if (!(price > 0)) continue;
      const closes = (r.close || []).filter((x) => x > 0);
      const prevClose = r.chartPreviousClose || r.previousClose;
      const pct = r.fulldayChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
      const ts = (r.timestamp?.at?.(-1) || 0) * 1000 || Date.now();
      if (m.feed === 'metal') { futures.set(m.y, { price, pct, closes, ts }); if (!metalSpot.has(m.metal)) setMetal(m); continue; }
      setQuote(m.symbol, { price, open24: price / (1 + pct / 100), changePct: pct, high24: Math.max(...closes, price), low24: Math.min(...closes, price), ts }, 'yahoo');
    }
  }
  feedOk.yahoo = Date.now();
}

const metalSpot = new Map(); // XAU -> { price, ts }
function setMetal(m) {
  const fut = futures.get(m.y); const spot = metalSpot.get(m.metal);
  const price = spot?.price ?? fut?.price; if (!(price > 0)) return;
  const pct = fut?.pct ?? 0; const k = fut ? price / fut.price : 1;
  const closes = (fut?.closes || []).map((c) => c * k);
  setQuote(m.symbol, { price, open24: price / (1 + pct / 100), changePct: pct, high24: Math.max(...closes, price), low24: Math.min(...closes, price), ts: spot?.ts || fut?.ts }, spot ? 'gold-api' : 'yahoo');
}
async function pollMetals() {
  const metals = [...allSymbols()].filter((s) => s.feed === 'metal');
  let ok = 0;
  await Promise.all(metals.map(async (m) => {
    try { const r = await getJson(`${GOLD_API}/${m.metal}`, 6000); if (r.price > 0) { metalSpot.set(m.metal, { price: r.price, ts: Date.parse(r.updatedAt) || Date.now() }); ok++; } } catch { /* futures fallback */ }
    setMetal(m);
  }));
  if (ok) feedOk.metal = Date.now();
}

/** Runs a poller on an interval; failures keep the last good values and are logged once per outage. */
function every(ms, name, fn) {
  let down = false; let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try { await fn(); if (down) console.log(`[market] ${name} feed recovered`); down = false; }
    catch (e) { if (!down) console.warn(`[market] ${name} feed unavailable (${e.message}); serving last cached prices`); down = true; }
    finally { busy = false; emit(); }
  };
  run(); timers.push(setInterval(run, ms));
}

// ---------- disk cache (survives restarts / feed outages) ----------
function loadCache() {
  try {
    const rows = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    for (const q of rows) {
      if (q.feed === 'binance') registerCrypto(q.symbol, q.symbol.replace(/USDT$/, ''));
      if (SYMBOL_MAP.has(q.symbol) && q.price > 0 && !state.has(q.symbol)) state.set(q.symbol, { ...q, fetchedAt: 0 });
    }
  } catch { /* no cache yet */ }
}
function saveCache() {
  const rows = [...state.values()].map((q) => ({ ...q, feed: SYMBOL_MAP.get(q.symbol)?.feed }));
  fs.promises.writeFile(CACHE_FILE, JSON.stringify(rows)).catch(() => {});
}

// ---------- test-mode simulator (never used in production) ----------
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const gauss = (rnd) => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function simTick() {
  for (const m of CORE) {
    const q = state.get(m.symbol) || { price: m.base, open24: m.base * (1 + gauss(mulberry32(hash(m.symbol))) * 0.004) };
    const drift = gauss(Math.random) * m.vol * 0.35 + ((m.base - q.price) / m.base) * 0.0008;
    const price = round(Math.max(q.price * (1 + drift), m.base * 0.2), m.decimals);
    setQuote(m.symbol, { price, open24: q.open24, high24: Math.max(q.high24 || price, price), low24: Math.min(q.low24 || price, price) }, 'simulated');
  }
}
function simulatedKlines(meta, interval, limit) {
  const step = INTERVALS[interval]; const rnd = mulberry32(hash(meta.symbol + interval));
  const now = Math.floor(Date.now() / 1000 / step) * step; const vol = meta.vol * Math.sqrt(step / 60) * 0.55;
  let price = meta.base; const out = [];
  for (let i = limit - 1; i >= 0; i--) {
    const open = price; const close = open * (1 + gauss(rnd) * vol);
    out.push({ time: now - i * step, open, high: Math.max(open, close) * (1 + Math.abs(gauss(rnd)) * vol * 0.5), low: Math.min(open, close) * (1 - Math.abs(gauss(rnd)) * vol * 0.5), close, volume: Math.round((0.4 + rnd()) * 1000) });
    price = close;
  }
  const k = (getPrice(meta.symbol) || meta.base) / out.at(-1).close; const d = meta.decimals;
  return out.map((c) => ({ time: c.time, open: round(c.open * k, d), high: round(c.high * k, d), low: round(c.low * k, d), close: round(c.close * k, d), volume: c.volume }));
}

// ---------- public API ----------
function view(symbol) {
  const meta = SYMBOL_MAP.get(symbol); if (!meta) return null;
  const q = state.get(symbol);
  const base = { symbol, name: meta.name, type: meta.type, decimals: meta.decimals ?? 2 };
  if (!q) return { ...base, price: null, changePct: null, high24: null, low24: null, source: 'unavailable', stale: true };
  const stale = q.source !== 'simulated' && Date.now() - (q.fetchedAt || 0) > (STALE_MS[meta.feed] || 60e3);
  return { ...base, ...q, stale };
}
export const getQuote = (symbol) => state.get(symbol); // live internal quote (engine + tests)
export const getPrice = (symbol) => state.get(symbol)?.price ?? null;
/** Curated list with the latest quote. */
export const getAllQuotes = () => CORE.map((m) => view(m.symbol));
/** Latest quotes for any catalogue symbols (unknown ones are skipped). */
export const getQuotes = (symbols) => symbols.filter((x) => SYMBOL_MAP.has(x) && !CORE_SET.has(x)).map(view);
export const marketStatus = () => ({
  cryptoSource: SIM ? 'simulated' : Date.now() - feedOk.binance < STALE_MS.binance ? 'binance' : 'cached',
  feeds: { binance: !!feedOk.binance && Date.now() - feedOk.binance < STALE_MS.binance, yahoo: !!feedOk.yahoo && Date.now() - feedOk.yahoo < STALE_MS.yahoo, metals: !!feedOk.metal && Date.now() - feedOk.metal < STALE_MS.metal },
  symbols: SYMBOL_MAP.size, updatedAt: Date.now(),
});

// search: one pre-built index over the whole catalogue, rebuilt only when new symbols are registered
let searchIndex = null;
const norm = (s) => String(s).toLowerCase().replace(/[\s/._-]+/g, '');
function buildIndex() {
  searchIndex = [...allSymbols()].map((m) => ({ m, sym: m.symbol.toLowerCase(), name: norm(m.name), alias: (m.aliases || '').split(' ').map(norm), core: CORE_SET.has(m.symbol) ? 0 : 1 }));
  return searchIndex;
}
/** Ranked symbol search: exact > prefix > name prefix > contains; ties: curated first, then traded volume. */
export function searchSymbols(query, { limit = 50, type } = {}) {
  const t = norm(query).slice(0, 32); const idx = searchIndex || buildIndex();
  const hits = [];
  for (const e of idx) {
    if (type && e.m.type !== type) continue;
    const crypto = e.m.type === 'crypto';
    const rank = !t ? 4 : e.sym === t || (crypto && e.sym === `${t}usdt`) ? 0
      : e.sym.startsWith(t) || e.alias.some((w) => w.startsWith(t)) ? 1 : e.name.startsWith(t) ? 2 : e.sym.includes(t) || e.name.includes(t) ? 3 : -1;
    if (rank < 0) continue;
    hits.push({ e, rank, vol: state.get(e.m.symbol)?.volume || 0 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.e.core - b.e.core || b.vol - a.vol || a.e.sym.localeCompare(b.e.sym));
  return { total: hits.length, results: hits.slice(0, limit).map((h) => view(h.e.m.symbol)) };
}

export const onTick = (fn) => { tickListeners.push(fn); return () => { tickListeners = tickListeners.filter((f) => f !== fn); }; };
function emit() {
  if (!changed.size) return;
  const list = [...changed].map(view).filter(Boolean); changed.clear();
  for (const fn of tickListeners) { try { fn(list); } catch (e) { console.error(e); } }
}

export function startMarket() {
  if (SIM) { simTick(); timers.push(setInterval(() => { simTick(); emit(); }, 1000)); return; }
  loadCache();
  const coreCrypto = CORE.filter((m) => m.feed === 'binance').map((m) => m.symbol);
  every(3000, 'Binance', () => pollBinance(coreCrypto));
  discoverBinance().then(() => every(20000, 'Binance (all pairs)', () => pollBinance(cryptoList().filter((s) => !CORE_SET.has(s)))));
  timers.push(setInterval(discoverBinance, 6 * 3600e3));
  every(10000, 'Yahoo (core)', () => pollYahoo(yahooList(true)));
  every(60000, 'Yahoo (all)', () => pollYahoo(yahooList(false).filter((m) => !CORE_SET.has(m.symbol))));
  every(15000, 'gold-api', pollMetals);
  timers.push(setInterval(saveCache, 60000));
}
export function stopMarket() { timers.forEach(clearInterval); timers = []; if (!SIM) saveCache(); }

// ---------- klines ----------
const klineCache = new Map(); // key -> { at, data }
const klineTtl = (interval) => (interval === '1m' ? 10e3 : interval === '5m' ? 20e3 : 60e3);
// Yahoo interval + range per chart timeframe (4h is built from 1h bars)
const YH = { '1m': ['1m', '5d'], '5m': ['5m', '1mo'], '15m': ['15m', '1mo'], '1h': ['60m', '6mo'], '4h': ['60m', '2y'], '1d': ['1d', '5y'], '1w': ['1wk', '10y'] };

async function yahooKlines(meta, interval, limit) {
  const [yi, range] = YH[interval];
  const d = await yahoo(`/v8/finance/chart/${encodeURIComponent(meta.y)}?interval=${yi}&range=${range}`, 10000);
  const r = d?.chart?.result?.[0]; const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q) throw new Error('no data');
  let rows = r.timestamp.map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] || 0 }))
    .filter((c) => c.open > 0 && c.close > 0 && c.high > 0 && c.low > 0);
  if (interval === '4h') {
    const b = new Map();
    for (const c of rows) {
      const k = Math.floor(c.time / 14400) * 14400; const x = b.get(k);
      if (!x) b.set(k, { ...c, time: k }); else { x.high = Math.max(x.high, c.high); x.low = Math.min(x.low, c.low); x.close = c.close; x.volume += c.volume; }
    }
    rows = [...b.values()];
  }
  // metals: futures candles scaled to the spot price so the chart matches the quote
  const spot = meta.feed === 'metal' ? getPrice(meta.symbol) : null;
  const k = spot && rows.length ? spot / rows.at(-1).close : 1; const dp = meta.decimals ?? 2;
  return rows.slice(-limit).map((c) => ({ time: c.time, open: round(c.open * k, dp), high: round(c.high * k, dp), low: round(c.low * k, dp), close: round(c.close * k, dp), volume: c.volume }));
}

export async function getKlines(symbol, interval = '1h', limit = 300, market = 'spot') {
  const meta = SYMBOL_MAP.get(symbol);
  if (market !== 'futures' || meta?.feed !== 'binance') market = 'spot';
  if (!meta || !INTERVALS[interval]) throw Object.assign(new Error('Unknown symbol or interval'), { status: 400 });
  limit = Math.min(Math.max(Number(limit) || 300, 20), 1000);
  const key = `${market}:${symbol}:${interval}:${limit}`; const hit = klineCache.get(key);
  if (hit && Date.now() - hit.at < klineTtl(interval)) return hit.data;
  let candles = null; let source = 'unavailable';
  if (SIM) { if (meta.base > 0) { candles = simulatedKlines(meta, interval, limit); source = 'simulated'; } }
  else {
    try {
      if (meta.feed === 'binance') {
        const rows = market === 'futures'
          ? await binanceFutures(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
          : await binance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        candles = rows.map((r) => ({ time: Math.floor(r[0] / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] })); source = 'binance';
      } else { candles = await yahooKlines(meta, interval, limit); source = 'yahoo'; }
    } catch {
      if (hit) return { ...hit.data, stale: true }; // feed down: serve the last real candles
    }
  }
  const data = { symbol, interval, market, source, candles: candles || [] };
  if (candles?.length) klineCache.set(key, { at: Date.now(), data });
  if (klineCache.size > 500) klineCache.delete(klineCache.keys().next().value);
  return data;
}

export async function getSparklines() {
  const out = {};
  await Promise.all(CORE.map(async (s) => {
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
    // keep the last live headlines when the feed is briefly down
    data = newsCache.data?.source === 'live' ? newsCache.data : { source: 'sample', items: SAMPLE_NEWS };
  }
  newsCache = { at: Date.now(), data };
  return data;
}
