// Pure geometry helpers for hit testing (pixel space).
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function distToSeg(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y; const L = dx * dx + dy * dy;
  if (!L) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/** Extends a→b through b to the box edge (for rays). */
export function extendRay(a, b, w, h) {
  const dx = b.x - a.x; const dy = b.y - a.y; if (!dx && !dy) return b;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (w - a.x) / dx); else if (dx < 0) t = Math.min(t, -a.x / dx);
  if (dy > 0) t = Math.min(t, (h - a.y) / dy); else if (dy < 0) t = Math.min(t, -a.y / dy);
  if (!Number.isFinite(t) || t < 1) t = 1;
  return { x: a.x + dx * t, y: a.y + dy * t };
}
export function inPoly(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
  }
  return c;
}
export const inRect = (p, a, b, pad = 0) => p.x >= Math.min(a.x, b.x) - pad && p.x <= Math.max(a.x, b.x) + pad && p.y >= Math.min(a.y, b.y) - pad && p.y <= Math.max(a.y, b.y) + pad;
/** Ramer–Douglas–Peucker simplification for brush strokes (keeps saved payloads small). */
export function simplify(pts, eps = 1.5) {
  if (pts.length < 3) return pts;
  let idx = 0; let max = 0;
  for (let i = 1; i < pts.length - 1; i++) { const dd = distToSeg(pts[i], pts[0], pts[pts.length - 1]); if (dd > max) { max = dd; idx = i; } }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
