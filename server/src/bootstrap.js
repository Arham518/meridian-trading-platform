import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

/** Creates the administrator on first run. Password comes from ADMIN_PASSWORD or is generated and saved. */
export function ensureAdmin() {
  if (db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()) return null;
  const generated = !config.adminPassword;
  const password = config.adminPassword || `Mx${crypto.randomBytes(5).toString('hex')}#${crypto.randomInt(10, 99)}`;
  db.prepare("INSERT INTO users (name, email, password_hash, role, balance, email_verified_at) VALUES (?,?,?,?,?,?)")
    .run('Administrator', config.adminEmail, bcrypt.hashSync(password, 11), 'admin', config.startBalance, new Date().toISOString());
  const file = path.join(config.dataDir, 'admin-credentials.txt');
  if (generated) {
    fs.writeFileSync(file, `Meridian admin login (generated on first run)\nEmail:    ${config.adminEmail}\nPassword: ${password}\n\nChange it after logging in: Account -> Change password.\nDelete this file once you have saved the password.\n`, { mode: 0o600 });
  }
  const line = '='.repeat(64);
  console.log(`\n${line}\n  ADMIN ACCOUNT CREATED\n  Email:    ${config.adminEmail}\n  Password: ${generated ? password : '(from ADMIN_PASSWORD in .env)'}\n${generated ? `  Saved to: ${file}\n` : ''}${line}\n`);
  return { email: config.adminEmail, password: generated ? password : null, generated };
}
