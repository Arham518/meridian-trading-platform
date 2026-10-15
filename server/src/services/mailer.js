import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;
export const mailMode = () => (config.smtp ? 'smtp' : 'dev');
const sentLog = []; // last messages kept in memory (used by tests / admin diagnostics)
export const recentMail = () => sentLog.slice(-50);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Sends an email. With SMTP_* configured it goes through nodemailer.
 * Without SMTP it uses the DEV transport: the message is written to server/data/outbox/*.html
 * and the action link is printed in the server console, so every flow works offline.
 */
export async function sendMail({ to, subject, html, text, kind = 'message', link = null }) {
  const msg = { to, subject, html, text, kind, link, at: new Date().toISOString() };
  sentLog.push(msg); if (sentLog.length > 200) sentLog.shift();
  if (!config.smtp) {
    fs.mkdirSync(config.outboxDir, { recursive: true });
    const file = path.join(config.outboxDir, `${Date.now()}-${kind}-${slug(to)}.html`);
    const banner = `<!-- DEV MAIL (no SMTP configured) | to: ${to} | subject: ${subject} | link: ${link || '-'} -->\n`;
    fs.writeFileSync(file, banner + html);
    if (process.env.NODE_ENV !== 'test') console.log(`\n[dev mail] ${kind} -> ${to}\n[dev mail] subject: ${subject}${link ? `\n[dev mail] link:    ${link}` : ''}\n[dev mail] file:    ${file}\n`);
    return { dev: true, file };
  }
  transport ||= nodemailer.createTransport(config.smtp);
  try {
    await transport.sendMail({ from: config.mailFrom, to, subject, html, text });
    return { dev: false };
  } catch (e) {
    console.error(`[mail] failed to send ${kind} to ${to}: ${e.message}`);
    return { dev: false, error: e.message };
  }
}
