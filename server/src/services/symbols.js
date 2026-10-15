// Instrument catalogue. `live: true` instruments are fetched from Binance's public API;
// the rest (and any crypto pair when Binance is unreachable) are SIMULATED and labelled so in the UI.
export const SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', type: 'crypto', live: true, base: 81000, decimals: 2, vol: 0.0009 },
  { symbol: 'ETHUSDT', name: 'Ethereum', type: 'crypto', live: true, base: 2370, decimals: 2, vol: 0.0012 },
  { symbol: 'BNBUSDT', name: 'BNB', type: 'crypto', live: true, base: 640, decimals: 2, vol: 0.001 },
  { symbol: 'SOLUSDT', name: 'Solana', type: 'crypto', live: true, base: 165, decimals: 2, vol: 0.0016 },
  { symbol: 'XRPUSDT', name: 'XRP', type: 'crypto', live: true, base: 2.35, decimals: 4, vol: 0.0014 },
  { symbol: 'ADAUSDT', name: 'Cardano', type: 'crypto', live: true, base: 0.72, decimals: 4, vol: 0.0015 },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', type: 'crypto', live: true, base: 0.19, decimals: 5, vol: 0.002 },
  { symbol: 'AVAXUSDT', name: 'Avalanche', type: 'crypto', live: true, base: 29, decimals: 2, vol: 0.0017 },
  { symbol: 'LINKUSDT', name: 'Chainlink', type: 'crypto', live: true, base: 16.4, decimals: 3, vol: 0.0016 },
  { symbol: 'DOTUSDT', name: 'Polkadot', type: 'crypto', live: true, base: 4.6, decimals: 3, vol: 0.0017 },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', type: 'forex', live: false, base: 1.0842, decimals: 5, vol: 0.00018, pip: 0.0001 },
  { symbol: 'GBPUSD', name: 'Pound / US Dollar', type: 'forex', live: false, base: 1.2915, decimals: 5, vol: 0.0002, pip: 0.0001 },
  { symbol: 'USDJPY', name: 'US Dollar / Yen', type: 'forex', live: false, base: 151.4, decimals: 3, vol: 0.0002, pip: 0.01 },
  { symbol: 'AUDUSD', name: 'Aussie / US Dollar', type: 'forex', live: false, base: 0.6612, decimals: 5, vol: 0.0002, pip: 0.0001 },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', type: 'commodity', live: false, base: 2685, decimals: 2, vol: 0.0004, pip: 0.1 },
  { symbol: 'US500', name: 'S&P 500 Index', type: 'index', live: false, base: 5820, decimals: 2, vol: 0.0003, pip: 1 },
  { symbol: 'NAS100', name: 'Nasdaq 100 Index', type: 'index', live: false, base: 20350, decimals: 2, vol: 0.0004, pip: 1 },
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', live: false, base: 231.5, decimals: 2, vol: 0.0005 },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', live: false, base: 248.2, decimals: 2, vol: 0.0009 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', live: false, base: 138.4, decimals: 2, vol: 0.0008 },
];

export const SYMBOL_MAP = new Map(SYMBOLS.map((s) => [s.symbol, s]));
export const isKnownSymbol = (s) => SYMBOL_MAP.has(s);
export const INTERVALS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };

export function pipSizeFor(pair) {
  const s = SYMBOL_MAP.get(pair);
  if (s?.pip) return s.pip;
  if (/JPY$/.test(pair)) return 0.01;
  if (/^[A-Z]{6}$/.test(pair) && !s) return 0.0001;
  return null;
}
