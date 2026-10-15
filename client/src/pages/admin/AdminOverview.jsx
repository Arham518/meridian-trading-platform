import { useEffect } from 'react';
import { Users, Radio, Trophy, Layers, LogIn, Wifi, FileSpreadsheet, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, StatCard, PageHeader, ErrorState, Skeleton, EmptyState } from '../../components/ui.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { useFetch } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useMarket } from '../../store/market.js';
import { fmtDate, fmtSigned, fmtPct, timeAgo } from '../../lib/format.js';

const SMETA = { active: ['Active', '#d9a441'], hit_tp1: ['TP1 hit', '#2fbf85'], hit_tp2: ['TP2 hit', '#2fbf85'], hit_sl: ['Stopped out', '#ec5560'], cancelled: ['Cancelled', '#6f6d65'] };

export default function AdminOverview() {
  const tick = useMarket((s) => s.signalTick);
  const { data: d, loading, error, reload } = useFetch(() => api('/admin/stats'), [tick]);
  const info = useFetch(() => api('/export/master/info'), [tick]);
  const m = info.data;
  useEffect(() => { if (!m?.pending) return undefined; const t = setTimeout(() => info.refresh(), 2500); return () => clearTimeout(t); });
  const days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10); return { d: dt, n: d?.signups.find((x) => x.d === dt)?.n || 0 }; });
  const max = Math.max(1, ...days.map((s) => s.n));
  const totalSig = (d?.byStatus || []).reduce((s, x) => s + x.n, 0) || 1;
  if (error && !d) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="Admin overview" subtitle="Platform health, signal performance and data exports." actions={<Link to="/admin/signals" className="btn btn-primary btn-sm"><Radio size={14} />Manage signals</Link>} />
      <div className="grid grid-cols-2 xl:grid-cols-6 stats">
        <StatCard label="Users" icon={Users} loading={loading && !d} value={d?.users.n} sub={d && `${d.users.active} active · +${d.newUsers7d} this week`} />
        <StatCard label="Active signals" icon={Radio} loading={loading && !d} value={d?.signals.active} sub={d && `${d.signals.total} total`} />
        <StatCard label="Win rate" icon={Trophy} tone="up" loading={loading && !d} value={d?.signals.winRate != null ? `${d.signals.winRate}%` : '—'} sub={d && `${d.signals.wins}W · ${d.signals.losses}L`} />
        <StatCard label="Paper trades" icon={Layers} loading={loading && !d} value={d?.trades.n} sub={d && `${d.trades.open || 0} open · P&L ${fmtSigned(d.trades.pnl)}`} />
        <StatCard label="Logins (24h)" icon={LogIn} loading={loading && !d} value={d?.logins24h} sub={d && `${d.failedLogins24h} failed`} />
        <StatCard label="Online now" icon={Wifi} loading={loading && !d} value={d?.online} sub="Live connections" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title="New sign-ups" subtitle="Last 14 days">
          {!d ? <Skeleton className="h-40" /> : (
            <div className="flex items-end gap-1 h-40" role="img" aria-label="Sign-ups per day">
              {days.map((s) => <div key={s.d} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${s.d}: ${s.n}`}><span className="num text-[10px] text-mute h-3">{s.n || ''}</span><div className={`w-full rounded-t-[2px] ${s.n ? 'bg-accent' : 'bg-white/[0.07]'}`} style={{ height: `${s.n ? (s.n / max) * 72 : 3}%`, minHeight: 3 }} /><span className="text-[9px] text-dim">{s.d.slice(8)}</span></div>)}
            </div>
          )}
        </Card>
        <Card title="Signals by status">
          {!d ? <Skeleton className="h-40" /> : (
            <div className="space-y-3">{d.byStatus.map((s) => { const [l, c] = SMETA[s.status] || [s.status, '#6f6d65']; return (
              <div key={s.status}><div className="flex justify-between text-sm mb-1"><span>{l}</span><span className="num text-mute">{s.n}</span></div><div className="h-[5px] rounded-[1px] bg-white/[0.06] overflow-hidden"><div className="h-full transition-all" style={{ width: `${(s.n / totalSig) * 100}%`, background: c }} /></div></div>); })}
              <p className="text-xs text-mute pt-1">Average result per closed signal: <b className="num text-ink">{fmtPct(d.signals.avgResult)}</b></p></div>
          )}
        </Card>
        <Card title="Master Excel workbook" subtitle="server/data/records.xlsx · auto-updated on every change">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-[3px] border border-line-2 grid place-items-center text-mute shrink-0"><FileSpreadsheet size={20} /></div>
            <div className="text-sm min-w-0">
              {m ? <><p className="text-mute">Last updated <b className="text-ink">{m.modified ? timeAgo(m.modified) : '—'}</b></p><p className="text-mute">Size <b className="num text-ink">{m.size ? `${(m.size / 1024).toFixed(1)} KB` : '—'}</b></p>{m.pending && <p className="text-warn text-xs mt-1">Update in progress…</p>}{m.lastError && <p className="text-down text-xs mt-1">{m.lastError}</p>}</> : <Skeleton className="h-10 w-40" />}
            </div>
          </div>
          <p className="text-xs text-dim mt-3">Sheets: Signals, Trades, Orders, Users, Watchlists, Activity. Passwords are never included.</p>
          <div className="mt-4"><ExcelButton path="/export/master" label="Download master workbook" small={false} ghost={false} /></div>
        </Card>
      </div>
      <Card title="Recent sign-in activity" className="mt-4" pad={false} actions={<Link to="/admin/records" className="btn btn-ghost btn-sm">All records</Link>}>
        {!d ? <div className="p-4"><Skeleton className="h-32" /></div> : (
          <div className="overflow-x-auto"><table className="tbl" style={{ minWidth: 560 }}><thead><tr><th>Time</th><th>Email</th><th>Event</th><th>Result</th><th>IP</th></tr></thead>
            <tbody>{d.recentActivity.map((a) => <tr key={a.id}><td className="text-mute">{fmtDate(a.created_at, 'dd MMM, HH:mm:ss')}</td><td>{a.email}</td><td className="capitalize">{a.event.replace('_', ' ')}</td><td><span className={`badge ${a.success ? 'badge-up' : 'badge-down'}`}>{a.success ? 'Success' : 'Failed'}</span></td><td className="num text-mute">{a.ip || '—'}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
