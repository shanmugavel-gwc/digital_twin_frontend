import { useEffect, useState } from "react";
import { ThemeToggle } from "./theme.js";
import { api, setCurrentUserId, currentUserId, useCurrentUser, useRoute } from "./api.js";
import Home from "./pages/Home.jsx";
import OverviewDashboard from "./pages/OverviewDashboard.jsx";
import Architecture from "./pages/Architecture.jsx";
import AgentExecution from "./pages/AgentExecution.jsx";
import ReportsApproval from "./pages/ReportsApproval.jsx";
import Integrations from "./pages/Integrations.jsx";
import Chatbot from "./pages/Chatbot.jsx";
import Settings from "./pages/Settings.jsx";
import Users from "./pages/Users.jsx";
import AuditLogs from "./pages/AuditLogs.jsx";
import TwinView from "./pages/TwinView.jsx";
import PlantView from "./pages/PlantView.jsx";
import FactoryView from "./pages/FactoryView.jsx";
import CampusView from "./pages/CampusView.jsx";
import logo from "./images/logo-sm.png";

// 24x24 stroke icons (currentColor) so they follow the theme.
const ICONS = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z",
  overview: "M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-18v6h8V3h-8Z",
  architecture: "M4 5h6v4H4V5Zm10 0h6v4h-6V5ZM9 15h6v4H9v-4ZM7 9v3h10V9M12 12v3",
  twin: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5",
  agent: "M12 3v3m0 12v3M5 12H2m20 0h-3M7 7l-2-2m14 14-2-2M7 17l-2 2M19 5l-2 2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  reports: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  integrations: "M9 3v4m6-4v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5",
  chat: "M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12Z",
  kpis: "M4 20V10m6 10V4m6 16v-8m6 8H2",
  lab: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  compare: "M4 20V10m6 10V4m6 16v-8m6 8H2",
  calibration: "M12 3v3m0 12v3M3 12h3m12 0h3M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  review: "M9 11l3 3 8-8M4 6h7M4 12h4M4 18h7",
  sources: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  audit: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};
function Icon({ id }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[id]} />
    </svg>
  );
}

// Digital Twin page: the 3D factory is the centrepiece; line-level views stay available.
function TwinPage({ params }) {
  const [scope, setScope] = useState(params?.machine ? "factory" : "campus");
  useEffect(() => { if (params?.machine) setScope("factory"); }, [params?.machine]);
  return (
    <>
      <div className="seg" role="group" aria-label="Twin view scope" style={{ marginBottom: 12 }}>
        {[["campus", "Plant campus (replay)"], ["factory", "3D factory floor"], ["plant", "All lines (simulated flow)"], ["line", "Single line"]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>
        ))}
      </div>
      {scope === "campus" ? <CampusView onEnterFloor={() => setScope("factory")} />
        : scope === "factory" ? <FactoryView onOpenLine={() => setScope("line")} />
        : scope === "plant" ? <PlantView onOpenLine={() => setScope("line")} /> : <TwinView />}
    </>
  );
}

const GROUPS = [
  { label: "Digital twin agent", pages: [
    { id: "home", label: "Home", C: Home },
    { id: "overview", label: "Overview Dashboard", C: OverviewDashboard },
    { id: "architecture", label: "Architecture & Data Flow", C: Architecture },
    { id: "twin", label: "Digital Twin – 3D Factory", C: TwinPage },
    { id: "agent", label: "Agent Execution & Monitoring", C: AgentExecution },
    { id: "reports", label: "Reports & Human Approval", C: ReportsApproval },
    { id: "integrations", label: "Integrations & Connectors", C: Integrations },
    { id: "chat", label: "AI Manufacturing Chatbot", C: Chatbot },
  ] },
  { label: "Administration", pages: [
    { id: "settings", label: "Settings", C: Settings },
    { id: "users", label: "User Management", C: Users },
    { id: "audit", label: "Audit Logs", C: AuditLogs },
  ] },
];
const PAGES = GROUPS.flatMap((g) => g.pages);
const ALIASES = { floor3d: "twin", connectors: "integrations" };

// Identity selection (not authentication): the chosen user is sent as X-User and checked against its role by the backend.
function UserSwitch() {
  const { user } = useCurrentUser();
  const [users, setUsers] = useState([]);
  useEffect(() => { api("/users").then((d) => setUsers((d.items ?? []).filter((u) => u.active)), () => setUsers([])); }, [user]);
  return (
    <div className="user-switch">
      <label htmlFor="user-pick" className="muted-text">Acting as</label>
      <select id="user-pick" value={currentUserId()} onChange={(e) => setCurrentUserId(e.target.value)} title="Identity selection, not authentication">
        <option value="">(no user: read only)</option>
        {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}
      </select>
      {user && <span className="role-chip">{user.role}</span>}
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const pid = ALIASES[route.page] ?? route.page;
  const cur = PAGES.find((p) => p.id === pid) ?? PAGES[0];
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("sidebar") !== "closed"; } catch { return true; } });
  const toggle = () => setOpen((o) => { const n = !o; try { localStorage.setItem("sidebar", n ? "open" : "closed"); } catch {} return n; });
  const C = cur.C;
  return (
    <div className={`app ${open ? "" : "collapsed"}`}>
      <aside className="side" id="sidebar" aria-label="Sidebar">
        <div className="brand">
          <a className="brand-logo" href="#home"><img src={logo} alt="GWC DATA.AI, Solution Matters" width="720" height="188" /></a>
          <h1 className="sr-only">Manufacturing Digital Twin Agent</h1>
        </div>
        <nav className="nav" aria-label="Pages">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="nav-group">{g.label}</div>
              {g.pages.map((p) => (
                <a key={p.id} href={`#${p.id}`} title={p.label} className={`conv ${p.id === cur.id ? "active" : ""}`} aria-current={p.id === cur.id ? "page" : undefined}>
                  <Icon id={p.id} /><span className="lbl">{p.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot"><strong>Read-only to the plant.</strong> One central agent; every recommendation needs human approval.</div>
      </aside>
      <div className="main">
        <div className="top">
          <div className="top-left">
            <button type="button" className="side-toggle" onClick={toggle} aria-expanded={open} aria-controls="sidebar" aria-label={open ? "Close sidebar" : "Open sidebar"} title={open ? "Close sidebar" : "Open sidebar"}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <span className="top-title">{cur.label}</span>
          </div>
          <div className="top-right">
            <UserSwitch />
            <ThemeToggle />
          </div>
        </div>
        <main className="content" id="main"><C key={cur.id} params={route.params} /></main>
      </div>
    </div>
  );
}
