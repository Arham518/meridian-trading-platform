import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtMoney, fmtSigned, fmtPct, fmtDate } from '../lib/format.js';
import { C } from '../lib/theme.js';
import { Skeleton } from './ui.jsx';

/** Paper equity over time: start balance + realised P&L of each closed trade, ending at the live equity. */
function useEquitySeries(p) {
  const hist = useFetch(() => api('/trading/history?pageSize=100'), [p?.closedCount]);
  return useMemo(() => {
    if (!p) return [];
    const rows = [...(hist.data?.rows || [])].filter((r) => r.closed_at).sort((a, b) => a.closed_at.localeCompare(b.closed_at));
    let v = p.startBalance; const out = [{ t: rows[0] ? new Date(new Date(rows[0].closed_at).getTime() - 3600e3).toISOString() : new Date(Date.now() - 86400e3).toISOString(), v }];
    for (const r of rows) { v += r.pnl || 0; out.push({ t: r.closed_at, v }); }
    out.push({ t: new Date().toISOString(), v: p.equity });
    return out;
  }, [hist.data, p]);
}

function AreaChart({ data, height = 150 }) {
  const ref = useRef(null); const [hover, setHover] = useState(null);
  const W = 600; const H = height;
  const { pts, line, area, min, max } = useMemo(() => {
    const vs = data.map((d) => d.v); let lo = Math.min(...vs); let hi = Math.max(...vs);
    if (hi - lo < 1) { lo -= 50; hi += 50; }
    const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    const p = data.map((d, i) => [(i / Math.max(data.length - 1, 1)) * W, H - ((d.v - lo) / (hi - lo)) * H]);
    const l = p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { pts: p, line: l, area: `${l} L${W} ${H} L0 ${H} Z`, min: lo, max: hi };
  }, [data, H]);
  void min; void max;
  const move = (e) => {
    const r = ref.current.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0; pts.forEach(([px], i) => { if (Math.abs(px - x) < Math.abs(pts[best][0] - x)) best = i; });
    setHover(best);
  };
  const up = data[data.length - 1].v >= data[0].v; const col = up ? C.accent : C.candleDown;
  const h = hover != null ? pts[hover] : null;
  return (
    <div className="relative" onMouseMove={move} onMouseLeave={() => setHover(null)}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height }} role="img" aria-label="Paper equity over time">
        <defs><linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.22" /><stop offset="100%" stopColor={col} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke={C.grid} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill="url(#eqfill)" />
        <path d={line} fill="none" stroke={col} strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {h && <line x1={h[0]} x2={h[0]} y1="0" y2={H} stroke={C.cross} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={{ left: `${(h[0] / W) * 100}%`, top: (h[1] / H) * height - 10 }}>
          <div className="rounded-lg bg-night text-white px-2.5 py-1.5 text-[0.875rem] shadow-lg whitespace-nowrap"><span className="num font-semibold">{fmtMoney(data[hover].v)}</span><span className="text-white/70 ml-2">{fmtDate(data[hover].t, 'dd MMM, HH:mm')}</span></div>
        </div>
      )}
      {h && <span className="pointer-events-none absolute size-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow" style={{ left: `${(h[0] / W) * 100}%`, top: (h[1] / H) * height, background: col }} />}
    </div>
  );
}

export default function EquityCard({ portfolio: p, loading }) {
  const series = useEquitySeries(p);
  const total = p ? p.equity - p.startBalance : 0; const pct = p ? (total / p.startBalance) * 100 : 0;
  return (
    <section className="glass p-5 sm:p-6 flex flex-col min-w-0" aria-label="Portfolio">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium text-mute">Paper portfolio balance</p>
          {loading && !p ? <Skeleton className="h-10 w-56 mt-2" /> : <p className="impact text-[2.6rem] sm:text-[3.1rem] mt-2">{fmtMoney(p?.equity)}</p>}
          {p && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={clsx('badge', total >= 0 ? 'badge-up' : 'badge-down')}>{total >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{fmtPct(pct)}</span>
              <span className="text-[0.875rem] text-mute num">{fmtSigned(total)} USD since start</span>
            </div>
          )}
        </div>
        <Link to="/app/trade" className="btn btn-primary btn-sm shrink-0">Trade<ArrowUpRight size={14} /></Link>
      </div>
      <div className="mt-4 -mx-1 flex-1 min-h-[150px] relative">{series.length > 1 ? <AreaChart data={series} /> : <Skeleton className="h-[150px]" />}
        {p && series.length > 1 && series.length < 3 && !p.closedCount && <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[0.9375rem] text-mute pointer-events-none"><span className="glass !rounded-full px-3 py-1.5 inline-block">Your equity curve starts with your first closed paper trade</span></p>}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-line">
        {[['Cash', fmtMoney(p?.balance), ''], ['Unrealised P&L', fmtSigned(p?.unrealized), p?.unrealized > 0 ? 'up' : p?.unrealized < 0 ? 'down' : ''], ['Realised P&L', fmtSigned(p?.realized), p?.realized > 0 ? 'up' : p?.realized < 0 ? 'down' : ''], ['Open / pending', p ? `${p.open.length} / ${p.pending.length}` : '--', '']].map(([k, v, t]) => (
          <div key={k} className="min-w-0"><dt className="text-[0.875rem] text-mute">{k}</dt><dd className={clsx('num text-[1rem] font-medium mt-0.5 truncate', t)}>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
