import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin, wrap, requireVerified } from '../auth.js';
import { parse, posNum, optPosNum } from '../validate.js';
import { queryDataset } from '../services/datasets.js';
import { validateLevels, computeResult, statsFor, serializeSignal } from '../services/signals.js';
import { broadcast } from '../realtime.js';
import { scheduleMasterRebuild } from '../services/excel.js';

const router = Router();
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, `sig-${crypto.randomBytes(8).toString('hex')}${EXT[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Only PNG, JPEG or WebP images up to 3 MB are allowed'), { status: 400 }))),
});
const maybeUpload = (req, res, next) => (req.is('multipart/form-data') ? upload.single('image')(req, res, next) : next());

const STATUSES = ['active', 'hit_tp1', 'hit_tp2', 'hit_sl', 'cancelled'];
const cleanPair = z.string().trim().toUpperCase().transform((s) => s.replace(/[\s/_-]/g, '')).pipe(z.string().regex(/^[A-Z0-9.]{2,15}$/, 'invalid pair (e.g. EURUSD, BTCUSDT)'));
const base = {
  pair: cleanPair,
  direction: z.enum(['BUY', 'SELL']),
  entry: posNum(), stop_loss: posNum(), tp1: posNum(), tp2: optPosNum(),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']).default('1h'),
  risk: z.enum(['low', 'medium', 'high']).default('medium'),
  notes: z.string().trim().max(2000).default(''),
};
const createSchema = z.object(base);
const updateSchema = z.object({ ...base, status: z.enum(STATUSES).optional(), result_pct: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().finite().optional()), result_pips: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().finite().optional()), remove_image: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional() });

const getRaw = (id) => db.prepare('SELECT s.*, u.name AS author FROM signals s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?').get(id);
const removeFile = (p) => { if (p) fs.rm(path.join(config.uploadDir, path.basename(p)), { force: true }, () => {}); };

router.get('/', requireAuth, requireVerified, wrap((req, res) => {
  const r = queryDataset('signals', req.query, {}, req.query);
  res.json({ ...r, rows: r.rows.map(serializeSignal) });
}));

router.get('/stats', requireAuth, requireVerified, wrap((req, res) => res.json(statsFor())));

router.get('/:id', requireAuth, requireVerified, wrap((req, res) => {
  const s = getRaw(req.params.id);
  if (!s) return res.status(404).json({ error: 'Signal not found' });
  res.json({ signal: serializeSignal(s) });
}));

router.post('/', requireAuth, requireAdmin, maybeUpload, wrap((req, res) => {
  try {
    const d = parse(createSchema, req.body);
    validateLevels({ direction: d.direction, entry: d.entry, stop_loss: d.stop_loss, tp1: d.tp1, tp2: d.tp2 });
    const info = db.prepare(`INSERT INTO signals (pair, direction, entry, stop_loss, tp1, tp2, timeframe, risk, notes, image_path, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(d.pair, d.direction, d.entry, d.stop_loss, d.tp1, d.tp2 ?? null, d.timeframe, d.risk, d.notes, req.file?.filename ?? null, req.user.id);
    const s = serializeSignal(getRaw(info.lastInsertRowid));
    broadcast('signal:new', s); scheduleMasterRebuild();
    res.status(201).json({ signal: s });
  } catch (e) { removeFile(req.file?.filename); throw e; }
}));

router.put('/:id', requireAuth, requireAdmin, maybeUpload, wrap((req, res) => {
  try {
    const cur = getRaw(req.params.id);
    if (!cur) { removeFile(req.file?.filename); return res.status(404).json({ error: 'Signal not found' }); }
    const d = parse(updateSchema, req.body);
    validateLevels({ direction: d.direction, entry: d.entry, stop_loss: d.stop_loss, tp1: d.tp1, tp2: d.tp2 });
    const status = d.status ?? cur.status;
    let pct = cur.result_pct; let pips = cur.result_pips; let closedAt = cur.closed_at;
    const draft = { ...cur, ...d, tp2: d.tp2 ?? null };
    if (status === 'active') { pct = null; pips = null; closedAt = null; }
    else {
      if (cur.status === 'active' || status !== cur.status) closedAt = nowIso();
      const auto = computeResult(draft, status);
      pct = d.result_pct ?? (status === 'cancelled' ? null : auto.pct);
      pips = d.result_pips ?? (status === 'cancelled' ? null : auto.pips);
    }
    let image = cur.image_path;
    if (req.file) { removeFile(cur.image_path); image = req.file.filename; }
    else if (d.remove_image) { removeFile(cur.image_path); image = null; }
    db.prepare(`UPDATE signals SET pair=?, direction=?, entry=?, stop_loss=?, tp1=?, tp2=?, timeframe=?, risk=?, notes=?, image_path=?, status=?, result_pct=?, result_pips=?, closed_at=?, updated_at=? WHERE id=?`)
      .run(d.pair, d.direction, d.entry, d.stop_loss, d.tp1, d.tp2 ?? null, d.timeframe, d.risk, d.notes, image, status, pct, pips, closedAt, nowIso(), cur.id);
    const s = serializeSignal(getRaw(cur.id));
    broadcast('signal:update', s); scheduleMasterRebuild();
    res.json({ signal: s });
  } catch (e) { removeFile(req.file?.filename); throw e; }
}));

// Quick close / cancel: { status: hit_tp1|hit_tp2|hit_sl|cancelled|active, result_pct?, result_pips? }
router.post('/:id/close', requireAuth, requireAdmin, wrap((req, res) => {
  const cur = getRaw(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Signal not found' });
  const d = parse(z.object({
    status: z.enum(STATUSES),
    result_pct: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().finite().optional()),
    result_pips: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().finite().optional()),
  }), req.body);
  if (d.status === 'hit_tp2' && cur.tp2 == null) return res.status(400).json({ error: 'This signal has no TP2' });
  const auto = computeResult(cur, d.status);
  const active = d.status === 'active';
  db.prepare('UPDATE signals SET status=?, result_pct=?, result_pips=?, closed_at=?, updated_at=? WHERE id=?')
    .run(d.status, active || d.status === 'cancelled' ? null : (d.result_pct ?? auto.pct), active || d.status === 'cancelled' ? null : (d.result_pips ?? auto.pips), active ? null : nowIso(), nowIso(), cur.id);
  const s = serializeSignal(getRaw(cur.id));
  broadcast('signal:update', s); scheduleMasterRebuild();
  res.json({ signal: s });
}));

router.delete('/:id', requireAuth, requireAdmin, wrap((req, res) => {
  const cur = getRaw(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Signal not found' });
  db.prepare('DELETE FROM signals WHERE id = ?').run(cur.id);
  removeFile(cur.image_path);
  broadcast('signal:delete', { id: cur.id }); scheduleMasterRebuild();
  res.json({ ok: true });
}));

export default router;
