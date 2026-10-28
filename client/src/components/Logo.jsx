/**
 * Meridian mark: a meridian ring crossed by a single candlestick (wick + body). One colour, drawn in currentColor.
 */
export function LogoMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Meridian" fill="none">
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 1.5v6M16 24.5v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="butt" />
      <rect x="12.4" y="9.2" width="7.2" height="11.6" fill="currentColor" />
    </svg>
  );
}

/** Brand lock-up: the mark on a blue rounded tile + wordmark. The tile keeps the mark readable on light and navy surfaces. */
export function LogoTile({ size = 30, className = '' }) {
  return (
    <span className={`inline-grid place-items-center rounded-[9px] bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(13,21,38,.2)] ${className}`} style={{ width: size, height: size }}>
      <LogoMark size={Math.round(size * 0.68)} />
    </span>
  );
}

export default function Logo({ name = 'Meridian', size = 30, compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <LogoTile size={size} />
      {!compact && <span className="font-display text-[1.02rem] leading-none tracking-[0.06em] uppercase">{name}</span>}
    </span>
  );
}
