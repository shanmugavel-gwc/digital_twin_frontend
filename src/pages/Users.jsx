import { useState } from "react";
import { api, useApi, dt, useCurrentUser, setCurrentUserId, can } from "../api.js";
import { ApiState, Card, DataTable, PageHeader } from "../components.jsx";
import "./admin.css";

const ROLE_TEXT = { VIEWER: "read only", ENGINEER: "run the agent, comment, send notifications", PLANNER: "approve / reject / request changes, track actions, send records",
  ADMIN: "everything, users, settings, integration configuration" };
const EMPTY = { user_id: "", display_name: "", role: "VIEWER", active: true };

export default function Users() {
  const u = useApi("/users");
  const { user } = useCurrentUser();
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);
  const items = u.data?.items ?? [];
  const first = u.data && items.length === 0;
  const admin = can(user, "ADMIN");
  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    try {
      const r = await api("/users", { method: "POST", body: { ...form, role: first ? "ADMIN" : form.role } });
      setMsg({ ok: true, text: `Saved ${r.user.display_name} (${r.user.role}).` });
      if (first) setCurrentUserId(r.user.user_id);
      setForm(EMPTY); u.reload();
    } catch (er) { setMsg({ ok: false, text: `${er.status ? er.status + ": " : ""}${er.message}` }); }
  };
  return (
    <>
      <PageHeader title="User Management" subtitle="Users and roles for running the agent, approving recommendations and administering the platform." state="LIVE" />
      <div className="notice warn"><strong>Identity selection, not authentication.</strong> There are no passwords: the user chosen in the top bar is sent with each request and the backend checks that user's role. Every action is audit-logged under that name. Add SSO before production use (ASSUMPTIONS A-27).</div>
      <ApiState loading={u.loading} error={u.error} label="Loading users" hint="Users and their roles." />
      <div className="two-col" style={{ marginTop: 16 }}>
        <Card title={`Users (${items.length})`}>
          <DataTable columns={[
            { key: "display_name", label: "Name", render: (r) => <><span className="adm-actor">{r.display_name}</span>{user?.user_id === r.user_id && <span className="adm-you">YOU</span>}</> },
            { key: "user_id", label: "User id" },
            { key: "role", label: "Role", render: (r) => <span className="role-chip">{r.role}</span> },
            { key: "active", label: "Active", render: (r) => (r.active ? "yes" : "no") },
            { key: "created_at", label: "Created", render: (r) => dt(r.created_at) },
            { key: "act", label: "", render: (r) => (
              <span style={{ display: "flex", gap: 8 }}>
                {r.active && user?.user_id !== r.user_id && <button type="button" className="adm-row-btn" onClick={() => setCurrentUserId(r.user_id)}>Use this user</button>}
                {admin && <button type="button" className="adm-row-btn" onClick={() => setForm({ user_id: r.user_id, display_name: r.display_name, role: r.role, active: r.active })}>Edit</button>}
              </span>) },
          ]} rows={items.map((r) => ({ ...r, id: r.user_id }))} />
          <div className="adm-sub">Roles</div>
          <ul className="muted-text">{Object.entries(ROLE_TEXT).map(([k, v]) => <li key={k}><strong>{k}</strong>: {v}</li>)}</ul>
        </Card>
        <Card title={first ? "Create the first administrator" : form.user_id && items.some((i) => i.user_id === form.user_id) ? "Edit user" : "Add user"}>
          {first && <p className="muted-text">No users exist yet. The first user must be an ADMIN; afterwards only an ADMIN can manage users.</p>}
          {!first && !admin && <div className="notice warn">Managing users needs role ADMIN.</div>}
          <form onSubmit={save} className="adm-form" style={{ marginTop: 10 }}>
            <label className="field"><span>User id</span><input required value={form.user_id} pattern="[a-z0-9._\-]{2,40}" placeholder="e.g. j.planner" onChange={(e) => setForm({ ...form, user_id: e.target.value.toLowerCase() })} /><small>2-40 chars: a-z 0-9 . _ -</small></label>
            <label className="field"><span>Display name</span><input required maxLength={80} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
            <label className="field"><span>Role</span>
              <select value={first ? "ADMIN" : form.role} disabled={first} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {(u.data?.roles ?? Object.keys(ROLE_TEXT)).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="adm-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
            <div className="adm-actions">
              <button type="submit" className="primary" disabled={!first && !admin}>Save user</button>
              <button type="button" className="ghost" onClick={() => { setForm(EMPTY); setMsg(null); }}>Clear</button>
              {msg && <span className={`adm-msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</span>}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
