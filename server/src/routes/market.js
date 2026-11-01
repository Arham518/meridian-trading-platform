import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { wrap } from '../auth.js';
import { SYMBOLS } from '../services/symbols.js';
import { getAllQuotes, getQuotes, getKlines, getSparklines, getNews, marketStatus, searchSymbols } from '../services/market.js';

const router = Router();
// Market data is public (it is what the landing-page ticker tape shows). Generous per-IP limit against scraping.
router.use(rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests, slow down a little.' } }));

const SYM = /^[A-Z0-9]{2,20}$/;
const symList = (v, max = 40) => String(v || '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYM.test(s)).slice(0, max);
const TYPES = new Set(['crypto', 'forex', 'commodity', 'index', 'stock']);

router.get('/symbols', (req, res) => res.json({ symbols: SYMBOLS.map(({ symbol, name, type, decimals }) => ({ symbol, name, type, decimals })) }));
// curated list; ?symbols=A,B adds extra instruments (watchlist, open positions, the chart being viewed)
router.get('/quotes', (req, res) => res.json({ quotes: getAllQuotes(), extra: getQuotes(symList(req.query.symbols)), status: marketStatus() }));
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 32);
  const type = TYPES.has(req.query.type) ? req.query.type : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  res.set('Cache-Control', 'public, max-age=3').json(searchSymbols(q, { limit, type }));
});
router.get('/klines', wrap(async (req, res) => {
  const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
  if (!SYM.test(symbol)) return res.status(400).json({ error: 'Unknown symbol or interval' });
  res.json(await getKlines(symbol, String(req.query.interval || '1h'), req.query.limit));
}));
router.get('/sparklines', wrap(async (req, res) => res.json({ sparklines: await getSparklines() })));
router.get('/news', wrap(async (req, res) => res.json(await getNews())));
export default router;
