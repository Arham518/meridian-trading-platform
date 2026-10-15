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
  watchlist: [],

  applyQuotes(list, status) {
    const prev = get().quotes; const next = { ...prev };
    for (const q of list) {
      const old = prev[q.symbol] || {};
      next[q.symbol] = { ...old, symbol: q.symbol, price: q.price, changePct: q.changePct, high: q.high24, low: q.low24, source: q.source, name: q.name ?? old.name, type: q.type ?? old.type, decimals: q.decimals ?? old.decimals };
    }
    set({ quotes: next, order: get().order.length ? get().order : list.map((q) => q.symbol), status: status || get().status, lastTick: Date.now() });
  },
  applyTicks(ticks) {
    const prev = get().quotes; const next = { ...prev }; let status = get().status;
    for (const t of ticks) {
      if (t.status) { status = t.status; continue; }
      const old = prev[t.s]; if (!old) continue;
      next[t.s] = { ...old, price: t.p, changePct: t.c, high: t.h, low: t.l, source: t.src };
    }
    set({ quotes: next, status, lastTick: Date.now() });
  },
  async fetchQuotes() {
    try { const d = await api('/market/quotes'); get().applyQuotes(d.quotes, d.status); } catch { /* keep last known */ }
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
    socket.on('trade:update', (e) => { set({ tradeTick: get().tradeTick + 1 }); handlers.onTrade?.(e); });
  },
  startPollingFallback() { get().startPolling(); },
  stopLive() { disconnectSocket(); set({ connected: false }); },

  async loadWatchlist() { try { set({ watchlist: (await api('/watchlist')).symbols }); } catch { /* ignore */ } },
  async toggleWatch(symbol) {
    const has = get().watchlist.includes(symbol);
    set({ watchlist: has ? get().watchlist.filter((s) => s !== symbol) : [...get().watchlist, symbol] }); // optimistic
    try {
      const d = has ? await api(`/watchlist/${symbol}`, { method: 'DELETE' }) : await api('/watchlist', { method: 'POST', body: { symbol } });
      set({ watchlist: d.symbols });
    } catch (e) { get().loadWatchlist(); throw e; }
  },
}));

export const useQuote = (symbol) => useMarket((s) => s.quotes[symbol]);
