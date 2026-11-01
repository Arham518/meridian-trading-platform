import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useMarket } from '../store/market.js';

// Server-side search over the whole catalogue (500+ instruments). Results are cached per query for a few
// seconds and the list is capped, so typing stays instant without rendering hundreds of rows.
const cache = new Map(); // query -> { at, data }
const TTL = 8000;

export function useSymbolSearch(query, { limit = 40, enabled = true } = {}) {
  const t = query.trim().replace(/\s+/g, ' ').slice(0, 32);
  const key = `${t.toLowerCase()}|${limit}`;
  const [res, setRes] = useState(() => cache.get(key)?.data || null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !t) { setRes(null); return undefined; }
    const hit = cache.get(key);
    if (hit) setRes(hit.data);
    if (hit && Date.now() - hit.at < TTL) return undefined;
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await api(`/market/search?q=${encodeURIComponent(t)}&limit=${limit}`, { signal: ac.signal });
        cache.set(key, { at: Date.now(), data: d }); if (cache.size > 200) cache.delete(cache.keys().next().value);
        setRes(d);
      } catch { /* keep the previous results */ } finally { if (!ac.signal.aborted) setLoading(false); }
    }, hit ? 0 : 140);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [key, t, limit, enabled]);
  // overlay live prices for symbols already streaming into the store
  const quotes = useMarket((s) => s.quotes);
  const results = useMemo(() => (res?.results || []).map((r) => (quotes[r.symbol]?.price ? { ...r, ...quotes[r.symbol] } : r)), [res, quotes]);
  return { results, total: res?.total ?? 0, loading, searching: !!t };
}
