// Demo data - clearly labelled as demo (is_demo = 1). Safe to run repeatedly: it only seeds when no demo rows exist.
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { config } from './config.js';
import { SYMBOL_MAP, pipSizeFor } from './services/symbols.js';
import { computeResult } from './services/signals.js';
import { ensureAdmin } from './bootstrap.js';

export const DEMO_PASSWORD = 'Demo@12345';
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
const px = (symbol, mult) => { const m = SYMBOL_MAP.get(symbol); return Number((m.base * mult).toFixed(m.decimals)); };

// [pair, dir, entryMult, slPct, tp1Pct, tp2Pct, tf, risk, status, hoursAgo, note]
const SIGNALS = [
  ['XAUUSD', 'BUY', 1.0, 0.45, 0.6, 1.1, '1h', 'medium', 'active', 3, 'Gold defending the prior-day low with a bullish engulfing on H1. Look for continuation toward the weekly high while above the 20 EMA.'],
  ['BTCUSDT', 'BUY', 1.0, 1.4, 1.8, 3.4, '4h', 'high', 'active', 6, 'Range reclaim on the 4H with rising volume. Invalidation below the range low; scale out at TP1 and trail the rest.'],
  ['EURUSD', 'SELL', 1.0, 0.28, 0.35, 0.7, '15m', 'low', 'active', 9, 'Rejection from the 50 EMA after a lower high. Targets the session low; avoid holding through high-impact news.'],
  ['ETHUSDT', 'SELL', 1.0, 1.9, 2.4, 4.1, '1h', 'medium', 'active', 14, 'Bearish divergence on RSI at resistance. Conservative entry on the retest of the broken trendline.'],
  ['GBPUSD', 'BUY', 1.0, 0.3, 0.45, 0.8, '1h', 'medium', 'hit_tp1', 30, 'Breakout and retest of the daily pivot. TP1 reached; stop moved to break-even for the runner.'],
  ['USDJPY', 'SELL', 1.0, 0.32, 0.4, 0.75, '1h', 'medium', 'hit_tp2', 52, 'Yield spread narrowing; clean impulsive leg lower from supply. Both targets achieved.'],
  ['SOLUSDT', 'BUY', 1.0, 2.8, 3.5, 6.2, '4h', 'high', 'hit_sl', 76, 'Higher-low structure on the 4H. Stopped out after a sharp market-wide sell-off; setup invalidated.'],
  ['NAS100', 'BUY', 1.0, 0.55, 0.7, 1.3, '1h', 'medium', 'hit_tp1', 100, 'Opening-range breakout with strong breadth. TP1 filled into the close.'],
  ['EURUSD', 'BUY', 1.0, 0.25, 0.4, 0.7, '30m', 'low', 'hit_sl', 124, 'Demand zone bounce attempt; failed on a hawkish headline. Small loss, risk kept at 0.5%.'],
  ['XAUUSD', 'SELL', 1.0, 0.5, 0.65, 1.2, '4h', 'medium', 'hit_tp2', 170, 'Overextended from the 4H mean; rotation back to value area completed.'],
  ['BTCUSDT', 'SELL', 1.0, 1.6, 2.0, 3.6, '1h', 'high', 'cancelled', 200, 'Cancelled before entry - price never retested the level and structure flipped bullish.'],
  ['AUDUSD', 'SELL', 1.0, 0.3, 0.42, 0.8, '1h', 'low', 'hit_tp1', 240, 'Risk-off tone, commodity currencies weak. TP1 hit within the London session.'],
  ['TSLA', 'BUY', 1.0, 2.1, 2.9, 5.0, '1d', 'high', 'hit_tp1', 300, 'Daily base breakout above resistance. Swing idea; closed at first target.'],
  ['LINKUSDT', 'BUY', 1.0, 3.2, 4.4, 7.5, '4h', 'high', 'hit_tp2', 360, 'Altcoin rotation with strong relative strength versus BTC. Full target reached.'],
];

export function seedDemo() {
  if (db.prepare('SELECT 1 FROM signals WHERE is_demo = 1 LIMIT 1').get()) return false;
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const mkUser = db.prepare('INSERT OR IGNORE INTO users (name, email, username, password_hash, balance, is_demo, created_at, last_login_at, email_verified_at) VALUES (?,?,?,?,?,1,?,?,?)');
  const people = [['Ayesha Khan', 'ayesha@demo.meridian', 21], ['Omar Siddiqui', 'omar@demo.meridian', 12], ['Sara Malik', 'sara@demo.meridian', 5]];
  const ids = [];
  const watch = db.prepare('INSERT OR IGNORE INTO watchlists (user_id, symbol, created_at) VALUES (?,?,?)');
  const act = db.prepare('INSERT INTO login_activity (user_id, email, event, success, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?)');
  for (const [name, email, daysAgo] of people) {
    mkUser.run(name, email, email.split('@')[0], hash, config.startBalance, iso(daysAgo * 24), iso(Math.random() * 30), iso(daysAgo * 24 - 0.1));
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email); ids.push(u.id);
    for (const s of ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'XAUUSD']) watch.run(u.id, s, iso(daysAgo * 24 - 1));
    act.run(u.id, email, 'register', 1, '203.0.113.' + (10 + u.id), 'Demo seed', iso(daysAgo * 24));
    act.run(u.id, email, 'login', 1, '203.0.113.' + (10 + u.id), 'Demo seed', iso(Math.random() * 48));
  }
  act.run(null, 'unknown@example.com', 'login', 0, '198.51.100.7', 'Demo seed', iso(30));

  const insSig = db.prepare(`INSERT INTO signals (pair, direction, entry, stop_loss, tp1, tp2, timeframe, risk, notes, status, result_pct, result_pips, is_demo, created_by, created_at, updated_at, closed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`);
  for (const [pair, dir, em, slp, t1p, t2p, tf, risk, status, ago, note] of SIGNALS) {
    const entry = px(pair, em); const m = SYMBOL_MAP.get(pair); const sgn = dir === 'BUY' ? 1 : -1; const d = m.decimals;
    const lvl = (pct) => Number((entry * (1 + sgn * pct / 100)).toFixed(d));
    const sig = { pair, direction: dir, entry, stop_loss: lvl(-slp), tp1: lvl(t1p), tp2: lvl(t2p) };
    const res = computeResult(sig, status);
    const closed = ['hit_tp1', 'hit_tp2', 'hit_sl', 'cancelled'].includes(status);
    insSig.run(pair, dir, entry, sig.stop_loss, sig.tp1, sig.tp2, tf, risk, `[DEMO] ${note}`, status, status === 'cancelled' ? null : res.pct, status === 'cancelled' ? null : res.pips, admin?.id ?? null, iso(ago), iso(closed ? ago - 4 : ago), closed ? iso(ago - 4) : null);
  }

  // Closed paper trades with plausible P&L, plus a couple of open positions.
  const insTrade = db.prepare(`INSERT INTO trades (user_id, symbol, side, qty, entry_price, stop_loss, take_profit, status, opened_at, closed_at, close_price, pnl, close_reason, is_demo)
    VALUES (?,?,?,?,?,?,?,'closed',?,?,?,?,?,1)`);
  const universe = [['BTCUSDT', 0.12], ['ETHUSDT', 2], ['SOLUSDT', 30], ['EURUSD', 40000], ['XAUUSD', 3], ['NAS100', 0.5], ['AAPL', 40]];
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const uid of ids) {
    for (let i = 0; i < 14; i++) {
      const [sym, q] = universe[Math.floor(rnd() * universe.length)]; const m = SYMBOL_MAP.get(sym);
      const side = rnd() > 0.45 ? 'BUY' : 'SELL'; const entry = Number((m.base * (0.97 + rnd() * 0.06)).toFixed(m.decimals));
      const move = (rnd() - 0.42) * 0.025; const close = Number((entry * (1 + move)).toFixed(m.decimals));
      const pnl = Number(((close - entry) * q * (side === 'BUY' ? 1 : -1)).toFixed(2));
      const ago = 24 * (1 + i * 1.8 + rnd());
      insTrade.run(uid, sym, side, q, entry, null, null, iso(ago + 3), iso(ago), close, pnl, 'manual');
    }
    // keep demo balances consistent with realised P&L
    const total = db.prepare("SELECT COALESCE(SUM(pnl),0) p FROM trades WHERE user_id = ? AND status='closed'").get(uid).p;
    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(Number((config.startBalance + total).toFixed(2)), uid);
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureAdmin();
  console.log(seedDemo() ? `Demo data created. Demo users: ayesha@demo.meridian / omar@demo.meridian / sara@demo.meridian  (password: ${DEMO_PASSWORD})` : 'Demo data already present - nothing to do.');
  const { flushMaster } = await import('./services/excel.js');
  const { scheduleMasterRebuild } = await import('./services/excel.js');
  scheduleMasterRebuild(); await flushMaster();
  const persist = await import('./persist.js');
  await persist.shutdown(); // hosted mode: store the new rows in PostgreSQL before exiting
}
