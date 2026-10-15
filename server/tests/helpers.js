import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export const ADMIN = { email: 'admin@test.local', password: 'AdminPass#2026' };

/** Boots a fully isolated server (temp data dir, simulated market) on a random port. */
export async function boot(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-test-'));
  Object.assign(process.env, {
    DATA_DIR: dir, FORCE_SIMULATED: 'true', SEED_DEMO: 'true', ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password,
    RATE_LIMIT_AUTH: '1000', NODE_ENV: 'test', ...extraEnv,
  });
  const { startServer } = await import('../src/index.js');
  const srv = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${srv.port}`;
  async function api(method, url, { token, body, form, raw, cookie } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    if (raw) return res;
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, headers: res.headers, cookies: res.headers.getSetCookie?.() || [] };
  }
  /** Mail captured by the dev transport (server/data/outbox). */
  const outbox = () => (fs.existsSync(path.join(dir, 'outbox')) ? fs.readdirSync(path.join(dir, 'outbox')).sort() : []);
  const mailsTo = (to, kind) => outbox().filter((f) => f.includes(`-${kind}-`) && f.endsWith(`-${String(to).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.html`))
    .map((f) => fs.readFileSync(path.join(dir, 'outbox', f), 'utf8'));
  const tokenFrom = (html) => { const m = html.match(/link: [^\s]*[?]token=([^\s&]+)/); return m ? decodeURIComponent(m[1]) : null; };
  const lastToken = (to, kind) => { const all = mailsTo(to, kind); return all.length ? tokenFrom(all[all.length - 1]) : null; };
  const register = (email, name = 'Test Trader', password = 'Trader#2026a', extra = {}) =>
    api('POST', '/api/auth/register', { body: { name, email, password, confirmPassword: password, ...extra } });
  const verify = async (email) => (await api('POST', '/api/auth/verify-email', { body: { token: lastToken(email, 'verify-email') } })).status === 200;
  const registerVerified = async (email, name, password) => { const r = await register(email, name, password); await verify(email); return r; };
  const login = async (email, password) => (await api('POST', '/api/auth/login', { body: { email, password } })).body?.token;
  return { srv, base, api, login, dir, outbox, mailsTo, lastToken, register, verify, registerVerified, async close() { await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
