import { DirBadge, StatusBadge } from './ui.jsx';
import { fmtDate, fmtPct, fmtPrice, pairLabel } from '../lib/format.js';

/** Column definitions for signal tables (history + admin). `extra` is appended (e.g. action buttons). */
export function signalColumns(extra = []) {
  return [
    { header: 'Date', accessorKey: 'createdAt', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: 'Pair', accessorKey: 'pair', cell: (c) => <span className="font-medium">{pairLabel(c.getValue())}{c.row.original.isDemo && <span className="badge badge-neutral ml-2">Demo</span>}</span> },
    { header: 'Side', accessorKey: 'direction', cell: (c) => <DirBadge dir={c.getValue()} /> },
    { header: 'TF', accessorKey: 'timeframe', cell: (c) => <span className="num text-mute">{c.getValue()}</span> },
    { header: 'Entry', accessorKey: 'entry', meta: { right: true }, cell: (c) => <span className="num">{fmtPrice(c.getValue())}</span> },
    { header: 'SL', accessorKey: 'stopLoss', meta: { right: true }, cell: (c) => <span className="num down">{fmtPrice(c.getValue())}</span> },
    { header: 'TP1', accessorKey: 'tp1', meta: { right: true }, cell: (c) => <span className="num up">{fmtPrice(c.getValue())}</span> },
    { header: 'TP2', accessorKey: 'tp2', meta: { right: true }, cell: (c) => <span className="num up">{c.getValue() ? fmtPrice(c.getValue()) : '—'}</span> },
    { header: 'Status', accessorKey: 'status', cell: (c) => <StatusBadge status={c.getValue()} /> },
    { header: 'Result', accessorKey: 'resultPct', meta: { right: true }, cell: (c) => { const v = c.getValue(); return v == null ? <span className="text-dim">—</span> : <span className={`num font-medium ${v >= 0 ? 'up' : 'down'}`}>{fmtPct(v)}</span>; } },
    ...extra,
  ];
}
