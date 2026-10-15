import { Trophy, TrendingUp, Target, ShieldAlert } from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import ExcelButton from '../components/ExcelButton.jsx';
import CurveChart from '../components/CurveChart.jsx';
import { Card, StatCard, PageHeader } from '../components/ui.jsx';
import { signalColumns } from '../components/SignalColumns.jsx';
import { useRecords } from '../lib/useRecords.js';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { VerifyGate } from '../components/authKit.jsx';
import { useAuth } from '../store/auth.js';
import { useMarket } from '../store/market.js';
import { fmtPct } from '../lib/format.js';

const FIELDS = [
  { key: 'q', type: 'search', label: 'Search pair or notes' },
  { key: 'status', type: 'select', label: 'All statuses', options: [['active', 'Active'], ['hit_tp1', 'TP1 hit'], ['hit_tp2', 'TP2 hit'], ['hit_sl', 'Stopped out'], ['cancelled', 'Cancelled']] },
  { key: 'direction', type: 'select', label: 'Buy & sell', options: [['BUY', 'Buy'], ['SELL', 'Sell']] },
  { key: 'from', type: 'date', label: 'From' }, { key: 'to', type: 'date', label: 'To' },
];
const COLS = signalColumns();

function SignalHistoryInner() {
  const tick = useMarket((s) => s.signalTick);
  const r = useRecords('/signals', {}, { refreshKey: tick });
  const stats = useFetch(() => api('/signals/stats'), [tick]); const s = stats.data;
  return (
    <div>
      <PageHeader title="Signal history" subtitle="Every signal ever published, with outcome and result. Filter, search and export to Excel." actions={<ExcelButton path={`/export/signals${r.exportQuery}`} label="Download Excel" />} />
      <div className="grid grid-cols-2 xl:grid-cols-4 stats mb-4">
        <StatCard label="Win rate" icon={Trophy} tone="up" loading={stats.loading && !s} value={s?.winRate != null ? `${s.winRate}%` : '—'} sub={s && `${s.wins} of ${s.wins + s.losses} decided`} />
        <StatCard label="Total result" icon={TrendingUp} loading={stats.loading && !s} value={fmtPct(s?.totalResult)} tone={s?.totalResult >= 0 ? 'up' : 'down'} sub="Cumulative, closed signals" />
        <StatCard label="Best signal" icon={Target} tone="up" loading={stats.loading && !s} value={fmtPct(s?.best)} sub="Highest single result" />
        <StatCard label="Worst signal" icon={ShieldAlert} tone="down" loading={stats.loading && !s} value={fmtPct(s?.worst)} sub="Largest single loss" />
      </div>
      <div className="space-y-4">
        <Card title="Cumulative result" subtitle="Sum of closed signal results (%)"><CurveChart data={s?.curve || []} height={170} /></Card>
        <Card pad={false} title={`Records (${r.total})`}>
          <FilterBar fields={FIELDS} values={r.filters} onChange={r.patch} onReset={r.reset} />
          <DataTable columns={COLS} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={880}
            emptyTitle="No signals match your filters" emptyHint="Adjust the filters or clear them to see every record." />
        </Card>
      </div>
    </div>
  );
}

export default function SignalHistory() {
  const user = useAuth((s) => s.user);
  if (!user.emailVerified && user.role !== 'admin') return <VerifyGate />;
  return <SignalHistoryInner />;
}
