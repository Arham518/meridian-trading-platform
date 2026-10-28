import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Menu, X, Plus, Minus, Check, CandlestickChart, Radio, Wallet, FileSpreadsheet } from 'lucide-react';
import clsx from 'clsx';
import Logo from '../components/Logo.jsx';
import TickerTape from '../components/TickerTape.jsx';
import HeroVisual from '../components/HeroVisual.jsx';
import AdSlot from '../components/AdSlot.jsx';
import HeroMedia from '../components/HeroMedia.jsx';
import { useMediaQuery } from '../lib/hooks.js';
import Sparkline from '../components/Sparkline.jsx';
import { Price, Change } from '../components/Price.jsx';
import { useSparklines } from '../components/Watchlist.jsx';
import { useMarket } from '../store/market.js';
import { useSettings } from '../store/settings.js';
import { useAuth } from '../store/auth.js';
import { api } from '../lib/api.js';
import { pairLabel, fmtPct, fmtPrice, timeAgo } from '../lib/format.js';

const PriceChart = lazy(() => import('../components/PriceChart.jsx'));

const FAQ = [
  ['Is this real-money trading?', 'No. Nothing on this site sends an order to a broker or exchange. The paper account uses virtual money, and signals are published for education.'],
  ['Where do the prices come from?', 'Crypto prices and candles come from the public Binance market-data API. Forex, gold, indices and stocks are simulated, and every simulated quote carries a SIM label. If Binance cannot be reached, crypto falls back to simulation and is labelled in the same way.'],
  ['How is a signal result worked out?', 'When the desk closes a signal, the result is calculated from the entry price and the level that was reached: first target, second target or stop loss. The number is stored with the signal. Win rate and totals are computed from those stored rows.'],
  ['Can I take my records with me?', 'Yes. Every history table has a Download Excel button, and your account page has one workbook with trades, orders, watchlist and sign-in activity.'],
  ['Why do I have to confirm my email?', 'Signals and paper trading unlock after you open the link we send. It keeps fake sign-ups out and makes sure password resets reach you.'],
];

let statsCache = null;
function useStats() {
  const [s, setS] = useState(statsCache);
  useEffect(() => { api('/stats').then((d) => { statsCache = d; setS(d); }).catch(() => {}); }, []);
  return s;
}

const reveal = { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { duration: 0.45, ease: 'easeOut' } };

/* ------------------------------------------------------------------ hero */
const BOARD = ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'XAUUSD', 'NAS100'];
function LiveBoard() {
  const q = useMarket((s) => s.quotes); const spark = useSparklines();
  return (
    <div className="glass grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 overflow-hidden" aria-label="Live quotes">
      {BOARD.map((s, i) => {
        const x = q[s];
        return (
          <div key={s} className={clsx('px-4 sm:px-5 py-4 min-w-0 border-line', i > 0 && 'lg:border-l', i % 2 === 1 && 'border-l sm:border-l-0 lg:border-l', i === 4 && 'col-span-2 sm:col-span-1 border-t sm:border-t-0', i >= 3 && 'sm:border-t lg:border-t-0', i === 1 && 'sm:border-l', i === 2 && 'sm:border-l')}>
            <div className="flex items-center justify-between gap-2"><span className="text-[0.9375rem] font-semibold">{pairLabel(s)}</span>{x?.source === 'simulated' && <span className="badge badge-warn !h-[16px] !text-[0.75rem]">SIM</span>}</div>
            <div className="flex items-end justify-between gap-2 mt-2">
              <div className="min-w-0">{x ? <Price value={x.price} decimals={x.decimals} className="text-[1.0625rem] font-semibold block" /> : <span className="num text-mute">--</span>}{x && <Change pct={x.changePct} className="text-[0.875rem] font-medium" />}</div>
              <Sparkline data={spark[s]} width={64} height={26} up={(x?.changePct ?? 0) >= 0} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Default hero visual (home reference): a framed app overview built from live quotes: icon rail, portfolio-style
 *  chart card, pastel asset tiles, market list and a dark promo card. Pure DOM/SVG, no images. */
const TILE = ['bg-lav', 'bg-mint', 'bg-cream'];
function HeroWidgets() {
  const q = useMarket((s) => s.quotes); const spark = useSparklines();
  const btc = q.BTCUSDT; const assets = ['ETHUSDT', 'SOLUSDT', 'XAUUSD'].map((s) => q[s]).filter(Boolean);
  const rows = ['EURUSD', 'NAS100', 'BNBUSDT'].map((s) => q[s]).filter(Boolean);
  const rise = { initial: { opacity: 0, y: 22, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] } };
  return (
    <div className="relative h-full w-full flex items-center" aria-label="Live market overview">
      <div aria-hidden className="absolute inset-[2%] rounded-[48px] bg-[radial-gradient(60%_60%_at_60%_40%,rgba(111,166,239,0.45),transparent_70%),radial-gradient(40%_40%_at_15%_85%,rgba(167,148,245,0.25),transparent_70%)] blur-2xl" />
      <motion.div {...rise} className="relative w-full rounded-[30px] bg-[#101317] p-2 sm:p-2.5 shadow-[0_40px_80px_-30px_rgba(11,20,36,.55)] flex gap-2 sm:gap-2.5">
        <div className="hidden min-[480px]:flex flex-col items-center gap-3 w-12 sm:w-14 py-3 shrink-0" aria-hidden>
          <span className="size-9 rounded-xl bg-cream grid place-items-center text-[#101317]"><CandlestickChart size={16} /></span>
          {[Wallet, Radio, FileSpreadsheet].map((I, i) => <span key={i} className={clsx('size-9 rounded-xl grid place-items-center', i === 0 ? 'bg-white/12 text-white' : 'text-white/55')}><I size={16} /></span>)}
        </div>
        <div className="@container flex-1 min-w-0 rounded-[24px] bg-white/95 p-3.5 sm:p-5">
          <div className="flex items-center justify-between"><span className="text-[1.05rem] sm:text-[1.3rem] font-bold tracking-[-0.03em] text-ink">Overview</span><span className="text-[0.8125rem] text-mute rounded-full border border-line-2 px-2.5 h-6 grid place-items-center">Live</span></div>
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-2.5 sm:gap-3 mt-3">
            <div className="rounded-2xl bg-sky p-3 sm:p-3.5 min-w-0">
              <div className="text-[0.8125rem] font-medium text-mute">Bitcoin</div>
              {btc ? <Price value={btc.price} decimals={btc.decimals} className="block text-[1.05rem] sm:text-[1.35rem] font-bold tracking-[-0.03em] text-ink" /> : <div className="skeleton h-6 w-28 mt-1" />}
              {btc && <Change pct={btc.changePct} className="text-[0.8125rem] font-semibold" />}
              <div className="mt-1.5 -mx-1"><Sparkline data={spark.BTCUSDT} width={240} height={52} up={(btc?.changePct ?? 0) >= 0} className="w-full" /></div>
            </div>
            <div className="grid grid-cols-1 @[34rem]:grid-cols-3 gap-2 min-w-0">
              {(assets.length ? assets : [null, null, null]).map((x, i) => (
                <div key={x?.symbol || i} className={clsx(TILE[i], 'rounded-2xl p-2.5 min-w-0 flex items-center @[34rem]:items-stretch @[34rem]:flex-col justify-between gap-1 [&_.down]:!text-[#9c1426] [&_.up]:!text-[#055c37]')}>
                  <span className="text-[0.8125rem] font-bold text-ink truncate">{x ? pairLabel(x.symbol).replace('/USDT', '') : '··'}</span>
                  <span className="min-w-0">{x ? <Price value={x.price} decimals={x.decimals} className="block text-[0.8125rem] text-ink/80 truncate" /> : <span className="skeleton h-3 w-10 block" />}{x && <Change pct={x.changePct} className="text-[0.75rem] font-semibold" />}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid @[30rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2.5 sm:gap-3 mt-2.5 sm:mt-3">
            <ul className="space-y-1.5 min-w-0">
              {rows.map((x) => (
                <li key={x.symbol} className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 min-w-0">
                  <span className="size-7 rounded-lg bg-[#101317] text-white grid place-items-center text-[0.75rem] font-bold shrink-0">{pairLabel(x.symbol).replace('/', '').slice(0, 3)}</span>
                  <span className="text-[0.875rem] font-semibold text-ink flex-1 truncate">{pairLabel(x.symbol)}</span>
                  <Price value={x.price} decimals={x.decimals} className="text-[0.8125rem] text-ink/80 shrink-0" /><Change pct={x.changePct} className="text-[0.8125rem] font-semibold w-[4.25rem] shrink-0 text-right" />
                </li>
              ))}
              {!rows.length && [0, 1, 2].map((i) => <li key={i} className="skeleton h-7" />)}
            </ul>
            <div className="hidden @[30rem]:flex on-dark rounded-2xl bg-[#101317] p-3.5 flex-col justify-between relative overflow-hidden">
              <span aria-hidden className="absolute -right-6 -bottom-8 w-24 h-16 rounded-xl border border-white/20 rotate-[-10deg]" />
              <p className="text-[0.95rem] font-semibold leading-tight text-white">Practise with <span className="rounded-full border border-white/50 px-1.5">100k</span> paper USD</p>
              <span className="self-start mt-3 rounded-full bg-[#bcd8ff] text-[#0b1424] text-[0.8125rem] font-semibold px-3 h-7 grid place-items-center">Start now</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Hero() {
  const user = useAuth((s) => s.user); const video = useSettings((s) => s.heroVideo); const tagline = useSettings((s) => s.tagline);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [video?.src]);
  const showVideo = video && !failed;
  return (
    <section className="relative">
      <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 xl:gap-14 items-center pt-12 sm:pt-16 lg:pt-20 pb-10 relative z-10">
        <div className="max-w-xl min-w-0">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2 rounded-full glass !rounded-full px-3 py-1.5 text-[0.875rem] font-medium text-mute"><span className="live-dot" />Signals desk · live charts · paper account</motion.p>
          <h1 className="display mt-6 text-[1.98rem] min-[400px]:text-[2.28rem] sm:text-[3.04rem] xl:text-[3.5rem]">
            Every signal comes with its <span className="impact block text-accent uppercase text-[1.6em] leading-[0.98] mt-3 tracking-[0.01em]">entry, stop and targets.</span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.5 }} className="mt-6 text-[1.0625rem] text-mute leading-relaxed max-w-md">
            {tagline && tagline !== 'Trade signals, live charts and paper trading in one place.' ? `${tagline} ` : ''}A desk publishes trade plans. You follow them on live candlestick charts, practise them in a paper account, and export every result to Excel.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.5 }} className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={user ? '/app' : '/register'} className="btn btn-primary !h-12 !px-6 text-[0.95rem]">{user ? 'Open dashboard' : 'Create a free account'}<ArrowRight size={16} /></Link>
            <a href="#record" className="btn btn-ghost !h-12 !px-6 text-[0.95rem]">Read the track record</a>
          </motion.div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] text-mute">{['No card required', 'Virtual money only', 'Excel exports'].map((t) => <li key={t} className="flex items-center gap-2"><Check size={15} className="text-up" />{t}</li>)}</ul>
        </div>
        <div className="relative min-w-0 w-full max-w-[48rem] xl:max-w-none mx-auto min-h-[300px] sm:min-h-[440px] xl:min-h-[32rem] flex">
          {showVideo ? (
            <div className="absolute inset-0 flex items-center">
              <div aria-hidden className="absolute inset-[4%] rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(29,95,224,0.25),transparent_70%)] blur-2xl" />
              <div className="glass glass-strong relative w-full p-2 sm:p-2.5 !rounded-[20px]">
                <HeroMedia video={video} onFail={() => setFailed(true)} className="rounded-[14px]" />
                <div className="glass absolute -left-3 sm:-left-6 -bottom-6 px-4 py-3 hidden min-[420px]:block"><HeroQuote /></div>
              </div>
            </div>
          ) : <HeroWidgets />}
        </div>
      </div>
      <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 relative z-10 pb-4"><LiveBoard /></div>
    </section>
  );
}
function HeroQuote() {
  const x = useMarket((s) => s.quotes.BTCUSDT);
  return <div className="flex items-center gap-3"><span className="size-8 rounded-lg bg-cream text-[#7a4a00] grid place-items-center text-[0.75rem] font-bold">BTC</span><div>{x ? <Price value={x.price} decimals={x.decimals} className="block text-[1.0625rem] font-semibold" /> : <span className="num text-mute">--</span>}{x && <Change pct={x.changePct} className="text-[0.8125rem] font-medium" />}</div></div>;
}

/* ------------------------------------------------------------------ track record */
function Figure({ label, value, tone }) {
  return <div className="glass px-5 py-5 min-w-0"><div className="text-[0.9375rem] font-medium text-mute">{label}</div><div className={clsx('impact text-[2.6rem] sm:text-[3.2rem] mt-3 truncate', tone)}>{value}</div></div>;
}
function Record() {
  const s = useStats();
  const statusText = { hit_tp1: 'Target 1', hit_tp2: 'Target 2', hit_sl: 'Stopped out' };
  return (
    <section id="record" className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16 grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-12 lg:gap-20">
      <motion.div {...reveal}>
        <p className="eyebrow">Track record</p>
        <h2 className="display mt-4 text-[1.9rem] sm:text-[2.58rem]">Wins and losses are recorded the same way.</h2>
        <p className="mt-5 text-mute leading-relaxed max-w-md">These numbers are computed from the signals stored in the database, not from edited screenshots. Entries, stops and targets are visible to members for every row.</p>
        <div className="mt-9 grid grid-cols-2 gap-3">
          <Figure label="Win rate" value={s?.winRate != null ? `${s.winRate}%` : '--'} />
          <Figure label="Closed signals" value={s ? s.wins + s.losses : '--'} />
          <Figure label="Net result" value={s ? fmtPct(s.totalResult, 1) : '--'} tone={s?.totalResult > 0 ? 'up' : s?.totalResult < 0 ? 'down' : ''} />
          <Figure label="Stopped out" value={s?.losses ?? '--'} />
        </div>
        <p className="mt-8 text-[0.875rem] text-dim max-w-sm">Figures above come from the demo dataset that ships with the project until real signals are published. Past results do not predict future performance.</p>
      </motion.div>
      <motion.div {...reveal} className="min-w-0 glass p-5 sm:p-6 self-start">
        <div className="flex items-baseline justify-between"><h3 className="text-[0.9375rem] font-semibold">Recently closed</h3><span className="label">Result per signal</span></div>
        <table className="tbl mt-3">
          <thead><tr><th className="!pl-0">Pair</th><th>Side</th><th>Outcome</th><th className="hidden sm:table-cell">Closed</th><th className="r !pr-0">Result</th></tr></thead>
          <tbody>
            {(s?.recent || []).map((r, i) => (
              <tr key={i}><td className="!pl-0 font-medium">{pairLabel(r.pair)}</td><td><span className={clsx('num text-[0.875rem] font-semibold', r.direction === 'BUY' ? 'up' : 'down')}>{r.direction}</span></td><td className="text-mute">{statusText[r.status]}</td><td className="text-dim hidden sm:table-cell">{timeAgo(r.closedAt)}</td><td className={clsx('r num !pr-0', r.resultPct >= 0 ? 'up' : 'down')}>{fmtPct(r.resultPct)}</td></tr>
            ))}
            {!s?.recent?.length && <tr><td colSpan={5} className="!pl-0 text-mute">Results appear after the first signals close.</td></tr>}
          </tbody>
        </table>
        <Link to="/register" className="link text-[0.9375rem] inline-block mt-5">See entries, stops and targets</Link>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ terminal preview */
function TerminalPreview() {
  const [sym, setSym] = useState('BTCUSDT'); const [show, setShow] = useState(false); const ref = useRef(null);
  const q = useMarket((s) => s.quotes); const order = useMarket((s) => s.order);
  useEffect(() => { const io = new IntersectionObserver(([e]) => e.isIntersecting && setShow(true), { rootMargin: '200px' }); if (ref.current) io.observe(ref.current); return () => io.disconnect(); }, []);
  return (
    <section id="terminal" className="scroll-mt-16">
      <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 py-20 sm:py-24">
        <motion.div {...reveal} className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-6 lg:gap-16 items-end">
          <div><p className="eyebrow">Terminal</p><h2 className="display mt-4 text-[1.75rem] sm:text-[2.43rem]">The terminal, running on live prices.</h2></div>
          <p className="text-mute leading-relaxed max-w-lg">This is the same chart you get after signing in: seven timeframes, moving averages, Bollinger bands, volume and RSI. Pick a symbol on the right.</p>
        </motion.div>
        <motion.div {...reveal} ref={ref} className="glass glass-strong mt-10 !rounded-[20px] overflow-hidden grid lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-h-[420px] lg:min-h-[500px] flex flex-col border-b lg:border-b-0 lg:border-r border-line">
            {show ? <Suspense fallback={<div className="flex-1" />}><PriceChart symbol={sym} onSymbolChange={setSym} compact className="flex-1" /></Suspense> : <div className="flex-1" />}
          </div>
          <ul className="hidden lg:block overflow-hidden">
            {order.slice(0, 10).map((s) => { const x = q[s]; if (!x) return null; return (
              <li key={s}><button onClick={() => setSym(s)} className={clsx('w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left border-b border-line hover:bg-ink/[0.03]', sym === s && 'bg-ink/[0.05] shadow-[inset_2px_0_0_var(--color-accent)]')}>
                <span className="text-[0.9375rem] font-medium">{pairLabel(s)}{x.source === 'simulated' && <span className="text-dim num text-[0.75rem] ml-1.5">SIM</span>}</span>
                <span className="text-right"><Price value={x.price} decimals={x.decimals} className="text-[0.875rem] block" /><Change pct={x.changePct} className="text-[0.8125rem]" /></span>
              </button></li>); })}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ what a signal looks like + features */
const EX = { pair: 'EURUSD', side: 'SELL', tf: '1h', entry: 1.0842, sl: 1.0872, tp1: 1.0804, tp2: 1.0766 };
function SignalExample() {
  return (
    <div className="glass glass-strong" aria-label="Example signal">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2.5"><span className="font-semibold">EUR/USD</span><span className="badge badge-down">SELL</span><span className="num text-[0.875rem] text-dim">{EX.tf}</span></div>
        <span className="label !text-dim">Example</span>
      </div>
      <dl className="grid grid-cols-4 divide-x divide-[color:var(--color-line)]">
        {[['Entry', EX.entry, ''], ['Stop loss', EX.sl, 'down'], ['Target 1', EX.tp1, 'up'], ['Target 2', EX.tp2, 'up']].map(([k, v, t]) => <div key={k} className="px-3 sm:px-5 py-4"><dt className="label !text-[0.75rem]">{k}</dt><dd className={clsx('num text-[1rem] sm:text-[1.25rem] mt-1', t)}>{fmtPrice(v, 4)}</dd></div>)}
      </dl>
      <div className="px-5 pb-5 pt-3">
        <div className="relative h-[6px] rounded-full overflow-hidden bg-line-2"><span className="absolute inset-y-0 left-0 w-[58%] bg-up/45" /><span className="absolute inset-y-0 right-0 w-[42%] bg-down/45" /><span className="absolute inset-y-0 left-[71%] w-[3px] bg-ink" /></div>
        <div className="flex justify-between num text-[0.75rem] text-dim mt-2"><span>TP1</span><span>SL</span></div>
        <p className="text-[0.9375rem] text-mute leading-relaxed mt-4">Rejection at the London session high. Risk is 30 pips for a first target of 38. Invalidated above the stop.</p>
      </div>
    </div>
  );
}

const PARTS = [
  ['01', 'Live charts', 'Candlesticks with moving averages, Bollinger bands, volume and RSI, drawn with the open-source TradingView chart library. Seven timeframes from one minute to one week.', CandlestickChart],
  ['02', 'Signals with a plan', 'Entry, stop loss, two targets, risk rating and written reasoning. New signals reach your screen over a websocket the moment they are published.', Radio],
  ['03', 'A paper account', '100,000 USD of virtual capital. Market and limit orders, stop loss, take profit, live profit and loss, and a journal of every closed trade.', Wallet],
  ['04', 'Records you can keep', 'Signals, trades, orders and sign-ins are stored in the database. Each history page exports to a formatted Excel file with filters applied.', FileSpreadsheet],
];
function Parts() {
  return (
    <section id="product" className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 lg:gap-20">
      <motion.div {...reveal} className="lg:sticky lg:top-24 self-start">
        <p className="eyebrow">What a signal looks like</p>
        <h2 className="display mt-4 text-[1.75rem] sm:text-[2.43rem] mb-8">A plan you can check against the chart.</h2>
        <SignalExample />
      </motion.div>
      <div className="min-w-0 grid sm:grid-cols-2 gap-4 content-start">
        {PARTS.map(([n, t, d, Icon], i) => (
          <motion.div key={n} {...reveal} transition={{ duration: 0.45, delay: i * 0.05 }} className="glass p-5 sm:p-6 transition-transform duration-300 hover:-translate-y-1">
            <span className="size-11 rounded-xl bg-accent-soft text-accent-2 grid place-items-center"><Icon size={20} /></span>
            <h3 className="mt-5 text-[1.15rem] font-semibold tracking-[-0.02em]">{t}</h3><p className="mt-2 text-mute leading-relaxed text-[0.94rem]">{d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ data honesty + steps + FAQ */
function DataSources() {
  const rows = [['Bitcoin, Ether and other crypto pairs', 'Binance public market-data API', 'Live', ''], ['EUR/USD, GBP/USD, USD/JPY, AUD/USD', 'Simulated random walk', 'SIM', 'sim'], ['Gold, S&P 500, Nasdaq 100', 'Simulated random walk', 'SIM', 'sim'], ['Apple, Tesla, Nvidia', 'Simulated random walk', 'SIM', 'sim'], ['Crypto when Binance is unreachable', 'Simulated fallback, switched on automatically', 'SIM', 'sim']];
  return (
    <section id="data" className="scroll-mt-16">
      <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 py-20 sm:py-24 grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-10 lg:gap-20">
        <motion.div {...reveal}><p className="eyebrow">Data sources</p><h2 className="display mt-4 text-[1.75rem] sm:text-[2.43rem]">What is real and what is simulated.</h2></motion.div>
        <motion.div {...reveal} className="glass p-5 sm:p-6 min-w-0 overflow-x-auto">
          <table className="tbl"><thead><tr><th className="!pl-0">Instruments</th><th>Source</th><th className="r !pr-0">Label</th></tr></thead>
            <tbody>{rows.map(([a, b, c, k]) => <tr key={a}><td className="!pl-0 !whitespace-normal">{a}</td><td className="text-mute !whitespace-normal">{b}</td><td className="r !pr-0">{k ? <span className="badge badge-warn">{c}</span> : <span className="badge badge-up">{c}</span>}</td></tr>)}</tbody></table>
          <p className="text-[0.9375rem] text-mute mt-4 leading-relaxed">The paper account fills orders at the quoted price with no slippage or fees, so its results are more forgiving than a real market.</p>
        </motion.div>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [['Register and confirm your email', 'The confirmation link opens the signals desk and the paper account.'], ['Follow the open signals', 'Read the plan, then watch price move between the stop and the first target.'], ['Practise, then review', 'Place the same idea in the paper account and compare it with the record.']];
  return (
    <section id="how" className="scroll-mt-16 px-3 sm:px-5">
      <div className="on-dark glass-navy !rounded-[32px] relative overflow-hidden max-w-[var(--page-max)] mx-auto px-5 sm:px-10 py-14 sm:py-20">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-[radial-gradient(closest-side,rgba(59,123,240,0.45),transparent)]" />
        <div aria-hidden className="absolute -left-24 bottom-0 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(63,211,148,0.16),transparent)]" />
        <div className="relative max-w-[var(--page-max)] mx-auto">
          <motion.p {...reveal} className="eyebrow">How it works</motion.p>
          <motion.h2 {...reveal} className="display mt-4 text-[1.67rem] sm:text-[2.28rem] max-w-2xl">Three steps from sign-up to your first reviewed trade.</motion.h2>
          <ol className="mt-10 grid md:grid-cols-3 gap-4">
            {steps.map(([t, d], i) => (
              <motion.li key={t} {...reveal} transition={{ duration: 0.45, delay: i * 0.06 }} className="glass p-6">
                <span className="size-10 rounded-xl bg-accent text-white grid place-items-center num font-semibold">{i + 1}</span>
                <h3 className="mt-5 font-semibold text-[1.1rem]">{t}</h3><p className="mt-2 text-mute text-[0.9375rem] leading-relaxed">{d}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16 grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-10 lg:gap-20">
      <motion.div {...reveal}><p className="eyebrow">FAQ</p><h2 className="display mt-4 text-[1.75rem] sm:text-[2.43rem]">Questions people ask first.</h2></motion.div>
      <div className="space-y-3">
        {FAQ.map(([q, a], i) => (
          <div key={q} className="glass px-5">
            <button className="w-full flex items-center justify-between gap-6 text-left py-[18px] font-semibold" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>{q}{open === i ? <Minus size={16} className="text-mute shrink-0" /> : <Plus size={16} className="text-mute shrink-0" />}</button>
            <motion.div initial={false} animate={{ height: open === i ? 'auto' : 0, opacity: open === i ? 1 : 0 }} transition={{ duration: 0.2 }} className="overflow-hidden"><p className="pb-5 text-mute leading-relaxed max-w-xl">{a}</p></motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ page */
export default function Landing() {
  const startPolling = useMarket((s) => s.startPolling); const stopPolling = useMarket((s) => s.stopPolling);
  const siteName = useSettings((s) => s.siteName); const user = useAuth((s) => s.user);
  const [menu, setMenu] = useState(false);
  const wide = useMediaQuery('(min-width: 1024px)');
  useEffect(() => { startPolling(); return () => stopPolling(); }, [startPolling, stopPolling]);
  const links = [['Track record', '#record'], ['Terminal', '#terminal'], ['Product', '#product'], ['Data', '#data'], ['FAQ', '#faq']];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-50 px-3 sm:px-5 pt-3">
        <div className="frost max-w-[var(--page-max)] mx-auto h-14 pl-4 pr-2.5 sm:px-5 flex items-center justify-between !rounded-2xl">
          <Link to="/" aria-label={`${siteName} home`}><Logo name={siteName} /></Link>
          <nav className="hidden lg:flex items-center gap-7" aria-label="Primary">{links.map(([l, h]) => <a key={h} href={h} className="text-[0.9375rem] text-mute hover:text-ink transition-colors">{l}</a>)}</nav>
          <div className="hidden lg:flex items-center gap-2">
            {user ? <Link to={user.role === 'admin' ? '/admin' : '/app'} className="btn btn-primary btn-sm !rounded-full">{user.role === 'admin' ? 'Admin panel' : 'Open dashboard'}</Link> : <><Link to="/login" className="btn btn-ghost btn-sm !border-transparent !bg-transparent">Sign in</Link><Link to="/register" className="btn btn-primary btn-sm !rounded-full">Create account</Link></>}
          </div>
          <button className="lg:hidden btn btn-ghost btn-sm btn-icon" onClick={() => setMenu((m) => !m)} aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu}>{menu ? <X size={17} /> : <Menu size={17} />}</button>
        </div>
        {menu && (
          <motion.nav initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="lg:hidden frost !rounded-2xl mt-2 px-5 pb-5 pt-1" aria-label="Mobile">
            {links.map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)} className="block py-3 text-[1.0625rem] border-b border-line">{l}</a>)}
            <div className="grid grid-cols-2 gap-2 pt-4">{user ? <Link to={user.role === 'admin' ? '/admin' : '/app'} className="btn btn-primary col-span-2">{user.role === 'admin' ? 'Admin panel' : 'Open dashboard'}</Link> : <><Link to="/login" className="btn btn-ghost">Sign in</Link><Link to="/register" className="btn btn-primary">Create account</Link></>}</div>
          </motion.nav>
        )}
      </header>
      <div className="max-w-[var(--page-max)] mx-auto px-3 sm:px-5 mt-3"><div className="rounded-xl overflow-hidden border border-line"><TickerTape linkTo={() => (user ? '/app/markets' : '/register')} /></div></div>
      <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8"><AdSlot slot="top" className="mt-4" /></div>
      <main id="main">
      <Hero />
      <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8"><AdSlot slot="landing" className="mt-8" /></div>
      <Record />
      <TerminalPreview />
      <Parts />
      <DataSources />
      <Steps />
      <Faq />

      <section className="px-3 sm:px-5 pb-6">
        <div className="on-dark glass-navy !rounded-[32px] relative overflow-hidden max-w-[var(--page-max)] mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
          <div aria-hidden className="absolute -left-20 -top-28 size-96 rounded-full bg-[radial-gradient(closest-side,rgba(59,123,240,0.4),transparent)]" />
          <div className="relative px-6 sm:px-12 py-14 sm:py-16">
            <p className="display text-[1.6rem] sm:text-[2.2rem] max-w-xl">Open a paper account and read the next signal.</p>
            <p className="text-mute mt-4 max-w-md">Free to join. Confirm your email and the signals desk, charts and the 100,000 USD paper account open straight away.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to={user ? '/app' : '/register'} className="btn btn-primary !h-12 !px-6">{user ? 'Open dashboard' : 'Create an account'}<ArrowRight size={16} /></Link>{!user && <Link to="/login" className="btn btn-light !h-12 !px-6">Sign in</Link>}</div>
          </div>
          {/* 3D candlestick scene: desktop only, mounted when scrolled into view, so three.js never loads on phones or on first paint */}
          <div className="relative hidden lg:block h-[420px] [mask-image:linear-gradient(to_right,transparent,black_25%)]">{wide && <HeroVisual />}</div>
        </div>
      </section>

      </main>

      <footer className="on-dark night mt-6">
        <div className="max-w-[var(--page-max)] mx-auto px-5 sm:px-8 pt-12 pb-10 grid md:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] gap-8">
          <div><Logo name={siteName} /><p className="mt-3 text-[0.9375rem] text-mute max-w-xs">Signals, live charts and a paper account, with every record stored and exportable.</p>
            <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[0.9375rem]" aria-label="Legal"><Link to="/terms" className="text-mute hover:text-ink">Terms of Service</Link><Link to="/privacy" className="text-mute hover:text-ink">Privacy Policy</Link><Link to="/risk" className="text-mute hover:text-ink">Risk Disclosure</Link></nav></div>
          <p className="text-[0.875rem] text-dim leading-relaxed"><b className="text-mute font-semibold">Risk disclosure.</b> Trading foreign exchange, cryptocurrencies, indices and stocks carries a high level of risk and can result in the loss of all invested capital. Signals on this site are educational and are not personal financial advice. Paper-trading results are simulated and ignore real liquidity, slippage and fees. Prices for non-crypto instruments are simulated and labelled SIM. &copy; {new Date().getFullYear()} {siteName}.</p>
        </div>
      </footer>
    </div>
  );
}
