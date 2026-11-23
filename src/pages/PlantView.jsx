import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { api, useApi, fmt } from "../api.js";
import { ApiState, Card, PageHeader, StateBanner } from "../components.jsx";
import { PlantScene, useTokens } from "../three/Scene3D.jsx";

// Whole-plant 3D animation: every line of every plant at once.
//   GET /api/twin/model                 -> plants, lines, stations in routing order (real data from twin.dim_* tables)
//   GET /api/twin/bottleneck?line_id=   -> SIMULATED station results of the latest stored run, one call per line
// The motion is illustrative (see Scene3D.jsx); utilisation colours, queues and bottleneck flags come from the stored simulated runs.
const SPEEDS = [0.5, 1, 2, 4];

export default function PlantView({ onOpenLine }) {
  const model = useApi("/twin/model");
  const tok = useTokens();
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState("");
  const [sel, setSel] = useState(null);
  const [res, setRes] = useState({ loading: true, error: null, byLine: {} });
  const wrap = useRef();
  const plants = useMemo(() => model.data?.plants ?? [], [model.data]);
  const lines = useMemo(() => plants.flatMap((p) => p.lines.map((l) => ({ ...l, plant_id: p.plant_id }))), [plants]);

  useEffect(() => {
    if (!lines.length) return undefined;
    let dead = false;
    setRes({ loading: true, error: null, byLine: {} });
    Promise.all(lines.map((l) => api(`/twin/bottleneck?line_id=${l.line_id}`).then((d) => [l.line_id, d.stations ?? []])))
      .then((all) => { if (!dead) setRes({ loading: false, error: null, byLine: Object.fromEntries(all) }); })
      .catch((e) => { if (!dead) setRes({ loading: false, error: e, byLine: {} }); });
    return () => { dead = true; };
  }, [lines]);

  const results = useMemo(() => Object.fromEntries(Object.entries(res.byLine).map(([k, v]) => [k, Object.fromEntries(v.map((s) => [s.station_id, s]))])), [res.byLine]);
  const summary = lines.map((l) => {
    const rs = res.byLine[l.line_id] ?? [];
    const u = rs.map((r) => r.utilization_pct).filter((x) => x != null);
    const bn = rs.find((r) => r.is_bottleneck);
    return { ...l, avg: u.length ? u.reduce((a, b) => a + b, 0) / u.length : null, bn: bn && (l.stations.find((s) => s.station_id === bn.station_id)?.station_name ?? bn.station_id) };
  });

  return (
    <>
      <PageHeader title="Twin view" subtitle="Animated 3D view of all plants and lines. Switch to Single line for station detail and scenario preview." state="SIMULATED" />
      <StateBanner type="SIMULATED">Animation is illustrative. Colours, queues and bottlenecks come from the latest stored SIMULATED runs; nothing here is a measurement or reaches the plant.</StateBanner>
      <ApiState loading={model.loading} error={model.error || res.error} />
      {lines.length > 0 && (
        <>
          <div className="f3d-toolbar">
            <label className="field"><span>Focus</span>
              <select value={focus} onChange={(e) => { setFocus(e.target.value); setSel(null); }}>
                <option value="">Whole plant</option>
                {lines.map((l) => <option key={l.line_id} value={l.line_id}>{l.line_id} ({l.plant_id})</option>)}
              </select>
            </label>
            <button type="button" className="primary" onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause" : "▶ Play"}</button>
            <div className="seg" role="group" aria-label="Animation speed">
              {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
            </div>
            <button type="button" className="ghost" onClick={() => { setFocus(""); setSel(null); }}>Reset view</button>
            <button type="button" className="ghost" onClick={() => wrap.current?.requestFullscreen?.()}>Fullscreen</button>
          </div>
          <div className="f3d-grid">
            <div className="f3d-canvas frame-wrap frame-sim" ref={wrap}>
              <Canvas shadows camera={{ position: [20, 22, 30], fov: 45 }} dpr={[1, 2]}>
                <Suspense fallback={null}>
                  <PlantScene plants={plants} results={results} sel={sel} setSel={setSel} running={running} speed={speed} tok={tok} focus={focus} />
                </Suspense>
              </Canvas>
            </div>
            <div className="f3d-side">
              {summary.map((l) => (
                <Card key={l.line_id} title={`${l.line_id} · ${l.plant_id}`} className="detail">
                  <dl>
                    <dt>Avg utilisation (SIMULATED)</dt><dd>{l.avg != null ? `${fmt(l.avg, 0)}%` : "n/a"}</dd>
                    <dt>Bottleneck</dt><dd>{l.bn ?? "n/a"}</dd>
                    <dt>Stations</dt><dd>{l.stations.length}</dd>
                  </dl>
                  <button type="button" className="ghost small" onClick={() => setFocus(l.line_id)}>Focus line</button>
                  {onOpenLine && <button type="button" className="ghost small" onClick={onOpenLine}>Open single-line view</button>}
                </Card>
              ))}
              <Card title="Data flow" className="detail">
                <p className="muted-text">MES export (LIVE) → <code>twin.fact_hourly_production</code> → calibrated SimPy model → <code>twin.twin_scenario_run</code> and <code>twin_station_result</code> (SIMULATED) → this view. Read-only: no write-back to PLC/SCADA.</p>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
