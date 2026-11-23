import { useMemo, useState } from "react";
import { api, useApi, fmt, pct } from "../api.js";
import { ApiState, Card, Field, ModelBar, PageHeader, StateBadge, StateBanner, Tile, DataTable } from "../components.jsx";

export const SCENARIOS = ["Baseline", "Demand +15%", "Additional shift", "Buffer increase", "Cycle time improvement", "SMT machine outage", "Custom"];

// Params understood by POST /api/scenarios/run (body: {scenario_name, line_id, replications, horizon_hours, params, requested_by}).
// Ranges are validated again by the server (422).
const FIELDS = {
  "Demand +15%": [],
  "Additional shift": [{ k: "extra_shift_hours", label: "Extra shift hours", min: 0, max: 8, step: 1, def: 8, hint: "Labour/shift assumption is reported with the result" }],
  "Buffer increase": [{ k: "buffer_factor", label: "Buffer capacity factor", min: 1, max: 5, step: 0.5, def: 2, hint: "Multiplies every buffer" }],
  "Cycle time improvement": [{ k: "cycle_improvement_pct", label: "Cycle time reduction %", min: 0, max: 50, step: 1, def: 10 }, { k: "stations", label: "Station ids (comma separated)", text: true, def: "", hint: "Empty = bottleneck station" }],
  "SMT machine outage": [{ k: "outage_station_id", label: "Station offline", text: true, def: "ST-SMT-040" }, { k: "outage_hours", label: "Outage hours", min: 1, max: 48, step: 1, def: 4 }],
  Custom: [
    { k: "demand_change_pct", label: "Demand change %", min: -50, max: 50, step: 1, def: 0 },
    { k: "capacity_change_pct", label: "Capacity change %", min: -50, max: 50, step: 1, def: 0 },
    { k: "buffer_factor", label: "Buffer capacity factor", min: 0.5, max: 5, step: 0.5, def: 1 },
  ],
  Baseline: [],
};

const sign = (v) => (v > 0 ? "delta-up" : v < 0 ? "delta-down" : "delta-flat");
const Delta = ({ v, d = 1, unit = "" }) => (v == null ? <span>n/a</span> : <span className={`delta ${sign(v)}`}>{v > 0 ? "+" : ""}{fmt(v, d)}{unit}</span>);

export default function ScenarioLab() {
  const model = useApi("/twin/model");
  const lines = useMemo(() => (model.data?.plants ?? []).flatMap((p) => p.lines.map((l) => l.line_id)), [model.data]);
  const [line, setLine] = useState("");
  const [name, setName] = useState("Baseline");
  const [vals, setVals] = useState({});
  const [reps, setReps] = useState(30);
  const [horizon, setHorizon] = useState(24);
  const [state, setState] = useState({ busy: false, error: null, run: null, msg: null });
  const fields = FIELDS[name] ?? [];
  const lineId = line || lines[0];

  const get = (f) => vals[`${name}.${f.k}`] ?? f.def;
  const invalid = fields.find((f) => !f.text && (Number(get(f)) < f.min || Number(get(f)) > f.max || Number.isNaN(Number(get(f)))));

  async function run() {
    setState({ busy: true, error: null, run: null, msg: null });
    const params = Object.fromEntries(fields.map((f) => [f.k, f.text ? get(f) : Number(get(f))]));
    try {
      const out = await api("/scenarios/run", { method: "POST", body: { scenario_name: name, line_id: lineId, replications: Number(reps), horizon_hours: Number(horizon), params, requested_by: "ui" } });
      setState({ busy: false, error: null, run: out, msg: null });
    } catch (e) { setState({ busy: false, error: e, run: null, msg: null }); }
  }
  async function submit() {
    try {
      const out = await api(`/scenarios/${state.run.run_id}/submit-review`, { method: "POST", body: {} });
      setState((s) => ({ ...s, run: { ...s.run, status: out.status ?? "PENDING_REVIEW" }, msg: "Submitted for engineering review. A human reviewer decides; nothing changes in the plant." }));
    } catch (e) { setState((s) => ({ ...s, error: e })); }
  }

  const r = state.run;
  const c = r?.confidence;
  const bd = r?.baseline_delta;
  return (
    <>
      <PageHeader title="Scenario lab" subtitle="Run what-if scenarios on the twin before any physical change" state="SIMULATED" />
      <StateBanner type="SIMULATED" />
      <ModelBar meta={r ?? model.data} />
      <ApiState loading={model.loading} error={model.error} />
      <Card title="Define scenario">
        <div className="row">
          <Field label="Line"><select value={lineId ?? ""} onChange={(e) => setLine(e.target.value)}>{lines.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Scenario"><select value={name} onChange={(e) => setName(e.target.value)}>{SCENARIOS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          {fields.map((f) => (
            <Field key={f.k} label={f.label} hint={f.text ? f.hint : `${f.min} to ${f.max}${f.hint ? ". " + f.hint : ""}`}>
              <input type={f.text ? "text" : "number"} min={f.min} max={f.max} step={f.step} value={get(f)} aria-invalid={!f.text && invalid?.k === f.k}
                     onChange={(e) => setVals((v) => ({ ...v, [`${name}.${f.k}`]: e.target.value }))} />
            </Field>
          ))}
          <Field label="Replications" hint="Seeded; 30 default"><input type="number" min="1" max="200" value={reps} onChange={(e) => setReps(e.target.value)} /></Field>
          <Field label="Horizon (hours)"><input type="number" min="1" max="720" value={horizon} onChange={(e) => setHorizon(e.target.value)} /></Field>
          <button type="button" className="primary" disabled={state.busy || !lineId || !!invalid} onClick={run}>{state.busy ? "Simulating…" : "Run simulation"}</button>
        </div>
        {invalid && <p className="note" role="alert">{invalid.label} must be between {invalid.min} and {invalid.max}.</p>}
      </Card>
      <ApiState loading={false} error={state.error} />
      {r && (
        <>
          <div className="row" style={{ alignItems: "center" }}>
            <StateBadge type={r.state_type ?? "SIMULATED"} />
            <span className="badge v-none">Status: {r.status}</span>
            <span className="badge v-warn"><span aria-hidden="true">{"⚠"}</span> Approval required</span>
            <span className="muted-text" style={{ margin: 0 }}>Turnaround {fmt(r.turnaround_ms)} ms</span>
          </div>
          <div className="grid cols-5">
            <Tile label="Predicted output" value={fmt(r.predicted_output_units)} unit="units" hint={c ? `90% band ${fmt(c.band_low)} to ${fmt(c.band_high)}` : undefined} state="SIMULATED" />
            <Tile label="Predicted WIP" value={fmt(r.predicted_wip_units, 1)} unit="units" state="SIMULATED" />
            <Tile label="Utilisation" value={pct(r.predicted_utilization_pct)} state="SIMULATED" />
            <Tile label="Bottleneck" value={r.bottleneck_station_id ?? "n/a"} state="SIMULATED" />
            <Tile label="Confidence" value={`${fmt(c?.score)}/100`} hint={`Validation: ${r.validation_status ?? "n/a"}`} state="SIMULATED" />
          </div>
          <div className="grid cols-2">
            <Card title="Delta vs Baseline (same line, same calibration)">
              <dl className="detail" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 13 }}>
                <dt>Output</dt><dd><Delta v={bd?.output_units} d={0} /> units</dd>
                <dt>Throughput improvement</dt><dd><Delta v={bd?.throughput_improvement_pct} unit="%" /></dd>
                <dt>WIP</dt><dd><Delta v={bd?.wip_units} /> units</dd>
                <dt>Utilisation</dt><dd><Delta v={bd?.utilization_pct} unit=" pts" /></dd>
                <dt>Output per hour</dt><dd><Delta v={bd?.output_per_hour_change_pct} unit="%" /></dd>
                <dt>Backlog (unserved demand)</dt><dd><Delta v={bd?.backlog_units} d={0} /> units</dd>
                <dt>Bottleneck shift</dt><dd>{bd?.bottleneck_shift ?? "n/a"}</dd>
              </dl>
            </Card>
            <Card title="Confidence components">
              {c?.components
                ? <DataTable columns={[{ key: "k", label: "Component" }, { key: "v", label: "Value", num: true }]} rows={Object.entries(c.components).map(([k, v]) => ({ id: k, k: k.replaceAll("_", " "), v: typeof v === "number" ? fmt(v, 2) : String(v) }))} />
                : <p>No components returned.</p>}
            </Card>
          </div>
          <Card title="Station results (SIMULATED)">
            <DataTable
              columns={[{ key: "station_id", label: "Station" },
                        { key: "u", label: "Utilisation", num: true, render: (s) => pct(s.utilization_pct) },
                        { key: "q", label: "Avg queue (units)", num: true, render: (s) => fmt(s.avg_queue_units, 1) },
                        { key: "w", label: "Avg wait (s)", num: true, render: (s) => fmt(s.avg_wait_sec, 0) },
                        { key: "b", label: "Blocked", num: true, render: (s) => pct(s.blocked_pct) },
                        { key: "s", label: "Starved", num: true, render: (s) => pct(s.starved_pct) },
                        { key: "n", label: "", render: (s) => (s.is_bottleneck ? "Bottleneck" : "") }]}
              rows={(r.station_results ?? []).map((s) => ({ ...s, id: s.station_id }))} />
          </Card>
          <Card title="Assumptions used in this run">
            <ul>{(r.assumptions ?? []).map((a, i) => <li key={i}>{typeof a === "string" ? a : a.text ?? JSON.stringify(a)}</li>)}</ul>
          </Card>
          <div className="row" style={{ alignItems: "center" }}>
            <button type="button" className="primary" disabled={r.status !== "SIMULATED"} onClick={submit}>Submit for engineering review</button>
            <span className="muted-text" style={{ margin: 0 }}>{state.msg ?? "Sends a recommendation to a human reviewer. It does not change the plant."}</span>
          </div>
        </>
      )}
    </>
  );
}
