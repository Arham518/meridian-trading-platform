import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../lib/api.js';
import { useMarket } from '../store/market.js';
import { fmtMoney, fmtPrice, pairLabel } from '../lib/format.js';
import { Field, Spinner, SimTag } from './ui.jsx';

const toNum = (v) => (v === '' || v == null ? undefined : Number(v));

export default function OrderPanel({ symbol, balance, onPlaced }) {
  const q = useMarket((s) => s.quotes[symbol]);
  const [side, setSide] = useState('BUY'); const [type, setType] = useState('market');
  const [qty, setQty] = useState(''); const [limit, setLimit] = useState(''); const [sl, setSl] = useState(''); const [tp, setTp] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { setQty(''); setLimit(''); setSl(''); setTp(''); setErr(''); }, [symbol]);

  const ref = type === 'limit' && Number(limit) > 0 ? Number(limit) : q?.price;
  const notional = (Number(qty) || 0) * (ref || 0);
  const dec = q?.decimals ?? 2;
  const quick = (pct) => { if (!ref || !balance) return; const raw = (balance * pct) / ref; setQty(String(Number(raw.toPrecision(4)))); };
  const lvlErr = useMemo(() => {
    if (!ref) return '';
    if (sl && (side === 'BUY' ? Number(sl) >= ref : Number(sl) <= ref)) return `Stop loss must be ${side === 'BUY' ? 'below' : 'above'} the entry price`;
    if (tp && (side === 'BUY' ? Number(tp) <= ref : Number(tp) >= ref)) return `Take profit must be ${side === 'BUY' ? 'above' : 'below'} the entry price`;
    return '';
  }, [sl, tp, side, ref]);

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!(Number(qty) > 0)) return setErr('Enter a quantity greater than 0');
    if (type === 'limit' && !(Number(limit) > 0)) return setErr('Enter a limit price');
    if (lvlErr) return setErr(lvlErr);
    setBusy(true);
    try {
      const r = await api('/trading/orders', { method: 'POST', body: { symbol, side, type, qty: Number(qty), limitPrice: toNum(limit), stopLoss: toNum(sl), takeProfit: toNum(tp) } });
      toast.success(r.filled ? `${side} ${qty} ${pairLabel(symbol)} filled at ${fmtPrice(r.price, dec)}` : `Limit order placed @ ${fmtPrice(Number(limit), dec)}`);
      setQty(''); setSl(''); setTp(''); onPlaced?.();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-3.5" noValidate>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-bg border border-line" role="tablist" aria-label="Order side">
        {['BUY', 'SELL'].map((s) => (
          <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => setSide(s)}
            className={clsx('h-8 rounded-lg text-[13px] font-semibold transition-colors', side === s ? (s === 'BUY' ? 'bg-up text-white' : 'bg-down text-white') : 'text-mute hover:text-ink')}>{s === 'BUY' ? 'Buy / Long' : 'Sell / Short'}</button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="inline-flex gap-1" role="tablist" aria-label="Order type">
          {['market', 'limit'].map((t) => <button key={t} type="button" role="tab" aria-selected={type === t} className="tab capitalize" onClick={() => setType(t)}>{t}</button>)}
        </div>
        <div className="text-right"><div className="label !text-[10px]">Market price {q?.source === 'simulated' && <SimTag />}</div><div className="num text-sm">{q ? fmtPrice(q.price, dec) : '—'}</div></div>
      </div>
      {type === 'limit' && <Field label="Limit price (USD)"><input className="input num" inputMode="decimal" type="number" step="any" min="0" placeholder={q ? fmtPrice(q.price, dec) : ''} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>}
      <Field label={`Quantity (${pairLabel(symbol).split('/')[0]})`}>
        <input className="input num" inputMode="decimal" type="number" step="any" min="0" placeholder="0.00" value={qty} onChange={(e) => setQty(e.target.value)} />
        <div className="grid grid-cols-4 gap-1.5 mt-2">{[0.1, 0.25, 0.5, 1].map((p) => <button key={p} type="button" className="btn btn-ghost btn-sm !h-7 !text-xs" onClick={() => quick(p)}>{p * 100}%</button>)}</div>
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Stop loss"><input className="input num" type="number" step="any" min="0" placeholder="Optional" value={sl} onChange={(e) => setSl(e.target.value)} /></Field>
        <Field label="Take profit"><input className="input num" type="number" step="any" min="0" placeholder="Optional" value={tp} onChange={(e) => setTp(e.target.value)} /></Field>
      </div>
      <dl className="text-xs space-y-1.5 pt-1">
        <div className="flex justify-between"><dt className="text-mute">Order value</dt><dd className="num">{fmtMoney(notional)}</dd></div>
        <div className="flex justify-between"><dt className="text-mute">Available (paper)</dt><dd className="num">{fmtMoney(balance)}</dd></div>
      </dl>
      {(err || lvlErr) && <p role="alert" className="text-xs text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">{err || lvlErr}</p>}
      <button className={clsx('btn w-full !h-11 text-[0.9375rem]', side === 'BUY' ? 'btn-up' : 'btn-down')} disabled={busy || !q}>
        {busy ? <Spinner /> : `${side === 'BUY' ? 'Buy' : 'Sell'} ${pairLabel(symbol)}`}
      </button>
      <p className="text-[11px] text-dim text-center">Paper trading only — virtual money, no real orders.</p>
    </form>
  );
}
