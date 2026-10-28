import ExcelJS from 'exceljs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { config } from '../config.js';
import { db, getSettings } from '../db.js';
import { DATASETS, allRows } from './datasets.js';

const GREEN = 'FF16A34A';
const RED = 'FFDC2626';
const HEADER_FILL = 'FF0F172A';

const NUM_FORMATS = {
  price: '#,##0.00####',
  qty: '#,##0.####',
  money: '#,##0.00',
  pnl: '+#,##0.00;-#,##0.00;0.00',
  pct: '+0.00"%";-0.00"%";0.00"%"',
  datetime: 'yyyy-mm-dd hh:mm:ss',
  int: '0',
};

const toCell = (type, v) => {
  if (v === null || v === undefined || v === '') return null;
  if (type === 'datetime') { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d; }
  if (type === 'bool') return v ? 'Yes' : 'No';
  if (type === 'status' || type === 'direction') return String(v);
  return v;
};

/** Adds a formatted worksheet: styled header, widths, filters, frozen header, number formats, conditional fonts. */
export function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14, style: NUM_FORMATS[c.type] ? { numFmt: NUM_FORMATS[c.type] } : {} }));
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF3B82F6' } } };
  });
  for (const r of rows) ws.addRow(columns.map((c) => toCell(c.type, r[c.key])));
  const last = Math.max(rows.length + 1, 2);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.alignment = { vertical: 'middle', horizontal: ['price', 'qty', 'money', 'pnl', 'pct', 'int'].includes(c.type) ? 'right' : 'left' };
    const letter = col.letter; const ref = `${letter}2:${letter}${last}`;
    const font = (argb) => ({ font: { color: { argb } , bold: true } });
    if (c.type === 'pnl' || c.type === 'pct') {
      ws.addConditionalFormatting({ ref, rules: [
        { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: font(GREEN), priority: 1 },
        { type: 'cellIs', operator: 'lessThan', formulae: [0], style: font(RED), priority: 2 },
      ] });
    } else if (c.type === 'direction') {
      ws.addConditionalFormatting({ ref, rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"BUY"'], style: font(GREEN), priority: 1 },
        { type: 'cellIs', operator: 'equal', formulae: ['"SELL"'], style: font(RED), priority: 2 },
      ] });
    } else if (c.type === 'status') {
      ws.addConditionalFormatting({ ref, rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"hit_tp1"'], style: font(GREEN), priority: 1 },
        { type: 'cellIs', operator: 'equal', formulae: ['"hit_tp2"'], style: font(GREEN), priority: 2 },
        { type: 'cellIs', operator: 'equal', formulae: ['"hit_sl"'], style: font(RED), priority: 3 },
        { type: 'cellIs', operator: 'equal', formulae: ['"disabled"'], style: font(RED), priority: 4 },
      ] });
    }
  });
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

function newWorkbook(title) {
  const wb = new ExcelJS.Workbook();
  wb.creator = getSettings().site_name || 'Meridian';
  wb.created = new Date();
  wb.title = title;
  return wb;
}

const colsFor = (type, admin) => DATASETS[type].columns.filter((c) => admin || !c.adminOnly);

/** Workbook for a single dataset (used by every "Download Excel" button). */
export async function datasetWorkbook(type, filters = {}, ctx = {}, admin = false) {
  const wb = newWorkbook(`${DATASETS[type].sheet} export`);
  addSheet(wb, DATASETS[type].sheet, colsFor(type, admin), allRows(type, filters, ctx));
  return wb;
}

/** A user's own workbook: their trades, orders, watchlist, logins and the signal archive. */
export async function userWorkbook(user) {
  const wb = newWorkbook(`${user.name} - personal records`);
  const ctx = { userId: user.id };
  addSheet(wb, 'My trades', colsFor('trades', false), allRows('trades', {}, ctx));
  addSheet(wb, 'My orders', colsFor('orders', false), allRows('orders', {}, ctx));
  addSheet(wb, 'Signals', colsFor('signals', false), allRows('signals', {}));
  addSheet(wb, 'My watchlist', colsFor('watchlists', false).filter((c) => c.key !== 'user_email'), allRows('watchlists', {}, ctx));
  addSheet(wb, 'My logins', colsFor('activity', false), allRows('activity', {}, ctx));
  return wb;
}

function masterWorkbook() {
  const wb = newWorkbook('Master records');
  addSheet(wb, 'Signals', colsFor('signals', true), allRows('signals'));
  addSheet(wb, 'Trades', colsFor('trades', true), allRows('trades'));
  addSheet(wb, 'Orders', colsFor('orders', true), allRows('orders'));
  addSheet(wb, 'Users', colsFor('users', true), allRows('users'));
  addSheet(wb, 'Watchlists', colsFor('watchlists', true), allRows('watchlists'));
  addSheet(wb, 'Activity', colsFor('activity', true), allRows('activity'));
  const info = wb.addWorksheet('Info');
  info.columns = [{ width: 28 }, { width: 50 }];
  const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  [['Master workbook', 'Auto-generated by the server; refreshed whenever data changes'],
    ['Generated (UTC)', new Date().toISOString()],
    ['Signals', count('signals')], ['Trades', count('trades')], ['Orders', count('orders')], ['Users', count('users')],
    ['Watchlist entries', count('watchlists')], ['Login events', count('login_activity')],
    ['Note', 'Password hashes are never exported. Paper-trading data is simulated.']].forEach((r) => info.addRow(r));
  info.getColumn(1).font = { bold: true };
  return wb;
}

// ---- master workbook: throttled, serialised, atomic (temp file + rename) ----
// Rebuilding the whole workbook is heavy for a 0.25 vCPU host, so changes are batched: a rebuild starts
// MASTER_REBUILD_DELAY_MS after a change, and never sooner than MASTER_REBUILD_MIN_MS after the previous one.
// Downloading the master file (flushMaster) always writes pending changes first, so a download is never stale.
let timer = null; let dirty = false; let current = null; let lastBuiltAt = null; let lastError = null; let lastRunAt = 0;

async function buildOnce() {
  dirty = false; lastRunAt = Date.now();
  const tmp = `${config.masterXlsx}.${process.pid}.tmp`;
  try {
    await masterWorkbook().xlsx.writeFile(tmp);
    await fsp.rename(tmp, config.masterXlsx);
    lastBuiltAt = new Date().toISOString(); lastError = null;
  } catch (e) {
    lastError = e.message; console.error('[excel] master rebuild failed:', e.message);
    fsp.rm(tmp, { force: true }).catch(() => {});
  }
}
function kick() {
  timer = null;
  if (current) return; // the running build re-schedules itself if more changes arrive
  current = buildOnce().finally(() => { current = null; if (dirty && !flushing) scheduleMasterRebuild(); });
}
let flushing = false;
export function scheduleMasterRebuild(delay = config.masterRebuildDelayMs) {
  dirty = true;
  if (timer || current) return; // a rebuild is already scheduled (or running) and will include this change
  const wait = Math.max(delay, lastRunAt + config.masterRebuildMinMs - Date.now(), 0);
  timer = setTimeout(kick, wait);
  timer.unref?.();
}
/** Writes every pending change to disk now (used before a download and on shutdown). */
export async function flushMaster() {
  flushing = true;
  try {
    if (timer) { clearTimeout(timer); timer = null; }
    while (current || dirty) {
      if (current) { await current; continue; }
      kick(); await current;
    }
  } finally { flushing = false; }
}
export function masterInfo() {
  let size = null; let modified = null;
  try { const st = fs.statSync(config.masterXlsx); size = st.size; modified = st.mtime.toISOString(); } catch { /* not built yet */ }
  return { exists: size !== null, size, modified, lastBuiltAt, lastError, pending: dirty || !!timer || !!current, minIntervalMs: config.masterRebuildMinMs };
}
export async function ensureMaster() {
  if (!fs.existsSync(config.masterXlsx)) { dirty = true; await flushMaster(); }
}
