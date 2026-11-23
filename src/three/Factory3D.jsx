import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Edges, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { CameraRig, GAP, LineRig, stationX } from "./Scene3D.jsx";
import { MachineUnit } from "./MachineUnits.jsx";

// Factory hall: one plant, one zone per process area (dim_station.process_area), laid out like a factory plan:
// back row SMT | Assembly | Testing, front row Warehouse | Quality | Packing, loading dock and truck on the right.
// Zones, stations and their order are real. The floor plan, building, racks, forklift, operators, trees and truck are illustrative
// because the data bundle has no CAD layout. All colours come from CSS tokens (tok).
export const AREA_LABEL = {
  RAW_MATERIAL: "Raw Material Storage (illustrative)", SMT: "SMT Assembly Line (PCB)", FINAL_ASSEMBLY: "Mobile Phone Assembly Line", TEST: "Functional Testing",
  QUALITY: "Quality Inspection", PACKAGING: "Packaging", WAREHOUSE: "Finished Goods Warehouse", MAINTENANCE: "Maintenance Area (illustrative)",
};
// spec sub-areas mapped to real stations (dim_station)
export const SUBAREA = {
  "ST-SMT-010": "PCB Preparation", "ST-SMT-020": "PCB Preparation", "ST-SMT-040": "Component Placement", "ST-SMT-050": "Reflow Soldering",
  "ST-SMT-030": "Inspection (SPI)", "ST-SMT-060": "Inspection (AOI)", "ST-SMT-070": "Inspection (X-ray)",
  "ST-FAL-010": "Display Installation", "ST-FAL-030": "Camera Module Installation", "ST-FAL-040": "Battery Installation",
};
export const VIRTUAL = new Set(["RAW_MATERIAL", "MAINTENANCE"]);
const ROWS = [["RAW_MATERIAL", "SMT", "FINAL_ASSEMBLY", "TEST"], ["WAREHOUSE", "QUALITY", "PACKAGING", "MAINTENANCE"]];
const ROW_Z = [-9.5, 8];
const ZONE_GAP = 3, ROW_PITCH = 4.6, HALL_D = 38;
const ZONE_MIN = { WAREHOUSE: [13, 10], QUALITY: [10, 8], PACKAGING: [13, 9], RAW_MATERIAL: [11, 11], MAINTENANCE: [11, 9] };

function zoneShape(area, n) {
  const two = n > 3;
  const cols = two ? Math.ceil(n / 2) : n;
  const w = Math.max(cols * GAP + 2, ZONE_MIN[area]?.[0] ?? 0);
  const d = Math.max((two ? 2 : 1) * ROW_PITCH + 3, ZONE_MIN[area]?.[1] ?? 0);
  return { cols, w, d, two };
}

export function factoryLayout(stations) {
  const byArea = {};
  stations.forEach((s) => { (byArea[s.process_area] ??= []).push(s); });
  const rows = ROWS.map((areas, ri) => {
    const zs = areas.filter((a) => byArea[a]?.length || VIRTUAL.has(a)).map((a) => {
      const st = byArea[a] ?? [];
      const sh = zoneShape(a, st.length);
      const split = sh.two ? [st.slice(0, sh.cols), st.slice(sh.cols)] : [st];
      const rowX = a === "WAREHOUSE" ? -(sh.w - (sh.cols * GAP + 2)) / 2 : 0;       // warehouse: station on the left, racks on the right
      return { area: a, stations: st, split, ...sh, rowX, rowZ: sh.two ? [-ROW_PITCH / 2, ROW_PITCH / 2] : [0], z: ROW_Z[ri] };
    });
    const total = zs.reduce((t, q) => t + q.w, 0) + ZONE_GAP * Math.max(0, zs.length - 1);
    let x = -total / 2;
    zs.forEach((q) => { q.x = x + q.w / 2; x += q.w + ZONE_GAP; });
    return { zs, total };
  });
  return { zones: rows.flatMap((r) => r.zs), width: Math.max(...rows.map((r) => r.total), 24) + 8 };
}

// World position of a station in the layout (for the camera).
export function stationWorld(zones, id) {
  for (const q of zones) {
    for (let r = 0; r < q.split.length; r++) {
      const i = q.split[r].findIndex((s) => s.station_id === id);
      if (i >= 0) return { x: q.x + q.rowX + stationX(i, q.split[r].length), z: q.z + q.rowZ[r] };
    }
  }
  return null;
}

function Truck({ tok, position }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[7, 3, 2.8]} /><meshStandardMaterial color={tok.glass} /></mesh>
      <mesh position={[0, 0.6, 0]}><boxGeometry args={[7, 0.4, 2.8]} /><meshStandardMaterial color={tok.sel} /></mesh>
      <mesh position={[4.2, 1.1, 0]} castShadow><boxGeometry args={[1.8, 2.2, 2.6]} /><meshStandardMaterial color={tok.sel} /></mesh>
      <mesh position={[4.85, 1.5, 0]}><boxGeometry args={[0.05, 0.9, 2.2]} /><meshStandardMaterial color={tok.dark} /></mesh>
      {[-2.2, 1.6, 4.2].flatMap((x) => [-1.4, 1.4].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.45, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.45, 0.45, 0.35, 16]} /><meshStandardMaterial color={tok.dark} /></mesh>
      )))}
    </group>
  );
}

function Tree({ tok, position, s = 1 }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.12, 0.16, 1, 8]} /><meshStandardMaterial color={tok.belt} /></mesh>
      <mesh position={[0, 1.7, 0]} castShadow><sphereGeometry args={[0.95, 14, 12]} /><meshStandardMaterial color={tok.pcb} roughness={0.9} /></mesh>
    </group>
  );
}

function Person({ tok, position, phase = 0, face = 0 }) {
  const g = useRef();
  useFrame((st) => { if (g.current) g.current.position.y = Math.abs(Math.sin(st.clock.elapsedTime * 1.6 + phase)) * 0.03; });
  return (
    <group position={position} rotation={[0, face, 0]}>
      <group ref={g}>
        <mesh position={[0, 0.42, 0]} castShadow><cylinderGeometry args={[0.13, 0.15, 0.84, 10]} /><meshStandardMaterial color={tok.sel} /></mesh>
        <mesh position={[0, 0.98, 0]} castShadow><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color={tok.lot} /></mesh>
        <mesh position={[0, 1.1, 0]}><sphereGeometry args={[0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={tok.glass} /></mesh>
      </group>
    </group>
  );
}

function Rack({ tok, position }) {
  return (
    <group position={position}>
      {[-1.4, 1.4].flatMap((x) => [-0.5, 0.5].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 1.3, z]}><boxGeometry args={[0.08, 2.6, 0.08]} /><meshStandardMaterial color={tok.sel} /></mesh>
      )))}
      {[0.3, 1.2, 2.1].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0]}><boxGeometry args={[2.9, 0.06, 1.1]} /><meshStandardMaterial color={tok.lot} /></mesh>
          {[-0.9, 0, 0.9].map((x) => <mesh key={x} position={[x, y + 0.28, 0]} castShadow><boxGeometry args={[0.7, 0.5, 0.8]} /><meshStandardMaterial color={tok.glass} /></mesh>)}
        </group>
      ))}
    </group>
  );
}

function Forklift({ tok, running, range }) {
  const g = useRef();
  useFrame((st) => { if (g.current && running) { const t = st.clock.elapsedTime * 0.35; g.current.position.x = Math.sin(t) * range; g.current.rotation.y = Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2; } });
  return (
    <group ref={g}>
      <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.0, 0.7, 1.7]} /><meshStandardMaterial color={tok.lot} /></mesh>
      <mesh position={[0, 1.3, -0.3]}><boxGeometry args={[0.9, 0.06, 0.9]} /><meshStandardMaterial color={tok.dark} /></mesh>
      <mesh position={[0, 1.1, 0.95]}><boxGeometry args={[0.1, 1.8, 0.1]} /><meshStandardMaterial color={tok.dark} /></mesh>
      <mesh position={[0, 0.2, 1.4]}><boxGeometry args={[0.8, 0.06, 0.6]} /><meshStandardMaterial color={tok.dark} /></mesh>
      <mesh position={[0, 0.5, 1.4]} castShadow><boxGeometry args={[0.6, 0.5, 0.5]} /><meshStandardMaterial color={tok.glass} /></mesh>
    </group>
  );
}

// Floor safety marking: yellow walkway lines around a zone.
function Markings({ w, d, tok }) {
  const t = 0.12, y = 0.06;
  const bars = [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]];
  return (
    <group>
      {bars.map(([x, z, a, b], i) => <mesh key={i} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[a, b]} /><meshBasicMaterial color={tok.marking} /></mesh>)}
    </group>
  );
}

function Bench({ tok, position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.85, 0]} castShadow><boxGeometry args={[2.4, 0.08, 0.9]} /><meshStandardMaterial color={tok.steel} /></mesh>
      {[-1.1, 1.1].flatMap((x) => [-0.38, 0.38].map((z) => <mesh key={`${x}${z}`} position={[x, 0.42, z]}><boxGeometry args={[0.06, 0.84, 0.06]} /><meshStandardMaterial color={tok.dark} /></mesh>))}
      <mesh position={[0.6, 1.05, 0]}><boxGeometry args={[0.5, 0.3, 0.35]} /><meshStandardMaterial color={tok.accent} /></mesh>
    </group>
  );
}

function Cabinet({ tok, position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[1.0, 1.8, 0.6]} /><meshStandardMaterial color={tok.CRITICAL} /></mesh>
      {[0.5, 0.9, 1.3].map((y) => <mesh key={y} position={[0, y, 0.31]}><boxGeometry args={[0.85, 0.03, 0.02]} /><meshStandardMaterial color={tok.dark} /></mesh>)}
    </group>
  );
}

function Zone({ q, byId, sel, setSel, running, speed, tok, machines, selMachine, onSelectMachine, lineFilter, maintenance, rawStock }) {
  const unitsAt = (stationId) => machines.filter((m) => m.station_id === stationId);
  return (
    <group position={[q.x, 0, q.z]}>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[q.w, 0.06, q.d]} /><meshStandardMaterial color={tok.floor} roughness={0.85} /><Edges color={tok.lot} /></mesh>
      <Markings w={q.w - 0.4} d={q.d - 0.4} tok={tok} />
      {q.split.map((row, r) => row.map((s, i) => {
        const x = q.rowX + stationX(i, row.length);
        return (
          <group key={`m-${s.station_id}`}>
            {unitsAt(s.station_id).map((m, k, arr) => (
              <MachineUnit key={m.machine_id} m={m} tok={tok} position={[x + (k - (arr.length - 1) / 2) * 2.4, 0, q.rowZ[r] - 2.05]}
                selected={selMachine === m.machine_id} dimmed={!!lineFilter && m.line_id !== lineFilter} running={running} onSelect={onSelectMachine} />
            ))}
            {SUBAREA[s.station_id] && (
              <Html position={[x, 0.15, q.rowZ[r] + 1.55]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
                <div className="f3d-sub">{SUBAREA[s.station_id]}</div>
              </Html>
            )}
          </group>
        );
      }))}
      {q.area === "RAW_MATERIAL" && (
        <>
          {[-3, 0, 3].flatMap((x) => [-2.8, 2.8].map((z) => <Rack key={`${x}${z}`} tok={tok} position={[x, 0, z]} />))}
          <Forklift tok={tok} running={running} range={3.5} />
          {rawStock && <Html position={[0, 3.3, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><div className="f3d-callout f3d-small">{rawStock}</div></Html>}
        </>
      )}
      {q.area === "MAINTENANCE" && (
        <>
          <Bench tok={tok} position={[-2.5, 0, -2]} /><Bench tok={tok} position={[2.5, 0, -2]} />
          <Cabinet tok={tok} position={[-4, 0, 2.5]} /><Cabinet tok={tok} position={[-2.8, 0, 2.5]} />
          <Person tok={tok} position={[0, 0, 0.5]} phase={1} />
          {maintenance && <Html position={[0, 3.3, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><div className="f3d-callout f3d-small">{maintenance}</div></Html>}
        </>
      )}
      <Html position={[0, 3.4, -q.d / 2]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
        <div className="f3d-callout">{AREA_LABEL[q.area] ?? q.area}</div>
      </Html>
      {q.split.map((row, r) => (
        <group key={r} position={[q.rowX, 0, q.rowZ[r]]}>
          <LineRig stations={row} byId={byId} sel={sel} setSel={setSel} running={running} speed={speed} tok={tok} />
          {row.map((s, i) => (i % 2 === 0
            ? <Person key={s.station_id} tok={tok} position={[stationX(i, row.length) + 0.9, 0, 1.25]} phase={i + r} face={Math.PI} />
            : null))}
        </group>
      ))}
      {q.area === "WAREHOUSE" && (
        <>
          <Rack tok={tok} position={[q.w / 2 - 2, 0, -2.6]} />
          <Rack tok={tok} position={[q.w / 2 - 5.4, 0, -2.6]} />
          <Rack tok={tok} position={[q.w / 2 - 2, 0, 2.6]} />
          <Rack tok={tok} position={[q.w / 2 - 5.4, 0, 2.6]} />
          <group position={[q.w / 2 - 3.7, 0, 0]}><Forklift tok={tok} running={running} range={2.4} /></group>
        </>
      )}
      {q.area === "PACKAGING" && [0, 1, 2].map((i) => (
        <mesh key={i} position={[q.w / 2 - 1.2, 0.3 + i * 0.5, -1.4]} castShadow><boxGeometry args={[1.1, 0.5, 1.1]} /><meshStandardMaterial color={tok.lot} /></mesh>
      ))}
    </group>
  );
}

export function FactoryScene({ stations, byId, sel, setSel, running, speed = 1, tok, view, selPos, plantName, machines = [], selMachine, onSelectMachine = () => {},
  lineFilter, maintenance, rawStock }) {
  const { zones, width } = useMemo(() => factoryLayout(stations), [stations]);
  const controls = useRef();
  const D = HALL_D;
  const target = useMemo(() => new THREE.Vector3(selPos?.x ?? 0, 0.8, selPos?.z ?? 0), [selPos]);
  const pos = useMemo(() => {
    if (selPos?.zone) return new THREE.Vector3(selPos.x + 4, 15, selPos.z + 17);
    if (selPos) return new THREE.Vector3(selPos.x + 5, 5.5, selPos.z + 9);
    if (view === "top") return new THREE.Vector3(0, width * 0.95 + 6, 0.01);
    return new THREE.Vector3(-width * 0.12, width * 0.42 + 4, D / 2 + width * 0.38);
  }, [selPos, view, width, D]);
  const pack = zones.find((z) => z.area === "PACKAGING");
  const nWin = Math.max(4, Math.floor(width / 5));
  const windows = Array.from({ length: nWin }, (_, i) => -width / 2 + (width / nWin) * (i + 0.5));
  return (
    <>
      <color attach="background" args={[tok.bg]} />
      <fog attach="fog" args={[tok.bg, width * 2 + 20, width * 5 + 60]} />
      <hemisphereLight args={[tok.glass, tok.floor, 0.8]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[width * 0.5, 30, 20]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-width} shadow-camera-right={width} shadow-camera-top={width} shadow-camera-bottom={-width} />
      <directionalLight position={[-20, 10, -10]} intensity={0.3} />
      {/* grounds: grass, road, hall slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow onClick={() => setSel(null)}><planeGeometry args={[width + 90, D + 90]} /><meshStandardMaterial color={tok.pcb} transparent opacity={0.16} roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, D / 2 + 9]} receiveShadow><planeGeometry args={[width + 90, 7]} /><meshStandardMaterial color={tok.dark} roughness={1} /></mesh>
      {Array.from({ length: Math.floor((width + 60) / 6) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-width / 2 - 20 + i * 6, -0.04, D / 2 + 9]}><planeGeometry args={[2.4, 0.18]} /><meshStandardMaterial color={tok.glass} /></mesh>
      ))}
      <mesh position={[0, -0.02, 0]} receiveShadow onClick={() => setSel(null)}><boxGeometry args={[width, 0.1, D]} /><meshStandardMaterial color={tok.glass} roughness={0.7} /></mesh>
      {/* walls: solid back wall with windows and sign, translucent sides, low kerb at the front */}
      <mesh position={[0, 2, -D / 2]} castShadow><boxGeometry args={[width, 4, 0.4]} /><meshStandardMaterial color={tok.glass} /></mesh>
      <mesh position={[0, 4.15, -D / 2]}><boxGeometry args={[width + 0.4, 0.3, 0.7]} /><meshStandardMaterial color={tok.dark} /></mesh>
      {windows.map((x) => <mesh key={x} position={[x, 2.4, -D / 2 + 0.22]}><boxGeometry args={[Math.min(3.4, width / 6), 1.6, 0.05]} /><meshStandardMaterial color={tok.sel} transparent opacity={0.65} /></mesh>)}
      <Html position={[0, 3.2, -D / 2 + 0.3]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><div className="f3d-sign">{plantName ?? "Factory"}</div></Html>
      <mesh position={[-width / 2, 1.5, 0]}><boxGeometry args={[0.3, 3, D]} /><meshStandardMaterial color={tok.glass} transparent opacity={0.5} /></mesh>
      <mesh position={[width / 2, 1.5, 0]}><boxGeometry args={[0.3, 3, D]} /><meshStandardMaterial color={tok.glass} transparent opacity={0.5} /></mesh>
      <mesh position={[0, 0.2, D / 2]}><boxGeometry args={[width, 0.4, 0.2]} /><meshStandardMaterial color={tok.dark} /></mesh>
      {/* dock doors and truck at the packing zone */}
      {pack && [-3, 3].map((dz) => <mesh key={dz} position={[width / 2, 1.3, pack.z + dz]}><boxGeometry args={[0.4, 2.6, 3.2]} /><meshStandardMaterial color={tok.dark} /></mesh>)}
      {pack && <Truck tok={tok} position={[width / 2 + 5, 0, pack.z]} />}
      {Array.from({ length: 10 }, (_, i) => <Tree key={`b${i}`} tok={tok} s={0.9 + (i % 3) * 0.2} position={[-width / 2 - 3 + (i * (width + 6)) / 9, 0, -D / 2 - 3 - (i % 2) * 1.5]} />)}
      {Array.from({ length: 4 }, (_, i) => <Tree key={`l${i}`} tok={tok} position={[-width / 2 - 4 - (i % 2) * 2, 0, -D / 2 + 4 + i * 7]} />)}
      {zones.map((q) => <Zone key={q.area} q={q} byId={byId} sel={sel} setSel={setSel} running={running} speed={speed} tok={tok} machines={machines}
        selMachine={selMachine} onSelectMachine={onSelectMachine} lineFilter={lineFilter} maintenance={maintenance} rawStock={rawStock} />)}
      <ContactShadows position={[0, 0.03, 0]} opacity={0.3} scale={width + 20} blur={2.4} far={4} />
      <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} />
      <CameraRig target={target} pos={pos} controls={controls} />
    </>
  );
}

// World position of a machine unit (behind its station) or of a zone centre, for the camera.
export function machineWorld(zones, machine) {
  const p = machine && stationWorld(zones, machine.station_id);
  return p ? { x: p.x, z: p.z - 2.05 } : null;
}
export function zoneWorld(zones, area) {
  const q = zones.find((z) => z.area === area);
  return q ? { x: q.x, z: q.z, zone: true } : null;
}
