import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { signToken, signPurposeToken, verifyToken, publicUser, requireAuth, optionalAuth, wrap, logActivity } from '../auth.js';
import { parse, emailSchema, passwordSchema, usernameSchema } from '../validate.js';
import { scheduleMasterRebuild } from '../services/excel.js';
import { queryDataset } from '../services/datasets.js';
import { sendMail } from '../services/mailer.js';
import { templates } from '../services/emailTemplates.js';
import {
  createToken, consumeToken, cooldownLeft, TOKEN_TTL, createSession, rotateSession, revokeSession, revokeUserSessions, listSessions,
  makeBackupCodes, useBackupCode, backupCodesLeft, readCookie, setRefreshCookie, clearRefreshCookie, sha256,
} from '../services/security.js';
import { usersChanged } from '../realtime.js';
import { newSecret, otpauthUrl, qrDataUrl, verifyTotp, encryptSecret, decryptSecret } from '../services/totp.js';

const router = Router();
const mk = (limit) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please try again in a few minutes.' } });
const limiter = mk(config.rateLimitAuth);          // login / register / password change
const mailLimiter = mk(config.rateLimitMail);      // anything that sends email or consumes tokens

const DEFAULT_WATCH = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'EURUSD', 'XAUUSD'];
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const touch = () => scheduleMasterRebuild();
const fmtWhen = () => new Date().toUTCString();
const deviceOf = (req) => String(req.headers['user-agent'] || 'unknown device').slice(0, 120);
const note = (user, event, req, success = true) => { logActivity({ userId: user.id, email: user.email, event, success, req }); touch(); };

async function sendVerification(user) {
  const token = createToken(user.id, 'verify_email');
  const t = templates.verifyEmail({ name: user.name, token, hours: TOKEN_TTL.verify_email / 3600e3 });
  await sendMail({ to: user.email, subject: t.subject, html: t.html, text: t.text, kind: 'verify-email', link: t.link });
}

/** Creates a revocable session, sets the httpOnly refresh cookie and returns the short-lived access token. */
function openSession(req, res, user, remember) {
  const s = createSession(user, { remember, ip: req.ip, userAgent: req.headers['user-agent'] });
  setRefreshCookie(res, s.refreshToken, s.maxAgeMs, remember);
  return { token: signToken(user, s.sid), sid: s.sid };
}

async function finishLogin(req, res, user, remember, via = 'login') {
  const prior = db.prepare("SELECT 1 FROM login_activity WHERE user_id = ? AND event = 'login' AND success = 1 AND ip IS ? AND user_agent IS ? LIMIT 1").get(user.id, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 250));
  const everLoggedIn = db.prepare("SELECT 1 FROM login_activity WHERE user_id = ? AND event = 'login' AND success = 1 LIMIT 1").get(user.id);
  db.prepare('UPDATE users SET last_login_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').run(new Date().toISOString(), user.id);
  const { token } = openSession(req, res, user, remember);
  note(user, via === 'login' ? 'login' : 'login', req);
  usersChanged('login');
  if (everLoggedIn && !prior) { // sign-in from a device/IP we have not seen: security alert
    const t = templates.newLogin({ name: user.name, when: fmtWhen(), ip: req.ip || 'unknown', device: deviceOf(req) });
    sendMail({ to: user.email, subject: t.subject, html: t.html, text: t.text, kind: 'new-login' }).catch(() => {});
  }
  res.json({ token, user: publicUser(getUser(user.id)) });
}

// ------------------------------------------------------------------ register + email verification
router.post('/register', limiter, wrap(async (req, res) => {
  const d = parse(z.object({
    name: z.string().trim().min(2, 'must be at least 2 characters').max(60), username: usernameSchema.optional().or(z.literal('').transform(() => undefined)),
    email: emailSchema, password: passwordSchema, confirmPassword: z.string(),
    acceptTerms: z.boolean().optional(),
  }), req.body);
  if (d.password !== d.confirmPassword) return res.status(400).json({ error: 'confirmPassword: passwords do not match', details: [{ field: 'confirmPassword', message: 'passwords do not match' }] });
  if (d.acceptTerms !== true) return res.status(400).json({ error: 'acceptTerms: you must agree to the Terms of Service and Privacy Policy', details: [{ field: 'acceptTerms', message: 'you must agree to the Terms of Service and Privacy Policy' }] });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(d.email)) return res.status(409).json({ error: 'An account with this email already exists' });
  if (d.username && db.prepare('SELECT id FROM users WHERE username = ?').get(d.username)) return res.status(409).json({ error: 'That username is taken' });
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO users (name, username, email, password_hash, balance, last_login_at, terms_accepted_at) VALUES (?,?,?,?,?,?,?)')
    .run(d.name, d.username || null, d.email, bcrypt.hashSync(d.password, 11), config.startBalance, now, now);
  const ins = db.prepare('INSERT OR IGNORE INTO watchlists (user_id, symbol) VALUES (?, ?)');
  for (const s of DEFAULT_WATCH) ins.run(info.lastInsertRowid, s);
  const user = getUser(info.lastInsertRowid);
  note(user, 'register', req);
  await sendVerification(user);
  const { token } = openSession(req, res, user, false);
  usersChanged('register');
  res.status(201).json({ token, user: publicUser(user), verificationSent: true });
}));

router.post('/verify-email', mailLimiter, wrap((req, res) => {
  const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
  const row = consumeToken(token, 'verify_email');
  if (!row) return res.status(400).json({ error: 'This verification link is invalid, expired or was already used.', code: 'invalid_token' });
  db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(new Date().toISOString(), row.user_id);
  const user = getUser(row.user_id); note(user, 'email_verified', req); usersChanged('verified');
  res.json({ ok: true, email: user.email });
}));

// signed-in users resend to themselves; anyone may ask by email (the answer never reveals whether the address exists)
router.post('/resend-verification', mailLimiter, optionalAuth, wrap(async (req, res) => {
  let user = req.user;
  if (!user) {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || user.email_verified_at || user.status !== 'active') return res.json({ ok: true });
  } else if (user.email_verified_at) return res.status(400).json({ error: 'Your email address is already verified.' });
  const wait = cooldownLeft(user.id, 'verify_email');
  if (wait) return res.status(429).json({ error: `Please wait ${wait}s before requesting another email.`, retryAfter: wait });
  await sendVerification(user); note(user, 'verification_resent', req);
  res.json({ ok: true, cooldown: config.verifyCooldownSeconds });
}));

// ------------------------------------------------------------------ login (email or username), lockout, 2FA, refresh
const lockSeconds = (fails) => Math.min(30 * 60, config.lockoutBaseSeconds * 2 ** Math.max(0, fails - config.lockoutThreshold));
const DUMMY = bcrypt.hashSync('not-a-real-password', 11);

router.post('/login', limiter, wrap(async (req, res) => {
  const d = parse(z.object({ identifier: z.string().trim().min(1).max(120).optional(), email: z.string().trim().min(1).max(120).optional(), password: z.string().min(1).max(100), remember: z.coerce.boolean().optional() }), req.body);
  const ident = (d.identifier || d.email || '').toLowerCase();
  if (!ident) return res.status(400).json({ error: 'identifier: enter your email or username' });
  const user = db.prepare(ident.includes('@') ? 'SELECT * FROM users WHERE email = ?' : 'SELECT * FROM users WHERE username = ?').get(ident);
  const log = (event, success, u = user) => { logActivity({ userId: u?.id, email: u?.email || ident, event, success, req }); touch(); };

  if (user?.locked_until && user.locked_until > new Date().toISOString()) {
    const retryAfter = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000);
    log('login_locked', false);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${retryAfter < 90 ? `${retryAfter} seconds` : `${Math.ceil(retryAfter / 60)} minutes`}.`, code: 'locked', retryAfter });
  }
  const ok = bcrypt.compareSync(d.password, user ? user.password_hash : DUMMY) && !!user;
  if (!ok) {
    log('login', false);
    if (user) {
      const fails = user.failed_logins + 1;
      const lock = fails >= config.lockoutThreshold ? new Date(Date.now() + lockSeconds(fails) * 1000).toISOString() : null;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails, lock, user.id);
      if (lock) {
        log('account_locked', false);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${lockSeconds(fails) < 90 ? `${lockSeconds(fails)} seconds` : `${Math.ceil(lockSeconds(fails) / 60)} minutes`}.`, code: 'locked', retryAfter: lockSeconds(fails) });
      }
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.status !== 'active') { log('login_blocked', false); return res.status(403).json({ error: 'This account has been disabled. Contact the administrator.' }); }
  if (user.force_reset) { log('login_blocked', false); return res.status(403).json({ error: 'An administrator requires you to reset your password. Use "Forgot password" to choose a new one.', code: 'password_reset_required' }); }
  if (user.totp_enabled) {
    return res.json({ requires2fa: true, challenge: signPurposeToken(user, '2fa', '5m'), remember: !!d.remember });
  }
  await finishLogin(req, res, user, !!d.remember);
}));

router.post('/login/2fa', limiter, wrap(async (req, res) => {
  const d = parse(z.object({ challenge: z.string().min(1).max(2000), code: z.string().trim().min(6).max(12), remember: z.coerce.boolean().optional() }), req.body);
  let payload; try { payload = verifyToken(d.challenge); } catch { return res.status(401).json({ error: 'Your sign-in attempt expired. Start again.', code: 'challenge_expired' }); }
  if (payload.typ !== '2fa') return res.status(401).json({ error: 'Invalid challenge' });
  const user = getUser(payload.sub);
  if (!user || user.status !== 'active' || !user.totp_enabled) return res.status(401).json({ error: 'Invalid challenge' });
  if (user.locked_until && user.locked_until > new Date().toISOString()) return res.status(429).json({ error: 'Too many failed attempts. Try again later.', code: 'locked' });
  if (!(await checkSecondFactor(user, d.code))) {
    const fails = user.failed_logins + 1;
    const lock = fails >= config.lockoutThreshold ? new Date(Date.now() + lockSeconds(fails) * 1000).toISOString() : null;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails, lock, user.id);
    note(user, '2fa_failed', req, false);
    return res.status(401).json({ error: 'That code is not valid.' });
  }
  await finishLogin(req, res, getUser(user.id), !!d.remember);
}));

/** TOTP code (replay-protected) or one-time backup code */
async function checkSecondFactor(user, code) {
  if (user.totp_secret) {
    const step = verifyTotp(decryptSecret(user.totp_secret), code, user.totp_last_step);
    if (step) { db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id); return true; }
  }
  return useBackupCode(user.id, code);
}

router.post('/refresh', wrap((req, res) => {
  const r = rotateSession(readCookie(req, 'rt'));
  if (r.error) { clearRefreshCookie(res); if (r.error === 'reuse') logActivity({ userId: r.userId, email: getUser(r.userId)?.email || '', event: 'refresh_reuse_detected', success: false, req }); return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'session_expired' }); }
  const user = getUser(r.session.user_id);
  if (!user || user.status !== 'active') { revokeSession(r.session.id); clearRefreshCookie(res); return res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
  if (r.refreshToken) setRefreshCookie(res, r.refreshToken, r.maxAgeMs, !!r.session.remember);
  res.json({ token: signToken(user, r.session.id), user: publicUser(user) });
}));

router.post('/logout', optionalAuth, wrap((req, res) => {
  const cookieSid = (readCookie(req, 'rt') || '').split('.')[0];
  const sid = req.sid || cookieSid;
  if (sid) {
    const own = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(sid);
    if (own && (!req.user || own.user_id === req.user.id)) { revokeSession(sid); const u = getUser(own.user_id); if (u) note(u, 'logout', req); }
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// ------------------------------------------------------------------ sessions
router.get('/sessions', requireAuth, (req, res) => res.json({
  sessions: listSessions(req.user.id).map((s) => ({ id: s.id, ip: s.ip, userAgent: s.user_agent, remember: !!s.remember, createdAt: s.created_at, lastUsedAt: s.last_used_at, expiresAt: s.expires_at, current: s.id === req.sid })),
}));
router.delete('/sessions/:id', requireAuth, wrap((req, res) => {
  const s = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  revokeSession(s.id); note(req.user, 'session_revoked', req);
  if (s.id === req.sid) clearRefreshCookie(res);
  res.json({ ok: true });
}));
router.post('/sessions/revoke-others', requireAuth, wrap((req, res) => { const n = revokeUserSessions(req.user.id, req.sid); note(req.user, 'sessions_revoked_others', req); res.json({ ok: true, revoked: n }); }));
router.post('/logout-all', requireAuth, wrap((req, res) => { const n = revokeUserSessions(req.user.id); note(req.user, 'logout_all', req); clearRefreshCookie(res); res.json({ ok: true, revoked: n }); }));

// ------------------------------------------------------------------ forgot / reset / change password
router.post('/forgot-password', mailLimiter, wrap(async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && user.status === 'active' && !cooldownLeft(user.id, 'reset_password')) {
    const token = createToken(user.id, 'reset_password');
    const t = templates.resetPassword({ name: user.name, token, minutes: TOKEN_TTL.reset_password / 60e3 });
    await sendMail({ to: user.email, subject: t.subject, html: t.html, text: t.text, kind: 'reset-password', link: t.link });
    note(user, 'password_reset_requested', req);
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' }); // identical answer either way
}));

router.post('/reset-password', mailLimiter, wrap(async (req, res) => {
  const d = parse(z.object({ token: z.string().min(10).max(200), password: passwordSchema, confirmPassword: z.string() }), req.body);
  if (d.password !== d.confirmPassword) return res.status(400).json({ error: 'confirmPassword: passwords do not match', details: [{ field: 'confirmPassword', message: 'passwords do not match' }] });
  const row = consumeToken(d.token, 'reset_password');
  if (!row) return res.status(400).json({ error: 'This reset link is invalid, expired or was already used.', code: 'invalid_token' });
  db.prepare("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, force_reset = 0, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(bcrypt.hashSync(d.password, 11), new Date().toISOString(), row.user_id);
  revokeUserSessions(row.user_id);
  const user = getUser(row.user_id); note(user, 'password_reset', req);
  const t = templates.passwordChanged({ name: user.name, when: fmtWhen() });
  sendMail({ to: user.email, subject: t.subject, html: t.html, text: t.text, kind: 'password-changed' }).catch(() => {});
  res.json({ ok: true });
}));

router.post('/change-password', requireAuth, limiter, wrap(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema, confirmPassword: z.string().optional() }), req.body);
  if (confirmPassword !== undefined && confirmPassword !== newPassword) return res.status(400).json({ error: 'confirmPassword: passwords do not match' });
  if (!bcrypt.compareSync(currentPassword, req.user.password_hash)) { note(req.user, 'password_change', req, false); return res.status(400).json({ error: 'Current password is incorrect' }); }
  db.prepare('UPDATE users SET password_hash = ?, force_reset = 0 WHERE id = ?').run(bcrypt.hashSync(newPassword, 11), req.user.id);
  const others = revokeUserSessions(req.user.id, req.sid); // every other device is signed out
  note(req.user, 'password_change', req);
  const t = templates.passwordChanged({ name: req.user.name, when: fmtWhen() });
  sendMail({ to: req.user.email, subject: t.subject, html: t.html, text: t.text, kind: 'password-changed' }).catch(() => {});
  res.json({ ok: true, otherSessionsRevoked: others });
}));

// ------------------------------------------------------------------ change email (confirmed from the new address)
router.post('/change-email', requireAuth, mailLimiter, wrap(async (req, res) => {
  const { newEmail, password } = parse(z.object({ newEmail: emailSchema, password: z.string().min(1) }), req.body);
  if (!bcrypt.compareSync(password, req.user.password_hash)) return res.status(400).json({ error: 'Password is incorrect' });
  if (newEmail === req.user.email) return res.status(400).json({ error: 'That is already your email address' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(newEmail)) return res.status(409).json({ error: 'That email address is already in use' });
  const wait = cooldownLeft(req.user.id, 'change_email');
  if (wait) return res.status(429).json({ error: `Please wait ${wait}s before trying again.`, retryAfter: wait });
  const token = createToken(req.user.id, 'change_email', newEmail);
  db.prepare('UPDATE users SET pending_email = ? WHERE id = ?').run(newEmail, req.user.id);
  const t = templates.changeEmail({ name: req.user.name, token, newEmail, hours: TOKEN_TTL.change_email / 3600e3 });
  await sendMail({ to: newEmail, subject: t.subject, html: t.html, text: t.text, kind: 'change-email', link: t.link });
  note(req.user, 'email_change_requested', req);
  res.json({ ok: true, pendingEmail: newEmail });
}));

router.post('/confirm-email-change', mailLimiter, wrap(async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
  const row = consumeToken(token, 'change_email');
  if (!row) return res.status(400).json({ error: 'This link is invalid, expired or was already used.', code: 'invalid_token' });
  const old = getUser(row.user_id);
  if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(row.data, row.user_id)) return res.status(409).json({ error: 'That email address is already in use' });
  db.prepare('UPDATE users SET email = ?, email_verified_at = ?, pending_email = NULL WHERE id = ?').run(row.data, new Date().toISOString(), row.user_id);
  const user = getUser(row.user_id); note(user, 'email_changed', req);
  const t = templates.emailChanged({ name: user.name, newEmail: user.email });
  sendMail({ to: old.email, subject: t.subject, html: t.html, text: t.text, kind: 'email-changed' }).catch(() => {});
  res.json({ ok: true, email: user.email });
}));

router.patch('/profile', requireAuth, wrap((req, res) => {
  const d = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), username: usernameSchema.optional().or(z.literal('').transform(() => null)) }), req.body);
  if (d.username && db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(d.username, req.user.id)) return res.status(409).json({ error: 'That username is taken' });
  if (d.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(d.name, req.user.id);
  if (d.username !== undefined) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(d.username, req.user.id);
  touch();
  res.json({ user: publicUser(getUser(req.user.id)) });
}));

// ------------------------------------------------------------------ two-factor (TOTP + backup codes)
router.get('/2fa', requireAuth, (req, res) => res.json({ enabled: !!req.user.totp_enabled, backupCodesLeft: req.user.totp_enabled ? backupCodesLeft(req.user.id) : 0 }));

router.post('/2fa/setup', requireAuth, limiter, wrap(async (req, res) => {
  if (req.user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
  const secret = newSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = 0 WHERE id = ?').run(encryptSecret(secret), req.user.id);
  const url = otpauthUrl(secret, req.user.email);
  res.json({ secret, otpauthUrl: url, qr: await qrDataUrl(url) });
}));

router.post('/2fa/enable', requireAuth, limiter, wrap((req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(6).max(8) }), req.body);
  if (req.user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
  if (!req.user.totp_secret) return res.status(400).json({ error: 'Start the setup first.' });
  const step = verifyTotp(decryptSecret(req.user.totp_secret), code, 0);
  if (!step) return res.status(400).json({ error: 'That code is not valid. Check the time on your phone and try again.' });
  db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, req.user.id);
  const codes = makeBackupCodes(req.user.id);
  note(req.user, '2fa_enabled', req);
  const t = templates.twoFactor({ name: req.user.name, enabled: true });
  sendMail({ to: req.user.email, subject: t.subject, html: t.html, text: t.text, kind: '2fa-enabled' }).catch(() => {});
  res.json({ ok: true, backupCodes: codes });
}));

async function confirmSensitive(req, res) {
  const { password, code } = parse(z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(12) }), req.body);
  if (!bcrypt.compareSync(password, req.user.password_hash)) { res.status(400).json({ error: 'Password is incorrect' }); return false; }
  if (!(await checkSecondFactor(req.user, code))) { res.status(400).json({ error: 'That code is not valid.' }); return false; }
  return true;
}
router.post('/2fa/disable', requireAuth, limiter, wrap(async (req, res) => {
  if (!req.user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
  if (!(await confirmSensitive(req, res))) return;
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(req.user.id);
  db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(req.user.id);
  note(req.user, '2fa_disabled', req);
  const t = templates.twoFactor({ name: req.user.name, enabled: false });
  sendMail({ to: req.user.email, subject: t.subject, html: t.html, text: t.text, kind: '2fa-disabled' }).catch(() => {});
  res.json({ ok: true });
}));
router.post('/2fa/backup-codes', requireAuth, limiter, wrap(async (req, res) => {
  if (!req.user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
  if (!(await confirmSensitive(req, res))) return;
  note(req.user, '2fa_backup_codes_regenerated', req);
  res.json({ ok: true, backupCodes: makeBackupCodes(req.user.id) });
}));

router.get('/activity', requireAuth, wrap((req, res) => res.json(queryDataset('activity', req.query, { userId: req.user.id }, req.query))));

export default router;
