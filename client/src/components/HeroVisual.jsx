import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../lib/hooks.js';

const Hero3D = lazy(() => import('./Hero3D.jsx'));

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

/** Flat SVG candles: shown while the 3D scene loads and whenever WebGL is unavailable or fails. */
function Fallback() {
  const S = [[1.0, 1.55, 0.85, 1.4], [1.4, 1.7, 1.2, 1.3], [1.3, 1.9, 1.25, 1.75], [1.75, 2.1, 1.6, 2.0], [2.0, 2.15, 1.55, 1.65], [1.65, 2.2, 1.6, 2.1], [2.1, 2.65, 2.0, 2.5], [2.5, 2.85, 2.35, 2.45], [2.45, 3.1, 2.4, 3.0]];
  const y = (v) => 330 - v * 100;
  return (
    <svg viewBox="0 0 640 360" className="w-full h-full" role="img" aria-label="Illustration of rising candlesticks" preserveAspectRatio="xMidYMax meet">
      {S.map(([o, h, l, c], i) => {
        const x = 40 + i * 66; const top = Math.max(o, c); const bot = Math.min(o, c);
        return (
          <g key={i}>
            <line x1={x + 18} x2={x + 18} y1={y(h)} y2={y(l)} stroke="#b89a5a" strokeWidth="2" />
            <rect x={x} y={y(top)} width="36" height={Math.max((top - bot) * 100, 6)} fill={c >= o ? '#2b8a66' : '#a4474d'} />
          </g>
        );
      })}
      <line x1="20" x2="620" y1="330" y2="330" stroke="rgba(236,232,220,.14)" />
    </svg>
  );
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn('3D scene disabled:', e?.message); }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}

/** Lazy-loaded react-three-fiber hero. Mounts only when visible and when WebGL works. */
export default function HeroVisual() {
  const ref = useRef(null); const [visible, setVisible] = useState(false); const [gl, setGl] = useState(true);
  const small = useMediaQuery('(max-width: 767px)'); const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    setGl(webglAvailable());
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full h-full" data-testid="hero-visual">
      {gl && visible ? (
        <Boundary><Suspense fallback={<Fallback />}><Hero3D low={small} reduceMotion={reduce} /></Suspense></Boundary>
      ) : <Fallback />}
    </div>
  );
}
