import { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { EffectComposer, DepthOfField } from '@react-three/postprocessing';
import * as THREE from 'three';

// open, high, low, close: a plain, believable up-trend with two pullbacks
const SERIES = [
  [1.0, 1.55, 0.85, 1.4], [1.4, 1.7, 1.2, 1.3], [1.3, 1.9, 1.25, 1.75], [1.75, 2.1, 1.6, 2.0], [2.0, 2.15, 1.55, 1.65],
  [1.65, 2.2, 1.6, 2.1], [2.1, 2.65, 2.0, 2.5], [2.5, 2.85, 2.35, 2.45], [2.45, 3.1, 2.4, 3.0],
];
const GAP = 0.86; const SY = 2.15; // SY stretches the price axis so the bars read as a chart, not as cubes
const UP = '#2fbf85'; const DOWN = '#e0566a'; // matte, lower saturation than the UI greens/reds so the scene stays calm

function Bar({ i, o, h, l, c, low }) {
  const up = c >= o; const x = (i - (SERIES.length - 1) / 2) * GAP;
  const top = Math.max(o, c); const bot = Math.min(o, c);
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, ((h + l) / 2) * SY, 0]}>
        <cylinderGeometry args={[0.026, 0.026, (h - l) * SY, 16]} />
        <meshStandardMaterial color="#8fb2ff" metalness={1} roughness={0.34} envMapIntensity={1.1} />
      </mesh>
      <RoundedBox args={[0.4, Math.max((top - bot) * SY, 0.1), 0.4]} radius={0.018} smoothness={low ? 1 : 4} position={[0, ((top + bot) / 2) * SY, 0]}>
        <meshPhysicalMaterial color={up ? UP : DOWN} roughness={0.34} metalness={0.45} clearcoat={0.2} clearcoatRoughness={0.45} envMapIntensity={1.15} />
      </RoundedBox>
    </group>
  );
}

/** Keeps the whole row of candles in frame whatever the aspect ratio of the hero column. */
function Fit() {
  const { camera, size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const need = Math.max((SERIES.length * GAP + 1.8) / aspect, 7.2);
  camera.position.z = need / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.updateProjectionMatrix();
  return null;
}

/** Shallow depth of field: sharp on the middle of the row, the ends soften. */
function Lens() {
  const { size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const need = Math.max((SERIES.length * GAP + 1.8) / aspect, 7.2);
  const dist = need / (2 * Math.tan((27 * Math.PI) / 360));
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      <DepthOfField worldFocusDistance={dist} worldFocusRange={2.2} bokehScale={1.6} height={480} />
    </EffectComposer>
  );
}

function Rig({ children, reduce }) {
  const g = useRef();
  useFrame((state, delta) => {
    if (!g.current) return;
    const t = reduce ? 0 : state.clock.elapsedTime;
    const ty = -0.34 + Math.sin(t * 0.14) * 0.12 + state.pointer.x * 0.05; // slow sway, barely follows the cursor
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, ty, 2, delta);
  });
  return <group ref={g} position={[0, -4.25, 0]}>{children}</group>;
}

export default function Hero3D({ low = false, reduceMotion = false }) {
  return (
    <Canvas dpr={low ? [1, 1.25] : [1, 1.75]} camera={{ position: [0, 0, 14], fov: 27 }} gl={{ antialias: !low, powerPreference: 'high-performance' }} frameloop={reduceMotion ? 'demand' : 'always'}>
      <Fit />
      <color attach="background" args={['#0a1222']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-4, 7, 7]} intensity={3.2} color="#eef3ff" />
      <directionalLight position={[-6, 3, 2]} intensity={0.9} color="#c9d6f2" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} position={[2, 5, 4]} scale={[10, 3, 1]} color="#f2f6ff" />
        <Lightformer form="rect" intensity={1.6} position={[-6, 1.5, 1]} rotation-y={Math.PI / 2} scale={[5, 3, 1]} color="#dbe5fb" />
        <Lightformer form="rect" intensity={1.2} position={[6, 0.5, -2]} rotation-y={-Math.PI / 2} scale={[5, 3, 1]} color="#c5d3f5" />
      </Environment>
      <Rig reduce={reduceMotion}>
        {[1.0, 2.0, 3.0].map((y) => (
          <mesh key={y} position={[0, y * SY, -0.9]}><boxGeometry args={[SERIES.length * GAP + 1.6, 0.016, 0.016]} /><meshStandardMaterial color="#3a4a6b" metalness={0.8} roughness={0.5} /></mesh>
        ))}
        {SERIES.map(([o, h, l, c], i) => <Bar key={i} i={i} o={o} h={h} l={l} c={c} low={low} />)}
      </Rig>
      {!low && <Lens />}
    </Canvas>
  );
}
