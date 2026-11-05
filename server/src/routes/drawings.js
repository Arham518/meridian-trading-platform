import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, wrap } from '../auth.js';
import { parse } from '../validate.js';
import { INTERVALS } from '../services/symbols.js';

// Chart drawings, private per user and keyed by symbol + timeframe + market. Anchors are chart coordinates
// ({ time: unix seconds, price }), never screen pixels.
const router = Router();
router.use(requireAuth);

const TYPES = ['trend', 'ray', 'hline', 'vline', 'rect', 'fib', 'fibext', 'channel', 'triangle', 'brush', 'text', 'emoji', 'ruler'];
const anchor = z.object({ time: z.number().finite(), price: z.number().finite() });
const drawing = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(TYPES),
  anchors: z.array(anchor).min(1).max(2000),
  style: z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(1).max(8), dash: z.enum(['solid', 'dashed', 'dotted']),
    text: z.string().max(500).optional(), fontSize: z.number().min(8).max(72).optional(), emoji: z.string().max(16).optional(), fill: z.boolean().optional(),
  }),
  locked: z.boolean().optional().default(false),
  visible: z.boolean().optional().default(true),
});
const key = z.object({ symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,20}$/), interval: z.string().refine((v) => !!INTERVALS[v], 'Unknown interval'), market: z.enum(['spot', 'futures']).default('spot') });

router.get('/', wrap((req, res) => {
  const k = parse(key, req.query);
  const row = db.prepare('SELECT data, updated_at FROM chart_drawings WHERE user_id = ? AND symbol = ? AND interval = ? AND market = ?').get(req.user.id, k.symbol, k.interval, k.market);
  res.json({ ...k, drawings: row ? JSON.parse(row.data) : [], updatedAt: row?.updated_at || null });
}));
router.put('/', wrap((req, res) => {
  const k = parse(key, req.query);
  const { drawings } = parse(z.object({ drawings: z.array(drawing).max(500) }), req.body);
  if (!drawings.length) db.prepare('DELETE FROM chart_drawings WHERE user_id = ? AND symbol = ? AND interval = ? AND market = ?').run(req.user.id, k.symbol, k.interval, k.market);
  else db.prepare(`INSERT INTO chart_drawings (user_id, symbol, interval, market, data) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, symbol, interval, market) DO UPDATE SET data = excluded.data, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(req.user.id, k.symbol, k.interval, k.market, JSON.stringify(drawings));
  res.json({ ...k, count: drawings.length });
}));
export default router;
