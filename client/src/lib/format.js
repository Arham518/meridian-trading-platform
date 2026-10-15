import { format, formatDistanceToNowStrict } from 'date-fns';

export const decimalsFor = (price) => (price >= 1000 ? 2 : price >= 100 ? 2 : price >= 10 ? 3 : price >= 1 ? 4 : 5);
export const fmtPrice = (n, d) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? decimalsFor(n), maximumFractionDigits: d ?? decimalsFor(n) }));
export const fmtMoney = (n, opts = {}) => (n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, ...opts }));
export const fmtSigned = (n, d = 2) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const fmtPct = (n, d = 2) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`);
export const fmtCompact = (n) => (n == null ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
export const fmtDate = (iso, f = 'dd MMM yyyy, HH:mm') => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : format(d, f); };
export const timeAgo = (iso) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : '—');
export const sign = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');

/** EURUSD -> EUR/USD ; BTCUSDT -> BTC/USDT */
export function pairLabel(s = '') {
  if (/USDT$/.test(s)) return `${s.slice(0, -4)}/USDT`;
  if (/^[A-Z]{6}$/.test(s)) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return s;
}
export const STATUS_META = {
  active: { label: 'Active', cls: 'badge-accent' },
  hit_tp1: { label: 'TP1 hit', cls: 'badge-up' },
  hit_tp2: { label: 'TP2 hit', cls: 'badge-up' },
  hit_sl: { label: 'Stopped out', cls: 'badge-down' },
  cancelled: { label: 'Cancelled', cls: 'badge-neutral' },
};
