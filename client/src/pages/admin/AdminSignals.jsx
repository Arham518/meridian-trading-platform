import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import FilterBar from '../../components/FilterBar.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { Card, PageHeader, Modal, Spinner } from '../../components/ui.jsx';
import { signalColumns } from '../../components/SignalColumns.jsx';
import SignalForm from './SignalForm.jsx';
import { useRecords } from '../../lib/useRecords.js';
import { api } from '../../lib/api.js';
import { useMarket } from '../../store/market.js';
import { pairLabel } from '../../lib/format.js';

const FIELDS = [
  { key: 'q', type: 'search', label: 'Search pair or notes' },
  { key: 'status', type: 'select', label: 'All statuses', options: [['active', 'Active'], ['hit_tp1', 'TP1 hit'], ['hit_tp2', 'TP2 hit'], ['hit_sl', 'Stopped out'], ['cancelled', 'Cancelled']] },
  { key: 'direction', type: 'select', label: 'Buy & sell', options: [['BUY', 'Buy'], ['SELL', 'Sell']] },
];

export default function AdminSignals() {
  const tick = useMarket((s) => s.signalTick);
  const r = useRecords('/signals', {}, { refreshKey: tick });
  const [form, setForm] = useState({ open: false, signal: null }); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false);

  const setStatus = async (s, status) => {
    if (!status) return;
    try { await api(`/signals/${s.id}/close`, { method: 'POST', body: { status } }); toast.success(status === 'active' ? 'Signal re-opened' : 'Signal updated'); r.refresh(); } catch (e) { toast.error(e.message); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/signals/${del.id}`, { method: 'DELETE' }); toast.success('Signal deleted'); setDel(null); r.refresh(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const cols = signalColumns([{ header: 'Actions', id: 'actions', meta: { right: true }, cell: (c) => {
    const s = c.row.original;
    return (
      <div className="flex items-center justify-end gap-1.5">
        <select className="input !h-8 !w-[112px] !text-xs" value="" onChange={(e) => setStatus(s, e.target.value)} aria-label={`Set status for signal ${s.id}`}>
          <option value="">Set status…</option>
          {s.status !== 'active' && <option value="active">Re-open</option>}
          <option value="hit_tp1">TP1 hit</option>{s.tp2 && <option value="hit_tp2">TP2 hit</option>}<option value="hit_sl">Stopped out</option><option value="cancelled">Cancel</option>
        </select>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setForm({ open: true, signal: s })} aria-label={`Edit signal ${s.id}`} title="Edit"><Pencil size={14} /></button>
        <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDel(s)} aria-label={`Delete signal ${s.id}`} title="Delete"><Trash2 size={14} /></button>
      </div>
    );
  } }]);
  return (
    <div>
      <PageHeader title="Manage signals" subtitle="Publish, edit, close or delete signals. Members are notified in real time when you publish."
        actions={<><ExcelButton path={`/export/signals${r.exportQuery}`} /><button className="btn btn-primary btn-sm" onClick={() => setForm({ open: true, signal: null })}><Plus size={15} />New signal</button></>} />
      <Card pad={false} title={`All signals (${r.total})`}>
        <FilterBar fields={FIELDS} values={r.filters} onChange={r.patch} onReset={r.reset} />
        <DataTable columns={cols} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={1040}
          emptyTitle="No signals yet" emptyHint="Publish your first signal with the New signal button." />
      </Card>
      <SignalForm open={form.open} signal={form.signal} onClose={() => setForm({ open: false, signal: null })} onSaved={(s, edit) => { toast.success(edit ? 'Signal updated' : `Signal published: ${s.direction} ${pairLabel(s.pair)}`); r.refresh(); }} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete signal?" width="max-w-md" footer={<><button className="btn btn-ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn btn-down" onClick={remove} disabled={busy}>{busy ? <Spinner /> : 'Delete permanently'}</button></>}>
        <p className="text-sm text-mute">This removes <b className="text-ink">{del && `${del.direction} ${pairLabel(del.pair)}`}</b> from the database, the history and the master Excel file. This cannot be undone. To keep the record, mark it as Cancelled instead.</p>
      </Modal>
    </div>
  );
}
