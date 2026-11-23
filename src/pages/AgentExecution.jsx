import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dt, fmt, go, useCurrentUser, can } from "../api.js";
import { ApiState, Card, Loader, PageHeader, StatusBadge, ValueLabel } from "../components.jsx";
import "./agent.css";

// Agent Execution & Monitoring. Progress comes ONLY from rows the backend writes as each step really runs (twin.agent_run_event),
// streamed with Server-Sent Events. No timer advances any step; the only local clock is the elapsed-time display of a running run.
const STATE_LABEL = { PENDING: "Pending", RUNNING: "Running", COMPLETED: "Completed", FAILED: "Failed", SKIPPED: "Skipped" };
const KIND_CLASS = { LOG: "log", WARN: "warn", ERROR: "err", FINDING: "find", STEP: "step" };

function fmtDur(s) {
  if (s == null || Number.isNaN(s)) return "n/a";
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m} min ${r} s` : `${r} s`;
}
const time = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour12: false }) : "");

function Findings({ findings }) {
  if (!findings?.length) return <p className="muted-text">No findings for this run yet.</p>;
  return (
    <ol className="ax-findings">
      {findings.map((f) => (
        <li key={f.finding_id} className="ax-finding">
          <div className="ax-f-head">
            <span className="ax-rank">#{f.rank}</span>
            <StatusBadge status={f.severity} />
            <ValueLabel label={f.value_label} />
            {f.state_type === "SIMULATED" && <ValueLabel label="SIMULATED" />}
            <span className="ax-cat">{f.category.replace(/_/g, " ").toLowerCase()}</span>
            <strong className="ax-f-title">{f.title}</strong>
          </div>
          <p>{f.explanation}</p>
          {f.root_causes?.length > 0 && (
            <div className="ax-causes">
              <span className="muted-text">Possible causes (from records, not inferred):</span>
              <ul>{f.root_causes.map((c, i) => <li key={i}><b>{c.cause}</b> - {c.basis} <span className="muted-text">({c.source})</span></li>)}</ul>
            </div>
          )}
          <div className="ax-f-links">
            {f.machine_id && <button type="button" className="ghost small" onClick={() => go("twin", { machine: f.machine_id })}>Show {f.machine_id} in the 3D factory</button>}
            <button type="button" className="ghost small" onClick={() => go("reports", { tab: "queue" })}>Approval queue</button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function AgentExecution({ params = {} }) {
  const { user } = useCurrentUser();
  const [history, setHistory] = useState({ items: [], loading: true, error: null });
  const [stepDefs, setStepDefs] = useState([]);
  const [runId, setRunId] = useState(params.run || null);
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [findings, setFindings] = useState([]);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState({});
  const [now, setNow] = useState(Date.now());
  const es = useRef(null);
  const consoleRef = useRef(null);

  const loadHistory = useCallback(() => api("/agent/runs?limit=30").then(
    (d) => { setHistory({ items: d.items ?? [], loading: false, error: null }); if (d.steps) setStepDefs(d.steps); return d; },
    (e) => { setHistory((h) => ({ ...h, loading: false, error: e })); return null; }), []);

  const closeStream = () => { if (es.current) { es.current.close(); es.current = null; } setLive(false); };

  // the run currently shown; responses for any other run are ignored (a slow load must not overwrite a newer run)
  const shownRun = useRef(params.run || null);
  const loadRun = useCallback((id) => api(`/agent/runs/${id}`).then((d) => {
    if (shownRun.current !== id) return null;
    setRun(d.run); setEvents(d.events ?? []); setFindings(d.findings ?? []); if (d.steps) setStepDefs(d.steps); return d;
  }, (e) => { if (shownRun.current === id) setErr(e); return null; }), []);

  const attach = useCallback((id, after = 0) => {
    closeStream();
    const src = new EventSource(`/api/agent/runs/${id}/stream?after=${after}`);
    es.current = src;
    setLive(true);
    const onRow = (e) => {
      if (shownRun.current !== id) return;
      const row = JSON.parse(e.data);
      setEvents((ev) => (ev.some((x) => x.id === row.id) ? ev : [...ev, row]));
      if (row.kind === "STEP" && row.status === "RUNNING") setOpen((o) => ({ ...o, [row.step]: true }));
    };
    ["STEP", "LOG", "WARN", "ERROR", "FINDING"].forEach((k) => src.addEventListener(k, onRow));
    src.addEventListener("done", (e) => {
      if (shownRun.current !== id) return;
      setRun(JSON.parse(e.data));
      closeStream();
      loadRun(id); loadHistory();
    });
    src.onerror = () => { /* EventSource reconnects by itself (retry 2 s) and resumes after Last-Event-ID */ };
  }, [loadRun, loadHistory]);

  const select = useCallback((id) => {
    closeStream();
    shownRun.current = id;
    setErr(null); setRunId(id); setEvents([]); setFindings([]); setOpen({});
    loadRun(id).then((d) => { if (d?.run?.status === "RUNNING") attach(id, Math.max(0, ...(d.events ?? []).map((x) => x.id))); });
  }, [loadRun, attach]);

  // initial: params.run, else the latest run (attach if it is still running)
  useEffect(() => {
    loadHistory().then((d) => {
      const id = params.run || d?.items?.[0]?.run_id;
      if (id) select(id);
    });
    return closeStream;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // display-only clock for the elapsed time of a running run
  const running = run?.status === "RUNNING";
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => { if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }, [events.length]);

  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api("/agent/runs", { method: "POST" });
      shownRun.current = d.run.run_id;
      if (d.steps) setStepDefs(d.steps);
      setRunId(d.run.run_id); setRun(d.run); setEvents([]); setFindings([]); setOpen({});
      attach(d.run.run_id, 0);
      loadHistory();
    } catch (e) { setErr(e); }
    setBusy(false);
  };

  // ---- everything below is derived from real events
  const stepState = useMemo(() => {
    const st = {};
    for (const e of events) if (e.kind === "STEP") st[e.step] = { status: e.status, data: e.data, ts: e.ts };
    return st;
  }, [events]);
  const logsBy = useMemo(() => {
    const m = {};
    for (const e of events) if (e.kind !== "STEP") (m[e.step] ??= []).push(e);
    return m;
  }, [events]);
  const defs = stepDefs.length ? stepDefs : Array.from({ length: 10 }, (_, i) => ({ step: i + 1, name: `Step ${i + 1}`, substeps: [] }));
  const done = defs.filter((s) => ["COMPLETED", "SKIPPED"].includes(stepState[s.step]?.status)).length;
  const cur = [...defs].reverse().find((s) => stepState[s.step]?.status === "RUNNING") ?? [...defs].reverse().find((s) => stepState[s.step] && stepState[s.step].status !== "PENDING");
  const warns = events.filter((e) => e.kind === "WARN").length;
  const errors = events.filter((e) => e.kind === "ERROR").length;
  const liveFindings = events.filter((e) => e.kind === "FINDING");
  const recordsFromEvents = Math.max(0, ...events.filter((e) => e.kind === "STEP" && e.data?.records != null).map((e) => Number(e.data.records)));
  const records = Math.max(Number(run?.records_processed ?? 0), recordsFromEvents);
  const duration = run ? (running ? (now - new Date(run.started_at).getTime()) / 1000 : run.duration_s) : null;
  const canRun = can(user, "ENGINEER");
  const otherRunning = history.items.some((r) => r.status === "RUNNING") && !running;

  return (
    <div className="ax">
      <PageHeader title="Agent Execution & Monitoring" subtitle="Run the central Manufacturing Digital Twin Agent and follow each step as the backend executes it." state="LIVE" />
      <div className="ax-runbar">
        <button type="button" className="primary ax-run" onClick={start} disabled={busy || running || otherRunning}>
          {running ? "AGENT RUNNING…" : busy ? "STARTING…" : "RUN DIGITAL TWIN AGENT"}
        </button>
        <div className="muted-text ax-runnote">
          {!user ? "Select a user with role ENGINEER or higher in the top bar (Acting as) to start a run." :
            !canRun ? `${user.display_name} is ${user.role}: starting a run needs ENGINEER or higher.` :
            "One central agent, 10 steps. Progress below is streamed from the backend (Server-Sent Events); nothing is simulated in the browser."}
        </div>
      </div>
      {err && <ApiState error={err.status === 401 || err.status === 403 ? { ...err, message: `${err.message} Use the "Acting as" user switch in the top bar.` } : err} />}

      <div className="ax-grid">
        <div className="ax-maincol">
          {run ? (
            <Card className="ax-head">
              <div className="ax-head-row">
                <div><span className="ax-k">Run ID</span><code>{run.run_id}</code></div>
                <div><span className="ax-k">Agent</span>{run.agent_name}</div>
                <div><span className="ax-k">Status</span><span className={`ax-status ax-s-${run.status}`}>{run.status}{live ? " · streaming" : ""}</span></div>
                <div><span className="ax-k">Started</span>{dt(run.started_at)}</div>
                <div><span className="ax-k">Duration</span>{fmtDur(duration)}</div>
                <div><span className="ax-k">Current step</span>{cur ? `${cur.step}. ${cur.name}` : "n/a"}</div>
                <div><span className="ax-k">Records processed</span>{fmt(records)}</div>
                <div><span className="ax-k">Triggered by</span>{run.triggered_by}</div>
                <div><span className="ax-k">Data as of</span>{run.data_as_of ? dt(run.data_as_of) : (events.find((e) => e.data?.data_as_of)?.data?.data_as_of ?? "n/a")}</div>
              </div>
              <div className="ax-progress" role="progressbar" aria-valuemin={0} aria-valuemax={10} aria-valuenow={done} aria-label="Completed steps">
                <i style={{ width: `${(done / 10) * 100}%` }} className={run.status === "FAILED" ? "bad" : ""} />
              </div>
              <div className="ax-progress-txt">
                <span>{done} of 10 steps completed</span>
                <span className="ax-counts"><span className="ax-c-warn">{warns} warnings</span> · <span className="ax-c-err">{errors} errors</span> · {liveFindings.length || findings.length} findings</span>
              </div>
              {run.error && <div className="error-box" role="alert"><strong>Run failed</strong><div>{run.error}</div></div>}
            </Card>
          ) : runId ? <Card><Loader variant="card" label={`Loading run ${String(runId).slice(0, 8)}`} hint="Fetching the run, its 10 step events and findings." rows={4} /></Card>
            : !history.loading && <Card><p className="muted-text">No run selected. Start the agent or pick a run from the history.</p></Card>}

          {run && (
            <Card title="Execution timeline">
              <ol className="ax-timeline">
                {defs.map((s) => {
                  const st = stepState[s.step]?.status ?? "PENDING";
                  const logs = logsBy[s.step] ?? [];
                  const isOpen = open[s.step] ?? st === "RUNNING";
                  const ms = stepState[s.step]?.data?.duration_ms;
                  const w = logs.filter((l) => l.kind === "WARN").length, e = logs.filter((l) => l.kind === "ERROR").length;
                  return (
                    <li key={s.step} className={`ax-step ax-st-${st}`}>
                      <span className="ax-node" aria-hidden="true">{st === "COMPLETED" ? "✓" : st === "FAILED" ? "✕" : st === "SKIPPED" ? "–" : s.step}</span>
                      <div className="ax-step-body">
                        <button type="button" className="ax-step-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.step]: !isOpen }))}>
                          <span className="ax-step-name">Step {s.step}: {s.name}</span>
                          <span className={`ax-pill ax-p-${st}`}>{STATE_LABEL[st] ?? st}</span>
                          {ms != null && <span className="muted-text">{fmt(ms / 1000, 1)} s</span>}
                          {w > 0 && <span className="ax-c-warn">{w} warn</span>}
                          {e > 0 && <span className="ax-c-err">{e} error</span>}
                          <span className="muted-text ax-nlogs">{logs.length} log lines</span>
                        </button>
                        {s.substeps?.length > 0 && <div className="ax-subs">{s.substeps.join(" · ")}</div>}
                        {isOpen && logs.length > 0 && (
                          <ul className="ax-steplogs">
                            {logs.map((l) => <li key={l.id} className={`ax-l-${KIND_CLASS[l.kind]}`}><span className="ax-ts">{time(l.ts)}</span><span className="ax-kind">{l.kind}</span>{l.message}</li>)}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {run && (
            <Card title={`Generated findings${findings.length ? ` (${findings.length})` : ""}`}
                  actions={findings.length > 0 && <button type="button" className="ghost small" onClick={() => go("reports", { tab: "queue" })}>Review recommendations</button>}>
              {findings.length ? <Findings findings={findings} /> : liveFindings.length ? (
                <ul className="ax-livefind">{liveFindings.map((f) => <li key={f.id}>{f.message} <ValueLabel label={f.data?.label} /></li>)}</ul>
              ) : <p className="muted-text">{running ? "Findings appear when step 7 (Agent Reasoning) ranks them." : "No findings recorded for this run."}</p>}
            </Card>
          )}
        </div>

        <div className="ax-sidecol">
          {run && (
            <Card title="Live log console" actions={<span className={`ax-dot ${live ? "on" : ""}`}>{live ? "● streaming" : "stream closed"}</span>}>
              <div className="ax-console" ref={consoleRef} role="log" aria-live="polite">
                {events.filter((e) => e.kind !== "STEP" || e.status !== "PENDING").map((l) => (
                  <div key={l.id} className={`ax-line ax-l-${KIND_CLASS[l.kind]}`}>
                    <span className="ax-ts">{time(l.ts)}</span><span className="ax-kind">S{l.step} {l.kind === "STEP" ? l.status : l.kind}</span><span>{l.message}</span>
                  </div>
                ))}
                {events.length === 0 && <div className="muted-text">Waiting for the first event…</div>}
              </div>
            </Card>
          )}
          <Card title="Execution history" actions={<button type="button" className="ghost small" onClick={loadHistory}>Refresh</button>}>
            <ApiState loading={history.loading} error={history.error} label="Loading execution history" hint="Previous Digital Twin Agent runs." rows={3} />
            <ul className="ax-history">
              {history.items.map((r) => (
                <li key={r.run_id}>
                  <button type="button" className={`ax-hist ${r.run_id === runId ? "on" : ""}`} onClick={() => select(r.run_id)}>
                    <span className={`ax-status ax-s-${r.status}`}>{r.status}</span>
                    <span>{dt(r.started_at)}</span>
                    <span className="muted-text">{fmtDur(r.duration_s)} · {r.findings ?? 0} findings · {r.recommendations ?? 0} recs · by {r.triggered_by}</span>
                  </button>
                </li>
              ))}
              {!history.loading && history.items.length === 0 && <li className="muted-text">The agent has not run yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
