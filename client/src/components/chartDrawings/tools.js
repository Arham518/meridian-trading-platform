// Tool registry: how many anchors each drawing needs, how it renders and how it is hit-tested.
// Every function works on pixel points P (already converted from {time, price} anchors).
import { distToSeg, extendRay, inPoly, inRect, dist } from './geometry.js';

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2.618];
const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86'];

/** points: anchors to create; mode 'click' = click per anchor (drag also works for 2-point), 'drag' = freehand. */
export const TOOLS = {
  trend: { label: 'Trend line', points: 2 },
  ray: { label: 'Ray', points: 2 },
  hline: { label: 'Horizontal line', points: 1 },
  vline: { label: 'Vertical line', points: 1 },
  rect: { label: 'Rectangle', points: 2 },
  fib: { label: 'Fib retracement', points: 2 },
  fibext: { label: 'Trend-based Fib extension', points: 3 },
  channel: { label: 'Parallel channel', points: 3 },
  triangle: { label: 'Triangle', points: 3 },
  brush: { label: 'Brush', points: 0, mode: 'drag' },
  text: { label: 'Text', points: 1 },
  emoji: { label: 'Emoji', points: 1 },
  ruler: { label: 'Measure', points: 2 },
};

export const DASH = { solid: [], dashed: [6, 4], dotted: [1.5, 3] };
const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

/** Channel: third anchor sets the parallel offset (in px along y at its x). */
function channelLines(P) {
  const [a, b, c] = P; if (!c) return { base: [a, b] };
  const yOnLine = b.x === a.x ? a.y : a.y + ((c.x - a.x) * (b.y - a.y)) / (b.x - a.x);
  const off = c.y - yOnLine;
  return { base: [a, b], par: [{ x: a.x, y: a.y + off }, { x: b.x, y: b.y + off }], mid: [{ x: a.x, y: a.y + off / 2 }, { x: b.x, y: b.y + off / 2 }] };
}
const fibPrices = (d) => {
  const [a, b, c] = d.anchors;
  if (d.type === 'fib') return FIB_LEVELS.map((k) => ({ k, price: b.price + (a.price - b.price) * k }));
  if (!c) return [];
  return FIB_EXT_LEVELS.map((k) => ({ k, price: c.price + (b.price - a.price) * k }));
};

export function fmtDuration(sec) {
  const s = Math.abs(sec); const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.round((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(' ');
}
/** Ruler numbers: Δprice, %, bars, duration. */
export function measure(a, b, step) {
  const diff = b.price - a.price; const pct = a.price ? (diff / a.price) * 100 : 0;
  const bars = Math.round((b.time - a.time) / step);
  return { diff, pct, bars, seconds: b.time - a.time, duration: fmtDuration(b.time - a.time) };
}

function label(ctx, text, x, y, bg, fg = '#fff', align = 'left') {
  ctx.font = '11px "Geist Mono Variable", ui-monospace, monospace';
  const w = ctx.measureText(text).width + 8; const lx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg; ctx.fillRect(lx, y - 9, w, 17); ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, lx + 4, y);
}

export function render(ctx, d, P, env) {
  const { w, h, fmt, step } = env; const st = d.style; const col = st.color;
  ctx.strokeStyle = col; ctx.lineWidth = st.width; ctx.setLineDash(DASH[st.dash] || []); ctx.fillStyle = col;
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  switch (d.type) {
    case 'trend': if (P[1]) seg(P[0], P[1]); break;
    case 'ray': if (P[1]) seg(P[0], extendRay(P[0], P[1], w, h)); break;
    case 'hline': seg({ x: 0, y: P[0].y }, { x: w, y: P[0].y }); ctx.setLineDash([]); label(ctx, fmt(d.anchors[0].price), w - 2, P[0].y, col, '#fff', 'right'); break;
    case 'vline': seg({ x: P[0].x, y: 0 }, { x: P[0].x, y: h }); break;
    case 'rect': if (P[1]) { ctx.fillStyle = alpha(col, 0.12); ctx.fillRect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y)); ctx.strokeRect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y)); } break;
    case 'triangle': {
      ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (P.length === 3) ctx.closePath();
      if (P.length === 3) { ctx.fillStyle = alpha(col, 0.12); ctx.fill(); }
      ctx.stroke(); break;
    }
    case 'channel': {
      if (!P[1]) break; const L = channelLines(P); seg(...L.base);
      if (L.par) { seg(...L.par); ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1; seg(...L.mid); ctx.restore();
        ctx.beginPath(); ctx.moveTo(L.base[0].x, L.base[0].y); ctx.lineTo(L.base[1].x, L.base[1].y); ctx.lineTo(L.par[1].x, L.par[1].y); ctx.lineTo(L.par[0].x, L.par[0].y); ctx.closePath(); ctx.fillStyle = alpha(col, 0.08); ctx.fill(); }
      break;
    }
    case 'fib': case 'fibext': {
      if (!P[1]) break;
      ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1; seg(P[0], P[1]); if (P[2]) seg(P[1], P[2]); ctx.restore();
      const levels = fibPrices(d); if (!levels.length) break;
      const xs = P.map((p) => p.x); const x0 = d.type === 'fib' ? Math.min(...xs) : (P[2]?.x ?? Math.min(...xs)); const x1 = Math.max(...xs) + (d.type === 'fibext' ? 60 : 0);
      levels.forEach(({ k, price }, i) => {
        const y = env.priceToY(price); if (y == null) return;
        ctx.strokeStyle = FIB_COLORS[i % FIB_COLORS.length]; ctx.lineWidth = st.width; seg({ x: x0, y }, { x: x1, y });
        ctx.font = '11px "Geist Mono Variable", ui-monospace, monospace'; ctx.fillStyle = FIB_COLORS[i % FIB_COLORS.length]; ctx.textBaseline = 'bottom';
        ctx.fillText(`${k} (${fmt(price)})`, x0 + 2, y - 2);
      });
      break;
    }
    case 'brush': {
      if (!P.length) break; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); break;
    }
    case 'text': {
      ctx.font = `${st.fontSize || 14}px Geist Variable, ui-sans-serif, system-ui, sans-serif`; ctx.textBaseline = 'top'; ctx.fillStyle = col;
      (st.text || 'Text').split('\n').forEach((ln, i) => ctx.fillText(ln, P[0].x, P[0].y + i * (st.fontSize || 14) * 1.25)); break;
    }
    case 'emoji': { const fs = st.fontSize || 28; ctx.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(st.emoji || '🚀', P[0].x, P[0].y); ctx.textAlign = 'left'; break; }
    case 'ruler': {
      if (!P[1]) break; const m = measure(d.anchors[0], d.anchors[1], step); const up = m.diff >= 0; const c = up ? '#089981' : '#f23645';
      ctx.fillStyle = alpha(c, 0.15); ctx.fillRect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y));
      ctx.strokeStyle = c; ctx.setLineDash([]); ctx.lineWidth = 1; seg(P[0], P[1]);
      const sign = up ? '+' : '';
      label(ctx, `${sign}${fmt(m.diff)} (${sign}${m.pct.toFixed(2)}%)  ${m.bars} bars, ${m.duration}`, (P[0].x + P[1].x) / 2, (up ? Math.min(P[0].y, P[1].y) - 14 : Math.max(P[0].y, P[1].y) + 14), c, '#fff', 'center');
      break;
    }
    default: break;
  }
  ctx.setLineDash([]);
}

/** Pixel bbox for text/emoji (for hit testing). */
function textBox(ctx, d, p) {
  if (d.type === 'emoji') { const fs = d.style.fontSize || 28; return [{ x: p.x - fs / 2, y: p.y - fs / 2 }, { x: p.x + fs / 2, y: p.y + fs / 2 }]; }
  const fs = d.style.fontSize || 14; const lines = (d.style.text || 'Text').split('\n');
  ctx.font = `${fs}px Geist Variable, ui-sans-serif, system-ui, sans-serif`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return [p, { x: p.x + w, y: p.y + lines.length * fs * 1.25 }];
}

/** Distance-based hit test of the body. Returns true if pointer p is on the drawing. */
export function hitBody(ctx, d, P, p, env, tol) {
  const { w, h } = env;
  switch (d.type) {
    case 'trend': case 'ruler': return P[1] && (distToSeg(p, P[0], P[1]) <= tol || (d.type === 'ruler' && inRect(p, P[0], P[1])));
    case 'ray': return P[1] && distToSeg(p, P[0], extendRay(P[0], P[1], w, h)) <= tol;
    case 'hline': return Math.abs(p.y - P[0].y) <= tol;
    case 'vline': return Math.abs(p.x - P[0].x) <= tol;
    case 'rect': return P[1] && inRect(p, P[0], P[1], tol);
    case 'triangle': return P.length === 3 && (inPoly(p, P) || [0, 1, 2].some((i) => distToSeg(p, P[i], P[(i + 1) % 3]) <= tol));
    case 'channel': {
      const L = channelLines(P); if (!L.par) return distToSeg(p, ...L.base) <= tol;
      return inPoly(p, [L.base[0], L.base[1], L.par[1], L.par[0]]) || distToSeg(p, ...L.base) <= tol || distToSeg(p, ...L.par) <= tol;
    }
    case 'fib': case 'fibext': {
      if (P.some((q, i) => i && distToSeg(p, P[i - 1], q) <= tol)) return true;
      const xs = P.map((q) => q.x); const x0 = Math.min(...xs) - tol; const x1 = Math.max(...xs) + (d.type === 'fibext' ? 60 : 0) + tol;
      return p.x >= x0 && p.x <= x1 && fibPrices(d).some(({ price }) => { const y = env.priceToY(price); return y != null && Math.abs(y - p.y) <= tol; });
    }
    case 'brush': return P.some((q, i) => (i ? distToSeg(p, P[i - 1], q) : dist(p, q)) <= tol + d.style.width / 2);
    case 'text': case 'emoji': { const [a, b] = textBox(ctx, d, P[0]); return inRect(p, a, b, 4); }
    default: return false;
  }
}
/** Anchors that can be dragged to resize (brush: none, it moves as a whole). */
export const resizable = (d) => d.type !== 'brush' && d.type !== 'text' && d.type !== 'emoji';
