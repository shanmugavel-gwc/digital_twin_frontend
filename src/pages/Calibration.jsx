import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useApi, fmt, pct } from "../api.js";
import { ApiState, AXIS, Card, ChartBlock, DataTable, ModelBar, PageHeader, StateBanner, VerdictBadge } from "../components.jsx";

// GET /api/calibration/report -> { validation_status, thresholds, split, lines:[{ line_id, verdict, parallelism_factor, speed_factor, cv,
//   train:{mape_pct,bias_pct,rmse,n_hours}, holdout:{mape_pct,bias_pct,rmse,n_hours, hourly:{mape_pct}, naive_mean_baseline_daily:{mape_pct}},
//   daily:[{date, actual, simulated, p05, p95}], downtime_model, notes }] }
// POST /api/calibration/run (202) starts a background job; GET /api/calibration/status polls it.
export default function Calibration() {
  const { data, error, loading, reload } = useApi("/calibration/report");
  const [job, setJob] = useState(null);
  const [jobErr, setJobErr] = useState(null);
  const timer = useRef(null);
  const lines = data?.lines ?? [];

  useEffect(() => () => clearInterval(timer.current), []);
  async function poll() {
    try {
      const s = await api("/calibration/status");
      setJob(s.job);
      if (s.job.state !== "RUNNING") { clearInterval(timer.current); reload(); }
    } catch (e) { setJobErr(e); clearInterval(timer.current); }
  }
  async function start() {
    setJobErr(null);
    try {
      const s = await api("/calibration/run", { method: "POST", body: { replications: 8 } });
      setJob(s.job);
      clearInterval(timer.current);
      timer.current = setInterval(poll, 4000);
    } catch (e) { setJobErr(e); }
  }
  const running = job?.state === "RUNNING";

  return (
    <>
      <PageHeader title="Calibration report" subtitle="Simulated vs MES actuals; fitted on early days, validated on a hold-out period" state="SIMULATED" />
      <StateBanner type="SIMULATED">Simulated output compared with LIVE MES actuals. Each series below is labelled.</StateBanner>
      <ModelBar meta={data} />
      <div className="row" style={{ alignItems: "center" }}>
        <button type="button" className="primary" disabled={running} onClick={start}>{running ? "Calibrating…" : "Run calibration"}</button>
        <span className="muted-text" style={{ margin: 0 }}>
          {running ? `Running (about 3 minutes). ${(job?.progress ?? []).length}/4 lines done.` : "Re-fits the model on the first 70% of MES days and validates on the last 30%."}
          {job?.state === "FAILED" && ` Failed: ${job.error}`}
        </span>
      </div>
      <ApiState loading={false} error={jobErr} />
      <ApiState loading={loading} error={error} />
      {data?.message && <p className="note" role="status">{data.message}</p>}
      {data && lines.length > 0 && (
        <>
          <p className="muted-text">Verdict thresholds (hold-out daily MAPE): VALIDATED &le; {data.thresholds?.validated_max ?? 8}%, NEEDS REVIEW up to {data.thresholds?.needs_review_max ?? 15}%, above that NOT VALIDATED.
            {data.split && ` Fitted ${data.split.train_start} to ${data.split.train_end}; hold-out ${data.split.holdout_start} to ${data.split.holdout_end}.`}</p>
          <Card title="Per-line results">
            <DataTable
              columns={[
                { key: "line_id", label: "Line" },
                { key: "verdict", label: "Verdict", render: (r) => <VerdictBadge verdict={r.verdict} /> },
                { key: "pf", label: "Parallelism factor", num: true, render: (r) => fmt(r.parallelism_factor, 3) },
                { key: "sf", label: "Speed factor", num: true, render: (r) => fmt(r.speed_factor, 3) },
                { key: "tm", label: "Train MAPE (daily)", num: true, render: (r) => pct(r.train?.mape_pct, 2) },
                { key: "hm", label: "Hold-out MAPE (daily)", num: true, render: (r) => pct(r.holdout?.mape_pct, 2) },
                { key: "hb", label: "Hold-out bias", num: true, render: (r) => pct(r.holdout?.bias_pct, 2) },
                { key: "hr", label: "Hold-out RMSE (units/day)", num: true, render: (r) => fmt(r.holdout?.rmse, 0) },
                { key: "nv", label: "Naive-mean MAPE", num: true, render: (r) => pct(r.holdout?.naive_mean_baseline_daily?.mape_pct, 2) },
                { key: "hh", label: "Hold-out MAPE (hourly)", num: true, render: (r) => pct(r.holdout?.hourly?.mape_pct, 1) },
                { key: "hn", label: "Hold-out hours", num: true, render: (r) => fmt(r.holdout?.n_hours) },
              ]}
              rows={lines.map((l) => ({ ...l, id: l.line_id }))} />
            <p className="muted-text">Naive-mean MAPE is a trivial forecast (the training-period average day). The twin's value is in what-if scenarios, not in beating an average day; hourly error is dominated by the unpredictable timing of stops.</p>
          </Card>
          <div className="grid cols-2">
            {lines.map((l) => (
              <ChartBlock key={l.line_id} title={`${l.line_id}: daily actual vs simulated (hold-out)`}
                          description={`Daily output over the hold-out days. Actual is LIVE (MES), simulated is SIMULATED (twin, mean of replications). Hold-out MAPE ${pct(l.holdout?.mape_pct, 2)}.`}
                          columns={[{ key: "date", label: "Date" }, { key: "actual", label: "Actual (LIVE)", num: true }, { key: "simulated", label: "Simulated", num: true, render: (r) => fmt(r.simulated, 0) }]}
                          rows={(l.daily ?? []).map((d) => ({ ...d, id: d.date }))}>
                <ResponsiveContainer>
                  <LineChart data={l.daily ?? []}>
                    <CartesianGrid stroke="var(--dr-border)" />
                    <XAxis dataKey="date" tick={AXIS} stroke="var(--chart-axis)" minTickGap={30} />
                    <YAxis tick={AXIS} stroke="var(--chart-axis)" domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--dr-border)", color: "var(--chart-label)", fontFamily: "inherit" }} />
                    <Legend formatter={(v) => <span style={{ color: "var(--chart-label)" }}>{v}</span>} wrapperStyle={{ fontFamily: "inherit" }} />
                    <Line type="monotone" dataKey="actual" name="Actual (LIVE)" stroke="var(--chart-c1)" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="simulated" name="Simulated" stroke="var(--chart-c2)" dot={false} strokeWidth={2} strokeDasharray="6 4" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBlock>
            ))}
          </div>
          <Card title="Model notes">
            <ul>{[...new Set(lines.flatMap((l) => l.notes ?? []))].map((n, i) => <li key={i}>{n}</li>)}</ul>
          </Card>
        </>
      )}
    </>
  );
}
