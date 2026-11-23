import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useApi, fmt, pct } from "../api.js";
import { ApiState, AXIS, Card, ChartBlock, DataTable, PageHeader } from "../components.jsx";
import { PRESETS, Scene, stationX, useTokens } from "../three/Scene3D.jsx";

// 3D animated simulation of one line.
//   GET  /api/twin/model                -> stations in routing order (real data), machines, buffers
//   GET  /api/twin/bottleneck?line_id=  -> SIMULATED station results (utilisation, avg queue, bottleneck) of the latest run
//   GET  /api/twin/live-state?line_id=  -> LIVE (MES) line OEE; there are no station-level measurements
//   GET  /api/forecast/throughput-wip   -> SIMULATED hourly output and WIP (baseline), drives the simulated-hour clock
//   POST /api/twin/simulate             -> optional non-persisted scenario preview (recolours the scene)
// The animation is illustrative (lots slow down at stations with longer routing cycle times); every number shown comes from the backend.
const SPEEDS = [0.5, 1, 2, 4];
const HOUR_MS = 6000;               // one simulated hour per 6 s at 1x

function SceneLoader({ show }) {
  const [gone, setGone] = useState(false);
  useEffect(() => { if (!show) { const t = setTimeout(() => setGone(true), 500); return () => clearTimeout(t); } setGone(false); return undefined; }, [show]);
  if (gone && !show) return null;
  return (
    <div className={`f3d-loader ${show ? "" : "out"}`} role="status" aria-live="polite">
      <div className="f3d-loader-belt"><i /><i /><i /><b /></div>
      <span>Building 3D line…</span>
    </div>
  );
}

export default function TwinView() {
  const model = useApi("/twin/model");
  const [line, setLine] = useState("");
  const [mode, setMode] = useState("SIMULATED");
  const [sel, setSel] = useState(null);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState("iso");
  const [hour, setHour] = useState(1);
  const [scName, setScName] = useState("Baseline");
  const [pre, setPre] = useState({ busy: false, error: null, line: null, name: null, res: null });
  const [fix, setFix] = useState({ busy: false, data: null, error: null });
  const [ready, setReady] = useState(false);
  const tok = useTokens();
  const wrap = useRef();

  const lines = useMemo(() => (model.data?.plants ?? []).flatMap((p) => p.lines.map((l) => ({ ...l, plant_id: p.plant_id }))), [model.data]);
  const cur = lines.find((l) => l.line_id === line) ?? lines[0];
  const lineId = cur?.line_id;
  const stations = cur?.stations ?? [];
  const isSmt = (lineId ?? "").startsWith("SMT");
  const sim = useApi(lineId && mode === "SIMULATED" ? `/twin/bottleneck?line_id=${lineId}` : null);
  const live = useApi(lineId && mode === "LIVE" ? `/twin/live-state?line_id=${lineId}` : null);
  const fc = useApi(lineId ? `/forecast/throughput-wip?line_id=${lineId}&horizon_hours=24` : null);

  const usePre = mode === "SIMULATED" && pre.line === lineId && pre.res;
  const shown = mode === "SIMULATED" ? (usePre ? (pre.res.station_results ?? []) : (sim.data?.stations ?? [])) : [];
  const byId = Object.fromEntries(shown.map((s) => [s.station_id, s]));

  // simulated-hour clock: follows the scenario preview's hourly output when one is shown, otherwise the baseline forecast
  const series = useMemo(() => {
    if (usePre && Array.isArray(pre.res.hourly_mean)) return pre.res.hourly_mean.map((o, i) => ({ hour: i + 1, output_mean: o, wip_mean: null }));
    return fc.data?.series ?? [];
  }, [usePre, pre.res, fc.data]);
  const nHours = series.length || 24;
  const hr = Math.min(hour, nHours);
  const point = series[hr - 1];
  const cumulative = series.slice(0, hr).reduce((a, r) => a + (r.output_mean ?? 0), 0);

  const playing = running && mode === "SIMULATED";
  useEffect(() => {
    if (!playing || !series.length) return undefined;
    const t = setInterval(() => setHour((h) => (h % series.length) + 1), HOUR_MS / speed);
    return () => clearInterval(t);
  }, [playing, speed, series.length]);
  useEffect(() => { setHour(1); }, [lineId, usePre]);

  async function runScenario() {
    setPre((p) => ({ ...p, busy: true, error: null }));
    try {
      const out = await api("/twin/simulate", { method: "POST", body: { scenario_name: scName, line_id: lineId, replications: 12, horizon_hours: 24, params: PRESETS[scName] ?? {}, requested_by: "ui" } });
      setPre({ busy: false, error: null, line: lineId, name: scName, res: out });
    } catch (e) { setPre((p) => ({ ...p, busy: false, error: e })); }
  }
  async function whatToFix() {
    setFix({ busy: true, data: null, error: null });
    try { setFix({ busy: false, data: (await api(`/twin/bottleneck?line_id=${lineId}&marginal=true`)).what_to_fix_first, error: null }); }
    catch (e) { setFix({ busy: false, data: null, error: e }); }
  }

  const idx = stations.findIndex((s) => s.station_id === sel);
  const selX = idx >= 0 ? stationX(idx, stations.length) : 0;
  const st = idx >= 0 ? stations[idx] : null;
  const sr = st ? byId[st.station_id] : null;
  const utils = stations.map((s) => byId[s.station_id]?.utilization_pct).filter((u) => u != null);
  const avgU = utils.length ? utils.reduce((a, b) => a + b, 0) / utils.length : null;
  const bnName = stations.find((s) => byId[s.station_id]?.is_bottleneck)?.station_name;
  const hotCount = utils.filter((u) => u >= 90).length;

  return (
    <>
      <PageHeader title="Twin view" subtitle="Single line: stations, queues and scenario preview" state={mode} />
      <ApiState loading={model.loading} error={model.error} />
      {cur && (
        <>
          <div className="f3d-toolbar">
            <label className="field"><span>Line</span>
              <select value={lineId} onChange={(e) => { setLine(e.target.value); setSel(null); }}>
                {lines.map((l) => <option key={l.line_id} value={l.line_id}>{l.line_id} ({l.plant_id})</option>)}
              </select>
            </label>
            <div className="seg" role="group" aria-label="State type">
              {["LIVE", "SIMULATED"].map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "LIVE" ? "● LIVE" : "◇ SIMULATED"}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Camera view">
              {[["iso", "Overview"], ["top", "Top"], ["front", "Front"]].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={!sel && view === k} onClick={() => { setSel(null); setView(k); }}>{l}</button>
              ))}
            </div>
            {mode === "SIMULATED" && (
              <>
                <label className="field"><span>Scenario</span>
                  <select value={scName} onChange={(e) => setScName(e.target.value)}>
                    {Object.keys(PRESETS).filter((k) => isSmt || k !== "SMT machine outage").map((k) => <option key={k}>{k}</option>)}
                  </select>
                </label>
                <button type="button" className="primary" disabled={pre.busy} onClick={runScenario}>{pre.busy ? "Simulating…" : "Run on this line"}</button>
                {usePre && <button type="button" className="ghost" onClick={() => setPre({ busy: false, error: null, line: null, name: null, res: null })}>Back to latest stored run</button>}
              </>
            )}
            <button type="button" className="primary" disabled={mode !== "SIMULATED"} onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause" : "▶ Play"}</button>
            <div className="seg" role="group" aria-label="Animation speed">
              {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
            </div>
            <button type="button" className="ghost" onClick={() => { setHour(1); setSel(null); }}>Reset</button>
            {sel && <button type="button" className="ghost" onClick={() => setSel(null)}>Back to full line</button>}
            <button type="button" className="ghost" onClick={() => wrap.current?.requestFullscreen?.()}>Fullscreen</button>
          </div>
          <ApiState loading={mode === "SIMULATED" ? sim.loading : live.loading} error={(mode === "SIMULATED" ? sim.error : live.error) || pre.error} />
          {usePre && <p className="f3d-status" role="status">Preview: <strong>{pre.name}</strong> on {lineId}{pre.res.baseline_delta?.output_units != null && ` · ${pre.res.baseline_delta.output_units >= 0 ? "+" : ""}${fmt(pre.res.baseline_delta.output_units, 0)} units vs baseline`}</p>}
          {mode === "LIVE" && live.data?.line && <p className="f3d-status" role="status">LIVE · OEE {pct(live.data.line.oee * 100)} · availability {pct(live.data.line.availability * 100)} · performance {pct(live.data.line.performance * 100)} · quality {pct(live.data.line.quality * 100)}</p>}
          {mode === "SIMULATED" && !usePre && !sim.loading && !sim.error && shown.length === 0 &&
            <p className="f3d-status">No simulated run yet. Pick a scenario and press Run.</p>}

          <div className="f3d-grid">
            <div ref={wrap} className={`f3d-canvas frame-wrap ${mode === "LIVE" ? "frame-live" : "frame-sim"}`} role="img"
                 aria-label={`3D animated simulation of line ${lineId} with ${stations.length} stations`}>
              <div className="f3d-hud">
                <span className="f3d-chip">{mode === "LIVE" ? "● LIVE" : "◇ SIMULATED"}</span>
                <span className="f3d-chip">{lineId} · {stations.length} stations</span>
                {mode === "SIMULATED" && <span className="f3d-chip">Hour {hr} of {nHours}</span>}
                <span className="f3d-chip">{playing ? `▶ ${speed}×` : "❚❚ Paused"}</span>
              </div>
              <div className="f3d-legend" aria-label="Utilisation legend">
                <span><i style={{ background: "var(--chart-o1)" }} />&lt;50%</span><span><i style={{ background: "var(--chart-o2)" }} />50-75</span>
                <span><i style={{ background: "var(--chart-o3)" }} />75-90</span><span><i style={{ background: "var(--chart-o4)" }} />&ge;90</span>
                <span><i style={{ background: "var(--dr-ink-2)" }} />no data</span>
              </div>
              <SceneLoader show={!ready || model.loading || (mode === "SIMULATED" ? sim.loading : live.loading) || pre.busy} />
              <Canvas shadows onCreated={() => setTimeout(() => setReady(true), 400)} camera={{ position: [10, 10, 14], fov: 45 }} dpr={[1, 2]}>
                <Suspense fallback={null}>
                  <Scene stations={stations} byId={byId} sel={sel} setSel={setSel} running={playing} speed={speed} view={view} tok={tok} selX={selX} />
                </Suspense>
              </Canvas>
            </div>

            <div className="f3d-side">
              {mode === "SIMULATED" && (
                <Card title="Simulated clock" className="detail">
                  <label className="field"><span>Hour {hr} of {nHours} (SIMULATED)</span>
                    <input type="range" min="1" max={nHours} value={hr} onChange={(e) => { setRunning(false); setHour(Number(e.target.value)); }} aria-label="Simulated hour" />
                  </label>
                  <dl>
                    <dt>Output this hour</dt><dd>{point ? `${fmt(point.output_mean, 0)} units` : "n/a"}</dd>
                    <dt>WIP at this hour</dt><dd>{point?.wip_mean != null ? `${fmt(point.wip_mean, 0)} units` : "n/a"}</dd>
                    <dt>Output so far</dt><dd>{series.length ? `${fmt(cumulative, 0)} units` : "n/a"}</dd>
                  </dl>
                </Card>
              )}
              <div className="f3d-kpis" aria-label="Line summary">
                <div className="f3d-kpi"><b>{avgU != null ? `${fmt(avgU, 0)}%` : "n/a"}</b><span>Avg util</span></div>
                <div className="f3d-kpi"><b>{hotCount}</b><span>≥ 90%</span></div>
                <div className="f3d-kpi"><b>{bnName ? "1" : "0"}</b><span>Bottleneck</span></div>
              </div>
              {bnName && <p className="f3d-status" role="status">Bottleneck: <strong>{bnName}</strong></p>}
              <Card title={st ? `${st.station_name} (${st.station_id})` : "Select a machine"} className="detail">
                {!st && <p className="muted-text">Click a machine to inspect it.</p>}
                {st && (
                  <>
                    <div className={`f3d-meter ${(sr?.utilization_pct ?? 0) >= 90 ? "hot" : ""}`} role="img" aria-label={`Utilisation ${pct(sr?.utilization_pct)}`}>
                      <span style={{ width: `${Math.min(100, sr?.utilization_pct ?? 0)}%` }} />
                    </div>
                    <dl>
                      <dt>State</dt><dd>{mode}</dd>

                      <dt>Standard cycle</dt><dd>{st.cycle_sec != null ? `${fmt(st.cycle_sec, 1)} s` : "n/a"}</dd>

                      <dt>Utilisation</dt><dd>{pct(sr?.utilization_pct)}</dd>
                      <dt>Avg queue</dt><dd>{fmt(sr?.avg_queue_units, 1)} units</dd>
                      <dt>Blocked / starved</dt><dd>{pct(sr?.blocked_pct)} / {pct(sr?.starved_pct)}</dd>
                      <dt>Bottleneck</dt><dd>{sr?.is_bottleneck ? "Yes (simulated)" : "No"}</dd>
                    </dl>
                  </>
                )}
                <label className="field"><span>Machine</span>
                  <select value={sel ?? ""} onChange={(e) => setSel(e.target.value || null)}>
                    <option value="">Full line</option>
                    {stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.station_id} {s.station_name}</option>)}
                  </select>
                </label>
              </Card>
            </div>
          </div>

          
          {mode === "SIMULATED" && (
            <Card title="What to fix first (marginal analysis)" actions={<button type="button" className="ghost small" disabled={fix.busy} onClick={whatToFix}>{fix.busy ? "Computing…" : "Compute"}</button>}>
              <p className="muted-text">Gain per 1% cycle-time cut, best first (SIMULATED).</p>
              <ApiState loading={false} error={fix.error} />
              {fix.data && <DataTable
                columns={[{ key: "rank", label: "Rank", num: true }, { key: "station_id", label: "Station" },
                          { key: "g", label: "Gain, units / 1% cycle cut (24 h)", num: true, render: (r) => fmt(r.gain_units_per_pct_cycle_reduction, 1) },
                          { key: "p", label: "Gain %", num: true, render: (r) => pct(r.gain_pct, 2) },
                          { key: "u", label: "Baseline utilisation", num: true, render: (r) => pct(r.baseline_utilization_pct) }]}
                rows={fix.data.map((r) => ({ ...r, id: r.station_id }))} />}
            </Card>
          )}
          {mode === "SIMULATED" && fc.data && (
            <ChartBlock title="Throughput and WIP forecast (baseline, next 24 h)"
                        description={`SIMULATED hourly output and WIP for ${lineId}. Vertical marker = hour shown in 3D.`}
                        columns={[{ key: "hour", label: "Hour", num: true }, { key: "output_mean", label: "Output mean", num: true, render: (r) => fmt(r.output_mean, 0) },
                                  { key: "output_p05", label: "p05", num: true, render: (r) => fmt(r.output_p05, 0) }, { key: "output_p95", label: "p95", num: true, render: (r) => fmt(r.output_p95, 0) },
                                  { key: "wip_mean", label: "WIP", num: true, render: (r) => fmt(r.wip_mean, 0) }]}
                        rows={fc.data.series.map((r) => ({ ...r, id: r.hour }))}>
              <ResponsiveContainer>
                <LineChart data={fc.data.series}>
                  <CartesianGrid stroke="var(--dr-border)" />
                  <XAxis dataKey="hour" tick={AXIS} stroke="var(--chart-axis)" />
                  <YAxis yAxisId="o" tick={AXIS} stroke="var(--chart-axis)" />
                  <YAxis yAxisId="w" orientation="right" tick={AXIS} stroke="var(--chart-axis)" />
                  <Tooltip contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--dr-border)", color: "var(--chart-label)", fontFamily: "inherit" }} />
                  <Legend formatter={(v) => <span style={{ color: "var(--chart-label)" }}>{v}</span>} wrapperStyle={{ fontFamily: "inherit" }} />
                  {!usePre && <ReferenceLine yAxisId="o" x={hr} stroke="var(--chart-c3)" strokeWidth={2} />}
                  <Line yAxisId="o" dataKey="output_mean" name="Output / h (SIMULATED)" stroke="var(--chart-c2)" dot={false} strokeWidth={2} />
                  <Line yAxisId="o" dataKey="output_p05" name="p05" stroke="var(--chart-c2)" dot={false} strokeDasharray="2 4" />
                  <Line yAxisId="o" dataKey="output_p95" name="p95" stroke="var(--chart-c2)" dot={false} strokeDasharray="2 4" />
                  <Line yAxisId="w" dataKey="wip_mean" name="WIP units (SIMULATED)" stroke="var(--chart-c3)" dot={false} strokeWidth={2} strokeDasharray="6 4" />
                </LineChart>
              </ResponsiveContainer>
            </ChartBlock>
          )}
        </>
      )}
    </>
  );
}
