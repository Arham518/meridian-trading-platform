import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { wrap } from '../auth.js';
import { statsFor } from '../services/signals.js';

const router = Router();
const safeAds = (raw) => { try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter((x) => x && x.enabled && x.title && /^https?:\/\//.test(x.url || '')).map(({ slot, title, text, cta, url }) => ({ slot, title, text: text || '', cta: cta || 'Learn more', url })) : []; } catch { return []; } };
router.get('/settings', (req, res) => { const s = getSettings(); res.json({ siteName: s.site_name, tagline: s.tagline, heroVideoUrl: s.hero_video_url || null, ads: safeAds(s.ads) }); });
// Landing-page proof points: aggregate stats + the latest closed results (no entry/SL/TP levels are exposed publicly).
router.get('/stats', wrap((req, res) => {
  const s = statsFor();
  const recent = db.prepare("SELECT pair, direction, status, result_pct, closed_at FROM signals WHERE status IN ('hit_tp1','hit_tp2','hit_sl') ORDER BY closed_at DESC LIMIT 6").all()
    .map((r) => ({ pair: r.pair, direction: r.direction, status: r.status, resultPct: r.result_pct, closedAt: r.closed_at }));
  res.json({ total: s.total, wins: s.wins, losses: s.losses, winRate: s.winRate, totalResult: s.totalResult, members: db.prepare('SELECT COUNT(*) n FROM users').get().n, recent });
}));
router.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
export default router;
