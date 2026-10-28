import { Link } from 'react-router-dom';
import { CandlestickChart, Radio, History, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import { useMarket } from '../store/market.js';
import { pairLabel, fmtPct, fmtSigned } from '../lib/format.js';
import { Price } from './Price.jsx';
import { Skeleton } from './ui.jsx';

/** Big balance: whole dollars bright, cents dimmed (mobile reference). */
function Balance({ value }) {
  if (value == null) return <Skeleton className="h-11 w-56 mt-2 !bg-white/15" />;
  const [whole, cents] = Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return <p className="impact text-[3.1rem] min-[400px]:text-[3.4rem] !leading-[1.12] mt-2" data-testid="mobile-balance">${whole}<span className="text-white/55">.{cents}</span></p>;
}

const ACTIONS = [
  { to: '/app/trade', label: 'Trade', icon: CandlestickChart },
  { to: '/app/signals', label: 'Signals', icon: Radio },
  { to: '/app/records', label: 'History', icon: History },
];

/** 24h change of the watchlist as blue bars (taller = bigger move; the strongest move is highlighted). */
function MoveBars({ list }) {
  if (!list.length) return null;
  const max = Math.max(0.5, ...list.map((q) => Math.abs(q.changePct || 0)));
  const best = list.reduce((b, q, i) => (Math.abs(q.changePct || 0) > Math.abs(list[b].changePct || 0) ? i : b), 0);
  return (
    <section className="px-1 pt-2" aria-label="24 hour moves of your watchlist">
      <div className="flex items-center justify-between text-white/85 text-[0.875rem] mb-2"><span className="font-semibold text-white">24h moves</span><span>Watchlist</span></div>
      <div className="flex items-end gap-3 h-[150px] border-b border-white/15 relative">
        {[0.33, 0.66].map((g) => <span key={g} aria-hidden className="absolute inset-x-0 border-t border-dashed border-white/12" style={{ bottom: `${g * 100}%` }} />)}
        {list.map((q, i) => {
          const h = (Math.abs(q.changePct || 0) / max) * 100;
          return (
            <div key={q.symbol} className="flex-1 h-full flex flex-col justify-end items-center gap-1 relative" title={`${pairLabel(q.symbol)} ${fmtPct(q.changePct)}`}>
              <span className={clsx('num text-[0.75rem]', q.changePct >= 0 ? 'text-[#8ff0c4]' : 'text-[#ffb3bb]')}>{fmtPct(q.changePct, 1)}</span>
              <div className="w-full max-w-[34px] rounded-t-[8px] overflow-hidden flex flex-col justify-end" style={{ height: `${Math.max(h, 6)}%` }}>
                <div className={clsx('w-full h-full', i === best ? 'bg-[linear-gradient(180deg,#bcd8ff,#6fa6ef)]' : 'bg-[linear-gradient(180deg,rgba(111,166,239,.9),rgba(111,166,239,.45))]')} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-1.5">{list.map((q) => <span key={q.symbol} className="flex-1 text-center text-[0.75rem] text-white/80 truncate">{pairLabel(q.symbol).split('/')[0]}</span>)}</div>
    </section>
  );
}

/** Mobile home (<768px): sky-to-navy band with a frosted portfolio card, top holdings and a bar chart. */
export default function MobileHome({ portfolio: p }) {
  const watch = useMarket((s) => s.watchlist); const quotes = useMarket((s) => s.quotes);
  const syms = (watch.length ? watch : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'EURUSD', 'XAUUSD']);
  const list = syms.map((s) => quotes[s]).filter(Boolean);
  const total = p ? p.equity - p.startBalance : 0; const pct = p ? (total / p.startBalance) * 100 : 0;
  return (
    <div className="md:hidden -mx-4 -mt-1 px-4 pt-4 pb-7 mb-5 mobile-band rounded-b-[34px] space-y-4" data-testid="mobile-home">
      <section className="glass-navy p-5" aria-label="Paper portfolio">
        <p className="text-[0.9375rem] text-white/85">Your paper portfolio value</p>
        <Balance value={p?.equity} />
        {p && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="glass-chip !rounded-full h-7 px-2.5 inline-flex items-center gap-1.5 text-[0.875rem] num">{total >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{fmtPct(pct)}</span>
            <span className="glass-chip !rounded-full h-7 px-2.5 inline-flex items-center text-[0.875rem] num">{fmtSigned(total)} USD since start</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2.5 mt-5">
          {ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} className="glass-chip h-[70px] flex flex-col items-center justify-center gap-1.5 text-[0.9375rem] font-medium"><a.icon size={18} />{a.label}</Link>
          ))}
        </div>
      </section>

      <section className="glass-navy !bg-[linear-gradient(160deg,rgba(20,42,82,.86),rgba(8,20,43,.92))] p-5" aria-label="Watchlist">
        <div className="flex items-center justify-between"><h2 className="text-[1.05rem] font-semibold">Your watchlist</h2><Link to="/app/markets" className="text-[0.9375rem] font-semibold underline underline-offset-4 text-white">See all</Link></div>
        <ul className="mt-3 space-y-3">
          {list.slice(0, 3).map((q) => (
            <li key={q.symbol}>
              <Link to={`/app/trade/${q.symbol}`} className="flex items-center gap-3">
                <span className="size-11 rounded-full grid place-items-center text-[0.875rem] font-bold bg-[#2a5aa8] border border-white/20 shrink-0">{pairLabel(q.symbol).replace('/USDT', '').replace('/', '').slice(0, 2)}</span>
                <span className="min-w-0 flex-1"><span className="block text-[1rem] font-semibold uppercase tracking-wide truncate">{q.name || pairLabel(q.symbol)}</span><span className="block text-[0.8125rem] text-white/75">{pairLabel(q.symbol)}</span></span>
                <span className="text-right shrink-0"><Price value={q.price} decimals={q.decimals} className="block text-[1rem] font-semibold" /><span className={clsx('num text-[0.875rem] inline-flex items-center gap-1', q.changePct >= 0 ? 'text-[#8ff0c4]' : 'text-[#ffb3bb]')}>{q.changePct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{fmtPct(q.changePct)}</span></span>
              </Link>
            </li>
          ))}
          {!list.length && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-11 !bg-white/10" /></li>)}
        </ul>
      </section>

      <MoveBars list={list.slice(0, 6)} />
    </div>
  );
}
