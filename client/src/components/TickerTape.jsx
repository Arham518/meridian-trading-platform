import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useMarket } from '../store/market.js';
import { pairLabel } from '../lib/format.js';
import { Price, Change } from './Price.jsx';

const Item = memo(function Item({ symbol, to }) {
  const q = useMarket((s) => s.quotes[symbol]);
  if (!q) return null;
  return (
    <Link to={to} tabIndex={-1} className="flex items-center gap-2.5 px-5 h-full border-r border-line/60 text-[12.5px] hover:bg-white/[0.03] transition-colors">
      <span className="font-semibold tracking-tight text-ink">{pairLabel(symbol)}</span>
      <Price value={q.price} decimals={q.decimals} className="text-ink/90" />
      <Change pct={q.changePct} />
    </Link>
  );
});

export default function TickerTape({ linkTo = (s) => `/app/trade/${s}` }) {
  const order = useMarket((s) => s.order);
  if (!order.length) return <div className="h-9 border-b border-line" />;
  return (
    <div className="ticker-wrap h-9 overflow-hidden border-b border-line bg-[#121211]" aria-label="Live market ticker" role="marquee">
      <div className="ticker-track h-full">
        {[0, 1].map((k) => (
          <div key={k} className="flex h-full shrink-0" aria-hidden={k === 1}>
            {order.map((s) => <Item key={s} symbol={s} to={linkTo(s)} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
