import { useApi, fmt, pct } from "../api.js";
import { ApiState, Card, FreshnessBadge, ModelBar, PageHeader, StateBanner, Tile, VerdictBadge } from "../components.jsx";

// GET /api/kpis -> { state_type, model_version, validation_status, assumptions[],
//   kpis: { prediction_error_pct, throughput_improvement_pct, bottleneck_reduction_pct, scenario_turnaround_ms, data_freshness_hours },
//   calibration_verdict, data_freshness: [{source, max_ts, age_hours}] }
export default function Overview() {
  const { data, error, loading } = useApi("/kpis");
  const k = data?.kpis ?? {};
  return (
    <>
      <PageHeader title="Overview" subtitle="Digital Twin Agent: model status and KPIs" state={data?.state_type ?? "SIMULATED"} />
      <StateBanner type="SIMULATED">
        KPIs are computed from twin runs compared with MES actuals. Data freshness refers to the LIVE MES source.
      </StateBanner>
      <ModelBar meta={data} />
      <ApiState loading={loading} error={error} />
      {data && (
        <>
          <div className="row" style={{ alignItems: "center" }}>
            <span><strong>Calibration</strong> <VerdictBadge verdict={data.calibration_verdict} /></span>
            <FreshnessBadge hours={k.data_freshness_hours} />
          </div>
          <div className="grid cols-5">
            <Tile label="Prediction error (MAPE)" value={pct(k.prediction_error_pct)} hint="Twin vs MES on hold-out" state="SIMULATED" />
            <Tile label="Throughput improvement" value={pct(k.throughput_improvement_pct)} hint="Best scenario vs baseline" state="SIMULATED" />
            <Tile label="Bottleneck reduction" value={pct(k.bottleneck_reduction_pct)} hint="Utilisation drop at bottleneck" state="SIMULATED" />
            <Tile label="Scenario turnaround" value={fmt(k.scenario_turnaround_ms)} unit="ms" hint="Mean run time" state="SIMULATED" />
            <Tile label="Model data freshness" value={fmt(k.data_freshness_hours, 0)} unit="h" hint="Age of latest MES hour" state="LIVE" />
          </div>
          <Card title="Data sources">
            <ul>
              {(data.data_freshness ?? []).map((s) => (
                <li key={s.source}>{s.source}: latest {s.max_ts}, age {fmt(s.age_hours, 1)} h</li>
              ))}
              <li>SCADA/IoT, ERP BOM, CAD/layout, cycle-time studies: NOT_CONNECTED</li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
