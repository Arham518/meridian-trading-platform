import { create } from 'zustand';
import { api } from '../lib/api.js';
import { connectSocket, disconnectSocket } from '../lib/socket.js';

let poll = null;

export const useMarket = create((set, get) => ({
  quotes: {},          // symbol -> { price, changePct, high, low, source, name, type, decimals }
  order: [],           // stable symbol order
  status: null,        // { cryptoSource: 'binance' | 'simulated' }
  connected: false,
  lastTick: 0,
  signalTick: 0,       // bumped whenever a signal event arrives -> lists refetch
  tradeTick: 0,        // bumped on SL/TP/limit-fill events
  usersTick: 0,        // admins only: bumped when a user registers, logs in or is edited -> admin user list refetches
  watchlist: [],
  extra: [],           // non-curated symbols in use (chart, watchlist, positions): fetched with the curated list

  applyQuotes(list, status, extra = []) {
    const prev = get().quotes; const next = { ...prev };
    for (const q of [...list, ...extra]) {
      const old = prev[q.symbol] || {};
      next[q.symbol] = { ...old, symbol: q.symbol, price: q.price, changePct: q.changePct, high: q.high24, low: q.low24, bid: q.bid, ask: q.ask, ts: q.ts, stale: q.stale, source: q.source, name: q.name ?? old.name, type: q.type ?? old.type, decimals: q.decimals ?? old.decimals };
    }
    set({ quotes: next, order: get().order.length ? get().order : list.map((q) => q.symbol), status: status || get().status, lastTick: Date.now() });
  },
  applyTicks(ticks) {
    const prev = get().quotes; const next = { ...prev }; let status = get().status;
    for (const t of ticks) {
      if (t.status) { status = t.status; continue; }
      const old = prev[t.s]; if (!old) continue;
      next[t.s] = { ...old, price: t.p, changePct: t.c, high: t.h, low: t.l, bid: t.b, ask: t.a, ts: t.t, stale: t.st, source: t.src };
    }
    set({ quotes: next, status, lastTick: Date.now() });
  },
  async fetchQuotes() {
    const ex = get().extra;
    try { const d = await api(`/market/quotes${ex.length ? `?symbols=${ex.join(',')}` : ''}`); get().applyQuotes(d.quotes, d.status, d.extra); } catch { /* keep last known */ }
  },
  /** Makes sure quotes for these symbols are loaded and kept live (they are outside the curated list). */
  ensure(symbols = []) {
    const known = get().quotes; const ex = get().extra;
    const add = [...new Set(symbols)].filter((s) => s && /^[A-Z0-9]{2,20}$/.test(s) && !ex.includes(s));
    if (!add.length) return;
    set({ extra: [...ex, ...add].slice(-40) });
    if (add.some((s) => !known[s])) get().fetchQuotes();
  },
  /** Public REST polling (landing page / before login). */
  startPolling() {
    if (poll) return;
    get().fetchQuotes();
    poll = setInterval(() => get().fetchQuotes(), 4000);
  },
  stopPolling() { clearInterval(poll); poll = null; },
  /** Authenticated live feed through socket.io. */
  startLive(handlers = {}) {
    get().stopPolling();
    get().fetchQuotes();
    const socket = connectSocket();
    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => { set({ connected: false }); get().startPollingFallback(); });
    socket.on('ticks', (t) => { if (get().connected) get().stopPolling(); get().applyTicks(t); });
    socket.on('signal:new', (s) => { set({ signalTick: get().signalTick + 1 }); handlers.onSignalNew?.(s); });
    socket.on('signal:update', (s) => { set({ signalTick: get().signalTick + 1 }); handlers.onSignalUpdate?.(s); });
    socket.on('signal:delete', () => set({ signalTick: get().signalTick + 1 }));
    socket.on('users:changed', () => set({ usersTick: get().usersTick + 1 }));
    socket.on('trade:update', (e) => { set({ tradeTick: get().tradeTick + 1 }); handlers.onTrade?.(e); });
  },
  startPollingFallback() { get().startPolling(); },
  stopLive() { disconnectSocket(); set({ connected: false }); },

  async loadWatchlist() { try { const w = (await api('/watchlist')).symbols; set({ watchlist: w }); get().ensure(w); } catch { /* ignore */ } },
  async toggleWatch(symbol) {
    const has = get().watchlist.includes(symbol);
    set({ watchlist: has ? get().watchlist.filter((s) => s !== symbol) : [...get().watchlist, symbol] }); // optimistic
    try {
      const d = has ? await api(`/watchlist/${symbol}`, { method: 'DELETE' }) : await api('/watchlist', { method: 'POST', body: { symbol } });
      set({ watchlist: d.symbols }); get().ensure(d.symbols);
    } catch (e) { get().loadWatchlist(); throw e; }
  },
}));

export const useQuote = (symbol) => useMarket((s) => s.quotes[symbol]);
