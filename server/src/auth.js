import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';
import { sessionActive } from './services/security.js';

/** Short-lived access token, bound to a revocable DB session (sid). */
export const signToken = (user, sid) => jwt.sign({ sub: user.id, role: user.role, sid, typ: 'access' }, config.jwtSecret, { expiresIn: config.accessTtl });
export const signPurposeToken = (user, typ, expiresIn = '5m') => jwt.sign({ sub: user.id, typ }, config.jwtSecret, { expiresIn });
export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

export const publicUser = (u) => u && ({
  id: u.id, name: u.name, username: u.username || null, email: u.email, role: u.role, status: u.status, balance: u.balance,
  emailVerified: !!u.email_verified_at, twoFactorEnabled: !!u.totp_enabled, pendingEmail: u.pending_email || null,
  createdAt: u.created_at, lastLoginAt: u.last_login_at,
});

/** Resolves an access token to an active user, or null (also null when the session was revoked or the account disabled). */
export function userFromToken(token, { withSession = false } = {}) {
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    if (payload.typ !== 'access' || !payload.sid || !sessionActive(payload.sid)) return null;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || user.status !== 'active') return null;
    return withSession ? { user, sid: payload.sid } : user;
  } catch { return null; }
}

const bearer = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : null; };

export function requireAuth(req, res, next) {
  const r = userFromToken(bearer(req), { withSession: true });
  if (!r) return res.status(401).json({ error: 'Authentication required' });
  req.user = r.user; req.sid = r.sid;
  next();
}
export function optionalAuth(req, res, next) {
  const r = userFromToken(bearer(req), { withSession: true });
  if (r) { req.user = r.user; req.sid = r.sid; }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (config.requireAdmin2fa && !req.user.totp_enabled) return res.status(403).json({ error: 'Enable two-factor authentication to use the admin area.', code: '2fa_required' });
  next();
}

/** Blocks signals + paper-trading writes until the email address is confirmed (admins are always allowed). */
export function requireVerified(req, res, next) {
  if (!config.requireVerification || req.user?.role === 'admin' || req.user?.email_verified_at) return next();
  return res.status(403).json({ error: 'Verify your email address to use this feature.', code: 'email_unverified' });
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function logActivity({ userId = null, email, event = 'login', success = true, req }) {
  db.prepare('INSERT INTO login_activity (user_id, email, event, success, ip, user_agent) VALUES (?,?,?,?,?,?)')
    .run(userId, email, event, success ? 1 : 0, req?.ip || null, String(req?.headers?.['user-agent'] || '').slice(0, 250));
}
