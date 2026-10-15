import { memo } from 'react';

export default memo(function Sparkline({ data = [], width = 96, height = 30, up }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data); const max = Math.max(...data); const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / rng) * (height - 4)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const isUp = up ?? data[data.length - 1] >= data[0];
  const c = isUp ? '#2fbf85' : '#ec5560';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={line} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
});
