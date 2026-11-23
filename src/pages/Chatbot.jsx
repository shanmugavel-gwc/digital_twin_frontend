import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, dt, fmt, go } from "../api.js";
import { AXIS, PageHeader, SERIES, StateBadge } from "../components.jsx";
import "./chatbot.css";

// AI Manufacturing Chatbot: question -> intent -> factory tools (same prepared data as the central agent) -> grounded answer
// with the supporting tables/charts the tools returned. Model text is rendered as React text nodes (escaped), never as HTML.
const EXAMPLES = [
  "What is the current factory status?", "How many machines are currently active?", "Which machine has abnormal sensor readings?",
  "Show production performance for the last seven days.", "What are the main production bottlenecks?", "Which machines need maintenance attention?",
  "What are the major quality issues?", "Explain why machine M-SPI-02 is showing a warning.", "Compare SMT-L1 and SMT-L2.",
  "Summarize the latest Digital Twin Agent execution.", "What recommendations are pending approval?",
];
const MACHINE = /\b(M-[A-Z]{2,5}-\d{2})\b/g;

// inline: **bold** and machine ids (link to the 3D twin)
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    const bits = p.split(MACHINE);
    return <Fragment key={i}>{bits.map((b, j) => (j % 2 === 1
      ? <button key={j} type="button" className="cb-mref" title="Open in the 3D twin" onClick={() => go("twin", { machine: b })}>{b}</button>
      : b))}</Fragment>;
  });
}

function RichText({ text }) {
  const blocks = [];
  let list = null;
  String(text ?? "").split("\n").forEach((raw) => {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) { list = { ordered, items: [] }; blocks.push(list); }
      list.items.push(m[1]);
      return;
    }
    list = null;
    if (line.startsWith("Model:")) blocks.push({ foot: line });
    else if (/^#{1,4}\s/.test(line)) blocks.push({ h: line.replace(/^#+\s*/, "") });
    else blocks.push({ p: line });
  });
  return (
    <div className="cb-text">
      {blocks.map((b, i) => {
        if (b.items) { const L = b.ordered ? "ol" : "ul"; return <L key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</L>; }
        if (b.foot) return <p key={i} className="cb-foot">{b.foot}</p>;
        if (b.h) return <h4 key={i}><Inline text={b.h} /></h4>;
        return b.p ? <p key={i}><Inline text={b.p} /></p> : <div key={i} className="cb-gap" />;
      })}
    </div>
  );
}

function attachmentsFromSteps(steps) {
  const out = [];
  (steps ?? []).forEach((s) => {
    const o = s.output;
    if (o && typeof o === "object") ["table", "chart"].forEach((k) => { if (o[k] && typeof o[k] === "object") out.push({ kind: k, tool: s.tool, ...o[k] }); });
  });
  return out.slice(0, 6);
}

const cell = (v) => (v === null || v === undefined ? "–" : typeof v === "number" ? fmt(v, Number.isInteger(v) ? 0 : 1) : typeof v === "object" ? JSON.stringify(v) : String(v));

function Attachment({ a }) {
  if (a.kind === "table") {
    return (
      <figure className="cb-att">
        <figcaption>{a.title}</figcaption>
        <div className="table-wrap"><table className="data">
          <thead><tr>{(a.columns ?? []).map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{(a.rows ?? []).slice(0, 40).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : ""}><Inline text={cell(v)} /></td>)}</tr>)}</tbody>
        </table></div>
        {(a.rows ?? []).length > 40 && <small className="muted-text">First 40 of {a.rows.length} rows.</small>}
      </figure>
    );
  }
  const data = a.data ?? [];
  const series = a.series ?? [];
  const C = a.type === "line" ? LineChart : BarChart;
  return (
    <figure className="cb-att">
      <figcaption>{a.title}</figcaption>
      <div className="cb-chart" role="img" aria-label={`${a.title}: ${series.join(", ")} by ${a.x}`}>
        <ResponsiveContainer width="100%" height="100%">
          <C data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={a.x} tick={AXIS} />
            <YAxis tick={AXIS} />
            <Tooltip />
            {series.length > 1 && <Legend />}
            {series.map((s, i) => (a.type === "line"
              ? <Line key={s} type="monotone" dataKey={s} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
              : <Bar key={s} dataKey={s} fill={SERIES[i % SERIES.length]} isAnimationActive={false} />))}
          </C>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function Message({ m, onAsk }) {
  if (m.role === "user") return <div className="cb-msg cb-user"><div className="cb-bubble">{m.content}</div></div>;
  const atts = m.attachments ?? attachmentsFromSteps(m.steps);
  return (
    <div className="cb-msg cb-bot">
      <div className="cb-bubble">
        <div className="cb-meta">
          {m.state_type && <StateBadge type={m.state_type} />}
          {m.mode === "FALLBACK_NO_LLM" && <span className="st-badge st-warning">LLM unavailable: answered by keyword routing from factory data</span>}
          {m.created_at && <span className="muted-text">{dt(m.created_at)}</span>}
        </div>
        <RichText text={m.content} />
        {atts.length > 0 && <div className="cb-atts"><h5>Supporting data</h5>{atts.map((a, i) => <Attachment key={i} a={a} />)}</div>}
        {m.steps?.length > 0 && (
          <details className="cb-trace">
            <summary>Tool trace ({m.steps.length})</summary>
            <ol>{m.steps.map((s, i) => (
              <li key={i}><code>{s.tool}</code> {s.input && Object.keys(s.input).length > 0 && <code className="cb-in">{JSON.stringify(s.input)}</code>}
                {s.error && <span className="cb-err"> {s.error}</span>}{s.output?.error && <span className="cb-err"> {s.output.error}</span>}</li>
            ))}</ol>
          </details>
        )}
        {m.follow_ups?.length > 0 && (
          <div className="cb-chips" aria-label="Follow-up questions">{m.follow_ups.map((q) => <button key={q} type="button" className="cb-chip" onClick={() => onAsk(q)}>{q}</button>)}</div>
        )}
      </div>
    </div>
  );
}

export default function Chatbot() {
  const [convs, setConvs] = useState([]);
  const [cid, setCid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const end = useRef();
  const loadConvs = useCallback(() => api("/conversations").then((d) => setConvs(d.items ?? []), () => setConvs([])), []);
  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, pending]);
  useEffect(() => {
    if (!pending) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);   // display of waiting time only; the answer comes from the backend
    return () => clearInterval(t);
  }, [pending]);

  const open = async (id) => {
    setErr(null); setCid(id); setMsgs([]);
    try { const d = await api(`/conversations/${id}`); setMsgs(d.messages ?? []); } catch (e) { setErr(e); }
  };
  const ask = async (q) => {
    const text = (q ?? input).trim();
    if (!text || pending) return;
    setInput(""); setErr(null); setPending(true);
    setMsgs((m) => [...m, { role: "user", content: text }]);
    try {
      const d = await api("/chat", { method: "POST", body: { message: text, conversation_id: cid || undefined } });
      setCid(d.conversation_id);
      setMsgs((m) => [...m, { role: "assistant", content: d.answer, steps: d.steps, attachments: d.attachments, follow_ups: d.follow_ups, mode: d.mode, state_type: d.state_type }]);
      loadConvs();
    } catch (e) { setErr(e); } finally { setPending(false); }
  };

  return (
    <>
      <PageHeader title="AI Manufacturing Chatbot" subtitle="Answers come from the same prepared factory data and agent results as the central Digital Twin Agent. Numbers are never invented." />
      <div className="cb-layout">
        <aside className="cb-side" aria-label="Conversation history">
          <button type="button" className="primary" onClick={() => { setCid(null); setMsgs([]); setErr(null); }}>+ New conversation</button>
          <h4>History</h4>
          {convs.length === 0 && <p className="muted-text">No conversations yet.</p>}
          <ul>{convs.map((c) => (
            <li key={c.id}><button type="button" className={`cb-conv ${c.id === cid ? "active" : ""}`} onClick={() => open(c.id)}>
              <span>{c.title || "Untitled"}</span><small>{dt(c.created_at)}</small></button></li>
          ))}</ul>
        </aside>
        <section className="cb-main" aria-label="Conversation">
          <div className="cb-thread" aria-live="polite">
            {msgs.length === 0 && !pending && (
              <div className="cb-empty">
                <p>Ask about factory status, machines, sensor readings, production, quality, bottlenecks, the latest agent run or pending approvals.
                  The data is a historical export (Aug–Oct 2026); answers say "as of" its last hour.</p>
                <div className="cb-chips">{EXAMPLES.map((q) => <button key={q} type="button" className="cb-chip" onClick={() => ask(q)}>{q}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => <Message key={i} m={m} onAsk={ask} />)}
            {pending && <div className="cb-msg cb-bot"><div className="cb-bubble cb-pending" role="status"><span className="cb-dots" aria-hidden="true"><i /><i /><i /></span>
              Retrieving factory data and reasoning… {elapsed} s (usually 15–30 s)</div></div>}
            {err && <div className="error-box" role="alert"><strong>Error{err.status ? ` ${err.status}` : ""}</strong> {err.message}</div>}
            <div ref={end} />
          </div>
          <form className="cb-composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <label htmlFor="cb-input" className="sr-only">Your question</label>
            <textarea id="cb-input" rows={2} value={input} maxLength={4000} placeholder="Ask a manufacturing question…" disabled={pending}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
            <button type="submit" className="primary" disabled={pending || !input.trim()}>Send</button>
          </form>
        </section>
      </div>
    </>
  );
}
