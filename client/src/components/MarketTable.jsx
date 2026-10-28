import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useMarket } from '../store/market.js';
import { pairLabel } from '../lib/format.js';
import { Price, Change } from './Price.jsx';
import Sparkline from './Sparkline.jsx';
import { Segmented, Skeleton, SimTag } from './ui.jsx';
import { useSparklines } from './Watchlist.jsx';

const TYPES = [{ value: '', label: 'All' }, { value: 'crypto', label: 'Crypto' }, { value: 'forex', label: 'Forex' }, { value: 'commodity', label: 'Gold' }, { value: 'index', label: 'Indices' }, { value: 'stock', label: 'Stocks' }];
const SORTS = { gainers: (a, b) => b.changePct - a.changePct, losers: (a, b) => a.changePct - b.changePct, default: null };
const ICON_BG = { crypto: 'bg-cream text-[#7a4a00]', forex: 'bg-sky text-[#1747b0]', commodity: 'bg-cream text-[#7a4a00]', index: 'bg-lav text-[#4b3aa8]', stock: 'bg-mint text-[#0a5a35]' };

export function AssetIcon({ symbol, type, size = 'size-9' }) {
  const t = pairLabel(symbol).replace('/USDT', '').replace('/', '').slice(0, 3);
  return <span className={clsx(size, 'rounded-xl grid place-items-center text-[0.8125rem] font-bold tracking-tight shrink-0', ICON_BG[type] || 'bg-raise text-ink')} aria-hidden>{t}</span>;
}

/** Market table: price, 24h change, 24h trend and a watch star. A row click selects the symbol (onSelect). */
export default function MarketTable({ onSelect, limit = 10 }) {
  const quotes = useMarket((s) => s.quotes); const order = useMarket((s) => s.order);
  const watch = useMarket((s) => s.watchlist); const toggle = useMarket((s) => s.toggleWatch);
  const spark = useSparklines();
  const [type, setType] = useState(''); const [sort, setSort] = useState('default');
  const list = useMemo(() => {
    let l = order.map((s) => quotes[s]).filter(Boolean);
    if (type) l = l.filter((q) => q.type === type);
    if (SORTS[sort]) l = [...l].sort(SORTS[sort]);
    return l;
  }, [quotes, order, type, sort]);
  const avg = list.length ? list.reduce((s, q) => s + (q.changePct || 0), 0) / list.length : 0;
  const star = async (e, sym) => { e.stopPropagation(); try { await toggle(sym); } catch (er) { toast.error(er.message); } };
  return (
    <section className="glass flex flex-col min-w-0" aria-label="Markets">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.02em]">Market is {avg >= 0 ? 'up' : 'down'} <span className={avg >= 0 ? 'up' : 'down'}>{Math.abs(avg).toFixed(2)}%</span></h2>
        <div className="flex items-center gap-2">
          <select className="input !h-8 !w-auto !text-[0.875rem] !rounded-lg" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort markets"><option value="default">Default order</option><option value="gainers">Top gainers</option><option value="losers">Top losers</option></select>
        </div>
      </header>
      <div className="px-4 sm:px-5 pb-2 overflow-x-auto"><Segmented size="sm" ariaLabel="Asset class" value={type} onChange={setType} options={TYPES} /></div>
      {!list.length ? <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div> : (
        <div className="overflow-x-auto">
          <table className="tbl [&_th]:!bg-transparent">
            <thead><tr><th className="!pl-4 sm:!pl-5">Name</th><th className="r">Price</th><th className="r hidden sm:table-cell">24h change</th><th className="r hidden md:table-cell">Trend</th><th className="r !pr-3 sm:!pr-5"><span className="sr-only sm:not-sr-only">Watch</span></th></tr></thead>
            <tbody>
              {list.slice(0, limit).map((q) => {
                const on = watch.includes(q.symbol);
                return (
                  <tr key={q.symbol} className="cursor-pointer" onClick={() => onSelect?.(q.symbol)}>
                    <td className="!pl-4 sm:!pl-5"><div className="flex items-center gap-2.5 sm:gap-3 min-w-0"><AssetIcon symbol={q.symbol} type={q.type} /><div className="min-w-0"><Link to={`/app/trade/${q.symbol}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-[1rem] hover:text-accent-2 flex items-center gap-1.5">{pairLabel(q.symbol)}{q.source === 'simulated' && <span className="hidden sm:inline"><SimTag /></span>}</Link><div className="text-[0.875rem] text-mute truncate max-w-[110px] sm:max-w-[160px]">{q.name}</div></div></div></td>
                    <td className="r"><Price value={q.price} decimals={q.decimals} className="text-[0.9375rem] font-medium block" /><Change pct={q.changePct} className="text-[0.875rem] font-medium sm:hidden" /></td>
                    <td className="r hidden sm:table-cell"><Change pct={q.changePct} className="text-[0.9375rem] font-medium" /></td>
                    <td className="r hidden md:table-cell"><div className="inline-block"><Sparkline data={spark[q.symbol]} width={88} height={26} up={q.changePct >= 0} /></div></td>
                    <td className="r !pr-3 sm:!pr-5"><button onClick={(e) => star(e, q.symbol)} className={clsx('p-1.5 rounded-lg hover:bg-ink/[0.05]', on ? 'text-[#d99a0b]' : 'text-dim')} aria-pressed={on} aria-label={on ? `Remove ${pairLabel(q.symbol)} from watchlist` : `Add ${pairLabel(q.symbol)} to watchlist`}><Star size={16} className={on ? 'fill-current' : ''} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 py-3 border-t border-line mt-auto"><Link to="/app/markets" className="link text-[0.9375rem]">All markets</Link></div>
    </section>
  );
}
