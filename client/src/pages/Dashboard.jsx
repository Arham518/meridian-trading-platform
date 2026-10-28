import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Radio, Sparkles } from 'lucide-react';
import { Ad, useAds } from '../components/AdSlot.jsx';
import PriceChart from '../components/PriceChart.jsx';
import Watchlist from '../components/Watchlist.jsx';
import OrderPanel from '../components/OrderPanel.jsx';
import PositionsPanel from '../components/PositionsPanel.jsx';
import EquityCard from '../components/EquityCard.jsx';
import MobileHome from '../components/MobileHome.jsx';
import MarketTable, { AssetIcon } from '../components/MarketTable.jsx';
import Sparkline from '../components/Sparkline.jsx';
import { useSparklines } from '../components/Watchlist.jsx';
import { Price, Change } from '../components/Price.jsx';
import { Heatmap, Movers, NewsList, SignalRows } from '../components/MarketWidgets.jsx';
import { Card, Segmented, EmptyState, ErrorState, Skeleton, PageHeader } from '../components/ui.jsx';
import { useAuth } from '../store/auth.js';
import { useMarket } from '../store/market.js';
import { useFetch } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { usePortfolio } from '../lib/usePortfolio.js';
import { pairLabel } from '../lib/format.js';

const TINTS = ['bg-lav', 'bg-mint', 'bg-cream', 'bg-sky'];

/** "Your assets": the first symbols of the watchlist as soft pastel glass tiles. */
function AssetTiles({ onSelect }) {
  const watch = useMarket((s) => s.watchlist); const quotes = useMarket((s) => s.quotes); const spark = useSparklines();
  const list = (watch.length ? watch : ['BTCUSDT', 'ETHUSDT', 'XAUUSD']).slice(0, 3).map((s) => quotes[s]).filter(Boolean);
  if (!list.length) return <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[150px] !rounded-2xl" />)}</div>;
  return (
    <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [scrollbar-width:none]">
      {list.map((q, i) => (
        <button key={q.symbol} onClick={() => onSelect(q.symbol)} className={`${TINTS[i % 4]} [&_.down]:!text-[#9c1426] [&_.up]:!text-[#055c37] snap-start shrink-0 w-[62%] min-[480px]:w-[44%] sm:w-auto relative overflow-hidden rounded-2xl border border-white/80 p-4 text-left shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5`}>
          <span aria-hidden className="absolute -right-8 -top-8 size-24 rounded-full bg-white/50 blur-xl" />
          <div className="relative flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink truncate">{pairLabel(q.symbol)}</span>
            <AssetIcon symbol={q.symbol} type={q.type} size="size-8" />
          </div>
          <Price value={q.price} decimals={q.decimals} className="relative block text-[1.2rem] sm:text-[1.3rem] font-semibold tracking-[-0.03em] mt-3 text-ink" />
          <div className="relative flex items-end justify-between gap-2 mt-2">
            <Change pct={q.changePct} className="text-[12px] font-semibold" />
            <Sparkline data={spark[q.symbol]} width={70} height={24} up={q.changePct >= 0} />
          </div>
        </button>
      ))}
    </div>
  );
}

/** Dark promo card (first ad of the "dashboard" slot replaces it when the admin has one). */
function PromoCard() {
  const ads = useAds('dashboard');
  if (ads.length) return <Ad ad={ads[0]} layout="box" className="h-full" />;
  return (
    <section className="on-dark glass-navy relative overflow-hidden p-6 flex flex-col justify-between min-h-[230px] h-full">
      <div aria-hidden className="absolute -right-16 -bottom-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(59,123,240,0.55),transparent)]" />
      <div aria-hidden className="absolute right-6 top-6 w-28 h-16 rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-md rotate-[-8deg]" />
      <div aria-hidden className="absolute right-12 top-14 w-28 h-16 rounded-xl border border-white/15 bg-white/[0.08] backdrop-blur-md rotate-[6deg]" />
      <div className="relative">
        <span className="badge badge-accent"><Sparkles size={12} />Paper account</span>
        <h3 className="text-[1.45rem] font-semibold tracking-[-0.03em] leading-tight mt-3 max-w-[15rem]">Practise every signal with 100,000 USD of virtual capital.</h3>
        <p className="text-[13px] text-mute mt-2 max-w-[17rem]">Market and limit orders, stop loss and take profit, no real money at risk.</p>
      </div>
      <Link to="/app/trade" className="btn btn-light !rounded-full self-start mt-5 relative">Start paper trading<ArrowRight size={14} /></Link>
    </section>
  );
}

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const [symbol, setSymbol] = useState(() => localStorage.getItem('meridian_symbol') || 'BTCUSDT');
  const [panel, setPanel] = useState('watch');
  const pf = usePortfolio();
  const signalTick = useMarket((s) => s.signalTick);
  const verified = user?.emailVerified || user?.role === 'admin';
  const sigs = useFetch(() => api(`/signals${qs({ scope: 'active', pageSize: 5 })}`), [signalTick, verified], { enabled: !!verified });
  const stats = useFetch(() => api('/signals/stats'), [signalTick, verified], { enabled: !!verified });
  const pick = (s) => { setSymbol(s); localStorage.setItem('meridian_symbol', s); };
  const p = pf.data;
  const dashAds = useAds('dashboard');
  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="space-y-4 sm:space-y-5">
      <MobileHome portfolio={p} />
      <div className="hidden md:block"><PageHeader title={`Welcome back, ${firstName}`} subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}. Your paper account, live signals and markets.`}
        actions={<>{stats.data?.winRate != null && <span className="badge badge-neutral !h-9 !px-3.5 !rounded-full">Signal win rate <b className="num text-ink ml-1">{stats.data.winRate}%</b></span>}<Link to="/app/trade" className="btn btn-primary !rounded-full">Paper trading<ArrowRight size={14} /></Link></>} /></div>

      {/* portfolio + assets */}
      <div className="grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 sm:gap-5 items-stretch">
        <div className="hidden md:flex min-w-0 [&>section]:flex-1"><EquityCard portfolio={p} loading={pf.loading} /></div>
        <div className="flex flex-col gap-3 min-w-0">
          <div className="hidden md:contents"><div className="flex items-center justify-between"><h2 className="text-[1.05rem] font-semibold tracking-[-0.02em]">Your assets</h2><Link to="/app/markets" className="link text-[12.5px]">Edit watchlist</Link></div>
          <AssetTiles onSelect={pick} /></div>
          <div className="grid sm:grid-cols-2 gap-3 flex-1">
            <Card title="Active signals" actions={<Link to="/app/signals" className="btn btn-ghost btn-sm">All</Link>} pad={false}>
              {!verified ? <p className="px-4 py-5 text-[13px] text-mute">The signals desk opens once your email is confirmed.</p> :
                sigs.loading && !sigs.data ? <div className="p-3"><Skeleton className="h-24" /></div> : sigs.error && !sigs.data ? <ErrorState message={sigs.error} onRetry={sigs.reload} /> :
                  sigs.data.rows.length ? <SignalRows rows={sigs.data.rows.slice(0, 3)} /> : <EmptyState icon={Radio} title="No active signals" hint="New signals appear here the moment the desk publishes them." />}
            </Card>
            <Card title="Movers"><Movers /></Card>
          </div>
        </div>
      </div>

      {/* market table + promo */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 sm:gap-5 items-stretch">
        <MarketTable onSelect={pick} limit={8} />
        <div className="grid gap-4 sm:gap-5 content-start">
          <PromoCard />
        </div>
      </div>

      {/* terminal */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 sm:gap-5 items-start">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <Card pad={false} className="min-h-[460px] sm:min-h-[520px] overflow-hidden"><PriceChart symbol={symbol} onSymbolChange={pick} className="h-full min-h-[460px] sm:min-h-[520px]" /></Card>
          <Card pad={false} title="Open positions and orders" subtitle="Paper trading, simulated virtual money" actions={<Link to="/app/records" className="btn btn-ghost btn-sm">Trade history</Link>}>
            {pf.loading && !p ? <div className="p-4"><Skeleton className="h-24" /></div> : pf.error && !p ? <ErrorState message={pf.error} onRetry={pf.reload} /> : <PositionsPanel portfolio={p} onChange={pf.refresh} onSelectSymbol={pick} />}
          </Card>
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <Card pad={false} title={<Segmented size="sm" ariaLabel="Side panel" value={panel} onChange={setPanel} options={[{ value: 'watch', label: 'Watchlist' }, { value: 'order', label: 'Quick trade' }]} />} bodyClass="overflow-y-auto xl:max-h-[440px]">
            {panel === 'watch' ? <Watchlist activeSymbol={symbol} onSelect={pick} /> : <OrderPanel symbol={symbol} balance={p?.balance} onPlaced={pf.refresh} />}
          </Card>
          {dashAds.slice(1, 2).map((a) => <Ad key={a.id} ad={a} layout="box" />)}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 sm:gap-5">
        <Card title="Market heat map" subtitle="Tile colour is the 24h change"><Heatmap /></Card>
        <Card title="Market news" pad={false}><NewsList limit={5} /></Card>
      </div>
    </div>
  );
}
