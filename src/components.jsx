import { useEffect, useState } from "react";
import { fmt } from "./api.js";

export const AXIS = { fill: "var(--chart-axis)", fontFamily: "inherit", fontSize: 12 };
export const SERIES = ["var(--chart-c1)", "var(--chart-c2)", "var(--chart-c3)", "var(--chart-c4)", "var(--chart-o3)", "var(--chart-o1)"];

export function StateBadge({ type }) {
  const live = type === "LIVE";
  return (
    <span className={`badge ${live ? "badge-live" : "badge-sim"}`} title={live ? "Measured: from MES data" : "Simulated: output of the twin, not a measurement"}>
      <span aria-hidden="true">{live ? "●" : "◇"}</span> {live ? "LIVE" : "SIMULATED"}
    </span>
  );
}

const VERDICT = {
  VALIDATED: { cls: "v-ok", icon: "✓", text: "VALIDATED" },
  NEEDS_REVIEW: { cls: "v-warn", icon: "⚠", text: "NEEDS REVIEW" },
  NOT_VALIDATED: { cls: "v-bad", icon: "✕", text: "NOT VALIDATED" },
};
export function VerdictBadge({ verdict }) {
  const v = VERDICT[verdict] ?? { cls: "v-none", icon: "?", text: verdict ? String(verdict) : "NOT CALIBRATED" };
  return <span className={`badge ${v.cls}`}><span aria-hidden="true">{v.icon}</span> {v.text}</span>;
}

export function FreshnessBadge({ hours }) {
  if (hours === null || hours === undefined) return <span className="badge v-none">Data freshness: n/a</span>;
  const stale = hours > 24;
  return <span className={`badge ${stale ? "v-warn" : "v-ok"}`}><span aria-hidden="true">{stale ? "⚠" : "✓"}</span> Data age {fmt(hours, 0)} h{stale ? " (stale)" : ""}</span>;
}

// Persistent banner stating whether the view shows LIVE (MES) or SIMULATED (twin) data.
export function StateBanner({ type, children }) {
  const live = type === "LIVE";
  return (
    <div className={`state-banner ${live ? "frame-live" : "frame-sim"}`} role="status">
      <StateBadge type={type} />
      <span>{children ?? (live ? "Showing measured values from MES (fact_hourly_production)." : "Showing simulated values from the digital twin. These are predictions, not measurements.")}</span>
    </div>
  );
}

// Model version, validation status and assumptions: shown on every page.
export function ModelBar({ meta, extraAssumptions = [] }) {
  const assumptions = [...(meta?.assumptions ?? []), ...extraAssumptions];
  return (
    <section className="modelbar" aria-label="Model information">
      <div className="modelbar-row">
        <span><strong>Model</strong> {meta?.model_version ?? "n/a"}</span>
        <span><strong>Validation</strong> <VerdictBadge verdict={meta?.validation_status} /></span>
        <span className="muted-text">Changes happen only through normal change control. Nothing here acts on the plant.</span>
      </div>
      <details className="assumptions">
        <summary>Assumptions ({assumptions.length})</summary>
        {assumptions.length === 0
          ? <p>No assumptions returned by the API for this view.</p>
          : <ul>{assumptions.map((a, i) => <li key={i}>{typeof a === "string" ? a : `${a.id ? a.id + ": " : ""}${a.text ?? JSON.stringify(a)}`}</li>)}</ul>}
      </details>
    </section>
  );
}

export function PageHeader({ title, subtitle, state }) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {state && <StateBadge type={state} />}
    </header>
  );
}

export function ApiState({ loading, error, label, hint, rows }) {
  if (loading) return <Loader label={label} hint={hint} rows={rows} />;
  if (error) return (
    <div className="error-box" role="alert">
      <strong><span aria-hidden="true">{"✕"} </span>Error{error.status ? ` ${error.status}` : ""}</strong>
      <div>{error.message}</div>
    </div>
  );
  return null;
}

export function Card({ title, children, className = "", actions }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-head">{title && <h3>{title}</h3>}{actions}</div>}
      {children}
    </section>
  );
}

export function Tile({ label, value, unit, hint, state }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}{unit && <span className="tile-unit"> {unit}</span>}</div>
      {hint && <div className="tile-hint">{hint}</div>}
      {state && <StateBadge type={state} />}
    </div>
  );
}

export function DataTable({ columns, rows, caption }) {
  return (
    <div className="table-wrap">
      <table className="data">
        {caption && <caption>{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? "num" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length}>No rows.</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>{columns.map((c) => <td key={c.key} className={c.num ? "num" : ""}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Chart with a text alternative and a "show data table" toggle (WCAG).
export function ChartBlock({ title, description, columns, rows, children }) {
  const [table, setTable] = useState(false);
  return (
    <Card title={title} actions={<button type="button" className="ghost small" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Show chart" : "Show data table"}</button>}>
      <p className="muted-text" id={`desc-${title}`}>{description}</p>
      {table
        ? <DataTable columns={columns} rows={rows} caption={`${title} (data)`} />
        : <div className="chart" role="img" aria-label={`${title}. ${description}`}>{children}</div>}
    </Card>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// Machine / finding status: green normal, yellow warning, orange attention, red critical, grey offline.
export const STATUS_VAR = { NORMAL: "normal", WARNING: "warning", ATTENTION: "attention", CRITICAL: "critical", OFFLINE: "offline" };
export function StatusBadge({ status }) {
  if (!status) return <span className="badge v-none">no agent run</span>;
  const k = STATUS_VAR[status] ?? "offline";
  return <span className={`st-badge st-${k}`}><span className="st-dot" aria-hidden="true" />{status}</span>;
}
// Provenance of a value: ACTUAL (as supplied), CALCULATED (stated rule), PREDICTED (validated model), SIMULATED (twin what-if).
export function ValueLabel({ label }) {
  if (!label) return null;
  return <span className={`vl vl-${String(label).toLowerCase()}`} title={{ ACTUAL: "As supplied in the dataset", CALCULATED: "Derived by a stated rule", PREDICTED: "Output of a validated model", SIMULATED: "Twin what-if, not a measurement" }[label]}>{label}</span>;
}
export const RISK_STATUS = { CRITICAL: "CRITICAL", HIGH: "ATTENTION", MEDIUM: "WARNING", LOW: "NORMAL" };

// Shared loader: branded spinner, title, hint, a seconds counter (Neon can take a few seconds to wake up) and shimmer skeleton rows.
// variant: "block" (page section, default), "card" (inside a card), "inline" (small, one line), "overlay" (over a 3D stage).
export function Loader({ label = "Loading data", hint = "Connecting to the plant database. Neon may take a few seconds to wake up.", variant = "block", rows = 3 }) {
  const [sec, setSec] = useState(0);
  useEffect(() => { const t = setInterval(() => setSec((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (variant === "inline") {
    return <span className="ld ld-inline" role="status"><span className="ld-ring ld-ring-sm" aria-hidden="true" />{label}…</span>;
  }
  return (
    <div className={`ld ld-${variant}`} role="status" aria-live="polite">
      <div className="ld-head">
        <span className="ld-ring" aria-hidden="true"><i /></span>
        <div className="ld-text">
          <b>{label}<span className="ld-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></b>
          <small>{sec >= 4 ? `Still working… ${sec} s. ${hint}` : hint}</small>
        </div>
      </div>
      {rows > 0 && variant !== "overlay" && (
        <div className="ld-skel" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => <span key={i} style={{ width: `${[92, 74, 58, 83, 66][i % 5]}%` }} />)}
        </div>
      )}
    </div>
  );
}
