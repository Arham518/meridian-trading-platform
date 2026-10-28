import { useEffect, useState } from 'react';
import { Users, Radio, Trophy, LogIn, Wifi, FileSpreadsheet, Megaphone, Settings, Mail, Database, Pencil, UserPlus, ArrowUpRight, Layers, MailWarning } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card, ErrorState, Skeleton } from '../../components/ui.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { UserDrawer } from '../../components/UserEditor.jsx';
import { useFetch } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../store/auth.js';
import { useMarket } from '../../store/market.js';
import { fmtDate, fmtSigned, fmtPct, timeAgo } from '../../lib/format.js';
import { C } from '../../lib/theme.js';

const SMETA = { active: ['Active', C.accent], hit_tp1: ['TP1 hit', C.candleUp], hit_tp2: ['TP2 hit', C.candleUp], hit_sl: ['Stopped out', C.candleDown], cancelled: ['Cancelled', C.neutral] };
const EVENT = (e) => e.replace(/^admin_/, 'admin ').replaceAll('_', ' ');

/** Quick actions: the jobs an admin opens the panel for, one tap each. */
const QUICK = [
  { to: '/admin/users', label: 'Edit users', hint: 'Profile, role, status, balance, password', icon: Users, tint: 'bg-sky', ic: 'text-[#1546ab]' },
  { to: '/admin/signals', label: 'Publish a signal', hint: 'Entry, stop, targets, chart image', icon: Megaphone, tint: 'bg-lav', ic: 'text-[#4b3aa8]' },
  { to: '/admin/settings', label: 'Hero video & ads', hint: 'Home page video, five ad places', icon: Settings, tint: 'bg-mint', ic: 'text-[#0a5a35]' },
  { to: '/admin/email', label: 'Email', hint: 'SMTP status, test email, sent log', icon: Mail, tint: 'bg-cream', ic: 'text-[#7a4a00]' },
  { to: '/admin/records', label: 'All records', hint: 'Trades, orders, sign-ins, Excel', icon: Database, tint: 'bg-sky', ic: 'text-[#1546ab]' },
];

function Stat({ label, value, sub, icon: Icon, tint, loading }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-[22px] border border-white/80 p-4 sm:p-5 shadow-[var(--shadow-card)] min-w-0', tint)}>
      <span aria-hidden className="absolute -right-8 -top-8 size-24 rounded-full bg-white/55 blur-xl" />
      <div className="relative flex items-center justify-between gap-2"><span className="text-[12.5px] font-semibold text-ink/80 truncate">{label}</span><span className="size-8 rounded-xl bg-white/80 grid place-items-center text-ink shrink-0"><Icon size={15} /></span></div>
      {loading ? <Skeleton className="h-8 w-20 mt-3" /> : <div className="relative num text-[1.7rem] sm:text-[2rem] font-semibold tracking-[-0.04em] mt-2 leading-none">{value ?? '—'}</div>}
      {sub && <div className="relative text-[11.5px] text-ink/75 mt-2 truncate">{sub}</div>}
    </div>
  );
}

export default function AdminOverview() {
  const me = useAuth((s) => s.user);
  const tick = useMarket((s) => s.signalTick); const usersTick = useMarket((s) => s.usersTick);
  const { data: d, loading, error, reload, refresh } = useFetch(() => api('/admin/stats'), [tick, usersTick]);
  const info = useFetch(() => api('/export/master/info'), [tick]);
  const m = info.data;
  const [edit, setEdit] = useState(null);
  useEffect(() => { if (!m?.pending) return undefined; const t = setTimeout(() => info.refresh(), 2500); return () => clearTimeout(t); });
  const days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10); return { d: dt, n: d?.signups.find((x) => x.d === dt)?.n || 0 }; });
  const max = Math.max(1, ...days.map((s) => s.n)); const peak = days.reduce((b, x, i) => (x.n > days[b].n ? i : b), 0);
  const totalSig = (d?.byStatus || []).reduce((s, x) => s + x.n, 0) || 1;
  const hour = new Date().getHours(); const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  if (error && !d) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4 sm:space-y-5" data-testid="admin-overview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Admin panel</p>
          <h1 className="text-[1.7rem] md:text-[2.2rem] font-semibold leading-tight tracking-[-0.035em] mt-1">{hello}, {me?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-mute mt-1">Users, signals, site content and email in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link to="/admin/users" className="btn btn-ghost"><UserPlus size={15} />Users</Link><Link to="/admin/signals" className="btn btn-primary"><Radio size={15} />New signal</Link></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Users" icon={Users} tint="bg-sky" loading={loading && !d} value={d?.users.n} sub={d && `${d.users.active} active · +${d.newUsers7d} this week`} />
        <Stat label="Active signals" icon={Radio} tint="bg-lav" loading={loading && !d} value={d?.signals.active} sub={d && `${d.signals.total} total`} />
        <Stat label="Win rate" icon={Trophy} tint="bg-mint" loading={loading && !d} value={d?.signals.winRate != null ? `${d.signals.winRate}%` : '—'} sub={d && `${d.signals.wins} wins · ${d.signals.losses} losses`} />
        <Stat label="Logins (24h)" icon={LogIn} tint="bg-cream" loading={loading && !d} value={d?.logins24h} sub={d && `${d.failedLogins24h} failed · ${d.online} online now`} />
      </div>

      <section aria-label="Quick actions" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="glass glass-hover p-4 flex flex-col gap-3 min-w-0 group">
            <span className={clsx('size-10 rounded-2xl grid place-items-center', q.tint, q.ic)}><q.icon size={18} /></span>
            <span className="min-w-0"><span className="flex items-center gap-1 text-[13.5px] font-semibold">{q.label}<ArrowUpRight size={14} className="text-mute group-hover:text-ink transition-colors" /></span><span className="block text-[11.5px] text-mute mt-0.5 leading-snug">{q.hint}</span></span>
          </Link>
        ))}
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 sm:gap-5">
        <Card title="Latest sign-ups" subtitle="Click Edit to change a user" pad={false} actions={<Link to="/admin/users" className="btn btn-ghost btn-sm">All users</Link>}>
          {!d ? <div className="p-4"><Skeleton className="h-40" /></div> : (
            <ul className="divide-y divide-[var(--color-line)]">
              {d.recentUsers.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                  <span className="size-10 rounded-full grid place-items-center text-[13px] font-bold text-white bg-[linear-gradient(135deg,#3b7bf0,#0f2a66)] shrink-0">{u.name[0]?.toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold truncate">{u.name}</div><div className="text-[11.5px] text-mute truncate">{u.email} · joined {timeAgo(u.created_at)}</div></div>
                  <div className="hidden sm:flex gap-1.5"><span className={clsx('badge', u.role === 'admin' ? 'badge-accent' : 'badge-neutral')}>{u.role}</span>{!u.email_verified_at && <span className="badge badge-warn">unverified</span>}{u.status !== 'active' && <span className="badge badge-down">{u.status}</span>}</div>
                  <button className="btn btn-primary btn-sm" onClick={() => setEdit(u.id)} aria-label={`Edit ${u.email}`}><Pencil size={13} />Edit</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="New sign-ups" subtitle="Last 14 days">
          {!d ? <Skeleton className="h-44" /> : (
            <>
              <div className="flex items-end gap-1.5 h-40" role="img" aria-label="Sign-ups per day">
                {days.map((s, i) => <div key={s.d} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${s.d}: ${s.n}`}><span className="num text-[10px] text-mute h-3">{s.n || ''}</span><div className={clsx('w-full max-w-[18px] rounded-full', s.n ? (i === peak ? 'bg-accent' : 'bg-[#0f1f3d]') : 'bg-ink/[0.08]')} style={{ height: `${s.n ? (s.n / max) * 78 : 4}%`, minHeight: 4 }} /><span className="text-[9.5px] text-dim">{s.d.slice(8)}</span></div>)}
              </div>
              {d.pendingVerification > 0 && <p className="mt-3 text-[12px] text-mute flex items-center gap-1.5"><MailWarning size={13} className="text-warn" />{d.pendingVerification} account{d.pendingVerification === 1 ? '' : 's'} not verified yet</p>}
            </>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 sm:gap-5">
        <Card title="Signals by status" actions={<Link to="/admin/signals" className="btn btn-ghost btn-sm">Manage</Link>}>
          {!d ? <Skeleton className="h-40" /> : (
            <div className="space-y-3">{d.byStatus.map((s) => { const [l, c] = SMETA[s.status] || [s.status, C.neutral]; return (
              <div key={s.status}><div className="flex justify-between text-sm mb-1"><span>{l}</span><span className="num text-mute">{s.n}</span></div><div className="h-2 rounded-full bg-ink/[0.06] overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(s.n / totalSig) * 100}%`, background: c }} /></div></div>); })}
              <p className="text-xs text-mute pt-1">Average result per closed signal: <b className="num text-ink">{fmtPct(d.signals.avgResult)}</b> · paper trades <b className="num text-ink">{d.trades.n}</b> ({d.trades.open || 0} open, P&L <span className="num">{fmtSigned(d.trades.pnl)}</span>)</p></div>
          )}
        </Card>
        <section className="on-dark glass-navy relative overflow-hidden p-5 sm:p-6 flex flex-col">
          <div aria-hidden className="absolute -right-16 -bottom-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(111,166,239,0.55),transparent)]" />
          <div className="relative flex items-start gap-3">
            <span className="size-11 rounded-2xl glass-chip grid place-items-center shrink-0"><FileSpreadsheet size={20} /></span>
            <div className="min-w-0"><h2 className="text-[1.15rem] font-semibold">Master Excel workbook</h2><p className="text-[12.5px] text-mute">Signals, trades, orders, users, watchlists and activity. Updated on every change, passwords never included.</p></div>
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="glass-chip px-3 py-2.5"><div className="text-[11px] text-mute">Last updated</div><div className="font-semibold mt-0.5">{m ? (m.modified ? timeAgo(m.modified) : '—') : '…'}</div></div>
            <div className="glass-chip px-3 py-2.5"><div className="text-[11px] text-mute">Size</div><div className="num font-semibold mt-0.5">{m?.size ? `${(m.size / 1024).toFixed(1)} KB` : '—'}</div></div>
          </div>
          {m?.pending && <p className="relative text-warn text-xs mt-2">Update in progress…</p>}{m?.lastError && <p className="relative text-down text-xs mt-2">{m.lastError}</p>}
          <div className="relative mt-auto pt-5"><ExcelButton path="/export/master" label="Download master workbook" small={false} ghost={false} /></div>
        </section>
      </div>

      <Card title="Recent sign-in activity" subtitle="Edit opens that user" pad={false} actions={<Link to="/admin/records" className="btn btn-ghost btn-sm"><Layers size={13} />All records</Link>}>
        {!d ? <div className="p-4"><Skeleton className="h-32" /></div> : (
          <ul className="divide-y divide-[var(--color-line)]" data-testid="activity-list">
            {d.recentActivity.map((a) => (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_90px_auto] xl:grid-cols-[230px_minmax(0,1.6fr)_minmax(0,1fr)_90px_auto] items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-2.5 text-[13px]">
                <span className="text-mute num text-[12px] order-3 sm:order-none col-span-2 sm:col-span-1">{fmtDate(a.created_at, 'dd MMM, HH:mm:ss')}{a.ip ? ` · ${a.ip}` : ''}</span>
                <span className="min-w-0 truncate font-medium">{a.user_name ? <>{a.user_name} <span className="text-mute font-normal">{a.email}</span></> : a.email}</span>
                <span className="hidden sm:block capitalize text-mute truncate">{EVENT(a.event)}</span>
                <span className="hidden sm:block"><span className={`badge ${a.success ? 'badge-up' : 'badge-down'}`}>{a.success ? 'Success' : 'Failed'}</span></span>
                <span className="justify-self-end">{a.user_id ? <button className="btn btn-ghost btn-sm" onClick={() => setEdit(a.user_id)} aria-label={`Edit ${a.email}`}><Pencil size={12} />Edit</button> : <span className="text-[11px] text-dim">no account</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[11.5px] text-dim flex items-center gap-1.5"><Wifi size={12} />{d ? `${d.online} live connection${d.online === 1 ? '' : 's'}` : ''}</p>
      <UserDrawer userId={edit} me={me} onClose={() => setEdit(null)} onChanged={refresh} />
    </div>
  );
}
