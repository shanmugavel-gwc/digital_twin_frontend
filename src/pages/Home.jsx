import { useState } from "react";
import { createPortal } from "react-dom";
import { dt, fmt, go, useApi } from "../api.js";
import { ApiState } from "../components.jsx";
import "./home.css";

// Home: application architecture & operations command. Everything is filled from GET /api/factory/home (real data: historical export +
// latest agent run). One central agent, never several. Figures the data cannot support (e.g. money saved) are not shown.
const P = {
  factory: "M3 21V10l6 4V10l6 4V6l6 3v12H3Zm4-4h2m4 0h2",
  db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3 2-1-2-4-2 1-2-1V5h-4v2L9 8 7 7 5 11l2 1v1l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1Z",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5",
  agent: "M9 3h6v3H9zM5 8h14v10H5zM9 12h.01M15 12h.01M9 15h6M12 6v2M3 12h2m14 0h2",
  people: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  chart: "M4 20V10m6 10V4m6 16v-8m6 8H2",
  check: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  shield: "M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z",
  cube: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12v9M12 12 4 7.5",
  wave: "M3 12h4l3-7 4 14 3-7h4",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z",
  clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  chat: "M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  flame: "M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z",
  clip: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  chevron: "m6 9 6 6 6-6",
  trend: "M3 17l6-6 4 4 8-8m0 0h-5m5 0v5",
};
const I = ({ d, s = 18 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[d]} /></svg>;

// tones of the item cards inside a stage (as in the reference): blue, green, purple
const TONES = ["t-blue", "t-green", "t-purple"];

function stages(h) {
  const src = h.sources, q = h.quality;
  const rec = (k) => fmt(src[k].records, 0);
  return [
    { id: "src", n: 1, title: "Source systems", sub: "Data integration", icon: "factory", layout: "items",
      items: [{ icon: "factory", t: "MES & SCADA", s: `Production ${rec("mes")} · sensors & energy ${rec("scada")}`, d: `What each line produced every hour (MES: target, actual, good, reject, downtime with reason) and how each of the 15 machines behaved every hour (SCADA: temperature, vibration, motor current, pressure, speed, state, alarms), plus energy per plant area. ${rec("mes")} production rows and ${rec("scada")} sensor and energy rows.` },
              { icon: "wrench", t: "CMMS & QMS", s: `Maintenance ${rec("cmms")} · quality ${rec("qms")}`, d: `The maintenance and quality history: corrective, preventive and predictive work orders with failure modes, machine downtime events with reasons, quality inspections with defect codes, and NCR/CAPA records with recorded root-cause categories. ${fmt(src.cmms.records + src.qms.records, 0)} rows.` },
              { icon: "db", t: "ERP, WMS & Workforce", s: `Stock & shipments ${rec("erp")} · staff ${rec("workforce")}`, d: `Business context around the lines: daily stock by warehouse and lot (raw material, kits, WIP, finished goods), shipments with their status, and daily attendance by shift. ${fmt(src.erp.records + src.workforce.records, 0)} rows.` }],
      badge: "STAGE 1 · DATA INTEGRATION",
      desc: "Six plant systems supply the data. Their exports are loaded exactly as supplied; nothing is edited on the way in.",
      protocols: "Batch CSV exports (historical, Aug–Oct 2026) · read-only database and file connectors for further sources",
      tables: "fact_hourly_production, fact_machine_telemetry_hourly, fact_energy_meter_hourly, fact_maintenance_work_order, fact_downtime_event, fact_quality_inspection, fact_ncr_capa, fact_inventory_daily_snapshot, fact_shipment_milestone, fact_workforce_attendance",
      steps: [
        { item: 0, t: "Production and machine signals", d: `MES hourly output (${rec("mes")} rows) and SCADA telemetry and energy (${rec("scada")} rows) are loaded per hour.`,
          simple: "We bring in what each line made every hour and how each machine behaved: temperature, vibration, current, pressure, speed." },
        { item: 1, t: "Maintenance and quality history", d: `Work orders, downtime events, inspections and NCRs (${fmt(src.cmms.records + src.qms.records, 0)} rows).`,
          simple: "We bring in every repair, every stop and every quality check, so the agent can look back at what happened before." },
        { item: 2, t: "Stock, shipments and people", d: `Inventory snapshots, shipments and attendance (${fmt(src.erp.records + src.workforce.records, 0)} rows).`,
          simple: "We bring in what is in the warehouse, what left the plant and who was on shift." },
        { item: null, t: "Loaded as supplied, checked", d: "One transaction per load; row counts are checked against the files. Disagreeing cross-references are reported, never fixed.",
          simple: "If the files contradict each other, we say so instead of quietly changing the data." },
        { item: null, t: "Historical, not live", d: "There is no live feed yet: the twin treats the last recorded hour (31 Oct 2026, 23:00) as 'now'.",
          simple: "Today the data is a recording of three months. Connecting live MES and SCADA is the next step." },
      ],
      link: ["Architecture & Data Flow", "architecture"] },
    { id: "prep", n: 2, title: "Data preparation", sub: "Validation & rules", icon: "gear", layout: "center",
      center: { icon: "gear", title: "PREPARE & VALIDATE", caption: "(SQL views · Python · rules)" },
      items: [{ icon: "check", t: "Validate", s: "fields · duplicates · timestamps", d: "Every run first checks the data: required fields present, no missing machine-hours, no duplicate or future timestamps, every record pointing at a known machine, and plants that agree with each other. Failures are reported as warnings and kept, never fixed silently." },
              { icon: "gear", t: "Prepare", s: "machine features · line metrics", d: "Turns raw records into the measures the agent reasons on: per machine utilisation, hours down, anomaly flags, readings above its own normal range and days since maintenance; per line plan attainment, OEE, downtime by reason and top defects." },
              { icon: "layers", t: "Apply rules", s: "risk index · status bands", d: "Visible manufacturing rules combine those measures into a 0–100 risk index per machine and a status: NORMAL, WARNING, ATTENTION, CRITICAL or OFFLINE. Weights and thresholds are editable on the Settings page. Results are labelled CALCULATED, not predicted." }],
      badge: "STAGE 2 · VALIDATION & RULES",
      desc: "Raw records become features the agent can reason on. Every check is repeated in each agent run, and every failed check is reported.",
      protocols: "SQL views + Python (pandas) · rules held in the agent configuration (Settings page)",
      tables: "v_line_hourly_oee, v_line_daily_actuals, v_machine_3d_mapping, agent_config",
      steps: [
        { item: 0, t: "Data validation", d: "Required fields, missing hours, duplicate and future timestamps, unknown machines, plant mismatches.",
          simple: "Before trusting the numbers, the agent checks that nothing is missing, doubled or contradictory." },
        { item: 1, t: "Machine features", d: "Utilisation, hours DOWN, anomaly flags, sensor readings above the machine's own normal range, days since maintenance.",
          simple: "For each machine we work out how busy it was, how often it stopped and whether it ran hotter or shook more than usual." },
        { item: 1, t: "Line metrics", d: "Plan attainment, OEE, downtime by reason, inspection fail rate and top defects per line.",
          simple: "For each line we work out how much of the plan it made, why it stopped and what failed in quality checks." },
        { item: 2, t: "Manufacturing rules", d: "A rule-based risk index (0–100) with status bands NORMAL / WARNING / ATTENTION / CRITICAL; weights in Settings.",
          simple: "Simple, visible rules turn those numbers into a score per machine. Anyone can see and change the weights." },
        { item: null, t: "Clearly labelled", d: "Rule results are labelled CALCULATED. They are not presented as an AI prediction.",
          simple: "We never call a rule a prediction." },
      ],
      link: ["Settings", "settings"] },
    { id: "data", n: 3, title: "Data & twin layer", sub: "Single source of truth", icon: "db", layout: "items",
      items: [{ icon: "db", t: "One database", s: `${h.database.engine} · ${h.database.tables} tables`, d: `One PostgreSQL schema on Neon with ${h.database.tables} tables holds the plant data, the twin results, the agent results, approvals, reports and the audit log, so every page shows the same numbers.` },
              { icon: "cube", t: "Calibrated line twin", s: "SimPy simulation · 4 lines validated", d: "A discrete-event simulation of each production line, fitted on early days and checked against real MES output on later days. It is the only source of PREDICTED values (throughput, bottleneck stations); machine failure prediction is shown as unavailable." },
              { icon: "shield", t: "Protected by design", s: "read-only agent SQL · append-only audit", d: "The safeguards are in the database itself: the agent\u2019s own SQL runs on a role that cannot write, the audit log rejects any edit or delete, and a recommendation cannot be approved without a human review row." }],
      badge: "STAGE 3 · SINGLE SOURCE OF TRUTH",
      desc: "Plant data, twin results, agent results, approvals and the audit log live in one PostgreSQL schema. The calibrated twin predicts line throughput and bottlenecks.",
      protocols: "PostgreSQL (Neon, pooled connections) · SimPy discrete-event simulation · read-only database role for agent SQL",
      tables: "dim_* (plants, lines, stations, machines), fact_* (plant data), twin_* (calibration, scenarios), agent_*, recommendation*, report, audit_log",
      steps: [
        { item: 0, t: "One schema for everything", d: `${h.database.tables} tables: plant data, twin results, agent results, approvals, reports and the audit log.`,
          simple: "All pages read from the same place, so the numbers always agree." },
        { item: 1, t: "Calibrated, validated twin", d: "The line simulation is fitted on early days and checked on later days against real MES output.",
          simple: "The digital copy of each line was tested against what really happened before we trust its forecasts." },
        { item: 1, t: "Only real predictions are called predictions", d: "Bottleneck stations come from the validated twin (PREDICTED); machine failure prediction is shown as unavailable.",
          simple: "Where we have no proven model, the app says 'not available' instead of guessing." },
        { item: 2, t: "Read-only agent queries", d: "The agent's own SQL runs on a database role that cannot write.",
          simple: "Even if the AI tried to change data, the database would refuse." },
        { item: 2, t: "Append-only audit log", d: "The database rejects any update or delete of the audit log.",
          simple: "History cannot be rewritten." },
      ],
      link: ["Architecture & Data Flow", "architecture"] },
    { id: "agent", n: 4, title: "Digital Twin Agent", sub: "One central agent", icon: "agent", layout: "center",
      center: { icon: "agent", title: "Digital Twin Agent", caption: "10-step run, streamed live" },
      items: [{ icon: "wave", t: "Monitor & detect", s: "machines · production · quality", d: "The agent scores all 15 machines, checks every line\u2019s output and quality, and pushes each machine\u2019s status to the 3D twin: green normal, yellow warning, orange attention, red critical, grey offline." },
              { icon: "alert", t: "Explain & root cause", s: "causes from recorded history", d: "Every finding comes with its evidence (anomaly hours, hours down, downtime minutes, maintenance age, quality) and possible causes ranked from what has actually been recorded on that machine or line: failure modes, downtime reasons, NCR categories." },
              { icon: "check", t: "Recommend", s: "evidence-backed actions", d: "Each recommendation states the issue, the affected machine or line, the action, the risk level and the expected impact. Confidence is shown only when it comes from the validated twin. Everything goes to a planner for approval." }],
      foot: `${h.agent.status} · ${h.agent.findings ?? 0} findings · ${h.agent.recommendations ?? 0} recs`,
      badge: "STAGE 4 · ONE CENTRAL AGENT",
      desc: "One central agent with internal capabilities, not a group of independent bots. Each run is a 10-step workflow streamed live to the Agent Execution page.",
      protocols: "FastAPI background run · Server-Sent Events for live progress · LLM (Domo AI) only for summaries and chat, written from the computed findings",
      tables: "agent_run, agent_run_event, agent_machine_state, agent_finding, recommendation",
      steps: [
        { item: 0, t: "Monitor and detect", d: "Reads the context, validates the data and scores all 15 machines; statuses are pushed to the 3D twin.",
          simple: "The agent looks at every machine and line and colours the 3D factory: green, yellow, orange or red." },
        { item: 1, t: "Explain with evidence", d: "Each finding carries its numbers: anomaly hours, hours down, downtime minutes, maintenance age, quality.",
          simple: "It never just says 'problem'; it shows the numbers behind it." },
        { item: 1, t: "Rank possible root causes", d: "Causes come from recorded failure modes, downtime reasons and NCR categories, ranked by frequency.",
          simple: "It points at what has gone wrong on this machine before, instead of inventing a cause." },
        { item: 2, t: "Recommend actions", d: "Writes recommendations with risk level, expected impact and, only from the validated twin, a confidence.",
          simple: "It suggests what to do next and how much it should help." },
        { item: null, t: "Hand over to people", d: `Submits everything for human approval. Latest run: ${h.agent.status}${h.agent.finished_at ? `, completed ${dt(h.agent.finished_at)}` : ""}.`,
          simple: "The agent never acts on its own. A planner decides." },
      ],
      link: ["Agent Execution", "agent"] },
    { id: "out", n: 5, title: "Business outcome", sub: "Insights & actions", icon: "people", layout: "items",
      items: [{ icon: "trend", t: "Data-driven decisions", s: "3D twin · dashboards · reports", d: "Managers, production, maintenance and quality teams see the same facts in the form they need: the 3D plant campus and factory floor, the overview dashboard, and 7 report types for named audiences (PDF and Excel)." },
              { icon: "bell", t: "Alerts & early actions", s: `${h.kpis.reports} reports · email · Teams`, d: "Findings are flagged early and summarised for the right people: email and Microsoft Teams messages are prepared after every run and sent by a person once the channels are configured." },
              { icon: "target", t: "Approved & tracked", s: `${h.approvals.pending} pending · ${h.approvals.approved} approved`, d: "Only a Planner or Admin can approve, reject or request changes, with a comment. After approval the planner records the work order and follows it to done; approved records can be sent to SAP, REST, Teams or Power BI. Every step is audit-logged." }],
      badge: "STAGE 5 · INSIGHTS & ACTIONS",
      desc: "Findings reach people as a 3D twin, dashboards, reports and chat. A planner decides; nothing acts on the plant by itself.",
      protocols: "Reports as PDF / Excel · email (SMTP) and Microsoft Teams when configured · 10 enterprise connectors (send only after approval)",
      tables: "recommendation_review, recommendation_action, report, notification, integration_log, audit_log",
      steps: [
        { item: 0, t: "Decisions from one view", d: "Overview, 3D campus and factory floor, and 7 report types for named audiences.",
          simple: "Managers, maintenance and quality teams each see what matters to them." },
        { item: 1, t: "Early alerts", d: `Quality: ${fmt(q.failed, 0)} failed inspections in the data (${fmt(q.critical, 0)} critical); messages prepared for email and Teams.`,
          simple: "Problems are flagged early and the right people get a summary." },
        { item: 2, t: "Human approval gate", d: "Only a Planner or Admin can approve, reject or request changes, with a comment; the database refuses any other path.",
          simple: "No work order or outside action happens until a person says yes." },
        { item: 2, t: "Tracked to closure", d: "After approval the planner records the work order and its progress; approved records can be sent to SAP, REST, Teams or Power BI.",
          simple: "Every approved action is followed until it is done." },
        { item: null, t: "Full audit trail", d: "Every run, decision, setting change and integration call is in the append-only audit log.",
          simple: "You can always see who did what, and when." },
      ],
      link: ["Reports & Human Approval", "reports"] },
  ];
}

const PROBLEMS = {
  degradation: { head: "BLINDSPOTS", action: "SEE EVERY MACHINE", cls: "pb-amber", icon: "alert" },
  downtime: { head: "DELAYS", action: "STOP PRODUCTION DELAYS", cls: "pb-red", icon: "clock" },
  quality: { head: "QUALITY DRIFT", action: "FAST ROOT CAUSE FINDER", cls: "pb-purple", icon: "flame" },
  backlog: { head: "BOTTLENECKS", action: "CLEAR THE MAINTENANCE BACKLOG", cls: "pb-blue", icon: "layers" },
  decisions: { head: "SLOW DECISIONS", action: "ON-TIME ACTIONS & APPROVALS", cls: "pb-rose", icon: "shield" },
};
const ORDER = ["downtime", "degradation", "quality", "backlog", "decisions"];

function StageCard({ s, on, item, onPick }) {
  const pick = (i) => (e) => { e.stopPropagation(); onPick(i); };
  return (
    <div role="tab" tabIndex={0} aria-selected={on} className={`hm-stage hm-s${s.n} ${on ? "on" : ""}`} onClick={() => onPick("all")}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick("all"); } }} title={`${s.n}. ${s.title}: click to inspect`}>
      <span className="hm-stage-head"><I d={s.icon} s={22} /><b>{s.n}. {s.title}</b><small>({s.sub})</small></span>
      <span className="hm-stage-body">
        {s.layout === "center" ? (
          <span className="hm-center">
            <span className="hm-center-ico"><I d={s.center.icon} s={30} /></span>
            <b>{s.center.title}</b>
            {s.id === "prep"
              ? <span className="hm-pills">{s.items.map((it, i) => (
                  <button key={it.t} type="button" className={`p${i} ${on && item === i ? "sel" : ""}`} onClick={pick(i)} title={`${it.t}: ${it.s}`}>{it.t}</button>))}</span>
              : <span className="hm-tiles">{s.items.map((it, i) => (
                  <button key={it.t} type="button" className={`${TONES[i]} ${on && item === i ? "sel" : ""}`} onClick={pick(i)} title={`${it.t}: ${it.s}`} aria-label={it.t}><I d={it.icon} s={16} /></button>))}</span>}
            <small>{s.foot ?? s.center.caption}</small>
          </span>
        ) : s.items.map((it, i) => (
          <button key={it.t} type="button" className={`hm-item ${TONES[i]} ${on && item === i ? "sel" : ""}`} onClick={pick(i)} title={`Inspect ${it.t}`}>
            <span className="hm-item-ico"><I d={it.icon} /></span><span><b>{it.t}</b><small>{it.s}</small></span>
          </button>
        ))}
      </span>
    </div>
  );
}

function Detail({ s, item, setItem }) {
  const [open, setOpen] = useState(null);
  const steps = s.steps.map((x, i) => ({ ...x, i })).filter((x) => item === "all" || x.item === item || x.item === null);
  return (
    <section className={`hm-card hm-detail hm-d${s.n}`} aria-live="polite">
      <div className="hm-card-head">
        <h2><span className="hm-ico hm-ico-stage"><I d={s.icon} /></span>{s.n}. {s.title} <span className="hm-h2sub">({s.sub})</span></h2>
        <span className="hm-badge">{s.badge}</span>
      </div>
      <div className="hm-inspect" role="tablist" aria-label="Pipeline inspect">
        <span>PIPELINE INSPECT:</span>
        <button type="button" role="tab" aria-selected={item === "all"} className={item === "all" ? "on" : ""} onClick={() => { setItem("all"); setOpen(null); }}>All {s.title.toLowerCase()}</button>
        {s.items.map((it, i) => (
          <button key={it.t} type="button" role="tab" aria-selected={item === i} className={item === i ? "on" : ""} onClick={() => { setItem(i); setOpen(null); }}>{it.t}</button>
        ))}
      </div>
      {item === "all" ? <p className="hm-desc">{s.desc}</p> : (
        <div className={`hm-itemdesc ${TONES[item]}`}>
          <span className="hm-item-ico"><I d={s.items[item].icon} s={20} /></span>
          <div><b>{s.items[item].t}</b><small>{s.items[item].s}</small><p>{s.items[item].d}</p></div>
        </div>
      )}
      <div className="hm-proto">
        <div><b>SOURCES &amp; PROTOCOLS:</b> {s.protocols}</div>
        <div><b>DATABASE TABLES:</b> <code>{s.tables}</code></div>
      </div>
      <div className="hm-flow-head"><h3>Execution Logic &amp; Operational Flow</h3><small>Click any step to see a simple explanation ⌄</small></div>
      <ol className="hm-flow">
        {steps.map((x, k) => (
          <li key={x.i} className={open === x.i ? "open" : ""}>
            <button type="button" onClick={() => setOpen(open === x.i ? null : x.i)} aria-expanded={open === x.i}>
              <span className="hm-fn">{k + 1}</span>
              <span className="hm-ft"><b>{x.t}:</b> {x.d}</span>
              <span className="hm-fc"><I d="chevron" s={16} /></span>
            </button>
            {open === x.i && <p className="hm-simple"><b>In simple words:</b> {x.simple}</p>}
          </li>
        ))}
      </ol>
      <button type="button" className="ghost small" onClick={() => go(s.link[1])}>Open {s.link[0]} →</button>
    </section>
  );
}

export default function Home() {
  const h = useApi("/factory/home");
  const [sel, setSel] = useState("out");
  const [item, setItem] = useState("all");
  const pickStage = (id) => (i) => { setSel(id); setItem(i); };
  const d = h.data;
  const st = d ? stages(d) : [];
  const cur = st.find((s) => s.id === sel);
  const ms = d ? { ...d.machine_status, total: Object.values(d.machine_status).reduce((x, y) => x + y, 0),
    flagged: d.machine_status.WARNING + d.machine_status.ATTENTION + d.machine_status.CRITICAL + d.machine_status.OFFLINE } : null;
  const probs = d ? ORDER.map((id) => d.problems.find((p) => p.id === id)).filter(Boolean) : [];
  return (
    <div className="hm">
      <div className="hm-top">
        <div className="hm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="true" className="on"><I d="layers" />Application Architecture &amp; Operations Command</button>
          <button type="button" role="tab" aria-selected="false" onClick={() => go("overview")}><I d="chart" />Executive Overview &amp; Analytics</button>
        </div>
        {d && (
          <div className="hm-ground">
            <span>Database grounding: <b>{d.database.engine} · schema twin</b></span>
            <span className="hm-ok">● Real loaded data</span>
            <small>historical export, through {String(d.data_through).slice(0, 10)}</small>
          </div>
        )}
      </div>
      <ApiState loading={h.loading} error={h.error} label="Loading the operations command" hint="Pipeline counts, agent KPIs and the latest run." rows={6} />

      {d && (
        <>
          <div className="hm-row">
            <section className="hm-card hm-pipe-card">
              <div className="hm-card-head">
                <h2><span className="hm-ico"><I d="layers" /></span>System Architecture Pipeline</h2>
                <span className="hm-hint">Click any card to inspect details ⌄</span>
              </div>
              <div className="hm-pipe" role="tablist" aria-label="Architecture stages">
                {st.map((s, i) => (
                  <div key={s.id} className="hm-pipe-cell">
                    <StageCard s={s} on={sel === s.id} item={item} onPick={pickStage(s.id)} />
                    {i < st.length - 1 && <span className="hm-arrow" aria-hidden="true"><I d="arrow" s={16} /></span>}
                  </div>
                ))}
              </div>
            </section>
            <section className="hm-card">
              <div className="hm-card-head">
                <h2><span className="hm-ico hm-ico-red"><I d="flame" /></span>Problems Solved by the Agent</h2>
                <span className="hm-badge">{probs.length} CORE PROBLEMS</span>
              </div>
              <ul className="hm-problems">
                {probs.map((p, i) => {
                  const m = PROBLEMS[p.id];
                  return (
                    <li key={p.id}>
                      <button type="button" className={`hm-problem ${m.cls}`} onClick={() => go(p.go)} title={`Open ${m.head.toLowerCase()} details`}>
                        <span className="hm-pn">0{i + 1}</span>
                        <span className="hm-pt">{m.head} · {m.action}</span>
                        <I d={m.icon} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="hm-row hm-row-top">
            {cur && <Detail key={cur.id} s={cur} item={item} setItem={setItem} />}
            <div className="hm-right">
              <section className="hm-card">
                <div className="hm-card-head">
                  <h2><span className="hm-ico"><I d="agent" /></span>Digital Twin Agent KPIs</h2>
                  <span className="hm-live">LATEST AGENT RUN · REAL DATA</span>
                </div>
                <div className="hm-kpis">
                  <button type="button" className="hm-kpi k-blue" onClick={() => go("twin")}>
                    <span className="hm-kpi-head"><b>Machines monitored</b><I d="cube" /></span>
                    <span className="hm-kpi-val">{fmt(ms.total, 0)}</span>
                    <small>{ms.flagged} flagged by the agent · {ms.NORMAL} normal</small>
                  </button>
                  <button type="button" className="hm-kpi k-orange" onClick={() => go("agent")}>
                    <span className="hm-kpi-head"><b>Agent findings</b><I d="alert" /></span>
                    <span className="hm-kpi-val">{fmt(d.agent.findings ?? 0, 0)}</span>
                    <small>{fmt(d.agent.recommendations ?? 0, 0)} recommendations · {fmt(d.agent.reports ?? 0, 0)} reports</small>
                  </button>
                  <button type="button" className="hm-kpi k-purple" onClick={() => go("reports")}>
                    <span className="hm-kpi-head"><b>Human approvals</b><I d="shield" /></span>
                    <span className="hm-kpi-val">{fmt(d.approvals.pending, 0)}</span>
                    <small>pending a planner · {fmt(d.approvals.approved, 0)} approved &amp; tracked</small>
                  </button>
                  <button type="button" className="hm-kpi k-green" onClick={() => go("overview")}>
                    <span className="hm-kpi-head"><b>Factory OEE (7 days)</b><I d="target" /></span>
                    <span className="hm-kpi-val">{d.kpis.oee_pct == null ? "n/a" : `${fmt(d.kpis.oee_pct, 1)}%`}</span>
                    <small>plan attainment {d.kpis.plan_attainment_pct == null ? "n/a" : `${fmt(d.kpis.plan_attainment_pct, 1)}%`} · 4 lines</small>
                  </button>
                </div>
                <div className="hm-kfoot">
                  <span><I d="check" s={14} /> Agent run {d.agent.status.toLowerCase()}{d.agent.finished_at ? ` ${dt(d.agent.finished_at)}` : ""}</span>
                  <span>{fmt(d.agent.records_processed ?? 0, 0)} records processed</span>
                </div>
              </section>

            </div>
          </div>
        </>
      )}
      {createPortal(
        <button type="button" className="hm-fab" onClick={() => go("chat")} title="Ask the AI Manufacturing Chatbot" aria-label="Open the AI Manufacturing Chatbot"><I d="chat" s={26} /></button>,
        document.body)}
    </div>
  );
}
