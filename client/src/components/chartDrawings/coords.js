// Chart <-> screen coordinate conversion. Drawings are stored as { time, price } (unix seconds, price units);
// pixels are derived on every render, so drawings stay glued to candles on zoom / scroll / resize / live updates.
// Times between or beyond bars are mapped through a fractional bar index, so anchors also survive a timeframe
// change and can sit in the empty space right of the last candle.

/** time -> fractional logical (bar) index. */
export function timeToLogical(d, t, step) {
  const n = d.length; if (!n) return null;
  if (t <= d[0].time) return (t - d[0].time) / step;
  if (t >= d[n - 1].time) return n - 1 + (t - d[n - 1].time) / step;
  let lo = 0; let hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m].time <= t) lo = m; else hi = m; }
  const span = d[hi].time - d[lo].time || step;
  return lo + (t - d[lo].time) / span;
}
/** fractional logical index -> time. */
export function logicalToTime(d, l, step) {
  const n = d.length; if (!n) return null;
  if (l <= 0) return d[0].time + l * step;
  if (l >= n - 1) return d[n - 1].time + (l - (n - 1)) * step;
  const i = Math.floor(l); const f = l - i;
  return d[i].time + f * (d[i + 1].time - d[i].time);
}

/** Builds converters bound to the live chart objects (getters so a rebuilt main series is picked up). */
export function makeCoords({ getChart, getSeries, getData, getStep }) {
  return {
    toPx(a) {
      const chart = getChart(); const s = getSeries(); const d = getData(); if (!chart || !s || !d.length) return null;
      const l = timeToLogical(d, a.time, getStep()); const x = chart.timeScale().logicalToCoordinate(l); const y = s.priceToCoordinate(a.price);
      return x == null || y == null ? null : { x, y };
    },
    fromPx(x, y) {
      const chart = getChart(); const s = getSeries(); const d = getData(); if (!chart || !s || !d.length) return null;
      const l = chart.timeScale().coordinateToLogical(x); const price = s.coordinateToPrice(y);
      if (l == null || price == null) return null;
      return { time: logicalToTime(d, l, getStep()), price, logical: l };
    },
    /** Magnet: snap to the nearest bar's O/H/L/C. weak = only within `radius` px, strong = always. */
    snap(pt, y, mode, radius = 14) {
      if (!pt || mode === 'off') return pt;
      const d = getData(); const s = getSeries(); if (!d.length || !s) return pt;
      const i = Math.max(0, Math.min(d.length - 1, Math.round(pt.logical))); const bar = d[i];
      let best = null;
      for (const p of [bar.open, bar.high, bar.low, bar.close]) {
        const py = s.priceToCoordinate(p); if (py == null) continue;
        const dist = Math.abs(py - y); if (!best || dist < best.dist) best = { price: p, dist };
      }
      if (!best || (mode === 'weak' && best.dist > radius)) return pt;
      return { time: bar.time, price: best.price, logical: i };
    },
    paneSize() {
      const chart = getChart(); if (!chart) return { width: 0, height: 0 };
      const ps = chart.paneSize?.(0); const w = chart.timeScale().width();
      return { width: w || ps?.width || 0, height: ps?.height || 0 };
    },
  };
}
