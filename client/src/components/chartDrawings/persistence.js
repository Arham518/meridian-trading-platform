// Drawings persistence: signed-in users -> /api/drawings (SQLite, private per user); guests -> localStorage.
import { api, qs } from '../../lib/api.js';

const LS = 'cd_drawings:';
export const keyOf = ({ symbol, interval, market }) => `${symbol}:${interval}:${market || 'spot'}`;
const clean = (list) => list.map(({ id, type, anchors, style, locked, visible }) => ({ id, type, anchors: anchors.map((a) => ({ time: +a.time, price: +a.price })), style, locked: !!locked, visible: visible !== false }));

export async function loadDrawings(k, authed, signal) {
  if (authed) {
    try { const r = await api(`/drawings${qs({ symbol: k.symbol, interval: k.interval, market: k.market || 'spot' })}`, { signal }); return r.drawings || []; }
    catch (e) { if (e.name === 'AbortError') throw e; /* fall through to the local copy */ }
  }
  try { return JSON.parse(localStorage.getItem(LS + keyOf(k)) || '[]'); } catch { return []; }
}

export async function saveDrawings(k, list, authed) {
  const data = clean(list);
  try { if (data.length) localStorage.setItem(LS + keyOf(k), JSON.stringify(data)); else localStorage.removeItem(LS + keyOf(k)); } catch { /* storage full / blocked */ }
  if (authed) await api(`/drawings${qs({ symbol: k.symbol, interval: k.interval, market: k.market || 'spot' })}`, { method: 'PUT', body: { drawings: data } });
}
