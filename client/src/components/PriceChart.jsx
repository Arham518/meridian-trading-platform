import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries, CrosshairMode, ColorType, LineStyle } from 'lightweight-charts';
import { CandlestickChart, LineChart, AreaChart, SlidersHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { api, qs } from '../lib/api.js';
import { useMarket } from '../store/market.js';
import { fmtPrice, fmtPct } from '../lib/format.js';
import { Segmented, Spinner, SimTag, ErrorState } from './ui.jsx';
import SymbolPicker from './SymbolPicker.jsx';
import { sma, ema, bollinger, rsi } from './indicators.js';
import { C } from '../lib/theme.js';

const FRAMES = [['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['1h', '1H'], ['4h', '4H'], ['1d', '1D'], ['1w', '1W']];
const STEP = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
const UP = C.candleUp; const DOWN = C.candleDown;
const IND_DEFAULT = { ma: true, ema: false, bb: false, vol: true, rsi: false };

/**
 * Live candlestick chart (TradingView lightweight-charts).
 * `levels`: [{ price, color, title }] drawn as horizontal price lines (signal entry/SL/TP, open positions).
 */
export default memo(function PriceChart({ symbol, onSymbolChange, interval: intervalProp, onIntervalChange, levels = [], className = '', compact = false }) {
  const [intervalState, setIntervalState] = useState('1h');
  const interval = intervalProp || intervalState;
  const setInterval_ = onIntervalChange || setIntervalState;
  const [type, setType] = useState('candles');
  const [ind, setInd] = useState(() => { try { return { ...IND_DEFAULT, ...JSON.parse(localStorage.getItem('meridian_ind') || '{}') }; } catch { return IND_DEFAULT; } });
  const [menu, setMenu] = useState(false);
  const [state, setState] = useState({ loading: true, error: null, source: null });
  const [legend, setLegend] = useState(null);

  const host = useRef(null); const chartRef = useRef(null); const s = useRef({}); const data = useRef([]);
  const lines = useRef([]); const indRef = useRef(ind); indRef.current = ind;
  const decimals = useMarket((m) => m.quotes[symbol]?.decimals ?? 2);

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
    s.current.candles = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN, priceLineVisible: true, priceLineStyle: LineStyle.Dotted });
    s.current.line = chart.addSeries(LineSeries, { color: C.accent, lineWidth: 2, visible: false, priceLineVisible: true });
    s.current.area = chart.addSeries(AreaSeries, { lineColor: C.accent, topColor: C.accentSoft, bottomColor: C.accentFade, lineWidth: 2, visible: false });
    s.current.vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    s.current.ma = chart.addSeries(LineSeries, { color: C.ma, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    s.current.ema = chart.addSeries(LineSeries, { color: C.ema, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    s.current.bbu = chart.addSeries(LineSeries, { color: C.bb, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    s.current.bbl = chart.addSeries(LineSeries, { color: C.bb, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });

    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData?.get(s.current.candles) || p.seriesData?.get(s.current.line) || p.seriesData?.get(s.current.area);
      if (!p.time || !d) return setLegend(null);
      setLegend({ o: d.open ?? d.value, h: d.high ?? d.value, l: d.low ?? d.value, c: d.close ?? d.value });
    });
    return () => { chart.remove(); chartRef.current = null; s.current = {}; lines.current = []; };
  }, []);

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

  useEffect(() => { localStorage.setItem('meridian_ind', JSON.stringify(ind)); applyIndicators(true); }, [ind, applyIndicators]);

  // ---- load candles when symbol / interval changes
  const load = useCallback(async (signal) => {
    setState((p) => ({ ...p, loading: true, error: null }));
    try {
      const r = await api(`/market/klines${qs({ symbol, interval, limit: 400 })}`, { signal });
      if (signal?.aborted || !chartRef.current) return;
      data.current = r.candles; const S = s.current;
      S.candles.setData(r.candles);
      S.line.setData(r.candles.map((c) => ({ time: c.time, value: c.close })));
      S.area.setData(r.candles.map((c) => ({ time: c.time, value: c.close })));
      S.vol.setData(r.candles.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? C.upVol : C.downVol })));
      applyIndicators(true);
      chartRef.current.timeScale().fitContent(); chartRef.current.timeScale().scrollToPosition(6, false);
      setState({ loading: false, error: null, source: r.source });
    } catch (e) { if (e.name !== 'AbortError') setState({ loading: false, error: e.message, source: null }); }
  }, [symbol, interval, applyIndicators]);

  useEffect(() => { const ac = new AbortController(); load(ac.signal); return () => ac.abort(); }, [load]);

  useEffect(() => {
    const p = { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals };
    const S = s.current; ['candles', 'line', 'area'].forEach((k) => S[k]?.applyOptions({ priceFormat: p }));
  }, [decimals, symbol]);

  useEffect(() => {
    const S = s.current;
    S.candles?.applyOptions({ visible: type === 'candles' }); S.line?.applyOptions({ visible: type === 'line' }); S.area?.applyOptions({ visible: type === 'area' });
  }, [type]);

  // ---- live ticks update the last candle
  useEffect(() => {
    let lastPrice = null;
    const unsub = useMarket.subscribe((m) => {
      const q = m.quotes[symbol]; const d = data.current; const S = s.current;
      if (!q || !d.length || !S.candles || q.price === lastPrice) return;
      lastPrice = q.price;
      const step = STEP[interval]; const bucket = Math.floor(Date.now() / 1000 / step) * step; const last = d[d.length - 1];
      let c;
      if (bucket > last.time) { c = { time: bucket, open: last.close, high: Math.max(last.close, q.price), low: Math.min(last.close, q.price), close: q.price, volume: 0 }; d.push(c); }
      else { c = { ...last, close: q.price, high: Math.max(last.high, q.price), low: Math.min(last.low, q.price) }; d[d.length - 1] = c; }
      S.candles.update(c); S.line.update({ time: c.time, value: c.close }); S.area.update({ time: c.time, value: c.close });
      S.vol.update({ time: c.time, value: c.volume, color: c.close >= c.open ? C.upVol : C.downVol });
      applyIndicators(false);
    });
    return unsub;
  }, [symbol, interval, applyIndicators]);

  // ---- horizontal levels (signal entry / SL / TP, open positions)
  const levelsKey = JSON.stringify(levels);
  useEffect(() => {
    const series = s.current.candles; if (!series) return;
    lines.current.forEach((l) => { try { series.removePriceLine(l); } catch { /* chart rebuilt */ } });
    lines.current = levels.map((l) => series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.solid ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true, title: l.title }));
  }, [levelsKey, state.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = data.current[data.current.length - 1]; const first = data.current[0];
  const shown = legend || (last && { o: last.open, h: last.high, l: last.low, c: last.close });
  const chg = shown && first ? ((shown.c - shown.o) / shown.o) * 100 : null;
  const tgl = (k) => setInd((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className={clsx('flex flex-col min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
        <SymbolPicker value={symbol} onChange={onSymbolChange || (() => {})} />
        <Segmented ariaLabel="Timeframe" size="sm" value={interval} onChange={setInterval_} options={FRAMES.map(([v, l]) => ({ value: v, label: l }))} />
        <div className="ml-auto flex items-center gap-2">
          {!compact && (
            <Segmented ariaLabel="Chart type" size="sm" value={type} onChange={setType}
              options={[{ value: 'candles', label: <CandlestickChart size={14} aria-label="Candles" /> }, { value: 'line', label: <LineChart size={14} aria-label="Line" /> }, { value: 'area', label: <AreaChart size={14} aria-label="Area" /> }]} />
          )}
          <div className="relative">
            <button className="btn btn-ghost btn-sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}><SlidersHorizontal size={14} /> <span className="hidden sm:inline">Indicators</span></button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
                <div className="absolute right-0 z-40 mt-2 w-52 glass glass-strong p-2">
                  {[['ma', 'MA (20)', C.ma], ['ema', 'EMA (50)', C.ema], ['bb', 'Bollinger (20, 2)', C.mute], ['vol', 'Volume', C.dim], ['rsi', 'RSI (14)', C.rsi]].map(([k, label, col]) => (
                    <label key={k} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-ink/[0.05] cursor-pointer text-sm">
                      <input type="checkbox" className="accent-[#1a5ad7] size-3.5" checked={!!ind[k]} onChange={() => tgl(k)} />
                      <span className="size-2 rounded-full" style={{ background: col }} />{label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="relative flex-1 min-h-[280px]">
        <div ref={host} className="absolute inset-0" role="img" aria-label={`${symbol} ${interval} price chart`} />
        {shown && (
          <div className="absolute left-3 top-2 z-10 max-w-[55%] flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] num pointer-events-none">
            <span className="text-mute hidden sm:inline">O <b className="text-ink font-medium">{fmtPrice(shown.o, decimals)}</b></span>
            <span className="text-mute hidden sm:inline">H <b className="text-ink font-medium">{fmtPrice(shown.h, decimals)}</b></span>
            <span className="text-mute hidden sm:inline">L <b className="text-ink font-medium">{fmtPrice(shown.l, decimals)}</b></span>
            <span className="text-mute">C <b className={clsx('font-medium', chg >= 0 ? 'up' : 'down')}>{fmtPrice(shown.c, decimals)}</b></span>
            {chg != null && <span className={chg >= 0 ? 'up' : 'down'}>{fmtPct(chg)}</span>}
          </div>
        )}
        <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5 pointer-events-none">
          {state.source === 'binance' && <span className="badge badge-up !h-[18px] !text-[0.75rem]"><span className="live-dot !size-1.5" />Binance live</span>}
          {state.source === 'simulated' && <SimTag title="Simulated data: the live market feed is unavailable for this instrument" />}
        </div>
        {state.loading && <div className="absolute inset-0 z-20 grid place-items-center bg-bg/50"><Spinner className="text-accent-2" /></div>}
        {state.error && <div className="absolute inset-0 z-20 grid place-items-center bg-bg/80"><ErrorState message={state.error} onRetry={() => load()} /></div>}
      </div>
    </div>
  );
});
