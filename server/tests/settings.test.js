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
  assert.equal((await t.api('PUT', '/api/admin/settings', { token: adminTok, body: { ...body, ads: Array.from({ length: 13 }, () => ({ slot: 'landing', title: 'x', url: 'https://a.example' })) } })).status, 400, 'max twelve ads');
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

test('hero video end-to-end: uploaded file is served with range support, link save, YouTube/Vimeo embeds, https only', async () => {
  // upload a real (tiny) MP4 header and read it back like a browser does (Range request)
  const bytes = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(4096, 1)]);
  const fd = new FormData(); fd.append('video', new Blob([bytes], { type: 'video/mp4' }), 'promo.mp4');
  const up = await t.api('POST', '/api/admin/hero-video', { token: adminTok, form: fd });
  assert.equal(up.status, 200);
  assert.deepEqual(up.body.heroVideo, { kind: 'file', src: up.body.heroVideoUrl });
  const pub = (await t.api('GET', '/api/settings')).body;
  assert.equal(pub.heroVideoUrl, up.body.heroVideoUrl);
  assert.equal(pub.heroVideo.kind, 'file');
  const full = await fetch(t.base + pub.heroVideoUrl);
  assert.equal(full.status, 200); assert.match(full.headers.get('content-type'), /video\/mp4/);
  const part = await fetch(t.base + pub.heroVideoUrl, { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 100);
  const csp = full.headers.get('content-security-policy');
  assert.match(csp, /media-src 'self' https: blob:/);
  assert.match(csp, /frame-src [^;]*youtube-nocookie\.com[^;]*player\.vimeo\.com/);
  // MOV from phones is accepted; other types and oversize files get a clear message
  const mov = new FormData(); mov.append('video', new Blob([bytes], { type: 'video/quicktime' }), 'clip.mov');
  const m = await t.api('POST', '/api/admin/hero-video', { token: adminTok, form: mov });
  assert.equal(m.status, 200); assert.match(m.body.heroVideoUrl, /\.mov$/);
  assert.ok(!fs.existsSync(path.join(t.dir, 'uploads', path.basename(up.body.heroVideoUrl))), 'previous upload removed');
  const big = new FormData(); big.append('video', new Blob([Buffer.alloc(26 * 1024 * 1024)], { type: 'video/mp4' }), 'big.mp4');
  const b = await t.api('POST', '/api/admin/hero-video', { token: adminTok, form: big });
  assert.equal(b.status, 413); assert.match(b.body.error, /larger than 25 MB/);
  // link: saved immediately through PUT /hero-video
  const link = async (url) => t.api('PUT', '/api/admin/hero-video', { token: adminTok, body: { url } });
  assert.equal((await link('http://cdn.example/v.mp4')).status, 400, 'http:// is refused (mixed content on an https site)');
  assert.equal((await link('ftp://x/v.mp4')).status, 400);
  const yt = await link('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10');
  assert.equal(yt.status, 200); assert.equal(yt.body.heroVideo.kind, 'youtube');
  assert.match(yt.body.heroVideo.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ/);
  assert.equal((await t.api('GET', '/api/settings')).body.heroVideo.kind, 'youtube');
  assert.equal((await link('https://youtu.be/dQw4w9WgXcQ')).body.heroVideo.id, 'dQw4w9WgXcQ');
  assert.equal((await link('https://vimeo.com/76979871')).body.heroVideo.kind, 'vimeo');
  const direct = await link('https://cdn.example.com/promo.webm');
  assert.deepEqual(direct.body.heroVideo, { kind: 'file', src: 'https://cdn.example.com/promo.webm' });
  assert.equal((await link('')).body.heroVideoUrl, null);
  assert.equal((await t.api('GET', '/api/settings')).body.heroVideo, null);
});

test('ads: link, image and AdSense units per slot; validation; CSP opens Google domains only while AdSense is on', async () => {
  const csp0 = (await fetch(`${t.base}/api/health`)).headers.get('content-security-policy');
  assert.ok(!csp0.includes('googlesyndication'), 'no AdSense domains by default');
  const img = new FormData(); img.append('image', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'b.png');
  const iu = await t.api('POST', '/api/admin/ad-image', { token: adminTok, form: img });
  assert.equal(iu.status, 201); assert.match(iu.body.image, /^\/uploads\/ad-[a-f0-9]+\.png$/);
  const badImg = new FormData(); badImg.append('image', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await t.api('POST', '/api/admin/ad-image', { token: adminTok, form: badImg })).status, 400, 'SVG refused');
  const put = (ads) => t.api('PUT', '/api/admin/settings', { token: adminTok, body: { site_name: 'Meridian', tagline: 't', ads } });
  assert.equal((await put([{ slot: 'top', type: 'image', image: 'javascript:x', url: 'https://a.example' }])).status, 400);
  assert.equal((await put([{ slot: 'top', type: 'adsense', adClient: 'pub-1', adSlot: '1' }])).status, 400);
  assert.equal((await put([{ slot: 'nowhere', type: 'link', title: 'x', url: 'https://a.example' }])).status, 400);
  assert.equal((await put([{ slot: 'top', type: 'link', title: 'x', url: 'http://a.example' }])).status, 400, 'https only');
  const ads = [
    { slot: 'top', type: 'image', title: 'Broker banner', image: iu.body.image, url: 'https://broker.example/?ref=top', enabled: true },
    { slot: 'dashboard', type: 'link', title: 'VPS for traders', text: 'Low latency', cta: 'See plans', url: 'https://vps.example', enabled: true },
    { slot: 'signals', type: 'adsense', adClient: 'ca-pub-1234567890123456', adSlot: '9876543210', enabled: true },
    { slot: 'between_signals', type: 'link', title: 'Course', url: 'https://course.example', enabled: true },
    { slot: 'landing', type: 'link', title: 'Off', url: 'https://off.example', enabled: false },
  ];
  const r = await put(ads);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.settings.ads.every((a) => a.id), 'every ad gets an id');
  const pub = (await t.api('GET', '/api/settings')).body.ads;
  assert.deepEqual(pub.map((a) => [a.slot, a.type]), [['top', 'image'], ['dashboard', 'link'], ['signals', 'adsense'], ['between_signals', 'link']]);
  assert.equal(pub[0].image, iu.body.image);
  assert.deepEqual(Object.keys(pub[2]).sort(), ['adClient', 'adSlot', 'id', 'slot', 'type']);
  assert.ok((await fetch(t.base + iu.body.image)).ok, 'uploaded ad image is served');
  const { resetAdsenseCache } = await import('../src/services/media.js'); resetAdsenseCache();
  const csp1 = (await fetch(`${t.base}/api/health`)).headers.get('content-security-policy');
  assert.match(csp1, /script-src [^;]*https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(csp1, /frame-src [^;]*googleads\.g\.doubleclick\.net/);
  assert.match(csp1, /img-src [^;]*https:/);
  // the snippet parser used by the admin form
  const { parseAdsense } = await import('../src/services/media.js');
  assert.deepEqual(parseAdsense('<ins class="adsbygoogle" data-ad-client="ca-pub-1234567890123456" data-ad-slot="1122334455"></ins>'), { client: 'ca-pub-1234567890123456', slot: '1122334455' });
  // removing the image ad deletes its uploaded file; turning AdSense off closes the CSP again
  assert.equal((await put(ads.slice(1).map((a) => ({ ...a, enabled: a.type !== 'adsense' && a.enabled })))).status, 200);
  assert.ok(!fs.existsSync(path.join(t.dir, 'uploads', path.basename(iu.body.image))));
  resetAdsenseCache();
  assert.ok(!(await fetch(`${t.base}/api/health`)).headers.get('content-security-policy').includes('googlesyndication'));
  // legacy text ads (no type) still work
  assert.equal((await put([{ slot: 'landing', title: 'Legacy', url: 'https://legacy.example' }])).status, 200);
  assert.equal((await t.api('GET', '/api/settings')).body.ads[0].type, 'link');
});
