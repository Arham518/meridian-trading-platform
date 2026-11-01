import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../lib/api.js';
import { useMarket } from '../store/market.js';
import { fmtMoney, fmtPrice, pairLabel } from '../lib/format.js';
import { Field, Spinner, FeedTag } from './ui.jsx';

// Two segmented toggles: [Buy | Sell] and [Long | Short]. Each keeps its own choice; the toggle clicked last
// decides the order (Buy/Long -> BUY side, Sell/Short -> SELL side of the paper order).
const PICKS = { buy: ['BUY', 'Buy'], sell: ['SELL', 'Sell'], long: ['BUY', 'Long'], short: ['SELL', 'Short'] };
function Segmented2({ label, options, value, active, onPick }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-ink/[0.04] border border-line" role="radiogroup" aria-label={label}>
      {options.map(([id, title, sub]) => {
        const on = value === id; const up = PICKS[id][0] === 'BUY';
        return (
          <button key={id} type="button" role="radio" aria-checked={on} onClick={() => onPick(id)}
            className={clsx('min-w-0 rounded-[9px] px-2 py-1.5 text-center border transition-colors',
              on && active && (up ? 'bg-up border-up text-white shadow-sm' : 'bg-down border-down text-white shadow-sm'),
              on && !active && (up ? 'bg-up/12 border-up/30 text-up' : 'bg-down/12 border-down/30 text-down'),
              !on && 'border-transparent text-mute hover:text-ink')}>
            <span className="block text-[0.9375rem] font-semibold leading-tight">{title}</span>
            {sub && <span className={clsx('block text-[0.75rem] leading-tight mt-0.5 whitespace-nowrap', /\d/.test(sub) && 'num', on && active ? 'text-white/85' : 'text-mute')}>{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

const toNum = (v) => (v === '' || v == null ? undefined : Number(v));

export default function OrderPanel({ symbol, balance, onPlaced }) {
  const q = useMarket((s) => s.quotes[symbol]);
  const [spot, setSpot] = useState('buy'); const [pos, setPos] = useState('long'); const [last, setLast] = useState('spot');
  const pick = last === 'spot' ? spot : pos; const side = PICKS[pick][0]; const [type, setType] = useState('market');
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
      toast.success(r.filled ? `${PICKS[pick][1]} ${qty} ${pairLabel(symbol)} filled at ${fmtPrice(r.price, dec)}` : `Limit order placed @ ${fmtPrice(Number(limit), dec)}`);
      setQty(''); setSl(''); setTp(''); onPlaced?.();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-3.5" noValidate>
      <div className="space-y-2">
        <Segmented2 label="Buy or sell" value={spot} active={last === 'spot'} onPick={(v) => { setSpot(v); setLast('spot'); }}
          options={[['buy', 'Buy', fmtPrice(q?.ask ?? q?.price, dec)], ['sell', 'Sell', fmtPrice(q?.bid ?? q?.price, dec)]]} />
        <Segmented2 label="Long or short" value={pos} active={last === 'pos'} onPick={(v) => { setPos(v); setLast('pos'); }}
          options={[['long', 'Long', 'Price up'], ['short', 'Short', 'Price down']]} />
      </div>
      <div className="flex items-center justify-between">
        <div className="inline-flex gap-1" role="tablist" aria-label="Order type">
          {['market', 'limit'].map((t) => <button key={t} type="button" role="tab" aria-selected={type === t} className="tab capitalize" onClick={() => setType(t)}>{t}</button>)}
        </div>
        <div className="text-right"><div className="label !text-[0.75rem]">Market price <FeedTag q={q} /></div><div className="num text-sm">{q ? fmtPrice(q.price, dec) : '—'}</div></div>
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
      <button className={clsx('btn w-full !h-11 text-[0.9375rem]', side === 'BUY' ? 'btn-up' : 'btn-down')} disabled={busy || !(q?.price > 0)}>
        {busy ? <Spinner /> : q && !(q.price > 0) ? 'No live price for this market' : `${PICKS[pick][1]} ${pairLabel(symbol)}`}
      </button>
      <p className="text-[0.8125rem] text-dim text-center">Paper trading only — virtual money, no real orders.</p>
    </form>
  );
}
