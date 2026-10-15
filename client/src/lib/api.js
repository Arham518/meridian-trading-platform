/**
 * API client.
 * - The short-lived access token lives in memory only (never localStorage).
 * - A httpOnly refresh cookie (rotated by the server on every use) restores the session after a reload
 *   and silently renews the access token when it expires.
 */
let accessToken = null;
export const getToken = () => accessToken;
// A plain flag (not a credential) so anonymous visitors do not fire a pointless refresh call on every page load.
const HINT = 'meridian_session';
const hint = (on) => { try { if (on) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch { /* storage unavailable */ } };
export const hasSessionHint = () => { try { return localStorage.getItem(HINT) === '1'; } catch { return true; } };
export const setToken = (t) => { accessToken = t || null; hint(!!t); };

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status, details, extra = {}) { super(message); this.status = status; this.details = details; Object.assign(this, extra); }
}

let refreshing = null;
/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession() {
  refreshing ||= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) { if (r.status === 401) hint(false); throw new ApiError(d?.error || 'Session expired', r.status); } accessToken = d.token; hint(true); return d; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

const NO_RETRY = /^\/auth\/(login|register|refresh|forgot-password|reset-password|verify-email|confirm-email-change)/;

export async function api(path, { method = 'GET', body, form, signal } = {}, retried = false) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, body: payload, signal, credentials: 'same-origin' }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !retried && !NO_RETRY.test(path) && (accessToken || path !== '/auth/me')) {
      try { await refreshSession(); return api(path, { method, body, form, signal }, true); }
      catch { if (accessToken) { accessToken = null; onUnauthorized(); } }
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details, { code: data?.code, retryAfter: data?.retryAfter });
  }
  return data;
}

export const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Download a file produced by the backend (Excel). Sends the access token, so a plain <a href> cannot be used. */
export async function download(path, fallbackName = 'export.xlsx') {
  let res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) { await refreshSession().catch(() => {}); res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${accessToken}` } }); }
  if (!res.ok) { const d = await res.json().catch(() => null); throw new ApiError(d?.error || 'Download failed', res.status); }
  const cd = res.headers.get('content-disposition') || '';
  const name = (cd.match(/filename="?([^";]+)"?/) || [])[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}
