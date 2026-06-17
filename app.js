const TOPOLOGY = [
  {
    id: "pod-a",
    label: "Pod A",
    tier: "pod-spine",
    racks: [
      { id: "A1", label: "Rack A1", tier: "rack-leaf", nodes: ["A1-01", "A1-02", "A1-03", "A1-04"] },
      { id: "A2", label: "Rack A2", tier: "rack-leaf", nodes: ["A2-01", "A2-02", "A2-03", "A2-04"] }
    ]
  },
  {
    id: "pod-b",
    label: "Pod B",
    tier: "pod-spine",
    racks: [
      { id: "B1", label: "Rack B1", tier: "rack-leaf", nodes: ["B1-01", "B1-02", "B1-03", "B1-04"] },
      { id: "B2", label: "Rack B2", tier: "rack-leaf", nodes: ["B2-01", "B2-02", "B2-03", "B2-04"] }
    ]
  },
  {
    id: "pod-c",
    label: "Pod C",
    tier: "pod-spine",
    racks: [
      { id: "C1", label: "Rack C1", tier: "rack-leaf", nodes: ["C1-01", "C1-02", "C1-03", "C1-04"] },
      { id: "C2", label: "Rack C2", tier: "rack-leaf", nodes: ["C2-01", "C2-02", "C2-03", "C2-04"] }
    ]
  }
];

const NODE_INDEX = buildNodeIndex();

const INGESTION_SCHEMA = {
  version: "turba.ingestion.v1",
  runSections: [
    "refs",
    "allocation",
    "utilization",
    "communication",
    "inputPipeline",
    "memory",
    "scheduler",
    "reliability",
    "configuration",
    "work",
    "baseline",
    "placement",
    "schedulerEvidence",
    "grafanaContext",
    "commercial",
    "slo",
    "opportunities"
  ]
};

const STORAGE_SCHEMA = {
  version: "turba.workspace.v2",
  key: "turba.analytics.workspace.v2"
};

const THEME_STORAGE_KEY = "turba.analytics.theme";
const PLATFORM_API_TOKEN_STORAGE_KEY = "turba.analytics.platformApiToken.v1";
const PANEL_POPOUT_SELECTOR = [
  ".diagnosis-band",
  ".dashboard-settings-panel",
  ".live-resource-panel",
  ".operator-cockpit-panel",
  ".operator-card",
  ".panel",
  ".entity-row",
  ".live-resource-card",
  ".source-heartbeat-card",
  ".fleet-tile",
  ".live-relationship-card",
  ".live-alert-card",
  ".live-telemetry-card",
  ".benchmark-metric-card",
  ".benchmark-ladder-summary-item",
  ".execution-idle-summary-item",
  ".execution-idle-row",
  ".gpu-exporter-summary-item",
  ".gpu-exporter-row",
  ".background-task-row",
  ".spark-pair-clock-panel",
  ".system-characterization-host",
  ".fleet-comparison-summary-item",
  ".spark-pair-summary-item",
  ".unit-economics-card"
].join(",");
const PANEL_POPOUT_INTERACTIVE_SELECTOR = "a, button, input, label, select, textarea, [contenteditable='true'], [role='button']";
let activePanelPopout = null;
let activePanelPopoutScope = null;
const panelPopoutCleanups = new WeakMap();

// SAMPLE_INGESTION and SAMPLE_SOURCE_EXPORTS now live in app-data.js, loaded
// before app.js (see index.html). They remain available here as globals.

const analytics = window.TurbaAnalytics;
const ncclParser = window.TurbaNcclTraceParser;
const ncclTraceFixtures = window.TurbaNcclTraceFixtures || [];
const SNAPSHOT_SCOPES = ["job", "model", "user", "team", "cluster", "tenant", "account", "reservation"];
const SNAPSHOT_LIMIT = 360;
const TASK_HISTORY_LIMIT = 360;
const MACHINE_DEMO_REFRESH_MS = 1000;
const MACHINE_DEMO_FRESH_SECONDS = 30;
const MACHINE_DEMO_FRESH_MS = MACHINE_DEMO_FRESH_SECONDS * 1000;
const PI_FLEET_HOSTNAMES = Array.from({ length: 12 }, (_unused, index) => `pi${index + 1}`);
const SPARK_PAIR_CLOCK_HISTORY_LIMIT = 180;
const SPARK_PAIR_CLOCK_REFRESH_MS = 1000;
const LIVE_TELEMETRY_LIMIT = 300;
const LIVE_TELEMETRY_ALERT_LIMIT = 5;
const LIVE_TELEMETRY_RELATIONSHIP_WINDOW = 90;
const LIVE_COVARIANCE_METRICS = [
  { key: "cpu", label: "CPU load", shortLabel: "CPU" },
  { key: "gpu", label: "GPU utilization", shortLabel: "GPU" },
  { key: "ram", label: "RAM usage", shortLabel: "RAM" },
  { key: "networkUtilization", label: "Network utilization", shortLabel: "Net" }
];
const SYSTEM_ID_PROFILE_ORDER = ["impulse", "step", "ramp", "sine"];
const SYSTEM_ID_PROFILE_LABELS = {
  impulse: "Impulse",
  step: "Step",
  ramp: "Ramp",
  sine: "Sine"
};
const SYSTEM_ID_SUBSYSTEMS = [
  { key: "cpu", target: "cpu", outputMetric: "cpu", label: "CPU", shortLabel: "CPU" },
  { key: "gpu", target: "gpu", outputMetric: "gpu", label: "GPU", shortLabel: "GPU" },
  { key: "ram", target: "ram", outputMetric: "ram", label: "RAM", shortLabel: "RAM" },
  { key: "network", target: "network", outputMetric: "network", label: "Network", shortLabel: "Net" },
  { key: "disk", target: "disk", outputMetric: "disk", label: "Disk", shortLabel: "Disk" },
  { key: "gpuMemory", target: "gpu", outputMetric: "gpuMemory", label: "GPU memory", shortLabel: "HBM" }
];
const FLEET_COMPARISON_HOST_LIMIT = 16;
const UNIT_ECONOMICS_HOURS_PER_YEAR = 8760;
const UNIT_ECONOMICS_DEFAULTS = {
  electricityUsdPerKwh: 0.12,
  pue: 1.35,
  salvagePct: 0.1,
  gpuUsefulLifeYears: 5,
  hostUsefulLifeYears: 4,
  maintenancePctPerYear: 0.08,
  facilityPctPerYear: 0.04,
  cpuEquivalentRateFactor: 0.08
};
const FLEET_AGGREGATE_KEY = "__fleet_aggregate__";
const FLEET_AGGREGATE_LABEL = "Fleet Aggregate";
const MACHINE_INVENTORY_ARCHIVE_LIMIT = 128;
const SYSTEM_CHARACTERIZATION_HOST_LIMIT = 16;
const LIVE_EIGEN_MIN_VARIANCE = 0.0001;
const LIVE_OBSERVATION_LIMIT = 8;
const EXECUTION_IDLE_LOW_ACTIVITY_PCT = 5;
const EXECUTION_IDLE_COMMUNICATION_BPS = 1_000_000_000;
const EXECUTION_IDLE_SUSTAINED_SECONDS = 5;
const EXECUTION_IDLE_MIN_POWER_GAP_WATTS = 15;
const OPERATOR_SOURCE_ORDER = ["host", "kubernetes", "prometheus", "dcgm", "amd-dme", "kafka", "grafana", "docker", "ollama", "node-exporter", "ebpf", "redfish", "provider", "nccl-trace"];
const GB10_OPERATOR_SOURCE_ORDER = ["gb10-nvml-nvidia-smi", "linux-uma-memory", "app-metrics", "nsight-cupti-profiling"];
const GPU_EXPORTER_METRIC_GROUPS = [
  {
    key: "powerEnergy",
    label: "Power + energy",
    normalized: ["gpuPowerWatts", "gpu_power_watts", "gpu_power_instant_watts", "turba_gpu_power_watts", "gpuEnergyConsumedMicrojoules"],
    nvidia: ["DCGM_FI_DEV_POWER_USAGE", "DCGM_FI_DEV_POWER_USAGE_INSTANT", "nvidia_smi_power_draw_watts"],
    amd: ["GPU_POWER_USAGE", "GPU_PACKAGE_POWER", "GPU_AVERAGE_PACKAGE_POWER", "GPU_ENERGY_CONSUMED", "amd_gpu_power_usage", "amd_gpu_package_power"],
    use: "Execution-idle watts, daily cost, and downscale dry-runs"
  },
  {
    key: "activity",
    label: "Activity",
    normalized: ["gpuUtilizationPct", "gpuSmActivePct", "gpuSmOccupancyPct", "gpuTensorActivePct", "gpuDramActivePct", "turba_gpu_activity_ratio"],
    nvidia: ["DCGM_FI_DEV_GPU_UTIL", "DCGM_FI_PROF_SM_ACTIVE", "DCGM_FI_PROF_SM_OCCUPANCY", "DCGM_FI_PROF_PIPE_TENSOR_ACTIVE", "DCGM_FI_PROF_DRAM_ACTIVE"],
    amd: ["GPU_GFX_ACTIVITY", "GPU_GFX_BUSY_INSTANTANEOUS", "GPU_UMC_ACTIVITY", "GPU_PROCESS_CU_OCCUPANCY", "amd_gpu_gfx_activity"],
    use: "Low-activity proof and useful-compute comparisons"
  },
  {
    key: "memory",
    label: "Memory",
    normalized: ["gpuMemoryUsedPct", "gpuMemoryUsedMiB", "gpuMemoryTotalMiB", "gpu_memory_used_ratio", "turba_gpu_memory_used_ratio"],
    nvidia: ["DCGM_FI_DEV_FB_USED", "DCGM_FI_DEV_FB_TOTAL", "DCGM_FI_DEV_FB_USED_RATIO", "DCGM_FI_PROF_DRAM_ACTIVE"],
    amd: ["GPU_USED_VRAM", "GPU_TOTAL_VRAM", "GPU_FREE_VRAM", "GPU_USED_VISIBLE_VRAM", "GPU_VISIBLE_VRAM"],
    use: "Residency checks, HBM pressure, and capacity comparisons"
  },
  {
    key: "thermal",
    label: "Thermal",
    normalized: ["gpuTemperatureC", "gpuFanSpeedPct", "gpu_temperature_celsius", "turba_gpu_thermal_celsius", "gpu_fan_speed_pct"],
    nvidia: ["DCGM_FI_DEV_GPU_TEMP", "DCGM_FI_DEV_MEMORY_TEMP", "DCGM_FI_DEV_FAN_SPEED", "nvidia_smi_temperature_gpu", "nvidia_smi_fan_speed_pct"],
    amd: ["GPU_EDGE_TEMPERATURE", "GPU_JUNCTION_TEMPERATURE", "GPU_MEMORY_TEMPERATURE", "GPU_HBM_TEMPERATURE", "GPU_FAN_SPEED"],
    use: "Thermal throttle context and rack cooling fingerprints"
  },
  {
    key: "interconnect",
    label: "Interconnect",
    normalized: ["gpuPcieTxBytesPerSecond", "gpuPcieRxBytesPerSecond", "gpuNvlinkTxBytesPerSecond", "gpuNvlinkRxBytesPerSecond", "turba_gpu_interconnect_bytes_per_second"],
    nvidia: ["DCGM_FI_PROF_PCIE_TX_BYTES", "DCGM_FI_PROF_PCIE_RX_BYTES", "DCGM_FI_PROF_NVLINK_TX_BYTES", "DCGM_FI_PROF_NVLINK_RX_BYTES"],
    amd: ["PCIE_BANDWIDTH", "PCIE_BIDIRECTIONAL_BANDWIDTH", "XGMI_LINK_RX", "XGMI_LINK_TX", "amd_gpu_pcie_bandwidth"],
    use: "PCIe/NVLink/XGMI precursor classification"
  },
  {
    key: "ras",
    label: "RAS",
    normalized: ["gpuEccErrorsTotal", "gpuXidErrorCode", "turba_gpu_ecc_errors_total"],
    nvidia: ["DCGM_FI_DEV_ECC_SBE_AGG_TOTAL", "DCGM_FI_DEV_ECC_DBE_AGG_TOTAL", "DCGM_FI_DEV_XID_ERRORS", "DCGM_FI_DEV_FABRIC_HEALTH_MASK"],
    amd: ["GPU_ECC_CORRECT_TOTAL", "GPU_ECC_UNCORRECT_TOTAL", "PCIE_REPLAY_COUNT", "PCIE_RECOVERY_COUNT", "PCIE_NACK_SENT_COUNT", "PCIE_NACK_RECEIVED_COUNT"],
    use: "Health gating before benchmark or policy action"
  },
  {
    key: "clockThrottle",
    label: "Clocks + throttle",
    normalized: ["gpuClockMHz", "gpuSmClockMHz", "gpuMemoryClockMHz", "turba_gpu_clock_mhz", "turba_gpu_sm_clock_mhz", "turba_gpu_memory_clock_mhz"],
    nvidia: ["DCGM_FI_DEV_SM_CLOCK", "DCGM_FI_DEV_MEM_CLOCK", "DCGM_FI_DEV_CLOCK_THROTTLE_REASONS"],
    amd: ["GPU_CLOCK", "GPU_MIN_CLOCK", "GPU_MAX_CLOCK", "GPU_VIOLATION_PPT_RESIDENCY_PERCENTAGE", "GPU_VIOLATION_HBM_THERMAL_RESIDENCY_PERCENTAGE"],
    use: "SLO-aware downscale planning and throttle diagnosis"
  },
  {
    key: "schedulerLabels",
    label: "Scheduler labels",
    normalized: ["namespace", "podName", "containerName", "slurmJobId", "job_id"],
    nvidia: ["namespace", "pod", "container", "job_id"],
    amd: ["JOB_ID", "JOB_USER", "JOB_PARTITION", "CLUSTER_NAME", "NAMESPACE", "CONTAINER"],
    use: "Per-job attribution, rack/cluster rollups, and OCP demo evidence"
  }
];
const GPU_EXPORTER_EXECUTION_IDLE_GROUPS = ["powerEnergy", "activity", "memory", "interconnect"];
const DASHBOARD_BLOCK_STORAGE_KEY = "turba.dashboard.blocks.v1";
const DASHBOARD_BLOCKS = [
  { id: "liveResources", label: "Live resource tiles", note: "Host CPU, RAM, GPU, Docker, disk, and service tiles", defaultOn: true },
  { id: "sourceHeartbeat", label: "Source heartbeat", note: "Compact source freshness strip", defaultOn: true },
  { id: "fleetTiles", label: "Fleet tiles", note: "One-card-per-host fleet status", defaultOn: true },
  { id: "unitEconomics", label: "Unit economics cards", note: "CAPEX, depreciation, OPEX, utilization, and profit/loss by host", defaultOn: true },
  { id: "productReadiness", label: "Product readiness", note: "Customer hardening and supportability gates", defaultOn: true },
  { id: "predictiveAnalytics", label: "Predictive analytics", note: "Metric forecasts, saturation ETAs, anomaly detection, and regression-risk early warning", defaultOn: true },
  { id: "prescriptiveActions", label: "Prescriptive actions", note: "Ranked remediation plan and forecast-driven operational directives", defaultOn: true },
  { id: "liveAlerts", label: "Resource alerts", note: "Live relationship and pressure alerts", defaultOn: false },
  { id: "liveObservationLog", label: "Observation log", note: "Recent notable telemetry events", defaultOn: false },
  { id: "liveTelemetryGraphs", label: "Rolling resource graphs", note: "CPU, RAM, GPU, and network history", defaultOn: false },
  { id: "eventTimeline", label: "Event timeline", note: "Operator event stream", defaultOn: false },
  { id: "demoLaunchpad", label: "Demo launchpad", note: "SPARK demo command shortcuts", defaultOn: false },
  { id: "autoDiscoveryDeployment", label: "Auto Discovery and Deployment", note: "Subnet discovery with credential-gated agent rollout", defaultOn: false },
  { id: "executionIdleEnergy", label: "Execution-idle energy", note: "Loaded-but-low-activity GPU power exposure and policy hints", defaultOn: true },
  { id: "gpuExporterCoverage", label: "GPU exporter coverage", note: "NVIDIA/AMD exporter metric coverage and normalization", defaultOn: true },
  { id: "backgroundTasks", label: "Background tasks", note: "Live refresh, agent, benchmark, discovery, clock, and queue work", defaultOn: true },
  { id: "kafkaStream", label: "Kafka stream", note: "Broker smoke and stream panel", defaultOn: false },
  { id: "dataConfidence", label: "Data confidence", note: "Source quality scoring details", defaultOn: false },
  { id: "replayMode", label: "Replay mode", note: "Telemetry replay controls", defaultOn: false },
  { id: "grafanaMini", label: "Grafana handoff", note: "Mini observability links", defaultOn: false },
  { id: "sparkPair", label: "SPARK pair compare", note: "SPARK1/SPARK2 metrics and clock graph", defaultOn: false },
  { id: "fleetComparison", label: "Fleet comparison", note: "Rank table and benchmark histograms", defaultOn: false },
  { id: "benchmarkLadder", label: "Benchmark ladder", note: "CPU, GPU, RAM, network, and disk comparisons from host to global scope", defaultOn: true },
  { id: "systemCharacterization", label: "System characterization", note: "System-ID fingerprints and profiles", defaultOn: false }
];
const DASHBOARD_BLOCK_DEFAULTS = Object.fromEntries(DASHBOARD_BLOCKS.map((block) => [block.id, Boolean(block.defaultOn)]));

const DEFAULT_INGESTION = applySourceImports(SAMPLE_INGESTION, SAMPLE_SOURCE_EXPORTS, ncclTraceFixtures);
let workspaceStore = loadWorkspaceStore(DEFAULT_INGESTION);
let dashboardBlockPreferences = loadDashboardBlockPreferences();
let machineInventoryArchive = normalizeMachineInventoryArchive(workspaceStore.machineInventory);
let activeIngestion = applyPersistedBaselines(reconcileMachineInventory(workspaceStore.ingestion), workspaceStore.baselines);
let jobs = normalizeIngestion(activeIngestion);
let snapshotHistory = normalizeSnapshotStore(workspaceStore.snapshots);
let taskHistory = normalizeTaskHistoryStore(workspaceStore.taskHistory);
const initialDataBoundary = normalizeDataBoundary(workspaceStore.dataBoundary, activeIngestion);
let liveTelemetryHistory = [];
let sparkPairClockHistory = [];
let liveObservationClearState = { contextKey: "", clearedAtMs: 0 };
let platformVirtualSensorCache = {
  baseUrl: "",
  fetchedAt: 0,
  inFlight: false,
  matrix: null,
  systemIdentification: null
};
let machineDemoRefreshTimer = null;
let machineDemoLoadInFlight = false;
let sparkPairClockRefreshTimer = null;
let sparkPairClockLoadInFlight = false;
let latestSparkPairComparison = null;
let operatorLaunchpadSignature = "";

const state = {
  scope: "job",
  selectedKey: "run-7421",
  window: "Last 24 hours",
  rate: 6.2,
  samePod: false,
  trendMetric: "usefulCompute",
  schedulerScenario: "recommended",
  operatorReplay: false,
  operatorReplayStartedAt: null,
  dashboardBlocks: dashboardBlockPreferences,
  lastAnalysis: safeDate(workspaceStore.lastAnalysisAt, new Date("2026-05-30T22:01:00-07:00")),
  storageLabel: workspaceStore.storageLabel,
  storageTone: workspaceStore.storageTone,
  ingestLabel: shouldAutoLoadMachineDemoBundle() ? "Live feed pending" : initialDataBoundary.label,
  ingestTone: shouldAutoLoadMachineDemoBundle() ? "watch" : initialDataBoundary.tone,
  dataBoundary: initialDataBoundary
};

if (snapshotHistory.length === 0) {
  captureAnalysisSnapshot(initialDataBoundary.kind === "demo" ? "Seeded demo data" : "Seeded workspace", state.lastAnalysis);
  persistWorkspaceStore();
} else if (taskHistory.length === 0) {
  captureTaskMemorySnapshot("Task memory seed", state.lastAnalysis);
  persistWorkspaceStore();
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const hourlyCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const number = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const TREND_METRIC_DEFS = {
  usefulCompute: {
    label: "Useful compute",
    unit: "points",
    higherIsBetter: true,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  wastedGpuHours: {
    label: "Wasted GPU-hours",
    unit: "GPU-hours",
    higherIsBetter: false,
    format: (value) => number.format(value),
    formatDelta: (value) => signedNumber(value)
  },
  ncclTime: {
    label: "NCCL time",
    unit: "points",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  networkUtilization: {
    label: "Network utilization",
    unit: "points",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  costPerUsefulGpuHour: {
    label: "Cost / useful GPU-hour",
    unit: "USD",
    higherIsBetter: false,
    format: (value) => currency.format(value),
    formatDelta: (value) => signedCurrency(value)
  },
  sellableWasteValue: {
    label: "Sellable waste value",
    unit: "USD",
    higherIsBetter: false,
    format: (value) => currency.format(value),
    formatDelta: (value) => signedCurrency(value)
  },
  opportunityImpactDollars: {
    label: "Opportunity impact",
    unit: "USD",
    higherIsBetter: false,
    format: (value) => currency.format(value),
    formatDelta: (value) => signedCurrency(value)
  },
  reservationBurnPct: {
    label: "Commit burn",
    unit: "percent",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  queueSloPct: {
    label: "Queue SLO",
    unit: "percent",
    higherIsBetter: false,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  },
  grossMarginPct: {
    label: "Gross margin",
    unit: "percent",
    higherIsBetter: true,
    format: (value) => pct(value),
    formatDelta: (value) => `${signedNumber(value)} pts`
  }
};

const DEFAULT_TOPBAR_USER_PROFILE = {
  name: "Ahmad Byagowi",
  role: "Demo operator",
  avatar: "assets/ahmad-byagowi-profile.png?v=profile-20260617"
};

function normalizeTopbarUserProfile(profile = {}) {
  return {
    name: String(profile.name || profile.displayName || DEFAULT_TOPBAR_USER_PROFILE.name),
    role: String(profile.role || profile.subtitle || DEFAULT_TOPBAR_USER_PROFILE.role),
    avatar: String(profile.avatar || profile.avatarUrl || profile.photoUrl || DEFAULT_TOPBAR_USER_PROFILE.avatar)
  };
}

function currentTopbarUserProfile() {
  let storedProfile = {};
  try {
    storedProfile = JSON.parse(window.localStorage.getItem("turba.analytics.userProfile.v1") || "{}");
  } catch {
    storedProfile = {};
  }
  return normalizeTopbarUserProfile({
    ...storedProfile,
    ...(window.TURBALANCE_USER_PROFILE || {})
  });
}

function renderTopbarUserProfile(profile = currentTopbarUserProfile()) {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  let user = topbar.querySelector(".topbar-user");
  if (!user) {
    user = document.createElement("div");
    user.className = "topbar-user";
    user.setAttribute("aria-label", "Signed in user");
    user.innerHTML = `
      <span class="topbar-user-copy">
        <span class="topbar-user-name"></span>
        <span class="topbar-user-role"></span>
      </span>
      <img class="topbar-user-avatar" alt="">
    `;
    topbar.append(user);
  }

  user.querySelector(".topbar-user-name").textContent = profile.name;
  user.querySelector(".topbar-user-role").textContent = profile.role;
  const avatar = user.querySelector(".topbar-user-avatar");
  avatar.src = profile.avatar;
  avatar.alt = profile.name;

  if (document.getElementById("topbarUserFallbackStyle")) return;
  const style = document.createElement("style");
  style.id = "topbarUserFallbackStyle";
  style.textContent = `
    .topbar-user{display:flex;align-items:center;justify-content:flex-end;gap:12px;min-width:0;margin-left:auto;color:#f8fbfb}
    .topbar-user-copy{display:grid;gap:2px;min-width:0;text-align:right}
    .topbar-user-name,.topbar-user-role{display:block;overflow:hidden;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}
    .topbar-user-name{font-size:.92rem;font-weight:800}
    .topbar-user-role{color:rgba(230,238,239,.72);font-size:.72rem;font-weight:700}
    .topbar-user-avatar{width:48px;height:48px;flex:0 0 auto;border:2px solid rgba(126,236,212,.74);border-radius:50%;background:#fff;box-shadow:0 10px 24px rgba(0,0,0,.24);object-fit:cover;object-position:center}
    @media (max-width:900px){.topbar-user{align-self:stretch;justify-content:flex-start;margin-left:0}.topbar-user-copy{text-align:left}}
    @media (max-width:680px){.topbar-user-avatar{width:44px;height:44px}.topbar-user-name{font-size:.88rem}}
  `;
  document.head.append(style);
}

async function hydrateTopbarUserProfile() {
  try {
    const response = await window.fetch(cacheBustUrl("user-profile.json"));
    if (response.ok) renderTopbarUserProfile(normalizeTopbarUserProfile(await response.json()));
  } catch {
    // Static deployments can omit user-profile.json; the local/default profile remains in place.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderTopbarUserProfile();
  hydrateTopbarUserProfile();
  initThemeMode();
  bindEvents();
  initPanelPopouts();
  prefillMachineDemoUrl();
  render();
  maybeAutoLoadMachineDemoBundle();
  maybeStartSparkPairClockFeed();
});













































































































































































































































































































const ENTITY_REDACTION_PREFIXES = {
  models: "model",
  users: "user",
  teams: "team",
  clusters: "cluster",
  tenants: "tenant",
  accounts: "account",
  reservations: "reservation"
};

const REF_COLLECTIONS = {
  model: "models",
  user: "users",
  team: "teams",
  cluster: "clusters",
  tenant: "tenants",
  account: "accounts",
  reservation: "reservations"
};









































































// Metric configuration for the predictive layer: which snapshot metrics to
// forecast, whether higher is better, and the saturation threshold (if any).
const PREDICTIVE_METRIC_CONFIG = {
  usefulCompute: { higherIsBetter: true, label: "Useful compute", threshold: null },
  gpuUtil: { higherIsBetter: true, label: "GPU utilization", threshold: null },
  wastedGpuHours: { higherIsBetter: false, label: "Wasted GPU-hours", threshold: null },
  costPerUsefulGpuHour: { higherIsBetter: false, label: "Cost / useful GPU-hour", threshold: null },
  queueWaitMinutes: { higherIsBetter: false, label: "Queue wait (min)", direction: "above" }
};



// Forecasts + saturation/anomaly/regression-risk early warning, plus a ranked,
// forecast-driven prescriptive action plan. Fully guarded so a missing module,
// panel, or history simply renders an empty/among-friends state and never throws.
























































































































































































































































































































































































































































































































































































































































































































































































































































































































































































