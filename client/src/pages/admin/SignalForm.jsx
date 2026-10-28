import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Trash2, Crosshair } from 'lucide-react';
import { Modal, Field, Spinner, Segmented } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useMarket } from '../../store/market.js';
import { pairLabel } from '../../lib/format.js';

const EMPTY = { pair: 'EURUSD', direction: 'BUY', timeframe: '1h', risk: 'medium', entry: '', stop_loss: '', tp1: '', tp2: '', notes: '', status: 'active', result_pct: '', result_pips: '' };

export default function SignalForm({ open, signal, onClose, onSaved }) {
  const edit = !!signal;
  const order = useMarket((s) => s.order); const quotes = useMarket((s) => s.quotes);
  const [f, setF] = useState(EMPTY); const [file, setFile] = useState(null); const [preview, setPreview] = useState(null); const [removeImg, setRemoveImg] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr(''); setFile(null); setRemoveImg(false);
    setF(signal ? { pair: signal.pair, direction: signal.direction, timeframe: signal.timeframe, risk: signal.risk, entry: signal.entry, stop_loss: signal.stopLoss, tp1: signal.tp1, tp2: signal.tp2 ?? '', notes: signal.notes, status: signal.status, result_pct: signal.resultPct ?? '', result_pips: signal.resultPips ?? '' } : EMPTY);
    setPreview(signal?.imageUrl || null);
  }, [open, signal]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const dec = quotes[f.pair]?.decimals ?? 5;
  const live = quotes[f.pair]?.price;
  const levelErr = useMemo(() => {
    const [e, sl, t1, t2] = [f.entry, f.stop_loss, f.tp1, f.tp2].map((v) => (v === '' ? null : Number(v)));
    if (e == null || sl == null || t1 == null) return '';
    if (f.direction === 'BUY') { if (sl >= e) return 'For a BUY, stop loss must be below entry.'; if (t1 <= e) return 'For a BUY, TP1 must be above entry.'; if (t2 != null && t2 <= t1) return 'TP2 must be above TP1.'; }
    else { if (sl <= e) return 'For a SELL, stop loss must be above entry.'; if (t1 >= e) return 'For a SELL, TP1 must be below entry.'; if (t2 != null && t2 >= t1) return 'TP2 must be below TP1.'; }
    return '';
  }, [f]);
  const onFile = (e) => { const x = e.target.files?.[0]; if (!x) return; if (x.size > 3 * 1024 * 1024) { setErr('Image must be 3 MB or smaller'); return; } setFile(x); setPreview(URL.createObjectURL(x)); setRemoveImg(false); };
  const useLive = () => { if (live) setF((p) => ({ ...p, entry: live })); };

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!f.pair.trim()) return setErr('Enter a pair or symbol.');
    if (f.entry === '' || f.stop_loss === '' || f.tp1 === '') return setErr('Entry, stop loss and TP1 are required.');
    if (levelErr) return setErr(levelErr);
    const fd = new FormData();
    Object.entries({ pair: f.pair, direction: f.direction, timeframe: f.timeframe, risk: f.risk, entry: f.entry, stop_loss: f.stop_loss, tp1: f.tp1, tp2: f.tp2, notes: f.notes }).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (edit) { fd.append('status', f.status); fd.append('result_pct', f.result_pct); fd.append('result_pips', f.result_pips); if (removeImg) fd.append('remove_image', 'true'); }
    if (file) fd.append('image', file);
    setBusy(true);
    try { const r = edit ? await api(`/signals/${signal.id}`, { method: 'PUT', form: fd }) : await api('/signals', { method: 'POST', form: fd }); onSaved(r.signal, edit); onClose(); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={edit ? `Edit signal #${signal?.id}` : 'Publish a new signal'} width="max-w-2xl"
      footer={<><button className="btn btn-ghost" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" form="signal-form" disabled={busy}>{busy ? <Spinner /> : edit ? 'Save changes' : 'Publish signal'}</button></>}>
      <form id="signal-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Pair / symbol"><input className="input" list="pairs" value={f.pair} onChange={(e) => setF((p) => ({ ...p, pair: e.target.value.toUpperCase() }))} placeholder="EURUSD" required /><datalist id="pairs">{order.map((s) => <option key={s} value={s}>{pairLabel(s)}</option>)}</datalist></Field>
          <Field label="Direction"><div><Segmented ariaLabel="Direction" value={f.direction} onChange={(v) => setF((p) => ({ ...p, direction: v }))} options={[{ value: 'BUY', label: 'BUY' }, { value: 'SELL', label: 'SELL' }]} /></div></Field>
          <Field label="Timeframe"><select className="input" value={f.timeframe} onChange={set('timeframe')}>{['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Entry price"><div className="relative"><input className="input num" type="number" step="any" min="0" value={f.entry} onChange={set('entry')} required />{live && <button type="button" onClick={useLive} className="absolute right-1.5 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-icon !size-7 !p-0" title={`Use live price (${live.toFixed(dec)})`} aria-label="Use live price"><Crosshair size={13} /></button>}</div></Field>
          <Field label="Stop loss"><input className="input num" type="number" step="any" min="0" value={f.stop_loss} onChange={set('stop_loss')} required /></Field>
          <Field label="Take profit 1"><input className="input num" type="number" step="any" min="0" value={f.tp1} onChange={set('tp1')} required /></Field>
          <Field label="Take profit 2"><input className="input num" type="number" step="any" min="0" value={f.tp2} onChange={set('tp2')} placeholder="Optional" /></Field>
        </div>
        {levelErr && <p className="text-xs text-warn">{levelErr}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Risk level"><select className="input" value={f.risk} onChange={set('risk')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          {edit && <Field label="Status"><select className="input" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="hit_tp1">TP1 hit</option><option value="hit_tp2">TP2 hit</option><option value="hit_sl">Stopped out (SL)</option><option value="cancelled">Cancelled</option></select></Field>}
        </div>
        {edit && f.status !== 'active' && f.status !== 'cancelled' && (
          <div className="grid grid-cols-2 gap-3"><Field label="Result %" hint="Leave empty to auto-calculate"><input className="input num" type="number" step="any" value={f.result_pct} onChange={set('result_pct')} /></Field><Field label="Result pips"><input className="input num" type="number" step="any" value={f.result_pips} onChange={set('result_pips')} /></Field></div>
        )}
        <Field label="Analysis / notes"><textarea className="input" rows={4} maxLength={2000} value={f.notes} onChange={set('notes')} placeholder="Why this trade? Key levels, confirmation, invalidation…" /></Field>
        <Field label="Chart image (optional)" hint="PNG, JPEG or WebP, up to 3 MB">
          <div className="flex items-center gap-3">
            <label className="btn btn-ghost cursor-pointer"><ImagePlus size={15} />{preview && !removeImg ? 'Replace image' : 'Upload image'}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={onFile} /></label>
            {preview && !removeImg && <><img src={preview} alt="Chart preview" className="h-12 w-20 object-cover rounded-lg border border-line" /><button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => { setRemoveImg(true); setFile(null); setPreview(null); }} aria-label="Remove image"><Trash2 size={14} /></button></>}
          </div>
        </Field>
        {err && <p role="alert" className="text-sm text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">{err}</p>}
      </form>
    </Modal>
  );
}
