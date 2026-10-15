import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, ADMIN } from './helpers.js';

let t; let adminTok; let userTok;
before(async () => {
  t = await boot();
  adminTok = await t.login(ADMIN.email, ADMIN.password);
  userTok = await t.login('ayesha@demo.meridian', 'Demo@12345');
});
after(async () => { await t.close(); });

test('public settings: no video and no ads by default', async () => {
  const r = await t.api('GET', '/api/settings');
  assert.equal(r.status, 200); assert.equal(r.body.heroVideoUrl, null); assert.deepEqual(r.body.ads, []);
});

test('settings: admin only; validates video URL and ad links', async () => {
  const body = { site_name: 'Meridian', tagline: 't' };
  assert.equal((await t.api('GET', '/api/admin/settings')).status, 401);
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: userTok, body })).status, 403);
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: adminTok, body: { ...body, hero_video_url: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: adminTok, body: { ...body, ads: [{ slot: 'landing', title: 'x', url: 'javascript:alert(1)' }] } })).status, 400);
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: adminTok, body: { ...body, ads: Array.from({ length: 5 }, () => ({ slot: 'landing', title: 'x', url: 'https://a.example' })) } })).status, 400, 'max four ads');
});

test('ads: only enabled ads are public; hero video URL is exposed', async () => {
  const ads = [
    { slot: 'landing', title: 'Broker offer', text: 'Zero commission', cta: 'Open', url: 'https://broker.example/?ref=1', enabled: true },
    { slot: 'dashboard', title: 'Hidden', text: '', cta: 'Go', url: 'https://hidden.example', enabled: false },
  ];
  const r = await t.api('PUT', '/api/admin/settings', { token: adminTok, body: { site_name: 'Meridian', tagline: 't', hero_video_url: 'https://cdn.example/promo.mp4', ads } });
  assert.equal(r.status, 200); assert.equal(r.body.settings.ads.length, 2);
  const pub = await t.api('GET', '/api/settings');
  assert.equal(pub.body.heroVideoUrl, 'https://cdn.example/promo.mp4');
  assert.equal(pub.body.ads.length, 1); assert.equal(pub.body.ads[0].title, 'Broker offer');
  assert.ok(!JSON.stringify(pub.body).includes('Hidden'));
});

test('hero video upload: type check, stored under /uploads, removable', async () => {
  const bad = new FormData(); bad.append('video', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  assert.equal((await t.api('POST', '/api/admin/hero-video', { token: adminTok, form: bad })).status, 400);
  const denied = new FormData(); denied.append('video', new Blob(['x'], { type: 'video/mp4' }), 'x.mp4');
  assert.equal((await t.api('POST', '/api/admin/hero-video', { token: userTok, form: denied })).status, 403);
  const ok = new FormData(); ok.append('video', new Blob([Buffer.alloc(2048)], { type: 'video/mp4' }), 'hero.mp4');
  const r = await t.api('POST', '/api/admin/hero-video', { token: adminTok, form: ok });
  assert.equal(r.status, 200); assert.match(r.body.heroVideoUrl, /^\/uploads\/hero-[a-f0-9]+\.mp4$/);
  assert.ok(fs.existsSync(path.join(t.dir, 'uploads', path.basename(r.body.heroVideoUrl))));
  assert.equal((await t.api('GET', '/api/settings')).body.heroVideoUrl, r.body.heroVideoUrl);
  const served = await t.api('GET', r.body.heroVideoUrl, { raw: true }); assert.equal(served.status, 200);
  assert.equal((await t.api('DELETE', '/api/admin/hero-video', { token: adminTok })).status, 200);
  assert.equal((await t.api('GET', '/api/settings')).body.heroVideoUrl, null);
  assert.ok(!fs.existsSync(path.join(t.dir, 'uploads', path.basename(r.body.heroVideoUrl))));
});
