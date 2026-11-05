// 18px line icons for drawing tools not covered by lucide (TradingView-style glyphs, currentColor).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' };
const dot = (x, y) => <circle cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />;
const G = {
  trend: <><path d="M4 14L14 4" {...P} />{dot(4, 14)}{dot(14, 4)}</>,
  ray: <><path d="M4 14L16 2" {...P} />{dot(4, 14)}{dot(10, 8)}</>,
  hline: <><path d="M2 9h14" {...P} />{dot(9, 9)}</>,
  vline: <><path d="M9 2v14" {...P} />{dot(9, 9)}</>,
  channel: <><path d="M2 11L12 3M6 15l10-8" {...P} />{dot(2, 11)}{dot(12, 3)}{dot(16, 7)}</>,
  fib: <path d="M2 3.5h14M2 7h14M2 10.5h14M2 14h14" {...P} />,
  fibext: <><path d="M2 4h14M2 8h14M2 12h14" {...P} /><path d="M3 16l4-6 4 3" {...P} /></>,
  rect: <rect x="3" y="4.5" width="12" height="9" rx="1" {...P} />,
  triangle: <path d="M9 3l7 12H2z" {...P} />,
  keep: <><path d="M3 15l1-3.5L12.5 3 15 5.5 6.5 14z" {...P} /><path d="M11 13.5h5v3h-5z" {...P} /></>,
};
export default function ToolIcon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">{G[name]}</svg>;
}
export const hasIcon = (n) => n in G;
