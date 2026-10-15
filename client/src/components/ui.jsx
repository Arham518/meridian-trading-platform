import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Inbox, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { STATUS_META } from '../lib/format.js';

export const Spinner = ({ className = '' }) => <Loader2 className={clsx('animate-spin', className)} size={16} aria-label="Loading" />;
export const Skeleton = ({ className = '' }) => <div className={clsx('skeleton', className)} aria-hidden />;

export function Card({ title, subtitle, actions, children, className = '', bodyClass = '', pad = true, ...rest }) {
  return (
    <section className={clsx('glass flex flex-col min-w-0', className)} {...rest}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line min-h-[44px]">
          <div className="min-w-0">
            <h2 className="text-[0.8125rem] font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-mute truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('flex-1 min-h-0', pad && 'p-4', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-[1.375rem] md:text-[1.625rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="text-sm text-mute mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-2">
      <div className="size-9 rounded-md border border-line-2 grid place-items-center text-mute"><Icon size={17} /></div>
      <p className="font-medium mt-1">{title}</p>
      {hint && <p className="text-sm text-mute max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center text-center py-10 px-6 gap-2">
      <div className="size-9 rounded-md border border-down/40 grid place-items-center text-down"><AlertTriangle size={17} /></div>
      <p className="font-medium mt-1">Could not load data</p>
      <p className="text-sm text-mute max-w-sm">{message}</p>
      {onRetry && <button className="btn btn-ghost btn-sm mt-2" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export const StatusBadge = ({ status }) => { const m = STATUS_META[status] || { label: status, cls: 'badge-neutral' }; return <span className={clsx('badge', m.cls)}>{m.label}</span>; };
export const DirBadge = ({ dir }) => <span className={clsx('badge', dir === 'BUY' ? 'badge-up' : 'badge-down')}>{dir}</span>;
export const RiskBadge = ({ risk }) => <span className={clsx('badge', risk === 'low' ? 'badge-up' : risk === 'high' ? 'badge-down' : 'badge-warn')}>{risk[0].toUpperCase() + risk.slice(1)} risk</span>;
export const SimTag = ({ title = 'Simulated market data' }) => <span title={title} className="badge badge-warn !h-[18px] !text-[10px]">SIM</span>;

/** One cell of a stat strip (parent has the .stats class: hairline-separated cells, no boxes). */
export function StatCard({ label, value, sub, tone, loading }) {
  return (
    <div className="bg-panel px-4 py-3 min-w-0">
      <span className="label block truncate">{label}</span>
      {loading ? <Skeleton className="h-6 w-24 mt-2" /> : <div className={clsx('num text-[1.25rem] sm:text-[1.5rem] font-medium mt-1 leading-tight truncate', tone)}>{value}</div>}
      {sub && <div className="text-[11px] text-mute mt-1 truncate">{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector('input,select,textarea,button')?.focus(), 50);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-end sm:place-items-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title}
            className={clsx('glass glass-strong relative w-full max-h-[92dvh] flex flex-col rounded-b-none sm:rounded-b-[8px]', width)}
            initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            <header className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="font-semibold">{title}</h2>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
            </header>
            <div className="p-5 overflow-y-auto">{children}</div>
            {footer && <footer className="px-5 py-4 border-t border-line flex justify-end gap-2">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Pagination({ page, pages, total, onPage, pageSize }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1; const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-xs text-mute">
      <span className="num">{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
        <span className="px-2 num">Page {page} / {pages}</span>
        <button className="btn btn-ghost btn-sm btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label block mb-1.5">{label}</span>}
      {children}
      {error ? <span className="text-xs text-down mt-1 block">{error}</span> : hint ? <span className="text-xs text-dim mt-1 block">{hint}</span> : null}
    </label>
  );
}

export function Segmented({ options, value, onChange, size = 'md', ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex gap-0.5 p-0.5 rounded-md bg-bg border border-line">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={clsx('tab', size === 'sm' && '!h-7 !px-2.5 !text-xs')}>{o.label}</button>
      ))}
    </div>
  );
}
