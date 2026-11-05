import { chromium } from 'playwright-core';
const B = 'http://localhost:4100'; const log = console.log;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 400, height: 1400 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); page.on('pageerror', (e) => log('PAGEERROR', e.message));
await page.goto(B + '/login');
await page.evaluate(async () => { await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password: 'AdminPass#2026' }) }); localStorage.setItem('meridian_session', '1'); });
await page.goto(B + '/app/trade/ETHUSDT'); await page.waitForSelector('[aria-label="Chart drawing area"]'); await page.waitForTimeout(4000);
const area = page.locator('[aria-label="Chart drawing area"]').first(); const box = await area.boundingBox(); log('mobile area', box.width|0, box.height|0);
const E = () => page.evaluate(() => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; return { n: e.drawings.length, tool: e.tool, last: e.drawings.at(-1)?.type }; });
await page.evaluate(() => document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.load([]));
const tb = page.locator('[aria-label="Drawing tools"]');
await tb.getByRole('button', { name: 'Rectangle' }).tap().catch(async () => { await tb.locator('[data-grp="shapes"] button').first().tap(); });
log('tool after tap', await E(), box.y|0, await tb.getByRole('button', { name: 'Rectangle' }).boundingBox(), await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label="Rectangle"]')][0].getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el?.outerHTML.slice(0, 120); }));
const range0 = await page.evaluate(() => JSON.stringify(document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.getChart().timeScale().getVisibleLogicalRange()));
await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.3); log('after tap1', await page.evaluate(() => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; return [e.tool, !!e.draft, document.elementFromPoint(0,0) && 1]; }));
await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.45);
const range1 = await page.evaluate(() => JSON.stringify(document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.getChart().timeScale().getVisibleLogicalRange()));
log('touch rect', await E(), 'chart did not pan', range0 === range1);
// futures toggle
await page.getByRole('tab', { name: 'Perp' }).tap(); await page.waitForTimeout(9000);
log('badge', await page.evaluate(() => document.body.innerText.match(/Binance (Spot|Perp)( · WS)?/)?.[0]), 'drawings on perp', (await E()).n);
await page.getByRole('tab', { name: 'Spot' }).tap(); await page.waitForTimeout(3000); log('back to spot', (await E()).n);
// timeframe switch keeps per-tf sets
await page.getByRole('tab', { name: '4H' }).tap(); await page.waitForTimeout(2500); log('4H', (await E()).n);
await page.getByRole('tab', { name: '1H' }).tap(); await page.waitForTimeout(2500); log('1H again', (await E()).n);
await page.screenshot({ path: '/tmp/pw/mobile.png' });
await browser.close();
