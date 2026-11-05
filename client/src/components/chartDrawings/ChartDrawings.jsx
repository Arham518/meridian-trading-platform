// Left drawing toolbar + overlay canvas + properties bar for the price chart (TradingView-style).
// All drawing logic lives in DrawingEngine; this component only wires UI, persistence and the text editor.
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Crosshair, Brush, Type, Smile, Ruler, ZoomIn, Magnet, Lock, LockOpen, Eye, EyeOff, Trash2, Undo2, Redo2, ChevronRight, X, RotateCcw } from 'lucide-react';
import { DrawingEngine } from './engine.js';
import { TOOLS } from './tools.js';
import { loadDrawings, saveDrawings, keyOf } from './persistence.js';
import ToolIcon from './icons.jsx';

const GROUPS = [
  { id: 'lines', tools: ['trend', 'ray', 'hline', 'vline', 'channel'] },
  { id: 'fib', tools: ['fib', 'fibext'] },
  { id: 'shapes', tools: ['rect', 'triangle'] },
  { id: 'brush', tools: ['brush'] },
  { id: 'text', tools: ['text'] },
  { id: 'emoji', tools: ['emoji'] },
  { id: 'ruler', tools: ['ruler'] },
  { id: 'zoom', tools: ['zoom'] },
];
const LUCIDE = { brush: Brush, text: Type, emoji: Smile, ruler: Ruler, zoom: ZoomIn };
const LABEL = { ...Object.fromEntries(Object.entries(TOOLS).map(([k, v]) => [k, v.label])), zoom: 'Zoom in (drag a range)', cursor: 'Cross' };
const EMOJIS = ['🚀', '📈', '📉', '🔥', '💰', '⚠️', '✅', '❌', '🎯', '⭐', '🐂', '🐻', '👀', '💎', '🛑', '⏰'];
const COLORS = ['#2962ff', '#f23645', '#089981', '#ff9800', '#9c27b0', '#00bcd4', '#131722', '#787b86'];
const Icon = ({ t, size = 18 }) => { const L = LUCIDE[t]; return L ? <L size={size - 1} strokeWidth={1.5} /> : <ToolIcon name={t} size={size} />; };

function Btn({ active, title, onClick, children, className, disabled, ...rest }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={clsx('relative grid place-items-center size-9 shrink-0 rounded-md text-mute hover:bg-ink/[0.07] hover:text-ink transition-colors disabled:opacity-35 disabled:pointer-events-none', active && '!bg-[#2962ff]/12 !text-[#2962ff]', className)} {...rest}>
      {children}
    </button>
  );
}

export default function ChartDrawings({ children, enabled = true, wrapperRef, canvasRef, regionClass, getChart, getSeries, getData, getStep, storeKey, authed, fmt, dataVersion }) {
  const engine = useRef(null);
  const [st, setSt] = useState(null);
  const [fly, setFlyRaw] = useState(null); // open flyout group id
  const [flyTop, setFlyTop] = useState(0); const rowRef = useRef(null);
  const setFly = (id, ev) => { if (id && ev) { const r = ev.currentTarget.closest('[data-grp]')?.getBoundingClientRect(); const rr = rowRef.current.getBoundingClientRect(); if (r) setFlyTop(r.top - rr.top); } setFlyRaw(id); };
  const [last, setLast] = useState({ lines: 'trend', fib: 'fib', shapes: 'rect' });
  const [textEdit, setTextEdit] = useState(null);
  const save = useRef({ timer: null, key: null, list: null });
  const fmtRef = useRef(fmt); fmtRef.current = fmt;

  const flush = useCallback(() => {
    const s = save.current; if (!s.timer) return; clearTimeout(s.timer); s.timer = null;
    saveDrawings(s.key, s.list, s.authed).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const e = new DrawingEngine({ wrapper: wrapperRef.current, keyTarget: rowRef.current, canvas: canvasRef.current, getChart, getSeries, getData, getStep, fmt: (v) => fmtRef.current(v),
      onRequestText: (req) => setTextEdit({ ...req, used: false }),
      onChange: (state, changed) => {
        setSt(state);
        if (changed) { const s = save.current; clearTimeout(s.timer); s.list = changed.map((d) => ({ ...d })); s.timer = setTimeout(flush, 700); }
      } });
    engine.current = e; setSt(e.state());
    wrapperRef.current.__drawingEngine = e; // handle for e2e smoke tests
    return () => { flush(); e.destroy(); engine.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // load drawings for symbol / timeframe / market (+ when the user signs in)
  const k = keyOf(storeKey);
  useEffect(() => {
    if (!enabled) return undefined;
    flush(); const ac = new AbortController();
    save.current.key = storeKey; save.current.authed = authed;
    engine.current?.load([]);
    loadDrawings(storeKey, authed, ac.signal).then((list) => { if (!ac.signal.aborted) engine.current?.load(list); }).catch(() => {});
    return () => ac.abort();
  }, [k, authed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { engine.current?.invalidate(); }, [dataVersion]);
  useEffect(() => { const f = () => flush(); window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, [flush]);

  const E = engine.current;
  const closeText = (val) => { const t = textEdit; if (t && !t.used) { t.used = true; if (val != null) t.done(val); } setTextEdit(null); };
  if (!enabled) return <div ref={wrapperRef} className={regionClass}>{children}<canvas ref={canvasRef} className="hidden" /></div>;
  const pick = (g, t) => { setFly(null); if (g.tools.length > 1) setLast((p) => ({ ...p, [g.id]: t })); E?.setTool(st?.tool === t && t !== 'cursor' ? 'cursor' : t); };
  const sel = st?.selected;
  const styleTarget = sel ? sel.style : st?.toolStyle;
  const setStyle = (p) => (sel ? E.updateSelected({ style: p }) : E.setToolStyle(p));
  const showProps = st && (sel || (st.tool !== 'cursor' && st.tool !== 'zoom' && st.tool !== 'emoji'));

  return (
    <div ref={rowRef} className="relative flex flex-1 min-h-0 min-w-0">
      {/* left toolbar, as in TradingView */}
      <div className="w-11 shrink-0 border-r border-line flex flex-col items-center gap-0.5 py-1.5 overflow-y-auto [scrollbar-width:none]" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
        <Btn title="Cross (select / move drawings)" active={st?.tool === 'cursor'} onClick={() => E?.setTool('cursor')}><Crosshair size={17} strokeWidth={1.5} /></Btn>
        {GROUPS.map((g) => {
          const cur = last[g.id] || g.tools[0]; const active = g.tools.includes(st?.tool); const shown = active ? st.tool : cur;
          return (
            <div key={g.id} data-grp={g.id}>
              <Btn title={LABEL[shown]} active={active} data-more={g.tools.length > 1 || g.id === 'emoji' ? '' : undefined}
                onContextMenu={(ev) => { if (g.tools.length > 1 || g.id === 'emoji') { ev.preventDefault(); setFly(g.id, ev); } }} onClick={(ev) => (active && g.tools.length > 1 ? setFly(fly === g.id ? null : g.id, ev) : g.id === 'emoji' && !active ? (E?.setTool('emoji'), setFly('emoji', ev)) : pick(g, shown))}>
                <Icon t={shown} />
                {(g.tools.length > 1 || g.id === 'emoji') && (
                  <span aria-hidden className="absolute right-0 bottom-0 size-3 grid place-items-center text-dim pointer-events-none"><ChevronRight size={9} strokeWidth={2.5} /></span>
                )}
              </Btn>
              {fly === g.id && (
                <>
                  <div className="absolute inset-0 z-40" onClick={() => setFly(null)} aria-hidden />
                  <div className="absolute left-12 z-50 glass glass-strong glass-pop p-1 min-w-[210px]" style={{ top: flyTop }} role="menu">
                    {g.id === 'emoji' ? (
                      <div className="grid grid-cols-8 gap-0.5 p-1">
                        {EMOJIS.map((em) => <button key={em} type="button" className={clsx('size-7 rounded hover:bg-ink/[0.07] text-lg', st?.emoji === em && 'bg-[#2962ff]/12')} onClick={() => { E.setEmoji(em); E.setTool('emoji'); setFly(null); }}>{em}</button>)}
                      </div>
                    ) : g.tools.map((t) => (
                      <button key={t} type="button" role="menuitemradio" aria-checked={st?.tool === t} onClick={() => pick(g, t)}
                        className={clsx('w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm hover:bg-ink/[0.06] text-left', st?.tool === t && 'text-[#2962ff]')}>
                        <Icon t={t} />{LABEL[t]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div className="w-6 border-t border-line my-1" />
        <Btn title={`Magnet: ${st?.magnet === 'off' ? 'off' : st?.magnet === 'weak' ? 'weak' : 'strong'} (click to cycle)`} active={st?.magnet !== 'off'} onClick={() => E?.setMagnet(st.magnet === 'off' ? 'weak' : st.magnet === 'weak' ? 'strong' : 'off')}>
          <Magnet size={17} strokeWidth={1.5} />{st?.magnet === 'strong' && <span className="absolute right-0.5 top-0.5 text-[8px] font-bold">S</span>}{st?.magnet === 'weak' && <span className="absolute right-0.5 top-0.5 text-[8px] font-bold">W</span>}
        </Btn>
        <Btn title="Stay in drawing mode" active={st?.keep} onClick={() => E?.setKeep(!st.keep)}><ToolIcon name="keep" /></Btn>
        <Btn title={st?.locked ? 'Unlock all drawings' : 'Lock all drawings'} active={st?.locked} onClick={() => E?.toggleLock()} disabled={!st?.count}>{st?.locked ? <Lock size={16} strokeWidth={1.5} /> : <LockOpen size={16} strokeWidth={1.5} />}</Btn>
        <Btn title={st?.hidden ? 'Show all drawings' : 'Hide all drawings'} active={st?.hidden} onClick={() => E?.toggleHide()} disabled={!st?.count}>{st?.hidden ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}</Btn>
        <Btn title="Undo (Ctrl+Z)" onClick={() => E?.undo()} disabled={!st?.canUndo}><Undo2 size={16} strokeWidth={1.5} /></Btn>
        <Btn title="Redo (Ctrl+Y)" onClick={() => E?.redo()} disabled={!st?.canRedo}><Redo2 size={16} strokeWidth={1.5} /></Btn>
        <Btn title="Reset zoom" onClick={() => { const c = getChart(); c?.timeScale().fitContent(); c?.timeScale().scrollToPosition(6, false); c?.priceScale('right').applyOptions({ autoScale: true }); }}><RotateCcw size={15} strokeWidth={1.5} /></Btn>
        <Btn title="Remove all drawings" onClick={() => { if (window.confirm(`Remove all ${st.count} drawing(s) from this chart? You can undo this.`)) E.clearAll(); }} disabled={!st?.count}><Trash2 size={16} strokeWidth={1.5} /></Btn>
      </div>

      <div ref={wrapperRef} tabIndex={0} className={clsx(regionClass, 'outline-none')} aria-label="Chart drawing area">
      {children}
      {/* overlay canvas (pointer-events none: events are handled on the wrapper by the engine) */}
      <canvas ref={canvasRef} className="absolute left-0 top-0 z-[5] pointer-events-none" aria-hidden />

      {/* floating properties bar for the selected drawing / the active tool's defaults */}
      {showProps && styleTarget && (
        <div className="absolute left-1/2 -translate-x-1/2 top-9 z-30 glass glass-strong glass-pop flex flex-wrap items-center gap-1 px-1.5 py-1 max-w-[95%]" role="toolbar" aria-label="Drawing properties" data-draw-ui>
          <span className="text-[0.7rem] text-dim px-1">{sel ? LABEL[sel.type] : `New ${LABEL[st.tool]?.toLowerCase()}`}</span>
          {COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setStyle({ color: c })} className={clsx('size-5 rounded-full border border-black/10', styleTarget.color === c && 'ring-2 ring-offset-1 ring-[#2962ff]')} style={{ background: c }} />)}
          <input type="color" aria-label="Custom colour" value={styleTarget.color} onChange={(e) => setStyle({ color: e.target.value })} className="size-6 rounded border border-line bg-transparent cursor-pointer p-0.5" />
          {(!sel || !['text', 'emoji'].includes(sel.type)) && (
            <>
              <select aria-label="Line width" className="input !h-7 !w-16 !px-1.5 !text-xs" value={styleTarget.width} onChange={(e) => setStyle({ width: Number(e.target.value) })}>{[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w}px</option>)}</select>
              <select aria-label="Line style" className="input !h-7 !w-20 !px-1.5 !text-xs" value={styleTarget.dash} onChange={(e) => setStyle({ dash: e.target.value })}>{['solid', 'dashed', 'dotted'].map((d) => <option key={d} value={d}>{d}</option>)}</select>
            </>
          )}
          {sel && ['text', 'emoji'].includes(sel.type) && (
            <select aria-label="Size" className="input !h-7 !w-16 !px-1.5 !text-xs" value={sel.style.fontSize || (sel.type === 'emoji' ? 28 : 16)} onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}>{[12, 14, 16, 20, 24, 28, 36, 48, 64].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          )}
          {sel?.type === 'text' && !sel.locked && <button type="button" className="btn btn-ghost btn-sm !h-7" onClick={() => { const p = E.coords.toPx(sel.anchors[0]); setTextEdit({ x: p?.x || 40, y: p?.y || 40, initial: sel.style.text, done: (t) => E.setText(sel.id, t) }); }}><Type size={13} />Edit</button>}
          {sel?.type === 'emoji' && <select aria-label="Emoji" className="input !h-7 !w-14 !px-1 !text-sm" value={sel.style.emoji} onChange={(e) => setStyle({ emoji: e.target.value })}>{EMOJIS.map((em) => <option key={em}>{em}</option>)}</select>}
          {sel && <Btn className="!size-7" title={sel.locked ? 'Unlock drawing' : 'Lock drawing'} active={sel.locked} onClick={() => E.updateSelected({ locked: !sel.locked })}>{sel.locked ? <Lock size={14} /> : <LockOpen size={14} />}</Btn>}
          {sel && <Btn className="!size-7" title="Delete drawing (Del)" disabled={sel.locked} onClick={() => E.deleteSelected()}><Trash2 size={14} /></Btn>}
          {sel && <Btn className="!size-7" title="Deselect" onClick={() => E.select(null)}><X size={14} /></Btn>}
        </div>
      )}

      {textEdit && (
        <div className="absolute z-40" style={{ left: Math.max(4, textEdit.x), top: Math.max(4, textEdit.y) }} data-draw-ui>
          <textarea autoFocus defaultValue={textEdit.initial} rows={2} placeholder="Text…" aria-label="Annotation text"
            className="input !h-auto !w-56 !text-sm !py-1.5"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeText(e.currentTarget.value); } if (e.key === 'Escape') closeText(null); }}
            onBlur={(e) => closeText(e.currentTarget.value)} />
          <p className="text-[0.68rem] text-dim mt-0.5 bg-bg/80 rounded px-1">Enter to place · Shift+Enter new line · Esc cancel</p>
        </div>
      )}
      {st?.tool === 'ruler' && <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-30 badge pointer-events-none">Click start and end to measure</div>}
      </div>
    </div>
  );
}
