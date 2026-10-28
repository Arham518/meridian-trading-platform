import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { db } from '../db.js';

let transport = null;
export const mailMode = () => (config.smtp ? 'smtp' : 'dev');
const sentLog = []; // last messages kept in memory (used by tests / admin diagnostics)
export const recentMail = () => sentLog.slice(-50);
const KEEP = 300; // rows kept in mail_log (Admin > Email)
let smtpState = { checked: false, ok: null, error: null, at: null };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const quiet = () => process.env.NODE_ENV === 'test';

function getTransport() {
  transport ||= nodemailer.createTransport({ ...config.smtp, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 });
  return transport;
}

/** Records the message in mail_log (stored in PostgreSQL too in hosted mode). The HTML is kept only for dev-outbox mail. */
function record({ to, subject, kind, link, html, transport: tr, status, error = null }) {
  try {
    db.prepare('INSERT INTO mail_log (to_addr, subject, kind, transport, status, error, link, html) VALUES (?,?,?,?,?,?,?,?)')
      .run(String(to), String(subject), kind, tr, status, error, tr === 'dev' ? link : null, tr === 'dev' ? html : null);
    db.prepare('DELETE FROM mail_log WHERE id <= (SELECT MAX(id) FROM mail_log) - ?').run(KEEP);
  } catch (e) { console.error('[mail] could not record message:', e.message); }
}

/** SMTP settings without the password, for the admin panel. */
export function mailStatus() {
  const s = config.smtp;
  return {
    mode: mailMode(), from: config.mailFrom,
    smtp: s ? { host: s.host, port: s.port, secure: s.secure, user: s.auth?.user || null, passwordSet: !!s.auth?.pass } : null,
    check: smtpState,
  };
}

/** Tries to log in to the SMTP server (start-up + admin panel). Never throws; logs a loud error on failure. */
export async function verifySmtp() {
  if (!config.smtp) return null;
  try {
    await getTransport().verify();
    smtpState = { checked: true, ok: true, error: null, at: new Date().toISOString() };
    if (!quiet()) console.log(`[mail] SMTP ready: ${config.smtp.host}:${config.smtp.port} as ${config.smtp.auth?.user || '(no login)'}`);
  } catch (e) {
    smtpState = { checked: true, ok: false, error: e.message, at: new Date().toISOString() };
    console.error(`[mail] !!! SMTP CHECK FAILED (${config.smtp.host}:${config.smtp.port}): ${e.message}. Emails will NOT be delivered until SMTP_* settings are fixed.`);
  }
  return smtpState;
}

/**
 * Sends an email. With SMTP_* configured it goes through nodemailer.
 * Without SMTP it uses the DEV transport: the message is written to server/data/outbox/*.html, listed in
 * Admin > Email (mail_log table) and the action link is printed in the server console, so every flow works offline.
 * Returns { dev, file? } or { dev: false, error } when SMTP refused the message.
 */
export async function sendMail({ to, subject, html, text, kind = 'message', link = null }) {
  const msg = { to, subject, html, text, kind, link, at: new Date().toISOString() };
  sentLog.push(msg); if (sentLog.length > 200) sentLog.shift();
  if (!config.smtp) {
    fs.mkdirSync(config.outboxDir, { recursive: true });
    const file = path.join(config.outboxDir, `${Date.now()}-${kind}-${slug(to)}.html`);
    const banner = `<!-- DEV MAIL (no SMTP configured) | to: ${to} | subject: ${subject} | link: ${link || '-'} -->\n`;
    fs.writeFileSync(file, banner + html);
    record({ to, subject, kind, link, html, transport: 'dev', status: 'saved' });
    if (!quiet()) console.log(`\n[dev mail] ${kind} -> ${to}\n[dev mail] subject: ${subject}${link ? `\n[dev mail] link:    ${link}` : ''}\n[dev mail] file:    ${file}\n`);
    return { dev: true, file };
  }
  try {
    const info = await getTransport().sendMail({ from: config.mailFrom, to, subject, html, text });
    const rejected = [...(info.rejected || [])];
    if (rejected.length) throw new Error(`recipient rejected: ${rejected.join(', ')}`);
    record({ to, subject, kind, transport: 'smtp', status: 'sent' });
    if (!quiet()) console.log(`[mail] sent ${kind} to ${to} (${info.messageId || 'no id'})`);
    return { dev: false, messageId: info.messageId };
  } catch (e) {
    record({ to, subject, kind, transport: 'smtp', status: 'failed', error: e.message });
    console.error(`[mail] !!! FAILED to send ${kind} to ${to} via ${config.smtp.host}:${config.smtp.port}: ${e.message}`);
    return { dev: false, error: e.message };
  }
}
