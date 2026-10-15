import { useEffect } from 'react';
import { api } from './api.js';
import { useFetch } from './hooks.js';
import { useMarket } from '../store/market.js';

export function usePortfolio() {
  const f = useFetch(() => api('/trading/portfolio'), []);
  const tick = useMarket((s) => s.tradeTick);
  useEffect(() => { if (tick) f.refresh(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return f;
}
