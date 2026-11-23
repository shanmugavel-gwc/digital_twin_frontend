import { useEffect, useState } from "react";
import { api, useApi, dt, useCurrentUser, can } from "../api.js";
import { ApiState, Card, PageHeader } from "../components.jsx";
import "./admin.css";

// Agent configuration: every value is a documented rule parameter (docs/ASSUMPTIONS.md A-28..A-31), not a fitted model.
const WEIGHT_LABEL = { anomalies: "Anomaly flags", sensor_excursions: "Sensor excursions", down_time: "DOWN hours", downtime_events: "Downtime event minutes",
  maintenance_due: "Preventive maintenance due", station_quality: "Station inspection fail rate" };
const CAP_LABEL = { anomalies: "Anomaly flags (count)", sensor_excursions: "Sensor excursions (hours)", down_hours: "DOWN hours", downtime_event_minutes: "Downtime event minutes" };
const clone = (o) => JSON.parse(JSON.stringify(o));

function Num({ label, value, onChange, step = 1, hint }) {
  return (
    <label className="field"><span>{label}</span>
      <input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function Settings() {
  const s = useApi("/settings/agent");
  const { user } = useCurrentUser();
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.data) setCfg(clone(s.data.config)); }, [s.data]);
  const set = (path, v) => setCfg((c) => { const n = clone(c); let o = n; path.slice(0, -1).forEach((k) => { o = o[k]; }); o[path[path.length - 1]] = v; return n; });
  const sum = cfg ? Object.values(cfg.risk_weights).reduce((a, b) => a + Number(b || 0), 0) : 0;
  const admin = can(user, "ADMIN");
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api("/settings/agent", { method: "POST", body: cfg }); setCfg(clone(r.config)); setMsg({ ok: true, text: `Saved. The next agent run uses this configuration.` }); s.reload(); }
    catch (e) { setMsg({ ok: false, text: `${e.status ? e.status + ": " : ""}${e.message}` }); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader title="Settings" subtitle="Agent configuration: analysis window, manufacturing rules, risk index, notifications." state="LIVE" />
      <ApiState loading={s.loading} error={s.error} label="Loading agent configuration" hint="Manufacturing rules, risk weights and notification settings." />
      {cfg && (
        <div className="page-grid">
          <div className="notice">These are rule parameters (judgement calls, see docs/ASSUMPTIONS.md A-28 to A-31), not a trained model. Changes apply to the next agent run and are audit-logged.
            {" "}Last updated {s.data.meta?.updated_at ? `${dt(s.data.meta.updated_at)} by ${s.data.meta.updated_by}` : "never (defaults in use)"}.</div>
          {!admin && <div className="notice warn">Saving needs role ADMIN. Select an admin user in the top bar.</div>}
          <Card title="Analysis">
            <div className="adm-form">
              <label className="field"><span>Agent name</span><input value={cfg.agent_name} onChange={(e) => set(["agent_name"], e.target.value)} /></label>
              <Num label="Analysis window (days)" value={cfg.analysis_window_days} onChange={(v) => set(["analysis_window_days"], v)} hint="1 to 60; anchored on the latest data hour" />
              <Num label="Sensor excursion threshold (sigma)" step={0.1} value={cfg.sensor_sigma} onChange={(v) => set(["sensor_sigma"], v)} hint="reading > own baseline mean + k sigma" />
              <Num label="Plan attainment minimum (%)" step={0.5} value={cfg.plan_attainment_min_pct} onChange={(v) => set(["plan_attainment_min_pct"], v)} />
              <Num label="Inspection fail rate maximum (%)" step={0.1} value={cfg.quality_fail_rate_max_pct} onChange={(v) => set(["quality_fail_rate_max_pct"], v)} />
              <Num label="Max recommendations per run" value={cfg.max_recommendations} onChange={(v) => set(["max_recommendations"], v)} />
            </div>
          </Card>
          <Card title="Risk index (rule-based)">
            <div className="adm-sub">Weights <span className={`adm-sum ${Math.abs(sum - 100) < 0.01 ? "ok" : "bad"}`}>sum {sum} / 100</span></div>
            <div className="adm-form">
              {Object.keys(cfg.risk_weights).map((k) => <Num key={k} label={WEIGHT_LABEL[k] ?? k} value={cfg.risk_weights[k]} onChange={(v) => set(["risk_weights", k], v)} />)}
            </div>
            <div className="adm-sub">Caps (value that counts fully in the window)</div>
            <div className="adm-form">
              {Object.keys(cfg.risk_caps).map((k) => <Num key={k} label={CAP_LABEL[k] ?? k} value={cfg.risk_caps[k]} onChange={(v) => set(["risk_caps", k], v)} />)}
            </div>
            <div className="adm-sub">Status bands (risk index); OFFLINE = state DOWN in the latest hour</div>
            <div className="adm-form">
              {["WARNING", "ATTENTION", "CRITICAL"].map((k) => <Num key={k} label={`${k} from`} value={cfg.status_thresholds[k]} onChange={(v) => set(["status_thresholds", k], v)} />)}
            </div>
          </Card>
          <Card title="Workflow and notifications">
            <div className="adm-form">
              <label className="adm-check"><input type="checkbox" checked={cfg.supersede_previous} onChange={(e) => set(["supersede_previous"], e.target.checked)} /> New run supersedes earlier pending recommendations</label>
              <label className="adm-check"><input type="checkbox" checked={cfg.llm_narrative} onChange={(e) => set(["llm_narrative"], e.target.checked)} /> LLM executive summary (written only from findings)</label>
              <label className="adm-check"><input type="checkbox" checked={cfg.steps.notifications} onChange={(e) => set(["steps", "notifications"], e.target.checked)} /> Step 9: prepare notifications</label>
              <label className="adm-check"><input type="checkbox" checked={cfg.steps.prediction_models} onChange={(e) => set(["steps", "prediction_models"], e.target.checked)} /> Use validated twin model (bottlenecks)</label>
              <label className="field"><span>Email recipients</span><input value={cfg.notify.email_recipients} placeholder="planner@example.com, ..." onChange={(e) => set(["notify", "email_recipients"], e.target.value)} /></label>
              <label className="adm-check"><input type="checkbox" checked={cfg.notify.auto_send} onChange={(e) => set(["notify", "auto_send"], e.target.checked)} /> Auto-send after a run (only if the channel is configured)</label>
            </div>
            <div className="adm-sub">Channels</div>
            <div className="adm-chan">
              {Object.entries(s.data.channels ?? {}).map(([k, v]) => <span key={k} className={`st-badge ${v === "CONFIGURED" ? "st-normal" : "st-offline"}`}><span className="st-dot" />{k}: {v}</span>)}
            </div>
          </Card>
          <div className="adm-actions">
            <button type="button" className="primary" disabled={!admin || busy} onClick={save}>{busy ? "Saving…" : "Save configuration"}</button>
            <button type="button" className="ghost" onClick={() => { setCfg(clone(s.data.defaults)); setMsg({ ok: true, text: "Defaults loaded into the form (not saved yet)." }); }}>Reset to defaults</button>
            <button type="button" className="ghost" onClick={() => { setCfg(clone(s.data.config)); setMsg(null); }}>Discard changes</button>
            {msg && <span className={`adm-msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</span>}
          </div>
        </div>
      )}
    </>
  );
}
