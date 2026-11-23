import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, go, useApi } from "../api.js";
import { AXIS, Loader, SERIES, StatusBadge, ValueLabel } from "../components.jsx";

// Machine information panel for the 3D twin. Latest readings are ACTUAL (last telemetry hour of the export); utilisation, health and
// risk are CALCULATED by the latest agent run (rule-based index). Production and energy are not recorded per machine: shown per line / plant area.
const n = (v, d = 1, u = "") => (v == null ? "n/a" : `${fmt(v, d)}${u}`);
const day = (v) => (v ? String(v).slice(0, 10) : "n/a");

export default function MachinePanel({ m, onClose }) {
  const h = useApi(`/factory/machines/${m.machine_id}/history?days=7`);
  const met = m.metrics ?? {};
  const lt = met.latest ?? {};
  const mt = met.maintenance ?? {};
  const sc = met.score ?? {};
  const series = (h.data?.series ?? []).map((r) => ({ ...r, t: r.ts.slice(5, 13).replace("T", " ") }));
  const anomalies = series.filter((r) => r.is_anomaly);
  const lp = h.data?.line_production;
  return (
    <aside className="f3d-mpanel" aria-label={`Machine ${m.machine_id}`}>
      <div className="mp-head">
        <div>
          <div className="mp-id">{m.machine_id}</div>
          <div className="mp-name">{m.machine_name}</div>
        </div>
        <button type="button" className="ghost small" onClick={onClose} aria-label="Close machine panel">✕</button>
      </div>
      <div className="mp-badges"><StatusBadge status={m.status} /><span className="mp-state">state {lt.machine_state ?? "n/a"}</span></div>
      {!m.status && <p className="notice warn">No completed agent run yet: health, risk and findings appear after <button type="button" className="ghost small" onClick={() => go("agent")}>running the agent</button>.</p>}
      <dl className="mp-kv">
        <dt>Production line</dt><dd>{m.line_id}</dd>
        <dt>Category</dt><dd>{m.machine_type}</dd>
        <dt>Station / zone</dt><dd>{m.station_id} · {m.zone} <span className="muted-text">(placed by type, A-03)</span></dd>
        <dt>Last maintenance</dt><dd>{day(mt.last_maintenance)} <span className="muted-text">· last PM {day(mt.last_pm)}{mt.pm_overdue ? " (overdue)" : ""}</span></dd>
        <dt>Open work orders</dt><dd>{mt.open_work_orders ?? "n/a"}</dd>
      </dl>

      <h4>Latest sensor readings <ValueLabel label="ACTUAL" /></h4>
      <p className="muted-text mp-asof">as of {lt.ts ? lt.ts.replace("T", " ").slice(0, 16) : "n/a"} (historical export)</p>
      <div className="mp-grid">
        <div><span>Temperature</span><b>{n(lt.temperature_c, 1, " °C")}</b></div>
        <div><span>Vibration</span><b>{n(lt.vibration_mm_s, 2, " mm/s")}</b></div>
        <div><span>Motor current</span><b>{n(lt.motor_current_a, 1, " A")}</b></div>
        <div><span>Pressure</span><b>{n(lt.pressure_bar, 2, " bar")}</b></div>
        <div><span>Speed</span><b>{n(lt.rpm, 0, " rpm")}</b></div>
        <div><span>Alarm</span><b>{lt.alarm_code ?? "n/a"}</b></div>
      </div>

      <h4>Condition <ValueLabel label="CALCULATED" /></h4>
      <div className="mp-grid">
        <div><span>Health score</span><b>{n(m.health_score, 0)}</b></div>
        <div><span>Risk score</span><b>{n(m.risk_score, 0)}</b></div>
        <div><span>Utilisation (window)</span><b>{n(met.utilization_pct, 1, "%")}</b></div>
        <div><span>Anomaly hours</span><b>{met.anomalies ?? "n/a"}</b></div>
      </div>
      {sc.drivers?.length > 0 && <p className="muted-text">Risk drivers: {sc.drivers.join(", ").replaceAll("_", " ")}. Rule-based index, not a trained prediction.</p>}

      <h4>Production &amp; energy</h4>
      <p className="mp-small">Production count: not recorded per machine. Line {m.line_id} (7 days): {lp ? `${fmt(lp.actual, 0)} of ${fmt(lp.target, 0)} target units` : <Loader variant="inline" label="loading" />} <ValueLabel label="ACTUAL" /></p>
      <p className="mp-small">Energy: not metered per machine. Plant areas (7 days): {(h.data?.plant_energy_by_area ?? []).slice(0, 3).map((e) => `${e.area} ${fmt(e.kwh, 0)} kWh`).join(" · ") || "loading…"}</p>

      <h4>Sensor trend, last 7 days <ValueLabel label="ACTUAL" /></h4>
      <div className="mp-chart">
        {h.loading ? <Loader variant="card" label="Loading 7-day sensor trend" hint="168 hourly readings for this machine." rows={3} /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--ghost-ink)" vertical={false} />
              <XAxis dataKey="t" tick={{ ...AXIS, fontSize: 9 }} interval={23} />
              <YAxis yAxisId="t" tick={{ ...AXIS, fontSize: 9 }} domain={["auto", "auto"]} />
              <YAxis yAxisId="v" orientation="right" tick={{ ...AXIS, fontSize: 9 }} domain={["auto", "auto"]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="t" dataKey="temperature_c" name="Temp °C" stroke={SERIES[1]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line yAxisId="v" dataKey="vibration_mm_s" name="Vib mm/s" stroke={SERIES[0]} dot={false} strokeWidth={1.2} isAnimationActive={false} />
              <Line yAxisId="t" dataKey="motor_current_a" name="Current A" stroke={SERIES[2]} dot={false} strokeWidth={1.2} isAnimationActive={false} />
              {anomalies.map((a) => <ReferenceDot key={a.ts} yAxisId="t" x={a.t} y={a.temperature_c} r={4} fill="var(--st-critical)" stroke="none" />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {anomalies.length > 0 && <p className="muted-text">Red dots: {anomalies.length} hours flagged is_anomaly in the source data.</p>}

      <h4>Agent findings</h4>
      {m.findings?.length ? m.findings.map((f) => (
        <div key={f.finding_id} className="mp-finding">
          <StatusBadge status={f.severity} /> <b>{f.title}</b>
          <p>{f.explanation}</p>
          {f.root_causes?.length > 0 && <ul>{f.root_causes.slice(0, 4).map((c, i) => <li key={i}><b>{c.cause}</b>: {c.basis} <span className="muted-text">({c.source})</span></li>)}</ul>}
        </div>
      )) : <p className="muted-text">{m.status ? "No finding for this machine in the latest run." : "No agent run yet."}</p>}

      <h4>Recommended action</h4>
      {m.recommendations?.length ? m.recommendations.map((r) => (
        <div key={r.rec_id} className="mp-rec">
          <p>{r.action}</p>
          <div className="mp-badges"><span className="mp-risk">{r.risk_level}</span><span className="mp-state">{r.status}{r.status === "APPROVED" ? ` · ${r.action_status}` : ""}</span>
            <button type="button" className="primary" onClick={() => go("reports", { rec: r.rec_id })}>Open in approval queue</button></div>
        </div>
      )) : <p className="muted-text">No recommendation.</p>}
      <p className="muted-text mp-small">Recommendations need a planner's approval. Nothing here acts on the machine.</p>
    </aside>
  );
}
