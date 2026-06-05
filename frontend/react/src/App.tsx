import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  alertCandidates,
  alerts,
  covariance,
  discoveryCatalog,
  gpuStarvation,
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
  type SensorRows
} from "./api";

const refreshMs = 5000;

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

  return (
    <main className="shell">
      <header className="top">
        <div className="brandMark">t</div>
        <div>
          <h1>turbalance Analytics</h1>
          <p>Lakehouse telemetry console</p>
        </div>
        <StatusPill healthy={!hasError([hostQuery, meQuery, discoveryQuery, alertQuery, covarianceQuery, modeQuery])} />
      </header>

      <section className="summaryGrid">
        <Summary label="Hosts" value={hostQuery.data?.hosts.length ?? 0} />
        <Summary label="Open Alerts" value={alertQuery.data?.alerts.length ?? 0} />
        <Summary label="Samples" value={covarianceQuery.data?.sampleCount ?? 0} />
        <Summary label="Principal Mode" value={modeQuery.data?.title ?? "Learning"} />
        <Summary label="Role" value={meQuery.data?.role ?? "local"} />
        <Summary label="Agents" value={discoveryQuery.data?.agents.length ?? 0} />
      </section>

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

function formatNumber(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "-" : value.toFixed(2);
}

function hasError(queries: Array<{ isError: boolean }>): boolean {
  return queries.some((query) => query.isError);
}
