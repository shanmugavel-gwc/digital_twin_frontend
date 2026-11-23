import { useState } from "react";
import { api, useApi, fmt } from "../api.js";
import { ApiState, Card, DataTable, Field, ModelBar, PageHeader, StateBanner } from "../components.jsx";

// GET /api/scenarios?status=PENDING_REVIEW -> { items:[run] } ; POST /api/scenarios/{id}/decision {decision, reviewer, comment}
// GET /api/audit -> { items:[{id, ts, actor, action, entity, entity_id, details}] }
export default function ReviewQueue() {
  const q = useApi("/scenarios?status=PENDING_REVIEW");
  const audit = useApi("/audit?limit=100");
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState({});

  async function decide(id, decision) {
    const f = form[id] ?? {};
    if (!f.reviewer?.trim() || !f.comment?.trim()) { setMsg((m) => ({ ...m, [id]: { error: "Reviewer name and comment are required." } })); return; }
    try {
      await api(`/scenarios/${id}/decision`, { method: "POST", body: { decision, reviewer: f.reviewer.trim(), comment: f.comment.trim() } });
      setMsg((m) => ({ ...m, [id]: { ok: `${decision}. Recorded as a recommendation only; no plant change is triggered.` } }));
      q.reload(); audit.reload();
    } catch (e) { setMsg((m) => ({ ...m, [id]: { error: e.message } })); }
  }
  const set = (id, k, v) => setForm((f) => ({ ...f, [id]: { ...f[id], [k]: v } }));
  const items = q.data?.items ?? [];

  return (
    <>
      <PageHeader title="Review queue" subtitle="Human engineering review of scenario recommendations (change control)" state="SIMULATED" />
      <StateBanner type="SIMULATED">Approval records a recommendation. It does not change the plant; any change goes through normal change control.</StateBanner>
      <ModelBar meta={q.data} />
      <ApiState loading={q.loading} error={q.error} />
      {q.data && items.length === 0 && <p className="note">No scenarios are waiting for review.</p>}
      {items.map((r) => (
        <Card key={r.run_id} title={`${r.scenario_name} on ${r.line_id}`}>
          <p className="muted-text">Run {r.run_id} | Model {r.model_version} | Validation {r.validation_status} | Confidence {fmt(r.confidence_score)}/100 | Output {fmt(r.predicted_output_units)} units | Bottleneck {r.bottleneck_station_id ?? "n/a"}</p>
          <details className="assumptions"><summary>Assumptions ({(r.assumptions ?? []).length})</summary>
            <ul>{(r.assumptions ?? []).map((a, i) => <li key={i}>{typeof a === "string" ? a : a.text ?? JSON.stringify(a)}</li>)}</ul></details>
          <div className="row" style={{ marginTop: 12 }}>
            <Field label="Reviewer name"><input value={form[r.run_id]?.reviewer ?? ""} onChange={(e) => set(r.run_id, "reviewer", e.target.value)} /></Field>
            <Field label="Comment (required)"><input style={{ minWidth: 300 }} value={form[r.run_id]?.comment ?? ""} onChange={(e) => set(r.run_id, "comment", e.target.value)} /></Field>
            <button type="button" className="primary" onClick={() => decide(r.run_id, "APPROVED")}>Approve recommendation</button>
            <button type="button" className="ghost" onClick={() => decide(r.run_id, "REJECTED")}>Reject</button>
          </div>
          {msg[r.run_id]?.error && <div className="error-box" role="alert" style={{ marginTop: 8 }}><span aria-hidden="true">{"✕"} </span>{msg[r.run_id].error}</div>}
          {msg[r.run_id]?.ok && <p className="note" role="status">{"✓"} {msg[r.run_id].ok}</p>}
        </Card>
      ))}
      <Card title="Audit trail (read-only, append-only)">
        <ApiState loading={audit.loading} error={audit.error} />
        {audit.data && <DataTable
          columns={[{ key: "ts", label: "Time" }, { key: "actor", label: "Actor" }, { key: "action", label: "Action" }, { key: "entity", label: "Entity" }, { key: "entity_id", label: "Entity id" },
                    { key: "details", label: "Details", render: (r) => JSON.stringify(r.details ?? {}).slice(0, 120) }]}
          rows={audit.data.items ?? []} />}
      </Card>
    </>
  );
}
