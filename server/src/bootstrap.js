import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, setSetting } from './db.js';
import { config } from './config.js';
import { revokeUserSessions } from './services/security.js';

// Fingerprint of the last ADMIN_EMAIL/ADMIN_PASSWORD pair applied from the environment (a bcrypt hash, never the password).
const ENV_KEY = 'admin_env_fingerprint';
const fingerprintMatches = (email, password) => {
  const fp = getSettings()[ENV_KEY];
  if (!fp) return false;
  try { const { email: e, hash } = JSON.parse(fp); return e === email && bcrypt.compareSync(password, hash); } catch { return false; }
};
const saveFingerprint = (email, password) => setSetting(ENV_KEY, JSON.stringify({ email, hash: bcrypt.hashSync(password, 10), at: new Date().toISOString() }));

/**
 * Makes sure the administrator from ADMIN_EMAIL / ADMIN_PASSWORD exists and uses that password.
 * - First run without any admin: creates one (password from ADMIN_PASSWORD, or generated and saved to a file).
 * - ADMIN_PASSWORD set: the account with ADMIN_EMAIL is created if missing. When the env password differs from the
 *   one applied last time, that account gets it (plus the admin role, active status, unlocked) and all its sessions
 *   are signed out. While the env value stays the same, a password changed on the Account page is left alone.
 * Returns what happened ({ created | passwordUpdated }) or null when nothing changed.
 */
export function ensureAdmin({ email = config.adminEmail, password = config.adminPassword } = {}) {
  email = String(email).toLowerCase();
  const anyAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!password) {
    if (anyAdmin) return null;
    const generated = `Mx${crypto.randomBytes(5).toString('hex')}#${crypto.randomInt(10, 99)}`;
    createAdmin(email, generated);
    const file = path.join(config.dataDir, 'admin-credentials.txt');
    fs.writeFileSync(file, `Meridian admin login (generated on first run)\nEmail:    ${email}\nPassword: ${generated}\n\nChange it after logging in: Account -> Change password.\nDelete this file once you have saved the password.\n`, { mode: 0o600 });
    banner('ADMIN ACCOUNT CREATED', email, generated, file);
    return { email, password: generated, generated: true, created: true };
  }

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!existing) {
    createAdmin(email, password);
    saveFingerprint(email, password);
    banner('ADMIN ACCOUNT CREATED', email, '(from ADMIN_PASSWORD)');
    return { email, password: null, generated: false, created: true };
  }
  if (fingerprintMatches(email, password)) return null; // env unchanged since it was last applied
  const already = bcrypt.compareSync(password, existing.password_hash);
  if (!already) {
    db.prepare("UPDATE users SET password_hash = ?, force_reset = 0, failed_logins = 0, locked_until = NULL WHERE id = ?").run(bcrypt.hashSync(password, 11), existing.id);
    revokeUserSessions(existing.id);
  }
  db.prepare("UPDATE users SET role = 'admin', status = 'active', email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(new Date().toISOString(), existing.id);
  db.prepare('INSERT INTO login_activity (user_id, email, event, success, ip, user_agent) VALUES (?,?,?,?,?,?)').run(existing.id, email, 'admin_env_password', 1, null, 'ADMIN_PASSWORD (server start)');
  saveFingerprint(email, password);
  if (!already && process.env.NODE_ENV !== 'test') console.log(`[admin] password for ${email} updated from ADMIN_PASSWORD; its sessions were signed out.`);
  return { email, passwordUpdated: !already };
}

function createAdmin(email, password) {
  db.prepare("INSERT INTO users (name, email, password_hash, role, balance, email_verified_at) VALUES (?,?,?,?,?,?)")
    .run('Administrator', email, bcrypt.hashSync(password, 11), 'admin', config.startBalance, new Date().toISOString());
}

function banner(title, email, password, file) {
  if (process.env.NODE_ENV === 'test') return;
  const line = '='.repeat(64);
  console.log(`\n${line}\n  ${title}\n  Email:    ${email}\n  Password: ${password}\n${file ? `  Saved to: ${file}\n` : ''}${line}\n`);
}
