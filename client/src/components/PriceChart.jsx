import { createPortal } from 'react-dom';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, HistogramSeries, CrosshairMode, ColorType, LineStyle } from 'lightweight-charts';
import { SlidersHorizontal, ChevronDown, Settings2, Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import { api, qs } from '../lib/api.js';
import { useMarket } from '../store/market.js';
import { fmtPrice, fmtPct } from '../lib/format.js';
import { Segmented, Spinner, SimTag, ErrorState, Modal } from './ui.jsx';
import SymbolPicker from './SymbolPicker.jsx';
import { sma, ema, bollinger, rsi } from './indicators.js';
import { CHART_TYPES, OHLC_TYPES, STYLE_DEFAULT, PRECISIONS, TIMEZONES, timeOptions, tzLabel, loadChartPrefs, saveChartPrefs, seriesData, seriesSpec } from './chartTypes.js';
import ChartTypeIcon from './chartIcons.jsx';
import { C } from '../lib/theme.js';
import { getSocket } from '../lib/socket.js';
import { useAuth } from '../store/auth.js';
import ChartDrawings from './chartDrawings/ChartDrawings.jsx';

const FRAMES = [['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W']];
const STEP = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
const fmtVol = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(2)}K` : v.toFixed(2));
const INDICATORS = [['ma', 'Moving Average (20)', C.ma], ['ema', 'EMA (50)', C.ema], ['bb', 'Bollinger Bands (20, 2)', C.mute], ['vol', 'Volume', C.dim], ['rsi', 'RSI (14)', C.rsi]];

/** Small dropdown popover; closes on outside click / Escape. Motion is skipped under prefers-reduced-motion. */
function Popover({ open, onClose, children, className = '' }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
          <motion.div className={clsx('absolute z-40 mt-2 glass glass-strong glass-pop p-1.5', className)}
            initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ColorPair({ label, enabled, onToggle, up, down, onUp, onDown, disabled }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label className={clsx('flex items-center gap-2.5 text-sm', disabled && 'opacity-50')}>
        <input type="checkbox" className="accent-[#1a5ad7] size-3.5" checked={enabled} disabled={disabled} onChange={onToggle} />{label}
      </label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} up colour`} value={up} onChange={(e) => onUp(e.target.value)} className="size-7 rounded-md border border-line bg-transparent cursor-pointer p-0.5" />
        <input type="color" aria-label={`${label} down colour`} value={down} onChange={(e) => onDown(e.target.value)} className="size-7 rounded-md border border-line bg-transparent cursor-pointer p-0.5" />
      </div>
    </div>
  );
}

function ChartSettings({ open, onClose, style, setStyle, type }) {
  const set = (p) => setStyle((s) => ({ ...s, ...p }));
  const candleLike = type !== 'bars';
  // portal: the chart card uses backdrop-filter, which would otherwise trap this position:fixed dialog inside the card
  return createPortal(
    <Modal open={open} onClose={onClose} title="Chart settings" width="max-w-md"
      footer={<><button className="btn btn-ghost btn-sm" onClick={() => setStyle(STYLE_DEFAULT)}>Reset to defaults</button><button className="btn btn-primary btn-sm" onClick={onClose}>Done</button></>}>
      <p className="label mb-1">Candles</p>
      <div className="divide-y divide-line">
        <ColorPair label="Body" enabled={style.body} onToggle={() => set({ body: !style.body })} up={style.bodyUp} down={style.bodyDown} onUp={(v) => set({ bodyUp: v })} onDown={(v) => set({ bodyDown: v })} />
        <ColorPair label="Borders" enabled={style.borders} disabled={!candleLike} onToggle={() => set({ borders: !style.borders })} up={style.borderUp} down={style.borderDown} onUp={(v) => set({ borderUp: v })} onDown={(v) => set({ borderDown: v })} />
        <ColorPair label="Wick" enabled={style.wick} disabled={!candleLike} onToggle={() => set({ wick: !style.wick })} up={style.wickUp} down={style.wickDown} onUp={(v) => set({ wickUp: v })} onDown={(v) => set({ wickDown: v })} />
      </div>
      <label className="flex items-center gap-2.5 text-sm mt-3">
        <input type="checkbox" className="accent-[#1a5ad7] size-3.5" checked={style.prevClose} onChange={() => set({ prevClose: !style.prevClose })} />
        Colour bars based on previous close
      </label>
      <p className="label mt-5 mb-1.5">Price scale</p>
      <label className="flex items-center justify-between gap-3 text-sm">
        Precision
        <select className="input !h-9 !w-36" value={style.precision} onChange={(e) => set({ precision: e.target.value })}>
          {PRECISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-sm mt-3">
        Timezone
        <select className="input !h-9 !w-44" value={style.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <p className="text-xs text-dim mt-4">Saved in this browser. Up / down colours apply to candles, bars, columns and baseline.</p>
    </Modal>,
    document.body,
  );
}

/**
 * Live price chart (TradingView lightweight-charts) with a chart-type menu, chart settings and indicators.
 * `levels`: [{ price, color, title }] drawn as horizontal price lines (signal entry/SL/TP, open positions).
 */
export default memo(function PriceChart({ symbol, onSymbolChange, interval: intervalProp, onIntervalChange, levels = [], className = '', compact = false }) {
  const [intervalState, setIntervalState] = useState('1h');
  const interval = intervalProp || intervalState;
  const setInterval_ = onIntervalChange || setIntervalState;
  const [prefs] = useState(loadChartPrefs);
  const [type, setType] = useState(prefs.type);
  const [style, setStyle] = useState(prefs.style);
  const [ind, setInd] = useState(prefs.ind);
  const [menu, setMenu] = useState(null); // 'type' | 'ind' | null
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [state, setState] = useState({ loading: true, error: null, source: null });
  const [legend, setLegend] = useState(null);
  const [mainVer, setMainVer] = useState(0);
  // Binance market for crypto charts: spot or USD-M perpetual futures (live via the server's kline stream hub)
  const [market, setMarket] = useState(() => { try { return localStorage.getItem('cd_chart_market') === 'futures' ? 'futures' : 'spot'; } catch { return 'spot'; } });
  useEffect(() => { try { localStorage.setItem('cd_chart_market', market); } catch { /* */ } }, [market]);
  const authed = useAuth((a) => !!a.user);
  const [live, setLive] = useState(false); // true while Binance WS candles are arriving
  const lastWs = useRef(0);
  const wrapRef = useRef(null); const canvasRef = useRef(null);

  const host = useRef(null); const chartRef = useRef(null); const s = useRef({}); const data = useRef([]);
  const lines = useRef([]); const indRef = useRef(ind); indRef.current = ind;
  const view = useRef({ type, style }); view.current = { type, style };
  const decimals = useMarket((m) => m.quotes[symbol]?.decimals ?? 2);
  const precision = style.precision === 'default' ? decimals : Number(style.precision);
  const precRef = useRef(precision); precRef.current = precision;

  useEffect(() => { saveChartPrefs({ type, style, ind }); }, [type, style, ind]);

  // ---- create chart once
  useEffect(() => {
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.mute, fontFamily: '"Geist Mono Variable", ui-monospace, monospace', fontSize: 13, panes: { separatorColor: C.separator } },
      grid: { vertLines: { color: C.gridV }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: C.cross, labelBackgroundColor: C.crossLabel }, horzLine: { color: C.cross, labelBackgroundColor: C.crossLabel } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 9 },
      handleScale: { axisPressedMouseMove: true }, kineticScroll: { touch: true, mouse: false },
    });
    chartRef.current = chart;
    s.current.vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    s.current.ma = chart.addSeries(LineSeries, { color: C.ma, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    s.current.ema = chart.addSeries(LineSeries, { color: C.ema, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    s.current.bbu = chart.addSeries(LineSeries, { color: C.bb, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    s.current.bbl = chart.addSeries(LineSeries, { color: C.bb, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });

    // Legend always shows the real OHLC of the hovered bar (also for Heikin Ashi / line types).
    chart.subscribeCrosshairMove((p) => {
      const c = p.time != null && p.logical != null ? data.current[Math.round(p.logical)] : null;
      if (!c || c.time !== p.time) return setLegend(null);
      setLegend({ o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume });
    });
    return () => { chart.remove(); chartRef.current = null; s.current = {}; lines.current = []; };
  }, []);

  const volData = (d, st) => d.map((c, i) => {
    const up = st.prevClose && i > 0 ? c.close >= d[i - 1].close : c.close >= c.open;
    return { time: c.time, value: c.volume, color: (up ? st.bodyUp : st.bodyDown) + '4d' };
  });

  // ---- main price series: rebuilt when the chart type changes, restyled when settings change
  const paintMain = useCallback(() => {
    const S = s.current; const d = data.current; const { type: t, style: st } = view.current;
    if (!S.main) return;
    const [, opts] = seriesSpec(t, st, d);
    S.main.applyOptions({ ...opts, priceFormat: { type: 'price', precision: precRef.current, minMove: 1 / 10 ** precRef.current } });
    S.main.setData(seriesData(d, t, st));
    S.vol.setData(volData(d, st));
  }, []);

  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    const S = s.current;
    if (S.main) { lines.current = []; chart.removeSeries(S.main); }
    const [def, opts] = seriesSpec(type, view.current.style, data.current);
    S.main = chart.addSeries(def, opts);
    S.main.setSeriesOrder(1); // above volume, below indicator lines
    paintMain();
    setMainVer((v) => v + 1);
  }, [type, paintMain]);

  useEffect(() => { paintMain(); }, [style, precision, paintMain]);
  // time axis + crosshair label in the chosen time zone
  useEffect(() => { chartRef.current?.applyOptions(timeOptions(style.timezone)); }, [style.timezone]);

  const applyIndicators = useCallback((full = true) => {
    const d = data.current; const i = indRef.current; const S = s.current;
    if (!S.ma || !d.length) return;
    const put = (series, arr) => (full ? series.setData(arr) : arr.length && series.update(arr[arr.length - 1]));
    S.ma.applyOptions({ visible: i.ma }); S.ema.applyOptions({ visible: i.ema }); S.bbu.applyOptions({ visible: i.bb }); S.bbl.applyOptions({ visible: i.bb }); S.vol.applyOptions({ visible: i.vol });
    if (i.ma) put(S.ma, sma(d, 20));
    if (i.ema) put(S.ema, ema(d, 50));
    if (i.bb) { const b = bollinger(d); put(S.bbu, b.up); put(S.bbl, b.lo); }
    if (i.rsi && S.rsi) put(S.rsi, rsi(d));
  }, []);

  // ---- RSI lives in its own pane: add / remove on toggle
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    if (ind.rsi && !s.current.rsi) {
      const r = chart.addSeries(LineSeries, { color: C.rsi, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } }, 1);
      r.createPriceLine({ price: 70, color: C.downFill, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
      r.createPriceLine({ price: 30, color: C.upFill, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
      s.current.rsi = r; chart.panes()[1]?.setHeight(110);
      r.setData(rsi(data.current));
    } else if (!ind.rsi && s.current.rsi) { chart.removeSeries(s.current.rsi); s.current.rsi = null; }
  }, [ind.rsi, state.loading]);

  useEffect(() => { applyIndicators(true); }, [ind, applyIndicators]);

  // ---- load candles when symbol / interval changes
  const load = useCallback(async (signal) => {
    setState((p) => ({ ...p, loading: true, error: null }));
    try {
      const r = await api(`/market/klines${qs({ symbol, interval, limit: 400, market })}`, { signal });
      if (signal?.aborted || !chartRef.current) return;
      data.current = r.candles;
      paintMain();
      applyIndicators(true);
      chartRef.current.timeScale().fitContent(); chartRef.current.timeScale().scrollToPosition(6, false);
      setState({ loading: false, error: null, source: r.source, stale: !!r.stale });
    } catch (e) { if (e.name !== 'AbortError') setState({ loading: false, error: e.message, source: null }); }
  }, [symbol, interval, market, applyIndicators, paintMain]);

  useEffect(() => { const ac = new AbortController(); load(ac.signal); return () => ac.abort(); }, [load]);

  // ---- apply one candle (live WS kline or REST fallback): updates only the forming bar, appends on a new bar.
  // Chart updates go straight to the series through refs, so ticks never re-render the React tree.
  const applyCandle = useCallback((c) => {
    const d = data.current; const S = s.current; if (!d.length || !S.main) return;
    const last = d[d.length - 1];
    if (c.time < last.time) return;
    if (c.time === last.time) d[d.length - 1] = { ...c }; else d.push({ ...c });
    const { type: t, style: st } = view.current;
    // Heikin Ashi / previous-close colouring depend on earlier bars, so derive the point from the last two bars only.
    const tail = d.slice(-2); const from = t === 'heikin' ? d : tail;
    const pts = seriesData(from, t, st);
    S.main.update(pts[pts.length - 1]);
    const vp = volData(tail, st); S.vol.update(vp[vp.length - 1]);
    applyIndicators(false);
  }, [applyIndicators]);

  // ---- quote ticks update the last candle (non-Binance feeds, or when the kline stream is not delivering)
  useEffect(() => {
    let lastPrice = null;
    const unsub = useMarket.subscribe((m) => {
      if (market === 'futures' || Date.now() - lastWs.current < 15e3) return; // WS candles are authoritative
      const q = m.quotes[symbol]; const d = data.current; const S = s.current;
      if (!q || !d.length || !S.main || q.price === lastPrice) return;
      lastPrice = q.price;
      const step = STEP[interval]; const bucket = Math.floor((q.ts || Date.now()) / 1000 / step) * step; // market time: closed markets do not grow empty candles
      const last = d[d.length - 1];
      if (bucket < last.time) return;
      applyCandle(bucket > last.time
        ? { time: bucket, open: last.close, high: Math.max(last.close, q.price), low: Math.min(last.close, q.price), close: q.price, volume: 0 }
        : { ...last, close: q.price, high: Math.max(last.high, q.price), low: Math.min(last.low, q.price) });
    });
    return unsub;
  }, [symbol, interval, market, applyCandle]);

  // ---- live Binance candles over socket.io: the server keeps ONE multiplexed Binance WS per market and fans out
  // to every viewer. Falls back to REST polling when the socket is missing (guests) or the stream goes quiet.
  const isBinance = state.source === 'binance';
  useEffect(() => {
    if (!isBinance) { setLive(false); return undefined; }
    lastWs.current = 0; setLive(false);
    const sub = { symbol, interval, market };
    let sock = null;
    const onKline = (m) => {
      if (m.market !== market || m.symbol !== symbol || m.interval !== interval) return;
      if (!lastWs.current) setLive(true);
      lastWs.current = Date.now(); applyCandle(m.candle);
    };
    const subscribe = () => sock?.emit('kline:sub', sub);
    const attach = () => {
      const cur = getSocket(); if (cur === sock) return;
      if (sock) { sock.off('kline', onKline); sock.off('connect', subscribe); }
      sock = cur; if (!sock) return;
      sock.on('kline', onKline); sock.on('connect', subscribe); if (sock.connected) subscribe();
    };
    attach();
    let busy = false;
    const poll = setInterval(async () => {
      attach(); // socket may appear after sign-in
      if (Date.now() - lastWs.current < 15e3) return;
      if (lastWs.current) { lastWs.current = 0; setLive(false); }
      if (busy || document.hidden) return; busy = true;
      try { const r = await api(`/market/klines${qs({ symbol, interval, limit: 20, market })}`); r.candles?.slice(-3).forEach(applyCandle); } catch { /* keep last candles */ } finally { busy = false; }
    }, 10e3);
    return () => { clearInterval(poll); if (sock) { sock.off('kline', onKline); sock.off('connect', subscribe); sock.emit('kline:unsub'); } };
  }, [isBinance, symbol, interval, market, applyCandle, authed]);

  // ---- horizontal levels (signal entry / SL / TP, open positions)
  const levelsKey = JSON.stringify(levels);
  useEffect(() => {
    const series = s.current.main; if (!series) return;
    lines.current.forEach((l) => { try { series.removePriceLine(l); } catch { /* chart rebuilt */ } });
    lines.current = levels.map((l) => series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.solid ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true, title: l.title }));
  }, [levelsKey, state.loading, mainVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = data.current[data.current.length - 1]; const first = data.current[0];
  const shown = legend || (last && { o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
  const chg = shown && first ? ((shown.c - shown.o) / shown.o) * 100 : null;
  const tgl = (k) => setInd((p) => ({ ...p, [k]: !p[k] }));
  const closeMenu = useCallback(() => setMenu(null), []);
  const typeLabel = CHART_TYPES.find((t) => t.value === type)?.label || 'Candles';
  const fmt = (v) => fmtPrice(v, precision);
  const getChart = useCallback(() => chartRef.current, []);
  const getSeries = useCallback(() => s.current.main, []);
  const getData = useCallback(() => data.current, []);
  const ivRef = useRef(interval); ivRef.current = interval;
  const getStep = useCallback(() => STEP[ivRef.current] || 3600, []);

  return (
    <div className={clsx('flex flex-col min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
        <SymbolPicker value={symbol} onChange={onSymbolChange || (() => {})} />
        <Segmented ariaLabel="Timeframe" size="sm" value={interval} onChange={setInterval_} options={FRAMES.map(([v, l]) => ({ value: v, label: l }))} />
        {(isBinance || market === 'futures') && <Segmented ariaLabel="Binance market" size="sm" value={market} onChange={setMarket} options={[{ value: 'spot', label: 'Spot' }, { value: 'futures', label: 'Perp' }]} />}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <button className="btn btn-ghost btn-sm gap-1" onClick={() => setMenu((m) => (m === 'type' ? null : 'type'))} aria-haspopup="menu" aria-expanded={menu === 'type'} aria-label={`Chart type: ${typeLabel}`} title="Chart type">
              <ChartTypeIcon type={type} /><ChevronDown size={13} className="text-dim" />
            </button>
            <Popover open={menu === 'type'} onClose={closeMenu} className="right-0 w-56">
              <p className="px-2.5 pt-1.5 pb-1 text-[0.7rem] uppercase tracking-wider text-dim">Chart type</p>
              <div role="menu" aria-label="Chart type">
                {CHART_TYPES.map((t) => (
                  <button key={t.value} role="menuitemradio" aria-checked={type === t.value} onClick={() => { setType(t.value); closeMenu(); }}
                    className={clsx('w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-left hover:bg-ink/[0.05]', type === t.value && 'bg-accent/10 text-accent')}>
                    <ChartTypeIcon type={t.value} /><span className="flex-1">{t.label}</span>{type === t.value && <Check size={14} />}
                  </button>
                ))}
              </div>
            </Popover>
          </div>
          <div className="relative">
            <button className="btn btn-ghost btn-sm" onClick={() => setMenu((m) => (m === 'ind' ? null : 'ind'))} aria-haspopup="menu" aria-expanded={menu === 'ind'} title="Indicators"><SlidersHorizontal size={14} /> <span className="hidden sm:inline">Indicators</span></button>
            <Popover open={menu === 'ind'} onClose={closeMenu} className="right-0 w-60">
              <p className="px-2.5 pt-1.5 pb-1 text-[0.7rem] uppercase tracking-wider text-dim">Indicators</p>
              {INDICATORS.map(([k, label, col]) => (
                <label key={k} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-ink/[0.05] cursor-pointer text-sm">
                  <input type="checkbox" className="accent-[#1a5ad7] size-3.5" checked={!!ind[k]} onChange={() => tgl(k)} />
                  <span className="size-2 rounded-full" style={{ background: col }} />{label}
                </label>
              ))}
            </Popover>
          </div>
          {!compact && (
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSettingsOpen(true)} aria-label="Chart settings" title="Chart settings"><Settings2 size={15} /></button>
          )}
        </div>
      </div>
      <ChartDrawings enabled={!compact} wrapperRef={wrapRef} canvasRef={canvasRef} regionClass="relative flex-1 min-h-[280px] min-w-0"
        getChart={getChart} getSeries={getSeries} getData={getData} getStep={getStep}
        storeKey={{ symbol, interval, market: isBinance || market === 'futures' ? market : 'spot' }} authed={authed} fmt={fmt} dataVersion={mainVer}>
        <div ref={host} className="absolute inset-0" role="img" aria-label={`${symbol} ${interval} price chart`} />
        {shown && (
          <div className="absolute left-3 top-2 z-10 max-w-[55%] flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] num pointer-events-none">
            <span className="text-mute hidden sm:inline">O <b className="text-ink font-medium">{fmt(shown.o)}</b></span>
            <span className="text-mute hidden sm:inline">H <b className="text-ink font-medium">{fmt(shown.h)}</b></span>
            <span className="text-mute hidden sm:inline">L <b className="text-ink font-medium">{fmt(shown.l)}</b></span>
            <span className="text-mute">C <b className={clsx('font-medium', chg >= 0 ? 'up' : 'down')}>{fmt(shown.c)}</b></span>
            {chg != null && <span className={chg >= 0 ? 'up' : 'down'}>{fmtPct(chg)}</span>}
            {!compact && style.timezone !== 'UTC' && <span className="text-dim text-[0.72rem]">{tzLabel(style.timezone)}</span>}
            {ind.vol && shown.v != null && <span className="text-mute hidden md:inline">Vol <b className="text-ink font-medium">{fmtVol(shown.v)}</b></span>}
            {!OHLC_TYPES.has(type) && <span className="text-dim hidden md:inline">{typeLabel}</span>}
          </div>
        )}
        <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5 pointer-events-none">
          {state.source === 'binance' && <span className="badge badge-up !h-[18px] !text-[0.75rem]" title={live ? 'Live candles from the Binance WebSocket stream' : 'Binance REST (polling); live stream connecting'}><span className="live-dot !size-1.5" />Binance {market === 'futures' ? 'Perp' : 'Spot'}{live ? ' · WS' : ''}</span>}
          {state.source === 'yahoo' && <span className="badge badge-up !h-[18px] !text-[0.75rem]"><span className="live-dot !size-1.5" />Real data · Yahoo Finance</span>}
          {state.stale && <span className="badge badge-warn !h-[18px] !text-[0.75rem]">DELAYED</span>}
          {state.source === 'simulated' && <SimTag title="Simulated data: the live market feed is unavailable for this instrument" />}
        </div>
        {!state.loading && !state.error && state.source === 'unavailable' && <div className="absolute inset-0 z-20 grid place-items-center"><p className="glass glass-pop !rounded-xl px-4 py-3 text-[0.9375rem] text-mute text-center max-w-[18rem]">No free live feed is answering for this market right now. We never show made-up prices.</p></div>}
        {state.loading && <div className="absolute inset-0 z-20 grid place-items-center bg-bg/50"><Spinner className="text-accent-2" /></div>}
        {state.error && <div className="absolute inset-0 z-20 grid place-items-center bg-bg/80"><ErrorState message={state.error} onRetry={() => load()} /></div>}
      </ChartDrawings>
      {!compact && <ChartSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} style={style} setStyle={setStyle} type={type} />}
    </div>
  );
});
