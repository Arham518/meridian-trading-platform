import http from 'node:http';
import { config } from './config.js';
import './db.js';
import { createApp } from './app.js';
import { initRealtime, broadcastLive } from './realtime.js';
import { startMarket, onTick, stopMarket, marketStatus } from './services/market.js';
import { startEngine } from './services/trading.js';
import { ensureAdmin } from './bootstrap.js';
import { seedDemo } from './seed.js';
import { ensureMaster, scheduleMasterRebuild, flushMaster } from './services/excel.js';

export async function startServer({ port = config.port, quiet = false } = {}) {
  ensureAdmin();
  if (config.seedDemo && seedDemo() && !quiet) console.log('[seed] demo data created (all demo rows are flagged as demo).');
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  // push live quotes to every connected member (compact payload)
  onTick((quotes) => broadcastLive('ticks', quotes.map((q) => ({ s: q.symbol, p: q.price, c: q.changePct, h: q.high24, l: q.low24, src: q.source, t: q.ts })).concat([{ status: marketStatus() }])));
  startMarket();
  startEngine();
  await ensureMaster();
  scheduleMasterRebuild();

  await new Promise((resolve) => server.listen(port, resolve));
  const actual = server.address().port;
  if (!quiet) console.log(`[server] http://localhost:${actual}  (${config.env})`);
  return {
    server, port: actual,
    async close() { stopMarket(); await flushMaster(); await new Promise((r) => server.close(r)); },
  };
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
  const bye = async () => { await flushMaster().catch(() => {}); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
