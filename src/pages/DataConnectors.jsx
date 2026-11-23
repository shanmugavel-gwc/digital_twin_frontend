import { useState } from "react";
import { api, useApi, fmt } from "../api.js";
import { ApiState, Card, DataTable, FreshnessBadge, PageHeader, StateBadge } from "../components.jsx";

// GET /api/connectors -> { summary:{connected,not_connected,stale}, assumptions:[{id,text}],
//   connectors:[{ id, name, source_system, category, status, mode, state_type, used_for, message, tables[], latest_ts, age_hours, stale, rows,
//                 config_keys[], needed_to_connect, direction }] }
// Connectors are read-only. NOT_CONNECTED sources contribute nothing to any result.
function StatusBadge({ status, mode }) {
  const ok = status === "CONNECTED";
  if (status === "CONFIGURED") return <span className="badge v-warn" title="Credentials are set but the connection has not been tested"><span aria-hidden="true">◐</span> CONFIGURED (untested)</span>;
  return (
    <span className={`badge ${ok ? "v-ok" : "v-none"}`} title={ok ? "Data is loaded and queryable" : "No data source configured"}>
      <span aria-hidden="true">{ok ? "✓" : "○"}</span> {ok ? (mode === "BATCH_LOAD" ? "CONNECTED (batch load)" : mode === "STATIC_FILE" ? "CONNECTED (static file)" : mode === "ON_DEMAND" ? "CONNECTED (this session)" : "CONNECTED") : "NOT CONNECTED"}
    </span>
  );
}


// Test / browse / preview for the external sources (PostgreSQL, MySQL, SharePoint). All reads; credentials never reach the browser.
function Explore({ c }) {
  const [st, setSt] = useState({ busy: false, error: null, test: null, objects: null, preview: null, obj: "" });
  const run = async (key, path, extra = {}) => {
    setSt((x) => ({ ...x, busy: true, error: null }));
    try {
      const r = await api(path);
      setSt((x) => ({ ...x, busy: false, [key]: key === "test" ? r.result : key === "objects" ? r.objects : r.preview, ...extra }));
    } catch (e) { setSt((x) => ({ ...x, busy: false, error: e })); }
  };
  const base = `/connectors/${c.id}`;
  const cols = (st.preview?.columns ?? []).map((k) => ({ key: k, label: k }));
  return (
    <div className="explore">
      <div className="row">
        <button type="button" className="ghost" disabled={st.busy} onClick={() => run("test", `${base}/test`)}>Test connection</button>
        <button type="button" className="ghost" disabled={st.busy} onClick={() => run("objects", `${base}/objects`, { preview: null, obj: "" })}>{c.id === "sharepoint" ? "List files" : "List tables"}</button>
        {st.busy && <span className="muted-text" role="status">Working…</span>}
      </div>
      <ApiState loading={false} error={st.error} />
      {st.test && <p className="note" role="status">Connection OK{st.test.server ? `: ${st.test.server}` : ""}{st.test.database ? ` (database ${st.test.database})` : ""}{st.test.files != null ? `: ${st.test.files} file(s) in ${st.test.folder}` : ""}.</p>}
      {st.objects && (
        <label className="field"><span>{c.id === "sharepoint" ? "File" : "Table"} ({st.objects.length})</span>
          <select value={st.obj} onChange={(e) => { const v = e.target.value; setSt((x) => ({ ...x, obj: v, preview: null })); if (v) run("preview", `${base}/preview?object=${encodeURIComponent(v)}&limit=10`); }}>
            <option value="">Choose to preview 10 rows</option>
            {st.objects.map((o) => <option key={o.name} value={o.name} disabled={c.id === "sharepoint" && o.kind !== "csv file"}>{o.name}{o.kind === "file" ? " (preview supports CSV only)" : ""}</option>)}
          </select>
        </label>
      )}
      {st.preview && (
        <>
          <DataTable columns={cols} rows={st.preview.rows.map((r, i) => ({ ...r, id: i }))} caption={`${st.preview.object}: first ${st.preview.row_count} rows (read on demand)`} />
          {st.preview.redacted_columns.length > 0 && <p className="muted-text">Masked columns: {st.preview.redacted_columns.join(", ")}</p>}
        </>
      )}
    </div>
  );
}


function Disconnect({ c, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function go() {
    setBusy(true); setErr(null);
    try { await api(`/connectors/${c.id}/disconnect`, { method: "POST" }); onDone(); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <button type="button" className="ghost" disabled={busy} onClick={go}>Disconnect (forget this session connection)</button>
      <ApiState loading={false} error={err} />
    </div>
  );
}

// Add a connection from the UI. The secret is sent once to the local backend, kept in its memory only, and cleared from this form
// immediately. It is never saved, logged or shown again. A permanent connection belongs in backend/.env.
const KINDS = {
  postgres: { label: "PostgreSQL", fields: [["host", "Host", "text", ""], ["port", "Port", "number", "5432"], ["database", "Database", "text", ""], ["username", "Username (read-only account)", "text", ""], ["password", "Password", "password", ""]], ssl: true },
  mysql: { label: "MySQL / MariaDB", fields: [["host", "Host", "text", ""], ["port", "Port", "number", "3306"], ["database", "Database", "text", ""], ["username", "Username (read-only account)", "text", ""], ["password", "Password", "password", ""]], ssl: false },
  sharepoint: { label: "SharePoint (Microsoft Graph)", fields: [["tenant_id", "Tenant ID", "text", ""], ["client_id", "Client (application) ID", "text", ""], ["client_secret", "Client secret", "password", ""], ["site", "Site", "text", "contoso.sharepoint.com:/sites/Plant"], ["folder", "Folder", "text", "Shared Documents/Twin"]], ssl: false },
};
const SECRET_KEYS = ["password", "client_secret"];

function AddConnection({ onDone }) {
  const [kind, setKind] = useState("postgres");
  const k = KINDS[kind];
  const blank = () => Object.fromEntries(k.fields.map(([key, , , def]) => [key, def.startsWith("contoso") || def.startsWith("Shared") ? "" : def]));
  const [vals, setVals] = useState(blank);
  const [ssl, setSsl] = useState(true);
  const [st, setSt] = useState({ busy: false, error: null, ok: null });
  const change = (e) => { setKind(e.target.value); setSt({ busy: false, error: null, ok: null }); setVals(Object.fromEntries(KINDS[e.target.value].fields.map(([key, , , def]) => [key, def.startsWith("contoso") || def.startsWith("Shared") ? "" : def]))); };

  async function submit(e) {
    e.preventDefault();
    const body = { ...vals };
    if (kind !== "sharepoint") body.port = Number(body.port);
    if (k.ssl) body.ssl = ssl;
    setSt({ busy: true, error: null, ok: null });
    setVals((v) => ({ ...v, ...Object.fromEntries(SECRET_KEYS.map((x) => [x, ""])) }));      // clear the secret straight away, success or not
    try {
      const out = await api(`/connectors/${kind}/connection`, { method: "POST", body });
      setSt({ busy: false, error: null, ok: out.connector?.source_system ?? "Connected" });
      onDone();
    } catch (err) { setSt({ busy: false, error: err, ok: null }); }
  }

  return (
    <Card title="Add a connection">
      <form onSubmit={submit} autoComplete="off" className="addconn">
        <label className="field"><span>Source type</span>
          <select value={kind} onChange={change}>{Object.entries(KINDS).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select>
        </label>
        <div className="addconn-grid">
          {k.fields.map(([key, label, type, ph]) => (
            <label className="field" key={key}><span>{label}</span>
              <input type={type} name={`${kind}-${key}`} value={vals[key] ?? ""} placeholder={type === "password" ? "" : ph} required
                     autoComplete={type === "password" ? "new-password" : "off"} spellCheck="false"
                     onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))} />
            </label>
          ))}
        </div>
        {k.ssl && <label className="check"><input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} /> Require SSL</label>}
        <div className="row">
          <button type="submit" className="primary" disabled={st.busy}>{st.busy ? "Testing…" : "Test and connect"}</button>
          <span className="muted-text" style={{ margin: 0 }}>The connection is tested first; nothing is kept if the test fails.</span>
        </div>
        <ApiState loading={false} error={st.error} />
        {st.ok && <p className="note" role="status">Connected: {st.ok}. Use List tables or List files on its card below.</p>}
        <p className="muted-text">Use a read-only account. The password is sent once to your local backend and kept in its memory only: it is never saved, logged or shown again, and it is lost when the backend restarts. To keep a connection permanently, set it in backend/.env.</p>
      </form>
    </Card>
  );
}

function Connector({ c, onChange }) {
  const ok = c.status === "CONNECTED";
  return (
    <Card className={`conn detail ${ok ? "" : "conn-off"}`}>
      <div className="conn-head">
        <div>
          <span className="conn-cat">{c.category}</span>
          <h3>{c.name}</h3>
          <span className="conn-src">{c.source_system}</span>
        </div>
        <div className="conn-badges">
          <StatusBadge status={c.status} mode={c.mode} />
          {c.state_type === "NOT_CONNECTED" ? <span className="badge v-none">NO DATA</span> : <StateBadge type={c.state_type} />}
        </div>
      </div>
      <p className="muted-text">{c.used_for}</p>
      <p className={ok && !c.stale ? "muted-text" : "note"} role="status">{c.message}</p>
      <dl>
        <dt>Access</dt><dd>{c.direction === "READ_ONLY" ? "Read-only (no write-back)" : c.direction}</dd>
        {ok && c.mode !== "ON_DEMAND" && <><dt>Rows</dt><dd>{fmt(c.rows)}</dd>
          <dt>Latest record</dt><dd>{c.latest_ts ? String(c.latest_ts).replace("T", " ") : "n/a"}</dd>
          <dt>Freshness</dt><dd>{c.age_hours != null ? <FreshnessBadge hours={c.age_hours} /> : "n/a"}</dd>
          <dt>Tables</dt><dd>{(c.tables ?? []).join(", ")}</dd></>}
        {!ok && c.needed_to_connect && <><dt>Needed to connect</dt><dd>{c.needed_to_connect}</dd></>}
        {(c.config_keys ?? []).length > 0 && <><dt>Settings (names only)</dt><dd>{c.config_keys.join(", ")}</dd></>}
      </dl>
      {c.mode === "ON_DEMAND" && <Explore c={c} />}
      {c.config_origin === "session" && <Disconnect c={c} onDone={onChange} />}
    </Card>
  );
}

export default function DataConnectors() {
  const { data, error, loading, reload } = useApi("/connectors");
  const list = data?.connectors ?? [];
  const s = data?.summary;
  return (
    <>
      <PageHeader title="Data connectors" subtitle="Where the twin's data comes from, and what is not connected" state="LIVE" />
      <p className="note" role="note">Every connector is read-only: nothing here can write to, command or change a plant system. A source that is not connected contributes nothing to any result.</p>
      <ApiState loading={loading} error={error} />
      {s && (
        <div className="grid cols-4" aria-label="Connector summary">
          <div className="tile"><span className="tile-label">Connected</span><span className="tile-value">{s.connected}</span><span className="tile-hint">batch loads and static files</span></div>
          {s.configured > 0 && <div className="tile"><span className="tile-label">Configured</span><span className="tile-value">{s.configured}</span><span className="tile-hint">credentials set, read on demand</span></div>}
          <div className="tile"><span className="tile-label">Not connected</span><span className="tile-value">{s.not_connected}</span><span className="tile-hint">listed so the gap is visible</span></div>
          <div className="tile"><span className="tile-label">Stale (over 24 h)</span><span className="tile-value">{s.stale}</span><span className="tile-hint">age of the latest record</span></div>
        </div>
      )}
      <AddConnection onDone={reload} />
      <div className="grid cols-2">{list.map((c) => <Connector key={c.id} c={c} onChange={reload} />)}</div>
      {(data?.assumptions ?? []).length > 0 && (
        <Card title="Notes"><ul>{data.assumptions.map((a) => <li key={a.id}>{a.text}</li>)}</ul></Card>
      )}
    </>
  );
}
