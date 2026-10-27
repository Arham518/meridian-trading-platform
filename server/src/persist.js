// Hosted-mode persistence: keeps the app's SQLite database (and uploaded files) safe in PostgreSQL.
//
// Hosting platforms such as Hostless give an app only a temporary disk, so a plain SQLite file would be
// lost on every deploy or restart. When DATABASE_URL is set, this module:
//   1. on start-up rebuilds the working SQLite file from the last full copy stored in PostgreSQL plus
//      every change recorded after it (SQLite "session" changesets), and restores uploaded files;
//   2. records each change as a changeset and writes it to PostgreSQL, in order. A request that changed
//      something gets its response only after the change is stored, so a confirmed action is never lost;
//   3. now and then saves a new full copy and drops the changes it already contains.
// The app keeps using the same synchronous SQLite code, so every query behaves exactly as in local dev.
// Run one replica only (socket.io and the market engine are in-memory as well).
// Without DATABASE_URL nothing here runs and the app uses server/data as before.
import fs from 'node:fs';
import path from 'node:path';
import { constants as sqlc } from 'node:sqlite';

export const enabled = !!process.env.DATABASE_URL;

const FLUSH_DELAY_MS = Number(process.env.PERSIST_FLUSH_MS) || 250;
const COMPACT_EVERY = Number(process.env.PERSIST_COMPACT_EVERY) || 500; // changesets between full copies
const COMPACT_MS = Number(process.env.PERSIST_COMPACT_MINUTES || 30) * 60 * 1000;
const HOLD_LIMIT_MS = 15000;
const log = (...a) => { if (process.env.NODE_ENV !== 'test') console.log('[persist]', ...a); };

let pool = null;
let db = null; // Database wrapper from sqlite.js
let session = null;
let uploadDir = null;
let dbFile = null;
let dirty = false;
let timer = null;
let compactTimer = null;
let pendingOps = 0;
let queue = Promise.resolve();
let changesSinceSnapshot = 0;
let lastError = null;
const knownFiles = new Map(); // name -> "size:mtimeMs"

async function getPool() {
  if (pool) return pool;
  const { default: pg } = await import('pg');
  let connectionString = process.env.DATABASE_URL;
  let ssl;
  const mode = (process.env.DATABASE_SSL || '').toLowerCase(); // '', 'no-verify', 'disable'
  if (mode === 'no-verify' || mode === 'disable') {
    const u = new URL(connectionString);
    u.searchParams.delete('sslmode'); u.searchParams.delete('ssl');
    connectionString = u.toString();
    ssl = mode === 'no-verify' ? { rejectUnauthorized: false } : false;
  }
  pool = new pg.Pool({ connectionString, ssl, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  pool.on('error', (e) => console.error('[persist] idle client error:', e.message));
  return pool;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs database work strictly in order; retries until it succeeds so no change is skipped. */
function enqueue(label, op) {
  pendingOps++;
  queue = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      try { await op(); lastError = null; break; } catch (e) {
        lastError = `${label}: ${e.message}`;
        console.error(`[persist] ${label} failed (attempt ${attempt + 1}):`, e.message);
        await sleep(Math.min(15000, 500 * 2 ** attempt));
      }
    }
    pendingOps--;
  });
  return queue;
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS meridian_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data BYTEA NOT NULL,
      last_seq BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS meridian_changes (
      seq BIGSERIAL PRIMARY KEY,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS meridian_files (
      name TEXT PRIMARY KEY,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
}

/** Before SQLite opens: write the stored copy to dbPath, restore uploads. Returns the changes to replay. */
export async function restore({ dbPath, uploadDir: dir }) {
  const p = await getPool();
  await ensureTables(p);
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const snap = (await p.query('SELECT data, last_seq FROM meridian_snapshot WHERE id = 1')).rows[0];
  const lastSeq = snap ? snap.last_seq : 0;
  if (snap) fs.writeFileSync(dbPath, snap.data);
  const changes = (await p.query('SELECT seq, data FROM meridian_changes WHERE seq > $1 ORDER BY seq', [lastSeq])).rows;

  fs.mkdirSync(dir, { recursive: true });
  const names = (await p.query('SELECT name FROM meridian_files')).rows.map((r) => r.name);
  for (const name of names) {
    const row = (await p.query('SELECT data FROM meridian_files WHERE name = $1', [name])).rows[0];
    if (row && path.basename(name) === name) fs.writeFileSync(path.join(dir, name), row.data);
  }
  log(`restored ${snap ? `database copy (${snap.data.length} bytes)` : 'empty database'}, ${changes.length} change(s), ${names.length} file(s)`);
  return changes;
}

/** Replays recorded changesets on the freshly opened database. */
export function applyChanges(database, changes) {
  const onConflict = (type) => (type === sqlc.SQLITE_CHANGESET_DATA || type === sqlc.SQLITE_CHANGESET_CONFLICT
    ? sqlc.SQLITE_CHANGESET_REPLACE : sqlc.SQLITE_CHANGESET_OMIT);
  for (const c of changes) {
    const ok = database.raw.applyChangeset(new Uint8Array(c.data), { onConflict });
    if (!ok) console.error(`[persist] change ${c.seq} was not fully applied`);
  }
}

function startSession() { session = db.raw.createSession(); }

/** Moves everything changed since the last capture into the write queue (synchronous, so nothing is missed). */
function capture() {
  if (!session) return;
  const cs = session.changeset();
  session.close();
  startSession();
  dirty = false;
  if (!cs.length) return;
  changesSinceSnapshot++;
  const data = Buffer.from(cs.buffer, cs.byteOffset, cs.byteLength);
  enqueue('save change', () => pool.query('INSERT INTO meridian_changes (data) VALUES ($1)', [data]));
}

function scanFiles() {
  if (!uploadDir) return;
  let names = [];
  try { names = fs.readdirSync(uploadDir); } catch { names = []; }
  const seen = new Set();
  for (const name of names) {
    let st; try { st = fs.statSync(path.join(uploadDir, name)); } catch { continue; }
    if (!st.isFile()) continue;
    seen.add(name);
    const sig = `${st.size}:${st.mtimeMs}`;
    if (knownFiles.get(name) === sig) continue;
    knownFiles.set(name, sig);
    enqueue(`save file ${name}`, async () => {
      let data; try { data = fs.readFileSync(path.join(uploadDir, name)); } catch { return; } // removed meanwhile
      await pool.query(`INSERT INTO meridian_files (name, data) VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET data = excluded.data, updated_at = now()`, [name, data]);
    });
  }
  for (const name of [...knownFiles.keys()]) {
    if (seen.has(name)) continue;
    knownFiles.delete(name);
    enqueue(`remove file ${name}`, () => pool.query('DELETE FROM meridian_files WHERE name = $1', [name]));
  }
}

/** Saves a full copy of the database and removes the changes that it already contains. */
function snapshot() {
  capture();
  const tmp = path.join(path.dirname(dbFile), `.snapshot-${process.pid}-${Date.now()}.db`);
  db.raw.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const data = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  changesSinceSnapshot = 0;
  return enqueue('save full copy', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // every change captured before this copy is already in the table (the queue runs in order)
      const { rows: [{ max }] } = await c.query('SELECT COALESCE(MAX(seq), 0) AS max FROM meridian_changes');
      await c.query(`INSERT INTO meridian_snapshot (id, data, last_seq) VALUES (1, $1, $2)
        ON CONFLICT (id) DO UPDATE SET data = excluded.data, last_seq = excluded.last_seq, updated_at = now()`, [data, max]);
      await c.query('DELETE FROM meridian_changes WHERE seq <= $1', [max]);
      await c.query('COMMIT');
      log(`saved full copy (${data.length} bytes)`);
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  });
}

function markDirty() {
  dirty = true;
  if (!timer) timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, FLUSH_DELAY_MS);
}

/** After SQLite is open and migrated: store a full copy and start recording changes. */
export async function attach(database, { uploadDir: dir, dbPath }) {
  db = database;
  dbFile = dbPath;
  uploadDir = dir;
  for (const name of fs.readdirSync(dir)) {
    try { const st = fs.statSync(path.join(dir, name)); if (st.isFile()) knownFiles.set(name, `${st.size}:${st.mtimeMs}`); } catch { /* gone */ }
  }
  startSession();
  db.onWrite = markDirty;
  await snapshot();
  compactTimer = setInterval(() => { if (changesSinceSnapshot > 0) snapshot().catch(() => {}); }, COMPACT_MS);
  compactTimer.unref();
}

/** Resolves when every change made so far is stored in PostgreSQL. */
export function flush() {
  if (!enabled || !db) return Promise.resolve();
  if (timer) { clearTimeout(timer); timer = null; }
  capture();
  scanFiles();
  if (changesSinceSnapshot >= COMPACT_EVERY) snapshot();
  return queue;
}

export const pending = () => enabled && !!db && (dirty || pendingOps > 0);
export const status = () => ({ enabled, pendingOps, lastError });

/** Express middleware: delays res.end() until the request's changes are stored. */
export function holdResponseUntilSaved(req, res, next) {
  if (!enabled) return next();
  const end = res.end;
  res.end = function patchedEnd(...args) {
    res.end = end;
    if (!pending()) return end.apply(this, args);
    let done = false;
    const send = () => { if (done) return; done = true; clearTimeout(limit); end.apply(this, args); };
    const limit = setTimeout(() => { if (!done) console.error('[persist] response sent before the change was stored (database slow or unreachable)'); send(); }, HOLD_LIMIT_MS);
    flush().then(send, send);
    return this;
  };
  next();
}

export async function shutdown() {
  if (!enabled || !db) return;
  clearInterval(compactTimer);
  db.onWrite = null;
  await flush();
  session?.close(); session = null;
  db = null;
  await pool?.end(); pool = null;
}
