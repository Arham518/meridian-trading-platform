import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useMarket } from '../store/market.js';
import { Card, PageHeader, Segmented, EmptyState, SimTag } from '../components/ui.jsx';
import { Heatmap, Movers, useQuoteList } from '../components/MarketWidgets.jsx';
import { Price, Change } from '../components/Price.jsx';
import Sparkline from '../components/Sparkline.jsx';
import { useSparklines } from '../components/Watchlist.jsx';
import { pairLabel, fmtPrice } from '../lib/format.js';

const TYPES = [['all', 'All'], ['crypto', 'Crypto'], ['forex', 'Forex'], ['commodity', 'Gold'], ['index', 'Indices'], ['stock', 'Stocks']];

export default function Markets() {
  const list = useQuoteList(); const watch = useMarket((s) => s.watchlist); const toggle = useMarket((s) => s.toggleWatch);
  const spark = useSparklines(); const [type, setType] = useState('all'); const [q, setQ] = useState('');
  const rows = useMemo(() => list.filter((x) => (type === 'all' || x.type === type) && `${x.symbol} ${x.name}`.toLowerCase().includes(q.toLowerCase())), [list, type, q]);
  const star = async (s) => { try { await toggle(s); } catch (e) { toast.error(e.message); } };
  return (
    <div>
      <PageHeader title="Markets" subtitle="Live prices across crypto, forex, gold, indices and stocks. Crypto is live from Binance; other instruments are simulated (SIM)." />
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mb-4">
        <Card title="Heat-map" subtitle="Colour intensity shows 24h change"><Heatmap /></Card>
        <Card title="Top movers"><Movers /></Card>
      </div>
      <Card pad={false} title="All instruments" actions={
        <div className="relative hidden sm:block"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" /><input className="input !h-9 !pl-8 !w-56" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search markets" type="search" /></div>}>
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="overflow-x-auto"><Segmented size="sm" ariaLabel="Market type" value={type} onChange={setType} options={TYPES.map(([v, l]) => ({ value: v, label: l }))} /></div>
          <div className="relative sm:hidden flex-1 min-w-[140px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" /><input className="input !h-9 !pl-8" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search markets" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead><tr><th className="w-10" /><th>Instrument</th><th className="r">Price</th><th className="r">24h</th><th className="r hidden md:table-cell">24h high</th><th className="r hidden md:table-cell">24h low</th><th className="hidden sm:table-cell">Trend</th><th /></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.symbol}>
                <td><button onClick={() => star(x.symbol)} aria-label={watch.includes(x.symbol) ? 'Remove from watchlist' : 'Add to watchlist'} className="p-1"><Star size={15} className={clsx(watch.includes(x.symbol) ? 'fill-warn text-warn' : 'text-dim hover:text-mute')} /></button></td>
                <td><div className="flex items-center gap-2"><div><div className="font-medium">{pairLabel(x.symbol)}</div><div className="text-[0.8125rem] text-mute">{x.name}</div></div>{x.source === 'simulated' && <SimTag />}</div></td>
                <td className="r"><Price value={x.price} decimals={x.decimals} /></td>
                <td className="r"><Change pct={x.changePct} /></td>
                <td className="r num text-mute hidden md:table-cell">{fmtPrice(x.high, x.decimals)}</td>
                <td className="r num text-mute hidden md:table-cell">{fmtPrice(x.low, x.decimals)}</td>
                <td className="hidden sm:table-cell"><Sparkline data={spark[x.symbol]} up={x.changePct >= 0} /></td>
                <td className="r"><Link to={`/app/trade/${x.symbol}`} className="btn btn-ghost btn-sm">Trade</Link></td>
              </tr>))}</tbody>
          </table>
          {!rows.length && <EmptyState title="No instruments match" hint="Try another category or search term." />}
        </div>
      </Card>
    </div>
  );
}
