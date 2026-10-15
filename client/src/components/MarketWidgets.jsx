import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Newspaper } from 'lucide-react';
import clsx from 'clsx';
import { useMarket } from '../store/market.js';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { pairLabel, fmtPct, fmtPrice, timeAgo } from '../lib/format.js';
import { Price, Change } from './Price.jsx';
import { Skeleton, EmptyState, ErrorState, StatusBadge } from './ui.jsx';

export function useQuoteList() {
  const quotes = useMarket((s) => s.quotes); const order = useMarket((s) => s.order);
  return useMemo(() => order.map((s) => quotes[s]).filter(Boolean), [quotes, order]);
}

const tone = (p) => {
  const a = Math.min(Math.abs(p) / 4, 1);
  return p >= 0 ? `rgba(47,191,133,${0.14 + a * 0.5})` : `rgba(236,85,96,${0.14 + a * 0.5})`;
};

/** Market overview heat-map: tile colour = 24h change. */
export const Heatmap = memo(function Heatmap() {
  const list = useQuoteList();
  if (!list.length) return <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  return (
    <div className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(84px,1fr))]">
      {list.map((q) => (
        <Link key={q.symbol} to={`/app/trade/${q.symbol}`} className="rounded-[3px] px-2.5 py-2 transition-[filter] hover:brightness-125"
          style={{ background: tone(q.changePct) }} title={`${q.name}: ${fmtPct(q.changePct)}`}>
          <div className="text-[12px] font-semibold truncate">{pairLabel(q.symbol).replace('/USDT', '')}</div>
          <div className="num text-[12px] text-ink/90 mt-0.5">{fmtPct(q.changePct, 2)}</div>
        </Link>
      ))}
    </div>
  );
});

export function Movers() {
  const list = useQuoteList();
  const sorted = useMemo(() => [...list].sort((a, b) => b.changePct - a.changePct), [list]);
  const g = sorted.slice(0, 4); const l = sorted.slice(-4).reverse();
  const Col = ({ title, items, up }) => (
    <div className="min-w-0">
      <div className="label mb-1.5">{title}</div>
      {items.map((q) => (
        <Link key={q.symbol} to={`/app/trade/${q.symbol}`} className="flex items-center justify-between gap-2 py-1.5 border-b border-line last:border-0 hover:bg-white/[0.03]">
          <span className="text-[13px] font-medium truncate">{pairLabel(q.symbol)}</span>
          <Change pct={q.changePct} className="text-[12px] text-right" />
        </Link>
      ))}
    </div>
  );
  if (!list.length) return <Skeleton className="h-32" />;
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4"><Col title="Top gainers" items={g} up /><Col title="Top losers" items={l} /></div>;
}

export function NewsList({ limit = 6 }) {
  const { data, loading, error, reload } = useFetch(() => api('/market/news'), []);
  if (loading && !data) return <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.items?.length) return <EmptyState title="No headlines" icon={Newspaper} />;
  return (
    <div>
      <ul>
        {data.items.slice(0, limit).map((n, i) => (
          <li key={i} className="border-b border-line/60 last:border-0">
            {n.link && n.link !== '#' ? (
              <a href={n.link} target="_blank" rel="noopener noreferrer" className="flex gap-3 px-4 py-3 hover:bg-white/[0.04] group">
                <div className="min-w-0 flex-1"><p className="text-[13.5px] leading-snug group-hover:text-accent-2 transition-colors">{n.title}</p><p className="text-[11px] text-dim mt-1">{n.source}{n.time ? ` · ${timeAgo(n.time)}` : ''}</p></div>
                <ArrowUpRight size={14} className="text-dim shrink-0 mt-0.5" />
              </a>
            ) : (
              <div className="px-4 py-3"><p className="text-[13.5px] leading-snug">{n.title}</p><p className="text-[11px] text-dim mt-1">{n.source}</p></div>
            )}
          </li>
        ))}
      </ul>
      {data.source === 'sample' && <p className="px-4 py-2.5 text-[11px] text-warn border-t border-line">Live news feed unreachable. Showing sample headlines.</p>}
    </div>
  );
}

/** Compact signal list for dashboards: one hairline row per signal. */
export function SignalRows({ rows = [] }) {
  return (
    <ul>
      {rows.map((s) => (
        <li key={s.id} className="border-b border-line last:border-0">
          <Link to="/app/signals" className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3.5 py-2.5 hover:bg-white/[0.03]">
            <span className={clsx('num text-[11px] font-semibold', s.direction === 'BUY' ? 'up' : 'down')}>{s.direction}</span>
            <span className="min-w-0"><span className="text-[13px] font-medium block truncate">{pairLabel(s.pair)}<span className="text-dim font-normal num"> {s.timeframe}</span></span>
              <span className="text-[11px] text-mute num block truncate">E {fmtPrice(s.entry)}  SL {fmtPrice(s.stopLoss)}  TP {fmtPrice(s.tp1)}</span></span>
            <StatusBadge status={s.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
