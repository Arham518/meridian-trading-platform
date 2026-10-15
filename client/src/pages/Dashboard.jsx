import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Radio } from 'lucide-react';
import AdSlot from '../components/AdSlot.jsx';
import PriceChart from '../components/PriceChart.jsx';
import Watchlist from '../components/Watchlist.jsx';
import OrderPanel from '../components/OrderPanel.jsx';
import PositionsPanel from '../components/PositionsPanel.jsx';
import { Heatmap, Movers, NewsList, SignalRows } from '../components/MarketWidgets.jsx';
import { Card, StatCard, Segmented, EmptyState, ErrorState, Skeleton, PageHeader } from '../components/ui.jsx';
import { useAuth } from '../store/auth.js';
import { useMarket } from '../store/market.js';
import { useFetch } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { usePortfolio } from '../lib/usePortfolio.js';
import { fmtMoney, fmtSigned } from '../lib/format.js';

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const [symbol, setSymbol] = useState(() => localStorage.getItem('meridian_symbol') || 'BTCUSDT');
  const [panel, setPanel] = useState('watch');
  const pf = usePortfolio();
  const signalTick = useMarket((s) => s.signalTick);
  const verified0 = user?.emailVerified || user?.role === 'admin';
  const sigs = useFetch(() => api(`/signals${qs({ scope: 'active', pageSize: 5 })}`), [signalTick, verified0], { enabled: !!verified0 });
  const stats = useFetch(() => api('/signals/stats'), [signalTick, verified0], { enabled: !!verified0 });
  const pick = (s) => { setSymbol(s); localStorage.setItem('meridian_symbol', s); };
  const p = pf.data;
  const firstName = user?.name?.split(' ')[0];

  const verified = user?.emailVerified || user?.role === 'admin';
  return (
    <div>
      <PageHeader title="Overview" subtitle={`Welcome back, ${firstName}. ${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}.`} actions={<Link to="/app/trade" className="btn btn-primary btn-sm">Open terminal<ArrowRight size={14} /></Link>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 stats">
        <StatCard label="Paper equity" loading={pf.loading && !p} value={fmtMoney(p?.equity)} sub={p && <span>Cash {fmtMoney(p.balance)}</span>} />
        <StatCard label="Unrealised P&L" loading={pf.loading && !p} value={`${fmtSigned(p?.unrealized)}`} tone={p?.unrealized > 0 ? 'up' : p?.unrealized < 0 ? 'down' : ''} sub={p && <span>Realised {fmtSigned(p.realized)} USD</span>} />
        <StatCard label="Open positions" loading={pf.loading && !p} value={p?.open.length ?? '--'} sub={p && <span>{p.pending.length} pending order{p.pending.length === 1 ? '' : 's'}</span>} />
        <StatCard label="Signal win rate" loading={verified && stats.loading && !stats.data} value={stats.data?.winRate != null ? `${stats.data.winRate}%` : '--'} sub={stats.data ? <span>{stats.data.wins}W / {stats.data.losses}L / {stats.data.active} active</span> : !verified ? 'Confirm email to view' : null} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-3 mt-3 items-start">
        <div className="min-w-0 space-y-3">
          <Card pad={false} className="min-h-[520px]"><PriceChart symbol={symbol} onSymbolChange={pick} className="h-full min-h-[520px]" /></Card>
          <Card pad={false} title="Open positions and orders" subtitle="Paper trading, simulated virtual money" actions={<Link to="/app/records" className="btn btn-ghost btn-sm">Trade history</Link>}>
            {pf.loading && !p ? <div className="p-4"><Skeleton className="h-24" /></div> : pf.error && !p ? <ErrorState message={pf.error} onRetry={pf.reload} /> : <PositionsPanel portfolio={p} onChange={pf.refresh} onSelectSymbol={pick} />}
          </Card>
        </div>
        <div className="min-w-0 space-y-3">
          <Card pad={false} title={<Segmented size="sm" ariaLabel="Side panel" value={panel} onChange={setPanel} options={[{ value: 'watch', label: 'Watchlist' }, { value: 'order', label: 'Quick trade' }]} />} bodyClass="overflow-y-auto xl:max-h-[420px]">
            {panel === 'watch' ? <Watchlist activeSymbol={symbol} onSelect={pick} /> : <OrderPanel symbol={symbol} balance={p?.balance} onPlaced={pf.refresh} />}
          </Card>
          <Card title="Active signals" actions={<Link to="/app/signals" className="btn btn-ghost btn-sm">All</Link>} pad={false}>
            {!verified ? <p className="px-4 py-5 text-[13px] text-mute">The signals desk opens once your email is confirmed.</p> :
              sigs.loading && !sigs.data ? <div className="p-3"><Skeleton className="h-24" /></div> : sigs.error && !sigs.data ? <ErrorState message={sigs.error} onRetry={sigs.reload} /> :
                sigs.data.rows.length ? <SignalRows rows={sigs.data.rows} /> : <EmptyState icon={Radio} title="No active signals" hint="New signals appear here as soon as the desk publishes them." />}
          </Card>
          <Card title="Movers" pad><Movers /></Card>
          <AdSlot slot="dashboard" variant="box" />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-3 mt-3">
        <Card title="Market heat map" subtitle="Tile colour is the 24h change"><Heatmap /></Card>
        <Card title="Market news" pad={false}><NewsList limit={5} /></Card>
      </div>
    </div>
  );
}
