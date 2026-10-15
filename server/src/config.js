import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const SERVER_DIR = path.resolve(__dirname, '..');

const dq = { quiet: true };
dotenv.config({ path: path.join(ROOT, '.env'), ...dq });
dotenv.config({ path: path.join(SERVER_DIR, '.env'), ...dq });

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SERVER_DIR, 'data');
fs.mkdirSync(dataDir, { recursive: true });

// JWT secret: use env value, otherwise generate one once and persist it next to the database.
function resolveJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  dataDir,
  dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'meridian.db'),
  masterXlsx: path.join(dataDir, 'records.xlsx'),
  uploadDir: process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(dataDir, 'uploads'),
  clientDist: path.join(ROOT, 'client', 'dist'),
  jwtSecret: resolveJwtSecret(),
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000')
    .split(',').map((s) => s.trim()).filter(Boolean),
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@meridian.app').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  seedDemo: process.env.SEED_DEMO !== 'false',
  startBalance: Number(process.env.START_BALANCE) || 100000,
  disableMarketPoll: process.env.DISABLE_MARKET_POLL === 'true',
  forceSimulated: process.env.FORCE_SIMULATED === 'true',
  rateLimitAuth: Number(process.env.RATE_LIMIT_AUTH) || 20,
  rateLimitMail: Number(process.env.RATE_LIMIT_MAIL) || 12,
  // --- email + sessions ---
  appUrl: (process.env.APP_URL || `http://localhost:${Number(process.env.PORT) || 4000}`).replace(/\/+$/, ''),
  mailFrom: process.env.MAIL_FROM || 'Meridian <no-reply@meridian.local>',
  smtp: process.env.SMTP_HOST ? {
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  } : null,
  outboxDir: path.join(dataDir, 'outbox'),
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshDaysRemember: Number(process.env.REFRESH_DAYS_REMEMBER) || 30,
  refreshHoursSession: Number(process.env.REFRESH_HOURS_SESSION) || 24,
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : (process.env.APP_URL || '').startsWith('https://'),
  requireVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
  lockoutThreshold: Number(process.env.LOCKOUT_THRESHOLD) || 5,
  lockoutBaseSeconds: Number(process.env.LOCKOUT_BASE_SECONDS) || 60,
  verifyCooldownSeconds: Number(process.env.MAIL_COOLDOWN_SECONDS ?? 60),
  refreshGraceMs: Number(process.env.REFRESH_GRACE_MS ?? 10000),
  requireAdmin2fa: process.env.REQUIRE_ADMIN_2FA === 'true',
};
fs.mkdirSync(config.uploadDir, { recursive: true });
if (!config.smtp) fs.mkdirSync(config.outboxDir, { recursive: true });
