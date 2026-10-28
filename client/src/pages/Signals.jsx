import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Radio, Trophy, TrendingUp, Activity, XCircle } from 'lucide-react';
import SignalCard from '../components/SignalCard.jsx';
import Lightbox from '../components/Lightbox.jsx';
import { Ad, useAds } from '../components/AdSlot.jsx';
import { Card, StatCard, PageHeader, EmptyState, ErrorState, Skeleton, Segmented } from '../components/ui.jsx';
import { VerifyGate } from '../components/authKit.jsx';
import { useAuth } from '../store/auth.js';
import { useMarket } from '../store/market.js';
import { useFetch } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { fmtPct } from '../lib/format.js';

function SignalsInner() {
  const tick = useMarket((s) => s.signalTick); const connected = useMarket((s) => s.connected);
  const [dir, setDir] = useState(''); const [img, setImg] = useState(null);
  const active = useFetch(() => api(`/signals${qs({ scope: 'active', direction: dir, pageSize: 50 })}`), [tick, dir]);
  const recent = useFetch(() => api(`/signals${qs({ scope: 'history', pageSize: 4 })}`), [tick]);
  const stats = useFetch(() => api('/signals/stats'), [tick]);
  const st = stats.data;
  const sideAds = useAds('signals'); const feedAds = useAds('between_signals');
  const EVERY = 3; // one feed ad after every third signal card
  return (
    <div>
      <PageHeader title="Live signals" subtitle="Trade plans published by the desk. New signals appear instantly and trigger a notification."
        actions={<><span className={connected ? 'badge badge-up !h-8 !px-3 !rounded-lg' : 'badge badge-neutral !h-8 !px-3 !rounded-lg'}>{connected ? <><span className="live-dot" />Real-time connected</> : 'Connecting…'}</span><Link to="/app/signals/history" className="btn btn-ghost btn-sm">Signal history</Link></>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 stats mb-5 sm:mb-6">
        <StatCard label="Win rate" icon={Trophy} loading={stats.loading && !st} value={st?.winRate != null ? `${st.winRate}%` : '—'} tone="up" sub={st && `${st.wins} winners · ${st.losses} stopped`} />
        <StatCard label="Active signals" icon={Radio} loading={stats.loading && !st} value={st?.active ?? '—'} sub="Open right now" />
        <StatCard label="Total result" icon={TrendingUp} loading={stats.loading && !st} value={fmtPct(st?.totalResult)} tone={st?.totalResult >= 0 ? 'up' : 'down'} sub="Sum of closed signals (%)" />
        <StatCard label="Average / signal" icon={Activity} loading={stats.loading && !st} value={fmtPct(st?.avgResult)} tone={st?.avgResult >= 0 ? 'up' : 'down'} sub={st && `${st.total} signals recorded`} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 sm:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-3"><h2 className="font-semibold text-[1.05rem] tracking-[-0.02em]">Active now</h2>
            <Segmented size="sm" ariaLabel="Direction filter" value={dir} onChange={setDir} options={[{ value: '', label: 'All' }, { value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }]} /></div>
          {active.loading && !active.data ? <div className="space-y-4"><Skeleton className="h-52" /><Skeleton className="h-52" /></div> :
            active.error && !active.data ? <Card><ErrorState message={active.error} onRetry={active.reload} /></Card> :
              active.data.rows.length === 0 ? <Card><EmptyState icon={Radio} title="No active signals" hint="You will be notified here and by toast the moment a new signal is published." /></Card> : (
                <div className="grid gap-4 2xl:grid-cols-2"><AnimatePresence initial={false}>{active.data.rows.map((s, i) => (
                  <Fragment key={s.id}>
                    <SignalCard s={s} onImage={(x) => setImg(x)} />
                    {feedAds.length > 0 && (i + 1) % EVERY === 0 && i + 1 < active.data.rows.length && <Ad ad={feedAds[Math.floor(i / EVERY) % feedAds.length]} layout="card" className="2xl:col-span-2" />}
                  </Fragment>
                ))}</AnimatePresence>{feedAds.length > 0 && active.data.rows.length < EVERY && <Ad ad={feedAds[0]} layout="card" className="2xl:col-span-2" />}</div>
              )}
        </div>
        <div className="min-w-0 space-y-3">
          {sideAds.map((a) => <Ad key={a.id} ad={a} layout="box" />)}
          <h2 className="font-semibold text-[1.05rem] tracking-[-0.02em] pt-1">Recently closed</h2>
          {recent.loading && !recent.data ? <Skeleton className="h-40" /> : recent.data?.rows.length ? recent.data.rows.map((s) => <SignalCard key={s.id} s={s} onImage={(x) => setImg(x)} />) : <Card><EmptyState icon={XCircle} title="Nothing closed yet" /></Card>}
          <Link to="/app/signals/history" className="btn btn-ghost w-full !rounded-xl">View full history</Link>
        </div>
      </div>
      <Lightbox src={img?.imageUrl} title={img ? `${img.pair} chart` : ''} onClose={() => setImg(null)} />
    </div>
  );
}

export default function Signals() {
  const user = useAuth((s) => s.user);
  if (!user.emailVerified && user.role !== 'admin') return <VerifyGate />;
  return <SignalsInner />;
}
