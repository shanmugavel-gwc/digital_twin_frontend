import { Fragment, useCallback, useEffect, useState } from "react";
import { api, dt } from "../api.js";
import { ApiState, Card, PageHeader } from "../components.jsx";
import "./admin.css";

// Append-only audit log (a DB trigger blocks UPDATE/DELETE). Filters: actor, entity, action, free text in details.
export default function AuditLogs() {
  const [f, setF] = useState({ actor: "", entity: "", action: "", q: "" });
  const [applied, setApplied] = useState(f);
  const [st, setSt] = useState({ items: [], facets: [], loading: true, error: null, more: true });
  const [open, setOpen] = useState(null);
  const qs = (extra = {}) => new URLSearchParams(Object.entries({ ...applied, limit: 100, ...extra }).filter(([, v]) => v !== "" && v != null)).toString();
  const load = useCallback((before) => {
    setSt((s) => ({ ...s, loading: true, error: null }));
    api(`/audit-logs?${qs(before ? { before_id: before } : {})}`).then(
      (d) => setSt((s) => ({ items: before ? [...s.items, ...d.items] : d.items, facets: d.facets ?? s.facets, loading: false, error: null, more: d.items.length === 100 })),
      (e) => setSt((s) => ({ ...s, loading: false, error: e })));
  }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const facet = (k) => st.facets.filter((x) => x.k === k && x.v);
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every agent run, tool call, decision, configuration change, integration call and notification." state="LIVE" />
      <div className="notice">The audit log is append-only: the database rejects any UPDATE or DELETE, and the application role cannot TRUNCATE it.</div>
      <Card title="Filter" className="">
        <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
          <label className="field"><span>Actor</span>
            <select value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })}><option value="">all</option>{facet("actor").map((x) => <option key={x.v} value={x.v}>{x.v} ({x.n})</option>)}</select></label>
          <label className="field"><span>Entity</span>
            <select value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="">all</option>{facet("entity").map((x) => <option key={x.v} value={x.v}>{x.v} ({x.n})</option>)}</select></label>
          <label className="field"><span>Action contains</span><input value={f.action} placeholder="e.g. APPROVED" onChange={(e) => setF({ ...f, action: e.target.value })} /></label>
          <label className="field"><span>Text in details / id</span><input value={f.q} placeholder="e.g. M-SPI-02" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <button type="submit" className="primary">Apply</button>
          <button type="button" className="ghost" onClick={() => { const e = { actor: "", entity: "", action: "", q: "" }; setF(e); setApplied(e); }}>Clear</button>
        </form>
      </Card>
      <ApiState loading={st.loading && !st.items.length} error={st.error} label="Loading audit log" hint="Every run, decision, setting change and integration call." rows={6} />
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data">
          <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Entity id</th><th>Details</th></tr></thead>
          <tbody>
            {st.items.length === 0 && !st.loading && <tr><td colSpan={7}>No entries.</td></tr>}
            {st.items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="num">{r.id}</td><td>{dt(r.ts)}</td><td className="adm-actor">{r.actor}</td><td>{r.action}</td><td>{r.entity}</td>
                  <td className="adm-wrap">{r.entity_id}</td>
                  <td><button type="button" className="adm-row-btn" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Show"}</button></td>
                </tr>
                {open === r.id && <tr><td colSpan={7}><pre className="adm-json">{JSON.stringify(r.details, null, 2)}</pre></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="adm-actions">
        {st.more && st.items.length > 0 && <button type="button" className="ghost" disabled={st.loading} onClick={() => load(st.items[st.items.length - 1].id)}>{st.loading ? "Loading…" : "Load older"}</button>}
        <span className="muted-text">{st.items.length} entries shown</span>
      </div>
    </>
  );
}
