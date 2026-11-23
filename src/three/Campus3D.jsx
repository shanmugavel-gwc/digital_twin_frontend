import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { CameraRig } from "./Scene3D.jsx";

// Aerial plant campus. Buildings are mapped to real data areas (SMT hall = SMT line machines, FAL hall = final-assembly line, warehouse =
// inventory and shipments, quality lab = inspections, utilities = HVAC / chiller / compressor energy meters, main building = control room).
// The campus layout, vehicles, trees and smoke are ILLUSTRATIVE (the data has no site plan); status beacons and labels come from the
// replayed hour. Lighting follows the hour of the replayed record (day or night). All colours are CSS tokens (tok).

export const AREAS = {
  control: { pos: [0, 0, 22], label: "Control Room" },
  smt: { pos: [-38, 0, -16], label: "SMT Hall" },
  fal: { pos: [22, 0, -16], label: "Final Assembly Hall" },
  warehouse: { pos: [-82, 0, 12], label: "Warehouse & Logistics" },
  quality: { pos: [52, 0, 24], label: "Quality Testing Lab" },
  utilities: { pos: [80, 0, -22], label: "Utilities & Infrastructure" },
};

function Box({ p, a, c, e, ei = 0, rot, rough = 0.7, metal = 0.05, op, shadow = true }) {
  return (
    <mesh position={p} rotation={rot} castShadow={shadow} receiveShadow>
      <boxGeometry args={a} />
      <meshStandardMaterial color={c} emissive={e ?? c} emissiveIntensity={ei} roughness={rough} metalness={metal} transparent={op != null} opacity={op ?? 1} />
    </mesh>
  );
}
function Cyl({ p, r, r2, h, c, seg = 20, rot, metal = 0.3, rough = 0.45 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[r, r2 ?? r, h, seg]} />
      <meshStandardMaterial color={c} metalness={metal} roughness={rough} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------------- ground, roads, gate
function Road({ from, to, w = 7, tok, dashed = true }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2, cz = (from[1] + to[1]) / 2;
  const n = Math.floor(len / 6);
  return (
    <group position={[cx, 0.02, cz]} rotation={[0, ang, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[w, len]} /><meshStandardMaterial color={tok.asphalt} roughness={0.95} /></mesh>
      {dashed && Array.from({ length: n }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -len / 2 + 3 + i * 6]}><planeGeometry args={[0.25, 2.6]} /><meshBasicMaterial color={tok.mark} /></mesh>
      ))}
      {[-w / 2 + 0.2, w / 2 - 0.2].map((x) => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}><planeGeometry args={[0.15, len]} /><meshBasicMaterial color={tok.concrete} /></mesh>)}
    </group>
  );
}

function PalmTree({ p, s = 1, tok }) {
  const fronds = 7;
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 2.6, 0]} r={0.18} r2={0.26} h={5.2} c={tok.trunk} metal={0} rough={0.9} seg={8} />
      {Array.from({ length: fronds }, (_, i) => {
        const a = (i / fronds) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * 1.1, 5.1, Math.cos(a) * 1.1]} rotation={[Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]} castShadow>
            <coneGeometry args={[0.45, 2.6, 4]} /><meshStandardMaterial color={tok.tree} roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}
function RoundTree({ p, s = 1, tok }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 1, 0]} r={0.2} h={2} c={tok.trunk} metal={0} rough={0.9} seg={8} />
      <mesh position={[0, 2.9, 0]} castShadow><sphereGeometry args={[1.6, 12, 10]} /><meshStandardMaterial color={tok.tree} roughness={0.9} /></mesh>
    </group>
  );
}

function Gate({ tok, plantName }) {
  return (
    <group position={[0, 0, 74]}>
      <Box p={[0, 5.2, 0]} a={[26, 0.8, 8]} c={tok.wall} />
      <Box p={[0, 5.2, 4.05]} a={[26.2, 0.8, 0.15]} c={tok.brandBlue} />
      <Box p={[0, 5.2, -4.05]} a={[26.2, 0.8, 0.15]} c={tok.brandBlue} />
      {[-12, -4, 4, 12].map((x) => <Box key={x} p={[x, 2.6, 0]} a={[0.9, 5.2, 0.9]} c={tok.wall2} />)}
      {[-8, 0, 8].map((x) => <Box key={x} p={[x, 0.7, 0]} a={[1.4, 1.4, 1.4]} c={tok.wall} />)}
      {[-4, 4].map((x) => <Box key={x} p={[x, 1.1, -1.5]} a={[6.5, 0.15, 0.15]} c={tok.mark} />)}
      <Box p={[18, 1.6, 2]} a={[5, 3.2, 4]} c={tok.wall} />
      <Box p={[18, 1.8, 4.01]} a={[3.6, 1.2, 0.05]} c={tok.sglass} rough={0.1} metal={0.6} />
      <group position={[-24, 0, 8]}>
        <Box p={[0, 1.8, 0]} a={[10, 3.6, 1.2]} c={tok.wall} />
        <Box p={[0, 0.35, 0]} a={[10.6, 0.7, 1.6]} c={tok.concrete} />
        <Html position={[0, 1.9, 0.7]} center transform scale={2.2} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <div className="cp-monolith"><b>{plantName}</b><span>Digital twin campus</span></div>
        </Html>
      </group>
      {/* fence */}
      {[-1, 1].map((sgn) => <Box key={sgn} p={[sgn * 70, 1, 0]} a={[110, 2, 0.15]} c={tok.ssteel} op={0.5} shadow={false} />)}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------------- buildings
function Windows({ w, h, d, rows, night, tok, side = "front" }) {
  const cols = Math.max(3, Math.floor(w / 4));
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w / cols) * (c + 0.5);
      const y = 2 + r * ((h - 3) / Math.max(1, rows));
      const on = night && (r * 7 + c * 3) % 5 !== 0;
      out.push(
        <mesh key={`${r}-${c}`} position={[x, y, side === "front" ? d / 2 + 0.03 : -d / 2 - 0.03]}>
          <planeGeometry args={[(w / cols) * 0.7, 1.2]} />
          <meshStandardMaterial color={on ? tok.lit : tok.sglass} emissive={on ? tok.lit : tok.sglass} emissiveIntensity={on ? 0.9 : 0.05} roughness={0.15} metalness={0.5} side={THREE.DoubleSide} />
        </mesh>,
      );
    }
  }
  return <>{out}</>;
}

function SawtoothRoof({ w, d, h, tok }) {
  const n = Math.floor(w / 6);
  return (
    <group position={[0, h, 0]}>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[-w / 2 + 3 + i * 6, 0, 0]}>
          <Box p={[0, 1.1, 0]} a={[5.6, 0.25, d - 1]} c={tok.roof} rot={[0, 0, 0.38]} />
          <Box p={[1.15, 1.1, 0]} a={[0.1, 2, d - 1]} c={tok.sglass} rough={0.1} metal={0.6} />
        </group>
      ))}
    </group>
  );
}

function RoofUnits({ w, d, h, tok }) {
  return (
    <group position={[0, h, 0]}>
      {[[-w / 4, -d / 4], [w / 4, d / 5], [0, -d / 3]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, 0.7, 0]} a={[3.2, 1.4, 2.2]} c={tok.ssteel} metal={0.4} />
          <Cyl p={[0, 1.5, 0]} r={0.6} h={0.2} c={tok.dark} />
        </group>
      ))}
    </group>
  );
}

function Beacon({ y, color }) {
  const m = useRef();
  useFrame((st) => { if (m.current) m.current.material.emissiveIntensity = 0.6 + 0.5 * Math.abs(Math.sin(st.clock.elapsedTime * 2.6)); });
  return (
    <group position={[0, y, 0]}>
      <Cyl p={[0, 0.8, 0]} r={0.08} h={1.6} c={color} />
      <mesh ref={m} position={[0, 1.9, 0]}><sphereGeometry args={[0.7, 18, 14]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} /></mesh>
    </group>
  );
}

function Hall({ w, d, h, tok, night, sawtooth }) {
  return (
    <group>
      <Box p={[0, h / 2, 0]} a={[w, h, d]} c={tok.wall} />
      <Box p={[0, h - 1.2, d / 2 + 0.05]} a={[w, 1, 0.1]} c={tok.brandBlue} />
      <Box p={[0, 0.5, 0]} a={[w + 0.3, 1, d + 0.3]} c={tok.wall2} />
      <Windows w={w} h={h - 2} d={d} rows={2} night={night} tok={tok} />
      <Windows w={w} h={h - 2} d={d} rows={2} night={night} tok={tok} side="back" />
      {sawtooth ? <SawtoothRoof w={w} d={d} h={h} tok={tok} /> : <><Box p={[0, h + 0.15, 0]} a={[w + 0.4, 0.3, d + 0.4]} c={tok.roof} /><RoofUnits w={w} d={d} h={h + 0.3} tok={tok} /></>}
    </group>
  );
}

function MainBuilding({ tok, night, plantName }) {
  const W = 56, H = 16, D = 20;
  return (
    <group>
      <Box p={[0, H / 2, 0]} a={[W, H, D]} c={tok.wall} />
      {/* full-height glass atrium with mullions */}
      <Box p={[-6, H / 2, D / 2 + 0.06]} a={[26, H - 2, 0.12]} c={night ? tok.lit : tok.sglass} e={night ? tok.lit : tok.sglass} ei={night ? 0.45 : 0.08} rough={0.08} metal={0.7} />
      {Array.from({ length: 9 }, (_, i) => <Box key={i} p={[-19 + i * 3.25, H / 2, D / 2 + 0.14]} a={[0.18, H - 2, 0.12]} c={tok.wall2} />)}
      <Box p={[0, H - 0.6, D / 2 + 0.08]} a={[W, 1.2, 0.15]} c={tok.brandBlue} />
      {/* facade lettering: the plant's name from dim_plant */}
      <Html position={[18, H - 3.4, D / 2 + 0.25]} center transform scale={5} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
        <div className="cp-facade">{plantName}</div>
      </Html>
      <Box p={[18, H / 2 - 1, D / 2 + 0.05]} a={[18, H - 5, 0.1]} c={tok.sglass} rough={0.1} metal={0.6} />
      {/* entrance canopy */}
      <Box p={[-6, 4.6, D / 2 + 4]} a={[16, 0.5, 8]} c={tok.wall} />
      {[-13, 1].map((x) => <Box key={x} p={[x, 2.3, D / 2 + 7.4]} a={[0.5, 4.6, 0.5]} c={tok.wall2} />)}
      <Box p={[0, H + 0.2, 0]} a={[W + 0.4, 0.4, D + 0.4]} c={tok.roof} />
      <RoofUnits w={W} d={D} h={H + 0.4} tok={tok} />
    </group>
  );
}

function Warehouse({ tok, night }) {
  const W = 36, H = 11, D = 30;
  return (
    <group>
      <Hall w={W} d={D} h={H} tok={tok} night={night} />
      {/* loading docks facing east */}
      {[-9, -3, 3, 9].map((z) => (
        <group key={z} position={[W / 2, 0, z]}>
          <Box p={[0.06, 2.4, 0]} a={[0.12, 4, 3.6]} c={tok.dark} />
          <Box p={[1.2, 0.6, 0]} a={[2.4, 1.2, 4]} c={tok.concrete} />
        </group>
      ))}
    </group>
  );
}

function QualityLab({ tok, night }) {
  return (
    <group>
      <Box p={[0, 4.5, 0]} a={[24, 9, 16]} c={tok.wall} />
      <Box p={[0, 4.5, 8.06]} a={[22, 6, 0.1]} c={night ? tok.lit : tok.sglass} e={night ? tok.lit : tok.sglass} ei={night ? 0.4 : 0.06} rough={0.08} metal={0.6} />
      <Box p={[0, 8.4, 8.1]} a={[24, 0.8, 0.12]} c={tok.brandBlue} />
      <Box p={[0, 9.15, 0]} a={[24.4, 0.3, 16.4]} c={tok.roof} />
      <RoofUnits w={24} d={16} h={9.3} tok={tok} />
    </group>
  );
}

function Smoke({ p, tok }) {
  const g = useRef();
  const puffs = useMemo(() => Array.from({ length: 6 }, (_, i) => i / 6), []);
  useFrame((st) => {
    if (!g.current) return;
    g.current.children.forEach((m, i) => {
      const t = (st.clock.elapsedTime * 0.12 + puffs[i]) % 1;
      m.position.set(Math.sin(t * 6 + i) * 0.6 + t * 3, t * 12, 0);
      m.scale.setScalar(0.6 + t * 2.2);
      m.material.opacity = 0.35 * (1 - t);
    });
  });
  return (
    <group ref={g} position={p}>
      {puffs.map((_, i) => <mesh key={i}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={tok.wall} transparent opacity={0.3} depthWrite={false} /></mesh>)}
    </group>
  );
}

function Utilities({ tok }) {
  return (
    <group>
      <Box p={[0, 0.15, 0]} a={[40, 0.3, 34]} c={tok.concrete} />
      {/* tank farm */}
      {[[-12, -8], [-5, -8], [2, -8], [-12, 0], [-5, 0]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl p={[0, 4, 0]} r={2.6} h={8} c={tok.tank} metal={0.5} rough={0.3} />
          <mesh position={[0, 8.2, 0]}><sphereGeometry args={[2.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={tok.tank} metalness={0.5} roughness={0.3} /></mesh>
          <Box p={[2.65, 4, 0]} a={[0.1, 8, 0.6]} c={tok.mark} />
        </group>
      ))}
      {/* stacks */}
      {[[10, -10], [14, -10], [18, -10]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl p={[0, 11, 0]} r={0.9} r2={1.2} h={22} c={tok.tank} metal={0.4} />
          <Cyl p={[0, 20.5, 0]} r={0.95} h={1.2} c={tok.brandOrange} />
          <Smoke p={[0, 22.5, 0]} tok={tok} />
        </group>
      ))}
      {/* chillers and compressor house */}
      <Box p={[11, 3, 6]} a={[14, 6, 10]} c={tok.wall2} />
      {[6, 11, 16].map((x) => <Cyl key={x} p={[x, 6.5, 6]} r={1.3} h={1} c={tok.ssteel} />)}
      {/* pipe rack to the halls */}
      {[0, 1, 2].map((k) => <Cyl key={k} p={[-30, 6 + k * 0.7, 10]} r={0.35} h={56} rot={[0, 0, Math.PI / 2]} c={k === 1 ? tok.brandBlue : tok.ssteel} />)}
      {[-50, -36, -22, -8].map((x) => <Box key={x} p={[x, 3, 10]} a={[0.4, 6, 0.4]} c={tok.ssteel} />)}
    </group>
  );
}

function SolarCarport({ tok }) {
  const rows = [-14, -4, 6];
  const palette = [tok.wall, tok.dark, tok.brandBlue, tok.ssteel, tok.CRITICAL, tok.wall2];
  return (
    <group position={[-58, 0, 52]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -4]} receiveShadow><planeGeometry args={[48, 32]} /><meshStandardMaterial color={tok.asphalt} roughness={0.95} /></mesh>
      {rows.map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-18, -6, 6, 18].map((x) => <Box key={x} p={[x, 1.8, 0]} a={[0.3, 3.6, 0.3]} c={tok.ssteel} />)}
          <Box p={[0, 3.8, 0]} a={[44, 0.18, 6]} c={tok.solar} rot={[0.18, 0, 0]} rough={0.2} metal={0.6} />
          {Array.from({ length: 10 }, (_, i) => (
            <group key={i} position={[-19.5 + i * 4.3, 0, (i % 2 ? 1.2 : -1.2)]}>
              <Box p={[0, 0.55, 0]} a={[1.9, 0.8, 3.8]} c={palette[(i + z) % palette.length] ?? tok.wall} rough={0.3} metal={0.6} />
              <Box p={[0, 1.05, -0.2]} a={[1.7, 0.45, 2]} c={tok.sglass} rough={0.1} metal={0.6} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------------- moving vehicles (illustrative)
function Vehicle({ curve, speed = 0.02, offset = 0, tok, kind = "truck", running }) {
  const g = useRef();
  const tRef = useRef(offset);
  useFrame((_, dt) => {
    if (!g.current) return;
    if (running) tRef.current = (tRef.current + dt * speed) % 1;
    const p = curve.getPointAt(tRef.current);
    const q = curve.getPointAt((tRef.current + 0.002) % 1);
    g.current.position.set(p.x, 0, p.z);
    g.current.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
  });
  return (
    <group ref={g}>
      {kind === "truck" ? (
        <group position={[1.2, 0, 0]}>
          <Box p={[0, 1.9, -1.4]} a={[2.4, 2.8, 6.2]} c={tok.wall} />
          <Box p={[0, 1.4, 2.6]} a={[2.3, 2.2, 1.8]} c={tok.brandBlue} />
          <Box p={[0, 1.8, 3.52]} a={[2, 0.9, 0.05]} c={tok.sglass} rough={0.1} metal={0.6} />
        </group>
      ) : (
        <group position={[1.4, 0, 0]}>
          <Box p={[0, 0.6, 0]} a={[1.8, 0.8, 3.8]} c={tok.CRITICAL} rough={0.3} metal={0.6} />
          <Box p={[0, 1.15, -0.2]} a={[1.6, 0.5, 2]} c={tok.sglass} rough={0.1} metal={0.6} />
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------------- scene
function Area({ k, tok, status, label, sub, selected, onSelect, children, beaconY }) {
  const a = AREAS[k];
  return (
    <group position={a.pos} onClick={(e) => { e.stopPropagation(); onSelect(k); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      {children}
      {status && <Beacon y={beaconY} color={tok[status] ?? tok.none} />}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}><ringGeometry args={[30, 31.5, 64]} /><meshBasicMaterial color={tok.brandBlue} transparent opacity={0.8} /></mesh>
      )}
      <Html position={[0, beaconY + 4.5, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
        <div className={`cp-label ${selected ? "on" : ""} ${status ? `cp-${status.toLowerCase()}` : ""}`}>
          <b>{label ?? a.label}</b>{sub && <span>{sub}</span>}
        </div>
      </Html>
    </group>
  );
}

export function CampusScene({ tok, hour = 12, plantName, status = {}, subs = {}, focus, onSelect, running = true }) {
  const night = hour < 6 || hour >= 19;
  const sunA = ((hour - 6) / 12) * Math.PI;                           // sunrise 06:00 .. sunset 18:00
  const sun = night ? [-60, 40, -40] : [Math.cos(sunA) * 120, Math.max(20, Math.sin(sunA) * 140), 60];
  const controls = useRef();
  const target = useMemo(() => new THREE.Vector3(...(focus ? AREAS[focus].pos : [0, 0, 0])), [focus]);
  const pos = useMemo(() => {
    if (!focus) return new THREE.Vector3(-18, 105, 158);
    const [x, , z] = AREAS[focus].pos;
    return new THREE.Vector3(x - 25, 45, z + 70);
  }, [focus]);
  const loop = useMemo(() => new THREE.CatmullRomCurve3(
    [[-105, 50], [-105, -45], [105, -45], [105, 50], [0, 52], [-60, 50]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "catmullrom", 0.1), []);
  const entry = useMemo(() => new THREE.CatmullRomCurve3([[0, 120], [0, 52], [-40, 50], [-60, 34], [-62, 12], [-62, -10], [-30, 52], [0, 120]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true), []);
  const sel = (k) => onSelect?.(k);
  return (
    <>
      <color attach="background" args={[night ? tok.night : tok.sky]} />
      <fog attach="fog" args={[night ? tok.night : tok.sky, 220, 520]} />
      <hemisphereLight args={[tok.sky, tok.grass, night ? 0.25 : 0.75]} />
      <ambientLight intensity={night ? 0.18 : 0.35} />
      <directionalLight position={sun} intensity={night ? 0.25 : 1.35} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-140} shadow-camera-right={140} shadow-camera-top={140} shadow-camera-bottom={-140} shadow-camera-far={500} />
      {night && [[-38, -16], [22, -16], [0, 40], [-82, 12]].map(([x, z]) => <pointLight key={`${x}${z}`} position={[x, 18, z + 20]} intensity={60} distance={70} color={tok.lit} />)}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow onClick={() => sel(null)}>
        <planeGeometry args={[520, 420]} /><meshStandardMaterial color={tok.grass} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]} receiveShadow><planeGeometry args={[226, 112]} /><meshStandardMaterial color={tok.concrete} roughness={0.95} /></mesh>

      {/* roads: perimeter loop, entrance axis, service road */}
      <Road from={[-105, 50]} to={[105, 50]} tok={tok} />
      <Road from={[-105, -46]} to={[105, -46]} tok={tok} />
      <Road from={[-105, -46]} to={[-105, 50]} tok={tok} />
      <Road from={[105, -46]} to={[105, 50]} tok={tok} />
      <Road from={[0, 50]} to={[0, 130]} w={10} tok={tok} />
      <Road from={[-62, 50]} to={[-62, -46]} w={6} tok={tok} dashed={false} />
      {/* roundabout with a green island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 50]}><circleGeometry args={[11, 40]} /><meshStandardMaterial color={tok.asphalt} roughness={0.95} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 50]}><circleGeometry args={[6, 40]} /><meshStandardMaterial color={tok.grass2} /></mesh>
      <PalmTree p={[0, 0, 50]} s={1.2} tok={tok} />

      <Area k="control" tok={tok} status={status.control} sub={subs.control} selected={focus === "control"} onSelect={sel} beaconY={16.6}><MainBuilding tok={tok} night={night} plantName={plantName} /></Area>
      <Area k="smt" tok={tok} status={status.smt} sub={subs.smt} selected={focus === "smt"} onSelect={sel} beaconY={15}><Hall w={52} d={34} h={12} tok={tok} night={night} sawtooth /></Area>
      <Area k="fal" tok={tok} status={status.fal} sub={subs.fal} selected={focus === "fal"} onSelect={sel} beaconY={15}><Hall w={52} d={34} h={12} tok={tok} night={night} sawtooth /></Area>
      <Area k="warehouse" tok={tok} status={status.warehouse} sub={subs.warehouse} selected={focus === "warehouse"} onSelect={sel} beaconY={11.6}><Warehouse tok={tok} night={night} /></Area>
      <Area k="quality" tok={tok} status={status.quality} sub={subs.quality} selected={focus === "quality"} onSelect={sel} beaconY={9.6}><QualityLab tok={tok} night={night} /></Area>
      <Area k="utilities" tok={tok} status={status.utilities} sub={subs.utilities} selected={focus === "utilities"} onSelect={sel} beaconY={9}><Utilities tok={tok} /></Area>

      <SolarCarport tok={tok} />
      <Gate tok={tok} plantName={plantName} />

      {/* landscaping along the roads */}
      {Array.from({ length: 14 }, (_, i) => <PalmTree key={`pa${i}`} p={[-96 + i * 14.5, 0, 57]} s={0.9 + (i % 3) * 0.1} tok={tok} />)}
      {Array.from({ length: 6 }, (_, i) => <PalmTree key={`pb${i}`} p={[-6 - (i % 2) * 12, 0, 62 + i * 10]} tok={tok} />)}
      {Array.from({ length: 6 }, (_, i) => <PalmTree key={`pc${i}`} p={[6 + (i % 2) * 12, 0, 62 + i * 10]} tok={tok} />)}
      {Array.from({ length: 16 }, (_, i) => <RoundTree key={`rt${i}`} p={[-120 + i * 16, 0, -60 - (i % 2) * 6]} s={1 + (i % 3) * 0.2} tok={tok} />)}
      {Array.from({ length: 6 }, (_, i) => <RoundTree key={`rs${i}`} p={[118 + (i % 2) * 6, 0, -40 + i * 16]} tok={tok} />)}

      <Vehicle curve={loop} speed={0.02} tok={tok} running={running} />
      <Vehicle curve={loop} speed={0.02} offset={0.5} tok={tok} running={running} />
      <Vehicle curve={entry} speed={0.03} offset={0.2} tok={tok} kind="car" running={running} />

      <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI / 2.15} minDistance={25} maxDistance={360} />
      <CameraRig target={target} pos={pos} controls={controls} />
    </>
  );
}
