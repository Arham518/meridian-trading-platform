import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import ExcelButton from '../components/ExcelButton.jsx';
import { Card, PageHeader, Segmented, DirBadge, StatusBadge } from '../components/ui.jsx';
import { useRecords } from '../lib/useRecords.js';
import { useMarket } from '../store/market.js';
import { fmtDate, fmtPrice, fmtSigned, pairLabel } from '../lib/format.js';

const pnl = (v) => (v == null ? <span className="text-dim">—</span> : <span className={`num font-medium ${v > 0 ? 'up' : v < 0 ? 'down' : 'text-mute'}`}>{fmtSigned(v)}</span>);
const px = (c) => <span className="num">{c.getValue() == null ? '—' : fmtPrice(c.getValue())}</span>;
const R = { right: true };

export const TRADE_COLS = [
  { header: 'Opened', accessorKey: 'opened_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
  { header: 'Symbol', accessorKey: 'symbol', cell: (c) => <span className="font-medium">{pairLabel(c.getValue())}</span> },
  { header: 'Side', accessorKey: 'side', cell: (c) => <DirBadge dir={c.getValue()} /> },
  { header: 'Qty', accessorKey: 'qty', meta: R, cell: (c) => <span className="num">{c.getValue()}</span> },
  { header: 'Entry', accessorKey: 'entry_price', meta: R, cell: px },
  { header: 'Exit', accessorKey: 'close_price', meta: R, cell: px },
  { header: 'Closed by', accessorKey: 'close_reason', cell: (c) => <span className="text-mute capitalize">{(c.getValue() || 'open').replace('_', ' ')}</span> },
  { header: 'Closed', accessorKey: 'closed_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
  { header: 'P&L (USD)', accessorKey: 'pnl', meta: R, cell: (c) => pnl(c.getValue()) },
];
const ORDER_COLS = [
  { header: 'Created', accessorKey: 'created_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
  { header: 'Symbol', accessorKey: 'symbol', cell: (c) => <span className="font-medium">{pairLabel(c.getValue())}</span> },
  { header: 'Side', accessorKey: 'side', cell: (c) => <DirBadge dir={c.getValue()} /> },
  { header: 'Type', accessorKey: 'type', cell: (c) => <span className="capitalize text-mute">{c.getValue()}</span> },
  { header: 'Qty', accessorKey: 'qty', meta: R, cell: (c) => <span className="num">{c.getValue()}</span> },
  { header: 'Limit', accessorKey: 'limit_price', meta: R, cell: px },
  { header: 'Fill price', accessorKey: 'fill_price', meta: R, cell: px },
  { header: 'Status', accessorKey: 'status', cell: (c) => <span className={`badge ${c.getValue() === 'filled' ? 'badge-up' : c.getValue() === 'pending' ? 'badge-accent' : 'badge-neutral'}`}>{c.getValue()}</span> },
];
const ACT_COLS = [
  { header: 'Time', accessorKey: 'created_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm:ss')}</span> },
  { header: 'Event', accessorKey: 'event', cell: (c) => <span className="capitalize">{c.getValue().replace('_', ' ')}</span> },
  { header: 'Result', accessorKey: 'success', cell: (c) => <span className={`badge ${c.getValue() ? 'badge-up' : 'badge-down'}`}>{c.getValue() ? 'Success' : 'Failed'}</span> },
  { header: 'IP', accessorKey: 'ip', cell: (c) => <span className="num text-mute">{c.getValue() || '—'}</span> },
  { header: 'Browser', accessorKey: 'user_agent', cell: (c) => <span className="text-mute truncate inline-block max-w-[260px] align-bottom">{c.getValue() || '—'}</span> },
];

const TABS = {
  trades: { label: 'Trade history', path: '/trading/history', exp: 'trades', cols: TRADE_COLS, fields: [
    { key: 'q', type: 'search', label: 'Search symbol' }, { key: 'side', type: 'select', label: 'Buy & sell', options: [['BUY', 'Buy'], ['SELL', 'Sell']] },
    { key: 'result', type: 'select', label: 'Win & loss', options: [['win', 'Winners'], ['loss', 'Losers']] }, { key: 'from', type: 'date', label: 'From' }, { key: 'to', type: 'date', label: 'To' }] },
  orders: { label: 'Orders', path: '/trading/orders', exp: 'orders', cols: ORDER_COLS, fields: [
    { key: 'q', type: 'search', label: 'Search symbol' }, { key: 'status', type: 'select', label: 'All statuses', options: [['pending', 'Pending'], ['filled', 'Filled'], ['cancelled', 'Cancelled']] }, { key: 'from', type: 'date', label: 'From' }, { key: 'to', type: 'date', label: 'To' }] },
  activity: { label: 'Sign-in activity', path: '/auth/activity', exp: 'activity', cols: ACT_COLS, fields: [
    { key: 'q', type: 'search', label: 'Search IP' }, { key: 'event', type: 'select', label: 'All events', options: [['login', 'Login'], ['logout', 'Logout'], ['register', 'Register'], ['password_change', 'Password change']] },
    { key: 'success', type: 'select', label: 'Any result', options: [['1', 'Success'], ['0', 'Failed']] }] },
};

function Tab({ k }) {
  const t = TABS[k]; const tick = useMarket((s) => s.tradeTick);
  const r = useRecords(t.path, {}, { refreshKey: tick });
  return (
    <Card pad={false} title={`${t.label} (${r.total})`} actions={<ExcelButton path={`/export/${t.exp}${r.exportQuery}`} label="Download Excel" />}>
      <FilterBar key={k} fields={t.fields} values={r.filters} onChange={r.patch} onReset={r.reset} />
      <DataTable columns={t.cols} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={800}
        emptyTitle="No records found" emptyHint="Records appear here as soon as you place paper trades or change the filters." />
    </Card>
  );
}

export default function Records() {
  const [tab, setTab] = useState('trades');
  return (
    <div>
      <PageHeader title="My records" subtitle="Your paper-trading journal, orders and sign-in activity, stored permanently and exportable."
        actions={<ExcelButton path="/export/my" label="Download everything (.xlsx)" small={false} ghost={false} />} />
      <div className="mb-4 overflow-x-auto"><Segmented ariaLabel="Record type" value={tab} onChange={setTab} options={Object.entries(TABS).map(([value, t]) => ({ value, label: t.label }))} /></div>
      <Tab key={tab} k={tab} />
      <p className="text-xs text-dim mt-3 flex items-center gap-1.5"><FileSpreadsheet size={13} />Excel files include formatted headers, filters and green/red profit &amp; loss formatting.</p>
    </div>
  );
}
