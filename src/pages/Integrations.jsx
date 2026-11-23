import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, dt, fmt } from "../api.js";
import { ApiState, Card, DataTable, PageHeader } from "../components.jsx";
import "./integrations.css";

// Integrations & Connectors. Every status and KPI comes from the backend (real connection tests and twin.integration_log).
// Secrets are write-only here: the backend never returns them, and this page never displays or logs them.
const CONN_STATUS = {
  CONNECTED: ["normal", "Connected"], CONFIGURED: ["warning", "Configured, not connected"], NOT_CONFIGURED: ["offline", "Not configured"],
  ERROR: ["critical", "Error (last test failed)"], DISCONNECTED: ["offline", "Disconnected"], DRIVER_MISSING: ["attention", "Driver not installed"],
};
const MONO = { oracle: "OR", mysql: "My", sap: "SAP", sap_hana: "HANA", excel: "XL", snowflake: "SF", rest: "API", opcenter: "MES", teams: "T", powerbi: "BI" };
const DIRECTION = { READ_ONLY: "Read only", READ_AND_EXPORT: "Read + export file", OUTBOUND_AFTER_APPROVAL: "Outbound (approved records only)" };

function ConnStatus({ status }) {
  const [k, label] = CONN_STATUS[status] ?? ["offline", status];
  return <span className={`st-badge st-${k}`}><span className="st-dot" aria-hidden="true" />{label}</span>;
}

function ConnIcon({ id, kind }) {
  return (
    <svg className={`ig-icon ig-${kind}`} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="10" className="ig-icon-bg" />
      {kind === "sql" || kind === "snowflake"
        ? <path d="M14 15c0-2 4.5-3.5 10-3.5S34 13 34 15s-4.5 3.5-10 3.5S14 17 14 15Zm0 0v18c0 2 4.5 3.5 10 3.5S34 35 34 33V15" className="ig-icon-line" />
        : kind === "teams" ? <path d="M12 16h16v16H12zM31 20h6v10a3 3 0 0 1-3 3h-3" className="ig-icon-line" />
          : kind === "powerbi" ? <path d="M14 34V24m7 10V18m7 16v-8m7 8V14" className="ig-icon-line" />
            : kind === "excel" ? <path d="M13 12h16l6 6v18H13zM18 22l8 10m0-10-8 10" className="ig-icon-line" />
              : <path d="M16 18l-6 6 6 6m16-12 6 6-6 6M27 14l-6 20" className="ig-icon-line" />}
      <text x="24" y="44.5" textAnchor="middle" className="ig-icon-text">{MONO[id] ?? id.slice(0, 3)}</text>
    </svg>
  );
}

function ErrorLine({ err }) {
  if (!err) return null;
  const hint = err.status === 401 ? " Choose a user in the top bar." : err.status === 403 ? " Your role does not allow this." : "";
  return <div className="error-box" role="alert"><strong>Error{err.status ? ` ${err.status}` : ""}</strong> {err.message}{hint}</div>;
}

function ConfigForm({ c, onSaved, onCancel }) {
  const init = useMemo(() => Object.fromEntries(c.fields.map((f) => [f.name, f.secret ? "" : (c.config?.[f.name] ?? f.default ?? "")])), [c]);
  const [form, setForm] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    // empty secret inputs are omitted: the backend keeps the current secret
    const body = Object.fromEntries(Object.entries(form).filter(([k, v]) => !(c.fields.find((f) => f.name === k)?.secret && !v)).map(([k, v]) => [k, v === null ? "" : String(v)]));
    try { await api(`/integrations/${c.id}/configure`, { method: "POST", body }); onSaved(); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const hasSecret = c.fields.some((f) => f.secret);
  return createPortal(
    <div className="ig-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
    <form className="ig-modal" onSubmit={save} role="dialog" aria-modal="true" aria-label={`Configure ${c.name}`}>
      <header className="ig-modal-head">
        <ConnIcon id={c.id} kind={c.kind} />
        <div><h3>Configure {c.name}</h3><ConnStatus status={c.status} /></div>
        <button type="button" className="ghost small ig-x" onClick={onCancel} aria-label="Close">✕</button>
      </header>
      {hasSecret && (
        <p className="ig-secret-note">Secrets are write-only: held in backend memory (lost on restart) or set as <code>INTEG_{c.id.toUpperCase()}_&lt;FIELD&gt;</code> in backend/.env.
          They are never stored in the database or shown again. Leave a secret empty to keep the current value.</p>
      )}
      <div className="ig-form">
      {c.fields.map((f) => (
        <label key={f.name} className={`field ${f.type === "textarea" ? "ig-wide" : ""}`}>
          <span>{f.label}{f.required ? " *" : ""}</span>
          {f.type === "select" ? (
            <select value={form[f.name] ?? ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === "textarea" ? (
            <textarea rows={3} value={form[f.name] ?? ""} placeholder={c.default_mapping && f.name === "data_mapping" ? JSON.stringify(c.default_mapping) : ""}
              onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
          ) : (
            <input type={f.secret ? "password" : f.type === "number" ? "number" : "text"} autoComplete={f.secret ? "new-password" : "off"} value={form[f.name] ?? ""}
              placeholder={f.secret ? (c.secrets_set?.[f.name] ? `set (${c.secrets_set[f.name]}) – leave empty to keep` : "not set") : ""}
              onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
          )}
          {f.help && <small>{f.help}</small>}
        </label>
      ))}
      </div>
      <ErrorLine err={err} />
      <footer className="ig-modal-foot">
        <span className="muted-text">Saving resets the connection: test and connect again afterwards.</span>
        <div>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save configuration"}</button>
        </div>
      </footer>
    </form>
    </div>,
    document.body);
}

function ConnectorCard({ c, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const act = async (action) => {
    setBusy(action); setErr(null); setResult(null);
    try {
      const r = await api(`/integrations/${c.id}/${action}`, { method: "POST" });
      const res = r.result ?? null;
      setResult(res ? { action, ...res } : { action, ok: true });
      onChanged();
    } catch (x) { setErr(x); onChanged(); } finally { setBusy(""); }
  };
  const configured = !["NOT_CONFIGURED", "DRIVER_MISSING"].includes(c.status);
  return (
    <article className={`ig-card ig-s-${(CONN_STATUS[c.status] ?? ["offline"])[0]}`} aria-label={c.name}>
      <header className="ig-head">
        <ConnIcon id={c.id} kind={c.kind} />
        <div>
          <h3>{c.name}</h3>
          <ConnStatus status={c.status} />
        </div>
      </header>
      <dl className="ig-meta">
        <dt>Direction</dt><dd>{DIRECTION[c.direction] ?? c.direction}</dd>
        <dt>Events</dt><dd><ul>{c.events.map((e) => <li key={e}>{e}</li>)}</ul></dd>
        <dt>Last test</dt><dd>{c.last_test_at ? `${dt(c.last_test_at)} · ${c.last_test_ok ? "OK" : "failed"}` : "never"}</dd>
        <dt>Last sync</dt><dd>{c.last_sync_at ? dt(c.last_sync_at) : "never"}</dd>
        {c.missing?.length > 0 && <><dt>Missing</dt><dd className="ig-missing">{c.missing.join(", ")}</dd></>}
        {!c.driver_installed && <><dt>Driver</dt><dd className="ig-missing">Python package '{c.driver}' is not installed on the backend</dd></>}
      </dl>
      {c.note && <p className="muted-text ig-note">{c.note}</p>}
      <div className="ig-buttons">
        <button type="button" className="ghost small" onClick={() => setOpen(true)} aria-haspopup="dialog">Configure</button>
        <button type="button" className="ghost small" disabled={!configured || !!busy} onClick={() => act("test")}>{busy === "test" ? "Testing…" : "Test connection"}</button>
        <button type="button" className="ghost small" disabled={c.status !== "CONNECTED" || !!busy} onClick={() => act("sync")}>{busy === "sync" ? "Syncing…" : "Sync"}</button>
        {c.enabled && c.status === "CONNECTED"
          ? <button type="button" className="ghost small" disabled={!!busy} onClick={() => act("disconnect")}>Disconnect</button>
          : <button type="button" className="primary small" disabled={!configured || !!busy} onClick={() => act("connect")}>{busy === "connect" ? "Connecting…" : "Connect"}</button>}
      </div>
      <ErrorLine err={err} />
      {result && (
        <div className={`ig-result ${result.ok === false ? "bad" : "good"}`} role="status">
          {result.action}: {result.ok === false ? `failed – ${result.error}` : "OK"}
          {result.latency_ms != null && ` · ${result.latency_ms} ms`}{result.records != null && ` · ${fmt(result.records)} records`}
          {result.note && ` · ${result.note}`}
        </div>
      )}
      {open && <ConfigForm c={c} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); onChanged(); }} />}
    </article>
  );
}

function SendPanel({ connectors, onSent }) {
  const targets = connectors.filter((c) => c.status === "CONNECTED" && c.can_send);
  const [records, setRecords] = useState({ items: [], error: null });
  const [tool, setTool] = useState("");
  const [rec, setRec] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(null);
  const [resp, setResp] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { api("/integrations/records").then((d) => setRecords({ items: d.items ?? [], error: null }), (e) => setRecords({ items: [], error: e })); }, []);
  const sel = records.items.find((r) => `${r.type}:${r.id}` === rec);
  const body = sel ? { record_type: sel.type, record_id: sel.id, note: note || undefined } : null;
  const doPreview = async () => {
    setBusy("preview"); setErr(null); setPreview(null); setResp(null);
    try { setPreview(await api(`/integrations/${tool}/preview`, { method: "POST", body })); } catch (x) { setErr(x); } finally { setBusy(""); }
  };
  const doSend = async () => {
    setBusy("send"); setErr(null); setResp(null);
    try { setResp((await api(`/integrations/${tool}/send`, { method: "POST", body })).result); } catch (x) { setErr(x); } finally { setBusy(""); onSent(); }
  };
  return (
    <Card title="Send a record to a connected tool">
      <ol className="ig-steps">
        <li>
          <label className="field"><span>1. Connected tool</span>
            <select value={tool} onChange={(e) => { setTool(e.target.value); setPreview(null); setResp(null); }}>
              <option value="">{targets.length ? "Choose a tool" : "No connected tool can receive records yet"}</option>
              {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </li>
        <li>
          <label className="field"><span>2. Manufacturing record</span>
            <select value={rec} onChange={(e) => { setRec(e.target.value); setPreview(null); setResp(null); }}>
              <option value="">Choose a record</option>
              {records.items.map((r) => (
                <option key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`} disabled={!r.sendable}>
                  {r.type === "recommendation" ? "Recommendation" : "Report"} · {r.label}{!r.sendable ? " (needs approval)" : ""}
                </option>
              ))}
            </select>
            <small>Only APPROVED recommendations can be sent; pending ones are listed but disabled.</small>
          </label>
        </li>
        <li><label className="field"><span>3. Note (optional)</span><input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label></li>
      </ol>
      {records.error && <ErrorLine err={records.error} />}
      <div className="ig-actions">
        <button type="button" className="ghost" disabled={!tool || !body || !!busy} onClick={doPreview}>{busy === "preview" ? "Building…" : "4. Preview payload"}</button>
        <button type="button" className="primary" disabled={!tool || !body || !preview || !!busy || !!preview?.blocked_reason} onClick={doSend}>{busy === "send" ? "Sending…" : "5. Send"}</button>
      </div>
      {!targets.length && <p className="muted-text">Connect SAP, REST API, Excel, Microsoft Teams or Power BI first. Nothing is sent from this page unless the target accepts it.</p>}
      <ErrorLine err={err} />
      {preview && (
        <div className="ig-json">
          <h4>Payload preview {preview.blocked_reason && <span className="st-badge st-attention">{preview.blocked_reason}</span>}</h4>
          <pre>{JSON.stringify(preview.payload, null, 2)}</pre>
        </div>
      )}
      {resp && (
        <div className="ig-json">
          <h4>6. Response</h4>
          <pre>{JSON.stringify(resp.response, null, 2)}</pre>
          <p className="muted-text">7. The send is recorded in the activity table below.</p>
        </div>
      )}
    </Card>
  );
}

export default function Integrations() {
  const [data, setData] = useState({ loading: true, error: null, d: null });
  const [actv, setActv] = useState({ items: [], error: null });
  const load = useCallback(() => {
    api("/integrations").then((d) => setData({ loading: false, error: null, d }), (e) => setData((s) => ({ ...s, loading: false, error: e })));
    api("/integrations/activity?limit=100").then((d) => setActv({ items: d.items ?? [], error: null }), (e) => setActv({ items: [], error: e }));
  }, []);
  useEffect(load, [load]);
  const d = data.d;
  const kpis = d ? [
    ["Total connectors", d.total], ["Active connectors", d.active], ["Records sent", fmt(d.records_sent)], ["Failed calls", d.failed_calls],
    ["Last sync", d.last_sync ? dt(d.last_sync) : "never"],
  ] : [];
  return (
    <>
      <PageHeader title="Integrations & Connectors" subtitle="Ten enterprise connectors. Statuses come from real connection tests; KPIs from the integration log." state="LIVE" />
      <div className="notice">Secrets are write-only and stay on the backend (memory or backend/.env). Database connectors and Siemens Opcenter MES are read-only.
        A recommendation can be sent to an external system only after a planner approved it. No connector can reach PLC/SCADA.</div>
      <ApiState loading={data.loading} error={data.error} label="Loading connectors" hint="Ten enterprise connectors and their integration log." rows={4} />
      {d && (
        <div className="page-grid">
          <div className="kpi-grid" role="list" aria-label="Integration KPIs">
            {kpis.map(([k, v]) => <div key={k} className="kpi ig-kpi" role="listitem"><div className="k-label">{k}</div><div className="k-value">{v}</div><div className="k-hint">from integration log</div></div>)}
          </div>
          <div className="ig-grid">{d.items.map((c) => <ConnectorCard key={c.id} c={c} onChanged={load} />)}</div>
          <SendPanel connectors={d.items} onSent={load} />
          <Card title="Integration activity">
            {actv.error && <ErrorLine err={actv.error} />}
            <DataTable caption="Latest 100 integration calls (append-only log)" rows={actv.items} columns={[
              { key: "ts", label: "When", render: (r) => dt(r.ts) },
              { key: "connector_id", label: "Connector", render: (r) => d.items.find((c) => c.id === r.connector_id)?.name ?? r.connector_id },
              { key: "action", label: "Action" },
              { key: "record_ref", label: "Record", render: (r) => r.record_ref ?? "–" },
              { key: "status", label: "Status", render: (r) => <span className={`st-badge st-${{ OK: "normal", FAILED: "critical", BLOCKED: "attention", NOT_CONFIGURED: "offline" }[r.status] ?? "offline"}`}>{r.status}</span> },
              { key: "records", label: "Records", num: true },
              { key: "actor", label: "By" },
              { key: "error", label: "Error details", render: (r) => r.error ?? "" },
            ]} />
          </Card>
        </div>
      )}
    </>
  );
}
