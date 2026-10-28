import Database from './sqlite.js';
import { config } from './config.js';
import * as persist from './persist.js';

// Hosted mode (DATABASE_URL): rebuild the working SQLite file from PostgreSQL before opening it.
const restored = persist.enabled ? await persist.restore({ dbPath: config.dbPath, uploadDir: config.uploadDir }) : null;

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
if (restored) persist.applyChanges(db, restored);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  balance REAL NOT NULL DEFAULT 100000,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, symbol)
);
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry REAL NOT NULL,
  stop_loss REAL NOT NULL,
  tp1 REAL NOT NULL,
  tp2 REAL,
  timeframe TEXT NOT NULL DEFAULT '1h',
  risk TEXT NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
  notes TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hit_tp1','hit_tp2','hit_sl','cancelled')),
  result_pct REAL,
  result_pips REAL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  type TEXT NOT NULL CHECK (type IN ('market','limit')),
  qty REAL NOT NULL,
  limit_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled','cancelled')),
  fill_price REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  filled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, status);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty REAL NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT,
  close_price REAL,
  pnl REAL,
  close_reason TEXT CHECK (close_reason IN ('manual','stop_loss','take_profit') OR close_reason IS NULL),
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, status);

CREATE TABLE IF NOT EXISTS login_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  event TEXT NOT NULL DEFAULT 'login',
  success INTEGER NOT NULL DEFAULT 1,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---- auth schema (idempotent migrations for databases created by earlier versions) ----
const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c);
const addCol = (t, c, def) => { if (hasCol(t, c)) return false; db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); return true; };
if (addCol('users', 'email_verified_at', 'TEXT')) db.exec('UPDATE users SET email_verified_at = created_at'); // accounts that pre-date verification count as verified
addCol('users', 'username', 'TEXT');
addCol('users', 'failed_logins', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'locked_until', 'TEXT');
addCol('users', 'totp_secret', 'TEXT');
addCol('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'totp_last_step', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'pending_email', 'TEXT');
addCol('users', 'force_reset', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE) WHERE username IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL,
  prev_hash TEXT,
  prev_valid_until INTEGER,
  remember INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('verify_email','reset_password','change_email')),
  token_hash TEXT NOT NULL UNIQUE,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, type);
CREATE TABLE IF NOT EXISTS backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_codes_user ON backup_codes(user_id);
-- every email the app sends (or saves to the dev outbox): shown in Admin > Email. Only the newest 300 are kept.
CREATE TABLE IF NOT EXISTS mail_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'message',
  transport TEXT NOT NULL CHECK (transport IN ('dev','smtp')),
  status TEXT NOT NULL CHECK (status IN ('saved','sent','failed')),
  error TEXT,
  link TEXT,
  html TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_mail_log_created ON mail_log(created_at);
`);

const defaults = {
  site_name: 'Meridian',
  tagline: 'Trade signals, live charts and paper trading in one place.',
  signals_public: 'true',
  hero_video_url: '',
  ads: '[]',
};
const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

// Hosted mode: save a fresh full copy (it already contains the migrations above) and start recording changes.
if (persist.enabled) await persist.attach(db, { uploadDir: config.uploadDir, dbPath: config.dbPath });

export const getSettings = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
export const setSetting = (key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

export const nowIso = () => new Date().toISOString();
