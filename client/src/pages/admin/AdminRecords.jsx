import { useMemo, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import FilterBar from '../../components/FilterBar.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { Card, PageHeader, Segmented, DirBadge, StatusBadge } from '../../components/ui.jsx';
import { useRecords } from '../../lib/useRecords.js';
import { fmtDate, fmtPrice, fmtSigned, fmtPct, fmtMoney } from '../../lib/format.js';

const TYPES = [['signals', 'Signals'], ['trades', 'Trades'], ['orders', 'Orders'], ['users', 'Users'], ['watchlists', 'Watchlists'], ['activity', 'Logins & activity']];
const cell = (col) => (c) => {
  const v = c.getValue();
  if (v === null || v === undefined || v === '') return <span className="text-dim">—</span>;
  switch (col.type) {
    case 'datetime': return <span className="text-mute">{fmtDate(v, 'dd MMM yy, HH:mm')}</span>;
    case 'price': return <span className="num">{fmtPrice(v)}</span>;
    case 'money': return <span className="num">{fmtMoney(v)}</span>;
    case 'qty': case 'int': return <span className="num">{v}</span>;
    case 'pnl': return <span className={`num font-medium ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{fmtSigned(v)}</span>;
    case 'pct': return <span className={`num font-medium ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{fmtPct(v)}</span>;
    case 'direction': return <DirBadge dir={v} />;
    case 'status': return ['active', 'hit_tp1', 'hit_tp2', 'hit_sl', 'cancelled'].includes(v) ? <StatusBadge status={v} /> : <span className={`badge ${v === 'active' || v === 'filled' ? 'badge-up' : v === 'disabled' ? 'badge-down' : 'badge-neutral'}`}>{v}</span>;
    case 'bool': return <span className={`badge ${v ? 'badge-up' : 'badge-neutral'}`}>{v ? 'Yes' : 'No'}</span>;
    default: return <span className={col.key === 'notes' || col.key === 'user_agent' ? 'text-mute truncate inline-block max-w-[280px] align-bottom' : ''}>{String(v)}</span>;
  }
};
const baseFields = (t) => [
  { key: 'q', type: 'search', label: t === 'users' ? 'Search name or email' : t === 'activity' ? 'Search email or IP' : 'Search…' },
  ...(t === 'signals' ? [{ key: 'status', type: 'select', label: 'All statuses', options: [['active', 'Active'], ['hit_tp1', 'TP1 hit'], ['hit_tp2', 'TP2 hit'], ['hit_sl', 'Stopped'], ['cancelled', 'Cancelled']] }] : []),
  ...(t === 'trades' ? [{ key: 'status', type: 'select', label: 'Open & closed', options: [['open', 'Open'], ['closed', 'Closed']] }, { key: 'result', type: 'select', label: 'Win & loss', options: [['win', 'Winners'], ['loss', 'Losers']] }] : []),
  ...(t === 'activity' ? [{ key: 'success', type: 'select', label: 'Any result', options: [['1', 'Success'], ['0', 'Failed']] }] : []),
  ...(t !== 'watchlists' ? [{ key: 'from', type: 'date', label: 'From' }, { key: 'to', type: 'date', label: 'To' }] : []),
];

function Table({ type }) {
  const r = useRecords(`/admin/records/${type}`, {});
  const cols = useMemo(() => (r.columns || []).map((c) => ({ header: c.header, accessorKey: c.key, meta: { right: ['price', 'money', 'qty', 'pnl', 'pct', 'int'].includes(c.type) }, cell: cell(c) })), [r.columns]);
  return (
    <Card pad={false} title={`${TYPES.find(([k]) => k === type)[1]} (${r.total})`} actions={<ExcelButton path={`/export/${type}${r.exportQuery ? `${r.exportQuery}&scope=all` : '?scope=all'}`} />}>
      <FilterBar key={type} fields={baseFields(type)} values={r.filters} onChange={r.patch} onReset={r.reset} />
      <DataTable columns={cols} data={r.rows} loading={r.loading || !r.columns} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={900} emptyTitle="No records match" emptyHint="Change or clear the filters." />
    </Card>
  );
}

export default function AdminRecords() {
  const [t, setT] = useState('signals');
  return (
    <div>
      <PageHeader title="All records" subtitle="Browse everything stored in the database. Every list exports to Excel, and the master workbook is kept up to date automatically." />
      <div className="mb-4 overflow-x-auto"><Segmented ariaLabel="Record type" value={t} onChange={setT} options={TYPES.map(([value, label]) => ({ value, label }))} /></div>
      <Table key={t} type={t} />
    </div>
  );
}
