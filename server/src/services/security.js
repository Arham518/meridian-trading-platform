import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

// ---------------- one-time email tokens (only a SHA-256 hash is stored) ----------------
export const TOKEN_TTL = { verify_email: 24 * 3600e3, reset_password: 60 * 60e3, change_email: 60 * 60e3 };

export function createToken(userId, type, data = null, ttlMs = TOKEN_TTL[type]) {
  // issuing a new token of a type invalidates earlier unused ones
  db.prepare("UPDATE auth_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND type = ? AND used_at IS NULL").run(userId, type);
  const token = randomToken();
  db.prepare('INSERT INTO auth_tokens (user_id, type, token_hash, data, expires_at) VALUES (?,?,?,?,?)').run(userId, type, sha256(token), data, isoIn(ttlMs));
  return token;
}
/** Atomically consumes a token (single use). Returns the row or null when unknown / used / expired. */
export function consumeToken(token, type) {
  if (!token || typeof token !== 'string') return null;
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND type = ?').get(sha256(token), type);
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) return null;
  const r = db.prepare("UPDATE auth_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND used_at IS NULL").run(row.id);
  return r.changes === 1 ? row : null;
}
/** Seconds the user must still wait before another mail of this type may be sent (0 = allowed). */
export function cooldownLeft(userId, type) {
  if (!config.verifyCooldownSeconds) return 0;
  const last = db.prepare('SELECT created_at FROM auth_tokens WHERE user_id = ? AND type = ? ORDER BY id DESC LIMIT 1').get(userId, type);
  if (!last) return 0;
  return Math.max(0, Math.ceil((new Date(last.created_at).getTime() + config.verifyCooldownSeconds * 1000 - Date.now()) / 1000));
}

// ---------------- sessions (refresh-token rotation) ----------------
const GRACE_MS = config.refreshGraceMs; // a refresh retried within 10 s (two tabs, flaky network) is not treated as theft

export function createSession(user, { remember, ip, userAgent }) {
  const id = crypto.randomBytes(12).toString('hex');
  const secret = randomToken(32);
  const ttl = remember ? config.refreshDaysRemember * 86400e3 : config.refreshHoursSession * 3600e3;
  db.prepare('INSERT INTO sessions (id, user_id, refresh_hash, remember, ip, user_agent, expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, user.id, sha256(secret), remember ? 1 : 0, ip || null, String(userAgent || '').slice(0, 250), isoIn(ttl));
  return { sid: id, refreshToken: `${id}.${secret}`, remember: !!remember, maxAgeMs: ttl };
}

/** Validates + rotates a refresh token. Returns { session, refreshToken, maxAgeMs } or { error }. Reuse of an old token revokes the session. */
export function rotateSession(refreshToken) {
  const [sid, secret] = String(refreshToken || '').split('.');
  if (!sid || !secret) return { error: 'missing' };
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
  if (!s || s.revoked_at) return { error: 'revoked' };
  if (s.expires_at < new Date().toISOString()) return { error: 'expired' };
  const h = sha256(secret);
  const now = Date.now();
  const isCurrent = h === s.refresh_hash;
  const isGrace = s.prev_hash && h === s.prev_hash && now < (s.prev_valid_until || 0);
  if (!isCurrent && !isGrace) {
    db.prepare("UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(sid);
    return { error: 'reuse', userId: s.user_id };
  }
  const ttl = s.remember ? config.refreshDaysRemember * 86400e3 : config.refreshHoursSession * 3600e3;
  const next = randomToken(32);
  if (isCurrent) {
    db.prepare("UPDATE sessions SET prev_hash = refresh_hash, prev_valid_until = ?, refresh_hash = ?, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), expires_at = ? WHERE id = ?")
      .run(now + GRACE_MS, sha256(next), isoIn(ttl), sid);
    return { session: s, refreshToken: `${sid}.${next}`, maxAgeMs: ttl };
  }
  // grace replay: a parallel request carrying the just-rotated cookie. The browser already holds the new cookie, so just confirm validity.
  db.prepare("UPDATE sessions SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(sid);
  return { session: s, refreshToken: null, maxAgeMs: ttl };
}

export const sessionActive = (sid) => {
  const s = db.prepare('SELECT revoked_at, expires_at FROM sessions WHERE id = ?').get(sid);
  return !!s && !s.revoked_at && s.expires_at >= new Date().toISOString();
};
export const revokeSession = (sid) => db.prepare("UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revoked_at IS NULL").run(sid).changes;
export const revokeUserSessions = (userId, exceptSid = null) =>
  db.prepare("UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL AND id != ?").run(userId, exceptSid || '').changes;
export const listSessions = (userId) => db.prepare("SELECT id, ip, user_agent, remember, created_at, last_used_at, expires_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at >= ? ORDER BY last_used_at DESC").all(userId, new Date().toISOString());

// ---------------- backup codes ----------------
export function makeBackupCodes(userId, n = 8) {
  db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT INTO backup_codes (user_id, code_hash) VALUES (?,?)');
  const codes = Array.from({ length: n }, () => { const h = crypto.randomBytes(5).toString('hex'); return `${h.slice(0, 5)}-${h.slice(5)}`; });
  for (const c of codes) ins.run(userId, sha256(c));
  return codes;
}
export function useBackupCode(userId, code) {
  const c = String(code || '').trim().toLowerCase();
  if (!/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(c)) return false;
  return db.prepare("UPDATE backup_codes SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND code_hash = ? AND used_at IS NULL").run(userId, sha256(c)).changes === 1;
}
export const backupCodesLeft = (userId) => db.prepare('SELECT COUNT(*) n FROM backup_codes WHERE user_id = ? AND used_at IS NULL').get(userId).n;

// ---------------- cookie helpers (no cookie-parser dependency) ----------------
export function readCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return null;
}
export function setRefreshCookie(res, value, maxAgeMs, remember) {
  const parts = [`rt=${encodeURIComponent(value)}`, 'Path=/api/auth', 'HttpOnly', 'SameSite=Lax'];
  if (remember) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`); // persistent only when "remember me" is on
  if (config.cookieSecure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
export const clearRefreshCookie = (res) => res.append('Set-Cookie', `rt=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${config.cookieSecure ? '; Secure' : ''}`);
