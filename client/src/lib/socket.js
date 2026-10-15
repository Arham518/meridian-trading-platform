import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;
export function connectSocket() {
  if (socket) socket.disconnect();
  // the auth callback runs on every (re)connect so a renewed access token is always used
  socket = io({ auth: (cb) => cb({ token: getToken() }), transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
  return socket;
}
export const getSocket = () => socket;
export function disconnectSocket() { socket?.disconnect(); socket = null; }
