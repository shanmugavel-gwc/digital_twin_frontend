import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useApi, fmt, pct } from "../api.js";
import { ApiState, AXIS, Card, ChartBlock, DataTable, ModelBar, PageHeader, SERIES, StateBadge, StateBanner } from "../components.jsx";

// GET /api/scenarios -> { items:[run...] } ; POST /api/scenarios/compare {run_ids} -> { runs:[run...], assumptions, ... }
// GET /api/scenarios/history -> { state_type, items:[{scenario_id, scenario_name, line_id, plant_id_as_stored, plant_matches_line,
//   predicted_output_units, actual_output_comparison_units, stored_error_pct, recomputed_error_pct, ...}] }
export default function Compare() {
  const list = useApi("/scenarios");
  const hist = useApi("/scenarios/history");
  const [picked, setPicked] = useState([]);
  const [cmp, setCmp] = useState({ data: null, error: null, busy: false });

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 6 ? [...p, id] : p));
  async function compare() {
    setCmp({ data: null, error: null, busy: true });
    try { setCmp({ data: await api("/scenarios/compare", { method: "POST", body: { run_ids: picked } }), error: null, busy: false }); }
    catch (e) { setCmp({ data: null, error: e, busy: false }); }
  }
  const runs = cmp.data?.runs ?? [];
  const chartRows = [
    { metric: "Output (units)", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, r.predicted_output_units])) },
    { metric: "WIP (units)", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, r.predicted_wip_units])) },
    { metric: "Utilisation (%)", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, r.predicted_utilization_pct])) },
  ];
  const label = (r) => `${r.scenario_name} / ${r.line_id}`;
  const h = hist.data?.items ?? [];
  const mismatch = h.filter((x) => x.plant_matches_line === false).length;

  return (
    <>
      <PageHeader title="Scenario comparison" subtitle="Compare 2 to 6 twin runs, and review the 300 historical TWIN-1.7 runs" state="SIMULATED" />
      <StateBanner type="SIMULATED" />
      <ModelBar meta={cmp.data ?? list.data} />
      <Card title="Select runs (2 to 6)" actions={<button type="button" className="primary" disabled={picked.length < 2 || cmp.busy} onClick={compare}>{cmp.busy ? "Comparing…" : `Compare ${picked.length}`}</button>}>
        <ApiState loading={list.loading} error={list.error} />
        {list.data && <DataTable
          columns={[
            { key: "sel", label: "Pick", render: (r) => <input type="checkbox" aria-label={`Select ${label(r)}`} checked={picked.includes(r.run_id)} onChange={() => toggle(r.run_id)} /> },
            { key: "scenario_name", label: "Scenario" }, { key: "line_id", label: "Line" }, { key: "status", label: "Status" },
            { key: "predicted_output_units", label: "Output", num: true, render: (r) => fmt(r.predicted_output_units) },
            { key: "predicted_wip_units", label: "WIP", num: true, render: (r) => fmt(r.predicted_wip_units, 1) },
            { key: "predicted_utilization_pct", label: "Util %", num: true, render: (r) => fmt(r.predicted_utilization_pct, 1) },
            { key: "confidence_score", label: "Confidence", num: true, render: (r) => fmt(r.confidence_score) },
            { key: "model_version", label: "Model" },
          ]}
          rows={list.data.items.map((r) => ({ ...r, id: r.run_id }))} />}
        {list.data?.items?.length === 0 && <p className="note">No twin runs yet. Create some in the Scenario lab.</p>}
      </Card>
      <ApiState loading={false} error={cmp.error} />
      {runs.length > 0 && (
        <>
          <Card title="Side by side">
            <DataTable
              columns={[{ key: "m", label: "Metric" }, ...runs.map((r, i) => ({ key: `r${i}`, label: label(r), num: true }))]}
              rows={[
                { id: "o", m: "Predicted output", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, fmt(r.predicted_output_units)])) },
                { id: "w", m: "Predicted WIP", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, fmt(r.predicted_wip_units, 1)])) },
                { id: "u", m: "Utilisation", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, pct(r.predicted_utilization_pct)])) },
                { id: "b", m: "Bottleneck", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, r.bottleneck_station_id ?? "n/a"])) },
                { id: "c", m: "Confidence", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, fmt(r.confidence_score)])) },
                { id: "v", m: "Validation", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, r.validation_status ?? "n/a"])) },
                { id: "s", m: "Status", ...Object.fromEntries(runs.map((r, i) => [`r${i}`, r.status])) },
              ]} />
          </Card>
          <ChartBlock title="Scenario metrics" description={`Bar chart comparing ${runs.length} runs on output, WIP and utilisation. Baseline uses the first series colour.`}
                      columns={[{ key: "metric", label: "Metric" }, ...runs.map((r, i) => ({ key: `r${i}`, label: label(r), num: true }))]} rows={chartRows}>
            <ResponsiveContainer>
              <BarChart data={chartRows}>
                <CartesianGrid stroke="var(--dr-border)" />
                <XAxis dataKey="metric" tick={AXIS} stroke="var(--chart-axis)" />
                <YAxis tick={AXIS} stroke="var(--chart-axis)" />
                <Tooltip contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--dr-border)", color: "var(--chart-label)", fontFamily: "inherit" }} />
                <Legend formatter={(v) => <span style={{ color: "var(--chart-label)" }}>{v}</span>} wrapperStyle={{ fontFamily: "inherit" }} />
                {runs.map((r, i) => <Bar key={r.run_id} dataKey={`r${i}`} name={label(r)} fill={SERIES[i % SERIES.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          </ChartBlock>
        </>
      )}
      <Card title="Historical runs (TWIN-1.7): stored vs recomputed error" actions={<StateBadge type="SIMULATED" />}>
        <p className="note">
          Data-quality finding DQ-03: the stored prediction_error_pct does not match abs(predicted-actual)/actual in the source data, so both are shown.
          {mismatch > 0 && ` DQ-02b: ${mismatch} of ${h.length} rows list a plant that contradicts the line's plant.`} The output horizon of these runs is unknown.
        </p>
        <ApiState loading={hist.loading} error={hist.error} />
        {hist.data && <DataTable
          columns={[
            { key: "scenario_id", label: "ID" }, { key: "scenario_name", label: "Scenario" }, { key: "line_id", label: "Line" },
            { key: "plant_id_as_stored", label: "Plant (stored)", render: (r) => `${r.plant_id_as_stored}${r.plant_matches_line === false ? " ⚠ mismatch" : ""}` },
            { key: "predicted_output_units", label: "Predicted", num: true, render: (r) => fmt(r.predicted_output_units) },
            { key: "actual_output_comparison_units", label: "Actual", num: true, render: (r) => fmt(r.actual_output_comparison_units) },
            { key: "stored_error_pct", label: "Stored err %", num: true, render: (r) => fmt(r.stored_error_pct, 2) },
            { key: "recomputed_error_pct", label: "Recomputed err %", num: true, render: (r) => fmt(r.recomputed_error_pct, 2) },
            { key: "error_gap_pts", label: "Gap (pts)", num: true, render: (r) => fmt(r.error_gap_pts, 2) },
          ]}
          rows={h.map((r) => ({ ...r, id: r.scenario_id }))} />}
      </Card>
    </>
  );
}
