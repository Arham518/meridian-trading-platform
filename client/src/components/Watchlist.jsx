import { memo, useEffect, useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useMarket } from '../store/market.js';
import { api } from '../lib/api.js';
import { pairLabel } from '../lib/format.js';
import { Price, Change } from './Price.jsx';
import Sparkline from './Sparkline.jsx';
import { EmptyState, SimTag } from './ui.jsx';

let sparkCache = null;
export function useSparklines() {
  const [s, setS] = useState(sparkCache || {});
  useEffect(() => { if (!sparkCache) api('/market/sparklines').then((d) => { sparkCache = d.sparklines; setS(d.sparklines); }).catch(() => {}); }, []);
  return s;
}

const Row = memo(function Row({ symbol, active, onSelect, onRemove, spark }) {
  const q = useMarket((s) => s.quotes[symbol]);
  if (!q) return null;
  return (
    <li className={clsx('group flex items-center gap-2 px-3 py-2 border-b border-line last:border-0 cursor-pointer transition-colors hover:bg-ink/[0.03]', active && 'bg-ink/[0.05] shadow-[inset_2px_0_0_var(--color-accent)]')} onClick={() => onSelect?.(symbol)}>
      <button className="p-1 -ml-1 text-accent" onClick={(e) => { e.stopPropagation(); onRemove(symbol); }} aria-label={`Remove ${symbol} from watchlist`} title="Remove from watchlist"><Star size={13} className="fill-accent" /></button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">{pairLabel(symbol)}{q.source === 'simulated' && <SimTag />}</div>
        <div className="text-[11px] text-dim truncate">{q.name}</div>
      </div>
      <div className="hidden sm:block"><Sparkline data={spark} width={64} height={24} up={q.changePct >= 0} /></div>
      <div className="text-right w-[92px] shrink-0">
        <Price value={q.price} decimals={q.decimals} className="block text-[13px]" />
        <Change pct={q.changePct} className="text-[11px]" />
      </div>
    </li>
  );
});

export default function Watchlist({ activeSymbol, onSelect, max }) {
  const watch = useMarket((s) => s.watchlist); const order = useMarket((s) => s.order); const toggle = useMarket((s) => s.toggleWatch);
  const spark = useSparklines(); const [adding, setAdding] = useState(false);
  const addable = order.filter((s) => !watch.includes(s));
  const remove = async (sym) => { try { await toggle(sym); } catch (e) { toast.error(e.message); } };
  const add = async (sym) => { if (!sym) return; setAdding(false); try { await toggle(sym); toast.success(`${pairLabel(sym)} added to watchlist`); } catch (e) { toast.error(e.message); } };
  const shown = max ? watch.slice(0, max) : watch;
  return (
    <div>
      {adding && (
        <div className="p-2 border-b border-line flex gap-2">
          <select className="input !h-9" autoFocus defaultValue="" onChange={(e) => add(e.target.value)} aria-label="Add symbol to watchlist">
            <option value="" disabled>Choose a symbol…</option>
            {addable.map((s) => <option key={s} value={s}>{pairLabel(s)}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm btn-icon !h-9" onClick={() => setAdding(false)} aria-label="Cancel"><X size={15} /></button>
        </div>
      )}
      {!adding && addable.length > 0 && (
        <button className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] text-mute hover:text-ink hover:bg-ink/[0.03] border-b border-line" onClick={() => setAdding(true)}><Plus size={13} />Add symbol</button>
      )}
      {shown.length === 0 ? <EmptyState title="Your watchlist is empty" hint="Add symbols to track them here. Saved to your account." icon={Star} /> : (
        <ul>{shown.map((s) => <Row key={s} symbol={s} active={s === activeSymbol} onSelect={onSelect} onRemove={remove} spark={spark[s]} />)}</ul>
      )}
    </div>
  );
}
