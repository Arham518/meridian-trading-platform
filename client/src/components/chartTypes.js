// Chart-type helpers for PriceChart: which lightweight-charts series each type uses, how raw candles are turned into
// that series' data, and the saved chart settings (localStorage).
import { CandlestickSeries, BarSeries, LineSeries, AreaSeries, BaselineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { C } from '../lib/theme.js';

export const CHART_TYPES = [
  { value: 'candles', label: 'Candles' },
  { value: 'hollow', label: 'Hollow candles' },
  { value: 'bars', label: 'Bars' },
  { value: 'heikin', label: 'Heikin Ashi' },
  { value: 'line', label: 'Line' },
  { value: 'linemarkers', label: 'Line with markers' },
  { value: 'area', label: 'Area' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'columns', label: 'Columns' },
];
const TYPE_SET = new Set(CHART_TYPES.map((t) => t.value));
export const OHLC_TYPES = new Set(['candles', 'hollow', 'bars', 'heikin']);

export const STYLE_DEFAULT = {
  body: true, bodyUp: C.candleUp, bodyDown: C.candleDown,
  borders: true, borderUp: C.candleUp, borderDown: C.candleDown,
  wick: true, wickUp: C.candleUp, wickDown: C.candleDown,
  prevClose: false,
  precision: 'default', // 'default' = instrument decimals, else '2'..'5'
  timezone: 'UTC', // 'UTC' | 'local' | IANA zone, see TIMEZONES
};
export const IND_DEFAULT = { ma: true, ema: false, bb: false, vol: true, rsi: false };
export const PRECISIONS = [['default', 'Default'], ['2', '0.01'], ['3', '0.001'], ['4', '0.0001'], ['5', '0.00001']];

export const TIMEZONES = [
  ['UTC', 'UTC'], ['local', 'Browser local time'], ['Asia/Karachi', '(UTC+5) Karachi'], ['Asia/Dubai', '(UTC+4) Dubai'],
  ['Europe/London', 'London'], ['America/New_York', 'New York'], ['Asia/Singapore', '(UTC+8) Singapore'], ['Asia/Tokyo', '(UTC+9) Tokyo'],
];

// ---- time zone: chart times are UTC unix seconds; these formatters render the axis + crosshair label in the chosen zone
const tzCache = new Map();
function tzFormats(tz) {
  if (tzCache.has(tz)) return tzCache.get(tz);
  const timeZone = tz === 'local' ? undefined : tz;
  const mk = (o) => new Intl.DateTimeFormat('en-GB', { timeZone, ...o });
  const f = {
    full: mk({ weekday: 'short', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    year: mk({ year: 'numeric' }), month: mk({ month: 'short' }), day: mk({ day: 'numeric' }),
    time: mk({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), sec: mk({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
  };
  tzCache.set(tz, f); return f;
}
const toDate = (t) => (typeof t === 'number' ? new Date(t * 1000) : typeof t === 'string' ? new Date(`${t}T00:00:00Z`) : new Date(Date.UTC(t.year, t.month - 1, t.day)));
/** lightweight-charts options that show times in `tz` (TickMarkType: 0 Year, 1 Month, 2 DayOfMonth, 3 Time, 4 TimeWithSeconds). */
export function timeOptions(tz) {
  const f = tzFormats(tz);
  return {
    localization: { timeFormatter: (t) => f.full.format(toDate(t)) },
    timeScale: { tickMarkFormatter: (t, k) => { const d = toDate(t); return k === 0 ? f.year.format(d) : k === 1 ? f.month.format(d) : k === 2 ? f.day.format(d) : k === 4 ? f.sec.format(d) : f.time.format(d); } },
  };
}
export const tzLabel = (tz) => (tz === 'local' ? 'Local' : tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace('_', ' '));

const KEY = 'crypto_decoder_chart';
const LEGACY_IND = 'meridian_ind';

export function loadChartPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  let ind = saved.ind;
  if (!ind) { try { ind = JSON.parse(localStorage.getItem(LEGACY_IND) || 'null'); } catch { ind = null; } }
  return {
    type: TYPE_SET.has(saved.type) ? saved.type : 'candles',
    style: sanitizeStyle(saved.style),
    ind: { ...IND_DEFAULT, ...(ind || {}) },
  };
}
function sanitizeStyle(raw) {
  const st = { ...STYLE_DEFAULT, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!TIMEZONES.some(([v]) => v === st.timezone)) st.timezone = STYLE_DEFAULT.timezone;
  if (!PRECISIONS.some(([v]) => v === st.precision)) st.precision = STYLE_DEFAULT.precision;
  return st;
}
export function saveChartPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); localStorage.removeItem(LEGACY_IND); } catch { /* private mode */ }
}

/** Heikin Ashi bars computed from regular OHLC candles. */
export function heikinAshi(d) {
  const out = []; let prev;
  for (const c of d) {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const bar = { time: c.time, open, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), close };
    out.push(bar); prev = bar;
  }
  return out;
}

const T = 'rgba(0,0,0,0)';
/** Is bar i "up"? Either close >= open, or (TradingView's "colour bars based on previous close") close >= previous close. */
const isUp = (arr, i, prevClose) => (prevClose && i > 0 ? arr[i].close >= arr[i - 1].close : arr[i].close >= arr[i].open);

/** Turn raw candles into data for the given chart type. */
export function seriesData(d, type, st) {
  if (!d.length) return [];
  if (type === 'line' || type === 'linemarkers' || type === 'area' || type === 'baseline') return d.map((c) => ({ time: c.time, value: c.close }));
  if (type === 'columns') return d.map((c, i) => ({ time: c.time, value: c.close, color: (isUp(d, i, true) ? st.bodyUp : st.bodyDown) + 'b3' }));
  const src = type === 'heikin' ? heikinAshi(d) : d;
  if (type === 'bars') {
    return src.map((c, i) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, ...(st.prevClose ? { color: isUp(src, i, true) ? st.bodyUp : st.bodyDown } : {}) }));
  }
  return src.map((c, i) => {
    const up = isUp(src, i, st.prevClose);
    const bar = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    // Hollow candles: rising bars (close >= open) are outlined, falling ones filled; colour follows previous close.
    if (type === 'hollow') {
      const rising = c.close >= c.open; const col = isUp(src, i, true) ? 'Up' : 'Down';
      return { ...bar, color: rising ? T : (st.body ? st[`body${col}`] : T), borderColor: st[`border${col}`], wickColor: st.wick ? st[`wick${col}`] : T };
    }
    if (st.prevClose) { const k = up ? 'Up' : 'Down'; return { ...bar, color: st.body ? st[`body${k}`] : T, borderColor: st.borders ? st[`border${k}`] : T, wickColor: st.wick ? st[`wick${k}`] : T }; }
    return bar;
  });
}

/** Series definition + options for a chart type. */
export function seriesSpec(type, st, d) {
  const base = { priceLineVisible: true, priceLineStyle: LineStyle.Dotted };
  switch (type) {
    case 'bars': return [BarSeries, { ...base, upColor: st.bodyUp, downColor: st.bodyDown, openVisible: true, thinBars: false }];
    case 'line': return [LineSeries, { ...base, color: C.accent, lineWidth: 2 }];
    case 'linemarkers': return [LineSeries, { ...base, color: C.accent, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 2.5 }];
    case 'area': return [AreaSeries, { ...base, lineColor: C.accent, topColor: C.accentSoft, bottomColor: C.accentFade, lineWidth: 2 }];
    case 'baseline': {
      const closes = d.map((c) => c.close); const mid = closes.length ? (Math.max(...closes) + Math.min(...closes)) / 2 : 0;
      return [BaselineSeries, { ...base, baseValue: { type: 'price', price: mid }, topLineColor: st.bodyUp, topFillColor1: C.upFill, topFillColor2: 'rgba(18,161,96,0.04)', bottomLineColor: st.bodyDown, bottomFillColor1: 'rgba(224,56,75,0.04)', bottomFillColor2: C.downFill, lineWidth: 2 }];
    }
    case 'columns': {
      // Columns rise from just under the lowest close, not from 0, so price moves stay readable.
      const closes = d.map((c) => c.close); const lo = closes.length ? Math.min(...closes) : 0; const hi = closes.length ? Math.max(...closes) : 0;
      return [HistogramSeries, { ...base, color: C.accent, base: lo - (hi - lo) * 0.04 }];
    }
    default: // candles, hollow, heikin
      return [CandlestickSeries, {
        ...base,
        upColor: type === 'hollow' || !st.body ? T : st.bodyUp, downColor: st.body ? st.bodyDown : T,
        borderVisible: type === 'hollow' || st.borders, borderUpColor: st.borderUp, borderDownColor: st.borderDown,
        wickVisible: st.wick, wickUpColor: st.wickUp, wickDownColor: st.wickDown,
      }];
  }
}
