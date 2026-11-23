import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, dt, fmt, go, useApi } from "../api.js";
import { ApiState, AXIS, Card, DataTable, PageHeader, SERIES, StateBanner, StatusBadge, ValueLabel } from "../components.jsx";
import "./overview.css";

// Overview Dashboard. Every number comes from GET /api/factory/overview (ACTUAL or CALCULATED, labelled per metric); n/a when the data
// to compute it does not exist. Data is a historical export, so 'latest' means the last hour in the data.
const STATE_COLOR = { RUNNING: "var(--st-normal)", IDLE: "var(--st-warning)", SETUP: "var(--st-attention)", DOWN: "var(--st-offline)" };
const HEALTH_COLOR = { NORMAL: "var(--st-normal)", WARNING: "var(--st-warning)", ATTENTION: "var(--st-attention)", CRITICAL: "var(--st-critical)", OFFLINE: "var(--st-offline)" };
const n0 = (v) => (v == null ? "n/a" : fmt(v, 0));
const p1 = (v) => (v == null ? "n/a" : `${fmt(v, 1)}%`);

function Kpi({ label, value, hint, vlabel, onClick }) {
  return (
    <button type="button" className="kpi" onClick={onClick} title={onClick ? "Open the detailed view" : undefined}>
      <div className="k-tag">{vlabel ? <ValueLabel label={vlabel} /> : <span className="vl vl-none">LIVE STATUS</span>}</div>
      <div className="k-label"><span>{label}</span></div>
      <div className="k-value">{value}</div>
      {hint && <div className="k-hint">{hint}</div>}
    </button>
  );
}

export default function OverviewDashboard() {
  const filters = useApi("/factory/filters");
  const [f, setF] = useState({ date_from: "", date_to: "", line_id: "", machine_id: "", shift_id: "", area: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const ov = useApi(`/factory/overview${qs ? `?${qs}` : ""}`);
  const prodRef = useRef(null);
  const d = ov.data;
  const k = d?.kpis;
  const c = d?.charts;
  // fill the date inputs with the API's default window once
  useEffect(() => {
    if (d && !f.date_from && !f.date_to) setF((x) => ({ ...x, date_from: d.filters.from.slice(0, 10), date_to: d.filters.to.slice(0, 10) }));
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const lbl = useMemo(() => Object.fromEntries((d?.definitions ?? []).map((x) => [x.metric, x.label])), [d]);
  const bounds = filters.data?.bounds?.mes;
  const machines = (filters.data?.machines ?? []).filter((m) => !f.line_id || m.line_id === f.line_id);
  const set = (key) => (e) => setF((x) => ({ ...x, [key]: e.target.value }));
  const toProd = () => prodRef.current?.scrollIntoView({ behavior: "smooth" });
  const health = c?.machine_health;
  const healthRows = health ? Object.entries(health.counts ?? {}).map(([s, n]) => ({ status: s, machines: n })) : [];

  return (
    <div className="page-grid ov">
      <PageHeader title="Overview Dashboard" subtitle="Factory performance from the loaded plant data and the latest Digital Twin Agent run." state="LIVE" />
      <StateBanner type="LIVE">
        Historical export (plant data {bounds ? `${bounds.lo.slice(0, 10)} to ${bounds.hi.slice(0, 10)}` : "Aug to Oct 2026"}), not a live stream.
        Machine state is the last telemetry hour in the selected range{k?.machine_state_as_of ? ` (${String(k.machine_state_as_of).replace("T", " ").slice(0, 16)})` : ""}. Health is a rule-based index, not a prediction.
      </StateBanner>

      <section className="ov-filters" aria-label="Filters">
        <label className="field"><span>From</span><input type="date" value={f.date_from} min={bounds?.lo?.slice(0, 10)} max={bounds?.hi?.slice(0, 10)} onChange={set("date_from")} /></label>
        <label className="field"><span>To</span><input type="date" value={f.date_to} min={bounds?.lo?.slice(0, 10)} max={bounds?.hi?.slice(0, 10)} onChange={set("date_to")} /></label>
        <label className="field"><span>Production line</span>
          <select value={f.line_id} onChange={(e) => setF((x) => ({ ...x, line_id: e.target.value, machine_id: "" }))}>
            <option value="">All lines</option>{(filters.data?.lines ?? []).map((l) => <option key={l}>{l}</option>)}
          </select></label>
        <label className="field"><span>Machine</span>
          <select value={f.machine_id} onChange={set("machine_id")}>
            <option value="">All machines</option>{machines.map((m) => <option key={m.machine_id} value={m.machine_id}>{m.machine_id} {m.machine_name}</option>)}
          </select></label>
        <label className="field"><span>Shift</span>
          <select value={f.shift_id} onChange={set("shift_id")}><option value="">All shifts</option>{(filters.data?.shifts ?? []).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>Factory section</span>
          <select value={f.area} onChange={set("area")}><option value="">All sections</option>{(filters.data?.areas ?? []).map((a) => <option key={a}>{a}</option>)}</select></label>
        <button type="button" className="ghost" onClick={() => setF({ date_from: "", date_to: "", line_id: "", machine_id: "", shift_id: "", area: "" })}>Reset</button>
      </section>
      {f.area && <p className="muted-text">MES production is per line: the section filter selects the lines that run it (SMT section → SMT lines, others → final-assembly lines). Quality inspections have no shift.</p>}

      <ApiState loading={ov.loading && !d} error={ov.error} label="Loading factory overview" hint="13 KPIs and 10 charts from machines, production, quality and the latest agent run." rows={5} />
      {k && (
        <>
          <div className="ov-kgroups">
            <section className="ov-kgroup" aria-label="Machines">
              <h3>Machines</h3>
              <div className="ov-kg-row">
                <Kpi label="Machines" value={n0(k.total_machines)} hint="in the selection" vlabel="ACTUAL" onClick={() => go("twin")} />
                <Kpi label="Active" value={n0(k.active_machines)} hint={`idle ${k.idle_machines} · setup ${k.setup_machines}`} vlabel="ACTUAL" onClick={() => go("twin")} />
                <Kpi label="Offline" value={n0(k.offline_machines)} hint="DOWN in the last hour" vlabel="ACTUAL" onClick={() => go("twin")} />
                <Kpi label="In maintenance" value={n0(k.machines_under_maintenance)} hint="WO in progress ≤ 72 h" vlabel="CALCULATED" onClick={() => go("twin")} />
              </div>
            </section>
            <section className="ov-kgroup" aria-label="Production">
              <h3>Production</h3>
              <div className="ov-kg-row">
                <Kpi label="Produced" value={n0(k.total_production)} hint="units" vlabel="ACTUAL" onClick={toProd} />
                <Kpi label="Target" value={n0(k.production_target)} hint="units" vlabel="ACTUAL" onClick={toProd} />
                <Kpi label="Efficiency" value={p1(k.production_efficiency_pct)} hint="actual / target" vlabel="CALCULATED" onClick={toProd} />
                <Kpi label="OEE" value={p1(k.oee_pct)} hint="Σ good / Σ target" vlabel="CALCULATED" onClick={toProd} />
              </div>
            </section>
            <section className="ov-kgroup" aria-label="Quality and downtime">
              <h3>Quality &amp; downtime</h3>
              <div className="ov-kg-row">
                <Kpi label="Quality pass rate" value={p1(k.quality_pass_rate_pct)} hint={`${n0(k.inspections)} inspections`} vlabel="CALCULATED" onClick={() => go("reports", { tab: "reports" })} />
                <Kpi label="Total defects" value={n0(k.total_defects)} hint={`failed inspections · ${n0(k.reject_units)} reject units`} vlabel="ACTUAL" onClick={() => go("reports", { tab: "reports" })} />
                <Kpi label="Downtime" value={k.downtime_min == null ? "n/a" : `${fmt(k.downtime_min, 0)} min`} hint="MES line downtime" vlabel="ACTUAL" onClick={toProd} />
              </div>
            </section>
            <section className="ov-kgroup" aria-label="Agent and approvals">
              <h3>Agent &amp; approvals</h3>
              <div className="ov-kg-row">
                <Kpi label="Pending approvals" value={n0(k.pending_recommendations)} hint="awaiting a planner" onClick={() => go("reports")} />
                <Kpi label="Agent execution" value={k.agent_status} onClick={() => go("agent")}
                  hint={k.agent_last_run?.finished_at
                    ? `completed ${dt(k.agent_last_run.finished_at)} · took ${Math.round((new Date(k.agent_last_run.finished_at) - new Date(k.agent_last_run.started_at)) / 1000)} s`
                    : k.agent_last_run?.started_at ? `started ${dt(k.agent_last_run.started_at)}` : "run the agent"} />
              </div>
            </section>
          </div>

          <div className="ov-charts" ref={prodRef}>
            <Card title="Production trend (daily)">
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <LineChart data={c.production_trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--ghost-ink)" vertical={false} /><XAxis dataKey="date" tick={AXIS} /><YAxis tick={AXIS} /><Tooltip /><Legend />
                  <Line dataKey="target" name="Target" stroke={SERIES[2]} dot={false} strokeDasharray="5 4" />
                  <Line dataKey="actual" name="Actual" stroke={SERIES[0]} dot={false} strokeWidth={2} />
                  <Line dataKey="good" name="Good" stroke={SERIES[3]} dot={false} />
                </LineChart></ResponsiveContainer></div>
            </Card>
            <Card title="Target vs actual by line">
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={c.line_comparison} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--ghost-ink)" vertical={false} /><XAxis dataKey="line_id" tick={AXIS} /><YAxis tick={AXIS} /><Tooltip /><Legend />
                  <Bar dataKey="target" name="Target" fill={SERIES[2]} /><Bar dataKey="actual" name="Actual" fill={SERIES[0]} />
                </BarChart></ResponsiveContainer></div>
            </Card>
            <Card title="Machine status (last hour)" actions={<ValueLabel label="ACTUAL" />}>
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <PieChart><Legend verticalAlign="bottom" formatter={(v, e) => `${v} ${e.payload.machines}`} /><Pie data={c.machine_status} dataKey="machines" nameKey="state" innerRadius="48%" outerRadius="78%" onClick={() => go("twin")}>
                  {c.machine_status.map((s) => <Cell key={s.state} fill={STATE_COLOR[s.state]} />)}
                </Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            </Card>
            <Card title="Machine utilisation (share of hours RUNNING)" actions={<ValueLabel label="CALCULATED" />}>
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={c.machine_utilization} margin={{ top: 8, right: 12, left: 0, bottom: 30 }}>
                  <CartesianGrid stroke="var(--ghost-ink)" vertical={false} /><XAxis dataKey="machine_id" tick={{ ...AXIS, fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                  <YAxis tick={AXIS} domain={[0, 100]} /><Tooltip formatter={(v) => `${fmt(v, 1)}%`} />
                  <Bar dataKey="utilization_pct" name="Utilisation %" fill={SERIES[0]} onClick={(e) => go("twin", { machine: e.machine_id })} cursor="pointer" />
                </BarChart></ResponsiveContainer></div>
            </Card>
            <Card title="Quality: failed inspections per day" actions={<ValueLabel label="CALCULATED" />}>
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <LineChart data={c.quality_trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--ghost-ink)" vertical={false} /><XAxis dataKey="date" tick={AXIS} /><YAxis tick={AXIS} /><Tooltip /><Legend />
                  <Line dataKey="fails" name="Failed inspections" stroke={SERIES[1]} strokeWidth={2} />
                </LineChart></ResponsiveContainer></div>
            </Card>
            <Card title="Defect Pareto" actions={<ValueLabel label="ACTUAL" />}>
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={c.defect_pareto} layout="vertical" margin={{ top: 4, right: 16, left: 40, bottom: 0 }}>
                  <CartesianGrid stroke="var(--ghost-ink)" horizontal={false} /><XAxis type="number" tick={AXIS} /><YAxis type="category" dataKey="defect_name" tick={{ ...AXIS, fontSize: 10 }} width={130} />
                  <Tooltip /><Bar dataKey="fails" name="Failed inspections" fill={SERIES[1]} />
                </BarChart></ResponsiveContainer></div>
            </Card>
            <Card className="ov-wide" title="Downtime analysis" actions={<ValueLabel label="ACTUAL" />}>
              <div className="ov-chart"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={c.downtime_by_reason} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--ghost-ink)" vertical={false} /><XAxis dataKey="reason" tick={{ ...AXIS, fontSize: 10 }} /><YAxis tick={AXIS} /><Tooltip /><Legend />
                  <Bar dataKey="minutes" name="MES line downtime (min)" fill={SERIES[2]} />
                </BarChart></ResponsiveContainer></div>
              <p className="muted-text">Machine downtime events: {c.machine_downtime_events.map((r) => `${r.reason} ${r.events} (${fmt(r.minutes, 0)} min)`).join(" · ") || "none"}.</p>
            </Card>
            <Card className="ov-wide" title="Machine health summary (latest agent run)" actions={<ValueLabel label="CALCULATED" />}>
              {!health?.run_id ? <p className="notice">{health?.note ?? "Run the Digital Twin Agent to compute machine health."} <button type="button" className="primary" onClick={() => go("agent")}>Open agent</button></p> : (
                <>
                  <div className="ov-health">
                    {healthRows.map((h) => (
                      <button type="button" key={h.status} className={`ov-hcell hc-${h.status.toLowerCase()}`} onClick={() => go("twin")} title={`${h.machines} ${h.status.toLowerCase()} machines`}>
                        <b>{h.machines}</b>
                        <span>{h.status.charAt(0) + h.status.slice(1).toLowerCase()}</span>
                      </button>
                    ))}
                  </div>
                  <table className="ov-htable">
                    <thead><tr><th scope="col">Machine</th><th scope="col">Status</th><th scope="col" className="num">Health</th><th scope="col" className="num">Risk</th></tr></thead>
                    <tbody>
                      {health.machines.slice(0, 7).map((m) => (
                        <tr key={m.machine_id}>
                          <td><button type="button" className="ov-link" onClick={() => go("twin", { machine: m.machine_id })}>{m.machine_id}</button></td>
                          <td><StatusBadge status={m.status} /></td>
                          <td className="num">{fmt(m.health_score, 0)}</td>
                          <td className="num">{fmt(m.risk_score, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted-text ov-hnote">Highest risk first · {health.machines.length} machines · click a machine to open it in the 3D twin.</p>
                </>
              )}
            </Card>
          </div>

          <Card title="Production line comparison">
            <DataTable columns={[
              { key: "line_id", label: "Line" }, { key: "target", label: "Target", num: true, render: (r) => n0(r.target) },
              { key: "actual", label: "Actual", num: true, render: (r) => n0(r.actual) }, { key: "eff", label: "Efficiency", num: true, render: (r) => p1(r.efficiency_pct) },
              { key: "oee", label: "OEE", num: true, render: (r) => p1(r.oee_pct) }, { key: "dt", label: "Downtime min", num: true, render: (r) => n0(r.downtime_min) },
              { key: "fr", label: "Inspection fail rate", num: true, render: (r) => (r.fail_rate_pct == null ? "n/a" : `${fmt(r.fail_rate_pct, 2)}%`) },
            ]} rows={c.line_comparison.map((r) => ({ ...r, id: r.line_id }))} />
          </Card>

          <div className="two-col">
            <Card title="Recent agent findings" actions={<button type="button" className="ghost small" onClick={() => go("agent")}>All runs</button>}>
              {c.recent_findings.length === 0 ? <p className="muted-text">No completed agent run yet.</p> : (
                <ul className="ov-list">
                  {c.recent_findings.map((x) => (
                    <li key={x.finding_id}>
                      <StatusBadge status={x.severity} /> <ValueLabel label={x.value_label} />{" "}
                      {x.machine_id ? <button type="button" className="ov-link" onClick={() => go("twin", { machine: x.machine_id })}>{x.title}</button> : <span>{x.title}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Pending approvals" actions={<button type="button" className="ghost small" onClick={() => go("reports")}>Approval queue</button>}>
              {c.pending_approvals.length === 0 ? <p className="muted-text">Nothing is waiting for a decision.</p> : (
                <ul className="ov-list">
                  {c.pending_approvals.map((r) => (
                    <li key={r.rec_id}><span className={`ov-risk ov-risk-${r.risk_level.toLowerCase()}`}>{r.risk_level}</span>{" "}
                      <button type="button" className="ov-link" onClick={() => go("reports", { rec: r.rec_id })}>{r.machine_id || r.line_id || ""} {r.issue}</button></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <details className="card ov-defs">
            <summary>How the metrics are calculated</summary>
            <ul>{d.definitions.map((x) => <li key={x.id}><b>{x.metric}</b> <ValueLabel label={x.label} />: {x.text}</li>)}</ul>
          </details>
        </>
      )}
    </div>
  );
}
