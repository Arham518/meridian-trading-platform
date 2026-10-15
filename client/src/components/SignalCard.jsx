import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, ImageIcon, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { DirBadge, StatusBadge, RiskBadge } from './ui.jsx';
import { pairLabel, fmtPrice, fmtPct, timeAgo } from '../lib/format.js';
import { useMarket } from '../store/market.js';

const Level = ({ label, value, tone, dec }) => (
  <div className="px-3 first:pl-0 min-w-0">
    <div className="label !text-[10px] truncate">{label}</div>
    <div className={clsx('num text-[0.9375rem] mt-0.5 truncate', tone)}>{value == null ? '--' : fmtPrice(value, dec)}</div>
  </div>
);

/** Live position of the price between stop loss and TP1 (active signals only). */
function Progress({ s }) {
  const q = useMarket((m) => m.quotes[s.pair]);
  if (!q || s.status !== 'active') return null;
  const buy = s.direction === 'BUY';
  const span = (s.tp1 - s.stopLoss) || 1;
  const pos = Math.min(Math.max((q.price - s.stopLoss) / span, 0), 1) * 100;
  const entryPos = Math.min(Math.max((s.entry - s.stopLoss) / span, 0), 1) * 100;
  const pl = ((q.price - s.entry) / s.entry) * 100 * (buy ? 1 : -1);
  return (
    <div className="mt-3.5">
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-mute">Live <b className="num text-ink font-medium">{fmtPrice(q.price, q.decimals)}</b></span>
        <span className={clsx('num', pl >= 0 ? 'up' : 'down')}>{fmtPct(pl)} vs entry</span>
      </div>
      <div className="relative h-[3px] bg-line-2">
        <span className="absolute inset-y-0 left-0 bg-down/50" style={{ width: `${entryPos}%` }} />
        <span className="absolute inset-y-0 right-0 bg-up/50" style={{ left: `${entryPos}%` }} />
        <motion.span className="absolute -top-[4px] w-[2px] h-[11px] -ml-px bg-ink" animate={{ left: `${pos}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
      <div className="flex justify-between text-[10px] text-dim mt-1.5 num"><span>SL</span><span>TP1</span></div>
    </div>
  );
}

export default memo(function SignalCard({ s, actions, onImage, fresh = false }) {
  const [open, setOpen] = useState(false);
  const buy = s.direction === 'BUY';
  const q = useMarket((m) => m.quotes[s.pair]);
  const dec = q?.decimals;
  const done = s.status !== 'active';
  return (
    <motion.article layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className={clsx('glass p-4 pl-5 relative overflow-hidden @container', fresh && '!border-accent/60')}>
      <span className={clsx('absolute left-0 top-0 bottom-0 w-[3px]', buy ? 'bg-up' : 'bg-down')} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base truncate">{pairLabel(s.pair)}</h3><DirBadge dir={s.direction} />{s.isDemo && <span className="badge badge-neutral">Demo</span>}
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-mute mt-1"><span className="num">{s.timeframe}</span><span aria-hidden>/</span><span className="inline-flex items-center gap-1"><Clock size={11} />{timeAgo(s.createdAt)}</span><span aria-hidden>/</span><RiskBadge risk={s.risk} /></div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={s.status} />
          {done && s.resultPct != null && <span className={clsx('num text-sm font-medium', s.resultPct >= 0 ? 'up' : 'down')}>{fmtPct(s.resultPct)}</span>}
          {done && s.resultPips != null && <span className="num text-[11px] text-mute">{s.resultPips > 0 ? '+' : ''}{s.resultPips} pips</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-y-3 mt-4 pt-3.5 border-t border-line @lg:divide-x divide-[color:var(--color-line)]">
        <Level label="Entry" value={s.entry} dec={dec} tone="text-ink" />
        <Level label="Stop loss" value={s.stopLoss} dec={dec} tone="down" />
        <Level label="Take profit 1" value={s.tp1} dec={dec} tone="up" />
        <Level label="Take profit 2" value={s.tp2} dec={dec} tone="up" />
      </div>
      <Progress s={s} />

      {(actions || s.imageUrl || s.notes) && (
        <div className="flex items-center justify-between gap-2 mt-3.5 flex-wrap">
          <div className="flex items-center gap-2">{s.imageUrl && <button className="btn btn-ghost btn-sm" onClick={() => onImage?.(s)}><ImageIcon size={13} />Chart</button>}</div>
          <div className="flex items-center gap-2">
            {actions}
            {s.notes && <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Analysis<ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} /></button>}
          </div>
        </div>
      )}
      {open && s.notes && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-sm text-mute leading-relaxed mt-3 pt-3 border-t border-line whitespace-pre-line">{s.notes}</motion.p>}
    </motion.article>
  );
});
