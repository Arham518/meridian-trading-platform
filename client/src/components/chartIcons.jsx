// Small 18px line icons for the chart-type menu (drawn in currentColor).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
const PATHS = {
  candles: <><path d="M6 3v3M6 13v2M12 4v2M12 12v3" {...P} /><rect x="4" y="6" width="4" height="7" rx=".6" fill="currentColor" /><rect x="10" y="6" width="4" height="6" rx=".6" fill="currentColor" /></>,
  hollow: <><path d="M6 3v3M6 13v2M12 4v2M12 12v3" {...P} /><rect x="4" y="6" width="4" height="7" rx=".6" {...P} /><rect x="10" y="6" width="4" height="6" rx=".6" fill="currentColor" /></>,
  bars: <path d="M6 3v12M4 6h2M6 12h2M12 4v11M10 11h2M12 6h2" {...P} />,
  heikin: <><path d="M5 5v9M13 3v10" {...P} /><rect x="3.5" y="7" width="3" height="5" rx=".5" fill="currentColor" /><rect x="11.5" y="5" width="3" height="6" rx=".5" {...P} /><path d="M8 9h2" {...P} /></>,
  line: <path d="M2.5 13l4-5 3.5 3 5.5-7" {...P} />,
  linemarkers: <><path d="M2.5 13l4-5 3.5 3 5.5-7" {...P} /><circle cx="6.5" cy="8" r="1.4" fill="currentColor" /><circle cx="10" cy="11" r="1.4" fill="currentColor" /><circle cx="15.5" cy="4" r="1.4" fill="currentColor" /></>,
  area: <><path d="M2.5 13l4-5 3.5 3 5.5-7V15.5H2.5z" fill="currentColor" opacity=".22" /><path d="M2.5 13l4-5 3.5 3 5.5-7" {...P} /></>,
  baseline: <><path d="M2 9.5h14" {...P} strokeDasharray="1.5 1.5" /><path d="M2.5 12l3.5-5 3 4 3-7 3.5 9" {...P} /></>,
  columns: <path d="M4 15V9M7.5 15V6M11 15v-4M14.5 15V4" {...P} strokeWidth={2.2} strokeLinecap="butt" />,
};
export default function ChartTypeIcon({ type, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">{PATHS[type] || PATHS.candles}</svg>;
}
