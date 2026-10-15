import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { z } from 'zod';
import { db, getSettings, setSetting } from '../db.js';
import { requireAuth, requireAdmin, wrap, publicUser } from '../auth.js';
import { parse } from '../validate.js';
import { DATASETS, queryDataset } from '../services/datasets.js';
import { statsFor } from '../services/signals.js';
import { scheduleMasterRebuild } from '../services/excel.js';
import { connectedCount } from '../realtime.js';
import { sendMail } from '../services/mailer.js';
import { templates } from '../services/emailTemplates.js';
import { createToken, cooldownLeft, revokeUserSessions, TOKEN_TTL } from '../services/security.js';
import { logActivity } from '../auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', wrap((req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const day = new Date(Date.now() - 86400000).toISOString();
  const signups = db.prepare(`SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d ORDER BY d`).all(new Date(Date.now() - 14 * 86400000).toISOString());
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM signals GROUP BY status').all();
  res.json({
    users: one("SELECT COUNT(*) n, SUM(status = 'active') active, SUM(role = 'admin') admins FROM users"),
    newUsers7d: one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', new Date(Date.now() - 7 * 86400000).toISOString()).n,
    signals: statsFor(),
    byStatus,
    trades: one("SELECT COUNT(*) n, SUM(status='open') open, COALESCE(SUM(CASE WHEN status='closed' THEN pnl END),0) pnl FROM trades"),
    orders: one('SELECT COUNT(*) n FROM orders').n,
    logins24h: one("SELECT COUNT(*) n FROM login_activity WHERE event='login' AND success=1 AND created_at >= ?", day).n,
    failedLogins24h: one('SELECT COUNT(*) n FROM login_activity WHERE success=0 AND created_at >= ?', day).n,
    online: connectedCount(),
    signups,
    recentActivity: db.prepare('SELECT * FROM login_activity ORDER BY id DESC LIMIT 8').all(),
  });
}));

router.get('/records/:type', wrap((req, res) => {
  const type = req.params.type;
  if (!DATASETS[type]) return res.status(404).json({ error: 'Unknown record type' });
  const r = queryDataset(type, req.query, {}, req.query);
  res.json({ ...r, columns: DATASETS[type].columns.map(({ header, key, type: t }) => ({ header, key, type: t || 'text' })) });
}));

router.get('/users', wrap((req, res) => res.json(queryDataset('users', req.query, {}, req.query))));

router.patch('/users/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const d = parse(z.object({ status: z.enum(['active', 'disabled']).optional(), role: z.enum(['user', 'admin']).optional() }), req.body);
  if (id === req.user.id && (d.status === 'disabled' || (d.role && d.role !== 'admin'))) return res.status(400).json({ error: 'You cannot disable or demote your own account' });
  if (d.status) { db.prepare('UPDATE users SET status = ? WHERE id = ?').run(d.status, id); if (d.status === 'disabled') revokeUserSessions(id); }
  if (d.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(d.role, id);
  scheduleMasterRebuild();
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
}));

const target = (req, res) => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id)); if (!u) res.status(404).json({ error: 'User not found' }); return u; };

router.post('/users/:id/resend-verification', wrap(async (req, res) => {
  const u = target(req, res); if (!u) return;
  if (u.email_verified_at) return res.status(400).json({ error: 'This email address is already verified.' });
  const wait = cooldownLeft(u.id, 'verify_email');
  if (wait) return res.status(429).json({ error: `A verification email was just sent. Wait ${wait}s.`, retryAfter: wait });
  const token = createToken(u.id, 'verify_email');
  const t = templates.verifyEmail({ name: u.name, token, hours: TOKEN_TTL.verify_email / 3600e3 });
  await sendMail({ to: u.email, subject: t.subject, html: t.html, text: t.text, kind: 'verify-email', link: t.link });
  logActivity({ userId: u.id, email: u.email, event: 'admin_resend_verification', req }); scheduleMasterRebuild();
  res.json({ ok: true });
}));

router.post('/users/:id/force-reset', wrap(async (req, res) => {
  const u = target(req, res); if (!u) return;
  if (u.id === req.user.id) return res.status(400).json({ error: 'Use Account > Change password for your own account.' });
  db.prepare('UPDATE users SET force_reset = 1 WHERE id = ?').run(u.id);
  revokeUserSessions(u.id);
  const token = createToken(u.id, 'reset_password');
  const t = templates.adminReset({ name: u.name, token, minutes: TOKEN_TTL.reset_password / 60e3 });
  await sendMail({ to: u.email, subject: t.subject, html: t.html, text: t.text, kind: 'admin-reset', link: t.link });
  logActivity({ userId: u.id, email: u.email, event: 'admin_force_reset', req }); scheduleMasterRebuild();
  res.json({ ok: true });
}));

router.post('/users/:id/unlock', wrap((req, res) => {
  const u = target(req, res); if (!u) return;
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(u.id);
  logActivity({ userId: u.id, email: u.email, event: 'admin_unlock', req }); scheduleMasterRebuild();
  res.json({ ok: true });
}));

const adSchema = z.object({
  slot: z.enum(['landing', 'dashboard']),
  title: z.string().trim().min(1).max(60), text: z.string().trim().max(140).default(''), cta: z.string().trim().max(24).default('Learn more'),
  url: z.string().trim().max(500).regex(/^https?:\/\//, 'must start with http:// or https://'), enabled: z.boolean().default(true),
});
const mediaUrl = z.string().trim().max(500).refine((v) => v === '' || /^(https:\/\/|http:\/\/|\/uploads\/)/.test(v), 'must be an https:// URL or an uploaded file');

const adminSettings = () => { const s = getSettings(); let ads = []; try { ads = JSON.parse(s.ads || '[]'); } catch { /* corrupt value: start empty */ } return { site_name: s.site_name, tagline: s.tagline, hero_video_url: s.hero_video_url || '', ads }; };
router.get('/settings', wrap((req, res) => res.json({ settings: adminSettings() })));
router.put('/settings', wrap((req, res) => {
  const d = parse(z.object({ site_name: z.string().trim().min(2).max(40), tagline: z.string().trim().max(140).optional(), hero_video_url: mediaUrl.optional(), ads: z.array(adSchema).max(4).optional() }), req.body);
  setSetting('site_name', d.site_name);
  if (d.tagline !== undefined) setSetting('tagline', d.tagline);
  if (d.hero_video_url !== undefined) setSetting('hero_video_url', d.hero_video_url);
  if (d.ads !== undefined) setSetting('ads', JSON.stringify(d.ads));
  scheduleMasterRebuild();
  res.json({ settings: adminSettings() });
}));

// optional hero video: MP4 / WebM up to 25 MB, stored next to the other uploads
const VEXT = { 'video/mp4': '.mp4', 'video/webm': '.webm' };
const videoUpload = multer({
  storage: multer.diskStorage({ destination: config.uploadDir, filename: (req, file, cb) => cb(null, `hero-${crypto.randomBytes(6).toString('hex')}${VEXT[file.mimetype] || '.bin'}`) }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (VEXT[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Only MP4 or WebM video up to 25 MB is allowed'), { status: 400 }))),
});
const dropOldVideo = () => { const cur = getSettings().hero_video_url || ''; if (cur.startsWith('/uploads/hero-')) fs.rm(path.join(config.uploadDir, path.basename(cur)), { force: true }, () => {}); };
router.post('/hero-video', videoUpload.single('video'), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a video file' });
  dropOldVideo(); setSetting('hero_video_url', `/uploads/${req.file.filename}`);
  res.json({ heroVideoUrl: `/uploads/${req.file.filename}` });
}));
router.delete('/hero-video', wrap((req, res) => { dropOldVideo(); setSetting('hero_video_url', ''); res.json({ heroVideoUrl: null }); }));

export default router;
