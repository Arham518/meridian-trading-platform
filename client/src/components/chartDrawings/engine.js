// DrawingEngine: one shared interaction system for every tool (pointer + touch, hit testing, selection, move /
// resize, keyboard, undo/redo, rendering). Plain JS (no React) so mouse moves never re-render the React tree:
// React only hears about discrete changes through onChange().
import { makeCoords } from './coords.js';
import { History } from './history.js';
import { TOOLS, render, hitBody, resizable } from './tools.js';
import { dist, simplify } from './geometry.js';

export const DEFAULT_STYLE = { color: '#2962ff', width: 2, dash: 'solid' };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = (x) => JSON.parse(JSON.stringify(x));

export class DrawingEngine {
  /**
   * @param {object} o
   * @param {HTMLElement} o.wrapper element receiving pointer events (contains the chart + overlay canvas)
   * @param {HTMLCanvasElement} o.canvas overlay canvas (pointer-events: none)
   */
  constructor(o) {
    Object.assign(this, { wrapper: o.wrapper, keyTarget: o.keyTarget, canvas: o.canvas, getChart: o.getChart, onChange: o.onChange || (() => {}), onRequestText: o.onRequestText || (() => {}), fmt: o.fmt || ((v) => String(v)) });
    this.coords = makeCoords(o);
    this.getStep = o.getStep; this.getData = o.getData; this.getSeries = o.getSeries;
    this.drawings = []; this.selectedId = null; this.tool = 'cursor'; this.magnet = 'off'; this.keep = false;
    this.locked = false; this.hidden = false; this.emoji = '🚀'; this.toolStyle = { ...DEFAULT_STYLE };
    this.draft = null; this.drag = null; this.zoomBox = null; this.hover = null; this.history = new History();
    this.sig = ''; this.dirty = true; this.raf = 0; this.touch = false;
    this.bind();
    const loop = () => { this.tick(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- public API ----------
  setTool(t) {
    this.cancelDraft(); this.tool = t; if (t !== 'cursor') this.select(null, false);
    this.chartInteract(t === 'cursor'); this.wrapper.style.touchAction = t === 'cursor' ? '' : 'none';
    this.wrapper.style.cursor = t === 'cursor' ? '' : 'crosshair'; this.emit();
  }
  setMagnet(m) { this.magnet = m; this.emit(); }
  setKeep(v) { this.keep = !!v; this.emit(); }
  setEmoji(e) { this.emoji = e; this.emit(); }
  setToolStyle(p) { this.toolStyle = { ...this.toolStyle, ...p }; this.emit(); }
  /** Replaces all drawings (load for a new symbol / timeframe). Resets history. */
  load(list) {
    this.cancelDraft(); this.drag = null;
    this.drawings = (list || []).filter((d) => TOOLS[d.type] && d.anchors?.length).map((d) => ({ ...d, style: { ...DEFAULT_STYLE, ...d.style }, locked: !!d.locked, visible: d.visible !== false }));
    this.locked = this.drawings.length > 0 && this.drawings.every((d) => d.locked);
    this.hidden = this.drawings.length > 0 && this.drawings.every((d) => !d.visible);
    this.selectedId = null; this.history.reset(this.snap()); this.dirty = true; this.emit(false);
  }
  get selected() { return this.drawings.find((d) => d.id === this.selectedId) || null; }
  select(id, emit = true) { this.selectedId = id; this.dirty = true; if (emit) this.emit(false); }
  updateSelected(patch) {
    const d = this.selected; if (!d) return;
    if (patch.style) d.style = { ...d.style, ...patch.style };
    if ('locked' in patch) d.locked = patch.locked;
    if ('visible' in patch) d.visible = patch.visible;
    this.commit();
  }
  deleteSelected() { const d = this.selected; if (!d || d.locked) return false; this.drawings = this.drawings.filter((x) => x !== d); this.selectedId = null; this.commit(); return true; }
  clearAll() { if (!this.drawings.length) return; this.drawings = []; this.selectedId = null; this.commit(); }
  toggleLock() { this.locked = !this.locked; this.drawings.forEach((d) => { d.locked = this.locked; }); this.commit(); }
  toggleHide() { this.hidden = !this.hidden; this.drawings.forEach((d) => { d.visible = !this.hidden; }); if (this.hidden) this.selectedId = null; this.commit(); }
  undo() { this.cancelDraft(); const s = this.history.undo(); if (s != null) this.restore(s); }
  redo() { this.cancelDraft(); const s = this.history.redo(); if (s != null) this.restore(s); }
  /** Adds a drawing from code (tests / text tool). */
  add(type, anchors, style = {}) {
    const d = { id: uid(), type, anchors: anchors.map((a) => ({ time: a.time, price: a.price })), style: { ...this.toolStyle, ...style }, locked: false, visible: true };
    this.drawings.push(d); this.selectedId = d.id; this.commit(); return d;
  }
  setText(id, text) { const d = this.drawings.find((x) => x.id === id); if (!d) return; if (!text.trim()) { this.drawings = this.drawings.filter((x) => x !== d); if (this.selectedId === id) this.selectedId = null; } else d.style = { ...d.style, text }; this.commit(); }
  invalidate() { this.dirty = true; }
  destroy() { cancelAnimationFrame(this.raf); this.unbind(); this.chartInteract(true); }
  state() {
    return { tool: this.tool, magnet: this.magnet, keep: this.keep, locked: this.locked, hidden: this.hidden, emoji: this.emoji, toolStyle: this.toolStyle,
      count: this.drawings.length, selected: this.selected && clone(this.selected), canUndo: this.history.canUndo, canRedo: this.history.canRedo, drafting: !!this.draft };
  }

  // ---------- internals ----------
  snap() { return JSON.stringify(this.drawings); }
  restore(s) { this.drawings = JSON.parse(s); if (!this.selected) this.selectedId = null; this.locked = this.drawings.length > 0 && this.drawings.every((d) => d.locked); this.hidden = this.drawings.length > 0 && this.drawings.every((d) => !d.visible); this.dirty = true; this.emit(true); }
  commit() { const changed = this.history.push(this.snap()); this.dirty = true; this.emit(changed); }
  emit(changed = false) { this.onChange(this.state(), changed ? this.drawings : null); }
  chartInteract(on) { this.getChart()?.applyOptions({ handleScroll: on, handleScale: on }); }
  cancelDraft() { if (this.draft) { this.draft = null; this.dirty = true; } this.zoomBox = null; }
  envFor(w, h) { return { w, h, fmt: this.fmt, step: this.getStep(), priceToY: (p) => this.getSeries()?.priceToCoordinate(p) ?? null }; }
  px(d) { return d.anchors.map((a) => this.coords.toPx(a)); }
  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  point(p, snap = true) { const raw = this.coords.fromPx(p.x, p.y); return snap ? this.coords.snap(raw, p.y, this.magnet) : raw; }

  /** Hit test topmost first: anchors of the selected drawing, then bodies. */
  hitTest(p) {
    if (this.hidden) return null;
    const tol = this.touch ? 12 : 6; const ctx = this.canvas.getContext('2d'); const { width: w, height: h } = this.coords.paneSize(); const env = this.envFor(w, h);
    const sel = this.selected;
    if (sel && sel.visible && resizable(sel)) {
      const P = this.px(sel); const i = P.findIndex((q) => q && dist(q, p) <= tol + 3); if (i >= 0) return { d: sel, handle: i };
    }
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]; if (!d.visible) continue; const P = this.px(d); if (P.some((q) => !q)) continue;
      if (hitBody(ctx, d, P, p, env, tol)) return { d, handle: -1 };
    }
    return null;
  }

  bind() {
    const W = this.wrapper; const opt = { capture: true };
    this.h = {
      down: (e) => this.onDown(e), move: (e) => this.onMove(e), up: (e) => this.onUp(e),
      stop: (e) => { if (this.owning) { e.stopPropagation(); if (e.cancelable && e.type !== 'wheel') e.preventDefault(); } },
      dbl: (e) => this.onDbl(e), key: (e) => this.onKey(e), leave: () => { if (!this.drag && !this.draft) { this.hover = null; this.dirty = true; } },
    };
    W.addEventListener('pointerdown', this.h.down, opt); W.addEventListener('pointermove', this.h.move, opt);
    W.addEventListener('pointerup', this.h.up, opt); W.addEventListener('pointercancel', this.h.up, opt);
    ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'].forEach((t) => W.addEventListener(t, this.h.stop, { capture: true, passive: false }));
    W.addEventListener('dblclick', this.h.dbl, opt); (this.keyTarget || W).addEventListener('keydown', this.h.key); W.addEventListener('pointerleave', this.h.leave);
  }
  unbind() {
    const W = this.wrapper; const opt = { capture: true };
    W.removeEventListener('pointerdown', this.h.down, opt); W.removeEventListener('pointermove', this.h.move, opt);
    W.removeEventListener('pointerup', this.h.up, opt); W.removeEventListener('pointercancel', this.h.up, opt);
    ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend'].forEach((t) => W.removeEventListener(t, this.h.stop, { capture: true }));
    W.removeEventListener('dblclick', this.h.dbl, opt); (this.keyTarget || W).removeEventListener('keydown', this.h.key); W.removeEventListener('pointerleave', this.h.leave);
  }
  own(e) {
    this.owning = true; e.stopPropagation(); if (e.cancelable) e.preventDefault();
    this.chartInteract(false);
    try { this.wrapper.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    this.wrapper.focus?.({ preventScroll: true });
  }
  release() { this.owning = false; if (this.tool === 'cursor') this.chartInteract(true); }
  inPane(p) { const { width, height } = this.coords.paneSize(); return p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height; }

  onDown(e) {
    if (e.button != null && e.button > 0) return;
    if (e.target?.closest?.('[data-draw-ui]')) return; // properties bar / text editor live inside the wrapper
    this.touch = e.pointerType === 'touch'; const p = this.local(e);
    if (!this.inPane(p)) return;
    if (this.tool === 'cursor') {
      const hit = this.hitTest(p);
      if (!hit) { if (this.selectedId) this.select(null); return; }
      this.own(e); this.select(hit.d.id);
      if (!hit.d.locked) this.drag = { id: hit.d.id, handle: hit.handle, start: p, orig: clone(hit.d.anchors), origPx: this.px(hit.d), moved: false };
      return;
    }
    this.own(e);
    if (this.tool === 'zoom') { this.zoomBox = { a: p, b: p }; return; }
    const pt = this.point(p); if (!pt) return;
    const def = TOOLS[this.tool]; if (!def) return;
    if (def.mode === 'drag') { this.draft = { type: this.tool, anchors: [pt], px: [p], down: p }; return; }
    if (def.points === 1) {
      if (this.tool === 'text') {
        const d = { id: uid(), type: 'text', anchors: [{ time: pt.time, price: pt.price }], style: { ...this.toolStyle, text: '', fontSize: 16 }, locked: false, visible: true };
        this.onRequestText({ x: p.x, y: p.y, initial: '', done: (txt) => { if (txt.trim()) { d.style.text = txt; this.drawings.push(d); this.selectedId = d.id; this.commit(); } } });
      } else this.add(this.tool, [pt], this.tool === 'emoji' ? { emoji: this.emoji, fontSize: 28 } : {});
      this.finishTool(); return;
    }
    if (!this.draft) { this.draft = { type: this.tool, anchors: [pt, pt], down: p }; this.dirty = true; return; }
    // click-click: fix the moving anchor, then add the next one or finish
    this.draft.anchors[this.draft.anchors.length - 1] = pt; this.draft.down = p;
    if (this.draft.anchors.length >= def.points) this.completeDraft(); else this.draft.anchors.push(pt);
  }

  onMove(e) {
    if (!this.drag && !this.draft && !this.zoomBox && e.target?.closest?.('[data-draw-ui]')) return;
    const p = this.local(e);
    if (this.zoomBox) { this.zoomBox.b = p; this.dirty = true; return; }
    if (this.drag) { this.doDrag(p); return; }
    if (this.draft) {
      const pt = this.point(p); if (!pt) return;
      if (this.draft.type === 'brush') { if (dist(this.draft.px[this.draft.px.length - 1], p) >= 2) { this.draft.anchors.push(pt); this.draft.px.push(p); } }
      else this.draft.anchors[this.draft.anchors.length - 1] = pt;
      this.dirty = true; return;
    }
    if (this.tool === 'cursor' && e.pointerType !== 'touch') {
      const hit = this.inPane(p) ? this.hitTest(p) : null; const id = hit ? `${hit.d.id}:${hit.handle}` : null;
      if (id !== this.hover) { this.hover = id; this.wrapper.style.cursor = hit ? (hit.handle >= 0 ? 'grab' : hit.d.locked ? 'default' : 'move') : ''; this.dirty = true; }
    }
  }

  onUp(e) {
    const p = this.local(e);
    if (this.zoomBox) {
      const { a, b } = this.zoomBox; this.zoomBox = null; this.dirty = true;
      if (Math.abs(b.x - a.x) > 8) { const ts = this.getChart().timeScale(); const l1 = ts.coordinateToLogical(Math.min(a.x, b.x)); const l2 = ts.coordinateToLogical(Math.max(a.x, b.x)); if (l1 != null && l2 != null) ts.setVisibleLogicalRange({ from: l1, to: l2 }); }
      this.finishTool(); this.release(); return;
    }
    if (this.drag) { const moved = this.drag.moved; this.drag = null; if (moved) this.commit(); this.release(); return; }
    if (this.draft) {
      if (this.draft.type === 'brush') { this.completeDraft(); this.release(); return; }
      // press-drag-release also draws 2-point tools (natural on touch)
      if (this.draft.anchors.length === 2 && TOOLS[this.draft.type].points === 2 && dist(this.draft.down, p) > 6) { const pt = this.point(p); if (pt) this.draft.anchors[1] = pt; this.completeDraft(); }
    }
    this.release();
  }

  onDbl(e) {
    if (this.tool !== 'cursor' || e.target?.closest?.('[data-draw-ui]')) return; const hit = this.hitTest(this.local(e)); if (!hit || hit.d.type !== 'text' || hit.d.locked) return;
    e.stopPropagation(); const P = this.coords.toPx(hit.d.anchors[0]);
    this.onRequestText({ x: P.x, y: P.y, initial: hit.d.style.text || '', done: (t) => this.setText(hit.d.id, t) });
  }

  onKey(e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (this.deleteSelected()) e.preventDefault(); }
    else if (e.key === 'Escape') { if (this.draft) this.cancelDraft(); else if (this.tool !== 'cursor') this.setTool('cursor'); else this.select(null); this.dirty = true; }
  }

  doDrag(p) {
    const g = this.drag; const d = this.drawings.find((x) => x.id === g.id); if (!d) { this.drag = null; return; }
    const dx = p.x - g.start.x; const dy = p.y - g.start.y; if (!g.moved && Math.hypot(dx, dy) < 2) return;
    g.moved = true;
    if (g.handle >= 0) { const pt = this.point(p); if (pt) d.anchors[g.handle] = { time: pt.time, price: pt.price }; }
    else {
      d.anchors = g.origPx.map((q, i) => {
        if (!q) return g.orig[i];
        const pt = this.coords.fromPx(q.x + dx, q.y + dy); if (!pt) return g.orig[i];
        if (d.type === 'hline') return { time: g.orig[i].time, price: pt.price };
        if (d.type === 'vline') return { time: pt.time, price: g.orig[i].price };
        return { time: pt.time, price: pt.price };
      });
    }
    this.dirty = true;
  }

  completeDraft() {
    const dr = this.draft; this.draft = null; if (!dr) return;
    let anchors = dr.anchors;
    if (dr.type === 'brush') {
      if (anchors.length < 2) { this.dirty = true; return; }
      const keep = new Set(simplify(dr.px.map((q, i) => ({ ...q, i })), 1.2).map((q) => q.i)); anchors = anchors.filter((_, i) => keep.has(i)).slice(0, 2000);
    }
    this.add(dr.type, anchors); this.finishTool();
  }
  finishTool() { if (!this.keep && this.tool !== 'cursor') this.setTool('cursor'); else this.emit(); }

  // ---------- rendering: redraw only when the view or the drawings changed ----------
  tick() {
    const chart = this.getChart(); const s = this.getSeries(); if (!chart || !s) return;
    const { width: w, height: h } = this.coords.paneSize(); const r = chart.timeScale().getVisibleLogicalRange();
    const d = this.getData(); const ref = d.length ? d[d.length - 1].close : 0;
    const sig = `${w}x${h}|${r?.from?.toFixed(3)}:${r?.to?.toFixed(3)}|${s.priceToCoordinate(ref)?.toFixed(2)}|${s.priceToCoordinate(ref * 1.01 || 1)?.toFixed(2)}|${d.length}`;
    if (sig === this.sig && !this.dirty) return;
    this.sig = sig; this.dirty = false; this.draw(w, h);
  }
  draw(w, h) {
    const c = this.canvas; const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px`; }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const env = this.envFor(w, h);
    const list = this.draft ? [...this.drawings, { id: '_draft', ...this.draft, style: { ...this.toolStyle } }] : this.drawings;
    for (const d of list) {
      if (!d.visible && d.id !== '_draft') continue;
      const P = d.anchors.map((a) => this.coords.toPx(a)); if (P.some((q) => !q)) continue;
      ctx.save(); render(ctx, d, P, env); ctx.restore();
      const hovered = this.hover?.startsWith(`${d.id}:`);
      if (d.id === this.selectedId || d.id === '_draft' || hovered) this.drawHandles(ctx, d, P, d.id === this.selectedId || d.id === '_draft');
    }
    if (this.zoomBox) { const { a, b } = this.zoomBox; ctx.fillStyle = 'rgba(41,98,255,0.12)'; ctx.strokeStyle = 'rgba(41,98,255,0.7)'; ctx.lineWidth = 1; ctx.fillRect(Math.min(a.x, b.x), 0, Math.abs(b.x - a.x), h); ctx.strokeRect(Math.min(a.x, b.x), 0, Math.abs(b.x - a.x), h); }
    ctx.restore();
  }
  drawHandles(ctx, d, P, strong) {
    if (d.type === 'brush' || d.type === 'text' || d.type === 'emoji') {
      if (!strong) return; const xs = P.map((p) => p.x); const ys = P.map((p) => p.y);
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#2962ff'; ctx.lineWidth = 1; ctx.strokeRect(Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) - Math.min(...xs) + 12 + (d.type === 'text' ? 40 : 0), Math.max(...ys) - Math.min(...ys) + 12); ctx.restore(); return;
    }
    const r = this.touch ? 6 : 4.5;
    for (const p of P) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = d.locked ? '#787b86' : '#2962ff'; ctx.stroke(); }
  }
}
