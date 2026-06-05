export type Host = { hostId: string };
export type ResourceSample = {
  host_id: string;
  event_ts: string;
  cpu: number | null;
  gpu: number | null;
  ram: number | null;
  network: number | null;
};
export type CovarianceCell = {
  leftMetric: string;
  rightMetric: string;
  sampleCount: number;
  covariance: number | null;
  correlation: number | null;
};
export type CovarianceResponse = {
  metrics: string[];
  rows: Array<{ metric: string; cells: CovarianceCell[] }>;
  sampleCount: number;
};
export type PrincipalMode = {
  status: string;
  title: string;
  explainedPct: number | null;
  loadings: Array<{ metric: string; value: number | null }>;
  eigenvalues: Array<{ value: number; sharePct: number }>;
};
export type Alert = {
  incidentKey: string;
  severity: string;
  title: string;
  confidence: number;
  evidence: string;
  owner: string;
  status: string;
};
export type SensorRows<T = Record<string, unknown>> = { rows: T[]; count: number };
export type Principal = {
  subject: string;
  role: string;
  tenantId: string;
  authenticated: boolean;
  authRequired: boolean;
};
export type DiscoveryCatalog = {
  status: string;
  ready: { metadataBackend?: string; certificateMode?: string };
  hosts: Array<{ hostId: string; hostname?: string; agentId?: string; lastSeenAt?: string }>;
  agents: Array<{
    agentId: string;
    hostId: string;
    status: string;
    spiffeId: string;
    certificateStatus: string;
    certificateNotAfter: string;
  }>;
  services: Array<{ serviceId: string; serviceType: string; baseUrl: string; healthUrl: string; lastSeenAt?: string }>;
};

const apiBase = import.meta.env.VITE_TURBALANCE_API_BASE ?? "http://127.0.0.1:8080";

export async function fetchJson<T>(path: string): Promise<T> {
  const token = apiToken();
  const response = await fetch(`${apiBase}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function apiToken(): string {
  const envToken = import.meta.env.VITE_TURBALANCE_API_TOKEN ?? "";
  if (envToken) return envToken;
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("turbalance.apiToken") ?? "";
}

export function me() {
  return fetchJson<Principal>("/v1/me");
}

export function discoveryCatalog() {
  return fetchJson<DiscoveryCatalog>("/v1/discovery/catalog");
}

export function hosts() {
  return fetchJson<{ hosts: Host[] }>("/v1/hosts");
}

export function hostResources(hostId: string) {
  return fetchJson<{ rows: ResourceSample[] }>(`/v1/hosts/${encodeURIComponent(hostId)}/resources`);
}

export function covariance() {
  return fetchJson<CovarianceResponse>("/v1/virtual-sensors/covariance");
}

export function principalResourceMode() {
  return fetchJson<PrincipalMode>("/v1/virtual-sensors/principal-resource-mode");
}

export function alerts() {
  return fetchJson<{ alerts: Alert[] }>("/v1/alerts");
}

export function gpuStarvation() {
  return fetchJson<SensorRows>("/v1/virtual-sensors/gpu-starvation");
}

export function networkGpuCoupling() {
  return fetchJson<SensorRows>("/v1/virtual-sensors/network-gpu-coupling");
}

export function noisyNeighbor() {
  return fetchJson<SensorRows>("/v1/virtual-sensors/noisy-neighbor");
}

export function inputPipelineStall() {
  return fetchJson<SensorRows>("/v1/virtual-sensors/input-pipeline-stall");
}

export function alertCandidates() {
  return fetchJson<SensorRows>("/v1/virtual-sensors/alert-candidates");
}
