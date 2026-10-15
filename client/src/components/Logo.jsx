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

export default function Logo({ name = 'Meridian', size = 26, compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <LogoMark size={size} />
      {!compact && <span className="font-display text-[1.55rem] leading-none tracking-[-0.01em] -mb-0.5">{name}</span>}
    </span>
  );
}
