import { db, nowIso } from '../db.js';
import { getPrice, onTick } from './market.js';
import { toUser } from '../realtime.js';
import { scheduleMasterRebuild } from './excel.js';
import { config } from '../config.js';

const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const r2 = (n) => Number(n.toFixed(2));
const pnlOf = (t, price) => (price - t.entry_price) * t.qty * (t.side === 'BUY' ? 1 : -1);

function checkLevels(side, ref, sl, tp) {
  if (side === 'BUY') {
    if (sl != null && !(sl < ref)) throw bad('Stop loss must be below the entry price for a BUY');
    if (tp != null && !(tp > ref)) throw bad('Take profit must be above the entry price for a BUY');
  } else {
    if (sl != null && !(sl > ref)) throw bad('Stop loss must be above the entry price for a SELL');
    if (tp != null && !(tp < ref)) throw bad('Take profit must be below the entry price for a SELL');
  }
}

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

const openTradeTx = db.transaction((order, price, reservedCash) => {
  const margin = order.qty * price;
  // reservedCash was already taken from balance when a limit order was placed; market orders reserve 0
  db.prepare('UPDATE users SET balance = balance + ? - ? WHERE id = ?').run(reservedCash, margin, order.user_id);
  const t = db.prepare(`INSERT INTO trades (user_id, order_id, symbol, side, qty, entry_price, stop_loss, take_profit, opened_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(order.user_id, order.id, order.symbol, order.side, order.qty, price, order.stop_loss, order.take_profit, nowIso());
  db.prepare("UPDATE orders SET status = 'filled', fill_price = ?, filled_at = ? WHERE id = ?").run(price, nowIso(), order.id);
  return t.lastInsertRowid;
});

export function placeOrder(userId, { symbol, side, type, qty, limitPrice, stopLoss, takeProfit }) {
  const price = getPrice(symbol);
  if (!price) throw bad('No market price available for this symbol right now');
  const user = getUser(userId);
  const ref = type === 'limit' ? limitPrice : price;
  if (type === 'limit' && !(limitPrice > 0)) throw bad('A limit price is required for limit orders');
  checkLevels(side, ref, stopLoss, takeProfit);
  const notional = qty * ref;
  if (notional > user.balance + 1e-9) throw bad(`Insufficient paper balance: this order needs ${notional.toFixed(2)} USD, you have ${user.balance.toFixed(2)} USD`);
  const info = db.prepare(`INSERT INTO orders (user_id, symbol, side, type, qty, limit_price, stop_loss, take_profit) VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, symbol, side, type, qty, type === 'limit' ? limitPrice : null, stopLoss ?? null, takeProfit ?? null);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  let tradeId = null;
  const marketable = type === 'market' || (side === 'BUY' ? price <= limitPrice : price >= limitPrice);
  if (marketable) {
    tradeId = openTradeTx(order, price, 0);
  } else {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(notional, userId); // reserve cash for the pending limit order
  }
  scheduleMasterRebuild();
  return { order: db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), tradeId };
}

export function cancelOrder(userId, orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
  if (!o) throw bad('Order not found', 404);
  if (o.status !== 'pending') throw bad('Only pending orders can be cancelled');
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(o.id);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(o.qty * o.limit_price, userId);
  })();
  scheduleMasterRebuild();
}

const closeTx = db.transaction((t, price, reason) => {
  const pnl = r2(pnlOf(t, price));
  const payout = Math.max(t.qty * t.entry_price + pnl, 0);
  db.prepare("UPDATE trades SET status = 'closed', closed_at = ?, close_price = ?, pnl = ?, close_reason = ? WHERE id = ? AND status = 'open'")
    .run(nowIso(), price, pnl, reason, t.id);
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(payout, t.user_id);
  return pnl;
});

export function closeTrade(userId, tradeId, reason = 'manual') {
  const t = db.prepare("SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'open'").get(tradeId, userId);
  if (!t) throw bad('Open position not found', 404);
  const price = getPrice(t.symbol);
  if (!price) throw bad('No market price available right now');
  const pnl = closeTx(t, price, reason);
  scheduleMasterRebuild();
  return { pnl, price };
}

export function portfolio(userId) {
  const user = getUser(userId);
  const open = db.prepare("SELECT * FROM trades WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC").all(userId)
    .map((t) => { const price = getPrice(t.symbol) ?? t.entry_price; const pnl = pnlOf(t, price); return { ...t, price, pnl: r2(pnl), pnlPct: Number(((pnl / (t.qty * t.entry_price)) * 100).toFixed(2)) }; });
  const pending = db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC").all(userId);
  const reserved = pending.reduce((s, o) => s + o.qty * o.limit_price, 0);
  const margin = open.reduce((s, t) => s + t.qty * t.entry_price, 0);
  const unrealized = open.reduce((s, t) => s + t.pnl, 0);
  const closed = db.prepare("SELECT COUNT(*) n, SUM(pnl > 0) w, SUM(pnl <= 0) l, COALESCE(SUM(pnl),0) p FROM trades WHERE user_id = ? AND status = 'closed'").get(userId);
  return {
    balance: r2(user.balance), reserved: r2(reserved), margin: r2(margin), unrealized: r2(unrealized),
    equity: r2(user.balance + reserved + margin + unrealized), startBalance: config.startBalance,
    realized: r2(closed.p), closedCount: closed.n, wins: closed.w || 0, losses: closed.l || 0,
    winRate: closed.n ? Number((((closed.w || 0) / closed.n) * 100).toFixed(1)) : null,
    open, pending,
  };
}

export function resetAccount(userId) {
  for (const t of db.prepare("SELECT * FROM trades WHERE user_id = ? AND status = 'open'").all(userId)) {
    const price = getPrice(t.symbol) ?? t.entry_price; closeTx(t, price, 'manual');
  }
  for (const o of db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'pending'").all(userId)) cancelOrder(userId, o.id);
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(config.startBalance, userId);
  scheduleMasterRebuild();
}

/** Runs on every market tick: fills pending limit orders and triggers SL / TP on open positions. */
export function runEngine() {
  const events = [];
  for (const o of db.prepare("SELECT * FROM orders WHERE status = 'pending'").all()) {
    const price = getPrice(o.symbol); if (!price) continue;
    const hit = o.side === 'BUY' ? price <= o.limit_price : price >= o.limit_price;
    if (!hit) continue;
    const tradeId = openTradeTx(o, price, o.qty * o.limit_price);
    events.push([o.user_id, { type: 'order_filled', symbol: o.symbol, side: o.side, price, orderId: o.id, tradeId }]);
  }
  for (const t of db.prepare("SELECT * FROM trades WHERE status = 'open' AND (stop_loss IS NOT NULL OR take_profit IS NOT NULL)").all()) {
    const price = getPrice(t.symbol); if (!price) continue;
    let reason = null; let fill = price;
    if (t.side === 'BUY') {
      if (t.stop_loss != null && price <= t.stop_loss) { reason = 'stop_loss'; fill = t.stop_loss; }
      else if (t.take_profit != null && price >= t.take_profit) { reason = 'take_profit'; fill = t.take_profit; }
    } else if (t.stop_loss != null && price >= t.stop_loss) { reason = 'stop_loss'; fill = t.stop_loss; }
    else if (t.take_profit != null && price <= t.take_profit) { reason = 'take_profit'; fill = t.take_profit; }
    if (!reason) continue;
    const pnl = closeTx(t, fill, reason);
    events.push([t.user_id, { type: reason, symbol: t.symbol, side: t.side, price: fill, pnl, tradeId: t.id }]);
  }
  if (events.length) { scheduleMasterRebuild(); for (const [uid, ev] of events) toUser(uid, 'trade:update', ev); }
  return events.length;
}

let off = null;
export function startEngine() { off = onTick(() => { try { runEngine(); } catch (e) { console.error('[engine]', e); } }); }
export function stopEngine() { off?.(); }
