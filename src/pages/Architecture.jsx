import { useState } from "react";
import { dt, fmt, go, useApi } from "../api.js";
import { ApiState, DataTable, PageHeader, StateBanner } from "../components.jsx";
import "./architecture.css";

// Architecture & Data Flow: six stages, every figure from GET /api/factory/architecture (real row counts, time ranges, the latest
// agent run's step statuses and the recorded decisions). Click a stage to inspect it.
const STAGES = [
  ["systems", "1", "The plant's systems", "MES · Workforce · SCADA · CMMS · ERP · BI Mart"],
  ["database", "2", "One database", "Neon PostgreSQL, schema twin"],
  ["preparation", "3", "Prepared data & rules", "validation, features, manufacturing rules"],
  ["agent", "4", "The Digital Twin Agent", "one central agent"],
  ["outputs", "5", "Pages & reports", "findings, reports, dashboards"],
  ["decision", "6", "A person decides", "human approval, audit trail"],
];
const d10 = (v) => (v ? String(v).slice(0, 10) : "n/a");
const capCls = (s) => (s.startsWith("AVAILABLE") ? "ok" : s === "PARTIAL" ? "warn" : "bad");

function Systems({ s, open, setOpen }) {
  const cur = s.systems.find((x) => x.id === open);
  return (
    <>
      <div className="ar-cards">
        {s.systems.map((x) => (
          <div key={x.id} className={`ar-card ${x.records ? "" : "ar-off"} ${open === x.id ? "on" : ""}`}>
            <div className="ar-card-head">
              <b>{x.id}</b>
              <span className={`ar-pill ${x.records ? "ok" : "bad"}`}>{x.records ? "LOADED · BATCH EXPORT" : "NOT LOADED"}</span>
            </div>
            <div className="ar-card-desc">{x.description}</div>
            <div className="ar-types">
              {x.data_types.length ? x.data_types.map((t) => <code key={t}>{t}</code>) : <span className="muted-text">none loaded</span>}
            </div>
            <dl className="ar-kv">
              <dt>Records</dt><dd>{fmt(x.records, 0)}</dd>
              <dt>Data through</dt><dd>{d10(x.data_through)}</dd>
              <dt>Last sync</dt><dd>{x.records ? "batch load (no live feed)" : "never"}</dd>
            </dl>
            <button type="button" className={`ghost small ar-card-btn ${open === x.id ? "on" : ""}`} onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
              {open === x.id ? "Hide details" : "View details"}
            </button>
          </div>
        ))}
      </div>
      {cur && (
        <div className="ar-sysdetail" aria-live="polite">
          <div className="ar-sysdetail-head">
            <h4>{cur.id} · {cur.description}</h4>
            <button type="button" className="ghost small" onClick={() => setOpen(null)}>Close</button>
          </div>
          {cur.tables.length > 0 ? (
            <DataTable columns={[{ key: "table", label: "Table" }, { key: "rows", label: "Rows", num: true, render: (r) => fmt(r.rows, 0) },
              { key: "from", label: "From", render: (r) => d10(r.from) }, { key: "to", label: "To", render: (r) => d10(r.to) }]} rows={cur.tables.map((t) => ({ ...t, id: t.table }))} />
          ) : <p className="muted-text">No table from this system is loaded yet.</p>}
          {cur.not_loaded.length > 0 && <p className="muted-text">Not loaded yet: {cur.not_loaded.join("; ")}</p>}
          <p className="muted-text">Last sync: {cur.last_sync ?? "never"}.</p>
        </div>
      )}
    </>
  );
}

function Database({ s }) {
  const db = s.database;
  const tile = (k, v, sub) => <div className="ar-dbtile" key={k}><span>{k}</span><b>{v}</b>{sub && <small>{sub}</small>}</div>;
  const cols = [{ key: "table", label: "Table" }, { key: "rows", label: "Rows", num: true, render: (r) => fmt(r.rows, 0) }];
  return (
    <div className="ar-db">
      <div className="ar-dbtiles">
        {tile("Database", db.name, db.type)}
        {tile("Version", db.version, `schema ${db.schema}`)}
        {tile("Records", fmt(db.records, 0), `${fmt(db.plant_records, 0)} plant data`)}
        {tile("Record types", `${db.record_types} tables`, `${db.views.length} views`)}
        {tile("Plant data through", d10(db.data_through), "historical export")}
        {tile("Last agent write", db.last_app_write ? dt(db.last_app_write) : "run in progress", "latest agent run")}
      </div>
      <div className="ar-avail">
        <span>Availability</span>
        {Object.entries(db.availability).map(([k, v]) => <i key={k} className={v.startsWith("LOADED") ? "ok" : "bad"}>{k}: {v.startsWith("LOADED") ? "loaded" : "not loaded"}</i>)}
      </div>
      <div className="ar-dbtables">
        <div><h4>Plant data tables ({db.plant_tables.length})</h4><DataTable columns={cols} rows={db.plant_tables.map((t) => ({ ...t, id: t.table }))} /></div>
        <div><h4>Application tables ({db.app_tables.length}) · agent, approvals, reports, integrations, audit</h4><DataTable columns={cols} rows={db.app_tables.map((t) => ({ ...t, id: t.table }))} /></div>
      </div>
    </div>
  );
}

function Preparation({ s }) {
  const p = s.preparation;
  const [sel, setSel] = useState(p.stages[0]?.id);
  const cur = p.stages.find((x) => x.id === sel);
  return (
    <div className="ar-grid2">
      <ol className="ar-steps">
        {p.stages.map((x, i) => (
          <li key={x.id}><button type="button" className={sel === x.id ? "on" : ""} onClick={() => setSel(x.id)}>
            <span className="ar-num">{i + 1}</span><span>{x.title}</span><span className="ar-st">{x.status}</span></button></li>
        ))}
      </ol>
      <div>
        {cur && (
          <div className="ar-detail">
            <h4>{cur.title} <span className="ar-st">{cur.status}</span></h4>
            <p>{cur.description}</p>
            {Object.keys(cur.detail).length > 0 && <pre className="ar-json">{JSON.stringify(cur.detail, null, 2)}</pre>}
          </div>
        )}
        <h4>Validation findings of the latest run ({p.validation_failures.length})</h4>
        {p.validation_failures.length === 0 ? <p className="muted-text">None (or the agent has not run yet).</p>
          : <ul className="ar-warn">{p.validation_failures.map((w, i) => <li key={i}>Step {w.step}: {w.message}</li>)}</ul>}
        <p className="muted-text">Source data is never silently fixed: failed checks are reported and kept (docs/DATA_QUALITY.md).</p>
      </div>
    </div>
  );
}

function Agent({ s }) {
  const a = s.agent;
  return (
    <div className="ar-grid2">
      <div className="ar-agent">
        <div className="ar-agent-core"><b>{a.name}</b><span>One central agent with internal capabilities. No independent sub-agents.</span></div>
        <dl className="ar-kv">
          <dt>Machines</dt><dd>{a.machines} (telemetry for every machine)</dd>
          <dt>Sensor channels</dt><dd>{a.sensor_channels.join(", ")}</dd>
          <dt>Sensor series</dt><dd>{a.sensor_series} (machines × channels, hourly, historical)</dd>
        </dl>
        <h4>Latest run steps</h4>
        {a.steps.length === 0 ? <p className="muted-text">Not run yet.</p> : (
          <ol className="ar-runsteps">{a.steps.map((x) => <li key={x.step} className={`rs-${(x.status || "").toLowerCase()}`}>{x.message} <span className="ar-st">{x.status}</span></li>)}</ol>
        )}
        <button type="button" className="primary" onClick={() => go("agent")}>Open Agent Execution</button>
      </div>
      <DataTable columns={[{ key: "capability", label: "Capability" }, { key: "status", label: "Status", render: (r) => <span className={`ar-pill ${capCls(r.status)}`}>{r.status}</span> },
        { key: "basis", label: "Based on" }]} rows={a.capabilities.map((c) => ({ ...c, id: c.capability }))} />
    </div>
  );
}

function Outputs({ s }) {
  return (
    <DataTable columns={[{ key: "title", label: "Output" }, { key: "audience", label: "Intended audience" }, { key: "reports", label: "Reports generated", num: true },
      { key: "last", label: "Latest", render: (r) => dt(r.last) }, { key: "open", label: "", render: () => <button type="button" className="ghost small" onClick={() => go("reports", { tab: "reports" })}>Open</button> }]}
      rows={s.outputs.map((o) => ({ ...o, id: o.category }))} />
  );
}

function Decision({ s }) {
  const d = s.decision;
  return (
    <>
      <div className="ar-counts">
        {[["Pending", d.pending, "warn"], ["Approved", d.approved, "ok"], ["Rejected", d.rejected, "bad"], ["Changes requested", d.changes_requested, "warn"], ["Superseded", d.superseded, ""]].map(([l, n, c]) => (
          <button type="button" key={l} className={`ar-count ${c}`} onClick={() => go("reports")}><b>{n}</b><span>{l}</span></button>
        ))}
      </div>
      <p className="notice">{d.rule}</p>
      <h4>Recent decisions</h4>
      <DataTable columns={[{ key: "decided_at", label: "When", render: (r) => dt(r.decided_at) }, { key: "reviewer", label: "Approver" }, { key: "role", label: "Role" },
        { key: "decision", label: "Decision" }, { key: "issue", label: "Recommendation", render: (r) => `${r.machine_id || r.line_id || ""} ${r.issue}` },
        { key: "comment", label: "Comment" }, { key: "wo", label: "Work order", render: (r) => (r.decision === "APPROVED" ? `${r.action_status}${r.work_order_ref ? ` · ${r.work_order_ref}` : ""}` : "n/a") }]}
        rows={d.recent.map((r, i) => ({ ...r, id: `${r.rec_id}-${i}` }))} />
    </>
  );
}

export default function Architecture() {
  const a = useApi("/factory/architecture");
  const [stage, setStage] = useState("systems");
  const [open, setOpen] = useState(null);
  const s = a.data?.stages;
  const sum = s ? {
    systems: `${s.systems.filter((x) => x.records).length} of ${s.systems.length} loaded`,
    database: `${fmt(s.database.records, 0)} records · ${s.database.record_types} tables`,
    preparation: `${s.preparation.stages.length} stages · ${s.preparation.validation_failures.length} warnings`,
    agent: `${s.agent.machines} machines · ${s.agent.sensor_series} sensor series`,
    outputs: `${s.outputs.reduce((n, o) => n + o.reports, 0)} reports`,
    decision: `${s.decision.pending} pending · ${s.decision.approved} approved`,
  } : {};
  const Body = { systems: Systems, database: Database, preparation: Preparation, agent: Agent, outputs: Outputs, decision: Decision }[stage];
  return (
    <div className="page-grid">
      <PageHeader title="Architecture & Data Flow" subtitle="How plant data becomes findings that a person approves. Click a stage to inspect it." state="LIVE" />
      <StateBanner type="LIVE">All counts are read from the database now. Plant systems are loaded as batch exports (historical, Aug–Oct 2026); no live feed and no write path to the plant.</StateBanner>
      <ApiState loading={a.loading} error={a.error} label="Reading the architecture" hint="Counting records in all 44 tables and reading the latest agent run. This can take 10-15 s the first time." rows={5} />
      {s && (
        <>
          <nav className="ar-flow" aria-label="Six stages">
            {STAGES.map(([id, n, title, sub], i) => (
              <div key={id} className="ar-flow-item">
                <button type="button" className={`ar-stage ${stage === id ? "on" : ""} ${id === "agent" ? "ar-stage-agent" : ""} ${id === "decision" ? "ar-stage-human" : ""}`}
                  onClick={() => setStage(id)} aria-pressed={stage === id}>
                  <span className="ar-num">{n}</span><b>{title}</b><span className="muted-text">{sub}</span><span className="ar-sum">{sum[id]}</span>
                </button>
                {i < STAGES.length - 1 && <span className="ar-arrow" aria-hidden="true">→</span>}
              </div>
            ))}
          </nav>
          <section className="card ar-panel" aria-label="Stage details">
            <h3>{STAGES.find((x) => x[0] === stage)[2]}</h3>
            <Body s={s} open={open} setOpen={setOpen} />
          </section>
        </>
      )}
    </div>
  );
}
