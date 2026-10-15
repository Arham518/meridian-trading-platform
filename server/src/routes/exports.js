import { Router } from 'express';
import fs from 'node:fs';
import { requireAuth, requireAdmin, wrap } from '../auth.js';
import { DATASETS } from '../services/datasets.js';
import { datasetWorkbook, userWorkbook, ensureMaster, masterInfo, flushMaster } from '../services/excel.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const stamp = () => new Date().toISOString().slice(0, 10);

async function send(res, wb, name) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// Personal workbook (own trades, orders, watchlist, logins + signal archive)
router.get('/my', wrap(async (req, res) => send(res, await userWorkbook(req.user), 'my-records')));

// Master workbook - the always-up-to-date file kept on disk by the server
router.get('/master', requireAdmin, wrap(async (req, res) => {
  await flushMaster(); await ensureMaster();
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="records-master-${stamp()}.xlsx"`);
  fs.createReadStream(config.masterXlsx).pipe(res);
}));
router.get('/master/info', requireAdmin, (req, res) => res.json(masterInfo()));

// Per-list exports. Users get signals + their own trades/orders/watchlist/activity; admins can export everything.
router.get('/:type', wrap(async (req, res) => {
  const type = req.params.type;
  if (!DATASETS[type]) return res.status(404).json({ error: 'Unknown export' });
  const admin = req.user.role === 'admin';
  const own = ['trades', 'orders', 'watchlists', 'activity'].includes(type);
  if (!admin && !own && type !== 'signals') return res.status(403).json({ error: 'Admin access required' });
  const scopeAll = admin && req.query.scope === 'all';
  const ctx = own && !scopeAll ? { userId: req.user.id } : {};
  await send(res, await datasetWorkbook(type, req.query, ctx, admin && scopeAll), type);
}));

export default router;
