import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';

let t;
after(async () => { await t?.close(); });

test('auth endpoints are rate limited', async () => {
  t = await boot({ RATE_LIMIT_AUTH: '5', RATE_LIMIT_MAIL: '3', SEED_DEMO: 'false' });
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await t.api('POST', '/api/auth/login', { body: { email: 'x@example.com', password: 'wrong-password-1' } })).status);
  assert.ok(codes.slice(0, 5).every((c) => c === 401));
  assert.ok(codes.slice(5).every((c) => c === 429), `expected 429s after limit, got ${codes}`);
});

test('email-sending endpoints are rate limited separately', async () => {
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await t.api('POST', '/api/auth/forgot-password', { body: { email: 'someone@example.com' } })).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('security headers are present and secrets are not exposed', async () => {
  const res = await t.api('GET', '/api/settings', { raw: true });
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  // the persisted JWT secret must never be reachable over HTTP (an SPA fallback page is fine, the secret is not)
  const secret = fs.readFileSync(path.join(t.dir, '.jwt-secret'), 'utf8').trim();
  for (const url of ['/uploads/../.jwt-secret', '/uploads/.jwt-secret', '/.jwt-secret', '/uploads/..%2F.jwt-secret', '/data/.jwt-secret']) {
    const r = await fetch(t.base + url); const body = await r.text();
    assert.ok(!body.includes(secret), `secret leaked via ${url}`);
  }
});
