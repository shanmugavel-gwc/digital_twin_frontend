import { useEffect, useRef, useState } from "react";
import { api, useApi } from "../api.js";
import { ModelBar, PageHeader, StateBanner } from "../components.jsx";

// GET /api/conversations -> { items:[{id,title}] } ; GET /api/conversations/{id} -> { messages:[{role, content, steps}] }
// POST /api/chat {conversation_id?, message} -> { conversation_id, answer, steps:[{tool, input, output}], model_version, validation_status }
// Model output is rendered as plain text only (React escapes it); no HTML injection path exists.
export default function Chat() {
  const convs = useApi("/conversations");
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  async function open(id) {
    setActive(id); setError(null);
    try { setMsgs((await api(`/conversations/${id}`)).messages ?? []); } catch (e) { setError(e); }
  }
  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true); setError(null);
    setMsgs((m) => [...m, { role: "user", content: text }]);
    try {
      const out = await api("/chat", { method: "POST", body: { conversation_id: active, message: text } });
      setActive(out.conversation_id ?? active);
      setMeta(out);
      setMsgs((m) => [...m, { role: "assistant", content: out.answer, steps: out.steps }]);
      convs.reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Agent chat" subtitle="Ask the Digital Twin Agent. It explains and simulates; it cannot change the plant or approve scenarios." state="SIMULATED" />
      <StateBanner type="SIMULATED">Answers distinguish LIVE (MES) from SIMULATED (twin) values and cite model version, assumptions, confidence and validation status.</StateBanner>
      <ModelBar meta={meta} />
      <div className="chat-layout card" style={{ padding: 0, overflow: "hidden", minHeight: 420 }}>
        <nav className="side" aria-label="Conversations">
          <h1>Conversations</h1>
          <div className={`conv ${active === null ? "active" : ""}`} role="button" tabIndex={0} onClick={() => { setActive(null); setMsgs([]); }} onKeyDown={(e) => e.key === "Enter" && (setActive(null), setMsgs([]))}>+ New conversation</div>
          {(convs.data?.items ?? []).map((c) => (
            <div key={c.id} className={`conv ${active === c.id ? "active" : ""}`} role="button" tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => e.key === "Enter" && open(c.id)}>{c.title ?? c.id}</div>
          ))}
          {convs.error && <p className="muted-text">{convs.error.message}</p>}
        </nav>
        <div className="chat-main">
          <div className="msgs" aria-live="polite">
            {msgs.length === 0 && !busy && <p className="muted-text">Try: "What is the bottleneck on SMT-L1 and how confident is the model?"</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role === "user" ? "user" : "bot"}`}>
                {m.content}
                {m.steps?.length > 0 && (
                  <details className="steps"><summary>Tool trace ({m.steps.length})</summary>
                    {m.steps.map((s, j) => <div key={j} className="trace-item"><strong>{s.tool ?? s.action}</strong><pre>{JSON.stringify(s.input ?? s.args ?? {}, null, 2)}{"\n"}{typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? s.result ?? {}, null, 2)}</pre></div>)}
                  </details>
                )}
              </div>
            ))}
            {busy && <div className="typing" role="status">Agent is working…</div>}
            {error && <div className="error-box" role="alert"><span aria-hidden="true">{"✕"} </span>{error.message}</div>}
            <div ref={end} />
          </div>
          <form className="composer" onSubmit={send}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a line, scenario or calibration…" aria-label="Message" />
            <button type="submit" className="primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      </div>
    </>
  );
}
