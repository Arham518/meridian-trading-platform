import { ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { useSettings } from '../store/settings.js';

/** Admin-managed advertisement unit. Always labelled; renders nothing when no ad is enabled for the slot. */
export default function AdSlot({ slot, className = '', variant = 'strip' }) {
  const ads = useSettings((s) => s.ads).filter((a) => a.slot === slot);
  if (!ads.length) return null;
  const a = ads[0];
  return (
    <aside aria-label="Advertisement" className={clsx('border border-line-2 rounded-md', variant === 'strip' ? 'px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2' : 'p-4', className)} data-testid={`ad-${slot}`}>
      <span className="label !text-[10px] !text-dim border border-line-2 rounded-[2px] px-1.5 py-0.5 shrink-0">Advertisement</span>
      <div className="min-w-0 flex-1"><p className="text-[13.5px] font-medium">{a.title}</p>{a.text && <p className="text-[12.5px] text-mute mt-0.5">{a.text}</p>}</div>
      <a href={a.url} target="_blank" rel="sponsored noopener noreferrer" className="btn btn-ghost btn-sm shrink-0">{a.cta}<ArrowUpRight size={13} /></a>
    </aside>
  );
}
