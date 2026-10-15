import { memo, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { fmtPrice, fmtPct } from '../lib/format.js';
import { useQuote } from '../store/market.js';

/** Price with a brief green/red flash on each tick. */
export const Price = memo(function Price({ value, decimals, className }) {
  const prev = useRef(value); const [dir, setDir] = useState(null); const t = useRef();
  useEffect(() => {
    if (prev.current != null && value != null && value !== prev.current) {
      setDir(value > prev.current ? 'up' : 'down'); clearTimeout(t.current); t.current = setTimeout(() => setDir(null), 700);
    }
    prev.current = value; return () => clearTimeout(t.current);
  }, [value]);
  return <span key={dir ? `${dir}${value}` : 'idle'} className={clsx('num', dir && `flash-${dir}`, className)}>{fmtPrice(value, decimals)}</span>;
});

export const Change = ({ pct, className }) => (
  <span className={clsx('num', pct > 0 ? 'up' : pct < 0 ? 'down' : 'text-mute', className)}>{fmtPct(pct)}</span>
);

export function LivePrice({ symbol, className }) {
  const q = useQuote(symbol);
  return q ? <Price value={q.price} decimals={q.decimals} className={className} /> : <span className="num text-mute">—</span>;
}
