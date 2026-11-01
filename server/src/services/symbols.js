// Instrument catalogue.
// CORE instruments are the curated list shown on dashboards, tables and the heat-map (order matters).
// The wider catalogue (every Binance USDT spot pair, major/minor FX, metals, indices, popular stocks) is
// searchable and tradable. Every price comes from a free keyless public feed:
//   feed 'binance' : Binance public spot API            (crypto)
//   feed 'yahoo'   : Yahoo Finance public chart data     (forex, indices, stocks, energy) - `y` is the Yahoo ticker
//   feed 'metal'   : gold-api.com spot price + Yahoo futures for the daily change (gold, silver, platinum, palladium)
// `base` is only used to generate demo data and the offline test simulator, never shown as a live price.
const C = (symbol, name, base, decimals, vol) => ({ symbol, name, type: 'crypto', feed: 'binance', base, decimals, vol });
const FX_NAMES = { USD: 'US Dollar', EUR: 'Euro', GBP: 'Pound', JPY: 'Yen', CHF: 'Swiss Franc', CAD: 'Canadian Dollar', AUD: 'Aussie', NZD: 'Kiwi',
  PKR: 'Pakistani Rupee', TRY: 'Turkish Lira', ZAR: 'Rand', MXN: 'Mexican Peso', SGD: 'Singapore Dollar', HKD: 'HK Dollar', CNH: 'Yuan (offshore)',
  INR: 'Indian Rupee', SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone', PLN: 'Zloty', HUF: 'Forint', CZK: 'Czech Koruna',
  THB: 'Thai Baht', AED: 'UAE Dirham', SAR: 'Saudi Riyal' };
const FX = (pair, base, decimals = 5, vol = 0.0002) => ({ symbol: pair, name: `${FX_NAMES[pair.slice(0, 3)]} / ${FX_NAMES[pair.slice(3)]}`, type: 'forex', feed: 'yahoo', y: `${pair}=X`,
  base, decimals, vol, pip: /JPY$/.test(pair) ? 0.01 : 0.0001 });
const Y = (symbol, name, type, y, base, decimals = 2, vol = 0.0005, pip) => ({ symbol, name, type, feed: 'yahoo', y, base, decimals, vol, ...(pip ? { pip } : {}) });

export const CORE = [
  C('BTCUSDT', 'Bitcoin', 81000, 2, 0.0009), C('ETHUSDT', 'Ethereum', 2370, 2, 0.0012), C('BNBUSDT', 'BNB', 640, 2, 0.001),
  C('SOLUSDT', 'Solana', 165, 2, 0.0016), C('XRPUSDT', 'XRP', 2.35, 4, 0.0014), C('ADAUSDT', 'Cardano', 0.72, 4, 0.0015),
  C('DOGEUSDT', 'Dogecoin', 0.19, 5, 0.002), C('AVAXUSDT', 'Avalanche', 29, 2, 0.0017), C('LINKUSDT', 'Chainlink', 16.4, 3, 0.0016),
  C('DOTUSDT', 'Polkadot', 4.6, 3, 0.0017),
  FX('EURUSD', 1.0842, 5, 0.00018), FX('GBPUSD', 1.2915), { ...FX('USDJPY', 151.4, 3), name: 'US Dollar / Yen' }, FX('AUDUSD', 0.6612),
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', type: 'commodity', feed: 'metal', metal: 'XAU', y: 'GC=F', base: 2685, decimals: 2, vol: 0.0004, pip: 0.1 },
  Y('US500', 'S&P 500 Index', 'index', '^GSPC', 5820, 2, 0.0003, 1), Y('NAS100', 'Nasdaq 100 Index', 'index', '^NDX', 20350, 2, 0.0004, 1),
  Y('AAPL', 'Apple Inc.', 'stock', 'AAPL', 231.5), Y('TSLA', 'Tesla Inc.', 'stock', 'TSLA', 248.2, 2, 0.0009), Y('NVDA', 'NVIDIA Corp.', 'stock', 'NVDA', 138.4, 2, 0.0008),
];

// ---- extended catalogue (searchable, tradable) ----
const MAJORS = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const fxPairs = [];
MAJORS.forEach((a, i) => MAJORS.slice(i + 1).forEach((b) => fxPairs.push(a + b)));
const EXOTIC = ['USDPKR', 'USDTRY', 'USDZAR', 'USDMXN', 'USDSGD', 'USDHKD', 'USDCNH', 'USDINR', 'USDSEK', 'USDNOK', 'USDDKK', 'USDPLN', 'USDHUF',
  'USDCZK', 'USDTHB', 'USDAED', 'USDSAR', 'EURTRY', 'EURSEK', 'EURNOK', 'EURPLN', 'GBPPKR', 'EURPKR'];
const fxDecimals = (p) => (/JPY$|PKR$|INR$|HUF$|THB$|CZK$|TRY$|MXN$|ZAR$/.test(p) ? 3 : 5);

const METALS = [
  { symbol: 'XAGUSD', name: 'Silver / US Dollar', metal: 'XAG', y: 'SI=F', decimals: 3, pip: 0.01 },
  { symbol: 'XPTUSD', name: 'Platinum / US Dollar', metal: 'XPT', y: 'PL=F', decimals: 2, pip: 0.1 },
  { symbol: 'XPDUSD', name: 'Palladium / US Dollar', metal: 'XPD', y: 'PA=F', decimals: 2, pip: 0.1 },
].map((m) => ({ ...m, type: 'commodity', feed: 'metal', vol: 0.0006 }));

const OTHERS = [
  Y('WTIUSD', 'WTI Crude Oil (futures)', 'commodity', 'CL=F', 0, 2), Y('BRENTUSD', 'Brent Crude Oil (futures)', 'commodity', 'BZ=F', 0, 2),
  Y('NGASUSD', 'Natural Gas (futures)', 'commodity', 'NG=F', 0, 3), Y('COPPERUSD', 'Copper (futures)', 'commodity', 'HG=F', 0, 4),
  Y('US30', 'Dow Jones 30 Index', 'index', '^DJI', 0), Y('US2000', 'Russell 2000 Index', 'index', '^RUT', 0), Y('VIX', 'CBOE Volatility Index', 'index', '^VIX', 0),
  Y('GER40', 'DAX 40 Index', 'index', '^GDAXI', 0), Y('UK100', 'FTSE 100 Index', 'index', '^FTSE', 0), Y('FRA40', 'CAC 40 Index', 'index', '^FCHI', 0),
  Y('EU50', 'Euro Stoxx 50 Index', 'index', '^STOXX50E', 0), Y('JPN225', 'Nikkei 225 Index', 'index', '^N225', 0), Y('HK50', 'Hang Seng Index', 'index', '^HSI', 0),
  Y('AUS200', 'ASX 200 Index', 'index', '^AXJO', 0), Y('IND50', 'Nifty 50 Index', 'index', '^NSEI', 0), Y('SENSEX', 'BSE Sensex Index', 'index', '^BSESN', 0),
];
const STOCKS = { MSFT: 'Microsoft', AMZN: 'Amazon', GOOGL: 'Alphabet (Google)', META: 'Meta Platforms', NFLX: 'Netflix', AMD: 'AMD', INTC: 'Intel',
  AVGO: 'Broadcom', ORCL: 'Oracle', CRM: 'Salesforce', ADBE: 'Adobe', JPM: 'JPMorgan Chase', V: 'Visa', MA: 'Mastercard', BAC: 'Bank of America',
  WMT: 'Walmart', KO: 'Coca-Cola', PEP: 'PepsiCo', DIS: 'Walt Disney', NKE: 'Nike', BA: 'Boeing', XOM: 'Exxon Mobil', CVX: 'Chevron', PFE: 'Pfizer',
  JNJ: 'Johnson & Johnson', UNH: 'UnitedHealth', COIN: 'Coinbase', PLTR: 'Palantir', UBER: 'Uber', SHOP: 'Shopify', BABA: 'Alibaba', TSM: 'TSMC',
  ASML: 'ASML', PYPL: 'PayPal', MSTR: 'MicroStrategy', SMCI: 'Super Micro Computer', ARM: 'Arm Holdings' };

const STATIC = [
  ...CORE,
  ...fxPairs.filter((p) => !CORE.some((c) => c.symbol === p)).map((p) => FX(p, 0, fxDecimals(p))),
  ...EXOTIC.map((p) => FX(p, 0, fxDecimals(p))),
  ...METALS, ...OTHERS,
  ...Object.entries(STOCKS).map(([t, n]) => Y(t, n, 'stock', t, 0)),
];

// extra search words (what people type) for instruments whose ticker is not obvious
const ALIASES = { XAUUSD: 'gold', XAGUSD: 'silver', XPTUSD: 'platinum', XPDUSD: 'palladium', US500: 'sp500 spx s&p500 snp', NAS100: 'nasdaq ndx us100 tech100',
  US30: 'dow djia', US2000: 'russell', GER40: 'dax germany', UK100: 'ftse uk', FRA40: 'cac france', JPN225: 'nikkei japan', HK50: 'hangseng hsi',
  AUS200: 'asx australia', IND50: 'nifty india', SENSEX: 'bse india', WTIUSD: 'oil crude usoil', BRENTUSD: 'oil crude ukoil', NGASUSD: 'gas natgas', GOOGL: 'google' };
for (const [k, v] of Object.entries(ALIASES)) { const m = STATIC.find((x) => x.symbol === k); if (m) m.aliases = v; }

/** Mutable registry: static entries + Binance USDT pairs discovered at runtime. */
export const SYMBOL_MAP = new Map(STATIC.map((s) => [s.symbol, s]));
export const SYMBOLS = CORE; // curated list (dashboards, heat-map, tables)
export const CORE_SET = new Set(CORE.map((s) => s.symbol));
export const allSymbols = () => SYMBOL_MAP.values();
export const isKnownSymbol = (s) => SYMBOL_MAP.has(s);
/** Adds a discovered Binance pair (no-op when already known). */
export function registerCrypto(symbol, baseAsset) {
  if (SYMBOL_MAP.has(symbol)) return;
  SYMBOL_MAP.set(symbol, { symbol, name: baseAsset, type: 'crypto', feed: 'binance', base: 0, decimals: 4, vol: 0.002 });
}
export const INTERVALS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };

export function pipSizeFor(pair) {
  const s = SYMBOL_MAP.get(pair);
  if (s?.pip) return s.pip;
  if (/JPY$/.test(pair)) return 0.01;
  if (/^[A-Z]{6}$/.test(pair) && !s) return 0.0001;
  return null;
}
