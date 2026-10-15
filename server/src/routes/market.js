import { Router } from 'express';
import { requireAuth, wrap } from '../auth.js';
import { SYMBOLS } from '../services/symbols.js';
import { getAllQuotes, getKlines, getSparklines, getNews, marketStatus } from '../services/market.js';

const router = Router();
// Market data is public (it is what the landing-page ticker tape shows).
router.get('/symbols', (req, res) => res.json({ symbols: SYMBOLS.map(({ symbol, name, type, live, decimals }) => ({ symbol, name, type, live, decimals })) }));
router.get('/quotes', (req, res) => res.json({ quotes: getAllQuotes(), status: marketStatus() }));
router.get('/klines', wrap(async (req, res) => {
  res.json(await getKlines(String(req.query.symbol || 'BTCUSDT').toUpperCase(), String(req.query.interval || '1h'), req.query.limit));
}));
router.get('/sparklines', wrap(async (req, res) => res.json({ sparklines: await getSparklines() })));
router.get('/news', wrap(async (req, res) => res.json(await getNews())));
export default router;
