import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { wrap } from '../auth.js';
import { statsFor } from '../services/signals.js';
import * as persist from '../persist.js';
import { masterInfo } from '../services/excel.js';
import { cleanupInfo } from '../services/cleanup.js';
import { describeVideo, publicAds } from '../services/media.js';

const router = Router();
router.get('/settings', (req, res) => {
  const s = getSettings(); const video = describeVideo(s.hero_video_url);
  res.json({ siteName: s.site_name, tagline: s.tagline, heroVideoUrl: video ? s.hero_video_url : null, heroVideo: video, ads: publicAds(s.ads) });
});
// Landing-page proof points: aggregate stats + the latest closed results (no entry/SL/TP levels are exposed publicly).
router.get('/stats', wrap((req, res) => {
  const s = statsFor();
  const recent = db.prepare("SELECT pair, direction, status, result_pct, closed_at FROM signals WHERE status IN ('hit_tp1','hit_tp2','hit_sl') ORDER BY closed_at DESC LIMIT 6").all()
    .map((r) => ({ pair: r.pair, direction: r.direction, status: r.status, resultPct: r.result_pct, closedAt: r.closed_at }));
  res.json({ total: s.total, wins: s.wins, losses: s.losses, winRate: s.winRate, totalResult: s.totalResult, members: db.prepare('SELECT COUNT(*) n FROM users').get().n, recent });
}));
// Health check. The HTTP status stays 200 while the process can answer (a restart would not fix a database outage and
// the persistence layer keeps retrying), but the body says ok:false / status:'degraded' when saving to PostgreSQL fails.
router.get('/health', (req, res) => {
  const p = persist.status();
  const persistOk = !p.enabled || !p.lastError;
  const x = masterInfo();
  res.json({
    ok: persistOk, status: persistOk ? 'ok' : 'degraded', time: new Date().toISOString(),
    persist: { enabled: p.enabled, ok: persistOk, pendingOps: p.pendingOps, lastError: p.lastError, lastSavedAt: p.lastSavedAt },
    excel: { lastBuiltAt: x.lastBuiltAt, pending: x.pending, ok: !x.lastError },
    cleanup: cleanupInfo(),
  });
});
export default router;
