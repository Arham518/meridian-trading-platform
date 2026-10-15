import { Server } from 'socket.io';
import { config } from './config.js';
import { userFromToken } from './auth.js';

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
  });
  return io;
}

export const broadcastLive = (event, payload) => io?.to('live').emit(event, payload);
export const broadcast = (event, payload) => io?.to('members').emit(event, payload);
export const toUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const connectedCount = () => io?.engine?.clientsCount || 0;
