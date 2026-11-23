import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

// One 3D object per REAL machine (dim_machine), placed behind its station (machine type -> station, assumption A-03).
// Body shape follows machine_type; the status panel, beacon and alert marker follow the latest agent run's status
// (green NORMAL, yellow WARNING, orange ATTENTION, red CRITICAL, grey OFFLINE; neutral when the agent has not run).
// Geometry is a recognisable stand-in, not to scale (no CAD in the data). Colours come from CSS tokens (tok).
const SEVERE = new Set(["WARNING", "ATTENTION", "CRITICAL", "OFFLINE"]);

function B({ p, a, c, e, ei = 0, rot }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <boxGeometry args={a} />
      <meshStandardMaterial color={c} emissive={e ?? c} emissiveIntensity={ei} roughness={0.5} metalness={0.15} />
    </mesh>
  );
}
function C({ p, r, h, c, rot }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <cylinderGeometry args={[r, r, h, 16]} />
      <meshStandardMaterial color={c} roughness={0.45} metalness={0.3} />
    </mesh>
  );
}

function Body({ type, tok, sc, animRef }) {
  const head = useRef();
  const arm = useRef();
  useFrame((st) => {
    if (!animRef.current) return;
    const t = st.clock.elapsedTime;
    if (head.current) head.current.position.x = Math.sin(t * 2) * 0.45;
    if (arm.current) arm.current.rotation.y = Math.sin(t * 0.8) * 1.1;
  });
  const shell = tok.glass, frame = tok.steel, dark = tok.dark;
  switch (type) {
    case "Pick and Place":
      return (<group>
        <B p={[0, 0.45, 0]} a={[1.8, 0.9, 1.1]} c={shell} />
        {[-0.84, 0.84].map((x) => <B key={x} p={[x, 1.15, 0]} a={[0.1, 0.5, 1.0]} c={frame} />)}
        <B p={[0, 1.42, 0]} a={[1.8, 0.1, 0.16]} c={frame} />
        <group ref={head} position={[0, 1.22, 0]}><B p={[0, 0, 0]} a={[0.3, 0.3, 0.28]} c={tok.accent} /><C p={[0, -0.22, 0]} r={0.04} h={0.2} c={dark} /></group>
        {[-0.6, -0.2, 0.2, 0.6].map((x) => <B key={x} p={[x, 0.35, 0.68]} a={[0.3, 0.5, 0.3]} c={dark} />)}
        <B p={[0, 0.92, 0.56]} a={[1.7, 0.12, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "Reflow Oven":
      return (<group>
        <B p={[0, 0.5, 0]} a={[2.1, 0.75, 1.0]} c={shell} />
        <B p={[0, 0.95, 0]} a={[2.1, 0.18, 1.04]} c={frame} />
        {[-0.7, -0.23, 0.23, 0.7].map((x) => <C key={x} p={[x, 1.12, 0]} r={0.09} h={0.18} c={dark} />)}
        <B p={[-1.12, 0.45, 0]} a={[0.14, 0.12, 0.6]} c={dark} />
        <B p={[1.12, 0.45, 0]} a={[0.14, 0.12, 0.6]} c={dark} />
        <B p={[0, 0.55, 0.51]} a={[1.9, 0.14, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "AOI":
    case "SPI":
      return (<group>
        <B p={[0, 0.4, 0]} a={[1.3, 0.8, 1.05]} c={shell} />
        <B p={[0, 1.05, 0]} a={[1.2, 0.5, 0.95]} c={frame} />
        <B p={[0, 1.05, 0.48]} a={[0.9, 0.3, 0.03]} c={tok.panel} />
        <C p={[0.4, 1.42, 0]} r={0.12} h={0.25} c={tok.accent} />
        <B p={[0, 0.65, 0.53]} a={[1.1, 0.12, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "Assembly Cell":
      return (<group>
        <B p={[0, 0.3, 0]} a={[1.5, 0.6, 1.2]} c={shell} />
        <C p={[0, 0.7, 0]} r={0.2} h={0.2} c={dark} />
        <group ref={arm} position={[0, 0.8, 0]}>
          <B p={[0.12, 0.35, 0]} a={[0.16, 0.7, 0.16]} c={tok.accent} rot={[0, 0, -0.35]} />
          <B p={[0.5, 0.68, 0]} a={[0.7, 0.13, 0.13]} c={tok.accent} />
          <B p={[0.85, 0.55, 0]} a={[0.08, 0.25, 0.08]} c={dark} />
        </group>
        {[-0.72, 0.72].map((x) => <B key={x} p={[x, 0.95, -0.55]} a={[0.05, 1.3, 0.05]} c={frame} />)}
        <B p={[0, 0.5, 0.61]} a={[1.3, 0.12, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "Aging Chamber":
      return (<group>
        <B p={[0, 0.95, 0]} a={[1.3, 1.9, 0.9]} c={shell} />
        {[0.4, 0.8, 1.2, 1.6].map((y) => <B key={y} p={[0, y, 0.46]} a={[1.15, 0.05, 0.03]} c={dark} />)}
        <B p={[0, 1.85, 0.46]} a={[1.15, 0.1, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "Leak Tester":
      return (<group>
        <B p={[0, 0.4, 0]} a={[1.1, 0.8, 0.9]} c={shell} />
        <C p={[0, 1.0, 0]} r={0.38} h={0.45} c={frame} />
        <C p={[0, 1.3, 0]} r={0.1} h={0.2} c={dark} />
        <B p={[0, 0.6, 0.46]} a={[0.9, 0.12, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "Camera Tester":
      return (<group>
        <B p={[0, 0.35, 0]} a={[1.2, 0.7, 0.9]} c={shell} />
        <B p={[0, 1.15, -0.3]} a={[1.0, 0.9, 0.08]} c={tok.panel} />
        <C p={[0, 0.85, 0.15]} r={0.1} h={0.35} c={dark} rot={[Math.PI / 2, 0, 0]} />
        <B p={[0, 0.55, 0.46]} a={[1.0, 0.12, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    case "ICT Tester":
      return (<group>
        <B p={[0, 0.4, 0]} a={[1.3, 0.8, 1.0]} c={shell} />
        {[-0.45, 0.45].map((x) => <C key={x} p={[x, 1.05, 0]} r={0.05} h={0.6} c={frame} />)}
        <B p={[0, 1.3, 0]} a={[1.1, 0.12, 0.8]} c={frame} />
        <B p={[0, 0.6, 0.51]} a={[1.1, 0.12, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
    default:            // RF Tester and anything else: shielded test cabinet
      return (<group>
        <B p={[0, 0.75, 0]} a={[1.0, 1.5, 0.85]} c={shell} />
        <B p={[0, 1.0, 0.43]} a={[0.7, 0.45, 0.03]} c={tok.panel} />
        {[0.2, 0.35, 0.5].map((y) => <B key={y} p={[0, y, 0.43]} a={[0.7, 0.04, 0.03]} c={dark} />)}
        <B p={[0, 1.42, 0.43]} a={[0.8, 0.1, 0.03]} c={sc} e={sc} ei={0.5} />
      </group>);
  }
}

export function MachineUnit({ m, tok, position, selected, dimmed, running, onSelect }) {
  const status = m.status;
  const sc = status ? tok[status] : tok.none;
  const animRef = useRef(false);
  const beacon = useRef();
  const alert = useRef();
  const ring = useRef();
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    animRef.current = !!running && m.metrics?.latest?.machine_state === "RUNNING";
    if (beacon.current) beacon.current.material.emissiveIntensity = SEVERE.has(status) ? 0.6 + 0.6 * Math.abs(Math.sin(t * 3)) : 0.8;
    if (alert.current) { alert.current.position.y = 2.75 + 0.12 * Math.sin(t * 2.5); alert.current.rotation.y = t * 1.5; }
    if (ring.current) ring.current.rotation.z = t * 0.8;
  });
  return (
    <group position={position} scale={dimmed ? 0.92 : 1}
      onClick={(e) => { e.stopPropagation(); onSelect(m.machine_id); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.4, 1.6]} /><meshStandardMaterial color={sc} transparent opacity={dimmed ? 0.12 : 0.28} />
      </mesh>
      <group position={[0, 0.06, 0]}><Body type={m.machine_type} tok={tok} sc={sc} animRef={animRef} /></group>
      <C p={[0.85, 1.75, -0.35]} r={0.03} h={0.9} c={tok.steel} />
      <mesh ref={beacon} position={[0.85, 2.25, -0.35]}>
        <sphereGeometry args={[0.15, 16, 16]} /><meshStandardMaterial color={sc} emissive={sc} emissiveIntensity={0.8} />
      </mesh>
      {SEVERE.has(status) && (
        <mesh ref={alert} position={[0, 2.75, 0]}><octahedronGeometry args={[0.26]} /><meshStandardMaterial color={sc} emissive={sc} emissiveIntensity={0.7} /></mesh>
      )}
      {selected && (
        <mesh ref={ring} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.5, 48]} /><meshBasicMaterial color={tok.teal} /></mesh>
      )}
      <Html position={[0, 3.25, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
        <div className={`f3d-mtag ${status ? `mt-${status.toLowerCase()}` : ""} ${selected ? "on" : ""}`}>{m.machine_id}{status ? ` · ${status}` : ""}</div>
      </Html>
    </group>
  );
}
