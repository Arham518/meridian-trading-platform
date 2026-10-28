// Scheduled housekeeping: keeps the working database (and its PostgreSQL copy) small.
//  - sessions that expired, or were revoked more than a day ago
//  - one-time email / reset tokens that expired or were used more than a day ago
//  - login activity older than ACTIVITY_RETENTION_DAYS (180 by default)
import { db } from '../db.js';
import { config } from '../config.js';

let timer = null;
let first = null;
let last = null; // { at, sessions, tokens, activity } | { at, error }

export function runCleanup({ now = Date.now() } = {}) {
  const iso = new Date(now).toISOString();
  const day = new Date(now - 86400000).toISOString();
  try {
    const r = db.transaction(() => ({
      sessions: db.prepare('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(iso, day).changes,
      tokens: db.prepare('DELETE FROM auth_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)').run(iso, day).changes,
      activity: db.prepare('DELETE FROM login_activity WHERE created_at < ?').run(new Date(now - config.activityRetentionDays * 86400000).toISOString()).changes,
    }))();
    last = { at: new Date().toISOString(), ...r };
    if (process.env.NODE_ENV !== 'test' && (r.sessions || r.tokens || r.activity)) console.log(`[cleanup] removed ${r.sessions} session(s), ${r.tokens} token(s), ${r.activity} old activity row(s)`);
    return r;
  } catch (e) {
    last = { at: new Date().toISOString(), error: e.message };
    console.error('[cleanup] failed:', e.message);
    return null;
  }
}

export function startCleanup() {
  stopCleanup();
  first = setTimeout(() => runCleanup(), 30000); first.unref(); // first run shortly after start, off the boot path
  timer = setInterval(() => runCleanup(), config.cleanupHours * 3600 * 1000);
  timer.unref();
}
export function stopCleanup() { clearTimeout(first); clearInterval(timer); timer = null; first = null; }
export const cleanupInfo = () => ({ intervalHours: config.cleanupHours, retentionDays: config.activityRetentionDays, last });
