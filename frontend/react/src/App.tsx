import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  alertCandidates,
  alerts,
  covariance,
  discoveryCatalog,
  gpuStarvation,
  hostResources,
  hosts,
  inputPipelineStall,
  me,
  networkGpuCoupling,
  noisyNeighbor,
  principalResourceMode,
  type Alert,
  type CovarianceResponse,
  type DiscoveryCatalog,
  type PrincipalMode,
  type ResourceSample,
  type SensorRows
} from "./api";

const refreshMs = 5000;
const defaultGpuHourRateUsd = 6.2;
const economicsDefaults = {
  electricityUsdPerKwh: 0.12,
  pue: 1.35,
  salvagePct: 0.1,
  gpuUsefulLifeYears: 5,
  hostUsefulLifeYears: 4,
  maintenancePctPerYear: 0.08,
  facilityPctPerYear: 0.04,
  cpuEquivalentRateFactor: 0.08
};
const hoursPerYear = 8760;

export function App() {
  const hostQuery = useQuery({ queryKey: ["hosts"], queryFn: hosts, refetchInterval: refreshMs });
  const meQuery = useQuery({ queryKey: ["me"], queryFn: me, refetchInterval: refreshMs });
  const discoveryQuery = useQuery({ queryKey: ["discovery"], queryFn: discoveryCatalog, refetchInterval: refreshMs });
  const alertQuery = useQuery({ queryKey: ["alerts"], queryFn: alerts, refetchInterval: refreshMs });
  const covarianceQuery = useQuery({ queryKey: ["covariance"], queryFn: covariance, refetchInterval: refreshMs });
  const modeQuery = useQuery({ queryKey: ["principal-mode"], queryFn: principalResourceMode, refetchInterval: refreshMs });
  const starvationQuery = useQuery({ queryKey: ["gpu-starvation"], queryFn: gpuStarvation, refetchInterval: refreshMs });
  const couplingQuery = useQuery({ queryKey: ["network-gpu-coupling"], queryFn: networkGpuCoupling, refetchInterval: refreshMs });
  const neighborQuery = useQuery({ queryKey: ["noisy-neighbor"], queryFn: noisyNeighbor, refetchInterval: refreshMs });
  const stallQuery = useQuery({ queryKey: ["input-pipeline-stall"], queryFn: inputPipelineStall, refetchInterval: refreshMs });
  const candidateQuery = useQuery({ queryKey: ["alert-candidates"], queryFn: alertCandidates, refetchInterval: refreshMs });
  const rollingHistory = useRollingHistory(covarianceQuery.data, modeQuery.data);
  const hostList = hostQuery.data?.hosts.length
    ? hostQuery.data.hosts
    : discoveryQuery.data?.hosts.length
      ? discoveryQuery.data.hosts.map((host) => ({ hostId: host.hostId }))
      : [{ hostId: "current-unit" }];
  const resourceQueries = useQueries({
    queries: hostList.slice(0, 16).map((host) => ({
      queryKey: ["host-resources", host.hostId],
      queryFn: () => hostResources(host.hostId),
      refetchInterval: refreshMs,
      enabled: Boolean(host.hostId)
    }))
  });
  const economicsRows = buildUnitEconomicsRows(
    hostList,
    resourceQueries.map((query) => query.data?.rows ?? [])
  );

  return (
    <main className="shell">
      <header className="top">
        <div className="brandMark">t</div>
        <div>
          <h1>turbalance Analytics</h1>
          <p>Lakehouse telemetry console</p>
        </div>
        <div className="topActions">
          <StatusPill healthy={!hasError([hostQuery, meQuery, discoveryQuery, alertQuery, covarianceQuery, modeQuery])} />
          <div className="topUser" aria-label="Signed in user">
            <span className="topUserCopy">
              <span className="topUserName">Ahmad Byagowi</span>
              <span className="topUserRole">Demo operator</span>
            </span>
            <img className="topUserAvatar" src="/ahmad-byagowi-profile.png" alt="Ahmad Byagowi" />
          </div>
        </div>
      </header>

      <section className="summaryGrid">
        <Summary label="Hosts" value={hostQuery.data?.hosts.length ?? 0} />
        <Summary label="Open Alerts" value={alertQuery.data?.alerts.length ?? 0} />
        <Summary label="Samples" value={covarianceQuery.data?.sampleCount ?? 0} />
        <Summary label="Principal Mode" value={modeQuery.data?.title ?? "Learning"} />
        <Summary label="Role" value={meQuery.data?.role ?? "local"} />
        <Summary label="Agents" value={discoveryQuery.data?.agents.length ?? 0} />
      </section>

      <Panel title="Unit Economics" className="wide full">
        <UnitEconomicsPanel rows={economicsRows} />
      </Panel>

      <section className="workspace">
        <Panel title="Covariance Matrix" className="wide">
          <CovarianceMatrix value={covarianceQuery.data} history={rollingHistory} />
        </Panel>
        <Panel title="Eigen Mode">
          <PrincipalModePanel value={modeQuery.data} history={rollingHistory} />
        </Panel>
        <Panel title="Alerts" className="wide">
          <AlertsList alerts={alertQuery.data?.alerts ?? []} />
        </Panel>
        <Panel title="Virtual Sensors">
          <SensorCounts
            starvation={starvationQuery.data}
            coupling={couplingQuery.data}
            neighbor={neighborQuery.data}
            stall={stallQuery.data}
            candidates={candidateQuery.data}
          />
        </Panel>
        <Panel title="Control Plane" className="wide">
          <ControlPlaneCatalog value={discoveryQuery.data} />
        </Panel>
      </section>
    </main>
  );
}

type UnitEconomicsPoint = {
  label: string;
  revenuePerHour: number;
  costPerHour: number;
  profitPerHour: number;
};

type UnitEconomicsRow = {
  hostId: string;
  acceleratorLabel: string;
  utilizationPct: number;
  capexUsd: number;
  bookValueUsd: number;
  depreciationPerHour: number;
  opexPerHour: number;
  revenuePerHour: number;
  costPerHour: number;
  profitPerHour: number;
  breakEvenPct: number | null;
  tone: "good" | "watch" | "poor";
  estimated: boolean;
  history: UnitEconomicsPoint[];
};

function UnitEconomicsPanel({ rows }: { rows: UnitEconomicsRow[] }) {
  if (!rows.length) return <EmptyState text="Waiting for host economics" />;
  const totals = rows.reduce(
    (accumulator, row) => ({
      revenuePerHour: accumulator.revenuePerHour + row.revenuePerHour,
      costPerHour: accumulator.costPerHour + row.costPerHour,
      profitPerHour: accumulator.profitPerHour + row.profitPerHour,
      depreciationPerHour: accumulator.depreciationPerHour + row.depreciationPerHour,
      opexPerHour: accumulator.opexPerHour + row.opexPerHour
    }),
    { revenuePerHour: 0, costPerHour: 0, profitPerHour: 0, depreciationPerHour: 0, opexPerHour: 0 }
  );
  return (
    <div className="economicsPanel">
      <div className="economicsSummary">
        <Summary label="Net P/L" value={formatMoneyPerHour(totals.profitPerHour, true)} />
        <Summary label="Revenue" value={formatMoneyPerHour(totals.revenuePerHour)} />
        <Summary label="Loaded Cost" value={formatMoneyPerHour(totals.costPerHour)} />
        <Summary label="Depreciation" value={formatMoneyPerHour(totals.depreciationPerHour)} />
      </div>
      <div className="economicsGrid">
        {rows.map((row) => (
          <article className={`economicsCard ${row.tone}`} key={row.hostId}>
            <div className="economicsCardHead">
              <div>
                <strong>{row.hostId}</strong>
                <small>{row.acceleratorLabel}</small>
              </div>
              <span>{formatMoneyPerHour(row.profitPerHour, true)}</span>
            </div>
            <EconomicsChart row={row} />
            <div className="economicsLegend">
              <span className="revenue">Revenue</span>
              <span className="cost">OPEX + depreciation</span>
              <span className="profit">Profit/loss</span>
            </div>
            <div className="economicsMetrics">
              <Metric label="Utilization" value={`${row.utilizationPct.toFixed(0)}%`} note={row.breakEvenPct == null ? "break-even n/a" : `break-even ${row.breakEvenPct.toFixed(0)}%`} />
              <Metric label="CAPEX" value={formatMoney(row.capexUsd)} note={row.estimated ? "estimated" : "reported"} />
              <Metric label="Book value" value={formatMoney(row.bookValueUsd)} note="straight-line" />
              <Metric label="OPEX" value={formatMoneyPerHour(row.opexPerHour)} note="power + support" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{note}</em>
    </span>
  );
}

function EconomicsChart({ row }: { row: UnitEconomicsRow }) {
  const width = 360;
  const height = 116;
  const padX = 14;
  const padY = 12;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const values = row.history.flatMap((point) => [point.revenuePerHour, point.costPerHour, point.profitPerHour]);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const yFor = (value: number) => padY + innerHeight - ((value - min) / range) * innerHeight;
  const pointsFor = (key: keyof UnitEconomicsPoint) =>
    row.history
      .map((point, index) => {
        const value = point[key];
        if (typeof value !== "number") return "";
        const x = padX + (row.history.length <= 1 ? innerWidth : (index / (row.history.length - 1)) * innerWidth);
        return `${x.toFixed(1)},${yFor(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");

  return (
    <svg className="economicsChart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${row.hostId} unit economics`}>
      {[0.25, 0.5, 0.75].map((ratio) => {
        const y = padY + innerHeight * ratio;
        return <line className="economicsGridLine" key={ratio} x1={padX} x2={width - padX} y1={y} y2={y} />;
      })}
      <line className="economicsZeroLine" x1={padX} x2={width - padX} y1={yFor(0)} y2={yFor(0)} />
      <polyline className="economicsLine revenue" points={pointsFor("revenuePerHour")} />
      <polyline className="economicsLine cost" points={pointsFor("costPerHour")} />
      <polyline className="economicsLine profit" points={pointsFor("profitPerHour")} />
    </svg>
  );
}

function ControlPlaneCatalog({ value }: { value?: DiscoveryCatalog }) {
  if (!value || value.status === "unconfigured") return <EmptyState text="Discovery not configured" />;
  if (value.status !== "ready") return <EmptyState text="Discovery unavailable" />;
  return (
    <div className="catalog">
      <div className="catalogStats">
        <Summary label="Metadata" value={value.ready.metadataBackend ?? "-"} />
        <Summary label="Cert Mode" value={value.ready.certificateMode ?? "-"} />
        <Summary label="Hosts" value={value.hosts.length} />
        <Summary label="Services" value={value.services.length} />
      </div>
      <div className="rows compact">
        {value.agents.slice(0, 5).map((agent) => (
          <div className="row" key={agent.agentId}>
            <div>
              <strong>{agent.agentId}</strong>
              <small>{agent.spiffeId}</small>
            </div>
            <span className={`severity ${agent.certificateStatus === "active" ? "info" : "warning"}`}>
              {agent.certificateStatus || agent.status}
            </span>
          </div>
        ))}
        {!value.agents.length && <EmptyState text="No enrolled agents" />}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="summary">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function StatusPill({ healthy }: { healthy: boolean }) {
  return <span className={`status ${healthy ? "healthy" : "degraded"}`}>{healthy ? "API live" : "API degraded"}</span>;
}

type RollingHistoryPoint = {
  timestamp: number;
  cells: Record<string, number | null>;
  eigenvalues: number[];
};

function useRollingHistory(covarianceValue?: CovarianceResponse, principalMode?: PrincipalMode) {
  const [history, setHistory] = useState<RollingHistoryPoint[]>([]);
  useEffect(() => {
    if (!covarianceValue?.rows.length) return;
    const cells: Record<string, number | null> = {};
    covarianceValue.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        cells[`${cell.leftMetric}:${cell.rightMetric}`] = cell.covariance;
      });
    });
    setHistory((current) => {
      const next = [
        ...current,
        {
          timestamp: Date.now(),
          cells,
          eigenvalues: principalMode?.eigenvalues.map((entry) => entry.value) ?? []
        }
      ];
      return next.slice(-36);
    });
  }, [covarianceValue, principalMode]);
  return history;
}

function CovarianceMatrix({ value, history }: { value?: CovarianceResponse; history: RollingHistoryPoint[] }) {
  if (!value?.rows.length) return <EmptyState text="No covariance data" />;
  return (
    <div className="matrix">
      <div className="corner" />
      {value.metrics.map((metric) => (
        <div className="axis" key={metric}>{metric.toUpperCase()}</div>
      ))}
      {value.rows.map((row) => (
        <RowCells key={row.metric} row={row} history={history} />
      ))}
    </div>
  );
}

function RowCells({ row, history }: { row: CovarianceResponse["rows"][number]; history: RollingHistoryPoint[] }) {
  return (
    <>
      <div className="axis left">{row.metric.toUpperCase()}</div>
      {row.cells.map((cell) => (
        <div className="cell" key={`${cell.leftMetric}-${cell.rightMetric}`}>
          <strong>{formatNumber(cell.correlation)}</strong>
          <span>{formatNumber(cell.covariance)}</span>
          <Sparkline values={history.map((point) => point.cells[`${cell.leftMetric}:${cell.rightMetric}`] ?? null)} />
        </div>
      ))}
    </>
  );
}

function PrincipalModePanel({ value, history }: { value?: PrincipalMode; history: RollingHistoryPoint[] }) {
  if (!value) return <EmptyState text="Learning" />;
  return (
    <div className="modePanel">
      <div>
        <span className="eyebrow">{value.status}</span>
        <strong>{value.title}</strong>
        <small>{value.explainedPct == null ? "Variance pending" : `${value.explainedPct.toFixed(1)}% variance`}</small>
      </div>
      <div className="bars">
        {value.loadings.map((loading) => (
          <div className="barRow" key={loading.metric}>
            <span>{loading.metric}</span>
            <div className="barTrack">
              <div style={{ width: `${Math.min(100, Math.abs((loading.value ?? 0) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="eigenList">
        {value.eigenvalues.map((entry, index) => (
          <span key={index}>
            <strong>{entry.value.toFixed(2)}</strong>
            <small>{entry.sharePct.toFixed(1)}%</small>
            <Sparkline values={history.map((point) => point.eigenvalues[index] ?? null)} />
          </span>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const points = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (points.length < 2) return <svg className="spark" viewBox="0 0 64 18" aria-hidden="true" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = 64 / Math.max(1, points.length - 1);
  const path = points
    .map((value, index) => {
      const x = index * step;
      const y = 16 - ((value - min) / span) * 14;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 64 18" aria-hidden="true">
      <polyline points={path} />
    </svg>
  );
}

function AlertsList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <EmptyState text="No active alerts" />;
  return (
    <div className="rows">
      {alerts.slice(0, 6).map((alert) => (
        <div className="row" key={alert.incidentKey}>
          <div>
            <strong>{alert.title}</strong>
            <small>{alert.evidence}</small>
          </div>
          <span className={`severity ${alert.severity}`}>{alert.severity}</span>
        </div>
      ))}
    </div>
  );
}

function SensorCounts({
  starvation,
  coupling,
  neighbor,
  stall,
  candidates
}: {
  starvation?: SensorRows;
  coupling?: SensorRows;
  neighbor?: SensorRows;
  stall?: SensorRows;
  candidates?: SensorRows;
}) {
  return (
    <div className="sensorList">
      <Summary label="GPU Starvation" value={starvation?.count ?? 0} />
      <Summary label="Network/GPU Coupling" value={coupling?.count ?? 0} />
      <Summary label="Noisy Neighbor" value={neighbor?.count ?? 0} />
      <Summary label="Input Stall" value={stall?.count ?? 0} />
      <Summary label="Alert Candidates" value={candidates?.count ?? 0} />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function buildUnitEconomicsRows(hostList: Array<{ hostId: string }>, resourceRows: ResourceSample[][]): UnitEconomicsRow[] {
  return hostList.slice(0, 16).map((host, index) => {
    const samples = resourceRows[index] ?? [];
    const latest = samples[samples.length - 1];
    const gpuPresent = samples.some((sample) => sample.gpu != null) || /gpu|h100|h200|b200|a100|l40|rtx/i.test(host.hostId);
    const utilizationPct = clamp(gpuPresent ? latest?.gpu ?? 0 : latest?.cpu ?? 0, 0, 100);
    const capexUsd = estimateCapex(host.hostId, gpuPresent);
    const usefulLifeYears = gpuPresent ? economicsDefaults.gpuUsefulLifeYears : economicsDefaults.hostUsefulLifeYears;
    const salvageUsd = capexUsd * economicsDefaults.salvagePct;
    const depreciationPerHour = (capexUsd - salvageUsd) / (usefulLifeYears * hoursPerYear);
    const bookValueUsd = Math.max(salvageUsd, capexUsd - depreciationPerHour * hoursPerYear * 0.3);
    const rate = defaultGpuHourRateUsd * (gpuPresent ? 1 : economicsDefaults.cpuEquivalentRateFactor);
    const capacityUnits = gpuPresent ? 1 : 1;
    const fullRevenuePerHour = rate * capacityUnits;
    const watts = estimateWatts(host.hostId, gpuPresent);
    const supportOpexPerHour = capexUsd * (economicsDefaults.maintenancePctPerYear + economicsDefaults.facilityPctPerYear) / hoursPerYear;
    const powerOpexPerHour = watts * economicsDefaults.pue / 1000 * economicsDefaults.electricityUsdPerKwh;
    const opexPerHour = supportOpexPerHour + powerOpexPerHour;
    const costPerHour = opexPerHour + depreciationPerHour;
    const revenuePerHour = fullRevenuePerHour * (utilizationPct / 100);
    const profitPerHour = revenuePerHour - costPerHour;
    const history = economicsHistory(samples, {
      gpuPresent,
      fallbackUtilizationPct: utilizationPct,
      fullRevenuePerHour,
      costPerHour
    });
    return {
      hostId: host.hostId,
      acceleratorLabel: gpuPresent ? "accelerator unit" : "host-only unit",
      utilizationPct,
      capexUsd,
      bookValueUsd,
      depreciationPerHour,
      opexPerHour,
      revenuePerHour,
      costPerHour,
      profitPerHour,
      breakEvenPct: fullRevenuePerHour > 0 ? (costPerHour / fullRevenuePerHour) * 100 : null,
      tone: profitPerHour >= 0 ? "good" : profitPerHour > -costPerHour * 0.25 ? "watch" : "poor",
      estimated: true,
      history
    };
  });
}

function economicsHistory(samples: ResourceSample[], model: { gpuPresent: boolean; fallbackUtilizationPct: number; fullRevenuePerHour: number; costPerHour: number }): UnitEconomicsPoint[] {
  const source = samples.length >= 2 ? samples.slice(-18) : syntheticEconomicsSamples(model.fallbackUtilizationPct, model.gpuPresent);
  return source.map((sample, index) => {
    const utilizationPct = "event_ts" in sample
      ? clamp(model.gpuPresent ? sample.gpu ?? 0 : sample.cpu ?? 0, 0, 100)
      : clamp(model.fallbackUtilizationPct + Math.sin(index * 0.7) * 4, 0, 100);
    const revenuePerHour = model.fullRevenuePerHour * (utilizationPct / 100);
    return {
      label: "event_ts" in sample ? sample.event_ts : `${index}`,
      revenuePerHour,
      costPerHour: model.costPerHour,
      profitPerHour: revenuePerHour - model.costPerHour
    };
  });
}

function syntheticEconomicsSamples(fallbackUtilizationPct: number, gpuPresent: boolean): ResourceSample[] {
  return Array.from({ length: 14 }, (_unused, index) => ({
    host_id: "synthetic",
    event_ts: String(index),
    cpu: gpuPresent ? null : clamp(fallbackUtilizationPct + Math.sin(index * 0.7) * 4, 0, 100),
    gpu: gpuPresent ? clamp(fallbackUtilizationPct + Math.sin(index * 0.7) * 4, 0, 100) : null,
    ram: null,
    network: null
  }));
}

function estimateCapex(hostId: string, gpuPresent: boolean): number {
  const label = hostId.toLowerCase();
  if (/raspberry|(^|\b)pi\d*\b/.test(label)) return 120;
  if (/nuc|mini/.test(label)) return 900;
  if (/b200|gb200/.test(label)) return 48000;
  if (/h200/.test(label)) return 40000;
  if (/h100/.test(label)) return 38000;
  if (/a100/.test(label)) return 20000;
  if (/rtx|l40|a6000/.test(label)) return 9500;
  return gpuPresent ? 23000 : 2500;
}

function estimateWatts(hostId: string, gpuPresent: boolean): number {
  const label = hostId.toLowerCase();
  if (/raspberry|(^|\b)pi\d*\b/.test(label)) return 8;
  if (/nuc|mini/.test(label)) return 45;
  if (!gpuPresent) return 180;
  if (/b200|h200|h100/.test(label)) return 920;
  if (/a100/.test(label)) return 720;
  if (/rtx|l40|a6000/.test(label)) return 520;
  return 650;
}

function formatNumber(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "-" : value.toFixed(2);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatMoneyPerHour(value: number, signed = false): string {
  const prefix = signed && value > 0 ? "+" : signed && value < 0 ? "-" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Math.abs(value))}/hr`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function hasError(queries: Array<{ isError: boolean }>): boolean {
  return queries.some((query) => query.isError);
}
