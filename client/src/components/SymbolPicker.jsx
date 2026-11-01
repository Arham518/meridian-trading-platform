import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import { useMarket } from '../store/market.js';
import { pairLabel } from '../lib/format.js';
import { useSymbolSearch } from '../lib/useSymbolSearch.js';
import { Price, Change } from './Price.jsx';
import { FeedTag } from './ui.jsx';

export default function SymbolPicker({ value, onChange }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const quotes = useMarket((s) => s.quotes); const order = useMarket((s) => s.order); const watch = useMarket((s) => s.watchlist);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const found = useSymbolSearch(q, { limit: 50, enabled: open });
  const core = useMemo(() => order.map((s) => quotes[s]).filter(Boolean), [order, quotes]);
  const list = found.searching ? found.results : core;
  const cur = quotes[value];
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost !h-10 gap-2 pr-2.5" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="font-semibold">{pairLabel(value)}</span>
        <FeedTag q={cur} />
        <ChevronDown size={15} className={clsx('text-mute transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-[min(340px,calc(100vw-2rem))] glass glass-strong glass-pop p-2 left-0" role="listbox">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input autoFocus className="input !pl-8 !h-9" placeholder="Search 600+ markets: BTC, EUR/JPY, gold, Apple" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search symbols" />
          </div>
          <ul className="max-h-80 overflow-y-auto overscroll-contain">
            {list.map((x) => (
              <li key={x.symbol}>
                <button role="option" aria-selected={x.symbol === value} onClick={() => { onChange(x.symbol); setOpen(false); setQ(''); }}
                  className={clsx('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-ink/[0.05]', x.symbol === value && 'bg-ink/[0.06]')}>
                  {watch.includes(x.symbol) && <Star size={12} className="text-warn fill-warn shrink-0" />}
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{pairLabel(x.symbol)}</span><span className="block text-[0.8125rem] text-mute truncate">{x.name} <span className="capitalize text-dim">· {x.type}</span> <FeedTag q={x} /></span></span>
                  <span className="text-right"><Price value={x.price} decimals={x.decimals} className="block text-[0.9375rem]" /><Change pct={x.changePct} className="text-[0.8125rem]" /></span>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-3 py-6 text-center text-sm text-mute">{found.loading ? 'Searching…' : 'No matching symbols'}</li>}
            {found.total > list.length && <li className="px-3 py-2 text-center text-[0.8125rem] text-dim">Showing {list.length} of {found.total}. Keep typing to narrow it down.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
