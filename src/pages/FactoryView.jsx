import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useApi, fmt, go, useRoute, dt } from "../api.js";
import { ApiState, Loader, PageHeader, StateBanner, StatusBadge } from "../components.jsx";
import { useTokens } from "../three/Scene3D.jsx";
import { AREA_LABEL, FactoryScene, factoryLayout, machineWorld, stationWorld, zoneWorld } from "../three/Factory3D.jsx";
import MachinePanel from "./MachinePanel.jsx";
import "./factory3d.css";
const STATUSES = ["NORMAL", "WARNING", "ATTENTION", "CRITICAL", "OFFLINE"];

// Factory floor 3D with dashboard panels, laid out like a factory control view. Every figure comes from the backend:
//   GET /api/twin/model                        -> plants, lines, stations (area, routing order, cycle) and their machines (dim_machine)
//   GET /api/twin/bottleneck?line_id=          -> SIMULATED station results (utilisation, queue, bottleneck) of the latest stored run
//   GET /api/forecast/throughput-wip?line_id=  -> SIMULATED hourly output per line (trend panel)
//   GET /api/twin/live-state?line_id=          -> LIVE MES (fact_hourly_production): availability, performance, quality, OEE, downtime by reason, data age.
//   GET /api/twin/machine-signals              -> LIVE per machine (data_factory telemetry): state, temperature, vibration, current, rpm, anomalies, downtime events, work orders
//   GET /api/twin/plant-context?plant_id=      -> LIVE workforce, warehouse stock, shipments, energy (24 h) and station quality pass rate
//     MES is line level only, so in LIVE mode every station is tinted by its own line's OEE (SMT zone = SMT line, other zones = FAL line).
// Not shown, because the data holds none of it: OEE, today's output, robot/camera/server counts, alerts, running/stopped status.
// The building, racks, forklift, operators and truck are illustrative (no CAD layout in the data bundle).
const SPEEDS = [0.5, 1, 2, 4];
const LINE_COLOURS = ["var(--sky)", "var(--brand-orange)", "var(--cyan)", "var(--brand-purple)"];
const REASON = { EQUIPMENT_FAULT: "Equipment fault", FEEDER_JAM: "Feeder jam", MICRO_STOP: "Micro stop", CHANGEOVER: "Changeover", NO_MATERIAL: "No material" };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function Minimap({ layout, sel }) {
  const W = layout.width, D = 38;
  return (
    <svg viewBox={`${-W / 2} ${-D / 2} ${W} ${D}`} role="img" aria-label="Factory layout, zones" className="fh-map">
      <rect x={-W / 2} y={-D / 2} width={W} height={D} className="fh-map-hall" />
      {layout.zones.map((q) => (
        <rect key={q.area} x={q.x - q.w / 2} y={q.z - q.d / 2} width={q.w} height={q.d} className={`fh-map-zone ${sel === q.area ? "on" : ""}`} />
      ))}
    </svg>
  );
}

export default function FactoryView({ onOpenLine }) {
  const model = useApi("/twin/model");
  const tok = useTokens();
  const [plantId, setPlantId] = useState("");
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState("iso");
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState("LIVE");
  const route = useRoute();
  const mach = useApi("/factory/machines");
  const [selMachine, setSelMachine] = useState(route.params.machine ?? null);
  const [lineFilter, setLineFilter] = useState("");
  const [zoneFocus, setZoneFocus] = useState("");
  useEffect(() => { if (route.params.machine) { setSelMachine(route.params.machine); setSel(null); setZoneFocus(""); } }, [route.params.machine]);
  const [live, setLive] = useState({ loading: false, error: null, byLine: {}, signals: {}, ctx: null, asOf: null });
  const [res, setRes] = useState({ loading: false, error: null, byLine: {}, trend: [] });
  const wrap = useRef();
  const plants = useMemo(() => model.data?.plants ?? [], [model.data]);
  const allMachines = mach.data?.machines ?? [];
  const deepMachine = allMachines.find((m) => m.machine_id === selMachine);
  // a deep-linked machine opens its line's plant
  const deepPlant = deepMachine && plants.find((p) => p.lines.some((l) => l.line_id === deepMachine.line_id));
  const plant = plants.find((p) => p.plant_id === plantId) ?? deepPlant ?? plants[0];
  const lines = useMemo(() => plant?.lines ?? [], [plant]);
  const stations = useMemo(() => {
    const seen = new Set();
    return lines.flatMap((l) => l.stations).filter((s) => !seen.has(s.station_id) && seen.add(s.station_id));
  }, [lines]);

  // station results first (colours, panels); the 24 h forecast is slower, so it loads separately and only fills the trend panel
  useEffect(() => {
    if (!lines.length) return undefined;
    let dead = false;
    setRes({ loading: true, error: null, byLine: {}, trend: [], trendLoading: true });
    Promise.all(lines.map((l) => api(`/twin/bottleneck?line_id=${l.line_id}`).then((b) => [l.line_id, b.stations ?? []])))
      .then((all) => { if (!dead) setRes((r) => ({ ...r, loading: false, byLine: Object.fromEntries(all) })); })
      .catch((e) => { if (!dead) setRes((r) => ({ ...r, loading: false, error: e })); });
    Promise.all(lines.map((l) => api(`/forecast/throughput-wip?line_id=${l.line_id}&horizon_hours=24`).then((f) => [l.line_id, f.series ?? []])))
      .then((all) => {
        if (dead) return;
        const trend = [];
        all.forEach(([id, series]) => series.forEach((r) => { (trend[r.hour - 1] ??= { hour: r.hour })[id] = Math.round(r.output_mean); }));
        setRes((r) => ({ ...r, trend: trend.filter(Boolean), trendLoading: false }));
      })
      .catch(() => { if (!dead) setRes((r) => ({ ...r, trendLoading: false })); });
    return () => { dead = true; };
  }, [lines]);

  // LIVE (MES) data, fetched when LIVE mode is opened or the plant changes
  useEffect(() => {
    if (mode !== "LIVE" || !lines.length) return undefined;
    let dead = false;
    setLive({ loading: true, error: null, byLine: {}, signals: {}, ctx: null, asOf: null });
    Promise.all([
      Promise.all(lines.map((l) => api(`/twin/live-state?line_id=${l.line_id}`).then((d) => [l.line_id, d]))),
      api("/twin/machine-signals"),
      api(`/twin/plant-context?plant_id=${plant.plant_id}`),
    ])
      .then(([all, sig, ctx]) => { if (!dead) setLive({ loading: false, error: null, byLine: Object.fromEntries(all), signals: sig.machines ?? {}, ctx, asOf: sig.as_of }); })
      .catch((e) => { if (!dead) setLive({ loading: false, error: e, byLine: {}, signals: {}, ctx: null, asOf: null }); });
    return () => { dead = true; };
  }, [mode, lines]);

  const isLive = mode === "LIVE";
  const stationLine = useMemo(() => Object.fromEntries(lines.flatMap((l) => l.stations.map((s) => [s.station_id, l.line_id]))), [lines]);
  const simById = useMemo(() => Object.fromEntries(Object.values(res.byLine).flat().map((s) => [s.station_id, s])), [res.byLine]);
  const liveById = useMemo(() => Object.fromEntries(stations.map((s) => {
    const oee = live.byLine[stationLine[s.station_id]]?.line?.oee;
    const ms = (s.machines ?? []).map((m) => live.signals[m.machine_id]).filter(Boolean);
    const worst = ["DOWN", "SETUP", "IDLE", "RUNNING"].find((k) => ms.some((m) => m.machine_state === k));
    return [s.station_id, { station_id: s.station_id, utilization_pct: oee != null ? oee * 100 : null, mstate: worst ? { state: worst, anomaly: ms.some((m) => m.is_anomaly || m.anomalies_24h > 0) } : null }];
  })), [stations, stationLine, live.byLine]);
  const byId = isLive ? liveById : simById;
  const liveLines = lines.map((l) => ({ id: l.line_id, ...(live.byLine[l.line_id]?.line ?? {}), age: live.byLine[l.line_id]?.data_age_hours }));
  const avgOee = mean(liveLines.map((l) => l.oee).filter((x) => x != null));
  const ageH = Math.max(...liveLines.map((l) => l.age ?? 0), 0);
  const downtimeMin = liveLines.reduce((n, l) => n + (l.downtime_min ?? 0), 0);
  const reasons = Object.keys(REASON).map((k) => ({ k, min: 0 }));
  lines.forEach((l) => (live.byLine[l.line_id]?.downtime_by_reason ?? []).forEach((r) => { const x = reasons.find((q) => q.k === r.downtime_reason); if (x) x.min += r.minutes; }));
  const maxReason = Math.max(...reasons.map((r) => r.min), 1);
  const ctx = live.ctx;
  const present = (ctx?.workforce?.rows ?? []).filter((r) => r.attendance_status === "PRESENT").reduce((n, r) => n + r.n, 0);
  const rostered = (ctx?.workforce?.rows ?? []).reduce((n, r) => n + r.n, 0);
  const kwh = (ctx?.energy?.areas ?? []).reduce((n, a) => n + Number(a.kwh), 0);
  const fg = (ctx?.inventory?.warehouses ?? []).find((w) => w.warehouse_id.startsWith("FG"));
  const shipCount = (k) => Number((ctx?.shipments ?? []).find((x) => x.shipment_status === k)?.n ?? 0);
  const qBy = Object.fromEntries((ctx?.quality_by_station ?? []).map((q) => [q.station_id, q]));
  const dq = (model.data?.data_quality_flags ?? []).filter((f) => lines.some((l) => l.line_id === f.line_id));
  const avg = mean(stations.map((s) => simById[s.station_id]?.utilization_pct).filter((u) => u != null));
  const bns = stations.filter((s) => simById[s.station_id]?.is_bottleneck);
  const machines = stations.reduce((n, s) => n + (s.machines?.length ?? 0), 0);
  const st = stations.find((s) => s.station_id === sel);
  const sr = st ? simById[st.station_id] : null;
  const stLine = st ? liveLines.find((l) => l.id === stationLine[st.station_id]) : null;
  const layout = useMemo(() => factoryLayout(stations), [stations]);
  const plantMachines = allMachines.filter((m) => lines.some((l) => l.line_id === m.line_id));
  const curMachine = plantMachines.find((m) => m.machine_id === selMachine) ?? null;
  const selPos = curMachine ? machineWorld(layout.zones, curMachine) : zoneFocus ? zoneWorld(layout.zones, zoneFocus) : st ? stationWorld(layout.zones, st.station_id) : null;
  const counts = Object.fromEntries(STATUSES.map((k) => [k, plantMachines.filter((m) => m.status === k).length]));
  const openWo = plantMachines.reduce((a, m) => a + (m.metrics?.maintenance?.open_work_orders ?? 0), 0);
  const rm = (ctx?.inventory?.warehouses ?? []).find((w) => w.warehouse_id.startsWith("RM"));
  const pickMachine = (id) => { setSelMachine(id); setSel(null); setZoneFocus(""); };
  const run = mach.data?.run;
  const wait = (isLive ? live.loading : res.loading) ? "loading…" : "n/a";

  return (
    <>
      <PageHeader title="Digital Twin – 3D Factory" subtitle="Mobile phone plant: every machine is a real record, coloured by the latest agent run. Click a machine." state={mode} />
      <StateBanner type="LIVE">
        Machine colours = status from agent run {run ? `${mach.data.run_id.slice(0, 8)} (completed ${dt(run.finished_at)})` : "(none yet: run the agent)"}.
        Sensor values are from a historical export as of {run?.data_as_of ? String(run.data_as_of).replace("T", " ").slice(0, 16) : "31 Oct 2026"}, not a live stream.
        Health is a rule-based index (CALCULATED). Raw Material Storage and Maintenance Area are illustrative zones.
      </StateBanner>
      {!isLive && <StateBanner type="SIMULATED">Station colours, queues and bottlenecks are SIMULATED (stored twin runs); machine colours stay the agent status.</StateBanner>}
      <ApiState loading={model.loading} error={model.error || res.error || live.error || mach.error} label="Building the 3D factory" hint="Loading stations, the 15 machines and their latest agent status." rows={4} />
      {plant && (
        <>
          <div className="f3d-toolbar">
            <label className="field"><span>Plant</span>
              <select value={plant.plant_id} onChange={(e) => { setPlantId(e.target.value); setSel(null); }}>
                {plants.map((p) => <option key={p.plant_id} value={p.plant_id}>{p.plant_name ?? p.plant_id}</option>)}
              </select>
            </label>
            <div className="seg" role="group" aria-label="State type">
              {["SIMULATED", "LIVE"].map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "LIVE" ? "● LIVE (MES)" : "◇ SIMULATED"}</button>)}
            </div>
            <div className="seg" role="group" aria-label="Camera view">
              {[["iso", "Overview"], ["top", "Top"]].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={!sel && view === k} onClick={() => { setSel(null); setView(k); }}>{l}</button>
              ))}
            </div>
            <button type="button" className="primary" onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause" : "▶ Play"}</button>
            <div className="seg" role="group" aria-label="Animation speed">
              {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
            </div>
            <label className="field"><span>Line</span>
              <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)}>
                <option value="">All lines</option>{lines.map((l) => <option key={l.line_id}>{l.line_id}</option>)}
              </select>
            </label>
            <label className="field"><span>Section</span>
              <select value={zoneFocus} onChange={(e) => { setZoneFocus(e.target.value); setSel(null); setSelMachine(null); }}>
                <option value="">Whole factory</option>{layout.zones.map((z) => <option key={z.area} value={z.area}>{AREA_LABEL[z.area] ?? z.area}</option>)}
              </select>
            </label>
            {(sel || selMachine || zoneFocus) && <button type="button" className="ghost" onClick={() => { setSel(null); setSelMachine(null); setZoneFocus(""); }}>Back to factory</button>}
            {onOpenLine && <button type="button" className="ghost" onClick={onOpenLine}>Single-line view</button>}
            <button type="button" className="ghost" onClick={() => wrap.current?.requestFullscreen?.()}>Fullscreen</button>
          </div>

          <div ref={wrap} className={`f3d-canvas fh-stage frame-wrap ${isLive ? "frame-live" : "frame-sim"} ${curMachine ? "has-mpanel" : ""}`} role="group" aria-label={`3D factory floor of ${plant.plant_name ?? plant.plant_id}, ${stations.length} stations in ${layout.zones.length} zones`}>
            {(model.loading || mach.loading) && <Loader variant="overlay" label="Building the 3D factory" hint="Loading stations, the 15 machines and their latest agent status." />}
            <Canvas shadows camera={{ position: [-20, 30, 50], fov: 42 }} dpr={[1, 2]}>
              <Suspense fallback={null}>
                <FactoryScene stations={stations} byId={byId} sel={sel} setSel={(x) => { setSel(x); if (x) { setSelMachine(null); setZoneFocus(""); } }} running={running} speed={speed} tok={tok} view={view} selPos={selPos}
                  plantName={plant.plant_name} machines={plantMachines} selMachine={selMachine} onSelectMachine={pickMachine} lineFilter={lineFilter}
                  maintenance={`${openWo} open work orders on ${plantMachines.length} machines (CMMS)`}
                  rawStock={rm ? `RM-WH-01: ${fmt(rm.on_hand, 0)} on hand (${ctx.inventory.snapshot_date})` : null} />
              </Suspense>
            </Canvas>

            <section className="fh-panel fh-tl" aria-label="Factory overview">
              <h3>Factory overview</h3>
              <dl>
                <dt>Production lines</dt><dd>{lines.length}</dd>
                <dt>Stations</dt><dd>{stations.length}</dd>
                <dt>Machines</dt><dd>{machines}</dd>
                {isLive ? (
                  <><dt>Avg OEE (MES)</dt><dd>{avgOee != null ? `${fmt(avgOee * 100, 0)}%` : wait}</dd>
                    <dt>Downtime (24 h)</dt><dd>{live.loading ? wait : `${fmt(downtimeMin, 0)} min`}</dd>
                    <dt>Data age</dt><dd>{live.loading ? wait : `${fmt(ageH, 0)} h${ageH > 24 ? " (stale)" : ""}`}</dd></>
                ) : (
                  <><dt>Avg utilisation</dt><dd>{avg != null ? `${fmt(avg, 0)}%` : wait}</dd>
                    <dt>Bottlenecks</dt><dd>{res.loading ? wait : bns.length}</dd></>
                )}
              </dl>
              <span className="fh-tag">{isLive ? "● LIVE (MES)" : "◇ SIMULATED"}</span>
            </section>

            <section className="fh-panel fh-tr" aria-label="Line status">
              <h3>Line status</h3>
              <dl>
                {lines.map((l) => {
                  const u = mean((res.byLine[l.line_id] ?? []).map((x) => x.utilization_pct).filter((x) => x != null));
                  const ll = liveLines.find((x) => x.id === l.line_id);
                  return <Fragment key={l.line_id}><dt>{l.line_id}</dt><dd>{isLive ? (ll?.oee != null ? `OEE ${fmt(ll.oee * 100, 0)}%` : wait) : (u != null ? `${fmt(u, 0)}% util` : wait)}</dd></Fragment>;
                })}
                <dt>Model</dt><dd>{model.data?.validation_status ?? "n/a"}</dd>
              </dl>
              <span className="fh-tag">{isLive ? "● LIVE (MES)" : "◇ SIMULATED"}</span>
            </section>

            {isLive ? (
              <section className="fh-panel fh-bl" aria-label="Downtime by reason">
                <h3>Downtime by reason (24 h reported)</h3>
                <ul className="fh-bars">
                  {reasons.map((r) => (
                    <li key={r.k}><span>{REASON[r.k]}</span><i style={{ width: `${(r.min / maxReason) * 100}%` }} /><b>{fmt(r.min, 0)} min</b></li>
                  ))}
                </ul>
                <span className="fh-tag">● LIVE (MES) · {lines.map((l) => l.line_id).join(", ")}</span>
              </section>
            ) : (
              <section className="fh-panel fh-bl" aria-label="Simulated hourly output">
                <h3>Output trend (24 h)</h3>
                <div className="fh-chart" role="img" aria-label="Simulated hourly output per line over 24 hours">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={res.trend} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke="var(--sky)" strokeOpacity={0.18} vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: "var(--sky)", fontSize: 10 }} stroke="var(--sky)" />
                      <YAxis tick={{ fill: "var(--sky)", fontSize: 10 }} stroke="var(--sky)" />
                      <Tooltip />
                      {lines.map((l, i) => <Line key={l.line_id} type="monotone" dataKey={l.line_id} stroke={LINE_COLOURS[i % 4]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <span className="fh-tag">{res.trendLoading ? <Loader variant="inline" label="Loading forecast" /> : `◇ SIMULATED units/h · ${lines.map((l) => l.line_id).join(", ")}`}</span>
              </section>
            )}

            {isLive && (
              <section className="fh-panel fh-ctx" aria-label="Plant context">
                <h3>Plant context</h3>
                <dl>
                  <dt>Operators present</dt><dd>{ctx ? `${present} of ${rostered}` : wait}</dd>
                  <dt>Energy (24 h)</dt><dd>{ctx ? `${fmt(kwh, 0)} kWh` : wait}</dd>
                  <dt>FG stock on hand</dt><dd>{fg ? fmt(fg.on_hand, 0) : wait}</dd>
                  <dt>Shipments delivered</dt><dd>{ctx ? shipCount("DELIVERED") : wait}</dd>
                </dl>
                <span className="fh-tag">● LIVE (factory export){ctx?.workforce?.work_date ? ` · ${ctx.workforce.work_date}` : ""}</span>
              </section>
            )}

            <section className="fh-panel f3d-status" aria-label="Machine status">
              <h3>Machine status</h3>
              <ul className="f3d-stlegend">
                {STATUSES.map((k) => (
                  <li key={k}><StatusBadge status={k} /><b>{counts[k]}</b></li>
                ))}
              </ul>
              <ul className="f3d-mlist">
                {[...plantMachines].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)).map((m) => (
                  <li key={m.machine_id}><button type="button" className={selMachine === m.machine_id ? "on" : ""} onClick={() => pickMachine(m.machine_id)}>
                    <span className={`f3d-dot mt-${(m.status ?? "none").toLowerCase()}`} />{m.machine_id}<span className="muted-text">{m.risk_score != null ? ` risk ${fmt(m.risk_score, 0)}` : ""}</span>
                  </button></li>
                ))}
              </ul>
              {!run && <button type="button" className="primary" onClick={() => go("agent")}>Run the agent</button>}
              <span className="fh-tag">● LIVE · agent status</span>
            </section>

            {curMachine && <MachinePanel key={curMachine.machine_id} m={curMachine} onClose={() => setSelMachine(null)} />}

            <div className="fh-tiles" aria-label="Plant counts">
              {[["Lines", lines.length], ["Zones", layout.zones.length], ["Stations", stations.length], ["Machines", machines]].map(([k, v]) => (
                <div key={k} className="fh-tile"><b>{v}</b><span>{k}</span></div>
              ))}
            </div>

            <section className="fh-panel fh-br" aria-label="Factory layout">
              <h3>Factory layout</h3>
              <Minimap layout={layout} sel={st?.process_area} />
              <span className="fh-tag">Illustrative plan</span>
            </section>

            {st && !curMachine && (
              <section className="fh-panel fh-sel" aria-label="Selected station">
                <h3>{st.station_name}</h3>
                <dl>
                  <dt>Zone</dt><dd>{AREA_LABEL[st.process_area] ?? st.process_area}</dd>
                  <dt>Critical control point</dt><dd>{st.critical_control_point ? "yes" : "no"}</dd>
                  <dt>Quality gate</dt><dd>{st.quality_gate ? "yes" : "no"}</dd>
                  <dt>Setup (routing)</dt><dd>{st.setup_min != null ? `${fmt(st.setup_min, 0)} min` : "n/a"}</dd>
                  <dt>Cycle (routing)</dt><dd>{st.cycle_sec_by_product ? Object.entries(st.cycle_sec_by_product).map(([p, c]) => `${p.replace("SPH-", "")}: ${fmt(c, 0)} s`).join(" · ") : "n/a"}</dd>
                  {isLive ? (
                    <><dt>Line OEE (MES)</dt><dd>{stLine?.oee != null ? `${fmt(stLine.oee * 100, 0)}% (${stLine.id})` : "n/a"}</dd>
                      <dt>A / P / Q (MES)</dt><dd>{stLine?.oee != null ? `${fmt(stLine.availability * 100, 0)} / ${fmt(stLine.performance * 100, 0)} / ${fmt(stLine.quality * 100, 0)} %` : "n/a"}</dd>
                      <dt>Quality pass rate</dt><dd>{qBy[st.station_id] ? `${fmt((qBy[st.station_id].passed / qBy[st.station_id].inspections) * 100, 1)}% of ${fmt(qBy[st.station_id].inspections, 0)} inspections` : "no inspections"}</dd></>
                  ) : (
                    <><dt>Utilisation</dt><dd>{sr?.utilization_pct != null ? `${fmt(sr.utilization_pct, 0)}%` : "n/a"}</dd>
                      <dt>Avg queue</dt><dd>{sr?.avg_queue_units != null ? `${fmt(sr.avg_queue_units, 1)} units` : "n/a"}</dd>
                      <dt>Bottleneck</dt><dd>{sr?.is_bottleneck ? "yes" : "no"}</dd></>
                  )}
                </dl>
                {st.machines?.length > 0 && (
                  <ul className="fh-mach">
                    {st.machines.map((m) => {
                      const g = isLive ? live.signals[m.machine_id] : null;
                      const tot = g ? Object.values(g.state_mix_24h).reduce((a, b) => a + b, 0) : 0;
                      return (
                        <li key={m.machine_id}>
                          <b>{m.machine_name}</b> · {m.machine_type} · criticality {m.criticality}
                          {g && (
                            <span className="fh-sig">
                              {g.machine_state} · {fmt(g.temperature_c, 0)} °C · {fmt(g.vibration_mm_s, 1)} mm/s · {fmt(g.motor_current_a, 1)} A · {fmt(g.rpm, 0)} rpm
                              {tot > 0 && ` · 24 h running ${fmt(((g.state_mix_24h.RUNNING ?? 0) / tot) * 100, 0)}%`}
                              {` · anomalies 24 h: ${g.anomalies_24h} · downtime events ${g.downtime.events} (${g.downtime.open_events} open) · work orders ${Object.entries(g.work_orders).map(([k, n]) => `${n} ${k.toLowerCase().replace("_", " ")}`).join(", ") || "none"}`}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <span className="fh-tag">{isLive ? "● LIVE (MES, line level)" : "◇ SIMULATED"} · routing standards are not measurements</span>
              </section>
            )}
          </div>
          {dq.length > 0 && <p className="muted-text">Data quality: {dq.map((f) => `${f.machine_id} is listed under ${f.listed_plant} but its line ${f.line_id} belongs to ${f.line_plant}`).join("; ")}. Shown with its line, as in the source (docs/DATA_QUALITY.md).</p>}
        </>
      )}
    </>
  );
}
