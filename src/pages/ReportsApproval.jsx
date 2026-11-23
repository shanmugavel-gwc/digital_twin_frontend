import { useEffect, useState } from "react";
import { api, useApi, fmt, go, dt, useCurrentUser, can } from "../api.js";
import { PageHeader, Card, DataTable, ApiState, StatusBadge, ValueLabel, RISK_STATUS } from "../components.jsx";
import "./reports.css";

// Reports & Human Approval. Approval records a decision only: no work order or plant change is created automatically.
const STATUSES = ["PENDING_REVIEW", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "SUPERSEDED", ""];
const SLABEL = { PENDING_REVIEW: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CHANGES_REQUESTED: "Changes requested", SUPERSEDED: "Superseded", "": "All" };

function Risk({ level }) {
  return <StatusBadge status={RISK_STATUS[level] ?? "OFFLINE"} />;
}
function RiskText({ level }) {
  return <span className={`rp-risk rp-risk-${String(level).toLowerCase()}`}>{level}</span>;
}

function Evidence({ value, depth = 0 }) {
  if (value === null || value === undefined) return <span className="muted-text">n/a</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="muted-text">none</span>;
    if (value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      const cols = [...new Set(value.flatMap((v) => Object.keys(v)))];
      return (
        <div className="table-wrap"><table className="data rp-ev-table">
          <thead><tr>{cols.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{value.map((v, i) => <tr key={i}>{cols.map((c) => <td key={c}>{typeof v[c] === "object" ? JSON.stringify(v[c]) : String(v[c] ?? "")}</td>)}</tr>)}</tbody>
        </table></div>
      );
    }
    return <span>{value.map(String).join(", ")}</span>;
  }
  if (typeof value === "object") {
    return (
      <dl className={`rp-ev ${depth ? "rp-ev-nested" : ""}`}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="rp-ev-row"><dt>{k.replaceAll("_", " ")}</dt><dd><Evidence value={v} depth={depth + 1} /></dd></div>
        ))}
      </dl>
    );
  }
  if (typeof value === "number") return <span>{fmt(value, Number.isInteger(value) ? 0 : 2)}</span>;
  return <span>{String(value)}</span>;
}

// ----------------------------------------------------------------------------------------------------- approval queue
function RecDetail({ id, onChanged }) {
  const { user } = useCurrentUser();
  const [d, setD] = useState({ loading: true, error: null, rec: null });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [act, setAct] = useState({ action_status: "IN_PROGRESS", work_order_ref: "", note: "" });
  const load = () => {
    setD((x) => ({ ...x, loading: true, error: null }));
    api(`/recommendations/${id}`).then((r) => setD({ loading: false, error: null, rec: r.recommendation }), (e) => setD({ loading: false, error: e, rec: null }));
  };
  useEffect(load, [id]);
  const r = d.rec;
  const decide = (decision) => {
    if (!comment.trim()) { setMsg({ bad: true, text: "A comment is required for every decision." }); return; }
    setBusy(true); setMsg(null);
    api(`/recommendations/${id}/decision`, { method: "POST", body: { decision, comment } })
      .then((x) => { setD({ loading: false, error: null, rec: x.recommendation }); setComment(""); setMsg({ text: `Recorded: ${decision}. No plant change or work order was created.` }); onChanged?.(); },
        (e) => setMsg({ bad: true, text: `${e.status ? e.status + ": " : ""}${e.message}` }))
      .finally(() => setBusy(false));
  };
  const track = () => {
    setBusy(true); setMsg(null);
    api(`/recommendations/${id}/action`, { method: "POST", body: act })
      .then((x) => { setD({ loading: false, error: null, rec: x.recommendation }); setMsg({ text: "Action tracking updated." }); onChanged?.(); },
        (e) => setMsg({ bad: true, text: `${e.status ? e.status + ": " : ""}${e.message}` }))
      .finally(() => setBusy(false));
  };
  if (d.loading && !r) return <ApiState loading label="Loading recommendation" hint="Evidence, finding, machine information and review history." rows={6} />;
  if (d.error) return <ApiState error={d.error} />;
  if (!r) return null;
  const pending = r.status === "PENDING_REVIEW";
  const planner = can(user, "PLANNER");
  return (
    <div className="rp-detail">
      <div className="rp-detail-head">
        <div>
          <div className="rp-chips"><Risk level={r.risk_level} /><span className="rp-status">{SLABEL[r.status] ?? r.status}</span><span className="rp-cat">{r.category}</span></div>
          <h3>{r.issue}</h3>
          <p className="muted-text">Recommendation {r.rec_id.slice(0, 8)} · run <a href={`#agent?run=${r.run_id}`}>{r.run_id.slice(0, 8)}</a> · created {dt(r.created_at)}</p>
        </div>
      </div>
      <div className="notice">Approval records a decision only. No work order, external action or plant change is created automatically; approval_required is always true.</div>

      <section className="rp-sec">
        <h4>Suggested action</h4>
        <p className="rp-action">{r.action}</p>
        <dl className="rp-kv">
          <div><dt>Risk level</dt><dd><RiskText level={r.risk_level} /></dd></div>
          <div><dt>Business impact (expected)</dt><dd>{r.expected_impact ?? "n/a (not measurable from the data)"}</dd></div>
          <div><dt>Confidence</dt><dd>{r.confidence != null ? `${fmt(r.confidence * 100, 0)}% (validated twin model)` : "n/a (rule-based)"}</dd></div>
          <div><dt>Action status</dt><dd>{r.action_status}{r.work_order_ref ? ` · WO ${r.work_order_ref}` : ""}</dd></div>
        </dl>
      </section>

      <section className="rp-sec">
        <h4>Why (explanation)</h4>
        <p>{r.explanation}</p>
        {r.finding && (
          <>
            <p className="muted-text">Finding #{r.finding.rank} · <StatusBadge status={r.finding.severity} /> <ValueLabel label={r.finding.value_label} /> {r.finding.state_type === "SIMULATED" && <ValueLabel label="SIMULATED" />}</p>
            {r.finding.root_causes?.length > 0 && (
              <>
                <h5>Possible causes (ranked from records, not inferred)</h5>
                <ul className="rp-causes">{r.finding.root_causes.map((c, i) => <li key={i}><b>{c.cause}</b> · {c.basis} <span className="muted-text">({c.source})</span></li>)}</ul>
              </>
            )}
          </>
        )}
      </section>

      {r.machine && (
        <section className="rp-sec">
          <h4>Machine</h4>
          <dl className="rp-kv">
            <div><dt>Machine</dt><dd><a href={`#twin?machine=${r.machine.machine_id}`}>{r.machine.machine_id}</a> {r.machine.machine_name}</dd></div>
            <div><dt>Type / line</dt><dd>{r.machine.machine_type} · {r.machine.line_id}</dd></div>
            <div><dt>Station / zone</dt><dd>{r.machine.station_id ?? "n/a"} · {r.machine.zone ?? "n/a"}</dd></div>
            <div><dt>Criticality</dt><dd>{r.machine.criticality}</dd></div>
            {r.machine_state && <div><dt>Health / risk</dt><dd><StatusBadge status={r.machine_state.status} /> {fmt(r.machine_state.health_score, 0)} / {fmt(r.machine_state.risk_score, 0)} <ValueLabel label="CALCULATED" /></dd></div>}
          </dl>
        </section>
      )}

      <section className="rp-sec">
        <details open>
          <summary><h4 className="rp-inline">Supporting evidence</h4></summary>
          <Evidence value={r.evidence} />
        </details>
      </section>

      {r.reports?.length > 0 && (
        <section className="rp-sec">
          <h4>Generated reports</h4>
          <ul className="rp-links">{r.reports.map((x) => <li key={x.report_id}><a href={`#reports?tab=reports&report=${x.report_id}`}>{x.report_id}</a> {x.title}</li>)}</ul>
        </section>
      )}

      <section className="rp-sec rp-decide">
        <h4>Decision</h4>
        {!user && <p className="notice warn">Select a user in the top bar ("Acting as") to comment or decide. Decisions need role PLANNER or ADMIN.</p>}
        <label className="field"><span>Comment (required)</span>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Reason for the decision" />
        </label>
        <div className="rp-btns">
          <button type="button" className="primary" disabled={busy || !pending || !planner} onClick={() => decide("APPROVED")}>Approve</button>
          <button type="button" className="rp-btn-reject" disabled={busy || !pending || !planner} onClick={() => decide("REJECTED")}>Reject</button>
          <button type="button" className="ghost" disabled={busy || !pending || !planner} onClick={() => decide("CHANGES_REQUESTED")}>Request changes</button>
          <button type="button" className="ghost" disabled={busy || !can(user, "ENGINEER")} onClick={() => decide("COMMENT")}>Add comment</button>
        </div>
        {!pending && <p className="muted-text">This recommendation is {SLABEL[r.status] ?? r.status}; only comments can be added.</p>}
        {pending && user && !planner && <p className="muted-text">{user.display_name} is {user.role}: approving, rejecting and requesting changes need PLANNER or ADMIN.</p>}
        {msg && <p className={msg.bad ? "error-box" : "notice"} role="status">{msg.text}</p>}
      </section>

      {r.status === "APPROVED" && (
        <section className="rp-sec">
          <h4>Action tracking</h4>
          <div className="rp-track">
            <label className="field"><span>Execution status</span>
              <select value={act.action_status} onChange={(e) => setAct({ ...act, action_status: e.target.value })}>
                {["NOT_STARTED", "IN_PROGRESS", "DONE", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="field"><span>Work order reference</span><input value={act.work_order_ref} onChange={(e) => setAct({ ...act, work_order_ref: e.target.value })} maxLength={60} placeholder={r.work_order_ref ?? "e.g. CMMS WO number"} /></label>
            <label className="field"><span>Note</span><input value={act.note} onChange={(e) => setAct({ ...act, note: e.target.value })} maxLength={1000} /></label>
            <button type="button" className="primary" disabled={busy || !planner} onClick={track}>Update</button>
          </div>
          {r.actions?.length > 0 && (
            <DataTable columns={[{ key: "ts", label: "When", render: (x) => dt(x.ts) }, { key: "actor", label: "By" }, { key: "action_status", label: "Status" },
              { key: "work_order_ref", label: "Work order" }, { key: "note", label: "Note" }]} rows={r.actions} />
          )}
        </section>
      )}

      <section className="rp-sec">
        <h4>Review history</h4>
        {r.reviews?.length ? (
          <DataTable columns={[{ key: "decided_at", label: "When", render: (x) => dt(x.decided_at) }, { key: "reviewer", label: "Reviewer" }, { key: "role", label: "Role" },
            { key: "decision", label: "Decision" }, { key: "comment", label: "Comment" }]} rows={r.reviews} />
        ) : <p className="muted-text">No reviews yet.</p>}
      </section>
    </div>
  );
}

function ApprovalQueue({ initialRec }) {
  const [status, setStatus] = useState(initialRec ? "" : "PENDING_REVIEW");
  const [tick, setTick] = useState(0);
  const list = useApi(`/recommendations${status ? `?status=${status}` : ""}&_=${tick}`.replace("&_", status ? "&_" : "?_"));
  const [sel, setSel] = useState(initialRec ?? null);
  const items = list.data?.items ?? [];
  const counts = list.data?.counts?.by_status ?? {};
  useEffect(() => { if (!sel && items.length) setSel(items[0].rec_id); }, [items, sel]);
  return (
    <div className="rp-queue">
      <div className="rp-filters" role="group" aria-label="Status filter">
        {STATUSES.map((s) => (
          <button key={s || "all"} type="button" className={`rp-chip ${status === s ? "on" : ""}`} aria-pressed={status === s} onClick={() => { setStatus(s); setSel(null); }}>
            {SLABEL[s]} <b>{s ? counts[s] ?? 0 : Object.values(counts).reduce((a, b) => a + b, 0)}</b>
          </button>
        ))}
      </div>
      <ApiState loading={list.loading && !list.data} error={list.error} />
      <div className="rp-split">
        <ul className="rp-list" aria-label="Recommendations">
          {items.length === 0 && !list.loading && <li className="muted-text rp-empty">No recommendations with this status. Run the Digital Twin Agent to generate some.</li>}
          {items.map((r) => (
            <li key={r.rec_id}>
              <button type="button" className={`rp-item ${sel === r.rec_id ? "on" : ""}`} onClick={() => setSel(r.rec_id)}>
                <span className="rp-item-top"><RiskText level={r.risk_level} /><span className="rp-asset">{r.machine_id ?? r.line_id ?? "Plant"}</span><span className="rp-status-sm">{SLABEL[r.status]}</span></span>
                <span className="rp-item-title">{r.issue}</span>
                <span className="muted-text rp-item-sub">{r.category} · {dt(r.created_at)}{r.decision ? ` · ${r.decision.decision} by ${r.decision.reviewer}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rp-pane">{sel ? <RecDetail key={sel} id={sel} onChanged={() => setTick((t) => t + 1)} /> : <p className="muted-text">Select a recommendation.</p>}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------- reports
function SendModal({ report, channel, onClose }) {
  const prev = useApi(`/reports/${report.report_id}/email-preview`);
  const [to, setTo] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    api(`/reports/${report.report_id}/notify`, { method: "POST", body: { channel, recipients: to } })
      .then((x) => setRes(x.notification), (e) => setRes({ status: `ERROR ${e.status ?? ""}`, error: e.message }))
      .finally(() => setBusy(false));
  };
  const st = prev.data?.channels?.[channel];
  return (
    <div className="rp-modal-bg" role="dialog" aria-modal="true" aria-label={`Send ${channel === "EMAIL" ? "email" : "Teams message"}`}>
      <div className="rp-modal">
        <div className="rp-modal-head"><h3>{channel === "EMAIL" ? "Send email" : "Send to Microsoft Teams"}</h3><button type="button" className="ghost" onClick={onClose}>Close</button></div>
        <ApiState loading={prev.loading} error={prev.error} label="Preparing email preview" hint="Subject and body built from the report." rows={3} />
        {prev.data && (
          <>
            <p className={st === "CONFIGURED" ? "notice" : "notice warn"}>{channel === "EMAIL" ? "Email (SMTP)" : "Microsoft Teams"}: <b>{st}</b>.
              {st !== "CONFIGURED" && " The message will be stored as NOT_CONFIGURED with this preview; nothing is sent."}</p>
            {channel === "EMAIL" && <label className="field"><span>Recipients (comma separated)</span><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="planner@example.com" /></label>}
            <div className="rp-preview"><div className="rp-preview-sub"><b>Subject:</b> {prev.data.subject}</div><pre>{prev.data.body}</pre></div>
            <div className="rp-btns"><button type="button" className="primary" disabled={busy || !!res} onClick={send}>{busy ? "Sending…" : "Send"}</button></div>
          </>
        )}
        {res && <p className={res.status === "SENT" ? "notice" : "notice warn"} role="status">Result: <b>{res.status}</b>{res.error ? ` · ${res.error}` : ""}</p>}
      </div>
    </div>
  );
}

function ReportView({ id, onChanged }) {
  const { user } = useCurrentUser();
  const [r, setR] = useState({ loading: true, error: null, data: null });
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api(`/reports/${id}`).then((d) => setR({ loading: false, error: null, data: d }), (e) => setR({ loading: false, error: e, data: null }));
  useEffect(() => { setR({ loading: true, error: null, data: null }); load(); }, [id]);
  if (r.loading) return <ApiState loading label="Loading report" hint="Findings, recommendations, KPIs and tables." rows={6} />;
  if (r.error) return <ApiState error={r.error} />;
  const rep = r.data.report;
  const c = rep.content;
  const submit = () => api(`/reports/${id}/submit`, { method: "POST" }).then(() => { setMsg({ text: "Submitted for approval. Decide its recommendations in the approval queue." }); load(); onChanged?.(); },
    (e) => setMsg({ bad: true, text: `${e.status ?? ""} ${e.message}` }));
  return (
    <div className="rp-report">
      <div className="rp-detail-head">
        <div>
          <div className="rp-chips"><RiskText level={rep.priority} /><span className="rp-status">{rep.status}</span><span className="rp-cat">{rep.category}</span></div>
          <h3>{rep.title}</h3>
          <p className="muted-text">{rep.report_id} · for {rep.audience} · scope {rep.scope} · generated by {rep.generated_by} · {dt(rep.created_at)} · data as of {c.data_as_of}</p>
        </div>
      </div>
      <div className="rp-btns rp-actions">
        <a className="primary rp-a" href={`/api/reports/${rep.report_id}/pdf`} download>Download PDF</a>
        <a className="ghost rp-a" href={`/api/reports/${rep.report_id}/xlsx`} download>Export Excel</a>
        <button type="button" className="ghost" disabled={!can(user, "ENGINEER")} onClick={() => setModal("EMAIL")}>Send email</button>
        <button type="button" className="ghost" disabled={!can(user, "ENGINEER")} onClick={() => setModal("TEAMS")}>Send to Microsoft Teams</button>
        <button type="button" className="ghost" disabled={!can(user, "ENGINEER") || rep.status === "SUBMITTED"} onClick={submit}>{rep.status === "SUBMITTED" ? "Submitted" : "Submit for approval"}</button>
      </div>
      {!can(user, "ENGINEER") && <p className="muted-text">Sending and submitting need a selected user with role ENGINEER or higher.</p>}
      {msg && <p className={msg.bad ? "error-box" : "notice"}>{msg.text}</p>}
      <p className="muted-text">{c.labels}</p>
      <p>{c.summary}</p>
      {c.narrative && (
        <div className="rp-narrative"><div className="rp-narr-lbl">Agent summary · LLM text written from the findings below (numbers come from the findings)</div><p>{c.narrative}</p></div>
      )}
      {c.kpis?.length > 0 && (
        <div className="rp-kpis">{c.kpis.map((k, i) => (
          <div key={i} className="rp-kpi"><span className="rp-kpi-l">{k.label} <ValueLabel label={k.value_label} /></span><b>{k.value == null ? "n/a" : typeof k.value === "number" ? fmt(k.value, Number.isInteger(k.value) ? 0 : 1) : k.value}{k.unit && ` ${k.unit}`}</b></div>
        ))}</div>
      )}
      {c.findings?.length > 0 && (
        <>
          <h4>Findings</h4>
          <DataTable columns={[{ key: "rank", label: "#", num: true }, { key: "severity", label: "Severity", render: (f) => <StatusBadge status={f.severity} /> },
            { key: "asset", label: "Asset", render: (f) => f.machine_id ? <a href={`#twin?machine=${f.machine_id}`}>{f.machine_id}</a> : (f.line_id ?? "") },
            { key: "title", label: "Finding", render: (f) => <><b>{f.title}</b><div className="muted-text rp-small">{f.explanation}</div></> },
            { key: "value_label", label: "Label", render: (f) => <ValueLabel label={f.value_label} /> }]} rows={c.findings} />
        </>
      )}
      {c.recommendations?.length > 0 && (
        <>
          <h4>Recommendations (approval required)</h4>
          <DataTable columns={[{ key: "risk_level", label: "Risk", render: (x) => <RiskText level={x.risk_level} /> }, { key: "asset", label: "Asset", render: (x) => x.machine_id ?? x.line_id ?? "" },
            { key: "action", label: "Action" }, { key: "expected_impact", label: "Expected impact", render: (x) => x.expected_impact ?? "n/a" }]} rows={c.recommendations} />
        </>
      )}
      {(c.tables ?? []).filter((t) => t.rows?.length).map((t, i) => (
        <div key={i}>
          <h4>{t.title}</h4>
          <div className="table-wrap"><table className="data">
            <thead><tr>{t.columns.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{t.rows.map((row, j) => <tr key={j}>{row.map((v, k) => <td key={k}>{typeof v === "number" ? fmt(v, Number.isInteger(v) ? 0 : 1) : String(v ?? "")}</td>)}</tr>)}</tbody>
          </table></div>
        </div>
      ))}
      {r.data.notifications?.length > 0 && (
        <>
          <h4>Notifications for this report</h4>
          <DataTable columns={[{ key: "channel", label: "Channel" }, { key: "status", label: "Status" }, { key: "recipients", label: "To" }, { key: "actor", label: "By" },
            { key: "created_at", label: "When", render: (x) => dt(x.created_at) }, { key: "error", label: "Error" }]} rows={r.data.notifications} />
        </>
      )}
      {modal && <SendModal report={rep} channel={modal} onClose={() => { setModal(null); load(); }} />}
    </div>
  );
}

function Reports({ initial }) {
  const [cat, setCat] = useState("");
  const [tick, setTick] = useState(0);
  const list = useApi(`/reports?limit=200${cat ? `&category=${cat}` : ""}&_=${tick}`);
  const [sel, setSel] = useState(initial ?? null);
  const items = list.data?.items ?? [];
  useEffect(() => { if (!sel && items.length) setSel(items[0].report_id); }, [items, sel]);
  const ch = list.data?.channels ?? {};
  return (
    <div>
      <div className="rp-filters">
        <label className="field rp-inline-field"><span>Category</span>
          <select value={cat} onChange={(e) => { setCat(e.target.value); setSel(null); }}>
            <option value="">All categories</option>
            {(list.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.title} ({c.audience})</option>)}
          </select>
        </label>
        <span className="muted-text">Email: <b>{ch.EMAIL ?? "n/a"}</b> · Microsoft Teams: <b>{ch.TEAMS ?? "n/a"}</b></span>
      </div>
      <ApiState loading={list.loading && !list.data} error={list.error} />
      <div className="rp-split">
        <div className="rp-list-wrap">
          <div className="table-wrap"><table className="data rp-rep-table">
            <thead><tr><th>Report</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={3}>No reports yet. Run the Digital Twin Agent.</td></tr>}
              {items.map((x) => (
                <tr key={x.report_id} className={sel === x.report_id ? "on" : ""} onClick={() => setSel(x.report_id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(x.report_id)}>
                  <td><b>{x.title}</b><div className="muted-text rp-small">{x.report_id} · {x.audience} · {x.generated_by} · {dt(x.created_at)} · {x.findings ?? 0} findings, {x.recommendations ?? 0} recs · {x.scope}</div></td>
                  <td><RiskText level={x.priority} /></td><td>{x.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="rp-pane">{sel ? <ReportView key={sel} id={sel} onChanged={() => setTick((t) => t + 1)} /> : <p className="muted-text">Select a report.</p>}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------- notifications
function Notifications() {
  const { user } = useCurrentUser();
  const [tick, setTick] = useState(0);
  const list = useApi(`/notifications?limit=100&_=${tick}`);
  const [msg, setMsg] = useState(null);
  const send = (n) => api(`/notifications/${n.id}/send`, { method: "POST", body: {} })
    .then((x) => { setMsg({ text: `Notification ${n.id}: ${x.notification.status}${x.notification.error ? ` · ${x.notification.error}` : ""}` }); setTick((t) => t + 1); },
      (e) => setMsg({ bad: true, text: `${e.status ?? ""} ${e.message}` }));
  const ch = list.data?.channels ?? {};
  return (
    <div>
      <p className="muted-text">Email: <b>{ch.EMAIL ?? "n/a"}</b> · Microsoft Teams: <b>{ch.TEAMS ?? "n/a"}</b>. A message is shown as SENT only when the server accepted it.</p>
      {msg && <p className={msg.bad ? "error-box" : "notice"}>{msg.text}</p>}
      <ApiState loading={list.loading && !list.data} error={list.error} />
      <DataTable columns={[{ key: "id", label: "#", num: true }, { key: "channel", label: "Channel" }, { key: "subject", label: "Subject" },
        { key: "status", label: "Status", render: (n) => <span className={`rp-nst rp-nst-${n.status.toLowerCase()}`}>{n.status}</span> }, { key: "error", label: "Error" },
        { key: "actor", label: "By" }, { key: "created_at", label: "Created", render: (n) => dt(n.created_at) }, { key: "sent_at", label: "Sent", render: (n) => n.sent_at ? dt(n.sent_at) : "" },
        { key: "act", label: "", render: (n) => ["PREPARED", "NOT_CONFIGURED", "FAILED"].includes(n.status)
          ? <button type="button" className="ghost small" disabled={!can(user, "ENGINEER")} onClick={() => send(n)}>Send</button> : null }]}
        rows={list.data?.items ?? []} />
    </div>
  );
}

export default function ReportsApproval({ params = {} }) {
  const [tab, setTab] = useState(params.tab ?? (params.report ? "reports" : "queue"));
  return (
    <>
      <PageHeader title="Reports & Human Approval" subtitle="Reports produced by the central agent, and the approval queue where a planner decides every recommendation." state="LIVE" />
      <div className="seg rp-tabs" role="tablist" aria-label="Section">
        {[["queue", "Approval queue"], ["reports", "Reports"], ["notifications", "Notifications"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => { setTab(k); go("reports", { tab: k }); }}>{l}</button>
        ))}
      </div>
      {tab === "queue" && <ApprovalQueue initialRec={params.rec} />}
      {tab === "reports" && <Reports initial={params.report} />}
      {tab === "notifications" && <Notifications />}
    </>
  );
}
