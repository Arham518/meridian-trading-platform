// One-time site-name typo fix + throttled Excel master rebuild.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boot, ADMIN } from './helpers.js';

let t;
after(async () => { await t?.close(); });

test("startup migration fixes exactly 'Meditaian' -> 'Meridian' once", async () => {
  // prepare a database that has the typo, before the server opens it
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-mig-'));
  if (!process.env.TEST_DATABASE_URL) {
    const { DatabaseSync } = await import('node:sqlite');
    const pre = new DatabaseSync(path.join(dir, 'meridian.db'));
    pre.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO settings VALUES ('site_name', 'Meditaian');");
    pre.close();
  }
  t = await boot({ DATA_DIR: dir, MASTER_REBUILD_MIN_MS: '600000', MASTER_REBUILD_DELAY_MS: '600000' });
  const { db, getSettings, setSetting } = await import('../src/db.js');
  if (!process.env.TEST_DATABASE_URL) assert.equal(getSettings().site_name, 'Meridian');
  assert.ok(getSettings().migration_site_name_typo, 'migration recorded');
  // other names are never touched, and the fix does not run again
  setSetting('site_name', 'Meditaian');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get().value, 'Meditaian');
  setSetting('site_name', 'Meridian');
});

test('Excel master rebuild is throttled; download always includes pending changes', async () => {
  const tok = await t.login(ADMIN.email, ADMIN.password);
  const { masterInfo } = await import('../src/services/excel.js');
  const before = masterInfo().lastBuiltAt;
  const marker = `THROTTLE-${Date.now()}`;
  const r = await t.api('POST', '/api/signals', { token: tok, body: { pair: 'EURUSD', direction: 'BUY', entry: 1.1, stop_loss: 1.09, tp1: 1.12, timeframe: '1h', risk: 'low', notes: marker } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await new Promise((res) => setTimeout(res, 800));
  const info = masterInfo();
  assert.equal(info.pending, true, 'rebuild is waiting, not run 400 ms after the event');
  assert.equal(info.lastBuiltAt, before);
  const res = await t.api('GET', '/api/export/master', { token: tok, raw: true });
  assert.equal(res.status, 200);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  let found = false;
  wb.getWorksheet('Signals').eachRow((row) => { if (row.values.includes(marker)) found = true; });
  assert.ok(found, 'downloaded master file contains the new signal');
  assert.equal(masterInfo().pending, false);
});
