import { db } from '../db.js';

// One definition per record type: SQL source, filters, and Excel column layout.
// The same definition feeds the paginated JSON lists and the Excel exports.

const like = (s) => `%${String(s).replace(/[%_\\]/g, (m) => '\\' + m)}%`;

function dateRange(col, f, where, params) {
  if (f.from) { where.push(`${col} >= ?`); params.push(new Date(f.from).toISOString()); }
  if (f.to) { const d = new Date(f.to); if (/^\d{4}-\d{2}-\d{2}$/.test(String(f.to))) d.setUTCHours(23, 59, 59, 999); where.push(`${col} <= ?`); params.push(d.toISOString()); }
}

export const DATASETS = {
  signals: {
    sheet: 'Signals',
    from: 'signals s LEFT JOIN users u ON u.id = s.created_by',
    select: 's.*, u.name AS author',
    order: 's.created_at DESC, s.id DESC',
    where(f, ctx, w, p) {
      if (f.scope === 'active') w.push("s.status = 'active'");
      if (f.scope === 'history') w.push("s.status != 'active'");
      if (f.status) { w.push('s.status = ?'); p.push(f.status); }
      if (f.direction) { w.push('s.direction = ?'); p.push(f.direction); }
      if (f.pair) { w.push('s.pair = ?'); p.push(String(f.pair).toUpperCase()); }
      if (f.q) { w.push("(s.pair LIKE ? ESCAPE '\\' OR s.notes LIKE ? ESCAPE '\\')"); p.push(like(f.q), like(f.q)); }
      dateRange('s.created_at', f, w, p);
    },
    columns: [
      { header: 'ID', key: 'id', width: 7, type: 'int' },
      { header: 'Created (UTC)', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Pair', key: 'pair', width: 11 },
      { header: 'Direction', key: 'direction', width: 11, type: 'direction' },
      { header: 'Timeframe', key: 'timeframe', width: 11 },
      { header: 'Entry', key: 'entry', width: 13, type: 'price' },
      { header: 'Stop loss', key: 'stop_loss', width: 13, type: 'price' },
      { header: 'TP1', key: 'tp1', width: 13, type: 'price' },
      { header: 'TP2', key: 'tp2', width: 13, type: 'price' },
      { header: 'Risk', key: 'risk', width: 9 },
      { header: 'Status', key: 'status', width: 12, type: 'status' },
      { header: 'Result %', key: 'result_pct', width: 11, type: 'pct' },
      { header: 'Result pips', key: 'result_pips', width: 12, type: 'pnl' },
      { header: 'Closed (UTC)', key: 'closed_at', width: 20, type: 'datetime' },
      { header: 'Published by', key: 'author', width: 18 },
      { header: 'Analysis notes', key: 'notes', width: 60 },
      { header: 'Demo data', key: 'is_demo', width: 10, type: 'bool' },
    ],
  },
  trades: {
    sheet: 'Trades',
    from: 'trades t JOIN users u ON u.id = t.user_id',
    select: 't.*, u.email AS user_email, u.name AS user_name',
    order: 't.opened_at DESC, t.id DESC',
    where(f, ctx, w, p) {
      if (ctx.userId) { w.push('t.user_id = ?'); p.push(ctx.userId); }
      else if (f.userId) { w.push('t.user_id = ?'); p.push(Number(f.userId)); }
      if (f.status) { w.push('t.status = ?'); p.push(f.status); }
      if (f.symbol) { w.push('t.symbol = ?'); p.push(String(f.symbol).toUpperCase()); }
      if (f.side) { w.push('t.side = ?'); p.push(f.side); }
      if (f.result === 'win') w.push('t.pnl > 0');
      if (f.result === 'loss') w.push('t.pnl < 0');
      if (f.q) { w.push("(t.symbol LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(like(f.q), like(f.q)); }
      dateRange('t.opened_at', f, w, p);
    },
    columns: [
      { header: 'ID', key: 'id', width: 7, type: 'int' },
      { header: 'User', key: 'user_email', width: 28, adminOnly: true },
      { header: 'Opened (UTC)', key: 'opened_at', width: 20, type: 'datetime' },
      { header: 'Symbol', key: 'symbol', width: 11 },
      { header: 'Side', key: 'side', width: 8, type: 'direction' },
      { header: 'Quantity', key: 'qty', width: 12, type: 'qty' },
      { header: 'Entry price', key: 'entry_price', width: 14, type: 'price' },
      { header: 'Stop loss', key: 'stop_loss', width: 13, type: 'price' },
      { header: 'Take profit', key: 'take_profit', width: 13, type: 'price' },
      { header: 'Status', key: 'status', width: 10, type: 'status' },
      { header: 'Closed (UTC)', key: 'closed_at', width: 20, type: 'datetime' },
      { header: 'Close price', key: 'close_price', width: 14, type: 'price' },
      { header: 'P&L (USD)', key: 'pnl', width: 14, type: 'pnl' },
      { header: 'Closed by', key: 'close_reason', width: 13 },
      { header: 'Demo data', key: 'is_demo', width: 10, type: 'bool' },
    ],
  },
  orders: {
    sheet: 'Orders',
    from: 'orders o JOIN users u ON u.id = o.user_id',
    select: 'o.*, u.email AS user_email',
    order: 'o.created_at DESC, o.id DESC',
    where(f, ctx, w, p) {
      if (ctx.userId) { w.push('o.user_id = ?'); p.push(ctx.userId); }
      if (f.status) { w.push('o.status = ?'); p.push(f.status); }
      if (f.symbol) { w.push('o.symbol = ?'); p.push(String(f.symbol).toUpperCase()); }
      if (f.q) { w.push("(o.symbol LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(like(f.q), like(f.q)); }
      dateRange('o.created_at', f, w, p);
    },
    columns: [
      { header: 'ID', key: 'id', width: 7, type: 'int' },
      { header: 'User', key: 'user_email', width: 28, adminOnly: true },
      { header: 'Created (UTC)', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Symbol', key: 'symbol', width: 11 },
      { header: 'Side', key: 'side', width: 8, type: 'direction' },
      { header: 'Type', key: 'type', width: 9 },
      { header: 'Quantity', key: 'qty', width: 12, type: 'qty' },
      { header: 'Limit price', key: 'limit_price', width: 14, type: 'price' },
      { header: 'Stop loss', key: 'stop_loss', width: 13, type: 'price' },
      { header: 'Take profit', key: 'take_profit', width: 13, type: 'price' },
      { header: 'Status', key: 'status', width: 11, type: 'status' },
      { header: 'Fill price', key: 'fill_price', width: 14, type: 'price' },
      { header: 'Filled (UTC)', key: 'filled_at', width: 20, type: 'datetime' },
    ],
  },
  users: {
    sheet: 'Users',
    from: 'users u',
    select: '(SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS trades_count, u.id, u.name, u.username, u.email, u.email_verified_at, u.totp_enabled, u.locked_until, u.role, u.status, u.balance, u.is_demo, u.created_at, u.last_login_at',
    order: 'u.created_at DESC, u.id DESC',
    where(f, ctx, w, p) {
      if (f.role) { w.push('u.role = ?'); p.push(f.role); }
      if (f.status) { w.push('u.status = ?'); p.push(f.status); }
      if (f.verified === 'yes') w.push('u.email_verified_at IS NOT NULL');
      if (f.verified === 'no') w.push('u.email_verified_at IS NULL');
      if (f.q) { w.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')"); p.push(like(f.q), like(f.q), like(f.q)); }
      dateRange('u.created_at', f, w, p);
    },
    columns: [
      { header: 'ID', key: 'id', width: 7, type: 'int' },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Username', key: 'username', width: 16 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Email verified (UTC)', key: 'email_verified_at', width: 21, type: 'datetime' },
      { header: '2FA', key: 'totp_enabled', width: 7, type: 'bool' },
      { header: 'Role', key: 'role', width: 9 },
      { header: 'Status', key: 'status', width: 11, type: 'status' },
      { header: 'Paper balance (USD)', key: 'balance', width: 20, type: 'money' },
      { header: 'Trades', key: 'trades_count', width: 9, type: 'int' },
      { header: 'Registered (UTC)', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Last login (UTC)', key: 'last_login_at', width: 20, type: 'datetime' },
      { header: 'Demo data', key: 'is_demo', width: 10, type: 'bool' },
    ],
  },
  watchlists: {
    sheet: 'Watchlists',
    from: 'watchlists w JOIN users u ON u.id = w.user_id',
    select: 'w.id, w.symbol, w.created_at, u.email AS user_email, u.name AS user_name',
    order: 'w.created_at DESC, w.id DESC',
    where(f, ctx, w, p) {
      if (ctx.userId) { w.push('w.user_id = ?'); p.push(ctx.userId); }
      if (f.q) { w.push("(w.symbol LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(like(f.q), like(f.q)); }
    },
    columns: [
      { header: 'ID', key: 'id', width: 7, type: 'int' },
      { header: 'User', key: 'user_email', width: 30 },
      { header: 'Symbol', key: 'symbol', width: 12 },
      { header: 'Added (UTC)', key: 'created_at', width: 20, type: 'datetime' },
    ],
  },
  activity: {
    sheet: 'Activity',
    from: 'login_activity a',
    select: 'a.*',
    order: 'a.created_at DESC, a.id DESC',
    where(f, ctx, w, p) {
      if (ctx.userId) { w.push('a.user_id = ?'); p.push(ctx.userId); }
      if (f.success === '1' || f.success === '0') { w.push('a.success = ?'); p.push(Number(f.success)); }
      if (f.event) { w.push('a.event = ?'); p.push(f.event); }
      if (f.q) { w.push("(a.email LIKE ? ESCAPE '\\' OR a.ip LIKE ? ESCAPE '\\')"); p.push(like(f.q), like(f.q)); }
      dateRange('a.created_at', f, w, p);
    },
    columns: [
      { header: 'ID', key: 'id', width: 7, type: 'int' },
      { header: 'Time (UTC)', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Event', key: 'event', width: 12 },
      { header: 'Success', key: 'success', width: 10, type: 'bool' },
      { header: 'IP address', key: 'ip', width: 18 },
      { header: 'Browser / agent', key: 'user_agent', width: 50 },
    ],
  },
};

function build(type, filters = {}, ctx = {}) {
  const def = DATASETS[type];
  const where = []; const params = [];
  def.where(filters, ctx, where, params);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { def, clause, params };
}

export function queryDataset(type, filters = {}, ctx = {}, { page = 1, pageSize = 20 } = {}) {
  const { def, clause, params } = build(type, filters, ctx);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100); page = Math.max(Number(page) || 1, 1);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${def.from} ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT ${def.select} FROM ${def.from} ${clause} ORDER BY ${def.order} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

export function allRows(type, filters = {}, ctx = {}, cap = 50000) {
  const { def, clause, params } = build(type, filters, ctx);
  return db.prepare(`SELECT ${def.select} FROM ${def.from} ${clause} ORDER BY ${def.order} LIMIT ${cap}`).all(...params);
}
