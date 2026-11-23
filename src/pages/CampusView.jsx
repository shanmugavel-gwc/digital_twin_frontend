import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { api, dt, fmt, go, useApi } from "../api.js";
import { ApiState, Loader, PageHeader, StateBanner } from "../components.jsx";
import { useTokens } from "../three/Scene3D.jsx";
import { AREAS, CampusScene } from "../three/Campus3D.jsx";
import "./campus.css";

// Plant campus twin. Every number shown is one REAL recorded hour from the historical export (GET /api/factory/replay), played back on a
// clock so the twin moves like a live view. Nothing is interpolated or generated. Agent status and approvals are current (not replayed).
const SPEEDS = [[4000, "1×"], [2000, "2×"], [1000, "4×"], [500, "8×"]];
const STATE_STATUS = { RUNNING: "NORMAL", IDLE: "WARNING", SETUP: "WARNING", DOWN: "CRITICAL" };
const RANK = { NORMAL: 0, WARNING: 1, ATTENTION: 2, CRITICAL: 3, OFFLINE: 3 };
const worst = (arr) => arr.filter(Boolean).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), arr.length ? "NORMAL" : null);
const machineStatus = (m) => (!m ? null : m.state === "DOWN" ? "CRITICAL" : m.anomaly ? "ATTENTION" : STATE_STATUS[m.state] ?? "WARNING");
const hh = (ts) => (ts ? ts.slice(11, 16) : "--:--");

const ICON = {
  assembly: "M3 17h18M5 17V9h4v8m2 0V5h4v12m2 0v-6h4v6",
  equipment: "M4 7h16v10H4zM8 7V4h8v3M8 12h3m2 0h3",
  warehouse: "M3 10l9-6 9 6v10H3V10Zm4 10v-6h10v6M7 17h10",
  quality: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  control: "M3 5h18v11H3zM8 20h8M12 16v4M7 12l3-3 2 2 4-4",
  utilities: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
};
function Ico({ id }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[id]} /></svg>;
}

function AreaCard({ id, icon, title, status, focus, onFocus, children, action }) {
  return (
    <section className={`cp-card ${focus === id ? "on" : ""}`} aria-label={title}>
      <button type="button" className="cp-card-head" onClick={() => onFocus(id)} title="Show on the campus">
        <span className="cp-chip"><Ico id={icon} />{title}</span>
        {status && <span className={`cp-dot cp-${status.toLowerCase()}`} title={status} />}
      </button>
      <div className="cp-card-body">{children}</div>
      {action}
    </section>
  );
}

const KV = ({ k, v, sub }) => <div className="cp-kv"><span>{k}</span><b>{v}</b>{sub && <small>{sub}</small>}</div>;

export default function CampusView({ onEnterFloor }) {
  const tok = useTokens();
  const model = useApi("/twin/model");
  const machinesApi = useApi("/factory/machines");
  const [plantId, setPlantId] = useState("IN-KA-01");
  const [day, setDay] = useState("");
  const [rep, setRep] = useState({ loading: true, error: null, data: null });
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2000);
  const [focus, setFocus] = useState(null);
  const [agent, setAgent] = useState({ run: null, pending: null });
  const wrap = useRef();

  const plants = model.data?.plants ?? [];
  const plant = plants.find((p) => p.plant_id === plantId);
  // load one recorded day (24 frames) for the plant
  useEffect(() => {
    let dead = false;
    setRep((r) => ({ ...r, loading: true, error: null }));
    api(`/factory/replay?plant_id=${plantId}&hours=24${day ? `&start=${day}T00:00` : ""}`)
      .then((d) => { if (!dead) { setRep({ loading: false, error: null, data: d }); setIdx(0); if (!day) setDay(d.start.slice(0, 10)); } })
      .catch((e) => { if (!dead) setRep({ loading: false, error: e, data: null }); });
    return () => { dead = true; };
  }, [plantId, day]);
  // current (not replayed) agent status and approvals
  useEffect(() => {
    Promise.all([api("/agent/runs?limit=1"), api("/recommendations?status=PENDING_REVIEW")])
      .then(([r, q]) => setAgent({ run: r.items?.[0] ?? null, pending: q.counts?.by_status?.PENDING_REVIEW ?? 0 }))
      .catch(() => setAgent({ run: null, pending: null }));
  }, []);
  // playback clock: steps through the recorded hours; at the end of the day it moves on to the next recorded day
  const frames = rep.data?.frames ?? [];
  useEffect(() => {
    if (!playing || !frames.length) return undefined;
    const t = setInterval(() => {
      setIdx((i) => {
        if (i + 1 < frames.length) return i + 1;
        const next = new Date(`${rep.data.start.slice(0, 10)}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const nd = next.toISOString().slice(0, 10);
        if (nd <= rep.data.bounds.to.slice(0, 10)) setDay(nd);
        return 0;
      });
    }, speed);
    return () => clearInterval(t);
  }, [playing, speed, frames.length, rep.data]);

  const f = frames[idx];
  const dayData = rep.data?.days?.[f?.ts?.slice(0, 10)] ?? {};
  const reg = (machinesApi.data?.machines ?? []).filter((m) => rep.data?.lines?.includes(m.line_id));
  const mStat = (ids) => worst(ids.map((id) => machineStatus(f?.machines?.[id])));
  const smtIds = reg.filter((m) => m.line_id.startsWith("SMT")).map((m) => m.machine_id);
  const falIds = reg.filter((m) => m.line_id.startsWith("FAL")).map((m) => m.machine_id);
  const lines = Object.entries(f?.lines ?? {}).sort();
  const lineOf = (pfx) => lines.find(([id]) => id.startsWith(pfx))?.[1];
  const smtL = lineOf("SMT"), falL = lineOf("FAL");
  const en = f?.energy ?? {};
  const kwh = Object.values(en).reduce((a, e) => a + (e.kwh ?? 0), 0);
  const pf = Object.values(en).length ? Object.values(en).reduce((a, e) => a + (e.pf ?? 0), 0) / Object.values(en).length : null;
  const q = f?.quality ?? { n: 0, fails: 0 };
  const ship = dayData.shipments;
  const fg = dayData.stock?.["FG-WH-01"], rm = dayData.stock?.["RM-WH-01"];
  const shift = smtL?.shift ?? falL?.shift;
  const staff = shift ? dayData.staff?.[shift] : null;
  const running = reg.filter((m) => f?.machines?.[m.machine_id]?.state === "RUNNING").length;
  const anomalies = reg.filter((m) => f?.machines?.[m.machine_id]?.anomaly).length;

  const status = {
    smt: mStat(smtIds), fal: mStat(falIds),
    quality: f ? (q.fails > 0 ? "WARNING" : "NORMAL") : null,
    warehouse: ship ? (ship.delayed > 0 ? "WARNING" : "NORMAL") : (dayData.stock ? "NORMAL" : null),
    utilities: pf == null ? null : pf < 0.9 ? "WARNING" : "NORMAL",
    control: agent.run ? (agent.run.status === "FAILED" ? "CRITICAL" : agent.pending ? "WARNING" : "NORMAL") : null,
  };
  const subs = {
    smt: smtL ? `${fmt(smtL.actual, 0)} / ${fmt(smtL.target, 0)} units this hour` : "no MES record this hour",
    fal: falL ? `${fmt(falL.actual, 0)} / ${fmt(falL.target, 0)} units this hour` : "no MES record this hour",
    warehouse: fg ? `FG ${fmt(fg.on_hand, 0)} on hand` : "",
    quality: `${q.n} inspections · ${q.fails} failed`,
    utilities: kwh ? `${fmt(kwh, 0)} kWh this hour` : "",
    control: agent.pending != null ? `${agent.pending} approvals pending` : "",
  };

  // event feed: real events recorded in the hours played so far today
  const events = useMemo(() => {
    const out = [];
    frames.slice(0, idx + 1).forEach((fr, i) => {
      const prev = frames[i - 1];
      Object.entries(fr.machines).forEach(([id, m]) => {
        if (m.state === "DOWN" && prev?.machines?.[id]?.state !== "DOWN") out.push({ ts: fr.ts, sev: "CRITICAL", text: `${id} went DOWN` });
        if (m.anomaly) out.push({ ts: fr.ts, sev: "ATTENTION", text: `${id} anomaly flag · ${fmt(m.temp, 1)} °C, ${fmt(m.vib, 2)} mm/s` });
        if (m.alarm && m.alarm !== "NONE" && prev?.machines?.[id]?.alarm !== m.alarm) out.push({ ts: fr.ts, sev: "WARNING", text: `${id} alarm ${m.alarm}` });
      });
      fr.downtime_events.forEach((d) => out.push({ ts: fr.ts, sev: "WARNING", text: `${d.machine_id} downtime ${d.reason === "NONE" ? "(no reason recorded)" : d.reason} · ${fmt(d.minutes, 0)} min` }));
      if (fr.quality?.fails) out.push({ ts: fr.ts, sev: "WARNING", text: `${fr.quality.fails} failed inspection(s)${fr.quality.defect ? ` · ${fr.quality.defect}` : ""}` });
    });
    return out.reverse().slice(0, 40);
  }, [frames, idx]);

  const bounds = rep.data?.bounds;
  return (
    <div className="cp">
      <PageHeader title="Digital Twin – Plant Campus" subtitle="Aerial view of the plant. Every building is tied to its data; the clock replays the recorded hours of the plant." state="LIVE" />
      <StateBanner type="LIVE">
        <b>REPLAY</b> of recorded data from the historical export, played back hour by hour: each frame is one real recorded hour, nothing is
        generated. Campus layout, vehicles and trees are illustrative (no site plan in the data). Agent status and approvals are current.
      </StateBanner>
      <ApiState loading={model.loading} error={model.error || rep.error || machinesApi.error} label="Loading the plant" hint="Plants, lines and machines." rows={0} />

      <div className="cp-toolbar">
        <label className="field"><span>Plant</span>
          <select value={plantId} onChange={(e) => { setPlantId(e.target.value); setFocus(null); }}>
            {plants.map((p) => <option key={p.plant_id} value={p.plant_id}>{p.plant_name ?? p.plant_id}</option>)}
          </select>
        </label>
        <label className="field"><span>Recorded day</span>
          <input type="date" value={day} min={bounds?.from?.slice(0, 10)} max={bounds?.to?.slice(0, 10)} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <div className="cp-clock" aria-live="polite">
          <span className="cp-rec">● REPLAY</span>
          <b>{f ? `${f.ts.slice(0, 10)} ${hh(f.ts)}` : "loading…"}</b>
          <small>{shift ? `shift ${shift}` : ""}{rep.loading ? " · loading day…" : ""}</small>
        </div>
        <button type="button" className="primary" onClick={() => setPlaying((p) => !p)} disabled={!frames.length}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <div className="seg" role="group" aria-label="Replay speed">
          {SPEEDS.map(([ms, l]) => <button key={ms} type="button" aria-pressed={speed === ms} onClick={() => setSpeed(ms)}>{l}</button>)}
        </div>
        <input className="cp-scrub" type="range" min={0} max={Math.max(0, frames.length - 1)} value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false); }}
          aria-label="Recorded hour" disabled={!frames.length} />
        <button type="button" className="ghost" onClick={() => wrap.current?.requestFullscreen?.()}>Fullscreen</button>
      </div>

      <div className="cp-stage-row">
        <div ref={wrap} className="cp-stage" role="group" aria-label={`3D campus of ${plant?.plant_name ?? plantId}`}>
          <Canvas shadows camera={{ position: [-18, 105, 158], fov: 40, far: 900 }} dpr={[1, 1.75]}>
            <Suspense fallback={null}>
              <CampusScene tok={tok} hour={f ? Number(f.ts.slice(11, 13)) : 12} plantName={plant?.plant_name ?? plantId} status={status} subs={subs}
                focus={focus} onSelect={setFocus} running={playing} />
            </Suspense>
          </Canvas>
          {rep.loading && <Loader variant="overlay" label={day ? `Loading recorded day ${day}` : "Loading the recorded hours of the plant"} hint="24 recorded hours: machines, lines, quality, energy, stock." />}
          <div className="cp-legend" aria-label="Status colours">
            {[["NORMAL", "running"], ["WARNING", "idle / setup / attention"], ["ATTENTION", "anomaly flag"], ["CRITICAL", "machine down"]].map(([s, l]) => (
              <span key={s}><i className={`cp-dot cp-${s.toLowerCase()}`} />{l}</span>
            ))}
          </div>
          {focus && (
            <div className="cp-focus">
              <b>{AREAS[focus].label}</b>
              <span>{subs[focus]}</span>
              <div>
                {(focus === "smt" || focus === "fal") && onEnterFloor && <button type="button" className="primary" onClick={onEnterFloor}>Enter 3D factory floor</button>}
                <button type="button" className="ghost" onClick={() => setFocus(null)}>Whole campus</button>
              </div>
            </div>
          )}
        </div>
        <aside className="cp-feed" aria-label="Event feed">
          <h3>Event feed <small>recorded events, {f ? f.ts.slice(0, 10) : ""}</small></h3>
          {events.length === 0 ? <p className="muted-text">No events recorded yet in the hours played.</p> : (
            <ul>{events.map((e, i) => <li key={i} className={`cp-ev cp-ev-${e.sev.toLowerCase()}`}><time>{hh(e.ts)}</time><span>{e.text}</span></li>)}</ul>
          )}
        </aside>
      </div>

      <div className="cp-cards">
        <AreaCard id="smt" icon="assembly" title="Assembly Lines" status={worst([status.smt, status.fal])} focus={focus} onFocus={setFocus}
          action={onEnterFloor && <button type="button" className="ghost small cp-act" onClick={onEnterFloor}>Open 3D factory floor →</button>}>
          {lines.length === 0 ? <p className="muted-text">No MES record this hour.</p> : lines.map(([id, l]) => (
            <KV key={id} k={id} v={`${fmt(l.actual, 0)} / ${fmt(l.target, 0)}`} sub={l.downtime_min ? `${fmt(l.downtime_min, 0)} min down · ${l.reason}` : `${fmt((l.actual / l.target) * 100, 0)}% of target`} />
          ))}
        </AreaCard>
        <AreaCard id="fal" icon="equipment" title="SMT & Test Equipment" status={worst([status.smt, status.fal])} focus={focus} onFocus={setFocus}>
          <KV k="Running" v={`${running} of ${reg.length}`} sub={anomalies ? `${anomalies} anomaly flag(s) this hour` : "no anomaly flags"} />
          <div className="cp-mchips">
            {reg.map((m) => {
              const s = machineStatus(f?.machines?.[m.machine_id]);
              return (
                <button key={m.machine_id} type="button" className={`cp-mchip cp-${(s ?? "none").toLowerCase()}`} title={`${m.machine_name} · ${f?.machines?.[m.machine_id]?.state ?? "no record"}`}
                  onClick={() => go("twin", { machine: m.machine_id })}>{m.machine_id.replace("M-", "")}</button>
              );
            })}
          </div>
        </AreaCard>
        <AreaCard id="warehouse" icon="warehouse" title="Warehouse & Logistics" status={status.warehouse} focus={focus} onFocus={setFocus}>
          <KV k="Finished goods" v={fg ? fmt(fg.on_hand, 0) : "n/a"} sub={fg ? `${fmt(fg.hold, 0)} on quality hold` : ""} />
          <KV k="Raw material" v={rm ? fmt(rm.on_hand, 0) : "n/a"} sub="RM-WH-01, day snapshot" />
          <KV k="Shipments dispatched" v={ship ? ship.n : 0} sub={ship ? `${fmt(ship.qty, 0)} units · ${ship.delayed} delayed` : "none on this day"} />
        </AreaCard>
        <AreaCard id="quality" icon="quality" title="Quality Testing Lab" status={status.quality} focus={focus} onFocus={setFocus}>
          <KV k="Inspections this hour" v={q.n} sub={q.n ? `${fmt(((q.n - q.fails) / q.n) * 100, 0)}% passed` : "none recorded"} />
          <KV k="Failed" v={q.fails} sub={q.defect ? `defect ${q.defect}` : ""} />
        </AreaCard>
        <AreaCard id="control" icon="control" title="Production Control Room" status={status.control} focus={focus} onFocus={setFocus}
          action={<button type="button" className="ghost small cp-act" onClick={() => go("agent")}>Agent execution →</button>}>
          <KV k="Digital Twin Agent" v={agent.run?.status ?? "n/a"} sub={agent.run?.finished_at ? `completed ${dt(agent.run.finished_at)}` : "current, not replayed"} />
          <KV k="Pending approvals" v={agent.pending ?? "n/a"} sub="current" />
          <KV k="Staff on shift" v={staff ? `${staff.present} / ${staff.rostered}` : "n/a"} sub={shift ? `shift ${shift}, recorded day` : ""} />
        </AreaCard>
        <AreaCard id="utilities" icon="utilities" title="Utilities & Infrastructure" status={status.utilities} focus={focus} onFocus={setFocus}>
          <KV k="Energy this hour" v={kwh ? `${fmt(kwh, 0)} kWh` : "n/a"} sub={pf != null ? `power factor ${fmt(pf, 2)}` : ""} />
          <div className="cp-ebars">
            {Object.entries(en).sort((a, b) => b[1].kwh - a[1].kwh).map(([a, e]) => (
              <div key={a}><span>{a}</span><i style={{ width: `${(e.kwh / Math.max(...Object.values(en).map((x) => x.kwh))) * 100}%` }} /><b>{fmt(e.kwh, 0)}</b></div>
            ))}
          </div>
        </AreaCard>
      </div>
      <p className="muted-text cp-foot">Source: GET /api/factory/replay ({rep.data?.note ?? "recorded hours"}). Machine colours here are the recorded state of the hour; the 3D factory floor shows the agent's health status.</p>
    </div>
  );
}
