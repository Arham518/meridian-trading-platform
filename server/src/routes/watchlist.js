import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, wrap } from '../auth.js';
import { parse } from '../validate.js';
import { isKnownSymbol } from '../services/symbols.js';
import { scheduleMasterRebuild } from '../services/excel.js';

const router = Router();
router.use(requireAuth);
const list = (uid) => db.prepare('SELECT symbol FROM watchlists WHERE user_id = ? ORDER BY id').all(uid).map((r) => r.symbol);

router.get('/', (req, res) => res.json({ symbols: list(req.user.id) }));
router.post('/', wrap((req, res) => {
  const { symbol } = parse(z.object({ symbol: z.string().trim().toUpperCase() }), req.body);
  if (!isKnownSymbol(symbol)) return res.status(400).json({ error: 'Unknown symbol' });
  db.prepare('INSERT OR IGNORE INTO watchlists (user_id, symbol) VALUES (?, ?)').run(req.user.id, symbol);
  scheduleMasterRebuild();
  res.status(201).json({ symbols: list(req.user.id) });
}));
router.delete('/:symbol', wrap((req, res) => {
  db.prepare('DELETE FROM watchlists WHERE user_id = ? AND symbol = ?').run(req.user.id, req.params.symbol.toUpperCase());
  scheduleMasterRebuild();
  res.json({ symbols: list(req.user.id) });
}));
export default router;
