import { chromium } from 'playwright-core';
const B = 'http://localhost:4100';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1700 } });
page.on('pageerror', (e) => log('PAGEERROR', e.message));
await page.goto(B + '/login');
const r = await page.evaluate(async () => { const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password: 'AdminPass#2026' }), credentials: 'same-origin' }); localStorage.setItem('meridian_session', '1'); return r.status; });
log('login', r); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('meridian_session', '1'); });
await page.goto(B + '/app/trade/BTCUSDT');
await page.waitForSelector('[aria-label="Chart drawing area"]', { timeout: 20000 });
await page.waitForTimeout(4000);
await page.evaluate(() => document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.load([]));
const area = page.locator('[aria-label="Chart drawing area"]').first();
const box = await area.boundingBox(); log('area', box);
const E = () => page.evaluate(() => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; return { n: e.drawings.length, d: e.drawings.map((x) => ({ t: x.type, a: x.anchors.map((q) => [Math.round(q.time), +q.price.toFixed(2)]) })), sel: e.selectedId, tool: e.tool, undo: e.history.canUndo }; });
const px = (id) => page.evaluate((id) => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; const d = id == null ? e.drawings.at(-1) : e.drawings[id]; return d.anchors.map((a) => e.coords.toPx(a)); }, id);
const X = (fx) => box.x + box.width * fx; const Y = (fy) => box.y + box.height * fy;
const tb = page.locator('[aria-label="Drawing tools"]');
// trend line: click-click
await tb.getByRole('button', { name: 'Trend line' }).click();
await page.mouse.click(X(0.3), Y(0.4)); await page.mouse.move(X(0.5), Y(0.3)); await page.mouse.click(X(0.5), Y(0.3));
let s = await E(); log('after trend', s.n, s.d.at(-1), 'tool', s.tool);
const p0 = await px(); log('trend px', p0);
// zoom/scroll: drawings stay glued (anchor time/price unchanged, pixels change consistent with chart)
const before = await page.evaluate(() => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; return JSON.stringify(e.drawings[0].anchors); });
await page.mouse.move(X(0.5), Y(0.6)); await page.mouse.wheel(0, -400); await page.waitForTimeout(400);
const p1 = await px(); const after = await page.evaluate(() => JSON.stringify(document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.drawings[0].anchors));
log('zoom: anchors unchanged', before === after, 'px moved', p0[0].x.toFixed(1), '->', p1[0].x.toFixed(1));
// check glue: bar time at pixel equals anchor time
const glue = await page.evaluate(() => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; const a = e.drawings[0].anchors[0]; const p = e.coords.toPx(a); const back = e.coords.fromPx(p.x, p.y); return [a.time, back.time, a.price, back.price]; });
log('roundtrip', glue);
// move: drag body
const pp = await px(0); const mid = { x: (pp[0].x + pp[1].x) / 2 + box.x, y: (pp[0].y + pp[1].y) / 2 + box.y };
await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await page.mouse.move(mid.x + 30, mid.y + 20, { steps: 5 }); await page.mouse.up();
s = await E(); log('after move', s.d[0], 'sel', !!s.sel);
// resize: drag anchor 1
const pq = await px(0);
await page.mouse.move(box.x + pq[1].x, box.y + pq[1].y); await page.mouse.down(); await page.mouse.move(box.x + pq[1].x + 40, box.y + pq[1].y - 40, { steps: 5 }); await page.mouse.up();
s = await E(); log('after resize', s.d[0]);
// style
await page.getByRole('button', { name: 'Colour #f23645' }).click();
await page.getByLabel('Line width').selectOption('3'); await page.getByLabel('Line style').selectOption('dashed');
log('style', await page.evaluate(() => document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.drawings[0].style));
// undo x3 (style), redo
await tb.getByRole('button', { name: 'Undo (Ctrl+Z)' }).focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
log('undo style', await page.evaluate(() => document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.drawings[0].style));
await page.keyboard.press('Control+y'); log('redo', await page.evaluate(() => document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.drawings[0].style.color));
// other tools
const tool = async (name, pts, flyGroup) => {
  if (flyGroup) { await tb.locator(`[data-grp="${flyGroup}"] button`).first().click({ button: "right" }); await page.getByRole('menuitemradio', { name }).click(); }
  else await tb.getByRole('button', { name, exact: true }).click();
  for (const [fx, fy] of pts) await page.mouse.click(X(fx), Y(fy));
  const st = await E(); return st.d.at(-1);
};
log('ray', await tool('Ray', [[0.2, 0.7], [0.3, 0.65]], 'lines'));
log('hline', await tool('Horizontal line', [[0.4, 0.5]], 'lines'));
log('vline', await tool('Vertical line', [[0.45, 0.5]], 'lines'));
log('channel', await tool('Parallel channel', [[0.1, 0.6], [0.3, 0.5], [0.2, 0.7]], 'lines'));
log('rect', await tool('Rectangle', [[0.55, 0.3], [0.65, 0.45]], 'shapes'));
log('triangle', await tool('Triangle', [[0.55, 0.6], [0.6, 0.5], [0.65, 0.65]], 'shapes'));
log('fib', await tool('Fib retracement', [[0.6, 0.7], [0.7, 0.3]], 'fib'));
log('fibext', await tool('Trend-based Fib extension', [[0.6, 0.7], [0.65, 0.3], [0.7, 0.5]], 'fib'));
log('ruler', await tool('Measure', [[0.3, 0.6], [0.4, 0.4]]));
log('ruler measure', await page.evaluate(async () => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; const m = await import('/src/x').catch(() => null); const d = e.drawings.at(-1); return { dp: d.anchors[1].price - d.anchors[0].price, bars: Math.round((d.anchors[1].time - d.anchors[0].time) / e.getStep()) }; }));
// brush drag
await tb.getByRole('button', { name: 'Brush', exact: true }).click();
await page.mouse.move(X(0.2), Y(0.2)); await page.mouse.down(); for (let i = 0; i < 20; i++) await page.mouse.move(X(0.2 + i * 0.005), Y(0.2 + Math.sin(i / 3) * 0.03)); await page.mouse.up();
s = await E(); log('brush', s.d.at(-1).t, s.d.at(-1).a.length);
// text
await tb.getByRole('button', { name: 'Text', exact: true }).click(); await page.mouse.click(X(0.75), Y(0.2));
await page.getByLabel('Annotation text').fill('Breakout zone'); await page.keyboard.press('Enter');
s = await E(); log('text', s.d.at(-1));
// emoji
await tb.locator('[data-grp="emoji"] button').first().click(); await page.getByRole('button', { name: '🎯' }).click(); await page.mouse.click(X(0.8), Y(0.3));
log('emoji', await page.evaluate(() => { const d = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.drawings.at(-1); return [d.type, d.style.emoji]; }));
// magnet strong: hline snaps to an OHLC
await tb.getByRole('button', { name: /Magnet/ }).click(); await tb.getByRole('button', { name: /Magnet/ }).click();
log('magnet hline', await tool('Horizontal line', [[0.5, 0.45]], 'lines'), await page.evaluate(() => { const e = document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine; const d = e.drawings.at(-1); const bars = e.getData(); return bars.some((b) => [b.open, b.high, b.low, b.close].includes(d.anchors[0].price)); }));
await tb.getByRole('button', { name: /Magnet/ }).click();
// lock all: moving does nothing; delete blocked
await tb.getByRole('button', { name: 'Lock all drawings' }).click();
const lk = await px(0); const before2 = JSON.stringify((await E()).d[0]);
const m2 = { x: (lk[0].x + lk[1].x) / 2 + box.x, y: (lk[0].y + lk[1].y) / 2 + box.y };
await page.mouse.move(m2.x, m2.y); await page.mouse.down(); await page.mouse.move(m2.x + 50, m2.y + 50, { steps: 4 }); await page.mouse.up();
await page.keyboard.press('Delete');
log('locked unchanged', before2 === JSON.stringify((await E()).d[0]), (await E()).n);
await tb.getByRole('button', { name: 'Unlock all drawings' }).click();
// hide/show
await tb.getByRole('button', { name: 'Hide all drawings' }).click(); log('hidden', await page.evaluate(() => document.querySelector('[aria-label="Chart drawing area"]').__drawingEngine.drawings.every((d) => !d.visible)));
await tb.getByRole('button', { name: 'Show all drawings' }).click();
// delete selected via click + Delete key
const n0 = (await E()).n; const d0 = await px(0);
await page.mouse.click((d0[0].x + d0[1].x) / 2 + box.x, (d0[0].y + d0[1].y) / 2 + box.y); await page.keyboard.press('Delete');
const n1 = (await E()).n; await page.keyboard.press('Control+z'); const n2 = (await E()).n; log('delete/undo', n0, n1, n2);
// persistence: wait for save, reload
await page.waitForTimeout(1500);
const saved = await page.evaluate(async () => (await fetch('/api/drawings?symbol=BTCUSDT&interval=1h&market=spot')).status);
await page.screenshot({ path: '/tmp/pw/drawings.png' });
await page.reload(); await page.waitForSelector('[aria-label="Chart drawing area"]'); await page.waitForTimeout(5000);
s = await E(); log('after reload count', s.n, 'types', s.d.map((x) => x.t).join(','));
// timeframe change → different set, back → restored
const ws = await page.evaluate(() => document.body.innerText.match(/Binance (Spot|Perp)( · WS)?/)?.[0]); log('badge', ws);
// clear all with confirm
page.once('dialog', (d) => d.accept()); await tb.getByRole('button', { name: 'Remove all drawings' }).click(); log('cleared', (await E()).n);
await page.keyboard.press('Control+z'); log('restored after clear undo', (await E()).n);
await browser.close();
