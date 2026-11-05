import { Server } from 'socket.io';
import { config } from './config.js';
import { userFromToken } from './auth.js';
import { createKlineHub, roomFor, validSub } from './services/klineStream.js';
import { SYMBOL_MAP } from './services/symbols.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    serveClient: false,
  });
  io.use((socket, next) => {
    const user = userFromToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.id}`);
    socket.join('live'); // market ticks are public data: every signed-in user gets them
    const u = socket.data.user;
    if (!config.requireVerification || u.role === 'admin' || u.email_verified_at) socket.join('members'); // signals/ticks only for verified members
    if (u.role === 'admin') socket.join('admins'); // live updates for the admin area (user list, emails)
    // live candles: each socket watches at most one chart stream; the hub shares one Binance WS per market
    let sub = null;
    const drop = () => { if (!sub) return; socket.leave(roomFor(sub.market, sub.symbol, sub.interval)); hub.unsubscribe(sub.market, sub.symbol, sub.interval); sub = null; };
    socket.on('kline:sub', (b, ack) => {
      const next = b && { market: String(b.market), symbol: String(b.symbol || '').toUpperCase(), interval: String(b.interval) };
      const ok = validSub(next) && SYMBOL_MAP.get(next.symbol)?.feed === 'binance' && hub.enabled;
      if (sub && next && sub.market === next.market && sub.symbol === next.symbol && sub.interval === next.interval) return typeof ack === 'function' && ack({ ok: true });
      drop();
      if (ok) { sub = next; socket.join(roomFor(sub.market, sub.symbol, sub.interval)); hub.subscribe(sub.market, sub.symbol, sub.interval); }
      if (typeof ack === 'function') ack({ ok });
    });
    socket.on('kline:unsub', drop);
    socket.on('disconnect', drop);
  });
  return io;
}
const hub = createKlineHub((market, p) => io?.to(roomFor(market, p.symbol, p.interval)).emit('kline', { market, ...p }));
export const klineStatus = () => hub.status();
export const closeKlines = () => hub.close();

export const broadcastLive = (event, payload) => io?.to('live').emit(event, payload);
export const broadcast = (event, payload) => io?.to('members').emit(event, payload);
export const toUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const connectedCount = () => io?.engine?.clientsCount || 0;
export const toAdmins = (event, payload) => io?.to('admins').emit(event, payload);
/** Tells open admin pages that the user list changed (new registration, login, edit) so they reload it. */
export const usersChanged = (reason = 'update') => toAdmins('users:changed', { reason, at: Date.now() });
