import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { z } from 'zod';
import { db, getSettings, setSetting } from '../db.js';
import { requireAuth, requireAdmin, wrap, publicUser } from '../auth.js';
import bcrypt from 'bcryptjs';
import { parse, emailSchema, passwordSchema, usernameSchema } from '../validate.js';
import { DATASETS, queryDataset, allRows } from '../services/datasets.js';
import { statsFor } from '../services/signals.js';
import { scheduleMasterRebuild } from '../services/excel.js';
import { connectedCount, usersChanged } from '../realtime.js';
import { sendMail, mailMode, mailStatus, verifySmtp } from '../services/mailer.js';
import { templates } from '../services/emailTemplates.js';
import { createToken, cooldownLeft, revokeUserSessions, TOKEN_TTL } from '../services/security.js';
import { logActivity } from '../auth.js';
import { adSchema, heroVideoSchema, describeVideo, readAds, resetAdsenseCache } from '../services/media.js';

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

// CSV of the users list (same filters as the table). Password hashes and 2FA secrets are never included.
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // stop spreadsheet formula injection
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
router.get('/users/export.csv', wrap((req, res) => {
  const cols = DATASETS.users.columns;
  const rows = allRows('users', req.query);
  const lines = [cols.map((c) => csvCell(c.header)).join(','), ...rows.map((r) => cols.map((c) => csvCell(c.type === 'bool' ? (r[c.key] ? 'yes' : 'no') : r[c.key])).join(','))];
  logActivity({ userId: req.user.id, email: req.user.email, event: 'admin_export_users', req });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\ufeff${lines.join('\r\n')}\r\n`);
}));

// ------------------------------------------------------------------ user management (create / edit / password)
const DEFAULT_WATCH = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'EURUSD', 'XAUUSD'];
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const optUsername = usernameSchema.nullable().optional().or(z.literal('').transform(() => null));
const balanceSchema = z.coerce.number({ message: 'must be a number' }).finite().min(0, 'cannot be negative').max(1e12);
/** Other active admins besides `id` (the last active admin may not be demoted or disabled). */
const otherActiveAdmins = (id) => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND status = 'active' AND id != ?").get(id).n;
const changed = (u, req, event) => { logActivity({ userId: u.id, email: u.email, event, req }); scheduleMasterRebuild(); usersChanged(event); };

router.post('/users', wrap((req, res) => {
  const d = parse(z.object({
    name: z.string().trim().min(2, 'must be at least 2 characters').max(60), email: emailSchema, username: optUsername,
    password: passwordSchema, role: z.enum(['user', 'admin']).default('user'), verified: z.boolean().default(true), balance: balanceSchema.optional(),
  }), req.body);
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(d.email)) return res.status(409).json({ error: 'An account with this email already exists' });
  if (d.username && db.prepare('SELECT id FROM users WHERE username = ?').get(d.username)) return res.status(409).json({ error: 'That username is taken' });
  const info = db.prepare('INSERT INTO users (name, username, email, password_hash, role, balance, email_verified_at) VALUES (?,?,?,?,?,?,?)')
    .run(d.name, d.username || null, d.email, bcrypt.hashSync(d.password, 11), d.role, d.balance ?? config.startBalance, d.verified ? new Date().toISOString() : null);
  const ins = db.prepare('INSERT OR IGNORE INTO watchlists (user_id, symbol) VALUES (?, ?)');
  for (const sym of DEFAULT_WATCH) ins.run(info.lastInsertRowid, sym);
  const u = getUser(info.lastInsertRowid);
  changed(u, req, 'admin_create_user');
  res.status(201).json({ user: publicUser(u) });
}));

router.patch('/users/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const u = getUser(id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const d = parse(z.object({
    name: z.string().trim().min(2, 'must be at least 2 characters').max(60).optional(), username: optUsername, email: emailSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(), role: z.enum(['user', 'admin']).optional(), verified: z.boolean().optional(), balance: balanceSchema.optional(),
  }), req.body);
  const demote = d.role && d.role !== 'admin'; const disable = d.status === 'disabled';
  if (id === req.user.id && (demote || disable)) return res.status(400).json({ error: 'You cannot disable or demote your own account' });
  if (u.role === 'admin' && (demote || disable) && !otherActiveAdmins(id)) return res.status(400).json({ error: 'This is the last active admin. Make another user admin first.' });
  if (d.email && db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(d.email, id)) return res.status(409).json({ error: 'An account with this email already exists' });
  if (d.username && db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(d.username, id)) return res.status(409).json({ error: 'That username is taken' });
  const set = []; const vals = [];
  const put = (col, v) => { set.push(`${col} = ?`); vals.push(v); };
  if (d.name !== undefined) put('name', d.name);
  if (d.username !== undefined) put('username', d.username);
  if (d.email !== undefined && d.email !== u.email) { put('email', d.email); put('pending_email', null); }
  if (d.role) put('role', d.role);
  if (d.status) put('status', d.status);
  if (d.balance !== undefined) put('balance', Number(d.balance.toFixed(2)));
  if (d.verified === true && !u.email_verified_at) put('email_verified_at', new Date().toISOString());
  if (d.verified === false) put('email_verified_at', null);
  if (set.length) db.prepare(`UPDATE users SET ${set.join(', ')} WHERE id = ?`).run(...vals, id);
  if (disable && u.status !== 'disabled') revokeUserSessions(id);
  const after = getUser(id);
  if (set.length) changed(after, req, 'admin_update_user');
  res.json({ user: publicUser(after) });
}));

// Permanently deletes an account. Its watchlist, orders, trades, sessions, tokens and backup codes are removed
// with it (ON DELETE CASCADE); sign-in history and email log rows are kept for the audit trail but anonymised.
router.delete('/users/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const u = getUser(id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (u.role === 'admin' && !otherActiveAdmins(id)) return res.status(400).json({ error: 'This is the last admin. Make another user admin first.' });
  const tag = `deleted-user-${id}`;
  const counts = db.transaction(() => {
    const c = {
      trades: db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id = ?').get(id).n,
      orders: db.prepare('SELECT COUNT(*) n FROM orders WHERE user_id = ?').get(id).n,
    };
    db.prepare('UPDATE login_activity SET user_id = NULL, email = ?, ip = NULL, user_agent = NULL WHERE user_id = ? OR email = ?').run(tag, id, u.email);
    db.prepare("UPDATE mail_log SET to_addr = ?, html = NULL, link = NULL WHERE to_addr = ? COLLATE NOCASE").run(tag, u.email);
    db.prepare('UPDATE signals SET created_by = NULL WHERE created_by = ?').run(id);
    for (const t of ['watchlists', 'trades', 'orders', 'sessions', 'auth_tokens', 'backup_codes']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return c;
  })();
  logActivity({ userId: req.user.id, email: req.user.email, event: 'admin_delete_user', req });
  scheduleMasterRebuild(); usersChanged('admin_delete_user');
  res.json({ ok: true, deleted: { id, email: u.email, ...counts } });
}));

router.post('/users/:id/password', wrap((req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Use Account > Change password for your own account.' });
  const d = parse(z.object({ password: passwordSchema, confirmPassword: z.string().optional() }), req.body);
  if (d.confirmPassword !== undefined && d.confirmPassword !== d.password) return res.status(400).json({ error: 'confirmPassword: passwords do not match' });
  db.prepare('UPDATE users SET password_hash = ?, force_reset = 0, failed_logins = 0, locked_until = NULL WHERE id = ?').run(bcrypt.hashSync(d.password, 11), u.id);
  const revoked = revokeUserSessions(u.id);
  changed(u, req, 'admin_set_password');
  const t = templates.passwordChanged({ name: u.name, when: new Date().toUTCString() });
  sendMail({ to: u.email, subject: t.subject, html: t.html, text: t.text, kind: 'password-changed' }).catch(() => {});
  res.json({ ok: true, sessionsRevoked: revoked });
}));

// ------------------------------------------------------------------ email: SMTP status, test email, outbox / sent log
router.get('/email', wrap((req, res) => res.json(mailStatus())));
router.post('/email/check', wrap(async (req, res) => res.json({ ...mailStatus(), check: await verifySmtp() })));
router.post('/test-email', wrap(async (req, res) => {
  const site = getSettings().site_name || 'Meridian';
  const when = new Date().toUTCString();
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><h2 style="margin:0 0 12px">${site}: test email</h2><p>This is a test email from the admin panel, sent ${when}.</p><p>If you can read this, email delivery works.</p></div>`;
  const r = await sendMail({ to: req.user.email, subject: `${site}: test email`, html, text: `Test email from the ${site} admin panel, sent ${when}. Email delivery works.`, kind: 'test' });
  logActivity({ userId: req.user.id, email: req.user.email, event: 'admin_test_email', success: !r.error, req });
  if (r.error) return res.status(502).json({ error: `SMTP could not send the email: ${r.error}`, mode: mailMode() });
  res.json({ ok: true, mode: mailMode(), to: req.user.email, savedToOutbox: !!r.dev });
}));
router.get('/emails', wrap((req, res) => {
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100); const page = Math.max(Number(req.query.page) || 1, 1);
  const where = []; const p = [];
  if (req.query.q) { where.push("(to_addr LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\')"); const q = `%${String(req.query.q).replace(/[%_\\]/g, (m) => '\\' + m)}%`; p.push(q, q); }
  if (req.query.status) { where.push('status = ?'); p.push(String(req.query.status)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM mail_log ${clause}`).get(...p).n;
  const rows = db.prepare(`SELECT id, to_addr, subject, kind, transport, status, error, link, created_at, html IS NOT NULL AS has_html FROM mail_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...p, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1), mode: mailMode() });
}));
router.get('/emails/:id', wrap((req, res) => {
  const row = db.prepare('SELECT * FROM mail_log WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Email not found' });
  res.json({ email: row });
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

const adminSettings = () => { const s = getSettings(); return { site_name: s.site_name, tagline: s.tagline, hero_video_url: s.hero_video_url || '', hero_video: describeVideo(s.hero_video_url), ads: readAds(s.ads) }; };
router.get('/settings', wrap((req, res) => res.json({ settings: adminSettings() })));
router.put('/settings', wrap((req, res) => {
  const d = parse(z.object({ site_name: z.string().trim().min(2).max(40), tagline: z.string().trim().max(140).optional(), hero_video_url: heroVideoSchema.optional(), ads: z.array(adSchema).max(12).optional() }), req.body);
  setSetting('site_name', d.site_name);
  if (d.tagline !== undefined) setSetting('tagline', d.tagline);
  if (d.hero_video_url !== undefined) { if (d.hero_video_url !== getSettings().hero_video_url) dropOldVideo(); setSetting('hero_video_url', d.hero_video_url); }
  if (d.ads !== undefined) {
    const before = readAds(getSettings().ads);
    const ads = d.ads.map((a, i) => ({ ...a, id: a.id || `ad${Date.now().toString(36)}${i}` }));
    setSetting('ads', JSON.stringify(ads));
    dropUnusedAdImages(before, ads);
    resetAdsenseCache();
  }
  scheduleMasterRebuild();
  res.json({ settings: adminSettings() });
}));

// ---- hero video: MP4 / WebM / MOV up to 25 MB, stored next to the other uploads (and in PostgreSQL in hosted mode)
const VEXT = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
const VIDEO_MB = 25;
const videoUpload = multer({
  storage: multer.diskStorage({ destination: config.uploadDir, filename: (req, file, cb) => cb(null, `hero-${crypto.randomBytes(6).toString('hex')}${VEXT[file.mimetype] || '.bin'}`) }),
  limits: { fileSize: VIDEO_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (VEXT[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error(`Only MP4, WebM or MOV video up to ${VIDEO_MB} MB is allowed`), { status: 400 }))),
});
// multer reports an oversized file as a generic error: turn it into a clear 413 message
const runUpload = (mw, msg) => (req, res, next) => mw(req, res, (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return next(Object.assign(new Error(msg), { status: 413 }));
  return next(err);
});
const dropOldVideo = () => { const cur = getSettings().hero_video_url || ''; if (cur.startsWith('/uploads/hero-')) { try { fs.rmSync(path.join(config.uploadDir, path.basename(cur)), { force: true }); } catch { /* already gone */ } } };
router.post('/hero-video', runUpload(videoUpload.single('video'), `The video is larger than ${VIDEO_MB} MB. Compress it (for example with HandBrake) or use a YouTube / Vimeo / https:// link.`), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a video file' });
  dropOldVideo(); setSetting('hero_video_url', `/uploads/${req.file.filename}`);
  logActivity({ userId: req.user.id, email: req.user.email, event: 'admin_hero_video', req });
  res.json({ heroVideoUrl: `/uploads/${req.file.filename}`, heroVideo: describeVideo(`/uploads/${req.file.filename}`) });
}));
// set the hero video from a link (saved immediately, no need to press "Save settings")
router.put('/hero-video', wrap((req, res) => {
  const d = parse(z.object({ url: heroVideoSchema }), req.body);
  if (d.url !== getSettings().hero_video_url) dropOldVideo();
  setSetting('hero_video_url', d.url);
  res.json({ heroVideoUrl: d.url || null, heroVideo: describeVideo(d.url) });
}));
router.delete('/hero-video', wrap((req, res) => { dropOldVideo(); setSetting('hero_video_url', ''); res.json({ heroVideoUrl: null }); }));

// ---- ad images: PNG / JPEG / WebP / GIF up to 2 MB
const IEXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const imageUpload = multer({
  storage: multer.diskStorage({ destination: config.uploadDir, filename: (req, file, cb) => cb(null, `ad-${crypto.randomBytes(6).toString('hex')}${IEXT[file.mimetype] || '.bin'}`) }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (IEXT[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Only PNG, JPEG, WebP or GIF images up to 2 MB are allowed'), { status: 400 }))),
});
router.post('/ad-image', runUpload(imageUpload.single('image'), 'The image is larger than 2 MB.'), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image file' });
  res.status(201).json({ image: `/uploads/${req.file.filename}` });
}));
/** Removes uploaded ad images that no saved ad uses any more. */
function dropUnusedAdImages(before, after) {
  const keep = new Set(after.map((a) => a.image).filter(Boolean));
  for (const a of before) {
    if (a.image && a.image.startsWith('/uploads/ad-') && !keep.has(a.image)) { try { fs.rmSync(path.join(config.uploadDir, path.basename(a.image)), { force: true }); } catch { /* gone */ } }
  }
}

export default router;
