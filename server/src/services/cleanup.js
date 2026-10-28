// Scheduled housekeeping: keeps the working database (and its PostgreSQL copy) small.
//  - sessions that expired, or were revoked more than a day ago
//  - one-time email / reset tokens that expired or were used more than a day ago
//  - login activity older than ACTIVITY_RETENTION_DAYS (180 by default)
//  - hero videos / ad images that were uploaded more than a day ago but are not used by the saved settings
//    (for example an ad image uploaded and then never saved)
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings } from '../db.js';
import { config } from '../config.js';

/** Removes unreferenced hero-* and ad-* uploads older than a day. Signal images are never touched. */
export function pruneOrphanUploads({ now = Date.now() } = {}) {
  let files = [];
  try { files = fs.readdirSync(config.uploadDir); } catch { return 0; }
  const s = getSettings();
  const used = new Set([s.hero_video_url || '']);
  try { for (const a of JSON.parse(s.ads || '[]')) if (a?.image) used.add(a.image); } catch { /* bad JSON: keep everything */ return 0; }
  let n = 0;
  for (const name of files) {
    if (!/^(hero|ad)-[a-f0-9]+\.[a-z0-9]+$/.test(name) || used.has(`/uploads/${name}`)) continue;
    const f = path.join(config.uploadDir, name);
    try { if (now - fs.statSync(f).mtimeMs > 86400000) { fs.rmSync(f, { force: true }); n += 1; } } catch { /* gone */ }
  }
  return n;
}

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
    r.uploads = pruneOrphanUploads({ now });
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
