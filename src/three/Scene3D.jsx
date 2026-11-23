import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// Shared 3D scene for one production line. Layout comes from GET /api/twin/model (real stations, routing order);
// colours, queues and the bottleneck come from the SIMULATED run (utilisation, avg_queue_units, is_bottleneck).
// The animation is illustrative: lots slow down at stations with longer routing cycle times, so they bunch up behind the slowest one.
// It is not a replay of MES timestamps, and it computes no numbers: every figure shown comes from the backend.
// All colours are read from CSS tokens at runtime so the scene follows the theme (no literal colours here).
export const GAP = 2.6;
export const PRESETS = {
  Baseline: {},
  "Demand +15%": {},
  "Additional shift": { extra_shift_hours: 8 },
  "Buffer increase": { buffer_factor: 2 },
  "Cycle time improvement": { cycle_improvement_pct: 10, stations: "" },
  "SMT machine outage": { outage_station_id: "ST-SMT-040", outage_hours: 4 },
};
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const bucket = (u) => (u >= 90 ? 4 : u >= 75 ? 3 : u >= 50 ? 2 : 1);

export function useTokens() {
  const read = () => ({
    bg: cssVar("--dr-bg"), floor: cssVar("--dr-border"), belt: cssVar("--brand-navy"), lot: cssVar("--brand-orange"),
    sel: cssVar("--brand-blue"), none: cssVar("--dr-ink-2"), o1: cssVar("--chart-o1"), o2: cssVar("--chart-o2"),
    o3: cssVar("--chart-o3"), o4: cssVar("--chart-o4"),
    bad: cssVar("--depth-0"), dark: cssVar("--brand-navy"), glass: cssVar("--brand-blue-soft"), accent: cssVar("--brand-purple"), pcb: cssVar("--chart-c4"),
    NORMAL: cssVar("--st-normal"), WARNING: cssVar("--st-warning"), ATTENTION: cssVar("--st-attention"), CRITICAL: cssVar("--st-critical"),
    sky: cssVar("--scene-sky"), night: cssVar("--scene-night"), grass: cssVar("--scene-grass"), grass2: cssVar("--scene-grass-2"), asphalt: cssVar("--scene-asphalt"), mark: cssVar("--scene-marking"),
    concrete: cssVar("--scene-concrete"), wall: cssVar("--scene-wall"), wall2: cssVar("--scene-wall-2"), sglass: cssVar("--scene-glass"), roof: cssVar("--scene-roof"),
    solar: cssVar("--scene-solar"), ssteel: cssVar("--scene-steel"), tank: cssVar("--scene-tank"), tree: cssVar("--scene-tree"), trunk: cssVar("--scene-trunk"), lit: cssVar("--scene-lit"),
    brandBlue: cssVar("--brand-blue"), brandOrange: cssVar("--brand-orange"),
    OFFLINE: cssVar("--st-offline"), teal: cssVar("--brand-purple"), steel: cssVar("--muted-ink"), panel: cssVar("--kg-bg-3"), marking: cssVar("--st-warning"),
  });
  const [t, setT] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setT(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

// Shape is chosen from the station name in dim_station (real data); the geometry itself is a generic stand-in
// because the data bundle has no CAD or layout. Dimensions are not to scale.
function kindOf(name) {
  const n = name.toLowerCase();
  if (/pick and place/.test(n)) return "placer";
  if (/reflow/.test(n)) return "oven";
  if (/solder paste|laser marking/.test(n)) return "printer";
  if (/spi|aoi|x-ray|cosmetic|camera and audio/.test(n)) return "inspect";
  if (/aging/.test(n)) return "rack";
  if (/assembly|integration|installation|sealing/.test(n)) return "cell";
  if (/packag|goods/.test(n)) return "pack";
  return "cabinet";
}

function Box({ p, a, c, m, dim, rot }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <boxGeometry args={a} />
      <meshStandardMaterial color={c} emissive={m?.emissive ?? c} emissiveIntensity={m?.ei ?? 0} transparent opacity={dim ? 0.35 : 1} roughness={0.55} />
    </mesh>
  );
}

function Cyl({ p, r, h, c, dim }) {
  return (
    <mesh position={p} castShadow>
      <cylinderGeometry args={[r, r, h, 16]} />
      <meshStandardMaterial color={c} transparent opacity={dim ? 0.35 : 1} roughness={0.5} />
    </mesh>
  );
}

function Shape({ kind, colour, tok, dim, activeRef, emissive }) {
  const body = { emissive, ei: emissive ? 0.3 : 0 };
  const head = useRef();
  const arm = useRef();
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (head.current && activeRef.current) { head.current.position.x = Math.sin(t * 2.2) * 0.6; head.current.position.z = Math.cos(t * 1.4) * 0.3; }
    if (arm.current && activeRef.current) arm.current.rotation.y = Math.sin(t * 0.9) * 0.9;
  });
  const B = (props) => <Box dim={dim} {...props} />;
  switch (kind) {
    case "placer":
      return (<group>
        <B p={[0, 0.45, 0]} a={[1.9, 0.9, 1.1]} c={colour} m={body} />
        {[-0.8, -0.4, 0, 0.4, 0.8].map((x) => <B key={"f" + x} p={[x, 0.3, 0.8]} a={[0.3, 0.55, 0.45]} c={tok.dark} />)}
        {[-0.8, -0.4, 0, 0.4, 0.8].map((x) => <B key={"g" + x} p={[x, 0.3, -0.8]} a={[0.3, 0.55, 0.45]} c={tok.dark} />)}
        <B p={[0, 1.05, 0]} a={[1.9, 0.08, 0.1]} c={tok.dark} />
        <group ref={head} position={[0, 0.9, 0]}><B p={[0, 0.2, 0]} a={[0.35, 0.35, 0.3]} c={tok.accent} /></group>
      </group>);
    case "oven":
      return (<group>
        {[-0.85, -0.28, 0.29, 0.86].map((x) => (<group key={x}>
          <B p={[x, 0.42, 0]} a={[0.55, 0.84, 1.2]} c={colour} m={body} />
          <Cyl p={[x, 0.93, 0]} r={0.12} h={0.2} c={tok.dark} dim={dim} />
        </group>))}
        <B p={[0, 0.84, 0.61]} a={[2.2, 0.06, 0.04]} c={tok.dark} />
      </group>);
    case "printer":
      return (<group>
        <B p={[0, 0.5, 0]} a={[1.5, 1.0, 1.3]} c={colour} m={body} />
        <B p={[0, 0.55, 0.66]} a={[1.0, 0.5, 0.03]} c={tok.glass} />
        <B p={[0, 1.08, 0]} a={[1.1, 0.1, 0.3]} c={tok.dark} />
      </group>);
    case "inspect":
      return (<group>
        <B p={[0, 0.35, 0]} a={[1.5, 0.7, 1.3]} c={colour} m={body} />
        <B p={[-0.65, 1.0, 0]} a={[0.12, 0.8, 0.12]} c={tok.dark} />
        <B p={[0.65, 1.0, 0]} a={[0.12, 0.8, 0.12]} c={tok.dark} />
        <B p={[0, 1.38, 0]} a={[1.45, 0.12, 0.2]} c={tok.dark} />
        <Cyl p={[0, 1.15, 0]} r={0.14} h={0.4} c={tok.accent} dim={dim} />
      </group>);
    case "rack":
      return (<group>
        <B p={[0, 0.95, 0]} a={[1.4, 1.9, 1.1]} c={colour} m={body} />
        {[0.35, 0.8, 1.25, 1.7].map((y) => <B key={y} p={[0, y, 0.56]} a={[1.25, 0.05, 0.03]} c={tok.dark} />)}
      </group>);
    case "cell":
      return (<group>
        <B p={[0, 0.25, 0]} a={[1.6, 0.5, 1.3]} c={colour} m={body} />
        <Cyl p={[0, 0.6, 0]} r={0.22} h={0.2} c={tok.dark} dim={dim} />
        <group ref={arm} position={[0, 0.7, 0]}>
          <B p={[0.3, 0.35, 0]} a={[0.18, 0.7, 0.18]} c={tok.accent} rot={[0, 0, -0.5]} />
          <B p={[0.65, 0.75, 0]} a={[0.7, 0.14, 0.14]} c={tok.accent} />
        </group>
      </group>);
    case "pack":
      return (<group>
        <B p={[0, 0.25, 0]} a={[1.5, 0.5, 1.3]} c={colour} m={body} />
        <B p={[-0.3, 0.7, 0]} a={[0.5, 0.4, 0.5]} c={tok.lot} />
        <B p={[0.35, 0.62, 0.1]} a={[0.4, 0.25, 0.4]} c={tok.lot} />
      </group>);
    default:
      return (<group>
        <B p={[0, 0.7, 0]} a={[1.3, 1.4, 1.0]} c={colour} m={body} />
        <B p={[0, 0.95, 0.51]} a={[0.9, 0.5, 0.03]} c={tok.glass} />
        <Cyl p={[0.45, 1.55, 0]} r={0.07} h={0.3} c={tok.accent} dim={dim} />
      </group>);
  }
}

// Flies the camera to a new view when `pos` / `target` change, then hands control back to the user (OrbitControls), so the user can
// rotate, zoom and pan freely between focus changes.
export function CameraRig({ target, pos, controls, duration = 1.6 }) {
  const { camera } = useThree();
  const left = useRef(duration);
  useEffect(() => { left.current = duration; }, [pos, target, duration]);
  useFrame((_, dt) => {
    if (left.current <= 0) return;
    left.current -= dt;
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    if (controls.current) { controls.current.target.lerp(target, k); controls.current.update(); }
  });
  return null;
}

const QUEUE_PER_BOX = 3;          // one box in the WIP stack = about 3 units of simulated average queue (display scale only)

function Machine({ s, x, util, queue, bottleneck, selected, dimmed, running, busyRef, tok, onSelect, mstate }) {
  const pulse = useRef();
  const colour = util == null ? tok.none : tok["o" + bucket(util)];
  const ring = useRef();
  const lampOn = useRef();
  const lampOff = useRef();
  const activeRef = useRef(false);
  useFrame((st) => {
    activeRef.current = !!running && (busyRef.current[s.station_id] ?? 0) > 0;
    if (lampOn.current) lampOn.current.visible = activeRef.current;
    if (lampOff.current) lampOff.current.visible = !activeRef.current;
    if (ring.current) ring.current.scale.setScalar(1 + 0.03 * Math.sin(st.clock.elapsedTime * 4));
    if (pulse.current) pulse.current.scale.setScalar(1 + 0.35 * Math.abs(Math.sin(st.clock.elapsedTime * 3)));
  });
  const boxes = queue == null ? 0 : Math.min(8, Math.round(queue / QUEUE_PER_BOX));
  return (
    <group position={[x, 0, 0]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 0.2, 0]}><boxGeometry args={[2.3, 0.3, 1.7]} /><meshStandardMaterial color={tok.belt} /></mesh>
      <group position={[0, 0.35, 0]}>
        <Shape kind={kindOf(s.station_name)} colour={colour} tok={tok} dim={dimmed} activeRef={activeRef} emissive={selected ? tok.sel : null} />
      </group>
      <mesh ref={lampOn} position={[0.85, 2.15, 0.6]} visible={false}><sphereGeometry args={[0.13, 12, 12]} /><meshBasicMaterial color={tok.pcb} /></mesh>
      <mesh ref={lampOff} position={[0.85, 2.15, 0.6]}><sphereGeometry args={[0.13, 12, 12]} /><meshBasicMaterial color={tok.none} /></mesh>
      {mstate && <mesh position={[0.85, 2.5, 0.6]}><sphereGeometry args={[0.22, 14, 14]} /><meshBasicMaterial color={mstate.state === "DOWN" ? tok.bad : mstate.state === "RUNNING" ? tok.pcb : tok.lot} /></mesh>}
      {mstate?.anomaly && <mesh ref={pulse} position={[-0.85, 2.6, 0.6]}><octahedronGeometry args={[0.28]} /><meshBasicMaterial color={tok.bad} /></mesh>}
      {Array.from({ length: boxes }, (_, i) => (
        <mesh key={i} position={[-0.7 + (i % 4) * 0.4, 0.14 + Math.floor(i / 4) * 0.26, 1.25]}><boxGeometry args={[0.32, 0.22, 0.32]} /><meshStandardMaterial color={tok.lot} /></mesh>
      ))}
      {bottleneck && <mesh position={[0, 2.5, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.2, 0.45, 12]} /><meshStandardMaterial color={tok.o4} /></mesh>}
      {selected && <mesh ref={ring} position={[0, 1.2, 0]}><boxGeometry args={[2.3, 2.1, 1.7]} /><meshBasicMaterial color={tok.sel} wireframe /></mesh>}
      <Html position={[0, 3.0, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
        <div className="f3d-tag">{s.station_id.replace("ST-", "")}</div>
      </Html>
    </group>
  );
}

// Lots move along the belt. Inside a station's zone a lot slows in proportion to that station's routing cycle time (slowest station = slowest
// lot), and a lot never passes the one ahead, so a queue visibly forms behind the bottleneck. Boards (PCBA) travel through the SMT stations;
// from the first non-SMT station on the item is drawn as a phone.
function Lots({ count, length, running, speed, tok, boundX, zones, busyRef }) {
  const refs = useRef([]);
  const pcb = useRef([]);
  const phone = useRef([]);
  const X0 = -length / 2 - 1, X1 = length / 2 + 1, SPACING = 0.6;
  const cycles = zones.map((z) => z.cycle).filter((c) => c > 0);
  const mean = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 1;
  useFrame((_, dt) => {
    const lots = refs.current.filter(Boolean);
    const busy = {};
    zones.forEach((z) => (busy[z.id] = 0));
    if (running) {
      const d = Math.min(dt, 0.05) * speed;
      const order = [...lots].sort((a, b) => b.position.x - a.position.x);       // front lot first
      let ahead = Infinity;
      for (const m of order) {
        const z = zones.find((q) => Math.abs(m.position.x - q.x) < 0.9);
        const f = z && z.cycle > 0 ? Math.max(0.12, Math.min(1.4, mean / z.cycle)) * 0.35 : 1;
        m.position.x = Math.min(m.position.x + d * 1.1 * f, ahead - SPACING);
        ahead = m.position.x;
      }
      for (const m of order) {
        if (m.position.x > X1) {                                                  // leave the line, re-enter only when the entry is clear
          const minX = Math.min(...lots.filter((o) => o !== m).map((o) => o.position.x), Infinity);
          if (minX > X0 + SPACING) m.position.x = X0;
        }
      }
    }
    lots.forEach((m, i) => {
      const z = zones.find((q) => Math.abs(m.position.x - q.x) < 0.9);
      if (z) busy[z.id] += 1;
      const isPcb = m.position.x < boundX;
      const idx = refs.current.indexOf(m);
      if (pcb.current[idx]) pcb.current[idx].visible = isPcb;
      if (phone.current[idx]) phone.current[idx].visible = !isPcb;
    });
    busyRef.current = busy;
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(m) => (refs.current[i] = m)} position={[X0 + (i * (X1 - X0)) / count, 0.5, 0]}>
          <mesh ref={(m) => (pcb.current[i] = m)}><boxGeometry args={[0.42, 0.04, 0.32]} /><meshStandardMaterial color={tok.pcb} /></mesh>
          <mesh ref={(m) => (phone.current[i] = m)}><boxGeometry args={[0.3, 0.06, 0.55]} /><meshStandardMaterial color={tok.lot} /></mesh>
        </group>
      ))}
    </>
  );
}

export function stationX(i, n) { return -(n * GAP) / 2 + GAP / 2 + i * GAP; }

// Belt, moving lots and machines of one line, centred on x=0 of its parent group.
export function LineRig({ stations, byId, sel, setSel, running, speed = 1, tok, dimAll = false }) {
  const n = stations.length;
  const length = n * GAP;
  const firstFal = stations.findIndex((x) => x.process_area !== "SMT");
  const boundX = firstFal < 0 ? Infinity : firstFal === 0 ? -Infinity : -length / 2 + firstFal * GAP;
  const busyRef = useRef({});
  const zones = useMemo(() => stations.map((s, i) => ({ id: s.station_id, x: stationX(i, n), cycle: Number(s.cycle_sec) || 0 })), [stations, n]);
  return (
    <>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[length + 2, 0.08, 0.6]} /><meshStandardMaterial color={tok.belt} /></mesh>
      <Lots count={Math.max(6, n)} length={length} running={running} speed={speed} tok={tok} boundX={boundX} zones={zones} busyRef={busyRef} />
      {stations.map((s, i) => {
        const r = byId[s.station_id];
        return <Machine key={s.station_id} s={s} x={stationX(i, n)} util={r?.utilization_pct} queue={r?.avg_queue_units} bottleneck={!!r?.is_bottleneck}
                        selected={sel === s.station_id} dimmed={dimAll || (!!sel && sel !== s.station_id)} running={running} busyRef={busyRef} tok={tok} onSelect={() => setSel(s.station_id)} mstate={r?.mstate} />;
      })}
    </>
  );
}

const ROW = 7;          // distance between lines (z)
const PLANT_GAP = 5;    // extra distance between plants

// Whole plant: every line of every plant, side by side, all running. plants = GET /api/twin/model .plants; results[line_id] = { station_id: result }.
export function PlantScene({ plants, results, sel, setSel, running, speed = 1, tok, focus }) {
  const controls = useRef();
  const layout = useMemo(() => {
    let z = 0; const out = []; let maxLen = 0;
    plants.forEach((p, pi) => {
      if (pi > 0) z += PLANT_GAP;
      const start = z;
      p.lines.forEach((l) => { out.push({ plant: p, line: l, z }); maxLen = Math.max(maxLen, l.stations.length * GAP); z += ROW; });
      p.zRange = [start, z - ROW];
    });
    const depth = z - ROW;
    return { rows: out, depth, maxLen, shift: depth / 2 };
  }, [plants]);
  const { rows, depth, maxLen, shift } = layout;
  const target = useMemo(() => {
    const f = focus && rows.find((r) => r.line.line_id === focus);
    return new THREE.Vector3(0, 0.8, f ? f.z - shift : 0);
  }, [focus, rows, shift]);
  const pos = useMemo(() => {
    const f = focus && rows.find((r) => r.line.line_id === focus);
    if (f) return new THREE.Vector3(maxLen * 0.2, 6, f.z - shift + 12);
    return new THREE.Vector3(maxLen * 0.3, maxLen * 0.42 + 3, depth / 2 + maxLen * 0.42 + 6);
  }, [focus, rows, maxLen, depth, shift]);
  const W = maxLen + 14, D = depth + 18;
  return (
    <>
      <color attach="background" args={[tok.bg]} />
      <fog attach="fog" args={[tok.bg, maxLen * 1.6 + 20, maxLen * 3.5 + 60]} />
      <hemisphereLight args={[tok.glass, tok.floor, 0.7]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[10, 18, 8]} intensity={1.15} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-12, 8, -10]} intensity={0.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => setSel(null)}>
        <planeGeometry args={[W, D]} /><meshStandardMaterial color={tok.floor} roughness={0.9} />
      </mesh>
      <gridHelper args={[Math.max(W, D), Math.round(Math.max(W, D)), tok.none, tok.floor]} position={[0, 0.002, 0]} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.35} scale={Math.max(W, D)} blur={2.4} far={4} />
      {plants.map((p) => (
        <Html key={p.plant_id} position={[0, 0.8, p.zRange[0] - shift - 3]} center distanceFactor={22} style={{ pointerEvents: "none" }}>
          <div className="f3d-tag plant-tag">{p.plant_name ?? p.plant_id}</div>
        </Html>
      ))}
      {rows.map(({ line, z }) => (
        <group key={line.line_id} position={[0, 0, z - shift]}>
          <Html position={[-line.stations.length * GAP / 2 - 1.5, 0.6, 0]} center distanceFactor={22} style={{ pointerEvents: "none" }}>
            <div className="f3d-tag">{line.line_id}</div>
          </Html>
          <LineRig stations={line.stations} byId={results[line.line_id] ?? {}} sel={sel} setSel={setSel} running={running} speed={speed} tok={tok} dimAll={!!focus && focus !== line.line_id} />
        </group>
      ))}
      <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} />
      <CameraRig target={target} pos={pos} controls={controls} />
    </>
  );
}

export function Scene({ stations, byId, sel, setSel, running, speed = 1, view, tok, selX }) {
  const n = stations.length;
  const length = n * GAP;
  const firstFal = stations.findIndex((x) => x.process_area !== "SMT");
  const boundX = firstFal < 0 ? Infinity : firstFal === 0 ? -Infinity : -length / 2 + firstFal * GAP;
  const controls = useRef();
  const busyRef = useRef({});
  const zones = useMemo(() => stations.map((s, i) => ({ id: s.station_id, x: stationX(i, n), cycle: Number(s.cycle_sec) || 0 })), [stations, n]);
  const target = useMemo(() => new THREE.Vector3(sel ? selX : 0, 0.8, 0), [sel, selX]);
  const pos = useMemo(() => {
    if (sel) return new THREE.Vector3(selX + 4, 4.5, 8);
    if (view === "top") return new THREE.Vector3(0, length * 0.9 + 4, 0.01);
    if (view === "front") return new THREE.Vector3(0, 4, length * 0.8 + 4);
    return new THREE.Vector3(length * 0.25, length * 0.45 + 3, length * 0.8 + 4);
  }, [sel, selX, view, length]);
  return (
    <>
      <color attach="background" args={[tok.bg]} />
      <fog attach="fog" args={[tok.bg, length * 1.1 + 12, length * 2.4 + 30]} />
      <hemisphereLight args={[tok.glass, tok.floor, 0.7]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[8, 14, 6]} intensity={1.15} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-10, 6, -8]} intensity={0.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => setSel(null)}>
        <planeGeometry args={[length + 14, 18]} /><meshStandardMaterial color={tok.floor} roughness={0.9} />
      </mesh>
      <gridHelper args={[length + 14, Math.round(length + 14), tok.none, tok.floor]} position={[0, 0.002, 0]} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.35} scale={length + 14} blur={2.4} far={4} />
      <LineRig stations={stations} byId={byId} sel={sel} setSel={setSel} running={running} speed={speed} tok={tok} />
      <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} />
      <CameraRig target={target} pos={pos} controls={controls} />
    </>
  );
}
