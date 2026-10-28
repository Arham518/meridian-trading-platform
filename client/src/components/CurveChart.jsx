import { useEffect, useRef } from 'react';
import { createChart, AreaSeries, ColorType } from 'lightweight-charts';
import { C } from '../lib/theme.js';

/** Cumulative-result curve (area) from stats.curve [{t, v}]. */
export default function CurveChart({ data = [], height = 180 }) {
  const el = useRef(null);
  useEffect(() => {
    if (!el.current || data.length < 2) return undefined;
    const chart = createChart(el.current, {
      autoSize: true, height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.mute, fontFamily: '"Geist Mono Variable", monospace', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: C.grid } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      handleScroll: false, handleScale: false, crosshair: { vertLine: { color: C.cross }, horzLine: { visible: false } },
    });
    const up = data[data.length - 1].v >= 0; const c = up ? C.candleUp : C.candleDown;
    const s = chart.addSeries(AreaSeries, { lineColor: c, topColor: up ? C.upFill : C.downFill, bottomColor: 'rgba(0,0,0,0)', lineWidth: 2, priceFormat: { type: 'custom', formatter: (v) => `${v.toFixed(1)}%` } });
    let last = 0;
    s.setData(data.map((d) => { let t = Math.floor(new Date(d.t).getTime() / 1000); if (t <= last) t = last + 1; last = t; return { time: t, value: d.v }; }));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, height]);
  if (data.length < 2) return <div className="grid place-items-center text-sm text-mute" style={{ height }}>The curve appears once two signals have closed.</div>;
  return <div ref={el} style={{ height }} role="img" aria-label="Cumulative signal result curve" />;
}
