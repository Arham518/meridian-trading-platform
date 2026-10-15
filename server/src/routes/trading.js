import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerified, wrap } from '../auth.js';
import { parse, posNum, optPosNum } from '../validate.js';
import { isKnownSymbol } from '../services/symbols.js';
import { queryDataset } from '../services/datasets.js';
import { placeOrder, cancelOrder, closeTrade, portfolio, resetAccount } from '../services/trading.js';
import { getPrice } from '../services/market.js';

const router = Router();
router.use(requireAuth);

const orderSchema = z.object({
  symbol: z.string().trim().toUpperCase().refine(isKnownSymbol, 'unknown symbol'),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['market', 'limit']).default('market'),
  qty: posNum(),
  limitPrice: optPosNum(),
  stopLoss: optPosNum(),
  takeProfit: optPosNum(),
});

router.get('/portfolio', wrap((req, res) => res.json(portfolio(req.user.id))));

router.post('/orders', requireVerified, wrap((req, res) => {
  const d = parse(orderSchema, req.body);
  const { order, tradeId } = placeOrder(req.user.id, d);
  res.status(201).json({ order, tradeId, filled: order.status === 'filled', price: getPrice(d.symbol) });
}));
router.delete('/orders/:id', requireVerified, wrap((req, res) => { cancelOrder(req.user.id, Number(req.params.id)); res.json({ ok: true }); }));

router.post('/trades/:id/close', requireVerified, wrap((req, res) => res.json(closeTrade(req.user.id, Number(req.params.id)))));

router.get('/history', wrap((req, res) => res.json(queryDataset('trades', { ...req.query, status: 'closed' }, { userId: req.user.id }, req.query))));
router.get('/orders', wrap((req, res) => res.json(queryDataset('orders', req.query, { userId: req.user.id }, req.query))));
router.post('/reset', requireVerified, wrap((req, res) => { resetAccount(req.user.id); res.json(portfolio(req.user.id)); }));

export default router;
