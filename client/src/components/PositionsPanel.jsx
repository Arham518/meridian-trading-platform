import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api.js';
import { useMarket } from '../store/market.js';
import { fmtMoney, fmtPrice, fmtSigned, fmtPct, pairLabel, fmtDate } from '../lib/format.js';
import { DirBadge, EmptyState, Segmented } from './ui.jsx';
import { Price } from './Price.jsx';

const pnlCls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'text-mute');

export default function PositionsPanel({ portfolio, onChange, onSelectSymbol }) {
  const [tab, setTab] = useState('open'); const [busy, setBusy] = useState(null);
  const quotes = useMarket((s) => s.quotes);
  const open = useMemo(() => (portfolio?.open || []).map((t) => {
    const price = quotes[t.symbol]?.price ?? t.price; const pnl = (price - t.entry_price) * t.qty * (t.side === 'BUY' ? 1 : -1);
    return { ...t, price, pnl, pnlPct: (pnl / (t.qty * t.entry_price)) * 100 };
  }), [portfolio, quotes]);
  const pending = portfolio?.pending || [];

  const close = async (t) => { setBusy(`t${t.id}`); try { const r = await api(`/trading/trades/${t.id}/close`, { method: 'POST' }); toast.success(`Closed ${pairLabel(t.symbol)}: ${fmtSigned(r.pnl)} USD`); onChange?.(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  const cancel = async (o) => { setBusy(`o${o.id}`); try { await api(`/trading/orders/${o.id}`, { method: 'DELETE' }); toast.success('Order cancelled'); onChange?.(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };

  return (
    <div>
      <div className="px-3 pt-3"><Segmented size="sm" ariaLabel="Positions or orders" value={tab} onChange={setTab} options={[{ value: 'open', label: `Positions (${open.length})` }, { value: 'pending', label: `Pending orders (${pending.length})` }]} /></div>
      <div className="overflow-x-auto mt-2">
        {tab === 'open' ? (
          open.length === 0 ? <EmptyState title="No open positions" hint="Place a paper order to open your first position." /> : (
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead><tr><th>Symbol</th><th>Side</th><th className="r">Qty</th><th className="r">Entry</th><th className="r">Price</th><th className="r">SL / TP</th><th className="r">P&amp;L</th><th /></tr></thead>
              <tbody>{open.map((t) => (
                <tr key={t.id}>
                  <td><button className="font-medium hover:text-accent-2" onClick={() => onSelectSymbol?.(t.symbol)}>{pairLabel(t.symbol)}</button></td>
                  <td><DirBadge dir={t.side} /></td>
                  <td className="r num">{t.qty}</td>
                  <td className="r num">{fmtPrice(t.entry_price)}</td>
                  <td className="r"><Price value={t.price} decimals={quotes[t.symbol]?.decimals} /></td>
                  <td className="r num text-mute">{t.stop_loss ? fmtPrice(t.stop_loss) : '—'} / {t.take_profit ? fmtPrice(t.take_profit) : '—'}</td>
                  <td className={clsx('r num font-medium', pnlCls(t.pnl))}>{fmtSigned(t.pnl)} <span className="text-[0.8125rem] opacity-80">({fmtPct(t.pnlPct)})</span></td>
                  <td className="r"><button className="btn btn-danger btn-sm" disabled={busy === `t${t.id}`} onClick={() => close(t)}>Close</button></td>
                </tr>))}</tbody>
            </table>
          )
        ) : pending.length === 0 ? <EmptyState title="No pending orders" hint="Limit orders wait here until the market touches your price." /> : (
          <table className="tbl" style={{ minWidth: 600 }}>
            <thead><tr><th>Symbol</th><th>Side</th><th className="r">Qty</th><th className="r">Limit price</th><th className="r">SL / TP</th><th>Placed</th><th /></tr></thead>
            <tbody>{pending.map((o) => (
              <tr key={o.id}>
                <td className="font-medium">{pairLabel(o.symbol)}</td><td><DirBadge dir={o.side} /></td>
                <td className="r num">{o.qty}</td><td className="r num">{fmtPrice(o.limit_price)}</td>
                <td className="r num text-mute">{o.stop_loss ? fmtPrice(o.stop_loss) : '—'} / {o.take_profit ? fmtPrice(o.take_profit) : '—'}</td>
                <td className="text-mute">{fmtDate(o.created_at, 'dd MMM, HH:mm')}</td>
                <td className="r"><button className="btn btn-ghost btn-sm" disabled={busy === `o${o.id}`} onClick={() => cancel(o)}><X size={13} />Cancel</button></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { fmtMoney };
