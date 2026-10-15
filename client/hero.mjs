import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
p.on('console', (m) => m.type() !== 'log' && console.log(m.text().slice(0, 200)));
await p.goto('http://localhost:4000'); await p.waitForTimeout(4000); await p.screenshot({ path: '/tmp/hero.png', clip: { x: 900, y: 80, width: 1020, height: 700 } }); await b.close();
