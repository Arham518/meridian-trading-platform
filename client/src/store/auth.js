import { create } from 'zustand';
import toast from 'react-hot-toast';
import { api, hasSessionHint, refreshSession, setToken, setUnauthorizedHandler } from '../lib/api.js';

let timer = null;
const RENEW_MS = 10 * 60 * 1000; // access tokens last 15 min; renew quietly in the background
const schedule = () => { clearInterval(timer); timer = setInterval(() => refreshSession().then((d) => useAuth.setState({ user: d.user })).catch(() => {}), RENEW_MS); };
const unschedule = () => { clearInterval(timer); timer = null; };

export const useAuth = create((set, get) => ({
  user: null,
  ready: false,
  /** Restores the session from the httpOnly refresh cookie (the access token is memory-only). */
  async init() {
    if (!hasSessionHint()) { set({ user: null, ready: true }); return; }
    try { const d = await refreshSession(); set({ user: d.user, ready: true }); schedule(); }
    catch { set({ user: null, ready: true }); }
  },
  /** Returns { user } on success or { requires2fa, challenge, remember } when a second factor is needed. */
  async login(identifier, password, remember = false) {
    const d = await api('/auth/login', { method: 'POST', body: { identifier, password, remember } });
    if (d.requires2fa) return d;
    setToken(d.token); set({ user: d.user }); schedule();
    return { user: d.user };
  },
  async login2fa(challenge, code, remember = false) {
    const d = await api('/auth/login/2fa', { method: 'POST', body: { challenge, code, remember } });
    setToken(d.token); set({ user: d.user }); schedule();
    return d.user;
  },
  async register(payload) {
    const d = await api('/auth/register', { method: 'POST', body: payload });
    setToken(d.token); set({ user: d.user }); schedule();
    return d.user;
  },
  async logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    setToken(null); unschedule(); set({ user: null });
  },
  async logoutAll() {
    await api('/auth/logout-all', { method: 'POST' });
    setToken(null); unschedule(); set({ user: null });
  },
  patchUser(patch) { set({ user: { ...get().user, ...patch } }); },
  async reloadUser() { const { user } = await api('/auth/me'); set({ user }); return user; },
}));

setUnauthorizedHandler(() => {
  if (useAuth.getState().user) { setToken(null); unschedule(); useAuth.setState({ user: null }); toast.error('Your session has ended. Please sign in again.'); }
});
