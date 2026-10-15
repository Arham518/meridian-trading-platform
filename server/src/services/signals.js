import { db, nowIso } from '../db.js';
import { pipSizeFor } from './symbols.js';

export const OPEN = 'active';
export const WIN = ['hit_tp1', 'hit_tp2'];

export function validateLevels({ direction, entry, stop_loss, tp1, tp2 }) {
  if (direction === 'BUY') {
    if (!(stop_loss < entry)) throw bad('stop_loss: must be below entry for a BUY signal');
    if (!(tp1 > entry)) throw bad('tp1: must be above entry for a BUY signal');
    if (tp2 != null && !(tp2 > tp1)) throw bad('tp2: must be above TP1 for a BUY signal');
  } else {
    if (!(stop_loss > entry)) throw bad('stop_loss: must be above entry for a SELL signal');
    if (!(tp1 < entry)) throw bad('tp1: must be below entry for a SELL signal');
    if (tp2 != null && !(tp2 < tp1)) throw bad('tp2: must be below TP1 for a SELL signal');
  }
}
const bad = (m) => Object.assign(new Error(m), { status: 400 });

/** Compute % and pip result of a signal that hit a level (or was closed at a custom price). */
export function computeResult(sig, status) {
  const target = status === 'hit_tp1' ? sig.tp1 : status === 'hit_tp2' ? (sig.tp2 ?? sig.tp1) : status === 'hit_sl' ? sig.stop_loss : null;
  if (target == null) return { pct: null, pips: null };
  const diff = (target - sig.entry) * (sig.direction === 'BUY' ? 1 : -1);
  const pip = pipSizeFor(sig.pair);
  return { pct: Number(((diff / sig.entry) * 100).toFixed(2)), pips: pip ? Number((diff / pip).toFixed(1)) : null };
}

export function statsFor(where = '1=1', params = []) {
  const row = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(status = 'active') AS active,
      SUM(status IN ('hit_tp1','hit_tp2')) AS wins,
      SUM(status = 'hit_sl') AS losses,
      SUM(status = 'cancelled') AS cancelled,
      AVG(CASE WHEN status IN ('hit_tp1','hit_tp2','hit_sl') THEN result_pct END) AS avg_result,
      SUM(CASE WHEN status IN ('hit_tp1','hit_tp2','hit_sl') THEN result_pct ELSE 0 END) AS total_result,
      MAX(result_pct) AS best, MIN(result_pct) AS worst
    FROM signals WHERE ${where}`).get(...params);
  const decided = (row.wins || 0) + (row.losses || 0);
  const series = db.prepare(`SELECT closed_at AS t, result_pct AS r FROM signals WHERE status IN ('hit_tp1','hit_tp2','hit_sl') AND result_pct IS NOT NULL ORDER BY closed_at ASC LIMIT 200`).all();
  let cum = 0;
  return {
    total: row.total || 0, active: row.active || 0, wins: row.wins || 0, losses: row.losses || 0, cancelled: row.cancelled || 0,
    winRate: decided ? Number(((row.wins / decided) * 100).toFixed(1)) : null,
    avgResult: row.avg_result == null ? null : Number(row.avg_result.toFixed(2)),
    totalResult: Number((row.total_result || 0).toFixed(2)),
    best: row.best, worst: row.worst,
    curve: series.map((s) => ({ t: s.t, v: Number((cum += s.r).toFixed(2)) })),
  };
}

export const serializeSignal = (s) => s && ({
  id: s.id, pair: s.pair, direction: s.direction, entry: s.entry, stopLoss: s.stop_loss, tp1: s.tp1, tp2: s.tp2,
  timeframe: s.timeframe, risk: s.risk, notes: s.notes, imageUrl: s.image_path ? `/uploads/${s.image_path}` : null,
  status: s.status, resultPct: s.result_pct, resultPips: s.result_pips, isDemo: !!s.is_demo, author: s.author || null,
  createdAt: s.created_at, updatedAt: s.updated_at, closedAt: s.closed_at,
});

export { nowIso };
