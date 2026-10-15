import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import PriceChart from '../components/PriceChart.jsx';
import OrderPanel from '../components/OrderPanel.jsx';
import PositionsPanel from '../components/PositionsPanel.jsx';
import Watchlist from '../components/Watchlist.jsx';
import { Card, StatCard, PageHeader, Skeleton, ErrorState } from '../components/ui.jsx';
import { useMarket } from '../store/market.js';
import { useFetch } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { usePortfolio } from '../lib/usePortfolio.js';
import { fmtMoney, fmtSigned } from '../lib/format.js';

export default function Trade() {
  const { symbol: param } = useParams(); const nav = useNavigate();
  const known = useMarket((s) => s.quotes);
  const symbol = param && (known[param] || !Object.keys(known).length) ? param : 'BTCUSDT';
  const pf = usePortfolio(); const p = pf.data;
  const [showLevels, setShowLevels] = useState(true); const [confirm, setConfirm] = useState(false);
  const signalTick = useMarket((s) => s.signalTick);
  const sigs = useFetch(() => api(`/signals${qs({ scope: 'active', pageSize: 50 })}`), [signalTick]);

  const levels = useMemo(() => {
    if (!showLevels) return [];
    const out = [];
    (sigs.data?.rows || []).filter((s) => s.pair === symbol).forEach((s) => {
      out.push({ price: s.entry, color: '#cfcdc4', title: `Signal ${s.direction} entry` }, { price: s.stopLoss, color: '#ec5560', title: 'Signal SL' }, { price: s.tp1, color: '#2fbf85', title: 'Signal TP1' });
      if (s.tp2) out.push({ price: s.tp2, color: '#2fbf85', title: 'Signal TP2' });
    });
    (p?.open || []).filter((t) => t.symbol === symbol).forEach((t) => {
      out.push({ price: t.entry_price, color: '#d9a441', title: `My ${t.side}`, solid: true });
      if (t.stop_loss) out.push({ price: t.stop_loss, color: '#ec5560', title: 'My SL' }); if (t.take_profit) out.push({ price: t.take_profit, color: '#2fbf85', title: 'My TP' });
    });
    return out;
  }, [sigs.data, p, symbol, showLevels]);

  const reset = async () => {
    if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 4000); return; }
    try { await api('/trading/reset', { method: 'POST' }); toast.success('Paper account reset to 100,000 USD'); pf.refresh(); } catch (e) { toast.error(e.message); }
    setConfirm(false);
  };

  return (
    <div>
      <PageHeader title="Paper trading" subtitle="Practice with virtual money on live charts. No real orders are placed."
        actions={<><button className="btn btn-ghost btn-sm" onClick={() => setShowLevels((v) => !v)}>{showLevels ? <Eye size={14} /> : <EyeOff size={14} />}Signal & position levels</button>
          <button className={`btn btn-sm ${confirm ? 'btn-danger' : 'btn-ghost'}`} onClick={reset}><RotateCcw size={14} />{confirm ? 'Click again to confirm' : 'Reset account'}</button></>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 stats mb-4">
        <StatCard label="Equity" loading={pf.loading && !p} value={fmtMoney(p?.equity)} sub={p && `Start ${fmtMoney(p.startBalance, { maximumFractionDigits: 0 })}`} />
        <StatCard label="Available cash" loading={pf.loading && !p} value={fmtMoney(p?.balance)} sub={p && `In positions ${fmtMoney(p.margin)}`} />
        <StatCard label="Unrealised P&L" loading={pf.loading && !p} value={fmtSigned(p?.unrealized)} tone={p?.unrealized > 0 ? 'up' : p?.unrealized < 0 ? 'down' : ''} sub="Updates live" />
        <StatCard label="Realised P&L" loading={pf.loading && !p} value={fmtSigned(p?.realized)} tone={p?.realized > 0 ? 'up' : p?.realized < 0 ? 'down' : ''} sub={p && `${p.closedCount} closed · win rate ${p.winRate ?? '—'}${p.winRate != null ? '%' : ''}`} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-4 min-w-0">
          <Card pad={false} className="min-h-[560px]"><PriceChart symbol={symbol} onSymbolChange={(s) => nav(`/app/trade/${s}`)} levels={levels} className="h-full min-h-[560px]" /></Card>
          <Card pad={false} title="Positions & orders">
            {pf.loading && !p ? <div className="p-4"><Skeleton className="h-24" /></div> : pf.error && !p ? <ErrorState message={pf.error} onRetry={pf.reload} /> : <PositionsPanel portfolio={p} onChange={pf.refresh} onSelectSymbol={(s) => nav(`/app/trade/${s}`)} />}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Order ticket" subtitle="Simulated execution at the live price" pad={false}><OrderPanel symbol={symbol} balance={p?.balance} onPlaced={pf.refresh} /></Card>
          <Card title="Watchlist" pad={false} bodyClass="max-h-[360px] overflow-y-auto"><Watchlist activeSymbol={symbol} onSelect={(s) => nav(`/app/trade/${s}`)} /></Card>
        </div>
      </div>
    </div>
  );
}
