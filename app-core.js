/**
 * turbalance Analytics — core analysis, helpers, and orchestration functions
 *
 * Extracted from app.js (PR5 modularization). Loaded as a classic <script>
 * BEFORE app.js; these are top-level function declarations (global, hoisted,
 * lazily executed), so load order among the app-*.js modules does not matter
 * and they may freely reference app.js's top-level state at call time.
 */

function initThemeMode() {
  applyThemeMode(resolveThemeMode());
  const toggle = document.querySelector("#themeToggle");
  if (!toggle) return;

  toggle.addEventListener("change", (event) => {
    applyThemeMode(event.target.checked ? "dark" : "light", { persist: true });
  });

  try {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onSystemThemeChange = (event) => {
      if (readThemeMode()) return;
      applyThemeMode(event.matches ? "dark" : "light");
    };
    if (media.addEventListener) {
      media.addEventListener("change", onSystemThemeChange);
    } else if (media.addListener) {
      media.addListener(onSystemThemeChange);
    }
  } catch {
    // Theme switching remains available even if system preference listeners are blocked.
  }
}

function resolveThemeMode() {
  const stored = readThemeMode();
  if (stored) return stored;

  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readThemeMode() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : "";
  } catch {
    return "";
  }
}

function writeThemeMode(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Non-persistent browser contexts still get the in-session theme.
  }
}

function requestDashboardRender(mode = "full") {
  dashboardRenderMode = mode === "live" && dashboardRenderMode !== "full" ? "live" : "full";
  if (dashboardRenderFrame) return;
  const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
  dashboardRenderFrame = requestFrame(() => {
    const nextMode = dashboardRenderMode || "full";
    dashboardRenderFrame = null;
    dashboardRenderMode = "";
    if (nextMode === "live" && typeof renderLiveRefresh === "function") renderLiveRefresh();
    else render();
  });
}

function maybeCommitMachineDemoWorkspace(nowMs = Date.now()) {
  if (!machineDemoLastWorkspaceCommitAt || nowMs - machineDemoLastWorkspaceCommitAt >= MACHINE_DEMO_WORKSPACE_COMMIT_MS) {
    machineDemoLastWorkspaceCommitAt = nowMs;
    return true;
  }
  return false;
}

function replaceActiveIngestion(nextIngestion, label, dataBoundary = null, options = {}) {
  const {
    captureSnapshot = true,
    persist = true,
    renderDashboard = true,
    scheduledRender = false,
    renderMode = "full"
  } = options;
  const previousKey = state.selectedKey;
  const previousIdentity = state.scope === "job" ? jobSelectionIdentity(jobs.find((job) => job.id === previousKey)) : "";
  const retainedIngestion = reconcileMachineInventory(nextIngestion);
  activeIngestion = applyPersistedBaselines(retainedIngestion, buildBaselineStore(retainedIngestion.runs));
  jobs = normalizeIngestion(activeIngestion);
  recordLiveTelemetrySamplesFromItems(jobs);
  state.scope = "job";
  state.selectedKey = resolveJobSelectionKey(previousKey, previousIdentity) || jobs[0]?.id || "";
  state.ingestLabel = label;
  state.ingestTone = "good";
  state.dataBoundary = normalizeDataBoundary(dataBoundary || dataBoundaryForSourceLabel(label), activeIngestion);
  state.lastAnalysis = new Date();
  if (captureSnapshot) captureAnalysisSnapshot(label, state.lastAnalysis);
  if (persist) {
    persistWorkspaceStore();
  } else {
    state.storageLabel = "Live session";
    state.storageTone = "good";
  }
  if (renderDashboard) {
    if (scheduledRender) requestDashboardRender(renderMode);
    else render();
  }
}

function resolveJobSelectionKey(previousKey, previousIdentity) {
  const lockedKey = resolveManualSelectionLock();
  if (lockedKey) return lockedKey;
  if (previousKey === FLEET_AGGREGATE_KEY && fleetAggregateSourceItems(jobs).length >= 2) {
    return FLEET_AGGREGATE_KEY;
  }
  if (previousKey && jobs.some((job) => job.id === previousKey)) return previousKey;
  if (previousIdentity) {
    const matched = jobs.find((job) => jobSelectionIdentity(job) === previousIdentity);
    if (matched) return matched.id;
  }
  return "";
}

function resolveManualSelectionLock(nowMs = Date.now()) {
  if (!manualSelectionLock || manualSelectionLock.untilMs <= nowMs) return "";
  if (manualSelectionLock.key === FLEET_AGGREGATE_KEY && fleetAggregateSourceItems(jobs).length >= 2) {
    return FLEET_AGGREGATE_KEY;
  }
  if (manualSelectionLock.key && jobs.some((job) => job.id === manualSelectionLock.key)) {
    return manualSelectionLock.key;
  }
  if (manualSelectionLock.identity) {
    const matched = jobs.find((job) => jobSelectionIdentity(job) === manualSelectionLock.identity);
    if (matched) return matched.id;
  }
  return "";
}

function lockManualSelection(entry, nowMs = Date.now()) {
  if (!entry || entry.scope !== "job") {
    manualSelectionLock = { key: "", identity: "", untilMs: 0 };
    return;
  }
  const item = Array.isArray(entry.items) ? entry.items[0] : null;
  manualSelectionLock = {
    key: entry.key || "",
    identity: entry.isFleetAggregate ? "" : jobSelectionIdentity(item),
    untilMs: nowMs + MANUAL_SELECTION_LOCK_MS
  };
}

function jobSelectionIdentity(job) {
  if (!job) return "";
  if (isMachineDemoItem(job)) {
    const key = machineInventoryKeyForItem(job);
    if (key) return key;
  }
  return job.id ? `job:${job.id}` : "";
}

function isMachineRunLike(run) {
  const context = machineInventoryContextForRun(run);
  const adapters = Array.isArray(run?.importedSources)
    ? run.importedSources
    : Array.isArray(run?.source?.adapters) ? run.source.adapters : [];

  return adapters.includes("local-machine")
    || Boolean(
      (context.hostname || context.node || context.networkLocalAddress || context.hostAddress || context.primaryAddress)
      && (
        context.generatedAt
        || context.uptimeSeconds !== undefined
        || context.gpuUuid
        || context.gpuName
        || Array.isArray(context.observedServices)
        || Array.isArray(context.ollamaModels)
      )
    );
}

function isMachineInventoryMissingRun(run) {
  const context = machineInventoryContextForRun(run);
  return Boolean(context.machineInventoryMissing);
}

function resetDashboardBlocksToDefault() {
  state.dashboardBlocks = { ...DASHBOARD_BLOCK_DEFAULTS };
  saveDashboardBlockPreferences();
  render();
}

function enableAllDashboardBlocks() {
  state.dashboardBlocks = Object.fromEntries(DASHBOARD_BLOCKS.map((block) => [block.id, true]));
  saveDashboardBlockPreferences();
  render();
}

function setDashboardBlockEnabled(id, enabled) {
  state.dashboardBlocks = normalizeDashboardBlockPreferences({
    ...state.dashboardBlocks,
    [id]: Boolean(enabled)
  });
  saveDashboardBlockPreferences();
  render();
}

function isValidWorkspaceStore(store) {
  return Boolean(
    store
      && store.storageSchemaVersion === STORAGE_SCHEMA.version
      && store.ingestionSchemaVersion === INGESTION_SCHEMA.version
      && store.ingestion?.schemaVersion === INGESTION_SCHEMA.version
      && Array.isArray(store.ingestion.runs)
      && isPlainObject(store.baselines)
  );
}

function captureAnalysisSnapshot(sourceLabel, capturedAt = new Date()) {
  const capturedAtIso = dateIso(capturedAt);
  const records = [];
  const taskRecords = [];

  SNAPSHOT_SCOPES.forEach((scope) => {
    buildEntries(scope).forEach((entry) => {
      const summary = summarizeEntry(entry);
      const classifier = classifyBottlenecks(summary);
      records.push(snapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso));

      if (scope === "job") {
        taskRecords.push(taskSnapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso));
      }
    });
  });

  snapshotHistory = normalizeSnapshotStore([...snapshotHistory, ...records]).slice(-SNAPSHOT_LIMIT);
  taskHistory = normalizeTaskHistoryStore([...taskHistory, ...taskRecords]).slice(-TASK_HISTORY_LIMIT);
}

function captureTaskMemorySnapshot(sourceLabel, capturedAt = new Date()) {
  const capturedAtIso = dateIso(capturedAt);
  const taskRecords = buildEntries("job").map((entry) => {
    const summary = summarizeEntry(entry);
    const classifier = classifyBottlenecks(summary);
    return taskSnapshotFromSummary(summary, classifier, sourceLabel, capturedAtIso);
  });

  taskHistory = normalizeTaskHistoryStore([...taskHistory, ...taskRecords]).slice(-TASK_HISTORY_LIMIT);
}

function taskSnapshotFromSummary(summary, classifier, sourceLabel, capturedAt) {
  return analytics.taskUtilizationSnapshot(summary, {
    classifier,
    sourceLabel,
    capturedAt
  });
}

function validDateIso(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function prometheusGpuSourceContext(metrics = {}) {
  const gpuUtilizationPct = firstFinite(
    ratioPercent(metrics.turba_gpu_utilization_ratio),
    ratioPercent(metrics.turba_gpu_activity_ratio)
  );
  const gpuMemoryUsedPct = firstFinite(
    ratioPercent(metrics.turba_gpu_memory_used_ratio),
    optionalPercent(metrics.turba_gpu_memory_used_pct)
  );
  const hasGpuMetrics = gpuExporterObjectHasAny(metrics, GPU_EXPORTER_METRIC_GROUPS.flatMap((group) => [
    ...group.normalized,
    ...group.nvidia,
    ...group.amd
  ]));

  return compactObject({
    rawPrometheusMetrics: metrics,
    gpuExporterMetrics: metrics,
    gpuPresent: hasGpuMetrics || Number.isFinite(gpuUtilizationPct),
    gpuName: metrics.turba_gpu_model || "",
    gpuUtilizationPct,
    gpuPowerWatts: firstFinite(metrics.turba_gpu_power_watts, metrics.turba_gpu_power_instant_watts),
    gpuMemoryUsedPct,
    gpuMemoryUtilizationPct: firstFinite(
      optionalPercent(metrics.turba_gpu_memory_utilization_pct),
      optionalPercent(metrics.turba_gpu_memory_utilization_ratio),
      optionalPercent(metrics.gpu_memory_utilization_pct)
    ),
    gpuTemperatureC: firstFinite(metrics.turba_gpu_thermal_celsius, metrics.turba_gpu_temperature_celsius),
    gpuFanSpeedPct: firstFinite(
      optionalPercent(metrics.turba_gpu_fan_speed_pct),
      optionalPercent(metrics.gpu_fan_speed_pct),
      optionalPercent(metrics.nvidia_smi_fan_speed_pct)
    ),
    gpuExporterInterconnectBytesPerSecond: firstFinite(metrics.turba_gpu_interconnect_bytes_per_second),
    gpuEccErrorsTotal: firstFinite(metrics.turba_gpu_ecc_errors_total),
    gpuClockMHz: firstFinite(metrics.turba_gpu_clock_mhz, metrics.turba_gpu_sm_clock_mhz, metrics.gpu_clock_mhz),
    gpuSmClockMHz: firstFinite(metrics.turba_gpu_sm_clock_mhz, metrics.turba_gpu_clock_mhz, metrics.gpu_sm_clock_mhz),
    gpuMemoryClockMHz: firstFinite(metrics.turba_gpu_memory_clock_mhz, metrics.gpu_memory_clock_mhz)
  });
}

function dcgmGpuSourceContext(fields = {}) {
  const fbUsed = metric(fields, "DCGM_FI_DEV_FB_USED");
  const fbTotal = metric(fields, "DCGM_FI_DEV_FB_TOTAL");
  const fbRatio = Number.isFinite(fbUsed) && Number.isFinite(fbTotal) && fbTotal > 0
    ? (fbUsed / fbTotal) * 100
    : metric(fields, "DCGM_FI_DEV_FB_USED_RATIO");
  return compactObject({
    rawDcgmFields: fields,
    gpuExporterMetrics: fields,
    gpuPresent: gpuExporterObjectHasAny(fields, GPU_EXPORTER_METRIC_GROUPS.flatMap((group) => group.nvidia)),
    gpuPowerWatts: firstFinite(metric(fields, "DCGM_FI_DEV_POWER_USAGE"), metric(fields, "DCGM_FI_DEV_POWER_USAGE_INSTANT")),
    gpuUtilizationPct: metric(fields, "DCGM_FI_DEV_GPU_UTIL"),
    gpuSmActivePct: metric(fields, "DCGM_FI_PROF_SM_ACTIVE"),
    gpuSmOccupancyPct: metric(fields, "DCGM_FI_PROF_SM_OCCUPANCY"),
    gpuTensorActivePct: metric(fields, "DCGM_FI_PROF_PIPE_TENSOR_ACTIVE"),
    gpuDramActivePct: metric(fields, "DCGM_FI_PROF_DRAM_ACTIVE"),
    gpuMemoryUsedPct: fbRatio,
    gpuMemoryUtilizationPct: metric(fields, "DCGM_FI_PROF_DRAM_ACTIVE"),
    gpuTemperatureC: metric(fields, "DCGM_FI_DEV_GPU_TEMP"),
    gpuMemoryTemperatureC: metric(fields, "DCGM_FI_DEV_MEMORY_TEMP"),
    gpuFanSpeedPct: metric(fields, "DCGM_FI_DEV_FAN_SPEED"),
    gpuPcieTxBytesPerSecond: metric(fields, "DCGM_FI_PROF_PCIE_TX_BYTES"),
    gpuPcieRxBytesPerSecond: metric(fields, "DCGM_FI_PROF_PCIE_RX_BYTES"),
    gpuNvlinkTxBytesPerSecond: metric(fields, "DCGM_FI_PROF_NVLINK_TX_BYTES"),
    gpuNvlinkRxBytesPerSecond: metric(fields, "DCGM_FI_PROF_NVLINK_RX_BYTES"),
    gpuEccErrorsTotal: firstFinite(metric(fields, "DCGM_FI_DEV_ECC_SBE_AGG_TOTAL"), metric(fields, "DCGM_FI_DEV_ECC_DBE_AGG_TOTAL")),
    gpuXidErrorCode: metric(fields, "DCGM_FI_DEV_XID_ERRORS"),
    gpuClockMHz: metric(fields, "DCGM_FI_DEV_SM_CLOCK"),
    gpuSmClockMHz: metric(fields, "DCGM_FI_DEV_SM_CLOCK"),
    gpuMemoryClockMHz: metric(fields, "DCGM_FI_DEV_MEM_CLOCK")
  });
}

function grafanaLinksFromSample(sample) {
  const dashboardUrl = sample.dashboardUrl || grafanaDashboardUrlFromSample(sample);
  const exploreUrl = sample.exploreUrl || grafanaExploreUrlFromSample(sample);
  const directLinks = [
    dashboardUrl ? { label: sample.dashboardTitle || "Dashboard", type: "dashboard", url: dashboardUrl } : null,
    exploreUrl ? { label: "Explore", type: "explore", url: exploreUrl } : null
  ].filter(Boolean);
  const suppliedLinks = Array.isArray(sample.links) ? sample.links : [];

  return uniqueBy(
    [...directLinks, ...suppliedLinks]
      .filter(isPlainObject)
      .map((link) => compactObject({
        label: String(link.label || link.title || link.type || "Grafana link"),
        type: String(link.type || "dashboard"),
        url: String(link.url || "")
      }))
      .filter((link) => link.url),
    (link) => link.url
  );
}

function grafanaDashboardUrlFromSample(sample = {}) {
  const baseUrl = grafanaBaseUrl(sample);
  const uid = String(sample.dashboardUid || sample.uid || "").trim();
  if (!baseUrl || !uid) return "";
  const slug = String(sample.dashboardSlug || sample.slug || grafanaSlug(sample.dashboardTitle || sample.title || uid)).trim();
  const params = grafanaUrlParams(sample);
  const query = params.toString();
  return `${baseUrl}/d/${encodeURIComponent(uid)}/${encodeURIComponent(slug || "dashboard")}${query ? `?${query}` : ""}`;
}

function grafanaExploreUrlFromSample(sample = {}) {
  const baseUrl = grafanaBaseUrl(sample);
  if (!baseUrl) return "";
  const params = grafanaUrlParams(sample);
  const datasourceUid = String(sample.datasourceUid || sample.datasource || "").trim();
  if (datasourceUid) {
    const query = String(sample.exploreQuery || sample.query || sample.expr || grafanaDefaultExploreQuery(sample)).trim();
    params.set("schemaVersion", "1");
    params.set("panes", JSON.stringify({
      "0": compactObject({
        datasource: datasourceUid,
        queries: [{ refId: "A", expr: query || "up" }],
        range: grafanaExploreRange(sample)
      })
    }));
  }
  const query = params.toString();
  return `${baseUrl}/explore${query ? `?${query}` : ""}`;
}

function grafanaBaseUrl(sample = {}) {
  return String(sample.grafanaBaseUrl || sample.baseUrl || sample.publicBaseUrl || "").replace(/\/+$/, "");
}

function grafanaUrlParams(sample = {}) {
  const params = new URLSearchParams();
  const orgId = String(sample.orgId || sample.grafanaOrgId || "").trim();
  if (orgId) params.set("orgId", orgId);
  const timeRange = isPlainObject(sample.timeRange) ? sample.timeRange : {};
  const from = sample.from || timeRange.from;
  const to = sample.to || timeRange.to;
  const refresh = sample.refresh || timeRange.refresh;
  if (from) params.set("from", String(from));
  if (to) params.set("to", String(to));
  if (refresh) params.set("refresh", String(refresh));
  if (isPlainObject(sample.variables)) {
    Object.entries(sample.variables).forEach(([key, value]) => {
      const param = String(key).startsWith("var-") ? String(key) : `var-${key}`;
      const values = Array.isArray(value) ? value : [value];
      values
        .filter((item) => item !== undefined && item !== null && item !== "")
        .forEach((item) => params.append(param, String(item)));
    });
  }
  return params;
}

function grafanaExploreRange(sample = {}) {
  const timeRange = isPlainObject(sample.timeRange) ? sample.timeRange : {};
  return {
    from: String(sample.from || timeRange.from || "now-1h"),
    to: String(sample.to || timeRange.to || "now")
  };
}

function grafanaDefaultExploreQuery(sample = {}) {
  const runId = sample.runId || (isPlainObject(sample.variables) ? sample.variables.run || sample.variables.runId : "");
  return runId ? `turba_useful_compute_ratio{run_id="${prometheusStringLiteral(runId)}"}` : "up";
}

function grafanaSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dashboard";
}

function prometheusStringLiteral(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function redfishHealthPressure(values = []) {
  const labels = values.map((value) => String(value || "").toLowerCase()).filter(Boolean);
  if (labels.some((label) => label.includes("critical"))) return 100;
  if (labels.some((label) => label.includes("warning"))) return 55;
  return undefined;
}

function redfishResourceLabels(resources = []) {
  const labels = resources
    .map((resource) => resource.name || resource.id || resource.model || resource.version)
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.slice(0, 12) : undefined;
}

function firstString(values = []) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || undefined;
}

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return Array.isArray(patch) ? [...patch] : patch;
  }

  return Object.entries(patch).reduce((merged, [key, value]) => {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else if (Array.isArray(value)) {
      merged[key] = [...value];
    } else {
      merged[key] = value;
    }

    return merged;
  }, { ...base });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function compactMetrics(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => Number.isFinite(value))
  );
}

function compactSections(sections) {
  return Object.fromEntries(
    Object.entries(sections).filter(([, value]) => (
      isPlainObject(value) ? Object.keys(value).length > 0 : value !== undefined
    ))
  );
}

function ratioPercent(value) {
  return numeric(value) * 100;
}

function optionalPercent(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function pressure(value, low, high) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (high <= low) return undefined;
  return clamp(((parsed - low) / (high - low)) * 100, 0, 100);
}

function minutesBetween(start, end) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return undefined;
  }

  return Math.max(0, (endDate - startDate) / 60000);
}

function schedulerEventCounts(events = []) {
  return events.reduce((counts, event) => {
    const type = String(event.type || event.reason || event.action || "").toLowerCase();
    if (type.includes("admit") || type.includes("schedule")) counts.admissionAttempts += 1;
    if (type.includes("preempt")) counts.preemptionCount += 1;
    if (type.includes("retry") || type.includes("unschedulable")) counts.placementRetries += 1;
    if (type.includes("locality") || type.includes("cross-pod") || type.includes("cross-rack")) counts.localityMisses += 1;
    if (type.includes("backfill")) counts.backfillCandidates += 1;
    return counts;
  }, {
    admissionAttempts: 0,
    preemptionCount: 0,
    placementRetries: 0,
    localityMisses: 0,
    backfillCandidates: 0
  });
}

function maxFinite(...values) {
  const finite = values
    .map((value) => Number(value))
    .filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : undefined;
}

function firstFinite(...values) {
  for (const entry of values) {
    if (entry === undefined || entry === null || entry === "") continue;
    const parsed = Number(entry);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function entityLabel(collection, key) {
  return collection?.[key]?.label || key || "Unknown";
}

function metric(section, key) {
  return numeric(section?.[key]);
}

function optionalMetric(section, key) {
  if (!section || !(key in section)) return Number.NaN;
  return numeric(section[key], Number.NaN);
}

function numeric(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function safeDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function dateIso(value) {
  if (!value) return null;
  return safeDate(value, new Date()).toISOString();
}

function extractIngestionFeed(payload, allowCurrentFeed = false) {
  if (isIngestionFeed(payload)) return payload;
  if (isIngestionFeed(payload?.ingestion)) return payload.ingestion;
  if (Array.isArray(payload?.runs)) {
    return {
      schemaVersion: INGESTION_SCHEMA.version,
      entities: payload.entities || activeIngestion.entities,
      runs: payload.runs
    };
  }

  return allowCurrentFeed ? activeIngestion : null;
}

function validateImportPayloadRoot(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Import must be a JSON object.");
  }

  if (payload.storageSchemaVersion && payload.storageSchemaVersion !== STORAGE_SCHEMA.version) {
    throw new Error(`Unsupported workspace schema: ${payload.storageSchemaVersion}. Expected ${STORAGE_SCHEMA.version}.`);
  }

  if (payload.storageSchemaVersion && !isValidWorkspaceStore(payload)) {
    throw new Error("Workspace export is missing ingestion, baselines, or schema metadata.");
  }

  if (payload.schemaVersion && payload.schemaVersion !== INGESTION_SCHEMA.version) {
    throw new Error(`Unsupported ingestion schema: ${payload.schemaVersion}. Expected ${INGESTION_SCHEMA.version}.`);
  }

  if (payload.ingestion?.schemaVersion && payload.ingestion.schemaVersion !== INGESTION_SCHEMA.version) {
    throw new Error(`Unsupported ingestion schema: ${payload.ingestion.schemaVersion}. Expected ${INGESTION_SCHEMA.version}.`);
  }

  if ("runs" in payload && !Array.isArray(payload.runs)) {
    throw new Error("The runs field must be an array.");
  }
}

function validateIngestionFeed(feed) {
  if (!Array.isArray(feed.runs) || feed.runs.length === 0) {
    throw new Error("Ingestion feed has no runs.");
  }

  feed.runs.forEach((run, index) => {
    if (!isPlainObject(run)) {
      throw new Error(`Run ${index + 1} must be an object.`);
    }
    if (!run.id) {
      throw new Error(`Run ${index + 1} is missing id.`);
    }
  });
}

function validateSourceArrays(payload) {
  const roots = [
    { label: "sources", value: payload.sources },
    { label: "sourceExports", value: payload.sourceExports },
    { label: "root", value: payload }
  ].filter((root) => isPlainObject(root.value));

  roots.forEach((root) => {
    ["prometheus", "dcgm", "kubernetes", "scheduler", "grafana", "ebpf", "redfish", "provider", "opportunities"].forEach((key) => {
      if (key in root.value && !Array.isArray(root.value[key])) {
        const prefix = root.label === "root" ? key : `${root.label}.${key}`;
        throw new Error(`${prefix} must be an array.`);
      }
    });

    ["ncclTraces", "traces", "nccl"].forEach((key) => {
      if (key in root.value && !Array.isArray(root.value[key])) {
        const prefix = root.label === "root" ? key : `${root.label}.${key}`;
        throw new Error(`${prefix} must be an array.`);
      }
    });
  });
}

function validateSourceSamples(payload) {
  const roots = [
    { label: "sources", value: payload.sources },
    { label: "sourceExports", value: payload.sourceExports },
    { label: "root", value: payload }
  ].filter((root) => isPlainObject(root.value));

  roots.forEach((root) => {
    ["prometheus", "dcgm", "kubernetes", "scheduler", "grafana", "ebpf", "redfish", "provider", "opportunities"].forEach((key) => {
      validateRunIdSamples(root, key);
    });

    ["ncclTraces", "traces", "nccl"].forEach((key) => {
      validateRunIdSamples(root, key);
    });
  });
}

function validateRunIdSamples(root, key) {
  const samples = root.value[key];
  if (!Array.isArray(samples)) return;

  const prefix = root.label === "root" ? key : `${root.label}.${key}`;
  samples.forEach((sample, index) => {
    if (!isPlainObject(sample)) {
      throw new Error(`${prefix}[${index + 1}] must be an object.`);
    }
    if (!sample.runId) {
      throw new Error(`${prefix}[${index + 1}] is missing runId.`);
    }
  });
}

function extractSourceExports(payload) {
  const sourceRoot = payload?.sources || payload?.sourceExports || payload || {};

  return {
    prometheus: Array.isArray(sourceRoot.prometheus) ? sourceRoot.prometheus : [],
    dcgm: Array.isArray(sourceRoot.dcgm) ? sourceRoot.dcgm : [],
    kubernetes: Array.isArray(sourceRoot.kubernetes) ? sourceRoot.kubernetes : [],
    scheduler: Array.isArray(sourceRoot.scheduler) ? sourceRoot.scheduler : [],
    grafana: Array.isArray(sourceRoot.grafana) ? sourceRoot.grafana : [],
    ebpf: Array.isArray(sourceRoot.ebpf) ? sourceRoot.ebpf : [],
    redfish: Array.isArray(sourceRoot.redfish) ? sourceRoot.redfish : [],
    provider: Array.isArray(sourceRoot.provider) ? sourceRoot.provider : [],
    opportunities: Array.isArray(sourceRoot.opportunities) ? sourceRoot.opportunities : []
  };
}

function extractNcclTraces(payload) {
  const sourceRoot = payload?.sources || payload?.sourceExports || {};

  return firstArray(
    payload?.ncclTraces,
    payload?.traces,
    payload?.nccl,
    sourceRoot.ncclTraces,
    sourceRoot.traces,
    sourceRoot.nccl
  );
}

function isIngestionFeed(value) {
  return Boolean(value?.schemaVersion === INGESTION_SCHEMA.version && Array.isArray(value.runs));
}

function hasSourceExports(sources) {
  return sources.prometheus.length > 0
    || sources.dcgm.length > 0
    || sources.kubernetes.length > 0
    || sources.scheduler.length > 0
    || sources.grafana.length > 0
    || sources.ebpf.length > 0
    || sources.redfish.length > 0
    || sources.provider.length > 0
    || sources.opportunities.length > 0;
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function setIngestStatus(label, tone = "good") {
  state.ingestLabel = label;
  state.ingestTone = tone;
  renderIngestState();
}

async function handleFileIngest(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setIngestStatus("Reading file", "watch");
    const payload = parseImportJson(await file.text(), "File is not valid JSON.");
    await ingestJsonPayload(payload, `Imported ${file.name}`);
  } catch (error) {
    setIngestStatus(importErrorMessage(error, "Import failed"), "poor");
  } finally {
    event.target.value = "";
  }
}

async function handleApiIngest() {
  const input = document.querySelector("#apiInput");
  const url = input.value.trim();
  if (!url) {
    setIngestStatus("API URL required", "watch");
    return;
  }

  try {
    setIngestStatus("Fetching API", "watch");
    const requestUrl = parseImportUrl(url);
    const response = await window.fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    await ingestJsonPayload(parseImportJson(await response.text(), "API did not return valid JSON."), "Fetched API feed");
  } catch (error) {
    setIngestStatus(importErrorMessage(error, "Fetch failed"), "poor");
  }
}

function prefillMachineDemoUrl() {
  if (!shouldOfferMachineDemoBundle()) return;
  const input = document.querySelector("#apiInput");
  if (input && !input.value) {
    input.value = machineDemoBundleUrl();
  }
}

async function maybeAutoLoadMachineDemoBundle() {
  if (!shouldAutoLoadMachineDemoBundle()) return;

  await loadMachineDemoBundle({ auto: true });
  startMachineDemoRefresh();
}

function maybeStartSparkPairClockFeed() {
  if (!shouldAutoLoadSparkPairClockFeed()) return;
  loadSparkPairClockFeed();
  startSparkPairClockRefresh();
}

async function loadMachineDemoBundle({ quiet = false, auto = false } = {}) {
  if (machineDemoLoadInFlight) return;
  machineDemoLoadInFlight = true;
  const requestUrl = machineDemoBundleUrl();
  try {
    if (!quiet) setIngestStatus("Fetching machine demo", "watch");
    const response = await window.fetch(cacheBustUrl(requestUrl));
    if (!response.ok) {
      throw new Error(`Machine demo ${response.status}`);
    }
    const responseText = await response.text();
    const nowMs = Date.now();
    if (quiet && responseText === machineDemoLastPayloadText) {
      if (nowMs - machineDemoLastUnchangedRenderAt >= MACHINE_DEMO_UNCHANGED_RENDER_MS) {
        machineDemoLastUnchangedRenderAt = nowMs;
        requestDashboardRender("live");
      }
      return;
    }
    machineDemoLastPayloadText = responseText;
    const commitWorkspace = !quiet || maybeCommitMachineDemoWorkspace(nowMs);
    if (!quiet) machineDemoLastWorkspaceCommitAt = nowMs;
    const loadedAt = new Date();
    await ingestJsonPayload(
      parseImportJson(responseText, "Machine demo did not return valid JSON."),
      `Live machine telemetry ${loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
      {
        captureSnapshot: commitWorkspace,
        persist: commitWorkspace,
        scheduledRender: quiet,
        renderMode: quiet && !commitWorkspace ? "live" : "full"
      }
    );
  } catch (error) {
    if (quiet) return;
    if (auto) {
      setIngestStatus("Live feed unavailable", "watch");
      return;
    }
    setIngestStatus(importErrorMessage(error, "Machine demo fetch failed"), "poor");
  } finally {
    machineDemoLoadInFlight = false;
  }
}

function startMachineDemoRefresh() {
  if (machineDemoRefreshTimer || !shouldAutoLoadMachineDemoBundle()) return;
  machineDemoRefreshTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadMachineDemoBundle({ quiet: true });
  }, MACHINE_DEMO_REFRESH_MS);
}

function startSparkPairClockRefresh() {
  if (sparkPairClockRefreshTimer || !shouldAutoLoadSparkPairClockFeed()) return;
  sparkPairClockRefreshTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadSparkPairClockFeed();
  }, SPARK_PAIR_CLOCK_REFRESH_MS);
}

async function loadSparkPairClockFeed() {
  if (sparkPairClockLoadInFlight) return;
  sparkPairClockLoadInFlight = true;
  try {
    const response = await window.fetch(cacheBustUrl(sparkPairClockFeedUrl()));
    if (!response.ok) return;
    applySparkPairClockFeed(parseImportJson(await response.text(), "SPARK clock feed did not return valid JSON."));
  } catch {
    // The fast clock feed is optional; the full live-machine bundle remains the fallback.
  } finally {
    sparkPairClockLoadInFlight = false;
  }
}

function shouldOfferMachineDemoBundle() {
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "machine" || isKnownMachineDemoHost();
}

function shouldAutoLoadMachineDemoBundle() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "sample" && !isKnownMachineDemoHost()) return false;
  if (params.get("demo") === "machine" || params.get("source") === "machine") return true;
  if (mobileDashboardConfig().autoLoadBundle || mobileDashboardConfig().bundleUrl) return true;
  return isKnownMachineDemoHost();
}

function shouldAutoLoadSparkPairClockFeed() {
  const params = new URLSearchParams(window.location.search);
  if (["0", "false", "off"].includes(String(params.get("clockFeed") || "").toLowerCase())) return false;
  return shouldAutoLoadMachineDemoBundle() && (isLakehouseDashboardHost() || params.has("clockFeed"));
}

function isKnownMachineDemoHost() {
  return [
    "localhost",
    "127.0.0.1",
    "::1",
    "192.168.10.30",
    "nuc14e",
    "192.168.10.20",
    "spark1",
    "192.168.10.21",
    ...PI_FLEET_HOSTNAMES,
    "192.168.10.27",
    "192.168.10.33",
    "192.168.10.38",
    "dgx-lisa",
    "192.168.10.42",
    "dgx-jensen",
    "100.96.89.98",
    "dgx-pat",
    "192.168.10.103",
    "100.95.183.13",
    "nuc15"
  ].includes(window.location.hostname.toLowerCase());
}

function mobileDashboardConfig() {
  const config = window.TURBALANCE_MOBILE_CONFIG;
  return config && typeof config === "object" ? config : {};
}

function sparkPairClockFeedUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseImportUrl(params.get("clockFeed") || "build/demo/spark-clock-offset.json");
}

function platformApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("platformApi");
  if (!value && isLakehouseDashboardHost()) {
    if (window.location.protocol === "https:") return `${window.location.origin}/api`;
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLakehouseDashboardHost() {
  return ["localhost", "127.0.0.1", "::1", "192.168.10.30", "nuc14e", "192.168.10.103", "100.95.183.13", "nuc15"].includes(window.location.hostname.toLowerCase());
}

function platformApiUrl(path) {
  const base = platformApiBaseUrl();
  return base ? `${base}${path}` : "";
}

function platformApiAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const queryToken = String(params.get("apiToken") || "").trim();
  if (queryToken) return queryToken;
  try {
    return String(window.localStorage.getItem(PLATFORM_API_TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writePlatformApiAuthToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(PLATFORM_API_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(PLATFORM_API_TOKEN_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

function loadLlmReportConfig() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LLM_REPORT_CONFIG_STORAGE_KEY) || "{}");
    return normalizeLlmReportConfig(parsed);
  } catch {
    return normalizeLlmReportConfig({});
  }
}

function normalizeLlmReportConfig(config = {}) {
  return {
    baseUrl: String(config.baseUrl || ""),
    model: String(config.model || ""),
    apiKey: String(config.apiKey || "")
  };
}

function writeLlmReportConfig(config) {
  try {
    window.localStorage.setItem(LLM_REPORT_CONFIG_STORAGE_KEY, JSON.stringify(normalizeLlmReportConfig(config)));
    return true;
  } catch {
    return false;
  }
}

function updateLlmReportConfig(partial) {
  state.llmReportConfig = normalizeLlmReportConfig({
    ...state.llmReportConfig,
    ...partial
  });
  writeLlmReportConfig(state.llmReportConfig);
}

function platformApiFetch(path) {
  const url = platformApiUrl(path);
  const token = platformApiAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return window.fetch(url, { headers });
}

function cacheBustUrl(url) {
  const nextUrl = new URL(url, window.location.href);
  nextUrl.searchParams.set("_", Date.now().toString());
  return nextUrl.href;
}

function currentAnalysis() {
  const entries = buildEntries(state.scope);
  const activeEntry = entries.find((entry) => entry.key === state.selectedKey) || entries[0];
  if (!activeEntry) return null;

  const summary = displaySummary(activeEntry);
  const classifier = classifyBottlenecks(summary);
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);
  const schedulerSimulator = simulateScheduler(summary);

  return {
    summary,
    classifier,
    provider,
    opportunityEngine,
    schedulerSimulator
  };
}

function opportunityImpactLabel(opportunity) {
  const dollars = opportunity.impactDollars > 0 ? currency.format(opportunity.impactDollars) : "";
  const gpuHours = opportunity.impactGpuHours > 0 ? `${number.format(opportunity.impactGpuHours)} GPU-hours` : "";
  return [dollars, gpuHours].filter(Boolean).join(" / ") || "n/a";
}

function markdownCell(value) {
  return markdownText(value).replace(/\|/g, "\\|");
}

function markdownText(value) {
  return String(value || "n/a").replace(/\s+/g, " ").trim();
}

function schedulerEvidenceSummaryLine(summary) {
  const evidence = summary.schedulerEvidence || {};
  if (numeric(evidence.sourceCount) <= 0) {
    return "Evidence: no scheduler event overlay attached; estimates use normalized queue, placement, and topology metrics.";
  }

  const parts = [
    `${number.format(evidence.sourceCount)} scheduler source ${evidence.sourceCount === 1 ? "record" : "records"}`,
    `${number.format(evidence.eventCount)} events`
  ];

  if (numeric(evidence.placementRetries) > 0) parts.push(`${number.format(evidence.placementRetries)} placement retries`);
  if (numeric(evidence.localityMisses) > 0) parts.push(`${number.format(evidence.localityMisses)} locality misses`);
  if (numeric(evidence.preemptionCount) > 0) parts.push(`${number.format(evidence.preemptionCount)} preemptions`);

  return `Evidence: ${parts.join(", ")}.`;
}

function safeFileSlug(value) {
  return String(value || "selection")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "selection";
}

function flattenRunValues(runs, getter) {
  return runs.flatMap((run) => {
    const value = getter(run);
    return Array.isArray(value) ? value : [value];
  });
}

function mappedValue(map, value, prefix) {
  const stringValue = String(value || "").trim();
  if (!stringValue) return "";
  return map.get(stringValue) || `${prefix}-unmapped`;
}

function singularCollection(collection) {
  return collection.endsWith("ies")
    ? `${collection.slice(0, -3)}y`
    : collection.replace(/s$/, "");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetWorkspace() {
  const confirmed = window.confirm("Reset the local turbalance workspace to the sample feed?");
  if (!confirmed) return;

  machineInventoryArchive = [];
  activeIngestion = applyPersistedBaselines(DEFAULT_INGESTION, buildBaselineStore(DEFAULT_INGESTION.runs));
  jobs = normalizeIngestion(activeIngestion);
  snapshotHistory = [];
  liveTelemetryHistory = [];
  savingsLedger = [];
  actionExecutionHistory = [];
  state.scope = "job";
  state.selectedKey = jobs.find((job) => job.id === "run-7421")?.id || jobs[0]?.id || "";
  state.samePod = false;
  state.schedulerScenario = "recommended";
  state.ingestLabel = "Demo data";
  state.ingestTone = "watch";
  state.dataBoundary = demoDataBoundary();
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot("Reset demo data", state.lastAnalysis);
  persistWorkspaceStore();
  render();
}

function captureManualAnalysisSnapshot() {
  state.lastAnalysis = new Date();
  captureAnalysisSnapshot("Manual snapshot", state.lastAnalysis);
  persistWorkspaceStore();
  setIngestStatus("Trend snapshot captured", "good");
  render();
}

function bindEvents() {
  document.querySelectorAll("#pageControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = button.dataset.page || "cockpit";
      render();
    });
  });

  document.querySelectorAll("#scopeControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.scope = button.dataset.scope;
      state.selectedKey = buildEntries(state.scope)[0].key;
      render();
    });
  });

  document.querySelector("#windowSelect").addEventListener("change", (event) => {
    state.window = event.target.value;
    render();
  });

  document.querySelector("#rateInput").addEventListener("input", (event) => {
    state.rate = Number(event.target.value) || 0;
    render();
  });

  document.querySelector("#samePodToggle").addEventListener("change", (event) => {
    state.samePod = event.target.checked;
    render();
  });

  document.querySelectorAll("#trendMetricControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.trendMetric = button.dataset.trendMetric;
      render();
    });
  });

  document.querySelectorAll("#simulatorControls button").forEach((button) => {
    button.addEventListener("click", () => {
      state.schedulerScenario = button.dataset.schedulerScenario;
      render();
    });
  });

  document.querySelector("#captureSnapshotButton").addEventListener("click", captureManualAnalysisSnapshot);
  document.querySelector("#copyReport").addEventListener("click", copyReport);
  document.querySelector("#copyLlmReport").addEventListener("click", copyLlmReport);
  document.querySelector("#copyLlmPrompt").addEventListener("click", copyLlmPrompt);
  document.querySelector("#generateLlmReport").addEventListener("click", generateLlmReport);
  document.querySelector("#llmApiUrl").addEventListener("input", (event) => {
    updateLlmReportConfig({ baseUrl: event.target.value });
    render();
  });
  document.querySelector("#llmModelInput").addEventListener("input", (event) => {
    updateLlmReportConfig({ model: event.target.value });
    render();
  });
  document.querySelector("#llmApiKey").addEventListener("input", (event) => {
    updateLlmReportConfig({ apiKey: event.target.value });
    render();
  });
  document.querySelector("#ingestFile").addEventListener("change", handleFileIngest);
  document.querySelector("#fetchApiButton").addEventListener("click", handleApiIngest);
  document.querySelector("#exportWorkspaceButton").addEventListener("click", exportWorkspace);
  document.querySelector("#exportRedactedWorkspaceButton").addEventListener("click", () => exportWorkspace({ redacted: true }));
  document.querySelector("#exportEvidencePackButton").addEventListener("click", exportEvidencePack);
  document.querySelector("#resetWorkspaceButton").addEventListener("click", resetWorkspace);
}

function initPanelPopouts() {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button > 0) return;
    const source = event.target instanceof Element ? event.target : null;
    if (!source) return;

    const target = source.closest(PANEL_POPOUT_SELECTOR);
    if (!target || target.closest(".topbar, .scope-strip, .ingest-strip")) {
      collapsePanelPopoutIfOutside(source);
      return;
    }

    const interactive = source.closest(PANEL_POPOUT_INTERACTIVE_SELECTOR);
    if (interactive && interactive !== target && !interactive.matches(PANEL_POPOUT_SELECTOR)) return;

    activatePanelPopout(target);
  }, true);

  document.addEventListener("pointermove", (event) => collapsePanelPopoutIfOutside(event.target));
  document.addEventListener("mousemove", (event) => collapsePanelPopoutIfOutside(event.target));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") deactivatePanelPopout();
  });
}

function collapsePanelPopoutIfOutside(source) {
  if (!activePanelPopout || !(source instanceof Node) || activePanelPopout.contains(source)) return;
  deactivatePanelPopout();
}

function activatePanelPopout(target) {
  if (!(target instanceof HTMLElement) || target.hidden || target.closest("[hidden]")) return;
  if (activePanelPopout === target) return;

  deactivatePanelPopout();

  activePanelPopout = target;
  activePanelPopoutScope = target.closest(".inventory, .operator-cockpit-panel, .live-resource-panel, .operator-loop, .analysis-grid, .workspace");
  activePanelPopoutScope?.classList.add("panel-popout-scope");

  target.classList.add("panel-popout-active");
  target.dataset.popout = "active";
  if (!target.hasAttribute("tabindex")) {
    target.dataset.popoutAddedTabindex = "true";
    target.tabIndex = 0;
  }

  const collapseOnLeave = () => deactivatePanelPopout(target);
  const collapseOnFocusOut = (event) => {
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    deactivatePanelPopout(target);
  };
  const cleanup = () => {
    target.removeEventListener("pointerleave", collapseOnLeave);
    target.removeEventListener("mouseleave", collapseOnLeave);
    target.removeEventListener("focusout", collapseOnFocusOut);
  };
  panelPopoutCleanups.set(target, cleanup);
  target.addEventListener("pointerleave", collapseOnLeave);
  target.addEventListener("mouseleave", collapseOnLeave);
  target.addEventListener("focusout", collapseOnFocusOut);
}

function deactivatePanelPopout(target = activePanelPopout) {
  if (!target || target !== activePanelPopout) return;

  const cleanup = panelPopoutCleanups.get(target);
  if (cleanup) cleanup();
  panelPopoutCleanups.delete(target);

  target.classList.remove("panel-popout-active");
  delete target.dataset.popout;
  if (target.dataset.popoutAddedTabindex === "true") {
    target.removeAttribute("tabindex");
    delete target.dataset.popoutAddedTabindex;
  }

  activePanelPopoutScope?.classList.remove("panel-popout-scope");
  activePanelPopoutScope = null;
  activePanelPopout = null;
}

function activateSelectedInventoryPopout(entryKey) {
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      const list = document.getElementById("entityList");
      const selected = Array.from(list?.children || []).find((child) => child.dataset.entryKey === entryKey);
      activatePanelPopout(selected);
    });
  }, 40);
}

function predictiveSeriesForScope(summary) {
  const history = (typeof snapshotHistory !== "undefined" && Array.isArray(snapshotHistory) ? snapshotHistory : [])
    .filter((record) => record && record.scope === summary.scope && record.key === summary.key)
    .map((record) => ({ t: record.capturedAt, metrics: record.metrics || {} }));

  const series = {};
  Object.keys(PREDICTIVE_METRIC_CONFIG).forEach((key) => {
    const points = history
      .map((row) => ({ value: Number(row.metrics[key]), t: row.t }))
      .filter((point) => Number.isFinite(point.value));
    if (points.length >= 2) series[key] = points;
  });
  return series;
}

function formatPrescriptiveDollars(value) {
  const n = Number(value) || 0;
  if (n >= 1000) return `$${Math.round(n / 100) / 10}k`;
  return `$${Math.round(n)}`;
}

function toggleDashboardElement(selector, blockId) {
  const element = document.querySelector(selector);
  if (element) element.hidden = !dashboardBlockEnabled(blockId);
}

function entryMachineInventoryMissing(entry) {
  return (entry.items || []).some((item) => Boolean(item.source?.context?.machineInventoryMissing));
}

function fleetAggregateSourceItems(items) {
  return uniqueBy(
    (items || []).filter((item) => isMachineDemoItem(item) || item.source?.context?.hostname || item.source?.context?.node),
    (item) => {
      const context = item.source?.context || {};
      return normalizeFleetHostId(context.hostname || context.node || context.networkLocalAddress || item.cluster || item.name || item.id);
    }
  );
}

function displaySummary(entry) {
  return finalizeSummary(applyPlacementWhatIf(summarizeEntry(entry)));
}

function benchmarkPercentileContext(summary, k = 5) {
  if (!state.benchmarkOptIn) {
    return { status: "off", text: "" };
  }
  const current = numeric(summary.mfuPct, Number.NaN);
  if (!Number.isFinite(current)) {
    return { status: "unknown", text: "Benchmark opt-in enabled; MFU needs model specs before percentile context." };
  }
  const values = snapshotHistory
    .map((record) => numeric(record.metrics?.mfuPct, Number.NaN))
    .filter(Number.isFinite);
  if (!values.some((value) => Math.abs(value - current) < 0.0001)) {
    values.push(current);
  }
  if (values.length < k) {
    return { status: "suppressed", text: `Benchmark aggregate suppressed until ${k} opted-in comparable samples are available.` };
  }
  const below = values.filter((value) => value < current).length;
  const equal = values.filter((value) => value === current).length;
  const percentile = Math.round(((below + equal * 0.5) / values.length) * 100);
  return {
    status: "ready",
    percentile,
    text: `Opted-in benchmark context: MFU is at the ${percentile}th percentile across ${values.length} k-anonymous comparable samples.`
  };
}

function removeMachineInventoryEntry(key) {
  const normalizedKey = normalizeMachineInventoryKey(key);
  if (!normalizedKey) return;

  machineInventoryArchive = machineInventoryArchive.filter((record) => record.key !== normalizedKey);
  activeIngestion = {
    ...activeIngestion,
    runs: activeIngestion.runs.filter((run) => (
      !isMachineInventoryMissingRun(run) || machineInventoryKeyForRun(run) !== normalizedKey
    ))
  };
  jobs = normalizeIngestion(activeIngestion);

  const entries = buildEntries(state.scope);
  if (!entries.some((entry) => entry.key === state.selectedKey)) {
    state.selectedKey = entries[0]?.key || "";
  }

  setIngestStatus("Machine removed from inventory", "good");
  persistWorkspaceStore();
  render();
}

function formatMachineUptime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(numeric(seconds, Number.NaN)));
  if (!Number.isFinite(totalSeconds)) return "unknown";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function formatMachineLastSeen(value) {
  const date = value ? safeDate(value, new Date(0)) : null;
  if (!date || date.getTime() <= 0) return "last seen unknown";
  const ageMs = Date.now() - date.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 5000) return "last seen just now";
  return `last seen ${formatMachineAge(ageMs)} ago`;
}

function formatMachineAge(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function isGb10GpuModel(label) {
  return /(^|[^A-Za-z0-9])GB10([^A-Za-z0-9]|$)|DGX[ -]?Spark/i.test(String(label || ""));
}

function isMachineDemoItem(item) {
  const adapters = item.source?.adapters || [];
  const context = item.source?.context || {};

  return adapters.includes("local-machine")
    || Boolean(
      context.hostname
      && (
        context.gpuUuid
        || context.generatedAt
        || Array.isArray(context.observedServices)
        || Array.isArray(context.ollamaModels)
      )
    );
}

function fleetAggregateOverview(summary) {
  const comparison = buildFleetComparison(summary, null, platformVirtualSensorCache.systemIdentification);
  let rows = comparison.available ? comparison.rows.slice() : [];
  let spreadRows = comparison.available ? comparison.spreadRows.slice() : [];
  if (!rows.length) {
    rows = buildFleetMachineContexts(summary, null)
      .slice(0, FLEET_COMPARISON_HOST_LIMIT)
      .map((context) => fleetHostSnapshot(context, null));
    assignFleetSignatureDistances(rows);
    const metricConfigs = fleetMetricConfigs();
    spreadRows = metricConfigs.map((config) => fleetMetricSpread(config, rows)).filter(Boolean);
    assignFleetScores(rows, metricConfigs);
    rows.sort((left, right) => right.score - left.score || fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }));
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });
  }

  const hostCount = rows.length;
  const ages = rows.map((row) => numeric(row.sampleAgeMs, Number.NaN)).filter(Number.isFinite);
  const freshCount = rows.filter((row) => Number.isFinite(row.sampleAgeMs) && row.sampleAgeMs <= MACHINE_DEMO_FRESH_MS).length;
  const staleCount = Math.max(0, hostCount - freshCount);
  const outlierCount = rows.filter((row) => row.outlierCount > 0 || row.tone === "poor").length;
  const fingerprintCount = rows.filter((row) => row.signatureMetricCount > 0).length;
  const benchmarkCount = rows.filter(fleetBenchmarkAvailable).length;
  const averageHostScore = fleetAverage(rows, (row) => row.score, 0);
  const avgCpuUsagePct = fleetAverage(rows, (row) => row.cpuUsagePct, 0);
  const avgMemoryUsedPct = fleetAverage(rows, (row) => row.memoryUsedPct, 0);
  const avgDiskUsedPct = fleetAverage(rows, (row) => row.diskUsedPct, 0);
  const avgGpuUtilizationPct = fleetAverage(rows.filter((row) => row.gpuPresent), (row) => row.gpuUtilizationPct, 0);
  const avgNetworkUtilizationPct = fleetAverage(rows, (row) => row.networkUtilizationPct, 0);
  const aggregateLakehouseRow = fleetAggregateLakehouseTelemetryRow(summary);
  const lakehouseRows = [
    ...rows.filter((row) => row.lakehouseExists || numeric(row.lakehouseUsedBytes, 0) > 0),
    ...(aggregateLakehouseRow ? [aggregateLakehouseRow] : [])
  ];
  const lakehouseHostCount = lakehouseRows.length;
  const totalLakehouseUsedBytes = lakehouseRows.reduce((total, row) => total + numeric(row.lakehouseUsedBytes, 0), 0);
  const avgLakehouseDiskUsedPct = fleetAverage(lakehouseRows, (row) => row.lakehouseDiskUsedPct, 0);
  const largestLakehouseRow = lakehouseRows.slice().sort((left, right) => numeric(right.lakehouseUsedBytes, 0) - numeric(left.lakehouseUsedBytes, 0))[0] || null;
  const lakehouseDiskPressureCount = lakehouseRows.filter((row) => numeric(row.lakehouseDiskUsedPct, 0) >= 85).length;
  const totalCpuCores = rows.reduce((total, row) => total + numeric(row.cpuCount, 0), 0);
  const totalMemoryBytes = rows.reduce((total, row) => total + numeric(row.memoryTotalBytes, 0), 0);
  const totalDiskBytes = rows.reduce((total, row) => total + numeric(row.diskTotalBytes, 0), 0);
  const gpuHostCount = rows.filter((row) => row.gpuPresent).length;
  const totalNetworkThroughputBps = rows.reduce((total, row) => total + numeric(row.networkThroughputBps, 0), 0);
  const fastestLinkMbps = rows.reduce((best, row) => Math.max(best, numeric(row.networkLinkSpeedMbps, 0)), 0);
  const networkIssueCount = rows.reduce((total, row) => total + numeric(row.networkIssueCount, 0), 0);
  const maxAgeMs = ages.length ? Math.max(...ages) : null;
  const widestSpread = fleetAggregateWidestSpread(spreadRows);
  const closestPair = fleetAggregatePair(rows, true);
  const divergentPair = fleetAggregatePair(rows, false);
  const similarityScore = fleetAggregateSimilarity(rows, spreadRows, { closestPair, divergentPair });
  const maxPressurePct = Math.max(avgCpuUsagePct, avgMemoryUsedPct, avgDiskUsedPct, avgGpuUtilizationPct, avgNetworkUtilizationPct);
  const freshnessScore = hostCount ? (freshCount / hostCount) * 100 : 0;
  const outlierScore = hostCount ? 100 - (outlierCount / hostCount) * 100 : 100;
  const pressureScore = clamp(100 - Math.max(0, maxPressurePct - 72) * 1.7);
  const healthScore = clamp(
    averageHostScore * 0.34
    + freshnessScore * 0.24
    + similarityScore * 0.22
    + outlierScore * 0.12
    + pressureScore * 0.08
  );
  const signatureValues = rows.map((row) => row.signatureDelta).filter(Number.isFinite);
  const signatureMedian = fleetMedian(signatureValues);
  const topRow = rows[0] || null;
  const watchRow = rows.slice().sort((left, right) => left.score - right.score || right.outlierCount - left.outlierCount)[0] || null;
  const similarityLabel = `${round(similarityScore)}% similarity`;
  const headline = hostCount
    ? `${hostCount}-host fleet aggregate: ${freshCount}/${hostCount} fresh, ${similarityLabel}, ${outlierCount} ${outlierCount === 1 ? "host" : "hosts"} to watch.`
    : "Fleet aggregate is waiting for live hosts.";
  const pairSentence = closestPair && divergentPair
    ? `Closest pair is ${closestPair.left}/${closestPair.right} at ${round(closestPair.similarity)}%; widest separation is ${divergentPair.left}/${divergentPair.right} at ${round(divergentPair.similarity)}%.`
    : "Pairwise comparison needs at least two hosts.";
  const spreadSentence = widestSpread
    ? `${widestSpread.label} has the broadest spread (${formatDecimal(widestSpread.cv, 2)} CV, ${widestSpread.bestHost || "--"} vs ${widestSpread.worstHost || "--"}).`
    : "Metric spread is still learning.";
  const narrative = `${pairSentence} ${spreadSentence} Top rank is ${topRow?.host || "--"}; fingerprints cover ${fingerprintCount}/${hostCount || 0} hosts.`;

  return {
    comparison,
    rows,
    spreadRows,
    hostCount,
    freshCount,
    staleCount,
    outlierCount,
    fingerprintCount,
    benchmarkCount,
    averageHostScore,
    avgCpuUsagePct,
    avgMemoryUsedPct,
    avgDiskUsedPct,
    avgGpuUtilizationPct,
    avgNetworkUtilizationPct,
    lakehouseRows,
    aggregateLakehouseRow,
    lakehouseHostCount,
    totalLakehouseUsedBytes,
    avgLakehouseDiskUsedPct,
    largestLakehouseRow,
    lakehouseDiskPressureCount,
    totalCpuCores,
    totalMemoryBytes,
    totalDiskBytes,
    gpuHostCount,
    totalNetworkThroughputBps,
    fastestLinkMbps,
    networkIssueCount,
    maxAgeMs,
    widestSpread,
    closestPair,
    divergentPair,
    similarityScore,
    maxPressurePct,
    healthScore,
    signatureMedian,
    signatureSpreadLabel: Number.isFinite(signatureMedian) ? `Median system-ID delta ${formatDecimal(signatureMedian, 2)}` : "System-ID signatures learning",
    topRow,
    watchRow,
    headline,
    narrative
  };
}

function fleetAggregateAnalysis(overview) {
  const relationships = [
    analysisRelationship(
      "Closest pair",
      overview.closestPair ? `${round(overview.closestPair.similarity)}%` : "learning",
      overview.closestPair ? `${overview.closestPair.left} and ${overview.closestPair.right} align across ${overview.closestPair.sharedMetrics} shared metrics` : "Need two or more hosts",
      overview.closestPair ? grade(overview.closestPair.similarity, 62, 82).key : "watch"
    ),
    analysisRelationship(
      "Widest pair",
      overview.divergentPair ? `${round(overview.divergentPair.similarity)}%` : "learning",
      overview.divergentPair?.reason || "Pairwise separation learning",
      overview.divergentPair ? grade(overview.divergentPair.similarity, 54, 72).key : "watch"
    ),
    analysisRelationship(
      "Freshness",
      `${overview.freshCount}/${overview.hostCount}`,
      Number.isFinite(overview.maxAgeMs) ? `Oldest live sample is ${sparkPairAgeLabel(overview.maxAgeMs)}` : "No heartbeat timestamps in this bundle",
      overview.staleCount ? (overview.staleCount > overview.hostCount * 0.25 ? "poor" : "watch") : "good"
    ),
    analysisRelationship(
      "Pressure",
      pct(overview.maxPressurePct),
      `${pct(overview.avgCpuUsagePct)} CPU, ${pct(overview.avgMemoryUsedPct)} RAM, ${pct(overview.avgGpuUtilizationPct)} GPU average`,
      inverseGrade(overview.maxPressurePct, 72, 88).key
    ),
    analysisRelationship(
      "Data lake",
      formatBytes(overview.totalLakehouseUsedBytes),
      overview.lakehouseHostCount
        ? `${overview.lakehouseHostCount} storage ${overview.lakehouseHostCount === 1 ? "source reports" : "sources report"} lakehouse usage; filesystem average is ${pct(overview.avgLakehouseDiskUsedPct)} full`
        : "No lakehouse storage usage reported yet",
      overview.lakehouseHostCount ? inverseGrade(overview.avgLakehouseDiskUsedPct, 75, 90).key : "watch"
    ),
    analysisRelationship(
      "Spread",
      overview.widestSpread ? overview.widestSpread.label : "learning",
      overview.widestSpread ? `${overview.widestSpread.bestHost || "--"} to ${overview.widestSpread.worstHost || "--"}; CV ${formatDecimal(overview.widestSpread.cv, 2)}` : "No comparable spread yet",
      overview.widestSpread?.tone || "watch"
    )
  ];

  return {
    contextKey: `fleet:${overview.rows.map((row) => row.key || row.host).join(":")}`,
    sampleCount: overview.hostCount,
    windowSeconds: Number.isFinite(overview.maxAgeMs) ? Math.round(overview.maxAgeMs / 1000) : 0,
    badgeText: `${overview.hostCount} hosts | ${round(overview.similarityScore)}% similar`,
    covarianceBadgeText: "Fleet cross-section",
    covarianceFootText: "Covariance is computed across hosts in the current fleet bundle, not a per-host time window.",
    emptyAlertText: "No fleet-level divergence, staleness, or resource pressure detected.",
    alerts: fleetAggregateAlerts(overview),
    relationships,
    covarianceMatrix: buildLiveCovarianceMatrix(fleetAggregateGraphRows(overview)),
    observations: fleetAggregateObservations(overview),
    history: fleetAggregateGraphRows(overview),
    status: overview.outlierCount || overview.staleCount
      ? `${overview.outlierCount + overview.staleCount} fleet signals`
      : "Fleet balanced"
  };
}

function fleetAggregateAlerts(overview) {
  const alerts = [];
  if (overview.staleCount > 0) {
    alerts.push(liveTelemetryAlert({
      severity: overview.staleCount > overview.hostCount * 0.35 ? "high" : "medium",
      title: "Fleet bundle contains stale host samples",
      evidence: `${overview.staleCount} of ${overview.hostCount} hosts are older than ${MACHINE_DEMO_FRESH_SECONDS}s; oldest sample is ${sparkPairAgeLabel(overview.maxAgeMs)}.`,
      recommendation: "Check the push timers and receiver allow-list on the stale hosts before trusting cross-host comparisons.",
      confidence: 0.86
    }));
  }

  if (overview.outlierCount > 0) {
    const row = overview.watchRow;
    alerts.push(liveTelemetryAlert({
      severity: overview.outlierCount > overview.hostCount * 0.35 ? "high" : "medium",
      title: "Cross-host outliers detected",
      evidence: `${overview.outlierCount} hosts diverge from the fleet median${row ? `; ${row.host} is currently the lowest-ranked host` : ""}.`,
      recommendation: "Compare the watch host against the top-ranked host for freshness, CPU/RAM pressure, link speed, disk fullness, benchmark score, and system-ID signature delta.",
      confidence: 0.8
    }));
  }

  if (overview.divergentPair && overview.divergentPair.similarity < 55) {
    alerts.push(liveTelemetryAlert({
      severity: overview.divergentPair.similarity < 40 ? "high" : "medium",
      title: "Fleet has a low-similarity pair",
      evidence: `${overview.divergentPair.left} and ${overview.divergentPair.right} are only ${round(overview.divergentPair.similarity)}% similar. ${overview.divergentPair.reason}`,
      recommendation: "Treat this pair as the first cross-check: compare host inventory, GPU visibility, NIC/link role, benchmark freshness, and resource pressure.",
      confidence: 0.78
    }));
  }

  if (overview.maxPressurePct >= 88) {
    alerts.push(liveTelemetryAlert({
      severity: "high",
      title: "Fleet resource pressure is elevated",
      evidence: `The highest average pressure across CPU, RAM, GPU, disk, and network is ${pct(overview.maxPressurePct)}.`,
      recommendation: "Inspect the watch host and any host with sustained RAM/disk/network pressure before scheduling additional work.",
      confidence: 0.74
    }));
  }

  if (overview.lakehouseDiskPressureCount > 0) {
    alerts.push(liveTelemetryAlert({
      severity: overview.avgLakehouseDiskUsedPct >= 92 ? "high" : "medium",
      title: "Data lake filesystem capacity is tight",
      evidence: `${overview.lakehouseDiskPressureCount} lakehouse-reporting storage sources are at or above 85% filesystem usage; aggregate lakehouse directory size is ${formatBytes(overview.totalLakehouseUsedBytes)}.`,
      recommendation: "Review the largest lakehouse host and prune, compact, or move older lakehouse partitions before the filesystem limits ingestion.",
      confidence: 0.82
    }));
  }

  if (overview.networkIssueCount > 0) {
    alerts.push(liveTelemetryAlert({
      severity: overview.networkIssueCount > overview.hostCount ? "high" : "medium",
      title: "Network counters report interface issues",
      evidence: `${overview.networkIssueCount} drops/errors were observed across the fleet aggregate.`,
      recommendation: "Prioritize interface error/drop checks on hosts with high network throughput or low fleet rank.",
      confidence: 0.82
    }));
  }

  return alerts.slice(0, LIVE_TELEMETRY_ALERT_LIMIT);
}

function fleetAggregateObservations(overview) {
  const now = Date.now();
  const rows = [
    {
      tone: grade(overview.similarityScore, 62, 82).key,
      label: "Aggregate",
      title: "Fleet similarity",
      detail: `${overview.hostCount} hosts compare at ${pct(overview.similarityScore)} similarity with ${overview.outlierCount} outlier hosts.`,
      timestampMs: now
    },
    {
      tone: overview.closestPair ? grade(overview.closestPair.similarity, 62, 82).key : "watch",
      label: "Pair",
      title: "Closest pair",
      detail: overview.closestPair
        ? `${overview.closestPair.left}/${overview.closestPair.right} are ${round(overview.closestPair.similarity)}% similar across ${overview.closestPair.sharedMetrics} shared metrics.`
        : "Need two or more hosts for pairwise similarity.",
      timestampMs: now
    },
    {
      tone: overview.divergentPair ? grade(overview.divergentPair.similarity, 54, 72).key : "watch",
      label: "Pair",
      title: "Widest separation",
      detail: overview.divergentPair
        ? `${overview.divergentPair.left}/${overview.divergentPair.right} are ${round(overview.divergentPair.similarity)}% similar. ${overview.divergentPair.reason}`
        : "Pairwise separation is still learning.",
      timestampMs: now
    },
    {
      tone: overview.widestSpread?.tone || "watch",
      label: "Spread",
      title: overview.widestSpread ? `${overview.widestSpread.label} spread` : "Metric spread",
      detail: overview.widestSpread
        ? `${overview.widestSpread.bestHost || "--"} to ${overview.widestSpread.worstHost || "--"} with CV ${formatDecimal(overview.widestSpread.cv, 2)}.`
        : "No comparable spread rows yet.",
      timestampMs: now
    },
    {
      tone: grade(overview.healthScore, 58, 78).key,
      label: "Rank",
      title: "Top and watch hosts",
      detail: `Top rank ${overview.topRow?.host || "--"}; watch host ${overview.watchRow?.host || "--"}; average host score ${round(overview.averageHostScore)}.`,
      timestampMs: now
    },
    {
      tone: overview.lakehouseHostCount ? inverseGrade(overview.avgLakehouseDiskUsedPct, 75, 90).key : "watch",
      label: "Lake",
      title: "Data lake storage",
      detail: overview.lakehouseHostCount
        ? `${formatBytes(overview.totalLakehouseUsedBytes)} used across ${overview.lakehouseHostCount} storage ${overview.lakehouseHostCount === 1 ? "source" : "sources"}; largest is ${overview.largestLakehouseRow?.host || "--"}.`
        : "No lakehouse path is reporting storage usage yet.",
      timestampMs: now
    },
    {
      tone: overview.fingerprintCount >= overview.hostCount ? "good" : overview.fingerprintCount ? "watch" : "poor",
      label: "Fingerprint",
      title: "System-ID coverage",
      detail: `${overview.fingerprintCount}/${overview.hostCount} hosts have system-identification signatures. ${overview.signatureSpreadLabel}.`,
      timestampMs: now
    }
  ];

  return rows.slice(0, LIVE_OBSERVATION_LIMIT);
}

function fleetAggregateGraphRows(overview) {
  return overview.rows
    .slice()
    .sort((left, right) => fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }))
    .map((row, index) => ({
      host: row.host,
      timestampMs: Date.now() + index,
      label: row.host,
      score: row.score,
      cpu: row.cpuUsagePct,
      ram: row.memoryUsedPct,
      gpu: row.gpuPresent ? row.gpuUtilizationPct : null,
      disk: row.diskUsedPct,
      lakehouseUsedBytes: Number.isFinite(row.lakehouseUsedBytes) ? row.lakehouseUsedBytes : null,
      networkUtilization: row.networkUtilizationPct,
      networkThroughputBps: row.networkThroughputBps,
      signatureDelta: row.signatureDelta
    }));
}

function fleetAggregateTelemetrySeries(overview, valueKey) {
  const rows = overview.rows
    .slice()
    .sort((left, right) => fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }));

  return rows
    .map((row, index) => {
      const hostKey = row.key || normalizeFleetHostId(row.host);
      const history = liveTelemetrySamplesForHost(hostKey);
      const fallback = fleetAggregateCurrentRowSample(row, valueKey);
      const seriesHistory = history.some((sample) => Number.isFinite(telemetryValue(sample, valueKey)))
        ? history
        : fallback ? [fallback] : [];
      if (!seriesHistory.length) return null;

      return {
        key: hostKey,
        label: row.host,
        color: liveTelemetrySeriesColor(index),
        history: seriesHistory
      };
    })
    .filter(Boolean);
}

function fleetAggregateCurrentRowSample(row, valueKey) {
  const sample = {
    host: row.host,
    hostKey: row.key || normalizeFleetHostId(row.host),
    timestampMs: Date.now(),
    label: row.host,
    score: row.score,
    cpu: row.cpuUsagePct,
    ram: row.memoryUsedPct,
    gpu: row.gpuPresent ? row.gpuUtilizationPct : null,
    disk: row.diskUsedPct,
    lakehouseUsedBytes: Number.isFinite(row.lakehouseUsedBytes) ? row.lakehouseUsedBytes : null,
    networkUtilization: row.networkUtilizationPct,
    networkThroughputBps: row.networkThroughputBps,
    signatureDelta: row.signatureDelta
  };

  return Number.isFinite(telemetryValue(sample, valueKey)) ? sample : null;
}

function fleetAggregateSeriesHistory(series) {
  return series.flatMap((entry) => entry.history || []);
}

function liveTelemetrySeriesColor(index) {
  return LIVE_TELEMETRY_SERIES_COLORS[index % LIVE_TELEMETRY_SERIES_COLORS.length];
}

function fleetAggregateLakehouseGraphRows(overview, history) {
  if (!overview.aggregateLakehouseRow) return history;
  return [
    ...history,
    {
      host: overview.aggregateLakehouseRow.host,
      timestampMs: Date.now() + history.length,
      label: overview.aggregateLakehouseRow.host,
      lakehouseUsedBytes: overview.aggregateLakehouseRow.lakehouseUsedBytes
    }
  ];
}

function fleetAggregateLakehouseTelemetryRow(summary) {
  const telemetry = isPlainObject(summary.lakehouseTelemetry)
    ? summary.lakehouseTelemetry
    : isPlainObject(activeIngestion?.lakehouseTelemetry)
    ? activeIngestion.lakehouseTelemetry
    : null;
  if (!telemetry) return null;
  const usedBytes = numeric(telemetry.lakehouseUsedBytes ?? telemetry.usedBytes, Number.NaN);
  const exists = telemetry.lakehouseExists ?? telemetry.exists;
  if (!Number.isFinite(usedBytes) && !exists) return null;
  return {
    host: String(telemetry.hostname || telemetry.host || "data-lake"),
    key: "aggregate-data-lake",
    lakehouseRoot: String(telemetry.lakehouseRoot || telemetry.root || ""),
    lakehouseExists: Boolean(exists),
    lakehouseMeasuredAt: String(telemetry.lakehouseMeasuredAt || telemetry.measuredAt || ""),
    lakehouseUsedBytes: Number.isFinite(usedBytes) ? usedBytes : 0,
    lakehouseDiskFilesystem: String(telemetry.lakehouseDiskFilesystem || telemetry.filesystem || ""),
    lakehouseDiskType: String(telemetry.lakehouseDiskType || telemetry.diskType || ""),
    lakehouseDiskTotalBytes: numeric(telemetry.lakehouseDiskTotalBytes ?? telemetry.diskTotalBytes, 0),
    lakehouseDiskUsedBytes: numeric(telemetry.lakehouseDiskUsedBytes ?? telemetry.diskUsedBytes, 0),
    lakehouseDiskAvailableBytes: numeric(telemetry.lakehouseDiskAvailableBytes ?? telemetry.diskAvailableBytes, 0),
    lakehouseDiskUsedPct: numeric(telemetry.lakehouseDiskUsedPct ?? telemetry.diskUsedPct, 0),
    telemetryOnly: true
  };
}

function fleetAggregateSimilarity(rows, spreadRows, pairs = {}) {
  if (rows.length < 2) return rows.length ? 100 : 0;
  const pairScores = fleetAggregatePairComparisons(rows)
    .map((pair) => pair.similarity)
    .filter(Number.isFinite);
  const pairSimilarity = pairScores.length
    ? pairScores.reduce((total, value) => total + value, 0) / pairScores.length
    : pairs.closestPair?.similarity ?? 100;
  const spreadSamples = spreadRows
    .map((row) => numeric(row.cv, Number.NaN))
    .filter(Number.isFinite);
  const spreadPenalty = spreadSamples.length
    ? spreadSamples.reduce((total, value) => total + Math.min(1.25, value), 0) / spreadSamples.length
    : 0;
  const spreadSimilarity = clamp(100 - spreadPenalty * 55);
  const outlierRatio = rows.reduce((total, row) => total + (row.outlierCount > 0 || row.tone === "poor" ? 1 : 0), 0) / rows.length;
  const signaturePenalty = fleetAverage(rows, (row) => row.signatureDelta, 0);
  const signatureSimilarity = Number.isFinite(signaturePenalty) && signaturePenalty > 0
    ? clamp(100 - Math.min(4, signaturePenalty) * 18)
    : 82;

  return clamp(
    pairSimilarity * 0.44
    + spreadSimilarity * 0.30
    + (100 - outlierRatio * 100) * 0.16
    + signatureSimilarity * 0.10
  );
}

function fleetAggregatePair(rows, closest) {
  const pairs = fleetAggregatePairComparisons(rows);
  if (!pairs.length) return null;
  return pairs.sort((left, right) => closest ? right.similarity - left.similarity : left.similarity - right.similarity)[0];
}

function fleetAggregatePairComparisons(rows) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const pair = fleetAggregateComparePair(rows[leftIndex], rows[rightIndex]);
      if (pair) pairs.push(pair);
    }
  }
  return pairs;
}

function fleetAggregateComparePair(left, right) {
  const metrics = [
    { key: "cpuUsagePct", label: "CPU", percent: true },
    { key: "loadPressurePct", label: "load/core", percent: true },
    { key: "memoryUsedPct", label: "RAM", percent: true },
    { key: "diskUsedPct", label: "disk", percent: true },
    { key: "networkUtilizationPct", label: "network util", percent: true },
    { key: "gpuUtilizationPct", label: "GPU util", percent: true, requireGpu: true },
    { key: "gpuMemoryUsedPct", label: "GPU memory", percent: true, requireGpu: true },
    { key: "cpuCount", label: "CPU cores", relative: true },
    { key: "memoryTotalBytes", label: "RAM total", relative: true },
    { key: "diskTotalBytes", label: "disk total", relative: true },
    { key: "networkLinkSpeedMbps", label: "link speed", relative: true },
    { key: "networkThroughputBps", label: "network activity", relative: true },
    { key: "benchmarkScore", label: "benchmark", percent: true },
    { key: "signatureDelta", label: "system-ID", domain: 4 }
  ];
  const deltas = [];

  metrics.forEach((metric) => {
    if (metric.requireGpu && (!left.gpuPresent || !right.gpuPresent)) return;
    const leftValue = numeric(left[metric.key], Number.NaN);
    const rightValue = numeric(right[metric.key], Number.NaN);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return;
    let distance = 0;
    if (metric.percent) {
      distance = Math.abs(leftValue - rightValue) / 100;
    } else if (metric.domain) {
      distance = Math.abs(leftValue - rightValue) / metric.domain;
    } else {
      distance = Math.abs(leftValue - rightValue) / Math.max(Math.abs(leftValue), Math.abs(rightValue), 1);
    }
    deltas.push({
      label: metric.label,
      distance: clamp(distance, 0, 2)
    });
  });

  if (!deltas.length) return null;
  const averageDistance = deltas.reduce((total, delta) => total + delta.distance, 0) / deltas.length;
  const largest = deltas.slice().sort((leftDelta, rightDelta) => rightDelta.distance - leftDelta.distance)[0];
  return {
    left: left.host,
    right: right.host,
    similarity: clamp(100 - averageDistance * 100),
    distance: averageDistance,
    sharedMetrics: deltas.length,
    reason: largest ? `Largest gap is ${largest.label}.` : "No dominant gap."
  };
}

function fleetAggregateWidestSpread(spreadRows) {
  return spreadRows
    .slice()
    .sort((left, right) => {
      const leftWeight = numeric(left.cv, 0) + numeric(left.outlierCount, 0) * 0.2;
      const rightWeight = numeric(right.cv, 0) + numeric(right.outlierCount, 0) * 0.2;
      return rightWeight - leftWeight;
    })[0] || null;
}

function fleetAverage(rows, getter, fallback = Number.NaN) {
  const values = rows
    .map(getter)
    .map((value) => numeric(value, Number.NaN))
    .filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback;
}

function liveNetworkDisplay(machineContext) {
  const hasPercent = Number.isFinite(machineContext.networkUtilizationPct);
  const throughput = Number.isFinite(machineContext.networkThroughputBps) ? machineContext.networkThroughputBps : 0;
  const interfaceLabel = machineContext.networkInterface || "primary interface";
  const roleLabel = machineContext.networkLinkRole || (interfaceLabel === "enp1s0f1np1" ? "DGX interconnect" : "Network link");
  const peerText = machineContext.networkLocalAddress && machineContext.networkPeerAddress
    ? ` ${machineContext.networkLocalAddress}->${machineContext.networkPeerAddress}`
    : "";
  const scopeText = `${roleLabel}: ${interfaceLabel}${peerText}`;
  const linkText = Number.isFinite(machineContext.networkLinkSpeedMbps) && machineContext.networkLinkSpeedMbps > 0
    ? `${compactNumber.format(machineContext.networkLinkSpeedMbps)} Mbps link`
    : "link speed unavailable";
  const issueCount = numeric(machineContext.networkRxDrops)
    + numeric(machineContext.networkTxDrops)
    + numeric(machineContext.networkRxErrors)
    + numeric(machineContext.networkTxErrors);

  return {
    value: hasPercent ? pct(machineContext.networkUtilizationPct) : throughput > 0 ? formatBytesPerSecond(throughput) : "learning",
    note: hasPercent
      ? `${scopeText} | ${formatBytesPerSecond(throughput)} | ${linkText}`
      : `${scopeText} | ${linkText}`,
    percent: hasPercent ? machineContext.networkUtilizationPct : null,
    tone: issueCount > 0 ? "watch" : hasPercent ? inverseGrade(machineContext.networkUtilizationPct, 70, 88).key : "watch"
  };
}

function gb10MonitoringAvailable(item) {
  return Boolean(item && item.status && item.status !== "missing");
}

function formatHostSampleAgeMilliseconds(ageMilliseconds) {
  const parsed = Number(ageMilliseconds);
  const rounded = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  return `${number.format(rounded)}ms`;
}

function executionIdleHostRow(machineContext) {
  const context = machineContext?.context || {};
  const host = machineContext?.host || context.hostname || "host";
  const gpuPresent = Boolean(machineContext?.gpuPresent || gpuExporterContextHasAny(context, GPU_EXPORTER_METRIC_GROUPS.flatMap((group) => [
    ...group.normalized,
    ...group.nvidia,
    ...group.amd
  ])));
  const gpuModel = machineContext?.gpuModel || context.gpuName || "GPU";
  const powerWatts = firstFinite(
    context.gpuPowerWatts,
    machineContext?.gpuPowerWatts,
    gpuExporterFirstFinite(context, [
      "gpu_power_watts",
      "gpu_power_instant_watts",
      "turba_gpu_power_watts",
      "DCGM_FI_DEV_POWER_USAGE",
      "DCGM_FI_DEV_POWER_USAGE_INSTANT",
      "GPU_POWER_USAGE",
      "GPU_PACKAGE_POWER",
      "GPU_AVERAGE_PACKAGE_POWER",
      "nvidia_smi_power_draw_watts",
      "amd_gpu_power_usage",
      "amd_gpu_package_power"
    ])
  );
  const gpuUtil = executionIdlePercent(firstFinite(
    context.gpuUtilizationPct,
    machineContext?.gpuUtilizationPct,
    ratioPercent(gpuExporterFirstFinite(context, ["turba_gpu_utilization_ratio", "turba_gpu_activity_ratio"])),
    gpuExporterFirstFinite(context, ["DCGM_FI_DEV_GPU_UTIL", "GPU_GFX_ACTIVITY", "GPU_GFX_BUSY_INSTANTANEOUS", "amd_gpu_gfx_activity"])
  ));
  const smActive = executionIdlePercent(firstFinite(
    context.gpuSmActivePct,
    context.gpuSmOccupancyPct,
    context.smOccupancy,
    context.DCGM_FI_PROF_SM_ACTIVE,
    context.DCGM_FI_PROF_SM_OCCUPANCY,
    gpuExporterFirstFinite(context, ["gpu_sm_active_ratio", "gpu_sm_occupancy_ratio", "DCGM_FI_PROF_SM_ACTIVE", "DCGM_FI_PROF_SM_OCCUPANCY", "GPU_PROCESS_CU_OCCUPANCY"])
  ));
  const tensorActive = executionIdlePercent(firstFinite(
    context.gpuTensorActivePct,
    context.gpuTensorPipeActivePct,
    context.tensorCoreUtil,
    context.DCGM_FI_PROF_PIPE_TENSOR_ACTIVE,
    gpuExporterFirstFinite(context, ["gpu_tensor_pipe_active_ratio", "DCGM_FI_PROF_PIPE_TENSOR_ACTIVE"])
  ));
  const dramActive = executionIdlePercent(firstFinite(
    context.gpuDramActivePct,
    context.gpuMemoryActivityPct,
    context.hbmBandwidthPct,
    context.DCGM_FI_PROF_DRAM_ACTIVE,
    gpuExporterFirstFinite(context, ["gpu_dram_active_ratio", "DCGM_FI_PROF_DRAM_ACTIVE", "GPU_UMC_ACTIVITY", "GPU_MEM_ACTIVITY"])
  ));
  const activityPct = maxFinite(gpuUtil, smActive, tensorActive, dramActive) ?? 0;
  const pcieBps = maxFinite(
    context.gpuPcieTxBytesPerSecond,
    context.gpuPcieRxBytesPerSecond,
    context.DCGM_FI_PROF_PCIE_TX_BYTES,
    context.DCGM_FI_PROF_PCIE_RX_BYTES,
    executionIdleMegabytesPerSecond(context.gpuPcieTxMBps),
    executionIdleMegabytesPerSecond(context.gpuPcieRxMBps),
    executionIdleMegabitsPerSecond(gpuExporterFirstFinite(context, ["PCIE_BANDWIDTH", "amd_gpu_pcie_bandwidth"])),
    executionIdleGigabytesPerSecond(gpuExporterFirstFinite(context, ["PCIE_BIDIRECTIONAL_BANDWIDTH", "amd_gpu_pcie_bidirectional_bandwidth"])),
    gpuExporterFirstFinite(context, ["turba_gpu_interconnect_bytes_per_second"])
  );
  const nvlinkBps = maxFinite(
    context.gpuNvlinkTxBytesPerSecond,
    context.gpuNvlinkRxBytesPerSecond,
    context.DCGM_FI_PROF_NVLINK_TX_BYTES,
    context.DCGM_FI_PROF_NVLINK_RX_BYTES,
    executionIdleMegabytesPerSecond(context.gpuNvlinkTxMBps),
    executionIdleMegabytesPerSecond(context.gpuNvlinkRxMBps),
    executionIdleGigabytesPerSecond(gpuExporterFirstFinite(context, ["XGMI_LINK_RX", "XGMI_LINK_TX", "amd_gpu_xgmi_link_rx", "amd_gpu_xgmi_link_tx"]))
  );
  const deviceCommBps = maxFinite(pcieBps, nvlinkBps) ?? 0;
  const networkBps = maxFinite(machineContext?.networkRxBytesPerSecond, machineContext?.networkTxBytesPerSecond) ?? 0;
  const resident = executionIdleResident(machineContext);
  const deepIdleWatts = executionIdleDeepIdleWatts(gpuModel, powerWatts);
  const wasteWatts = Number.isFinite(powerWatts) ? Math.max(0, powerWatts - deepIdleWatts) : 0;
  const elevatedPower = Number.isFinite(powerWatts) && wasteWatts >= EXECUTION_IDLE_MIN_POWER_GAP_WATTS;
  const lowActivity = activityPct <= EXECUTION_IDLE_LOW_ACTIVITY_PCT && deviceCommBps < EXECUTION_IDLE_COMMUNICATION_BPS;
  const maybeResident = resident.present || resident.uncertain;
  const isCandidate = gpuPresent && lowActivity && elevatedPower && maybeResident;
  const streakSeconds = isCandidate ? executionIdleStreakSeconds(machineContext, { deepIdleWatts }) : 0;
  const confirmed = Number.isFinite(streakSeconds) && streakSeconds >= EXECUTION_IDLE_SUSTAINED_SECONDS;
  const state = !gpuPresent
    ? "unavailable"
    : isCandidate
      ? resident.present ? "candidate" : "possible"
      : lowActivity ? "deep-idle" : "active";
  const tone = confirmed || state === "candidate"
    ? "poor"
    : state === "possible" ? "watch" : state === "active" ? "good" : "watch";
  const confidence = !gpuPresent
    ? 0
    : confirmed ? 92 : state === "candidate" ? 78 : state === "possible" ? 58 : state === "active" ? 70 : 64;
  const cause = executionIdleCause({ pcieBps, nvlinkBps, networkBps, machineContext, activityPct });
  const weightedWasteWatts = isCandidate ? wasteWatts * (state === "possible" ? 0.55 : 1) : 0;

  return {
    host,
    gpuModel,
    gpuPresent,
    state,
    stateLabel: executionIdleStateLabel(state, confirmed),
    tone,
    confidence,
    isCandidate,
    confirmed,
    powerWatts,
    deepIdleWatts,
    wasteWatts,
    weightedWasteWatts,
    activityPct,
    gpuUtil,
    smActive,
    tensorActive,
    dramActive,
    deviceCommBps,
    pcieBps,
    nvlinkBps,
    networkBps,
    resident,
    streakSeconds,
    cause,
    sampleAgeMs: sparkPairSampleAgeMilliseconds(machineContext),
    evidence: executionIdleEvidence({ activityPct, powerWatts, deepIdleWatts, resident, deviceCommBps }),
    action: executionIdleRowAction({ state, confirmed, resident, cause })
  };
}

function executionIdlePercent(value) {
  if (!Number.isFinite(value)) return undefined;
  return value >= 0 && value <= 1 ? value * 100 : value;
}

function executionIdleMegabytesPerSecond(value) {
  return Number.isFinite(Number(value)) ? Number(value) * 1_000_000 : undefined;
}

function executionIdleMegabitsPerSecond(value) {
  return Number.isFinite(Number(value)) ? Number(value) * 125_000 : undefined;
}

function executionIdleGigabytesPerSecond(value) {
  return Number.isFinite(Number(value)) ? Number(value) * 1_000_000_000 : undefined;
}

function executionIdleDeepIdleWatts(gpuModel, powerWatts) {
  const label = String(gpuModel || "");
  if (/GB10|DGX[ -]?Spark/i.test(label)) return 8;
  if (/MI3\d{2}|MI300|MI325|MI350|Instinct/i.test(label)) return 75;
  if (/MI2\d{2}|MI200|MI250/i.test(label)) return 55;
  if (/B200|H200/i.test(label)) return 80;
  if (/H100/i.test(label)) return 70;
  if (/A100/i.test(label)) return 45;
  if (/L40|RTX|A6000|6000 Ada/i.test(label)) return 35;
  if (Number.isFinite(powerWatts) && powerWatts > 0) return clamp(powerWatts * 0.28, 8, 80);
  return 35;
}

function executionIdleResident(machineContext) {
  const context = machineContext?.context || {};
  const processes = Array.isArray(machineContext?.gpuProcesses) ? machineContext.gpuProcesses : [];
  const services = machineDemoServices(context.observedServices);
  const containers = Array.isArray(machineContext?.dockerContainers) ? machineContext.dockerContainers : [];
  const containerText = containers.map((container) => `${container.name || ""} ${container.image || ""}`).join(" ").toLowerCase();
  const servingRuntime = /vllm|triton|tensorrt|trt-llm|nim|ray|nccl|ollama/.test(containerText)
    || services.some((service) => /ollama|vllm|triton|ray|kafka|prometheus/i.test(service));
  const memoryResident = numeric(machineContext?.gpuMemoryUsedMiB, 0) >= 512 || numeric(context.gpuMemoryUsedMiB, 0) >= 512;
  const runningModels = Array.isArray(machineContext?.ollamaRunningModels) && machineContext.ollamaRunningModels.length > 0;
  const processSkipped = Boolean(machineContext?.gpuProcessQuerySkipped);
  const present = processes.length > 0 || memoryResident || runningModels || servingRuntime || Boolean(machineContext?.ncclRuntimePresent);
  return {
    present,
    uncertain: !present && processSkipped,
    label: present
      ? processes.length ? `${processes.length} GPU process${processes.length === 1 ? "" : "es"}` : "resident workload signal"
      : processSkipped ? "process lookup skipped" : "no resident program seen"
  };
}

function executionIdleStreakSeconds(machineContext, row) {
  const context = machineContext?.context || {};
  const explicit = firstFinite(context.executionIdleStreakSeconds, context.gpuExecutionIdleStreakSeconds);
  if (Number.isFinite(explicit)) return explicit;
  const samples = liveTelemetrySamplesForHost(machineContext);
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    const lowActivity = Number.isFinite(sample.gpu) && sample.gpu <= EXECUTION_IDLE_LOW_ACTIVITY_PCT;
    const elevatedPower = Number.isFinite(sample.gpuPower)
      && sample.gpuPower - row.deepIdleWatts >= EXECUTION_IDLE_MIN_POWER_GAP_WATTS;
    if (!lowActivity || !elevatedPower) break;
    first = sample;
  }
  return Math.max(0, (last.timestampMs - first.timestampMs) / 1000);
}

function executionIdleCause({ pcieBps, nvlinkBps, networkBps, machineContext, activityPct }) {
  if (Number.isFinite(pcieBps) && pcieBps >= 250_000_000) {
    return { key: "pcie", label: "PCIe-heavy", note: "paper prior 48%", tone: "watch" };
  }
  if (numeric(machineContext?.hardwarePcieAerCount, 0) > 0) {
    return { key: "pcie", label: "PCIe watch", note: "PCIe AER seen", tone: "poor" };
  }
  if (Number.isFinite(networkBps) && networkBps >= 50_000_000) {
    return { key: "nic", label: "NIC-heavy", note: "paper prior 17%", tone: "watch" };
  }
  if (Number.isFinite(nvlinkBps) && nvlinkBps >= 250_000_000) {
    return { key: "nvlink", label: "NVLink-heavy", note: "paper prior 2%", tone: "watch" };
  }
  if (activityPct <= EXECUTION_IDLE_LOW_ACTIVITY_PCT) {
    return { key: "compute", label: "Compute-to-idle", note: "paper prior 33%", tone: "good" };
  }
  return { key: "active", label: "Active", note: "no idle onset", tone: "good" };
}

function executionIdleStateLabel(state, confirmed) {
  if (confirmed) return "execution-idle";
  if (state === "candidate") return "candidate";
  if (state === "possible") return "possible";
  if (state === "deep-idle") return "deep idle";
  if (state === "active") return "active";
  return "unavailable";
}

function executionIdleEvidence({ activityPct, powerWatts, deepIdleWatts, resident, deviceCommBps }) {
  const power = Number.isFinite(powerWatts)
    ? `${round(powerWatts)} W now, ${round(deepIdleWatts)} W deep-idle estimate`
    : "power counter missing";
  const comm = deviceCommBps ? `${formatBytesPerSecond(deviceCommBps)} device comm` : "device comm below threshold or missing";
  return `${pct(activityPct)} activity | ${power} | ${comm} | ${resident.label}`;
}

function executionIdleRowAction({ state, confirmed, resident, cause }) {
  if (confirmed) return "Run SLO-gated downscale dry-run before touching clocks.";
  if (state === "candidate") return "Hold for sustained proof, then compare SM-only vs SM+HBM policy.";
  if (state === "possible") return resident.uncertain ? "Enable process/DCGM residency check to separate deep idle from loaded idle." : "Collect one more sample before policy action.";
  if (state === "deep-idle") return "Keep as spare capacity or pack work here deliberately.";
  if (cause.key === "active") return "No execution-idle action.";
  return "Track precursor signature.";
}

function executionIdleTopCause(candidateRows) {
  if (!candidateRows.length) {
    return { label: "None", note: "no current candidates", tone: "good" };
  }
  const counts = new Map();
  candidateRows.forEach((row) => {
    const key = row.cause.key;
    counts.set(key, { ...row.cause, count: (counts.get(key)?.count || 0) + 1 });
  });
  return Array.from(counts.values()).sort((left, right) => right.count - left.count)[0];
}

function executionIdleRowSort(left, right) {
  return right.weightedWasteWatts - left.weightedWasteWatts
    || right.confidence - left.confidence
    || fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true });
}

function executionIdlePolicyRows({ rows, candidateRows, estimatedWasteWatts, topCause }) {
  const watched = rows.filter((row) => row.gpuPresent).length;
  const candidatePct = watched ? (candidateRows.length / watched) * 100 : 0;
  return [
    {
      label: "Detection rule",
      value: `${EXECUTION_IDLE_LOW_ACTIVITY_PCT}% / ${formatBytesPerSecond(EXECUTION_IDLE_COMMUNICATION_BPS)}`,
      note: `${EXECUTION_IDLE_SUSTAINED_SECONDS}s sustained gate with process residency`,
      tone: "good"
    },
    {
      label: "Policy dry-run",
      value: estimatedWasteWatts ? executionIdleWattsLabel(estimatedWasteWatts) : "armed",
      note: "Paper reports 22-34% power reduction with 29-160% p95 latency cost",
      tone: estimatedWasteWatts ? "watch" : "good"
    },
    {
      label: "Consolidation",
      value: `${round(candidatePct)}% exposed`,
      note: "For serving, compare pack-work vs spread-work before adding GPUs",
      tone: candidatePct >= 30 ? "watch" : "good"
    },
    {
      label: "Precursor model",
      value: topCause.label,
      note: "Classify PCIe/NIC/NVLink/compute-to-idle onsets as data arrives",
      tone: topCause.tone
    }
  ];
}

function executionIdleWattsLabel(value) {
  const parsed = numeric(value, 0);
  if (Math.abs(parsed) >= 1000) return `${formatDecimal(parsed / 1000, 1)} kW`;
  return `${round(parsed)} W`;
}

function executionIdleEnergyLabel(kwh) {
  const parsed = numeric(kwh, 0);
  if (parsed >= 1000) return `${formatDecimal(parsed / 1000, 1)} MWh`;
  if (parsed >= 10) return `${formatDecimal(parsed, 0)} kWh`;
  return `${formatDecimal(parsed, 1)} kWh`;
}

function gpuExporterCoverageRow(group, contexts) {
  const hostCount = contexts.length;
  const normalizedHosts = contexts.filter((machineContext) => gpuExporterContextHasAny(machineContext.context || {}, group.normalized)).length;
  const nvidiaHosts = contexts.filter((machineContext) => gpuExporterContextHasAny(machineContext.context || {}, group.nvidia)).length;
  const amdHosts = contexts.filter((machineContext) => gpuExporterContextHasAny(machineContext.context || {}, group.amd)).length;
  const coveredHosts = contexts.filter((machineContext) => gpuExporterContextHasAny(machineContext.context || {}, [
    ...group.normalized,
    ...group.nvidia,
    ...group.amd
  ])).length;
  const examples = gpuExporterCoverageExamples(group, contexts);
  const coveragePct = hostCount ? (coveredHosts / hostCount) * 100 : 0;
  const tone = coveredHosts >= hostCount ? "good" : coveredHosts > 0 ? "watch" : "poor";

  return {
    key: group.key,
    label: group.label,
    use: group.use,
    normalizedHosts,
    nvidiaHosts,
    amdHosts,
    coveredHosts,
    hostCount,
    coveragePct,
    examples,
    tone
  };
}

function gpuExporterCoverageExamples(group, contexts) {
  const candidates = [...group.normalized, ...group.nvidia, ...group.amd];
  const examples = [];
  contexts.forEach((machineContext) => {
    const match = gpuExporterContextMatchedName(machineContext.context || {}, candidates);
    if (match && !examples.includes(match)) examples.push(match);
  });
  return examples.slice(0, 3);
}

function gpuExporterContextHasAny(context, names) {
  return Boolean(gpuExporterContextMatchedName(context, names));
}

function gpuExporterObjectHasAny(object, names) {
  if (!isPlainObject(object)) return false;
  return Boolean(gpuExporterObjectMatchedName(object, names));
}

function gpuExporterContextMatchedName(context, names) {
  for (const object of gpuExporterMetricObjects(context)) {
    const match = gpuExporterObjectMatchedName(object, names);
    if (match) return match;
  }
  return "";
}

function gpuExporterObjectMatchedName(object, names) {
  const keyMap = new Map(Object.keys(object || {}).map((key) => [gpuExporterMetricKey(key), key]));
  for (const name of names || []) {
    for (const alias of gpuExporterMetricAliases(name)) {
      const key = keyMap.get(gpuExporterMetricKey(alias));
      if (key && gpuExporterMetricMeaningful(object[key])) return key;
    }
  }
  return "";
}

function gpuExporterFirstFinite(context, names) {
  for (const object of gpuExporterMetricObjects(context)) {
    const keyMap = new Map(Object.keys(object || {}).map((key) => [gpuExporterMetricKey(key), key]));
    for (const name of names || []) {
      for (const alias of gpuExporterMetricAliases(name)) {
        const key = keyMap.get(gpuExporterMetricKey(alias));
        if (!key) continue;
        const value = Number(object[key]);
        if (Number.isFinite(value)) return value;
      }
    }
  }
  return undefined;
}

function gpuExporterMetricObjects(context) {
  return [
    context,
    context?.rawPrometheusMetrics,
    context?.rawDcgmFields,
    context?.gpuExporterMetrics,
    context?.amdDeviceMetrics,
    context?.nvidiaGpuMetrics
  ].filter(isPlainObject);
}

function gpuExporterMetricAliases(name) {
  const value = String(name || "").trim();
  if (!value) return [];
  const snake = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return unique([
    value,
    value.toLowerCase(),
    snake,
    `amd_${snake}`,
    `nvidia_${snake}`,
    `nvidia_smi_${snake}`,
    snake.startsWith("gpu_") ? `amd_${snake}` : "",
    snake.startsWith("dcgm_fi_") ? snake.toUpperCase() : ""
  ].filter(Boolean));
}

function gpuExporterMetricKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function gpuExporterMetricMeaningful(value) {
  if (Number.isFinite(value)) return true;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  const text = String(value ?? "").trim();
  return Boolean(text) && !/^(nan|n\/a|null|undefined|unknown)$/i.test(text);
}

function autoDiscoverySubnet(hosts) {
  const address = (hosts || [])
    .map((host) => host.address)
    .find((value) => /^192\.168\.10\.\d+$/.test(String(value || "")));
  if (address) return `${address.split(".").slice(0, 3).join(".")}.0/24`;
  const hostname = window.location.hostname;
  if (/^192\.168\.10\.\d+$/.test(hostname)) return `${hostname.split(".").slice(0, 3).join(".")}.0/24`;
  return "192.168.10.0/24";
}

function autoDiscoveryControllerAddress() {
  const host = window.location.hostname.toLowerCase();
  if (host === "100.95.183.13" || host === "nuc15") return "192.168.10.103";
  if (/^192\.168\.10\.\d+$/.test(host)) return host;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "192.168.10.103";
  return host || "192.168.10.103";
}

function executionIdleSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "execution-idle-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function executionIdleHeader() {
  const row = document.createElement("div");
  row.className = "execution-idle-row execution-idle-head";
  ["Host", "State", "Power gap", "Activity", "Precursor", "Action"].forEach((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    row.append(cell);
  });
  return row;
}

function executionIdleCell(value, detail = "") {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }
  return cell;
}

function executionIdlePolicyItem(item) {
  const node = document.createElement("div");
  node.className = "execution-idle-policy-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function gpuExporterSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "gpu-exporter-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function gpuExporterHeader() {
  const row = document.createElement("div");
  row.className = "gpu-exporter-row gpu-exporter-head";
  ["Family", "NVIDIA/DCGM", "AMD DME", "Normalized", "Use"].forEach((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    row.append(cell);
  });
  return row;
}

function gpuExporterCell(value, detail = "") {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }
  return cell;
}

function gpuExporterPolicyItem(item) {
  const node = document.createElement("div");
  node.className = "gpu-exporter-policy-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function shellCommandPart(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function unitEconomicsFallbackContext(summary) {
  if (!summary) return null;
  const gpus = Math.max(0, numeric(summary.gpus, 0));
  const gpuModel = listLabel(summary.gpuModels || [], 1) || (gpus > 0 ? "GPU accelerator" : "host-only unit");
  const gpuUtilizationPct = Number.isFinite(numeric(summary.gpuUtil, Number.NaN))
    ? numeric(summary.gpuUtil, 0)
    : numeric(summary.usefulCompute, 0);
  const host = summary.label || summary.clusters?.[0] || "current unit";
  const context = {
    hostname: host,
    gpuName: gpuModel,
    gpuCount: gpus,
    gpuPresent: gpus > 0 || gpuUtilizationPct > 0,
    gpuUtilizationPct,
    cpuUsagePct: numeric(summary.cpuUsagePct, numeric(summary.cpuPrep, 0)),
    generatedAt: dateIso(state.lastAnalysis)
  };

  return {
    host,
    gpuModel,
    gpuPresent: context.gpuPresent,
    noGpu: !context.gpuPresent,
    gpuUtilizationPct,
    gpuPowerWatts: Number.NaN,
    cpuUsagePct: context.cpuUsagePct,
    context
  };
}

function unitEconomicsHostRow(machineContext, index) {
  if (!machineContext) return null;
  const context = machineContext.context || {};
  const host = machineContext.host || context.hostname || context.node || `host ${index + 1}`;
  const hostKey = normalizeFleetHostId(host);
  const gpuModel = machineContext.gpuModel || context.gpuName || "";
  const gpuCount = unitEconomicsGpuCount(machineContext, context);
  const gpuPresent = Boolean(machineContext.gpuPresent || gpuCount > 0) && !/no nvidia|unavailable|none/i.test(gpuModel);
  const capacityUnits = gpuPresent ? Math.max(1, gpuCount || 1) : 1;
  const utilizationPct = unitEconomicsUtilizationPct(machineContext, context, gpuPresent);
  const explicitRevenue = firstFinite(
    context.revenueUsdPerHour,
    context.revenuePerHourUsd,
    context.currentRevenueUsdPerHour,
    context.unitRevenueUsdPerHour
  );
  const explicitRate = firstFinite(
    context.gpuHourRateUsd,
    context.pricePerGpuHourUsd,
    context.billingRateUsdPerGpuHour,
    context.revenueRateUsdPerGpuHour,
    context.billableRateUsdPerHour,
    context.hourlyRateUsd
  );
  const unitRateUsdPerHour = Number.isFinite(explicitRate)
    ? explicitRate
    : numeric(state.rate, 0) * (gpuPresent ? 1 : UNIT_ECONOMICS_DEFAULTS.cpuEquivalentRateFactor);
  const currentUtilizationRatio = clamp(utilizationPct, 0, 100) / 100;
  const fullCapacityRevenuePerHour = Number.isFinite(explicitRevenue)
    ? explicitRevenue / Math.max(currentUtilizationRatio, 0.01)
    : unitRateUsdPerHour * capacityUnits;
  const capexExplicit = firstFinite(
    context.initialCapexUsd,
    context.capexUsd,
    context.deviceCapexUsd,
    context.serverCapexUsd,
    context.hardwareCapexUsd,
    context.assetCostUsd,
    context.purchasePriceUsd,
    context.initialCostUsd
  );
  const capexUsd = Number.isFinite(capexExplicit)
    ? Math.max(0, capexExplicit)
    : unitEconomicsEstimatedCapexUsd({ host, gpuModel, gpuCount, gpuPresent });
  const usefulLifeYears = Math.max(0.5, firstFinite(
    context.usefulLifeYears,
    context.depreciationYears,
    context.assetUsefulLifeYears,
    gpuPresent ? UNIT_ECONOMICS_DEFAULTS.gpuUsefulLifeYears : UNIT_ECONOMICS_DEFAULTS.hostUsefulLifeYears
  ));
  const usefulLifeHours = usefulLifeYears * UNIT_ECONOMICS_HOURS_PER_YEAR;
  const salvageValueUsd = Math.max(0, Math.min(capexUsd, firstFinite(
    context.salvageValueUsd,
    context.residualValueUsd,
    capexUsd * UNIT_ECONOMICS_DEFAULTS.salvagePct
  )));
  const age = unitEconomicsAssetAge(context, usefulLifeHours, index);
  const depreciationPerHour = usefulLifeHours > 0 ? Math.max(0, capexUsd - salvageValueUsd) / usefulLifeHours : 0;
  const accumulatedDepreciationUsd = Math.min(capexUsd - salvageValueUsd, age.hours * depreciationPerHour);
  const bookValueUsd = Math.max(salvageValueUsd, capexUsd - accumulatedDepreciationUsd);
  const explicitOpex = firstFinite(
    context.opexUsdPerHour,
    context.opexPerHourUsd,
    context.operatingCostUsdPerHour,
    context.deviceOpexUsdPerHour
  );
  const power = unitEconomicsPowerEstimate(machineContext, context, { host, gpuModel, gpuCount, gpuPresent });
  const maintenancePct = firstFinite(context.maintenancePctPerYear, context.annualMaintenancePct, UNIT_ECONOMICS_DEFAULTS.maintenancePctPerYear);
  const facilityPct = firstFinite(context.facilityPctPerYear, context.annualFacilityPct, UNIT_ECONOMICS_DEFAULTS.facilityPctPerYear);
  const fixedOpexPerHour = capexUsd * (maintenancePct + facilityPct) / UNIT_ECONOMICS_HOURS_PER_YEAR;
  const model = {
    host,
    hostKey,
    gpuModel,
    gpuPresent,
    gpuCount,
    capacityUnits,
    utilizationPct,
    unitRateUsdPerHour,
    fullCapacityRevenuePerHour,
    capexUsd,
    capexSource: Number.isFinite(capexExplicit) ? "reported CAPEX" : "estimated CAPEX",
    usefulLifeYears,
    salvageValueUsd,
    depreciationPerHour,
    accumulatedDepreciationUsd,
    bookValueUsd,
    ageHours: age.hours,
    ageSource: age.source,
    powerWatts: power.watts,
    powerSource: power.source,
    electricityUsdPerKwh: firstFinite(context.electricityUsdPerKwh, context.energyUsdPerKwh, UNIT_ECONOMICS_DEFAULTS.electricityUsdPerKwh),
    pue: firstFinite(context.pue, context.powerUsageEffectiveness, UNIT_ECONOMICS_DEFAULTS.pue),
    fixedOpexPerHour,
    explicitOpexPerHour: Number.isFinite(explicitOpex) ? Math.max(0, explicitOpex) : Number.NaN,
    opexSource: Number.isFinite(explicitOpex) ? "reported OPEX" : "power + support allocation",
    revenueSource: Number.isFinite(explicitRevenue) ? "reported revenue" : "rate input x utilization",
    estimated: !Number.isFinite(capexExplicit) || !Number.isFinite(explicitOpex),
    timestampMs: Date.now()
  };
  const current = unitEconomicsFinancialPoint(model, {
    utilizationPct,
    powerWatts: power.watts,
    timestampMs: Date.now(),
    label: "now"
  });
  const history = unitEconomicsHistory(model);
  const breakEvenUtilizationPct = model.fullCapacityRevenuePerHour > 0
    ? (current.costPerHour / model.fullCapacityRevenuePerHour) * 100
    : Number.NaN;
  const marginPct = current.revenuePerHour > 0 ? (current.profitPerHour / current.revenuePerHour) * 100 : -100;
  const tone = current.profitPerHour >= 0
    ? "good"
    : current.profitPerHour > -Math.max(0.5, current.costPerHour * 0.25) ? "watch" : "poor";

  return {
    ...model,
    ...current,
    history,
    breakEvenUtilizationPct,
    marginPct,
    tone
  };
}

function unitEconomicsGpuCount(machineContext, context) {
  const explicit = firstFinite(
    context.gpuCount,
    context.gpuDeviceCount,
    context.acceleratorCount,
    context.accelerators,
    context.gpus,
    context.gpuTotal
  );
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const uuidCount = [
    context.gpuUuids,
    context.gpuUUIDs,
    context.gpuDevices
  ]
    .map((value) => Array.isArray(value) ? value.length : 0)
    .find((count) => count > 0);
  if (uuidCount) return uuidCount;
  return machineContext?.gpuPresent ? 1 : 0;
}

function unitEconomicsUtilizationPct(machineContext, context, gpuPresent) {
  const value = gpuPresent
    ? firstFinite(
      context.gpuBillableUtilizationPct,
      context.gpuUtilizationPct,
      context.gpuUtil,
      machineContext?.gpuUtilizationPct
    )
    : firstFinite(
      context.billableUtilizationPct,
      context.cpuUsagePct,
      machineContext?.cpuUsagePct
    );
  if (!Number.isFinite(value)) return 0;
  return clamp(value >= 0 && value <= 1 ? value * 100 : value);
}

function unitEconomicsAssetAge(context, usefulLifeHours, index) {
  const reportedDate = firstString([
    context.commissionedAt,
    context.acquiredAt,
    context.purchaseDate,
    context.installedAt,
    context.assetStartDate,
    context.depreciationStartDate
  ]);
  const parsed = reportedDate ? safeDate(reportedDate, null) : null;
  if (parsed) {
    return {
      hours: Math.max(0, (Date.now() - parsed.getTime()) / 3600000),
      source: "reported age"
    };
  }
  const estimatedRatio = clamp(0.18 + (index % 5) * 0.04, 0.08, 0.42);
  return {
    hours: usefulLifeHours * estimatedRatio,
    source: "estimated age"
  };
}

function unitEconomicsEstimatedCapexUsd({ host, gpuModel, gpuCount, gpuPresent }) {
  const label = `${host} ${gpuModel}`.toLowerCase();
  if (/raspberry|(^|\b)pi\d*\b/.test(label)) return 120;
  if (/nuc|mini pc|minipc/.test(label)) return 900;
  if (/gb10|dgx spark/.test(label)) return 3000;
  if (!gpuPresent) return 2500;
  const baseServerUsd = /workstation|desktop|rtx/i.test(label) ? 2500 : 8000;
  return baseServerUsd + unitEconomicsGpuCapexUsd(gpuModel) * Math.max(1, gpuCount || 1);
}

function unitEconomicsGpuCapexUsd(gpuModel) {
  const label = String(gpuModel || "").toLowerCase();
  if (/gb200|b200/.test(label)) return 40000;
  if (/h200/.test(label)) return 32000;
  if (/h100/.test(label)) return 30000;
  if (/a100/.test(label)) return 12000;
  if (/l40|a6000|rtx 6000|6000 ada/.test(label)) return 7000;
  if (/4090/.test(label)) return 1800;
  if (/gb10|dgx spark/.test(label)) return 3000;
  return 15000;
}

function unitEconomicsPowerEstimate(machineContext, context, hardware) {
  const reportedTotal = firstFinite(
    context.powerWatts,
    context.serverPowerWatts,
    context.totalPowerWatts,
    context.redfishPowerWatts,
    context.chassisPowerWatts,
    context.devicePowerWatts
  );
  if (Number.isFinite(reportedTotal) && reportedTotal > 0) {
    return { watts: reportedTotal, source: "reported power" };
  }

  const gpuPower = firstFinite(context.gpuPowerWatts, machineContext?.gpuPowerWatts);
  if (hardware.gpuPresent && Number.isFinite(gpuPower) && gpuPower > 0) {
    return {
      watts: gpuPower + unitEconomicsBaseHostWatts(hardware),
      source: "GPU power + host estimate"
    };
  }

  return {
    watts: unitEconomicsEstimatedPowerWatts(hardware),
    source: "estimated power"
  };
}

function unitEconomicsBaseHostWatts({ host, gpuModel }) {
  const label = `${host} ${gpuModel}`.toLowerCase();
  if (/raspberry|(^|\b)pi\d*\b/.test(label)) return 8;
  if (/nuc|mini pc|minipc/.test(label)) return 45;
  if (/gb10|dgx spark/.test(label)) return 60;
  return 220;
}

function unitEconomicsEstimatedPowerWatts({ host, gpuModel, gpuCount, gpuPresent }) {
  const label = `${host} ${gpuModel}`.toLowerCase();
  if (/raspberry|(^|\b)pi\d*\b/.test(label)) return 8;
  if (/nuc|mini pc|minipc/.test(label)) return 45;
  if (/gb10|dgx spark/.test(label)) return 120;
  if (!gpuPresent) return 180;
  const perGpuWatts = /b200|h200|h100/.test(label) ? 700 : /a100/.test(label) ? 500 : /4090|rtx|l40|a6000/.test(label) ? 350 : 450;
  return unitEconomicsBaseHostWatts({ host, gpuModel }) + perGpuWatts * Math.max(1, gpuCount || 1);
}

function unitEconomicsFinancialPoint(model, sample) {
  const utilizationPct = clamp(numeric(sample.utilizationPct, model.utilizationPct));
  const utilizationRatio = utilizationPct / 100;
  const powerWatts = Number.isFinite(sample.powerWatts) ? sample.powerWatts : model.powerWatts;
  const revenuePerHour = Math.max(0, model.fullCapacityRevenuePerHour * utilizationRatio);
  const powerOpexPerHour = Math.max(0, powerWatts) * model.pue / 1000 * model.electricityUsdPerKwh;
  const opexPerHour = Number.isFinite(model.explicitOpexPerHour)
    ? model.explicitOpexPerHour
    : powerOpexPerHour + model.fixedOpexPerHour;
  const costPerHour = model.depreciationPerHour + opexPerHour;

  return {
    timestampMs: sample.timestampMs || Date.now(),
    label: sample.label || "",
    utilizationPct,
    powerWatts,
    revenuePerHour,
    powerOpexPerHour,
    opexPerHour,
    depreciationPerHour: model.depreciationPerHour,
    costPerHour,
    profitPerHour: revenuePerHour - costPerHour
  };
}

function unitEconomicsHistory(model) {
  const hostSamples = liveTelemetrySamplesForHost(model.hostKey)
    .slice(-24)
    .map((sample) => ({
      timestampMs: sample.timestampMs,
      label: sample.label,
      utilizationPct: model.gpuPresent && Number.isFinite(sample.gpu) ? sample.gpu : sample.cpu,
      powerWatts: unitEconomicsSamplePowerWatts(model, sample)
    }));
  const sourceSamples = hostSamples.length >= 2 ? hostSamples : unitEconomicsSyntheticSamples(model);
  return sourceSamples.map((sample) => unitEconomicsFinancialPoint(model, sample));
}

function unitEconomicsSamplePowerWatts(model, sample) {
  if (!model.gpuPresent) return model.powerWatts;
  if (!Number.isFinite(sample.gpuPower) || sample.gpuPower <= 0) return model.powerWatts;
  return sample.gpuPower + unitEconomicsBaseHostWatts({ host: model.host, gpuModel: model.gpuModel });
}

function unitEconomicsSyntheticSamples(model) {
  const count = 16;
  const now = Date.now();
  return Array.from({ length: count }, (_unused, index) => {
    const phase = (index + 1) * (model.host.length + 3);
    const drift = Math.sin(phase * 0.55) * 5 + Math.cos(phase * 0.23) * 2;
    const utilizationPct = model.utilizationPct <= 0 ? 0 : clamp(model.utilizationPct + drift);
    const loadRatio = model.utilizationPct > 0 ? utilizationPct / Math.max(1, model.utilizationPct) : 1;
    return {
      timestampMs: now - (count - index - 1) * 60000,
      label: `${count - index - 1}m ago`,
      utilizationPct,
      powerWatts: Math.max(unitEconomicsBaseHostWatts({ host: model.host, gpuModel: model.gpuModel }), model.powerWatts * (0.78 + loadRatio * 0.22))
    };
  });
}

function benchmarkComparisonRows(summary, machineContext, fleetComparison) {
  if (fleetComparison?.available && Array.isArray(fleetComparison.rows) && fleetComparison.rows.length) {
    return fleetComparison.rows;
  }
  const contexts = buildFleetMachineContexts(summary, machineContext).slice(0, FLEET_COMPARISON_HOST_LIMIT);
  const rows = contexts.map((context) => fleetHostSnapshot(context, null));
  assignFleetSignatureDistances(rows);
  const metricConfigs = fleetMetricConfigs();
  metricConfigs.map((config) => fleetMetricSpread(config, rows)).filter(Boolean);
  assignFleetScores(rows, metricConfigs);
  rows.sort((left, right) => right.score - left.score || fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true }));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

function benchmarkTargetRow(rows, machineContext) {
  if (machineContext) {
    const key = fleetHostKey(machineContext);
    const match = rows.find((row) => row.key === key);
    if (match) return match;
  }
  const selected = selectedMachineContextFromInventory();
  if (selected) {
    const key = fleetHostKey(selected);
    const match = rows.find((row) => row.key === key);
    if (match) return match;
  }
  return rows.slice().sort((left, right) => {
    const leftAvailable = benchmarkMetricConfigs().filter((config) => benchmarkMetricState(left, rows, config).available).length;
    const rightAvailable = benchmarkMetricConfigs().filter((config) => benchmarkMetricState(right, rows, config).available).length;
    return rightAvailable - leftAvailable || numeric(right.score, 0) - numeric(left.score, 0);
  })[0] || rows[0];
}

function selectedMachineContextFromInventory() {
  const selected = jobs.find((item) => item.id === state.selectedKey);
  if (!selected) return null;
  const summary = displaySummary({
    key: selected.id,
    label: selected.name || selected.id,
    scope: "job",
    items: [selected]
  });
  return machineContextFromSourceItem(summary, selected);
}

function benchmarkMetricConfigs() {
  return [
    {
      id: "cpu",
      label: "CPU",
      key: "benchmarkCpuOpsPerSecond",
      formatter: fleetOpsLabel,
      source: "periodic benchmark",
      globalKey: "cpuOpsPerSecond"
    },
    {
      id: "gpu",
      label: "GPU",
      key: "benchmarkGpuScore",
      formatter: fleetBenchmarkScoreLabel,
      source: "GPU benchmark",
      missing: "waiting for GPU run",
      globalKey: "gpuScore"
    },
    {
      id: "ram",
      label: "RAM",
      key: "benchmarkMemoryMiBps",
      formatter: fleetMibPerSecondLabel,
      source: "memory fill benchmark",
      globalKey: "memoryMiBps"
    },
    {
      id: "network",
      label: "Network",
      key: "benchmarkNetworkMbps",
      formatter: fleetMbpsLabel,
      source: "network benchmark",
      fallbackKey: "networkLinkSpeedMbps",
      fallbackSource: "link capacity proxy",
      globalKey: "networkMbps"
    },
    {
      id: "disk",
      label: "Disk",
      key: "benchmarkDiskReadMiBps",
      secondaryKey: "benchmarkDiskWriteMiBps",
      formatter: fleetMibPerSecondLabel,
      source: "disk read/write benchmark",
      globalKey: "diskReadMiBps"
    }
  ];
}

function benchmarkMetricState(row, rows, config) {
  const rawValue = numeric(row?.[config.key], Number.NaN);
  const fallbackValue = config.fallbackKey ? numeric(row?.[config.fallbackKey], Number.NaN) : Number.NaN;
  const hasRaw = Number.isFinite(rawValue) && rawValue > 0;
  const hasFallback = !hasRaw && Number.isFinite(fallbackValue) && fallbackValue > 0;
  const value = hasRaw ? rawValue : hasFallback ? fallbackValue : Number.NaN;
  const peers = rows
    .filter((candidate) => candidate !== row)
    .map((candidate) => benchmarkMetricNumeric(candidate, config))
    .filter(Number.isFinite);
  const median = peers.length ? fleetMedian(peers) : Number.NaN;
  const secondary = config.secondaryKey ? numeric(row?.[config.secondaryKey], Number.NaN) : Number.NaN;
  const detail = config.secondaryKey && Number.isFinite(secondary) && secondary > 0
    ? `write ${config.formatter(secondary)}`
    : hasFallback ? config.fallbackSource : config.source;

  return {
    id: config.id,
    label: config.label,
    value,
    valueLabel: Number.isFinite(value) ? config.formatter(value) : config.missing || "waiting",
    secondary,
    detail,
    available: Number.isFinite(value),
    status: hasRaw ? "measured" : hasFallback ? "proxy" : "missing",
    median,
    ratio: Number.isFinite(value) && Number.isFinite(median) && median > 0 ? value / median : Number.NaN,
    formatter: config.formatter,
    source: hasFallback ? config.fallbackSource : config.source
  };
}

function benchmarkMetricNumeric(row, config) {
  const value = numeric(row?.[config.key], Number.NaN);
  if (Number.isFinite(value) && value > 0) return value;
  const fallback = config.fallbackKey ? numeric(row?.[config.fallbackKey], Number.NaN) : Number.NaN;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : Number.NaN;
}

function benchmarkSelfLevel(target, rows, metrics) {
  const available = metrics.filter((metric) => metric.available);
  const measured = metrics.filter((metric) => metric.status === "measured");
  const score = Number.isFinite(target.benchmarkScore)
    ? target.benchmarkScore
    : clamp((available.length / Math.max(1, metrics.length)) * 100);
  return {
    id: "absolute",
    level: "1",
    label: "Metric",
    scope: target.host,
    value: Number.isFinite(score) ? `${formatDecimal(score, 1)}` : `${available.length}/${metrics.length}`,
    detail: `${measured.length} measured | ${available.length} available`,
    status: available.length ? "ready" : "waiting",
    tone: available.length >= 4 ? "good" : available.length >= 2 ? "watch" : "poor",
    score: Number.isFinite(score) ? score : 0
  };
}

function benchmarkPeerLevel(target, rows, metrics) {
  const peer = benchmarkPeerRow(target, rows);
  if (!peer) {
    return benchmarkWaitingLevel("peer", "2", "1:1", "Need another machine");
  }
  return benchmarkComparisonLevel({
    id: "peer",
    level: "2",
    label: "1:1",
    scope: peer.host,
    target,
    baselineRows: [peer],
    metrics,
    confidence: "observed"
  });
}

function benchmarkPeerRow(target, rows) {
  const peers = rows.filter((row) => row !== target);
  if (!peers.length) return null;
  return peers.slice().sort((left, right) => {
    const leftSameGpu = left.gpuPresent === target.gpuPresent ? 1 : 0;
    const rightSameGpu = right.gpuPresent === target.gpuPresent ? 1 : 0;
    return rightSameGpu - leftSameGpu || numeric(right.score, 0) - numeric(left.score, 0);
  })[0];
}

function benchmarkGroupLevel(id, label, target, groupRows, metrics, confidence) {
  const peers = groupRows.filter((row) => row !== target);
  if (!peers.length) {
    return benchmarkWaitingLevel(id, id === "rack" ? "3" : id === "cluster" ? "4" : "5", label, "Need peers in scope");
  }
  return benchmarkComparisonLevel({
    id,
    level: id === "rack" ? "3" : id === "cluster" ? "4" : "5",
    label,
    scope: id === "rack" ? target.rackLabel : id === "cluster" ? target.clusterLabel : `${groupRows.length} hosts`,
    target,
    baselineRows: peers,
    metrics,
    confidence
  });
}

function benchmarkGlobalLevel(target, metrics) {
  const commons = benchmarkOcpCommonsProfile(target, metrics);
  if (commons.hasImportedScore) {
    const score = commons.score;
    return {
      id: "global",
      level: "6",
      label: "OCP Commons",
      scope: commons.dataset || "OCP member corpus",
      value: Number.isFinite(commons.percentile) ? `p${round(commons.percentile)}` : `${formatDecimal(score, 1)}`,
      detail: benchmarkOcpCommonsLevelDetail(commons),
      status: "ready",
      tone: score >= 75 ? "good" : score >= 50 ? "watch" : "poor",
      score
    };
  }

  const measured = metrics.filter((metric) => metric.status === "measured").length;
  return {
    id: "global",
    level: "6",
    label: "OCP Commons",
    scope: commons.hardwareClass || "OCP member benchmark commons",
    value: commons.submissionReady ? "export-ready" : "waiting",
    detail: measured ? `${measured} measured metrics ready for anonymized OCP submission` : "waiting for measured benchmark samples",
    status: commons.submissionReady ? "connector-ready" : "waiting",
    tone: commons.submissionReady ? "watch" : "poor",
    score: commons.submissionReady ? 62 : 20
  };
}

function benchmarkOcpCommonsProfile(target, metrics) {
  const context = target.machineContext?.context || {};
  const percentile = firstFinite(
    target.benchmarkOcpCommonsPercentile,
    context.benchmarkOcpCommonsPercentile,
    target.benchmarkGlobalPercentile,
    context.benchmarkGlobalPercentile
  );
  const importedScore = firstFinite(
    target.benchmarkOcpCommonsScore,
    context.benchmarkOcpCommonsScore,
    target.benchmarkGlobalScore,
    context.benchmarkGlobalScore
  );
  const score = Number.isFinite(percentile) ? percentile : importedScore;
  const dataset = firstString([
    target.benchmarkOcpCommonsDataset,
    context.benchmarkOcpCommonsDataset,
    target.benchmarkGlobalDataset,
    context.benchmarkGlobalDataset
  ]);
  const url = firstString([
    target.benchmarkOcpCommonsUrl,
    context.benchmarkOcpCommonsUrl,
    target.benchmarkGlobalUrl,
    context.benchmarkGlobalUrl
  ]);
  const peerCount = firstFinite(target.benchmarkOcpCommonsPeerCount, context.benchmarkOcpCommonsPeerCount);
  const available = metrics.filter((metric) => metric.available);
  const measured = metrics.filter((metric) => metric.status === "measured");
  const hasImportedScore = Number.isFinite(score);
  const hardwareClass = firstString([
    target.benchmarkOcpCommonsHardwareClass,
    context.benchmarkOcpCommonsHardwareClass,
    context.hardwareClass,
    context.machineClass,
    benchmarkOcpHardwareClass(target)
  ]);
  const configHash = firstString([
    target.benchmarkOcpCommonsConfigHash,
    context.benchmarkOcpCommonsConfigHash,
    benchmarkOcpConfigFingerprint(target)
  ]);
  const qualification = benchmarkOcpQualificationProfile(target, context);

  return {
    available: hasImportedScore || available.length > 0,
    hasImportedScore,
    submissionReady: measured.length > 0,
    dataset: dataset || (hasImportedScore ? "OCP member corpus" : "proposed OCP corpus"),
    url,
    peerCount,
    percentile,
    score,
    hardwareClass,
    configHash,
    binning: firstString([target.benchmarkOcpCommonsBinning, context.benchmarkOcpCommonsBinning]) || (hasImportedScore ? "reported bin" : "pending corpus bin"),
    policy: firstString([target.benchmarkOcpCommonsPolicy, context.benchmarkOcpCommonsPolicy]) || "aggregate-anonymized",
    qualification,
    metricCount: available.length,
    measuredMetricCount: measured.length,
    record: benchmarkOcpCommonsRecord(target, metrics, {
      dataset,
      hardwareClass,
      configHash,
      policy: firstString([target.benchmarkOcpCommonsPolicy, context.benchmarkOcpCommonsPolicy]) || "aggregate-anonymized",
      qualification
    })
  };
}

function benchmarkOcpCommonsLevelDetail(commons) {
  const peerText = Number.isFinite(commons.peerCount) && commons.peerCount > 0
    ? `${round(commons.peerCount)} peer records`
    : "";
  const qualificationText = commons.qualification?.status
    ? `qualification ${commons.qualification.status}`
    : "";
  return [peerText, commons.binning, qualificationText, commons.url ? "external result linked" : "member corpus imported"]
    .filter(Boolean)
    .join(" | ");
}

function benchmarkOcpQualificationProfile(target, context = {}) {
  const thermalStatus = firstString([
    target.gpuThermalQualificationStatus,
    context.gpuThermalQualificationStatus,
    context.gpuThermalQualification?.status
  ]) || "unknown";
  const topologyStatus = firstString([
    target.gpuTopologyStatus,
    context.gpuTopologyStatus,
    context.gpuTopology?.status
  ]) || "unknown";
  const processStatus = firstString([
    target.gpuProcessInspectorStatus,
    context.gpuProcessInspectorStatus,
    context.gpuProcessInspector?.status
  ]) || "unknown";
  const thermalComparable = Boolean(
    target.gpuThermalQualificationComparable
    || context.gpuThermalQualificationComparable
    || context.gpuThermalQualification?.benchmarkComparable
  );
  const topologyObserved = topologyStatus === "observed";
  const processObserved = processStatus === "observed" || processStatus === "empty";
  const comparable = !target.gpuPresent || (thermalComparable && topologyObserved && processObserved);
  return {
    comparable,
    status: comparable ? "qualified" : "needs-review",
    thermalStatus,
    thermalSummary: firstString([context.gpuThermalQualificationSummary, context.gpuThermalQualification?.summary]) || "",
    topologyStatus,
    topologyFingerprint: firstString([context.gpuTopologyFingerprint, context.gpuTopology?.fingerprint]) || "",
    topologySummary: firstString([context.gpuTopologySummary, context.gpuTopology?.summary]) || "",
    processInspectorStatus: processStatus,
    processCount: firstFinite(target.gpuProcessCount, context.gpuProcessCount),
    processMemoryMiB: firstFinite(target.gpuProcessMemoryMiB, context.gpuProcessMemoryMiB),
    requiredEvidence: {
      thermal: thermalStatus !== "unknown" && thermalStatus !== "unavailable",
      topology: topologyObserved,
      processAttribution: processObserved,
      power: Number.isFinite(firstFinite(target.gpuPowerWatts, context.gpuPowerWatts)),
      ras: Number.isFinite(firstFinite(context.hardwareGpuXidCount, target.hardwareGpuXidCount))
    }
  };
}

function benchmarkOcpHardwareClass(target) {
  const context = target.machineContext?.context || {};
  const gpuModel = target.machineContext?.gpuModel || context.gpuName || "";
  if (gpuModel && !/no nvidia|unavailable|none/i.test(gpuModel)) return `${gpuModel} host`;
  return firstString([context.cpuModel, target.platform, context.platform]) || "unclassified hardware";
}

function benchmarkOcpConfigFingerprint(target) {
  const context = target.machineContext?.context || {};
  const parts = [
    context.platform,
    context.arch,
    context.cpuModel,
    context.cpuCount,
    target.machineContext?.gpuModel || context.gpuName,
    context.gpuMemoryTotalMiB,
    context.gpuPcie,
    context.networkLinkSpeedMbps,
    context.benchmarkSuiteName
  ].filter((value) => String(value || "").trim());
  return parts.length
    ? `cfg-${normalizeFleetHostId(parts.join("-")).slice(0, 56)}`
    : "cfg-unclassified";
}

function benchmarkOcpCommonsRecord(target, metrics, profile) {
  const context = target.machineContext?.context || {};
  return {
    schemaVersion: "turba.ocp_benchmark_commons.v1",
    recordType: "benchmark-result",
    dataset: profile.dataset || "proposed OCP corpus",
    generatedAt: target.benchmarkGeneratedAt || context.benchmarkGeneratedAt || context.generatedAt || "",
    hardware: {
      class: profile.hardwareClass || benchmarkOcpHardwareClass(target),
      configFingerprint: profile.configHash || benchmarkOcpConfigFingerprint(target),
      platform: context.platform || target.platform || "",
      arch: context.arch || "",
      cpuCount: numeric(context.cpuCount, 0),
      gpuPresent: Boolean(target.gpuPresent)
    },
    metrics: benchmarkOcpCommonsMetricPayload(metrics),
    qualification: profile.qualification || benchmarkOcpQualificationProfile(target, context),
    policy: {
      visibility: profile.policy || "aggregate-anonymized",
      containsHostIdentity: false,
      exportIntent: "member cross-comparison and hardware quality binning"
    }
  };
}

function benchmarkOcpCommonsMetricPayload(metrics) {
  return Object.fromEntries(metrics
    .filter((metric) => metric.available)
    .map((metric) => [metric.id, {
      label: metric.label,
      value: metric.value,
      valueLabel: metric.valueLabel,
      status: metric.status,
      source: metric.source
    }]));
}

function benchmarkComparisonLevel({ id, level, label, scope, target, baselineRows, metrics, confidence }) {
  const comparisons = metrics
    .map((metric) => {
      if (!metric.available) return null;
      const config = benchmarkMetricConfigs().find((item) => item.id === metric.id);
      const baselineValues = baselineRows.map((row) => benchmarkMetricNumeric(row, config)).filter(Number.isFinite);
      const baseline = baselineValues.length ? fleetMedian(baselineValues) : Number.NaN;
      if (!Number.isFinite(baseline) || baseline <= 0) return null;
      return {
        metric,
        baseline,
        ratio: metric.value / baseline
      };
    })
    .filter(Boolean);

  if (!comparisons.length) {
    return benchmarkWaitingLevel(id, level, label, "No shared benchmark metrics");
  }

  const index = benchmarkComparisonIndex(comparisons);
  const leaderCount = comparisons.filter((item) => item.ratio >= 1.02).length;
  const lagCount = comparisons.filter((item) => item.ratio <= 0.98).length;
  const topGap = comparisons.slice().sort((left, right) => Math.abs(right.ratio - 1) - Math.abs(left.ratio - 1))[0];
  const confidenceText = confidence === "explicit"
    ? "explicit topology"
    : confidence === "observed" ? "observed samples" : "inferred topology";

  return {
    id,
    level,
    label,
    scope,
    value: `${round(index)} index`,
    detail: `${leaderCount} ahead | ${lagCount} behind | ${topGap.metric.label} ${signedPercent((topGap.ratio - 1) * 100)}`,
    status: "ready",
    tone: index >= 105 ? "good" : index >= 90 ? "watch" : "poor",
    score: clamp(index, 0, 140),
    confidence: confidenceText
  };
}

function benchmarkComparisonIndex(comparisons) {
  const scores = comparisons.map((item) => clamp(item.ratio * 100, 0, 200));
  return scores.reduce((total, score) => total + score, 0) / Math.max(1, scores.length);
}

function benchmarkWaitingLevel(id, level, label, detail) {
  return {
    id,
    level,
    label,
    scope: "learning",
    value: "waiting",
    detail,
    status: "waiting",
    tone: "watch",
    score: 45
  };
}

function benchmarkLevelScore(levels) {
  const ready = levels.filter((level) => level.status === "ready" || level.status === "connector-ready");
  return ready.length
    ? ready.reduce((total, level) => total + numeric(level.score, 0), 0) / ready.length
    : 0;
}

function benchmarkGlobalReferenceLinks() {
  return [
    { label: "OCP Commons", note: "member benchmark corpus proposal", url: "https://www.opencompute.org/summit/global-summit/innovation-village" },
    { label: "OpenBenchmarking", note: "global public results", url: "https://openbenchmarking.org/features" },
    { label: "MLPerf", note: "AI/storage benchmark suites", url: "https://mlcommons.org/benchmarks/" },
    { label: "SPEC", note: "standardized CPU/workstation suites", url: "https://www.spec.org/products/" },
    { label: "PerfKit", note: "cloud and local benchmark runner", url: "https://googlecloudplatform.github.io/PerfKitBenchmarker/" }
  ];
}

function benchmarkRackKey(machineContext) {
  const context = machineContext?.context || {};
  const explicit = firstString([
    context.rack,
    context.rackId,
    context.rackName,
    context.topologyRack,
    context.redfishRack,
    context.chassisRack
  ]);
  if (explicit) return normalizeFleetHostId(explicit);
  const subnet = benchmarkSubnetKey(context.networkLocalAddress || context.ncclRuntimeHostIp || context.hostAddress || context.primaryAddress);
  if (subnet) return `subnet-${subnet}`;
  return `host-family-${normalizeFleetHostId(String(machineContext?.host || "").split(/[-._]/)[0] || "local")}`;
}

function benchmarkRackLabel(machineContext) {
  const context = machineContext?.context || {};
  const explicit = firstString([context.rack, context.rackId, context.rackName, context.topologyRack]);
  if (explicit) return explicit;
  const subnet = benchmarkSubnetKey(context.networkLocalAddress || context.ncclRuntimeHostIp || context.hostAddress || context.primaryAddress);
  if (subnet) return `${subnet}.0/24`;
  return "inferred rack";
}

function benchmarkRackConfidence(machineContext) {
  const context = machineContext?.context || {};
  return firstString([context.rack, context.rackId, context.rackName, context.topologyRack]) ? "explicit" : "inferred";
}

function benchmarkClusterKey(machineContext) {
  const context = machineContext?.context || {};
  const explicit = firstString([
    context.cluster,
    context.clusterId,
    context.clusterName,
    context.kubernetesCluster,
    context.fleetCluster
  ]);
  if (explicit) return normalizeFleetHostId(explicit);
  const subnet = benchmarkSubnetKey(context.networkLocalAddress || context.ncclRuntimeHostIp || context.hostAddress || context.primaryAddress);
  return subnet ? `cluster-${subnet}` : "cluster-local";
}

function benchmarkClusterLabel(machineContext) {
  const context = machineContext?.context || {};
  return firstString([context.cluster, context.clusterId, context.clusterName, context.kubernetesCluster, context.fleetCluster])
    || benchmarkSubnetKey(context.networkLocalAddress || context.ncclRuntimeHostIp || context.hostAddress || context.primaryAddress)
    || "local cluster";
}

function benchmarkClusterConfidence(machineContext) {
  const context = machineContext?.context || {};
  return firstString([context.cluster, context.clusterId, context.clusterName, context.kubernetesCluster, context.fleetCluster]) ? "explicit" : "inferred";
}

function benchmarkSubnetKey(address) {
  const match = String(address || "").match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!match) return "";
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function signedPercent(value) {
  const parsed = numeric(value, 0);
  const prefix = parsed > 0 ? "+" : "";
  return `${prefix}${formatDecimal(parsed, Math.abs(parsed) >= 10 ? 0 : 1)}%`;
}

function fleetHostContextSort(left, right) {
  const leftRank = fleetHostSortRank(left);
  const rightRank = fleetHostSortRank(right);
  return leftRank - rightRank || fleetNaturalLabel(left.host).localeCompare(fleetNaturalLabel(right.host), undefined, { numeric: true });
}

function fleetHostSortRank(machineContext) {
  const role = sparkPairHostRole(machineContext);
  if (role === "SPARK1") return 10;
  if (role === "SPARK2") return 11;
  const label = fleetNaturalLabel(machineContext.host);
  const piMatch = label.match(/^pi(\d+)$/i) || label.match(/^PI(\d+)$/);
  if (piMatch) return 100 + numeric(piMatch[1], 0);
  if (/nuc/i.test(label)) return 50;
  return 200;
}

function fleetHostKey(machineContext) {
  const context = machineContext?.context || {};
  return normalizeFleetHostId(
    sparkPairHostRole(machineContext)
    || machineContext?.host
    || context.hostname
    || context.node
    || context.networkLocalAddress
  );
}

function fleetNaturalLabel(value) {
  return String(value || "").trim() || "host";
}

function fleetCharacterizationMap(characterization) {
  const map = new Map();
  if (!characterization || characterization.status !== "ready") return map;
  (characterization.hosts || []).forEach((host) => {
    map.set(normalizeFleetHostId(host.hostId), host);
  });
  return map;
}

function fleetHostSnapshot(machineContext, characterizationHost) {
  const context = machineContext.context || {};
  const sampleAgeMs = sparkPairSampleAgeMilliseconds(machineContext);
  const networkIssueCount = numeric(machineContext.networkRxDrops)
    + numeric(machineContext.networkTxDrops)
    + numeric(machineContext.networkRxErrors)
    + numeric(machineContext.networkTxErrors);
  const networkThroughputBps = Math.max(
    numeric(machineContext.networkRxBytesPerSecond, 0),
    numeric(machineContext.networkTxBytesPerSecond, 0)
  );
  const loadPressurePct = clamp((numeric(context.load1) / Math.max(1, numeric(context.cpuCount, machineContext.context?.cpuCount || 1))) * 100);
  const memoryTotalBytes = numeric(context.memoryTotalBytes, 0);
  const diskTotalBytes = numeric(context.diskTotalBytes, 0);
  const lakehouseUsedBytes = numeric(machineContext.lakehouseUsedBytes, Number.NaN);
  const signature = fleetSystemSignature(characterizationHost);
  const host = machineContext.host || context.hostname || "host";
  const services = machineDemoServices(context.observedServices);

  return {
    host,
    key: fleetHostKey(machineContext),
    machineContext,
    characterizationHost,
    services,
    platform: [machineContext.platform, machineContext.arch].filter(Boolean).join("/") || context.os || "",
    cpuModel: String(context.cpuModel || ""),
    cpuCount: numeric(context.cpuCount, 0),
    sampleAgeMs,
    cpuUsagePct: machineContext.cpuUsagePct,
    cpuTemperatureC: machineContext.cpuTemperatureC,
    loadPressurePct,
    memoryUsedPct: machineContext.memoryUsedPct,
    memoryTotalBytes,
    diskUsedPct: machineContext.diskUsedPct,
    diskTotalBytes,
    lakehouseRoot: machineContext.lakehouseRoot,
    lakehouseExists: machineContext.lakehouseExists,
    lakehouseMeasuredAt: machineContext.lakehouseMeasuredAt,
    lakehouseUsedBytes,
    lakehouseDiskFilesystem: machineContext.lakehouseDiskFilesystem,
    lakehouseDiskType: machineContext.lakehouseDiskType,
    lakehouseDiskTotalBytes: numeric(machineContext.lakehouseDiskTotalBytes, 0),
    lakehouseDiskUsedBytes: numeric(machineContext.lakehouseDiskUsedBytes, 0),
    lakehouseDiskAvailableBytes: numeric(machineContext.lakehouseDiskAvailableBytes, 0),
    lakehouseDiskUsedPct: machineContext.lakehouseDiskUsedPct,
    networkUtilizationPct: machineContext.networkUtilizationPct,
    networkLinkSpeedMbps: machineContext.networkLinkSpeedMbps,
    networkThroughputBps,
    networkIssueCount,
    dockerCpuPct: sparkPairDockerCpuPct(machineContext),
    ollamaTokensPerSecond: machineContext.ollamaTokensPerSecond,
    modelCount: machineContext.modelCount,
    benchmarkSuiteName: machineContext.benchmarkSuiteName,
    benchmarkSuiteStatus: machineContext.benchmarkSuiteStatus,
    benchmarkGeneratedAt: machineContext.benchmarkGeneratedAt,
    benchmarkSampleCached: machineContext.benchmarkSampleCached,
    benchmarkSampleAgeMs: machineContext.benchmarkSampleAgeMs,
    benchmarkTtlMs: machineContext.benchmarkTtlMs,
    benchmarkDurationMs: machineContext.benchmarkDurationMs,
    benchmarkCpuOpsPerSecond: machineContext.benchmarkCpuOpsPerSecond,
    benchmarkMemoryMiBps: machineContext.benchmarkMemoryMiBps,
    benchmarkDiskWriteMiBps: machineContext.benchmarkDiskWriteMiBps,
    benchmarkDiskReadMiBps: machineContext.benchmarkDiskReadMiBps,
    benchmarkGpuScore: machineContext.benchmarkGpuScore,
    benchmarkGpuMemoryMiBps: machineContext.benchmarkGpuMemoryMiBps,
    benchmarkGpuTensorOpsPerSecond: machineContext.benchmarkGpuTensorOpsPerSecond,
    benchmarkNetworkMbps: machineContext.benchmarkNetworkMbps,
    benchmarkNetworkLatencyUs: machineContext.benchmarkNetworkLatencyUs,
    benchmarkGlobalScore: machineContext.benchmarkGlobalScore,
    benchmarkGlobalPercentile: machineContext.benchmarkGlobalPercentile,
    benchmarkGlobalDataset: machineContext.benchmarkGlobalDataset,
    benchmarkGlobalUrl: machineContext.benchmarkGlobalUrl,
    benchmarkOcpCommonsScore: machineContext.benchmarkOcpCommonsScore,
    benchmarkOcpCommonsPercentile: machineContext.benchmarkOcpCommonsPercentile,
    benchmarkOcpCommonsDataset: machineContext.benchmarkOcpCommonsDataset,
    benchmarkOcpCommonsUrl: machineContext.benchmarkOcpCommonsUrl,
    benchmarkOcpCommonsPeerCount: machineContext.benchmarkOcpCommonsPeerCount,
    benchmarkOcpCommonsHardwareClass: machineContext.benchmarkOcpCommonsHardwareClass,
    benchmarkOcpCommonsConfigHash: machineContext.benchmarkOcpCommonsConfigHash,
    benchmarkOcpCommonsBinning: machineContext.benchmarkOcpCommonsBinning,
    benchmarkOcpCommonsPolicy: machineContext.benchmarkOcpCommonsPolicy,
    benchmarkScore: fleetBenchmarkCompositeScore(machineContext),
    benchmarkError: machineContext.benchmarkError,
    gpuPresent: machineContext.gpuPresent,
    gpuUtilizationPct: machineContext.gpuUtilizationPct,
    gpuMemoryUsedPct: machineContext.gpuMemoryUsedPct,
    gpuMemoryTotalMiB: machineContext.gpuMemoryTotalMiB,
    gpuPowerWatts: machineContext.gpuPowerWatts,
    rackKey: benchmarkRackKey(machineContext),
    rackLabel: benchmarkRackLabel(machineContext),
    rackConfidence: benchmarkRackConfidence(machineContext),
    clusterKey: benchmarkClusterKey(machineContext),
    clusterLabel: benchmarkClusterLabel(machineContext),
    clusterConfidence: benchmarkClusterConfidence(machineContext),
    signature,
    signatureDelta: Number.NaN,
    signatureMetricCount: Object.keys(signature).length,
    outlierCount: 0,
    outlierLabels: [],
    score: 0,
    tone: "watch"
  };
}

function fleetSystemSignature(host) {
  if (!host) return {};
  const signature = {};
  (host.subsystems || []).forEach((subsystem) => {
    [
      ["stepPeak", subsystem.stepPeak],
      ["stepGain", subsystem.stepGain],
      ["impulsePeak", subsystem.impulsePeak],
      ["impulseGain", subsystem.impulseGain],
      ["rampPeak", subsystem.rampPeak]
    ].forEach(([feature, value]) => {
      if (Number.isFinite(value)) signature[`${subsystem.key}:${feature}`] = value;
    });
    Object.entries(subsystem.profilePeaks || {}).forEach(([profile, value]) => {
      if (Number.isFinite(value)) signature[`${subsystem.key}:${profile}:peak`] = value;
    });
  });
  return signature;
}

function assignFleetSignatureDistances(rows) {
  const keys = unique(rows.flatMap((row) => Object.keys(row.signature)));
  if (!keys.length) return;
  const medians = new Map();
  const scales = new Map();
  keys.forEach((key) => {
    const values = rows.map((row) => row.signature[key]).filter(Number.isFinite);
    if (values.length < 2) return;
    const median = fleetMedian(values);
    const mad = fleetMedian(values.map((value) => Math.abs(value - median)));
    medians.set(key, median);
    scales.set(key, Math.max(mad * 1.4826, Math.abs(median) * 0.08, 0.5));
  });

  rows.forEach((row) => {
    const distances = Object.entries(row.signature)
      .filter(([key, value]) => medians.has(key) && Number.isFinite(value))
      .map(([key, value]) => Math.abs(value - medians.get(key)) / scales.get(key));
    row.signatureDelta = distances.length
      ? distances.reduce((total, value) => total + value, 0) / distances.length
      : Number.NaN;
  });
}

function fleetMetricConfigs() {
  return [
    { key: "sampleAgeMs", label: "Freshness", formatter: sparkPairAgeLabel, lowerBetter: true, weight: 1.1, domain: [0, MACHINE_DEMO_FRESH_MS * 2], outlierLabel: "stale" },
    { key: "cpuUsagePct", label: "CPU", formatter: pct, lowerBetter: true, weight: 1.1, domain: [0, 95], outlierLabel: "cpu" },
    { key: "loadPressurePct", label: "Load/core", formatter: pct, lowerBetter: true, weight: 0.8, domain: [0, 120], outlierLabel: "load" },
    { key: "cpuTemperatureC", label: "CPU temp", formatter: fleetTemperatureLabel, lowerBetter: true, weight: 0.8, domain: [35, 85], outlierLabel: "thermal" },
    { key: "memoryUsedPct", label: "RAM used", formatter: pct, lowerBetter: true, weight: 1, domain: [0, 95], outlierLabel: "ram" },
    { key: "diskUsedPct", label: "Disk used", formatter: pct, lowerBetter: true, weight: 0.8, domain: [0, 95], outlierLabel: "disk" },
    { key: "networkIssueCount", label: "Net issues", formatter: (value) => number.format(value), lowerBetter: true, weight: 0.9, domain: [0, 10], outlierLabel: "net" },
    { key: "cpuCount", label: "CPU cores", formatter: (value) => number.format(value), higherBetter: true, weight: 0.7, relative: true },
    { key: "memoryTotalBytes", label: "RAM total", formatter: formatBytes, higherBetter: true, weight: 0.75, relative: true },
    { key: "diskTotalBytes", label: "Disk total", formatter: formatBytes, higherBetter: true, weight: 0.55, relative: true },
    { key: "networkLinkSpeedMbps", label: "Link speed", formatter: fleetMbpsLabel, higherBetter: true, weight: 0.6, relative: true },
    { key: "networkThroughputBps", label: "Net activity", formatter: formatBytesPerSecond, higherBetter: true, weight: 0.25, relative: true },
    { key: "benchmarkScore", label: "Bench score", formatter: fleetBenchmarkScoreLabel, higherBetter: true, weight: 0.9, relative: true, outlierLabel: "bench" },
    { key: "benchmarkCpuOpsPerSecond", label: "CPU bench", formatter: fleetOpsLabel, higherBetter: true, weight: 0.7, relative: true, outlierLabel: "cpu-bench" },
    { key: "benchmarkMemoryMiBps", label: "Memory bench", formatter: fleetMibPerSecondLabel, higherBetter: true, weight: 0.65, relative: true, outlierLabel: "mem-bench" },
    { key: "benchmarkDiskWriteMiBps", label: "Disk write", formatter: fleetMibPerSecondLabel, higherBetter: true, weight: 0.45, relative: true, outlierLabel: "disk-bench" },
    { key: "benchmarkDiskReadMiBps", label: "Disk read", formatter: fleetMibPerSecondLabel, higherBetter: true, weight: 0.45, relative: true, outlierLabel: "disk-bench" },
    { key: "signatureDelta", label: "ID signature", formatter: fleetSignatureLabel, lowerBetter: true, weight: 0.8, domain: [0, 4], outlierLabel: "signature" }
  ];
}

function fleetMetricSpread(config, rows) {
  const samples = rows
    .map((row) => ({ row, value: numeric(row[config.key], Number.NaN) }))
    .filter((item) => Number.isFinite(item.value));
  if (!samples.length) return null;

  const values = samples.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const median = fleetMedian(values);
  const mad = fleetMedian(values.map((value) => Math.abs(value - median)));
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const stdev = Math.sqrt(values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length);
  const cv = Math.abs(mean) > 0.0001 ? stdev / Math.abs(mean) : 0;
  const outlierFloor = Math.max(mad * 3.5, Math.abs(median) * 0.25, fleetMetricDomainWidth(config) * 0.12);
  const outliers = samples.filter((item) => Math.abs(item.value - median) > outlierFloor);
  outliers.forEach((item) => {
    item.row.outlierCount += 1;
    if (config.outlierLabel) item.row.outlierLabels.push(config.outlierLabel);
  });
  const best = samples.slice().sort((left, right) => fleetMetricPreferenceSort(config, left.value, right.value))[0];
  const worst = samples.slice().sort((left, right) => fleetMetricPreferenceSort(config, right.value, left.value))[0];

  return {
    key: config.key,
    label: config.label,
    min,
    median,
    max,
    cv,
    outlierCount: outliers.length,
    formatter: config.formatter,
    bestHost: best?.row?.host || "",
    worstHost: worst?.row?.host || "",
    tone: outliers.length > Math.max(1, rows.length * 0.25) || cv > 0.65 ? "poor" : outliers.length || cv > 0.28 ? "watch" : "good"
  };
}

function assignFleetScores(rows, metricConfigs) {
  const relativeRanges = new Map();
  metricConfigs.filter((config) => config.relative).forEach((config) => {
    const values = rows.map((row) => numeric(row[config.key], Number.NaN)).filter(Number.isFinite);
    relativeRanges.set(config.key, {
      min: values.length ? Math.min(...values) : Number.NaN,
      max: values.length ? Math.max(...values) : Number.NaN
    });
  });

  rows.forEach((row) => {
    const scores = [];
    metricConfigs.forEach((config) => {
      const value = numeric(row[config.key], Number.NaN);
      if (!Number.isFinite(value)) return;
      let score = null;
      if (config.relative) {
        const range = relativeRanges.get(config.key) || {};
        score = fleetRelativeScore(value, range.min, range.max, config.higherBetter);
      } else if (config.lowerBetter) {
        const [best, worst] = config.domain || [0, 100];
        score = clamp(100 - ((value - best) / Math.max(1, worst - best)) * 100);
      } else if (config.higherBetter) {
        const [worst, best] = config.domain || [0, 100];
        score = clamp(((value - worst) / Math.max(1, best - worst)) * 100);
      }
      if (Number.isFinite(score)) scores.push({ score, weight: config.weight || 1 });
    });
    const totalWeight = scores.reduce((total, item) => total + item.weight, 0);
    row.score = totalWeight ? scores.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight : 0;
    row.outlierLabels = unique(row.outlierLabels).slice(0, 4);
    row.tone = row.score >= 74 && row.outlierCount === 0 ? "good" : row.score >= 50 && row.outlierCount <= 2 ? "watch" : "poor";
  });
}

function fleetComparisonSummaries(rows, spreadRows, counts) {
  const fresh = rows.filter((row) => Number.isFinite(row.sampleAgeMs) && row.sampleAgeMs <= MACHINE_DEMO_FRESH_MS).length;
  const top = rows[0];
  const widest = spreadRows.slice().sort((left, right) => right.cv - left.cv)[0];
  const piCount = rows.filter((row) => /^pi\d+$/i.test(row.host)).length;
  const benchmarkRows = rows.filter(fleetBenchmarkAvailable);
  const freshBenchmarks = benchmarkRows.filter((row) => {
    if (!Number.isFinite(row.benchmarkSampleAgeMs)) return true;
    const ttl = Number.isFinite(row.benchmarkTtlMs) && row.benchmarkTtlMs > 0 ? row.benchmarkTtlMs : 15 * 60 * 1000;
    return row.benchmarkSampleAgeMs <= ttl;
  }).length;
  return [
    {
      label: "Hosts",
      value: `${rows.length}`,
      note: piCount ? `${piCount} Raspberry Pi hosts` : `${fresh} fresh samples`,
      tone: fresh === rows.length ? "good" : fresh >= rows.length * 0.75 ? "watch" : "poor"
    },
    {
      label: "Fresh",
      value: `${fresh}/${rows.length}`,
      note: counts.staleCount ? `${counts.staleCount} stale` : "live bundle current",
      tone: counts.staleCount ? counts.staleCount > rows.length * 0.25 ? "poor" : "watch" : "good"
    },
    {
      label: "Top rank",
      value: top ? top.host : "--",
      note: top ? `${round(top.score)} composite` : "no rank",
      tone: top?.tone || "watch"
    },
    {
      label: "Outliers",
      value: `${counts.outlierCount}`,
      note: widest ? `${widest.label} CV ${formatDecimal(widest.cv, 2)}` : "spread learning",
      tone: counts.outlierCount ? counts.outlierCount > rows.length * 0.25 ? "poor" : "watch" : "good"
    },
    {
      label: "Benchmarks",
      value: `${counts.benchmarkCount}/${piCount || rows.length}`,
      note: benchmarkRows.length ? `${freshBenchmarks} fresh periodic suites` : "waiting for Pi benchmark suites",
      tone: benchmarkRows.length >= Math.max(1, piCount) ? "good" : benchmarkRows.length ? "watch" : "poor"
    },
    {
      label: "Fingerprints",
      value: `${counts.fingerprintCount}/${rows.length}`,
      note: "system-ID signature rows",
      tone: counts.fingerprintCount >= rows.length ? "good" : counts.fingerprintCount ? "watch" : "poor"
    }
  ];
}

function fleetBenchmarkMetricConfigs() {
  return [
    { key: "benchmarkCpuOpsPerSecond", label: "CPU scalar", formatter: fleetOpsLabel },
    { key: "benchmarkMemoryMiBps", label: "Memory fill", formatter: fleetMibPerSecondLabel },
    { key: "benchmarkDiskWriteMiBps", label: "Disk write", formatter: fleetMibPerSecondLabel },
    { key: "benchmarkDiskReadMiBps", label: "Disk read", formatter: fleetMibPerSecondLabel },
    { key: "benchmarkScore", label: "Composite", formatter: fleetBenchmarkScoreLabel }
  ];
}

function fleetBenchmarkHistogram(config, rows) {
  const samples = rows
    .map((row) => ({ row, value: numeric(row[config.key], Number.NaN) }))
    .filter((sample) => Number.isFinite(sample.value) && sample.value >= 0);

  const values = samples.map((sample) => sample.value);
  const min = values.length ? Math.min(...values) : Number.NaN;
  const max = values.length ? Math.max(...values) : Number.NaN;
  const median = values.length ? fleetMedian(values) : Number.NaN;
  const sortedByValue = samples.slice().sort((left, right) => right.value - left.value || fleetNaturalLabel(left.row.host).localeCompare(fleetNaturalLabel(right.row.host), undefined, { numeric: true }));
  const best = sortedByValue[0];
  const denominator = Math.max(Number.isFinite(max) ? max : 0, 1);

  return {
    key: config.key,
    label: config.label,
    min,
    max,
    median,
    bestHost: best?.row?.host || "",
    sampleCount: samples.length,
    pendingCount: Math.max(0, rows.length - samples.length),
    formatter: config.formatter,
    bars: rows.map((row) => {
      const value = numeric(row[config.key], Number.NaN);
      const hasValue = Number.isFinite(value) && value >= 0;
      return {
        host: row.host,
        value,
        label: hasValue ? config.formatter(value) : "--",
        percent: hasValue ? clamp((value / denominator) * 100, 4, 100) : 0,
        status: row.benchmarkSuiteStatus || "waiting",
        age: fleetBenchmarkAgeLabel(row),
        available: hasValue
      };
    })
  };
}

function fleetBenchmarkAvailable(row) {
  return ["fresh", "cached", "stale"].includes(String(row.benchmarkSuiteStatus || ""))
    && [
      row.benchmarkCpuOpsPerSecond,
      row.benchmarkMemoryMiBps,
      row.benchmarkDiskWriteMiBps,
      row.benchmarkDiskReadMiBps,
      row.benchmarkScore
    ].some((value) => Number.isFinite(value));
}

function fleetBenchmarkCompositeScore(machineContext) {
  const cpu = numeric(machineContext.benchmarkCpuOpsPerSecond, 0);
  const memory = numeric(machineContext.benchmarkMemoryMiBps, 0);
  const write = numeric(machineContext.benchmarkDiskWriteMiBps, 0);
  const read = numeric(machineContext.benchmarkDiskReadMiBps, 0);
  if (![cpu, memory, write, read].some((value) => value > 0)) {
    return numeric(machineContext.benchmarkScore, Number.NaN);
  }
  return clamp(
    (cpu / 500_000_000) * 35
    + (memory / 8000) * 25
    + (write / 180) * 18
    + (read / 1800) * 22,
    0,
    100
  );
}

function fleetBenchmarkAgeLabel(row) {
  if (Number.isFinite(row.benchmarkSampleAgeMs)) return sparkPairAgeLabel(row.benchmarkSampleAgeMs);
  const generatedAt = row.benchmarkGeneratedAt ? safeDate(row.benchmarkGeneratedAt, null) : null;
  return generatedAt ? sparkPairAgeLabel(Math.max(0, Date.now() - generatedAt.getTime())) : "waiting";
}

function fleetMetricPreferenceSort(config, leftValue, rightValue) {
  return config.lowerBetter ? leftValue - rightValue : rightValue - leftValue;
}

function fleetMetricDomainWidth(config) {
  if (!config.domain) return 1;
  return Math.max(1, Math.abs(config.domain[1] - config.domain[0]));
}

function fleetRelativeScore(value, min, max, higherBetter) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max === min) return 82;
  const ratio = (value - min) / (max - min);
  return clamp((higherBetter ? ratio : 1 - ratio) * 100);
}

function fleetMedian(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fleetTemperatureLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${formatDecimal(value, 1)} C` : "--";
}

function fleetMbpsLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${compactNumber.format(value)} Mbps` : "--";
}

function fleetOpsLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${compactNumber.format(value)} ops/s` : "--";
}

function fleetMibPerSecondLabel(value) {
  return Number.isFinite(value) && value > 0 ? `${formatDecimal(value, value >= 100 ? 0 : 1)} MiB/s` : "--";
}

function fleetBenchmarkScoreLabel(value) {
  return Number.isFinite(value) ? `${formatDecimal(value, 1)}` : "--";
}

function fleetSignatureLabel(value) {
  return Number.isFinite(value) ? formatDecimal(value, 2) : "--";
}

function selectSparkPairContexts(contexts) {
  const spark1 = contexts.find((context) => sparkPairHostRole(context) === "SPARK1");
  const spark2 = contexts.find((context) => sparkPairHostRole(context) === "SPARK2");
  if (spark1 && spark2) return [spark1, spark2];
  if (spark1) return [spark1, contexts.find((context) => context !== spark1)].filter(Boolean);
  if (spark2) return [contexts.find((context) => context !== spark2), spark2].filter(Boolean);
  return contexts.slice(0, 2);
}

function sparkPairContextRank(context) {
  const role = sparkPairHostRole(context);
  if (role === "SPARK1") return 1;
  if (role === "SPARK2") return 2;
  return 10;
}

function sparkPairHostRole(machineContext) {
  const context = machineContext?.context || {};
  const text = [
    machineContext?.host,
    context.hostname,
    context.node,
    context.hostUrl,
    context.networkLocalAddress,
    context.ncclRuntimeHostIp
  ].filter(Boolean).join(" ").toLowerCase();

  if (/(^|[^a-z0-9])spark[ -]?1([^a-z0-9]|$)|192\.168\.10\.20|192\.168\.100\.10/.test(text)) return "SPARK1";
  if (/(^|[^a-z0-9])spark[ -]?2([^a-z0-9]|$)|192\.168\.10\.21|192\.168\.100\.11/.test(text)) return "SPARK2";
  return "";
}

function sparkPairHostLabel(machineContext, fallback) {
  return sparkPairHostRole(machineContext) || machineContext?.host || fallback;
}

function sparkPairClockSyncMetric(left, right) {
  const leftText = sparkPairClockStateLabel(left);
  const rightText = sparkPairClockStateLabel(right);
  const bothPtp = left.clockPtpActive && right.clockPtpActive;
  const bothSynced = left.clockSynchronized && right.clockSynchronized;
  const oneSynced = left.clockSynchronized || right.clockSynchronized;
  const tone = bothPtp && bothSynced ? "good" : bothSynced ? "watch" : oneSynced ? "poor" : "poor";
  return {
    id: "clock-sync",
    label: "Clock sync",
    leftText,
    rightText,
    leftDetail: sparkPairClockDetail(left),
    rightDetail: sparkPairClockDetail(right),
    deltaLabel: bothPtp && bothSynced ? "PTP" : bothSynced ? "synced" : oneSynced ? "partial" : "unsynced",
    deltaTitle: "Clock discipline source",
    note: "PTP/chrony/timesync discipline",
    tone,
    leftPercent: left.clockSynchronized ? 100 : 0,
    rightPercent: right.clockSynchronized ? 100 : 0
  };
}

function recordSparkPairClockSample(left, right) {
  const leftTime = sparkPairGeneratedAtMs(left);
  const rightTime = sparkPairGeneratedAtMs(right);
  const leftOffsetNs = numeric(left.clockOffsetNs, Number.NaN);
  const rightOffsetNs = numeric(right.clockOffsetNs, Number.NaN);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return sparkPairClockHistory;
  const timestampMs = Math.max(leftTime, rightTime);
  const last = sparkPairClockHistory[sparkPairClockHistory.length - 1];
  if (last && last.timestampMs === timestampMs && last.leftGeneratedAtMs === leftTime && last.rightGeneratedAtMs === rightTime) {
    return sparkPairClockHistory;
  }

  sparkPairClockHistory.push({
    timestampMs,
    leftGeneratedAtMs: leftTime,
    rightGeneratedAtMs: rightTime,
    label: new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    leftOffsetNs,
    rightOffsetNs,
    offsetDeltaNs: Number.isFinite(leftOffsetNs) && Number.isFinite(rightOffsetNs)
      ? leftOffsetNs - rightOffsetNs
      : Number.NaN,
    sampleSkewMs: Math.abs(leftTime - rightTime),
    leftSource: left.clockSource || "",
    rightSource: right.clockSource || "",
    leftPtp: Boolean(left.clockPtpActive),
    rightPtp: Boolean(right.clockPtpActive)
  });

  if (sparkPairClockHistory.length > SPARK_PAIR_CLOCK_HISTORY_LIMIT) {
    sparkPairClockHistory = sparkPairClockHistory.slice(-SPARK_PAIR_CLOCK_HISTORY_LIMIT);
  }
  return sparkPairClockHistory;
}

function sparkPairClockContextFromFeedSample(sample) {
  const context = {
    generatedAt: sample.generatedAt || "",
    hostname: sample.hostname || sample.role || "",
    clockSource: sample.clockSource || "",
    clockSynchronized: Boolean(sample.clockSynchronized),
    clockOffsetNs: sample.clockOffsetNs,
    clockPtpActive: Boolean(sample.clockPtpActive),
    clockPtpPortState: sample.clockPtpPortState || "",
    clockPtpGrandmaster: sample.clockPtpGrandmaster || "",
    clockChronyReference: sample.clockChronyReference || "",
    clockTimezone: sample.clockTimezone || "",
    clockSyncDetail: sample.clockSyncDetail || ""
  };
  return {
    host: sample.role || sample.hostname || "",
    context,
    clockSource: String(sample.clockSource || ""),
    clockSynchronized: Boolean(sample.clockSynchronized),
    clockTimeUnixMs: numeric(sample.clockTimeUnixMs, Number.NaN),
    clockTimeUnixNs: String(sample.clockTimeUnixNs || ""),
    clockTimezone: String(sample.clockTimezone || ""),
    clockOffsetNs: numeric(sample.clockOffsetNs, Number.NaN),
    clockPtpInstalled: Boolean(sample.clockPtpInstalled),
    clockPtpActive: Boolean(sample.clockPtpActive),
    clockPtpPortState: String(sample.clockPtpPortState || ""),
    clockPtpGrandmaster: String(sample.clockPtpGrandmaster || ""),
    clockChronyReference: String(sample.clockChronyReference || ""),
    clockSyncDetail: String(sample.clockSyncDetail || "")
  };
}

function refreshSparkPairClockMetricRows(left, right) {
  const panel = document.querySelector("#sparkPairComparePanel");
  if (!panel) return;
  [
    sparkPairClockSyncMetric(left, right),
    sparkPairSampleSkewMetric(left, right),
    sparkPairClockOffsetMetric(left, right)
  ].filter(Boolean).forEach((rowData) => {
    const current = panel.querySelector(`.spark-pair-row[data-metric="${rowData.id}"]`);
    if (current) current.replaceWith(sparkPairMetricRow(rowData));
  });
}

function sparkPairClockOffsetMetric(left, right) {
  return sparkPairNumericMetric({
    id: "clock-offset",
    label: "Clock offset",
    leftValue: left.clockOffsetNs,
    rightValue: right.clockOffsetNs,
    formatter: sparkPairClockOffsetLabel,
    deltaFormatter: (_delta, absDelta) => sparkPairClockOffsetLabel(absDelta),
    note: "Clock-source offset; PTP/chrony when available",
    watchDelta: 100_000,
    poorDelta: 1_000_000,
    maxValue: Math.max(1_000_000, Math.abs(numeric(left.clockOffsetNs, 0)), Math.abs(numeric(right.clockOffsetNs, 0))),
    includeWhen: Number.isFinite(left.clockOffsetNs) || Number.isFinite(right.clockOffsetNs)
  });
}

function sparkPairSampleSkewMetric(left, right) {
  const leftTime = sparkPairGeneratedAtMs(left);
  const rightTime = sparkPairGeneratedAtMs(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null;
  const skewMs = Math.abs(leftTime - rightTime);
  return {
    id: "clock-sample-skew",
    label: "Sample skew",
    leftText: sparkPairClockTimeLabel(leftTime),
    rightText: sparkPairClockTimeLabel(rightTime),
    leftDetail: sparkPairClockDetail(left),
    rightDetail: sparkPairClockDetail(right),
    deltaLabel: sparkPairAgeLabel(skewMs),
    deltaTitle: "SPARK1/SPARK2 host sample timestamp difference",
    note: "PTP makes sub-second comparisons safer",
    tone: skewMs <= 1000 ? "good" : skewMs <= 5000 ? "watch" : "poor",
    leftPercent: null,
    rightPercent: null
  };
}

function sparkPairGeneratedAtMs(machineContext) {
  const generatedAt = machineContext?.context?.generatedAt ? safeDate(machineContext.context.generatedAt, null) : null;
  return generatedAt ? generatedAt.getTime() : Number.NaN;
}

function sparkPairClockStateLabel(machineContext) {
  if (machineContext.clockPtpActive) return machineContext.clockSynchronized ? "PTP synced" : "PTP active";
  if (machineContext.clockSynchronized) return machineContext.clockSource ? `${machineContext.clockSource} synced` : "synced";
  if (machineContext.clockPtpInstalled) return "PTP inactive";
  return machineContext.clockSource === "unsynchronized" ? "unsynced" : "not observed";
}

function sparkPairClockDetail(machineContext) {
  const bits = [];
  if (machineContext.clockPtpGrandmaster) bits.push(`GM ${machineContext.clockPtpGrandmaster}`);
  if (machineContext.clockPtpPortState) bits.push(machineContext.clockPtpPortState);
  if (machineContext.clockChronyReference) bits.push(machineContext.clockChronyReference);
  if (Number.isFinite(machineContext.clockOffsetNs)) bits.push(sparkPairClockOffsetLabel(machineContext.clockOffsetNs));
  if (machineContext.clockTimezone) bits.push(machineContext.clockTimezone);
  return bits.join(" | ") || machineContext.clockSyncDetail || "clock telemetry";
}

function sparkPairClockPairNote(left, right) {
  return `${sparkPairClockStateLabel(left)} | ${sparkPairClockStateLabel(right)}`;
}

function sparkPairClockOffsetLabel(value) {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${formatDecimal(abs / 1_000_000, 2)}ms`;
  if (abs >= 1000) return `${sign}${formatDecimal(abs / 1000, 1)}us`;
  return `${sign}${round(abs)}ns`;
}

function sparkPairClockTimeLabel(valueMs) {
  if (!Number.isFinite(valueMs)) return "--";
  return new Date(valueMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function sparkPairPercentMetric(id, label, leftValue, rightValue, note, watchDelta, poorDelta, includeWhen = true) {
  return sparkPairNumericMetric({
    id,
    label,
    leftValue,
    rightValue,
    formatter: pct,
    deltaFormatter: (delta) => sparkPairSignedDelta(delta, "pp"),
    note,
    watchDelta,
    poorDelta,
    maxValue: 100,
    includeWhen
  });
}

function sparkPairThroughputMetric(id, label, leftValue, rightValue, note) {
  const maxValue = Math.max(1, numeric(leftValue), numeric(rightValue));
  return sparkPairNumericMetric({
    id,
    label,
    leftValue,
    rightValue,
    formatter: (value) => Number.isFinite(value) && value > 0 ? formatBytesPerSecond(value) : "--",
    deltaFormatter: (delta, absDelta) => `${delta >= 0 ? "+" : "-"}${formatBytesPerSecond(absDelta)}`,
    note,
    maxValue,
    toneFn: sparkPairRelativeSkewTone,
    includeWhen: Number.isFinite(leftValue) || Number.isFinite(rightValue)
  });
}

function sparkPairNumericMetric(options) {
  if (options.includeWhen === false) return null;

  const leftValue = numeric(options.leftValue, Number.NaN);
  const rightValue = numeric(options.rightValue, Number.NaN);
  const leftFinite = Number.isFinite(leftValue);
  const rightFinite = Number.isFinite(rightValue);
  const bothFinite = leftFinite && rightFinite;
  const delta = bothFinite ? leftValue - rightValue : Number.NaN;
  const absDelta = bothFinite ? Math.abs(delta) : Number.NaN;
  const maxValue = Number.isFinite(options.maxValue) && options.maxValue > 0
    ? options.maxValue
    : Math.max(1, leftFinite ? Math.abs(leftValue) : 0, rightFinite ? Math.abs(rightValue) : 0);
  const formatter = options.formatter || ((value) => String(value));
  const deltaFormatter = options.deltaFormatter || ((value) => sparkPairSignedDelta(value, ""));
  const tone = typeof options.toneFn === "function"
    ? options.toneFn(leftValue, rightValue, absDelta)
    : bothFinite
      ? sparkPairDeltaTone(absDelta, options.watchDelta, options.poorDelta)
      : leftFinite || rightFinite ? "poor" : "watch";

  return {
    id: options.id,
    label: options.label,
    leftText: leftFinite ? formatter(leftValue) : "--",
    rightText: rightFinite ? formatter(rightValue) : "--",
    leftDetail: options.leftDetail || "",
    rightDetail: options.rightDetail || "",
    deltaLabel: bothFinite ? deltaFormatter(delta, absDelta) : "missing",
    deltaTitle: bothFinite ? "SPARK1 - SPARK2" : "One side is missing",
    note: options.note,
    tone,
    leftPercent: leftFinite ? clamp((leftValue / maxValue) * 100) : null,
    rightPercent: rightFinite ? clamp((rightValue / maxValue) * 100) : null
  };
}

function sparkPairCategoryMetric(options) {
  if (options.includeWhen === false) return null;
  const leftText = String(options.leftValue || "--");
  const rightText = String(options.rightValue || "--");
  return {
    id: options.id,
    label: options.label,
    leftText,
    rightText,
    leftDetail: options.leftDetail || "",
    rightDetail: options.rightDetail || "",
    deltaLabel: leftText === rightText ? "match" : "diff",
    deltaTitle: "Categorical parity",
    note: options.note,
    tone: options.tone || (leftText === rightText ? "good" : "watch"),
    leftPercent: null,
    rightPercent: null
  };
}

function sparkPairDeltaTone(absDelta, watchDelta = 10, poorDelta = 25) {
  if (!Number.isFinite(absDelta)) return "watch";
  if (absDelta >= poorDelta) return "poor";
  if (absDelta >= watchDelta) return "watch";
  return "good";
}

function sparkPairRelativeSkewTone(leftValue, rightValue, absDelta) {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return Number.isFinite(leftValue) || Number.isFinite(rightValue) ? "poor" : "watch";
  const maxValue = Math.max(Math.abs(leftValue), Math.abs(rightValue), 1);
  const ratio = absDelta / maxValue;
  if (ratio >= 0.5) return "poor";
  if (ratio >= 0.2) return "watch";
  return "good";
}

function sparkPairSignedDelta(delta, suffix, digits = 1) {
  if (!Number.isFinite(delta)) return "--";
  return `${delta >= 0 ? "+" : ""}${formatDecimal(delta, digits)}${suffix}`;
}

function sparkPairAbsDelta(leftValue, rightValue) {
  const leftNumber = numeric(leftValue, Number.NaN);
  const rightNumber = numeric(rightValue, Number.NaN);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? Math.abs(leftNumber - rightNumber) : Number.NaN;
}

function sparkPairDeltaLabel(value, suffix) {
  return Number.isFinite(value) ? `${formatDecimal(value, 1)}${suffix}` : "--";
}

function sparkPairThroughputDeltaLabel(value) {
  return Number.isFinite(value) ? formatBytesPerSecond(value) : "--";
}

function sparkPairSampleAgeMilliseconds(machineContext) {
  const generatedAt = machineContext?.context?.generatedAt ? safeDate(machineContext.context.generatedAt, null) : null;
  return generatedAt ? Math.max(0, Date.now() - generatedAt.getTime()) : Number.NaN;
}

function sparkPairAgeLabel(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "--";
  if (milliseconds < 1000) return `${round(milliseconds)}ms`;
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function sparkPairDockerCpuPct(machineContext) {
  return (machineContext?.dockerContainers || []).reduce((total, container) => total + numeric(container.cpuPct), 0);
}

function sparkPairNetworkNote(left, right) {
  const leftIface = left.networkInterface || "iface n/a";
  const rightIface = right.networkInterface || "iface n/a";
  const leftLink = Number.isFinite(left.networkLinkSpeedMbps) && left.networkLinkSpeedMbps > 0 ? `${compactNumber.format(left.networkLinkSpeedMbps)} Mbps` : "speed n/a";
  const rightLink = Number.isFinite(right.networkLinkSpeedMbps) && right.networkLinkSpeedMbps > 0 ? `${compactNumber.format(right.networkLinkSpeedMbps)} Mbps` : "speed n/a";
  return `${leftIface} ${leftLink} | ${rightIface} ${rightLink}`;
}

function sparkPairOllamaModelLabel(machineContext) {
  return machineContext.ollamaProbeModel || machineContext.ollamaRunningModels[0] || `${machineContext.modelCount} local`;
}

function unitEconomicsSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "unit-economics-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function unitEconomicsCard(row) {
  const card = document.createElement("article");
  card.className = "unit-economics-card";
  card.dataset.tone = row.tone;

  const head = document.createElement("div");
  head.className = "unit-economics-card-head";
  const title = document.createElement("div");
  const host = document.createElement("strong");
  host.textContent = row.host;
  const model = document.createElement("small");
  model.textContent = row.gpuPresent
    ? `${row.gpuCount || 1}x ${row.gpuModel || "GPU"}`
    : row.gpuModel || "host-only unit";
  title.append(host, model);
  const profit = document.createElement("span");
  profit.className = "unit-economics-profit";
  profit.textContent = unitEconomicsSignedMoneyPerHour(row.profitPerHour);
  head.append(title, profit);

  const graph = buildUnitEconomicsGraph(row);
  const legend = document.createElement("div");
  legend.className = "unit-economics-legend";
  [
    ["revenue", "Revenue"],
    ["cost", "OPEX + depreciation"],
    ["profit", "Profit/loss"]
  ].forEach(([series, label]) => {
    const item = document.createElement("span");
    item.dataset.series = series;
    item.textContent = label;
    legend.append(item);
  });

  const metrics = document.createElement("div");
  metrics.className = "unit-economics-metrics";
  [
    ["Utilization", pct(row.utilizationPct), Number.isFinite(row.breakEvenUtilizationPct) ? `break-even ${pct(row.breakEvenUtilizationPct)}` : "break-even n/a"],
    ["CAPEX", currency.format(row.capexUsd), row.capexSource],
    ["Book value", currency.format(row.bookValueUsd), `${formatDecimal(row.ageHours / UNIT_ECONOMICS_HOURS_PER_YEAR, 1)} of ${formatDecimal(row.usefulLifeYears, 1)} yr`],
    ["Depreciation", unitEconomicsMoneyPerHour(row.depreciationPerHour), "straight-line"],
    ["OPEX", unitEconomicsMoneyPerHour(row.opexPerHour), row.opexSource],
    ["Revenue", unitEconomicsMoneyPerHour(row.revenuePerHour), row.revenueSource]
  ].forEach(([label, value, note]) => {
    metrics.append(unitEconomicsMetricCell(label, value, note));
  });

  const note = document.createElement("small");
  note.className = "unit-economics-note";
  note.textContent = `${row.powerSource}; ${row.ageSource}; ${unitEconomicsMoneyPerHour(row.unitRateUsdPerHour).replace("/hr", row.gpuPresent ? "/GPU-hr" : "/host-hr")}`;

  card.append(head, graph, legend, metrics, note);
  return card;
}

function unitEconomicsMetricCell(label, value, note) {
  const cell = document.createElement("span");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const em = document.createElement("em");
  em.textContent = note;
  cell.append(small, strong, em);
  return cell;
}

function unitEconomicsMoneyPerHour(value) {
  return `${hourlyCurrency.format(Math.max(0, numeric(value, 0)))}/hr`;
}

function unitEconomicsSignedMoneyPerHour(value) {
  const amount = numeric(value, 0);
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${prefix}${hourlyCurrency.format(Math.abs(amount))}/hr`;
}

function fleetBenchmarkHistogramSection(comparison, benchmarkGrid) {
  const piRows = comparison.rows.filter(isPiFleetRow);
  if (piRows.length < 2 && !comparison.benchmarkHistograms?.length) return null;

  const section = document.createElement("div");
  section.className = "fleet-benchmark-section";

  const head = document.createElement("div");
  head.className = "fleet-benchmark-section-head";
  const title = document.createElement("strong");
  title.textContent = "Pi Benchmark Histograms";
  const meta = document.createElement("small");
  const benchmarkRows = piRows.filter(fleetBenchmarkAvailable);
  const pending = Math.max(0, piRows.length - benchmarkRows.length);
  meta.textContent = piRows.length
    ? `${benchmarkRows.length}/${piRows.length} suites${pending ? ` | ${pending} pending` : ""}`
    : "waiting for Pi hosts";
  head.append(title, meta);

  if (!benchmarkGrid.children.length) {
    const empty = document.createElement("div");
    empty.className = "fleet-benchmark-empty";
    empty.textContent = piRows.length ? "Waiting for periodic benchmark samples." : "Waiting for Pi fleet samples.";
    benchmarkGrid.append(empty);
  }

  section.append(head, benchmarkGrid);
  return section;
}

function isPiFleetRow(row) {
  return /^pi(?:[1-9]|1[0-2])$/i.test(String(row?.host || ""));
}

function fleetComparisonHeader(labels, rowClass) {
  const row = document.createElement("div");
  row.className = `${rowClass} fleet-comparison-head`;
  labels.forEach((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    row.append(cell);
  });
  return row;
}

function fleetComparisonSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "fleet-comparison-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function benchmarkLadderSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "benchmark-ladder-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function benchmarkMetricCard(metric) {
  const node = document.createElement("div");
  node.className = "benchmark-metric-card";
  node.dataset.status = metric.status;
  const head = document.createElement("div");
  head.className = "benchmark-metric-head";
  const label = document.createElement("span");
  label.textContent = metric.label;
  const status = document.createElement("small");
  status.textContent = metric.status;
  head.append(label, status);

  const value = document.createElement("strong");
  value.textContent = metric.valueLabel;
  const detail = document.createElement("small");
  detail.textContent = Number.isFinite(metric.ratio)
    ? `${signedPercent((metric.ratio - 1) * 100)} vs peer median`
    : metric.detail;

  const bar = document.createElement("span");
  bar.className = "benchmark-metric-bar";
  const fill = document.createElement("i");
  fill.style.width = `${Number.isFinite(metric.ratio) ? clamp(metric.ratio * 50, 4, 100) : metric.available ? 58 : 6}%`;
  bar.append(fill);

  node.append(head, value, detail, bar);
  return node;
}

function benchmarkLadderHeader() {
  const row = document.createElement("div");
  row.className = "benchmark-ladder-row benchmark-ladder-head";
  ["Level", "Scope", "Result", "Signal"].forEach((text) => {
    const cell = document.createElement("span");
    cell.textContent = text;
    row.append(cell);
  });
  return row;
}

function benchmarkLadderRow(level) {
  const row = document.createElement("div");
  row.className = "benchmark-ladder-row";
  row.dataset.tone = level.tone;
  row.dataset.status = level.status;
  row.append(
    benchmarkLadderCell(`L${level.level}`, level.label),
    benchmarkLadderCell(level.scope, level.confidence || level.status),
    benchmarkLadderScoreCell(level.value, level.score),
    benchmarkLadderCell(level.detail, level.status)
  );
  return row;
}

function benchmarkLadderCell(value, detail = "") {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }
  return cell;
}

function benchmarkLadderScoreCell(value, score) {
  const cell = benchmarkLadderCell(value, "comparison index");
  const bar = document.createElement("span");
  bar.className = "benchmark-ladder-score-bar";
  const fill = document.createElement("i");
  fill.style.width = `${clamp(score)}%`;
  bar.append(fill);
  cell.append(bar);
  return cell;
}

function benchmarkSourceLink(source) {
  const link = document.createElement("a");
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const strong = document.createElement("strong");
  strong.textContent = source.label;
  const small = document.createElement("small");
  small.textContent = source.note;
  link.append(strong, small);
  return link;
}

function benchmarkOcpCommonsPanel(profile = {}) {
  const node = document.createElement("div");
  node.className = "benchmark-ocp-commons";

  const head = document.createElement("div");
  head.className = "benchmark-ocp-commons-head";
  const title = document.createElement("strong");
  title.textContent = "L6 OCP Benchmark Commons";
  const detail = document.createElement("small");
  detail.textContent = profile.hasImportedScore
    ? "member corpus comparison imported"
    : profile.submissionReady ? "redacted submission record ready" : "waiting for measured benchmark evidence";
  head.append(title, detail);

  node.append(
    head,
    benchmarkOcpCommonsItem("Corpus", profile.dataset || "proposed OCP corpus", Number.isFinite(profile.peerCount) ? `${round(profile.peerCount)} peer records` : "member aggregate"),
    benchmarkOcpCommonsItem("Hardware", profile.hardwareClass || "unclassified hardware", profile.configHash || "fingerprint pending"),
    benchmarkOcpCommonsItem("Qualification", profile.qualification?.status || "needs-review", profile.qualification?.thermalSummary || profile.qualification?.topologySummary || "thermal, topology, and process evidence gate"),
    benchmarkOcpCommonsItem("Binning", profile.binning || "pending corpus bin", `${profile.measuredMetricCount || 0}/${profile.metricCount || 0} measured metrics`),
    benchmarkOcpCommonsItem("Policy", profile.policy || "aggregate-anonymized", "no host identity in export record")
  );
  return node;
}

function benchmarkOcpCommonsItem(labelText, valueText, noteText) {
  const item = document.createElement("div");
  item.className = "benchmark-ocp-commons-item";
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("strong");
  value.textContent = valueText;
  const note = document.createElement("small");
  note.textContent = noteText;
  item.append(label, value, note);
  return item;
}

function fleetComparisonRankRow(rowData) {
  const row = document.createElement("div");
  row.className = "fleet-comparison-rank-row";
  row.dataset.tone = rowData.tone;

  row.append(
    fleetComparisonCell(`#${rowData.rank}`, rowData.outlierLabels.length ? rowData.outlierLabels.join(", ") : "in range"),
    fleetComparisonCell(rowData.host, fleetComparisonHostNote(rowData)),
    fleetComparisonScoreCell(rowData.score),
    fleetComparisonCell(
      `${pct(rowData.cpuUsagePct)} CPU`,
      `${pct(rowData.memoryUsedPct)} RAM | ${fleetTemperatureLabel(rowData.cpuTemperatureC)}`
    ),
    fleetComparisonCell(
      `${number.format(rowData.cpuCount)} cores`,
      `${formatBytes(rowData.memoryTotalBytes)} RAM | ${formatBytes(rowData.diskTotalBytes)} disk`
    ),
    fleetComparisonCell(
      fleetMbpsLabel(rowData.networkLinkSpeedMbps),
      `${formatBytesPerSecond(rowData.networkThroughputBps)} | ${number.format(rowData.networkIssueCount)} issues`
    ),
    fleetComparisonCell(
      fleetSignatureLabel(rowData.signatureDelta),
      rowData.signatureMetricCount ? `${rowData.signatureMetricCount} features` : "waiting"
    )
  );

  return row;
}

function fleetComparisonSpreadRow(rowData) {
  const row = document.createElement("div");
  row.className = "fleet-comparison-spread-row";
  row.dataset.tone = rowData.tone;
  const format = rowData.formatter || String;
  row.append(
    fleetComparisonCell(rowData.label, rowData.bestHost ? `best ${rowData.bestHost}` : ""),
    fleetComparisonCell(format(rowData.median), "median"),
    fleetComparisonCell(`${format(rowData.min)} - ${format(rowData.max)}`, rowData.worstHost ? `watch ${rowData.worstHost}` : ""),
    fleetComparisonCell(`CV ${formatDecimal(rowData.cv, 2)}`, "coefficient"),
    fleetComparisonCell(`${rowData.outlierCount}`, rowData.outlierCount ? "robust MAD" : "none")
  );
  return row;
}

function fleetComparisonCell(value, detail = "") {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }
  return cell;
}

function fleetComparisonScoreCell(score) {
  const cell = fleetComparisonCell(`${round(score)}`, "composite");
  const bar = document.createElement("span");
  bar.className = "fleet-comparison-score-bar";
  const fill = document.createElement("i");
  fill.style.width = `${clamp(score)}%`;
  bar.append(fill);
  cell.append(bar);
  return cell;
}

function fleetComparisonHostNote(rowData) {
  const bits = [];
  if (rowData.platform) bits.push(rowData.platform);
  if (rowData.cpuModel) bits.push(rowData.cpuModel.replace(/\s+/g, " ").slice(0, 42));
  if (Number.isFinite(rowData.sampleAgeMs)) bits.push(`${sparkPairAgeLabel(rowData.sampleAgeMs)} old`);
  return bits.join(" | ") || "live host";
}

function sparkPairSummaryItem(item) {
  const node = document.createElement("div");
  node.className = "spark-pair-summary-item";
  node.dataset.tone = item.tone;
  const label = document.createElement("span");
  label.textContent = item.label;
  const value = document.createElement("strong");
  value.textContent = item.value;
  const note = document.createElement("small");
  note.textContent = item.note;
  node.append(label, value, note);
  return node;
}

function sparkPairClockGraphCard({ label, history, series, formatter, values, empty }) {
  const card = document.createElement("div");
  card.className = "spark-pair-clock-card";
  const head = document.createElement("div");
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const latestText = document.createElement("strong");
  const latest = history[history.length - 1] || {};
  const firstSeries = series[0] || {};
  latestText.textContent = Number.isFinite(latest[firstSeries.key]) ? formatter(latest[firstSeries.key]) : "--";
  head.append(labelEl, latestText);

  const graph = buildSparkPairClockGraph(history, series, values, { empty });
  const note = document.createElement("small");
  const finiteValues = values.filter(Number.isFinite);
  note.textContent = finiteValues.length
    ? `range ${formatter(Math.min(...finiteValues))} to ${formatter(Math.max(...finiteValues))}`
    : empty;

  card.append(head, graph, note);
  return card;
}

function sparkPairMetricRow(rowData) {
  const row = document.createElement("div");
  row.className = "spark-pair-row";
  row.dataset.metric = rowData.id;
  row.dataset.tone = rowData.tone;

  const label = document.createElement("div");
  label.className = "spark-pair-label";
  const title = document.createElement("strong");
  title.textContent = rowData.label;
  const note = document.createElement("small");
  note.textContent = rowData.note || "";
  label.append(title, note);

  const left = sparkPairHostCell(rowData.leftText, rowData.leftPercent, rowData.leftDetail);
  const right = sparkPairHostCell(rowData.rightText, rowData.rightPercent, rowData.rightDetail);
  const delta = document.createElement("div");
  delta.className = "spark-pair-delta";
  delta.title = rowData.deltaTitle || "";
  const deltaValue = document.createElement("strong");
  deltaValue.textContent = rowData.deltaLabel;
  const deltaNote = document.createElement("small");
  deltaNote.textContent = rowData.deltaTitle || "Delta";
  delta.append(deltaValue, deltaNote);

  row.append(label, left, right, delta);
  return row;
}

function sparkPairHostCell(value, percent, detail) {
  const cell = document.createElement("div");
  cell.className = "spark-pair-host-cell";
  const strong = document.createElement("strong");
  strong.textContent = value;
  cell.append(strong);

  if (Number.isFinite(percent)) {
    const bar = document.createElement("span");
    bar.className = "spark-pair-bar";
    const fill = document.createElement("i");
    fill.style.width = `${clamp(percent)}%`;
    bar.append(fill);
    cell.append(bar);
  }

  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    cell.append(small);
  }

  return cell;
}

function setLaunchpadButtonFeedback(button, detail, message) {
  button.dataset.state = "done";
  detail.textContent = message;
}

function showManualCopyPrompt(label, text) {
  if (!text || typeof window.prompt !== "function") return;
  window.prompt(`${label}: copy this`, text);
}

function latestDate(values) {
  const dates = values
    .map((value) => value ? safeDate(value, null) : null)
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function liveTelemetrySamplesForHost(hostOrContext) {
  const hostKey = liveTelemetryHostKey(hostOrContext);
  if (!hostKey) return [];

  return liveTelemetryHistory
    .filter((sample) => (sample.hostKey || normalizeFleetHostId(sample.host)) === hostKey)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function liveTelemetryRetainedHostCount(history = liveTelemetryHistory) {
  return new Set((Array.isArray(history) ? history : [])
    .map((sample) => sample.hostKey || normalizeFleetHostId(sample.host))
    .filter(Boolean)).size;
}

function liveTelemetryHostKey(hostOrContext) {
  if (isPlainObject(hostOrContext)) {
    return fleetHostKey(hostOrContext);
  }

  return normalizeFleetHostId(hostOrContext);
}

function liveTelemetrySamplesForSummary(summary, machineContext = summary ? machineDemoContext(summary) : null) {
  if (summary?.isFleetAggregate) return liveTelemetryHistory.slice();
  if (machineContext) return liveTelemetrySamplesForHost(machineContext);
  return [];
}

function recordLiveTelemetrySamplesFromItems(items = []) {
  if (!Array.isArray(items) || !items.length) return;

  const samples = items
    .filter(isMachineDemoItem)
    .map(liveTelemetrySampleFromItem)
    .filter(Boolean);
  if (!samples.length) return;

  const nextHistory = normalizeLiveTelemetryStore([...liveTelemetryHistory, ...samples]);
  if (!liveTelemetryHistoryMatches(liveTelemetryHistory, nextHistory)) {
    liveTelemetryHistory = nextHistory;
    persistLiveTelemetryHistory({ force: true });
  }
}

function liveTelemetrySampleFromItem(item) {
  const context = item?.source?.context || {};
  if (!isPlainObject(context)) return null;

  const timestampMs = liveTelemetryTimestampMs(context);
  if (!Number.isFinite(timestampMs)) return null;

  const host = firstString([
    context.hostname,
    context.node,
    context.host,
    context.networkLocalAddress,
    item.cluster,
    item.name,
    item.id
  ]) || "host";
  const hostKey = normalizeFleetHostId(host);
  if (!hostKey) return null;

  const memoryTotal = numeric(context.memoryTotalBytes, Number.NaN);
  const memoryAvailable = numeric(context.memoryAvailableBytes, Number.NaN);
  const gpuPresent = context.gpuPresent === true
    || Boolean(context.gpuName)
    || Number.isFinite(numeric(context.gpuUtilizationPct, Number.NaN))
    || Number.isFinite(numeric(item.gpuUtil, Number.NaN));
  const gpuPower = numeric(context.gpuPowerWatts, Number.NaN);
  const gpuTemperature = numeric(context.gpuTemperatureC, Number.NaN);
  const networkThroughput = maxFinite(context.networkRxBytesPerSecond, context.networkTxBytesPerSecond);

  return {
    host,
    hostKey,
    timestampMs,
    label: new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cpu: clamp(numeric(context.cpuUsagePct, 0)),
    ram: clamp(numeric(context.memoryUsedPct, 0)),
    disk: clamp(numeric(context.diskUsedPct, 0)),
    dockerCpu: clamp((Array.isArray(context.dockerContainers) ? context.dockerContainers : [])
      .reduce((total, container) => total + numeric(container.cpuPct), 0)),
    gpu: gpuPresent ? clamp(numeric(context.gpuUtilizationPct, numeric(item.gpuUtil, 0))) : null,
    gpuMemory: gpuPresent ? clamp(numeric(context.gpuMemoryUsedPct, numeric(item.hbmCapacity, 0))) : null,
    gpuPower: gpuPresent && gpuPower > 0 ? gpuPower : null,
    gpuTemperature: gpuPresent && gpuTemperature > 0 ? gpuTemperature : null,
    memoryUsedBytes: Number.isFinite(memoryTotal) && Number.isFinite(memoryAvailable)
      ? Math.max(0, memoryTotal - memoryAvailable)
      : 0,
    networkUtilization: Number.isFinite(numeric(context.networkUtilizationPct, Number.NaN))
      ? clamp(numeric(context.networkUtilizationPct, 0))
      : null,
    networkThroughputBps: Number.isFinite(networkThroughput) ? Math.max(0, networkThroughput) : null
  };
}

function liveTelemetryTimestampMs(context = {}) {
  const explicit = numeric(context.clockTimeUnixMs, Number.NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const generatedAt = safeDate(context.generatedAt || context.machineInventoryLastSeenAt, null);
  return generatedAt ? generatedAt.getTime() : Date.now();
}

function recordLiveTelemetrySample(machineContext, generatedAt) {
  const context = machineContext.context || {};
  const timestampMs = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime())
    ? generatedAt.getTime()
    : Date.now();
  const host = machineContext.host || "host";
  const hostKey = fleetHostKey(machineContext) || normalizeFleetHostId(host);
  const hostSamples = liveTelemetrySamplesForHost(hostKey);
  const last = hostSamples[hostSamples.length - 1];
  if (last && last.host === host && last.timestampMs === timestampMs) {
    return hostSamples;
  }

  const nextHistory = normalizeLiveTelemetryStore([...liveTelemetryHistory, {
    host,
    hostKey,
    timestampMs,
    label: new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cpu: clamp(machineContext.cpuUsagePct),
    ram: clamp(machineContext.memoryUsedPct),
    disk: clamp(machineContext.diskUsedPct),
    dockerCpu: clamp(machineContext.dockerContainers.reduce((total, container) => total + numeric(container.cpuPct), 0)),
    gpu: machineContext.gpuPresent ? clamp(machineContext.gpuUtilizationPct) : null,
    gpuMemory: machineContext.gpuPresent ? clamp(machineContext.gpuMemoryUsedPct) : null,
    gpuPower: machineContext.gpuPresent && machineContext.gpuPowerWatts > 0 ? numeric(machineContext.gpuPowerWatts) : null,
    gpuTemperature: machineContext.gpuPresent && machineContext.gpuTemperatureC > 0 ? numeric(machineContext.gpuTemperatureC) : null,
    memoryUsedBytes: Math.max(0, numeric(context.memoryTotalBytes) - numeric(context.memoryAvailableBytes)),
    networkUtilization: Number.isFinite(machineContext.networkUtilizationPct) ? clamp(machineContext.networkUtilizationPct) : null,
    networkThroughputBps: Number.isFinite(machineContext.networkThroughputBps) ? Math.max(0, machineContext.networkThroughputBps) : null
  }]);

  if (!liveTelemetryHistoryMatches(liveTelemetryHistory, nextHistory)) {
    liveTelemetryHistory = nextHistory;
    persistLiveTelemetryHistory({ force: true });
  }

  return liveTelemetrySamplesForHost(hostKey);
}

function liveTelemetryHistoryMatches(left = [], right = []) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (liveTelemetrySampleSignature(left[index]) !== liveTelemetrySampleSignature(right[index])) return false;
  }
  return true;
}

function liveTelemetrySampleSignature(sample = {}) {
  return [
    sample.hostKey,
    sample.host,
    sample.timestampMs,
    sample.cpu,
    sample.ram,
    sample.disk,
    sample.dockerCpu,
    sample.gpu,
    sample.gpuMemory,
    sample.gpuPower,
    sample.gpuTemperature,
    sample.memoryUsedBytes,
    sample.networkUtilization,
    sample.networkThroughputBps
  ].join("|");
}

function analyzeLiveTelemetryRelationships(history, machineContext) {
  const window = history.slice(-LIVE_TELEMETRY_RELATIONSHIP_WINDOW);
  const sampleCount = window.length;
  const first = window[0];
  const latest = window[sampleCount - 1] || {};
  const windowSeconds = first && latest.timestampMs
    ? Math.max(0, Math.round((latest.timestampMs - first.timestampMs) / 1000))
    : 0;
  const trends = {
    cpu: telemetryTrend(window, "cpu"),
    ram: telemetryTrend(window, "ram"),
    disk: telemetryTrend(window, "disk"),
    networkUtilization: telemetryTrend(window, "networkUtilization"),
    networkThroughputBps: telemetryTrend(window, "networkThroughputBps"),
    gpu: telemetryTrend(window, "gpu"),
    gpuPower: telemetryTrend(window, "gpuPower"),
    gpuMemory: telemetryTrend(window, "gpuMemory"),
    gpuTemperature: telemetryTrend(window, "gpuTemperature")
  };
  const networkRelationshipKey = telemetryRelationshipKey(window, ["networkUtilization", "networkThroughputBps"]);
  const relationships = [
    telemetryRelationship("Network/GPU", telemetryCorrelation(window, networkRelationshipKey, "gpu"), networkRelationshipKey === "networkUtilization" ? "Link utilization vs accelerator work" : "Network throughput vs accelerator work"),
    telemetryRelationship("Network/CPU", telemetryCorrelation(window, networkRelationshipKey, "cpu"), networkRelationshipKey === "networkUtilization" ? "Link utilization vs host activity" : "Network throughput vs host activity"),
    telemetryRelationship("CPU/GPU", telemetryCorrelation(window, "cpu", "gpu"), "Host pressure vs accelerator work"),
    telemetryRelationship("Power/GPU", telemetryCorrelation(window, "gpuPower", "gpu"), "Power draw vs useful accelerator motion"),
    telemetryRelationship("RAM/CPU", telemetryCorrelation(window, "ram", "cpu"), "Memory pressure vs host activity")
  ];
  const covarianceMatrix = buildLiveCovarianceMatrix(window);
  const alerts = [];

  if (Number.isFinite(machineContext.hardwareFaultScore) && machineContext.hardwareFaultScore >= 18) {
    const topFault = machineContext.hardwareFaults[0];
    alerts.push(liveTelemetryAlert({
      severity: machineContext.hardwareFaultScore >= 80 || machineContext.hardwareCriticalFaultCount > 0 ? "critical" : machineContext.hardwareFaultScore >= 45 ? "high" : "medium",
      title: "Hardware health needs attention",
      evidence: topFault?.detail || `Hardware fault score is ${round(machineContext.hardwareFaultScore)} with ${round(numeric(machineContext.hardwareFaultCount))} observed fault signals.`,
      recommendation: machineContext.hardwareRepairRequiresApproval
        ? `${machineContext.hardwareRepairAction || "Inspect host"} requires operator approval.`
        : machineContext.hardwareRepairAction || "Inspect host and keep remediation in dry-run until confirmed.",
      confidence: Number.isFinite(machineContext.hardwareRepairConfidence) ? machineContext.hardwareRepairConfidence : 0.72
    }));
  }

  if (sampleCount < 6) {
    return {
      contextKey: liveObservationContextKey(null, machineContext, window),
      sampleCount,
      windowSeconds,
      alerts,
      relationships,
      covarianceMatrix,
      status: "Learning baseline"
    };
  }

  const avgGpu = telemetryAverage(window, "gpu");
  const avgCpu = telemetryAverage(window, "cpu");
  const avgDockerCpu = telemetryAverage(window, "dockerCpu");
  const avgNetworkThroughput = telemetryAverage(window, "networkThroughputBps");
  const hostWorkObserved = (avgCpu !== null && avgCpu >= 15)
    || (avgDockerCpu !== null && avgDockerCpu >= 8)
    || (avgNetworkThroughput !== null && avgNetworkThroughput >= 1024 * 1024);
  const latestGpu = numeric(latest.gpu, 0);
  const latestCpu = numeric(latest.cpu, 0);
  const latestRam = numeric(latest.ram, 0);
  const latestDisk = numeric(latest.disk, 0);
  const latestNetworkUtilization = telemetryValue(latest, "networkUtilization");
  const latestPower = numeric(latest.gpuPower, 0);
  const latestTemp = numeric(latest.gpuTemperature, 0);
  const cpuGpuCorrelation = telemetryCorrelation(window, "cpu", "gpu");
  const powerGpuCorrelation = telemetryCorrelation(window, "gpuPower", "gpu");

  if (machineContext.gpuPresent && hostWorkObserved && avgGpu !== null && avgGpu <= 5 && sampleCount >= 10) {
    alerts.push(liveTelemetryAlert({
      severity: avgCpu !== null && avgCpu > 35 ? "high" : "medium",
      title: "Accelerator is trending idle",
      evidence: `GPU averaged ${pct(avgGpu)} across ${sampleCount} samples while the host stayed at ${pct(avgCpu || 0)} CPU.`,
      recommendation: "Start a controlled workload or attach scheduler/request counters before treating this as workload saturation.",
      confidence: sampleCount >= 30 ? 0.86 : 0.72
    }));
  }

  if (trends.cpu.slopePerMinute > 8 && latestCpu > 20 && machineContext.gpuPresent && (trends.gpu.slopePerMinute < 1 || latestGpu < 20)) {
    alerts.push(liveTelemetryAlert({
      severity: latestCpu > 65 ? "high" : "medium",
      title: "CPU rising while GPU is flat",
      evidence: `CPU is moving ${signedRate(trends.cpu.slopePerMinute, "pts/min")} while GPU is moving ${signedRate(trends.gpu.slopePerMinute, "pts/min")}.`,
      recommendation: "Check preprocessing, request fan-in, tokenization, data loading, or host-side queues before adding GPUs.",
      confidence: Math.min(0.92, 0.64 + Math.abs(trends.cpu.slopePerMinute) / 100)
    }));
  }

  if (latestRam >= 85 || (trends.ram.slopePerMinute > 3 && latestRam >= 55)) {
    alerts.push(liveTelemetryAlert({
      severity: latestRam >= 90 ? "critical" : "high",
      title: "Memory pressure is drifting up",
      evidence: `RAM is at ${pct(latestRam)} with a short-window trend of ${signedRate(trends.ram.slopePerMinute, "pts/min")}.`,
      recommendation: "Inspect resident model processes, cache growth, and batch/concurrency settings before the host starts swapping.",
      confidence: latestRam >= 85 ? 0.9 : 0.74
    }));
  }

  if (latestDisk >= 85 || trends.disk.slopePerMinute > 0.5) {
    alerts.push(liveTelemetryAlert({
      severity: latestDisk >= 92 ? "critical" : "medium",
      title: "Disk usage trend needs attention",
      evidence: `Root filesystem is at ${pct(latestDisk)} and moving ${signedRate(trends.disk.slopePerMinute, "pts/min")}.`,
      recommendation: "Check logs, model cache growth, checkpoints, and local dataset staging before writes fail.",
      confidence: latestDisk >= 85 ? 0.88 : 0.68
    }));
  }

  if (latestTemp >= 78 || (trends.gpuTemperature.slopePerMinute > 2 && latestTemp >= 60)) {
    alerts.push(liveTelemetryAlert({
      severity: latestTemp >= 86 ? "critical" : "high",
      title: "GPU thermal trend is worsening",
      evidence: `GPU temperature is ${round(latestTemp)} C and moving ${signedRate(trends.gpuTemperature.slopePerMinute, "C/min")}.`,
      recommendation: "Check fan curve, power limits, enclosure airflow, and co-located heat sources before performance throttles.",
      confidence: latestTemp >= 78 ? 0.9 : 0.76
    }));
  }

  if (
    machineContext.gpuPresent
    && latestPower > 0
    && powerGpuCorrelation !== null
    && powerGpuCorrelation < -0.25
    && trends.gpuPower.slopePerMinute > 1
    && trends.gpu.slopePerMinute < 0
  ) {
    alerts.push(liveTelemetryAlert({
      severity: "high",
      title: "Power and utilization are diverging",
      evidence: `Power/GPU correlation is ${formatCorrelation(powerGpuCorrelation)}; power is rising while utilization is falling.`,
      recommendation: "Inspect thermal limits, background GPU contexts, clock behavior, and workload stalls.",
      confidence: 0.8
    }));
  }

  if (
    machineContext.gpuPresent
    && Number.isFinite(latestNetworkUtilization)
    && latestNetworkUtilization >= 70
    && (trends.gpu.slopePerMinute < 1 || latestGpu < 20)
  ) {
    alerts.push(liveTelemetryAlert({
      severity: latestNetworkUtilization >= 88 ? "high" : "medium",
      title: "Network utilization is high while GPU is flat",
      evidence: `Network utilization is ${pct(latestNetworkUtilization)} while GPU is moving ${signedRate(trends.gpu.slopePerMinute, "pts/min")}.`,
      recommendation: "Inspect data ingress, model shard traffic, all-reduce placement, and host NIC saturation before adding accelerator capacity.",
      confidence: 0.78
    }));
  }

  if (
    machineContext.gpuPresent
    && Number.isFinite(latestNetworkUtilization)
    && trends.networkUtilization.slopePerMinute > 8
    && trends.gpu.slopePerMinute < 1
  ) {
    alerts.push(liveTelemetryAlert({
      severity: latestNetworkUtilization >= 60 ? "high" : "medium",
      title: "Network pressure is rising ahead of GPU work",
      evidence: `Network utilization is moving ${signedRate(trends.networkUtilization.slopePerMinute, "pts/min")} while GPU is moving ${signedRate(trends.gpu.slopePerMinute, "pts/min")}.`,
      recommendation: "Check input streaming, collective fan-out, and cross-node placement while the window is still short.",
      confidence: 0.74
    }));
  }

  if (
    machineContext.gpuPresent
    && cpuGpuCorrelation !== null
    && cpuGpuCorrelation < -0.35
    && trends.cpu.slopePerMinute > 2
    && trends.gpu.slopePerMinute < -1
  ) {
    alerts.push(liveTelemetryAlert({
      severity: "medium",
      title: "Host and accelerator are moving against each other",
      evidence: `CPU/GPU correlation is ${formatCorrelation(cpuGpuCorrelation)} over the latest ${sampleCount} samples.`,
      recommendation: "Look for CPU-side blocking, synchronous request queues, dataloader stalls, or single-threaded orchestration.",
      confidence: 0.76
    }));
  }

  if (machineContext.gpuSampleCached && machineContext.gpuSampleAgeMs > 5000) {
    alerts.push(liveTelemetryAlert({
      severity: "medium",
      title: "GPU counter is lagging behind host telemetry",
      evidence: `The latest GPU sample is ${formatDecimal(machineContext.gpuSampleAgeMs / 1000, 1)}s older than the current host sample.`,
      recommendation: "Keep host alerts active, but treat GPU/power relationships as delayed until nvidia-smi catches up.",
      confidence: 0.84
    }));
  }

  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  alerts.sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || right.confidence - left.confidence);

  return {
    contextKey: liveObservationContextKey(null, machineContext, window),
    sampleCount,
    windowSeconds,
    alerts: alerts.slice(0, LIVE_TELEMETRY_ALERT_LIMIT),
    relationships,
    covarianceMatrix,
    status: alerts.length ? `${alerts.length} active` : "Stable"
  };
}

function analyzeAnalysisResourceRelationships(summary) {
  const network = numeric(summary.networkUtilization);
  const gpu = numeric(summary.gpuUtil);
  const cpuPrep = numeric(summary.cpuPrep);
  const networkWait = numeric(summary.networkWait);
  const nccl = numeric(summary.ncclTime);
  const placement = numeric(summary.placementQuality);
  const crossPod = numeric(summary.crossPodTraffic);
  const alerts = [];
  const relationships = [
    analysisRelationship(
      "Network/GPU",
      `${pct(network)} / ${pct(gpu)}`,
      networkGpuSnapshotNote(summary),
      network >= 70 && gpu < 45 ? "poor" : network >= 70 || gpu < 35 ? "watch" : "good"
    ),
    analysisRelationship(
      "Network/CPU",
      `${pct(network)} / ${pct(cpuPrep)}`,
      networkCpuSnapshotNote(summary),
      network >= 70 && cpuPrep >= 20 ? "poor" : network >= 70 || cpuPrep >= 20 ? "watch" : "good"
    ),
    analysisRelationship(
      "Network wait/GPU",
      `${pct(networkWait)} / ${pct(gpu)}`,
      "Network wait tracks stall/latency pressure against accelerator utilization",
      networkWait >= 18 && gpu < 55 ? "poor" : networkWait >= 10 ? "watch" : "good"
    ),
    analysisRelationship(
      "Placement/Network",
      `${pct(placement)} / ${pct(crossPod)}`,
      "Placement fit compared with cross-pod traffic pressure",
      placement < 60 && crossPod >= 30 ? "poor" : crossPod >= 20 || placement < 75 ? "watch" : "good"
    )
  ];

  if (network >= 70 && gpu < 45) {
    alerts.push(liveTelemetryAlert({
      severity: network >= 88 ? "high" : "medium",
      title: "Network utilization may be limiting GPU work",
      evidence: `Network utilization is ${pct(network)} while GPU utilization is ${pct(gpu)} in this run snapshot.`,
      recommendation: "Check input streaming, collective traffic, placement, and NIC capacity before adding accelerator capacity.",
      confidence: 0.74
    }));
  }

  if (network >= 70 && cpuPrep >= 20) {
    alerts.push(liveTelemetryAlert({
      severity: network >= 88 || cpuPrep >= 35 ? "high" : "medium",
      title: "Network and CPU prep are both elevated",
      evidence: `Network utilization is ${pct(network)} and CPU prep is ${pct(cpuPrep)} in the interpreted metrics.`,
      recommendation: "Inspect host data loading, tokenization, serialization, and ingress fan-in for CPU-side network pressure.",
      confidence: 0.7
    }));
  }

  if (network >= 60 && networkWait >= 10) {
    alerts.push(liveTelemetryAlert({
      severity: networkWait >= 20 ? "high" : "medium",
      title: "Throughput pressure and network wait coexist",
      evidence: `Network utilization is ${pct(network)} while network wait is ${pct(networkWait)} and NCCL time is ${pct(nccl)}.`,
      recommendation: "Separate capacity saturation from latency/loss stalls by checking interface errors, drops, and collective topology.",
      confidence: 0.76
    }));
  }

  return {
    contextKey: `snapshot:${summary.scope}:${summary.key}`,
    sampleCount: 1,
    windowSeconds: 0,
    badgeText: "Analysis snapshot",
    covarianceBadgeText: "Waiting for live counters",
    covarianceFootText: "Live host CPU, GPU, RAM, and network samples are required for covariance; current view is a static run snapshot.",
    emptyAlertText: "No adverse snapshot relationship detected in the selected run.",
    alerts: alerts.slice(0, LIVE_TELEMETRY_ALERT_LIMIT),
    relationships,
    covarianceMatrix: buildLiveCovarianceMatrix([]),
    observations: analysisResourceObservations(summary, alerts),
    history: analysisResourceHistory(summary),
    status: alerts.length ? `${alerts.length} snapshot ${alerts.length === 1 ? "signal" : "signals"}` : "Snapshot stable"
  };
}

function analysisRelationship(label, value, note, tone = "watch") {
  return { label, value, note, tone };
}

function networkGpuSnapshotNote(summary) {
  const network = numeric(summary.networkUtilization);
  const gpu = numeric(summary.gpuUtil);
  if (network >= 70 && gpu < 45) return "High link pressure with low GPU use points to data-motion bottlenecks";
  if (network >= 70) return "Link utilization is material; compare against network wait and NCCL";
  if (gpu >= 70 && network <= 40) return "GPU is busy without heavy link pressure";
  return "Snapshot comparison of link pressure against accelerator work";
}

function networkCpuSnapshotNote(summary) {
  const network = numeric(summary.networkUtilization);
  const cpuPrep = numeric(summary.cpuPrep);
  if (network >= 70 && cpuPrep >= 20) return "CPU prep is the host-side proxy for Network/CPU in this snapshot";
  if (network >= 70) return "Network pressure is elevated; CPU prep is not elevated in this run";
  if (cpuPrep >= 20) return "CPU prep is elevated without matching link utilization";
  return "Uses CPU prep as the host-side CPU proxy until live CPU counters arrive";
}

function analysisResourceObservations(summary, alerts) {
  const alertRows = alerts.map((alert) => ({
    tone: alert.severity === "critical" || alert.severity === "high" ? "poor" : alert.severity === "medium" ? "watch" : "good",
    label: titleCase(alert.severity),
    title: alert.title,
    detail: alert.evidence
  }));
  const network = numeric(summary.networkUtilization);
  const gpu = numeric(summary.gpuUtil);
  const cpuPrep = numeric(summary.cpuPrep);
  const rows = [
    {
      tone: inverseGrade(network, 70, 88).key,
      label: "Snapshot",
      title: "Network utilization",
      detail: `${pct(network)} link utilization | ${pct(summary.networkWait)} network wait | ${pct(summary.ncclTime)} NCCL`
    },
    {
      tone: network >= 70 && gpu < 45 ? "poor" : network >= 70 || gpu < 35 ? "watch" : "good",
      label: "Relationship",
      title: "Network/GPU",
      detail: `${pct(network)} network utilization compared with ${pct(gpu)} GPU utilization. ${networkGpuSnapshotNote(summary)}.`
    },
    {
      tone: network >= 70 && cpuPrep >= 20 ? "poor" : network >= 70 || cpuPrep >= 20 ? "watch" : "good",
      label: "Relationship",
      title: "Network/CPU",
      detail: `${pct(network)} network utilization compared with ${pct(cpuPrep)} CPU prep. ${networkCpuSnapshotNote(summary)}.`
    },
    {
      tone: inverseGrade(summary.networkWait, 10, 20).key,
      label: "Snapshot",
      title: "Network wait",
      detail: `${pct(summary.networkWait)} stall/latency pressure, kept separate from ${pct(network)} utilization.`
    }
  ];

  return [...alertRows, ...rows].slice(0, LIVE_OBSERVATION_LIMIT);
}

function analysisResourceHistory(summary) {
  return [{
    host: summary.label,
    timestampMs: Date.now(),
    label: "Snapshot",
    networkUtilization: clamp(summary.networkUtilization),
    gpu: clamp(summary.gpuUtil),
    cpuPrep: clamp(summary.cpuPrep),
    networkWait: clamp(summary.networkWait),
    ncclTime: clamp(summary.ncclTime),
    placementQuality: clamp(summary.placementQuality)
  }];
}

async function refreshPlatformVirtualSensors(container, analysis) {
  const baseUrl = platformApiBaseUrl();
  if (!baseUrl || platformVirtualSensorCache.inFlight) return;
  if (platformVirtualSensorCache.baseUrl === baseUrl && Date.now() - platformVirtualSensorCache.fetchedAt < 5000) return;
  platformVirtualSensorCache.inFlight = true;
  try {
    const [covariance, principalMode, systemIdentification] = await Promise.all([
      platformApiFetch("/v1/virtual-sensors/covariance").then((response) => response.ok ? response.json() : null),
      platformApiFetch("/v1/virtual-sensors/principal-resource-mode").then((response) => response.ok ? response.json() : null),
      platformApiFetch("/v1/virtual-sensors/system-identification").then((response) => response.ok ? response.json() : null)
    ]);
    const matrix = platformCovarianceMatrix(covariance, principalMode);
    const characterization = platformSystemIdentification(systemIdentification);
    if (matrix || characterization) {
      platformVirtualSensorCache = {
        baseUrl,
        fetchedAt: Date.now(),
        inFlight: false,
        matrix: matrix || platformVirtualSensorCache.matrix,
        systemIdentification: characterization || platformVirtualSensorCache.systemIdentification
      };
      refreshSystemCharacterizationPanelFromCache();
      if (matrix) renderLiveTelemetryAlerts(container, analysis);
      return;
    }
  } catch {
    // Keep local live telemetry fallback when the platform API is unavailable.
  }
  platformVirtualSensorCache = {
    ...platformVirtualSensorCache,
    baseUrl,
    fetchedAt: Date.now(),
    inFlight: false
  };
  refreshSystemCharacterizationPanelFromCache();
}

function platformCovarianceMatrix(covariance, principalMode) {
  if (!covariance || !Array.isArray(covariance.metrics) || !Array.isArray(covariance.rows)) return null;
  const metricByApiKey = new Map([
    ["cpu", LIVE_COVARIANCE_METRICS[0]],
    ["gpu", LIVE_COVARIANCE_METRICS[1]],
    ["ram", LIVE_COVARIANCE_METRICS[2]],
    ["network", LIVE_COVARIANCE_METRICS[3]]
  ]);
  const rows = covariance.rows
    .map((row) => {
      const metric = metricByApiKey.get(row.metric);
      if (!metric || !Array.isArray(row.cells)) return null;
      return {
        metric,
        cells: row.cells.map((cell) => {
          const rightMetric = metricByApiKey.get(cell.rightMetric || cell.right_metric);
          return {
            rowKey: metric.key,
            columnKey: rightMetric?.key || "",
            rowLabel: metric.label,
            columnLabel: rightMetric?.label || "",
            stats: {
              sampleCount: numeric(cell.sampleCount ?? cell.sample_count, 0),
              covariance: numeric(cell.covariance, null),
              correlation: numeric(cell.correlation, null)
            },
            trend: []
          };
        })
      };
    })
    .filter(Boolean);
  if (!rows.length) return null;
  return {
    metrics: LIVE_COVARIANCE_METRICS,
    rows,
    principalMode: platformPrincipalMode(principalMode)
  };
}

function platformPrincipalMode(mode) {
  if (!mode || mode.status !== "ready") {
    return {
      status: "learning",
      title: "Learning resource mode",
      badge: "API virtual sensors",
      explainedPct: null,
      note: "Waiting for platform virtual sensor tables to produce a principal resource mode.",
      loadings: LIVE_COVARIANCE_METRICS.map((metric) => ({ ...metric, value: null, trend: [] })),
      eigenvalues: []
    };
  }
  const keyMap = new Map([
    ["cpu", LIVE_COVARIANCE_METRICS[0]],
    ["gpu", LIVE_COVARIANCE_METRICS[1]],
    ["ram", LIVE_COVARIANCE_METRICS[2]],
    ["network", LIVE_COVARIANCE_METRICS[3]]
  ]);
  const loadingByKey = new Map((mode.loadings || []).map((loading) => [loading.metric, loading.value]));
  return {
    status: "ready",
    title: mode.title || "Principal resource mode",
    badge: "API virtual sensors",
    explainedPct: numeric(mode.explainedPct, null),
    note: "Computed by the platform virtual sensor API from the Parquet/DuckDB lakehouse path.",
    loadings: LIVE_COVARIANCE_METRICS.map((metric) => {
      const apiKey = [...keyMap.entries()].find(([, mapped]) => mapped.key === metric.key)?.[0];
      return { ...metric, value: numeric(loadingByKey.get(apiKey), null), trend: [] };
    }),
    eigenvalues: (mode.eigenvalues || []).map((entry) => ({
      value: numeric(entry.value, 0),
      sharePct: numeric(entry.sharePct, 0),
      trend: []
    }))
  };
}

function platformSystemIdentification(payload) {
  if (!payload || !Array.isArray(payload.rows)) return null;
  const rows = payload.rows
    .map((row) => ({
      hostId: String(row.host_id || row.hostId || ""),
      eventTs: String(row.event_ts || row.eventTs || ""),
      timestampMs: systemIdTimestampMs(row.event_ts || row.eventTs),
      runId: String(row.run_id || row.runId || row.experiment_id || row.experimentId || ""),
      experimentId: String(row.experiment_id || row.experimentId || row.run_id || row.runId || ""),
      phaseId: String(row.phase_id || row.phaseId || ""),
      target: String(row.target || ""),
      profile: String(row.profile || ""),
      outputMetric: String(row.output_metric || row.outputMetric || ""),
      feature: String(row.feature || ""),
      value: numeric(row.value, Number.NaN)
    }))
    .filter((row) => row.hostId && row.runId && Number.isFinite(row.value));
  if (!rows.length) {
    return {
      status: "empty",
      rows: [],
      hosts: [],
      count: numeric(payload.count, 0),
      fetchedAt: Date.now()
    };
  }

  const runsByHost = new Map();
  rows.forEach((row) => {
    if (!runsByHost.has(row.hostId)) runsByHost.set(row.hostId, new Map());
    const hostRuns = runsByHost.get(row.hostId);
    if (!hostRuns.has(row.runId)) {
      hostRuns.set(row.runId, {
        hostId: row.hostId,
        runId: row.runId,
        experimentId: row.experimentId,
        eventTs: row.eventTs,
        timestampMs: row.timestampMs,
        rows: []
      });
    }
    const run = hostRuns.get(row.runId);
    run.rows.push(row);
    if (row.timestampMs >= run.timestampMs) {
      run.timestampMs = row.timestampMs;
      run.eventTs = row.eventTs;
    }
  });

  const hosts = Array.from(runsByHost.entries())
    .map(([hostId, hostRuns]) => {
      const runs = Array.from(hostRuns.values()).sort((left, right) => right.timestampMs - left.timestampMs);
      const latest = runs[0];
      return systemIdentificationHostSummary(hostId, latest, rows, runs);
    })
    .sort(systemIdentificationHostSort);

  return {
    status: "ready",
    rows,
    hosts,
    count: numeric(payload.count, rows.length),
    fetchedAt: Date.now()
  };
}

function systemIdentificationHostSummary(hostId, latest, allRows, runs) {
  const featureMap = new Map(latest.rows.map((row) => [systemIdFeatureKey(row), row.value]));
  const feature = (target, profile, outputMetric, name) => numeric(featureMap.get(`${target}:${profile}:${outputMetric}:${name}`), null);
  const profiles = unique(latest.rows.map((row) => row.profile).filter(Boolean))
    .sort((left, right) => systemIdProfileRank(left) - systemIdProfileRank(right));
  const targets = unique(latest.rows.map((row) => row.target).filter(Boolean)).sort();
  const subsystems = systemIdentificationSubsystemSummaries(hostId, latest.rows, allRows, feature);
  const cpu = subsystems.find((subsystem) => subsystem.key === "cpu") || {};
  return {
    hostId,
    runId: latest.runId,
    eventTs: latest.eventTs,
    timestampMs: latest.timestampMs,
    ageLabel: formatSystemIdRunAge(latest.timestampMs),
    runCount: runs.length,
    profiles,
    targets,
    subsystems,
    cpuStepGain: cpu.stepGain,
    cpuStepPeak: cpu.stepPeak,
    cpuStepCorrelation: cpu.stepCorrelation,
    cpuImpulseGain: cpu.impulseGain,
    cpuImpulsePeak: cpu.impulsePeak,
    cpuRampPeak: cpu.rampPeak,
    profilePeaks: cpu.profilePeaks || {},
    profileGains: cpu.profileGains || {},
    stepGainTrend: cpu.stepGainTrend || [],
    stepPeakTrend: cpu.stepPeakTrend || [],
    impulseGainTrend: cpu.impulseGainTrend || []
  };
}

function systemIdentificationSubsystemSummaries(hostId, rows, allRows, feature) {
  return SYSTEM_ID_SUBSYSTEMS
    .map((config) => {
      const target = systemIdentificationTargetForOutput(rows, config);
      if (!target) return null;
      const profilePeaks = Object.fromEntries(SYSTEM_ID_PROFILE_ORDER.map((profile) => [profile, feature(target, profile, config.outputMetric, "peak_delta_pct")]));
      const profileGains = Object.fromEntries(SYSTEM_ID_PROFILE_ORDER.map((profile) => [profile, feature(target, profile, config.outputMetric, "gain")]));
      const stepGain = feature(target, "step", config.outputMetric, "gain");
      const stepPeak = feature(target, "step", config.outputMetric, "peak_delta_pct");
      const impulseGain = feature(target, "impulse", config.outputMetric, "gain");
      const impulsePeak = feature(target, "impulse", config.outputMetric, "peak_delta_pct");
      const rampPeak = feature(target, "ramp", config.outputMetric, "peak_delta_pct");
      const hasSignal = [
        stepGain,
        stepPeak,
        impulseGain,
        impulsePeak,
        rampPeak,
        ...Object.values(profilePeaks),
        ...Object.values(profileGains)
      ].some(Number.isFinite);
      if (!hasSignal) return null;
      return {
        ...config,
        target,
        targetLabel: systemIdentificationTargetLabel(target),
        stepGain,
        stepPeak,
        stepCorrelation: feature(target, "step", config.outputMetric, "cross_correlation"),
        impulseGain,
        impulsePeak,
        rampPeak,
        profilePeaks,
        profileGains,
        stepGainTrend: systemIdentificationTrend(allRows, hostId, target, "step", config.outputMetric, "gain"),
        stepPeakTrend: systemIdentificationTrend(allRows, hostId, target, "step", config.outputMetric, "peak_delta_pct"),
        impulseGainTrend: systemIdentificationTrend(allRows, hostId, target, "impulse", config.outputMetric, "gain")
      };
    })
    .filter(Boolean);
}

function systemIdentificationTargetForOutput(rows, config) {
  const candidates = unique(rows
    .filter((row) => row.outputMetric === config.outputMetric)
    .map((row) => row.target)
    .filter(Boolean));
  if (!candidates.length) return "";
  return candidates.sort((left, right) => {
    const leftRank = systemIdentificationTargetRank(left, config.target);
    const rightRank = systemIdentificationTargetRank(right, config.target);
    return leftRank - rightRank || left.localeCompare(right);
  })[0];
}

function systemIdentificationTargetRank(target, preferred) {
  if (target === preferred) return 0;
  const index = SYSTEM_ID_SUBSYSTEMS.findIndex((subsystem) => subsystem.target === target || subsystem.key === target);
  return index === -1 ? SYSTEM_ID_SUBSYSTEMS.length + 1 : index + 1;
}

function systemIdentificationTargetLabel(target) {
  return SYSTEM_ID_SUBSYSTEMS.find((subsystem) => subsystem.target === target || subsystem.key === target)?.shortLabel || titleCase(target);
}

function systemIdentificationHostSort(left, right) {
  const rank = (host) => {
    const id = host.hostId.toUpperCase();
    if (id === "SPARK1") return 1;
    if (id === "SPARK2") return 2;
    const piMatch = id.match(/^PI(\d+)$/);
    if (piMatch) return 100 + numeric(piMatch[1], 0);
    if (id.includes("NUC")) return 9;
    return 5;
  };
  return rank(left) - rank(right) || left.hostId.localeCompare(right.hostId, undefined, { numeric: true });
}

function systemIdFeatureKey(row) {
  return `${row.target}:${row.profile}:${row.outputMetric}:${row.feature}`;
}

function systemIdentificationTrend(rows, hostId, target, profile, outputMetric, feature) {
  const byRun = new Map();
  rows.forEach((row) => {
    if (row.hostId !== hostId || row.target !== target || row.profile !== profile || row.outputMetric !== outputMetric || row.feature !== feature) return;
    const existing = byRun.get(row.runId);
    if (!existing || row.timestampMs >= existing.timestampMs) {
      byRun.set(row.runId, {
        value: row.value,
        timestampMs: row.timestampMs,
        label: row.eventTs
      });
    }
  });
  return Array.from(byRun.values()).sort((left, right) => left.timestampMs - right.timestampMs).slice(-24);
}

function systemIdTimestampMs(value) {
  const normalized = String(value || "")
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function systemIdProfileRank(profile) {
  const index = SYSTEM_ID_PROFILE_ORDER.indexOf(profile);
  return index === -1 ? SYSTEM_ID_PROFILE_ORDER.length : index;
}

function formatSystemIdRunAge(timestampMs) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "time unknown";
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function refreshSystemCharacterizationPanelFromCache() {
  const panel = document.querySelector("#systemCharacterizationPanel");
  const badge = document.querySelector("#systemCharacterizationBadge");
  if (!panel) return;
  updateSystemCharacterizationBadge(badge, platformVirtualSensorCache.systemIdentification);
  renderSystemCharacterizationPanel(panel, platformVirtualSensorCache.systemIdentification);
}

function updateSystemCharacterizationBadge(badge, characterization) {
  if (!badge) return;
  if (!characterization || characterization.status !== "ready") {
    badge.textContent = platformApiBaseUrl() ? "Waiting" : "No API";
    badge.dataset.tone = platformApiBaseUrl() ? "watch" : "poor";
    return;
  }
  badge.textContent = `${characterization.hosts.length} ${characterization.hosts.length === 1 ? "host" : "hosts"}`;
  badge.dataset.tone = characterization.hosts.length >= 2 ? "good" : "watch";
}

function systemCharacterizationHostCard(host) {
  const card = document.createElement("article");
  card.className = "system-characterization-host";
  const head = document.createElement("div");
  head.className = "system-characterization-host-head";
  const title = document.createElement("strong");
  title.textContent = host.hostId;
  const badge = document.createElement("span");
  badge.textContent = host.ageLabel;
  head.append(title, badge);

  const stats = document.createElement("div");
  stats.className = "system-characterization-stats";
  const subsystemStats = (host.subsystems || []).slice(0, 4);
  if (subsystemStats.length) {
    stats.append(...subsystemStats.map((subsystem) => systemCharacterizationStat(
      `${subsystem.shortLabel} step`,
      systemIdDelta(subsystem.stepPeak),
      subsystem.stepPeakTrend,
      true
    )));
  } else {
    stats.append(systemCharacterizationStat("Step peak", systemIdDelta(host.cpuStepPeak), host.stepPeakTrend, true));
  }

  const meta = document.createElement("small");
  const profileText = host.profiles.map((profile) => SYSTEM_ID_PROFILE_LABELS[profile] || titleCase(profile)).join(", ");
  const subsystemText = (host.subsystems || []).map((subsystem) => subsystem.shortLabel).join(", ");
  meta.textContent = `${subsystemText || "Subsystems"} | ${profileText} | ${host.runCount} ${host.runCount === 1 ? "run" : "runs"}`;
  card.append(head, stats, meta);
  return card;
}

function systemCharacterizationStat(label, value, trend, signed) {
  const item = document.createElement("div");
  item.className = "system-characterization-stat";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  const spark = buildTrendSparkline(trend || [], {
    className: "system-characterization-sparkline",
    emptyClassName: "system-characterization-sparkline-empty",
    lineClassName: "system-characterization-sparkline-line",
    zeroClassName: "system-characterization-sparkline-zero",
    signed
  });
  item.append(labelEl, valueEl, spark);
  return item;
}

function systemCharacterizationProfileChart(hosts) {
  const chart = document.createElement("section");
  chart.className = "system-characterization-chart";
  const title = document.createElement("div");
  title.className = "system-characterization-chart-title";
  title.append(systemCharacterizationChartLabel("Subsystem profile response"), systemCharacterizationChartLabel("peak delta"));

  const series = systemCharacterizationProfileSeries(hosts);
  const values = hosts.flatMap((host) => (host.subsystems || []).flatMap((subsystem) => Object.values(subsystem.profilePeaks || {}).filter(Number.isFinite)));
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const rows = series.map((item) => systemCharacterizationProfileRow(item, hosts, maxAbs));

  chart.append(title, ...rows);
  return chart;
}

function systemCharacterizationProfileSeries(hosts) {
  const items = [];
  SYSTEM_ID_SUBSYSTEMS.forEach((config) => {
    SYSTEM_ID_PROFILE_ORDER.forEach((profile) => {
      const hasValue = hosts.some((host) => {
        const subsystem = systemCharacterizationHostSubsystem(host, config.key);
        return Number.isFinite(subsystem?.profilePeaks?.[profile]);
      });
      if (hasValue) items.push({ config, profile });
    });
  });
  return items;
}

function systemCharacterizationProfileRow(item, hosts, maxAbs) {
  const row = document.createElement("div");
  row.className = "system-characterization-profile-row";
  const label = document.createElement("span");
  label.textContent = `${item.config.shortLabel} ${SYSTEM_ID_PROFILE_LABELS[item.profile] || titleCase(item.profile)}`;
  const bars = document.createElement("div");
  bars.className = "system-characterization-bars";
  hosts.slice(0, SYSTEM_CHARACTERIZATION_HOST_LIMIT).forEach((host) => {
    const subsystem = systemCharacterizationHostSubsystem(host, item.config.key);
    const value = subsystem?.profilePeaks?.[item.profile];
    const bar = document.createElement("div");
    bar.className = "system-characterization-bar";
    bar.dataset.host = host.hostId.toLowerCase();
    bar.dataset.polarity = numeric(value, 0) < 0 ? "negative" : "positive";
    bar.title = `${host.hostId} ${item.config.label} ${SYSTEM_ID_PROFILE_LABELS[item.profile] || item.profile}: ${systemIdDelta(value)}`;
    const fill = document.createElement("i");
    fill.style.width = Number.isFinite(value) ? `${Math.max(2, Math.min(100, (Math.abs(value) / maxAbs) * 100))}%` : "2%";
    const text = document.createElement("span");
    text.textContent = `${host.hostId} ${systemIdDelta(value)}`;
    bar.append(fill, text);
    bars.append(bar);
  });
  row.append(label, bars);
  return row;
}

function systemCharacterizationHostSubsystem(host, key) {
  return (host.subsystems || []).find((subsystem) => subsystem.key === key) || null;
}

function systemCharacterizationTrendGrid(hosts) {
  const grid = document.createElement("div");
  grid.className = "system-characterization-trends";
  hosts.slice(0, SYSTEM_CHARACTERIZATION_HOST_LIMIT).forEach((host) => {
    const subsystems = (host.subsystems || []).filter((subsystem) => Number.isFinite(subsystem.stepPeak) || (subsystem.stepPeakTrend || []).length).slice(0, 4);
    subsystems.forEach((subsystem) => {
      grid.append(systemCharacterizationTrendCell(host, `${subsystem.shortLabel} step`, subsystem.stepPeakTrend, true, systemIdDelta));
    });
  });
  return grid;
}

function systemCharacterizationTrendCell(host, label, trend, signed, formatter = systemIdRatio) {
  const item = document.createElement("div");
  item.className = "system-characterization-trend-cell";
  const labelEl = document.createElement("span");
  labelEl.textContent = `${host.hostId} ${label}`;
  const points = trend || [];
  const latest = points.length ? points[points.length - 1].value : null;
  const value = document.createElement("strong");
  value.textContent = formatter(latest);
  const spark = buildTrendSparkline(trend || [], {
    className: "system-characterization-trend",
    emptyClassName: "system-characterization-sparkline-empty",
    lineClassName: "system-characterization-sparkline-line",
    zeroClassName: "system-characterization-sparkline-zero",
    signed
  });
  item.append(labelEl, value, spark);
  return item;
}

function systemCharacterizationChartLabel(text) {
  const label = document.createElement("span");
  label.textContent = text;
  return label;
}

function systemIdRatio(value) {
  return Number.isFinite(value) ? formatDecimal(value, 3) : "--";
}

function systemIdDelta(value) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}%` : "--";
}

function liveObservationActions({ observations, contextKey, clearTimestampMs, onClear }) {
  const actions = document.createElement("div");
  actions.className = "live-observation-actions";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "live-observation-action";
  copy.textContent = "Copy";
  copy.disabled = observations.length === 0;
  copy.setAttribute("aria-label", "Copy observation log");
  copy.addEventListener("click", async () => {
    const text = formatLiveObservationLog(observations);
    copy.disabled = true;
    const copied = await copyTextToClipboard(text);
    copy.dataset.state = copied ? "done" : "failed";
    copy.textContent = copied ? "Copied" : "Copy failed";
    setIngestStatus(copied ? "Observation log copied" : "Observation log ready to copy", copied ? "good" : "watch");
    if (!copied) showManualCopyPrompt("Observation log", text);
    window.setTimeout(() => {
      copy.dataset.state = "";
      copy.textContent = "Copy";
      copy.disabled = observations.length === 0;
    }, 1200);
  });

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "live-observation-action";
  clear.textContent = "Clear";
  clear.disabled = observations.length === 0;
  clear.setAttribute("aria-label", "Clear observation log");
  clear.addEventListener("click", () => {
    liveObservationClearState = { contextKey, clearedAtMs: clearTimestampMs };
    setIngestStatus("Observation log cleared", "watch");
    onClear();
  });

  actions.append(copy, clear);
  return actions;
}

function liveObservationContextKey(analysis, machineContext, history) {
  if (analysis?.contextKey) return analysis.contextKey;
  const host = machineContext?.host || history.find((sample) => sample?.host)?.host || "host";
  return `live:${host}`;
}

function filterLiveObservationRows(observations, contextKey) {
  if (!liveObservationWasCleared(contextKey)) return observations;
  return observations.filter((observation) => Number.isFinite(observation.timestampMs) && observation.timestampMs > liveObservationClearState.clearedAtMs);
}

function liveObservationWasCleared(contextKey) {
  return liveObservationClearState.contextKey === contextKey && Number.isFinite(liveObservationClearState.clearedAtMs);
}

function liveObservationClearTimestamp(observations, history) {
  const latestSample = history[history.length - 1];
  if (Number.isFinite(latestSample?.timestampMs)) return latestSample.timestampMs;
  const stamps = observations.map((observation) => observation.timestampMs).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : Date.now();
}

function formatLiveObservationLog(observations) {
  return observations
    .map((observation) => {
      const stamp = observation.dateTime || observation.label || "Observation";
      return `[${stamp}] ${observation.title}: ${observation.detail}`;
    })
    .join("\n");
}

function liveObservations(analysis, machineContext, history) {
  const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];
  const sampleHistory = Array.isArray(history) ? history : [];
  const latest = sampleHistory[sampleHistory.length - 1] || {};
  const alertRows = alerts.map((alert) => ({
    tone: alert.severity === "critical" || alert.severity === "high" ? "poor" : alert.severity === "medium" ? "watch" : "good",
    label: titleCase(alert.severity),
    title: alert.title,
    detail: alert.evidence,
    timestampMs: Number.isFinite(latest.timestampMs) ? latest.timestampMs : Date.now()
  }));
  const sampleRows = liveSignificantSampleObservations(sampleHistory, machineContext);

  return [...alertRows, ...sampleRows].slice(0, LIVE_OBSERVATION_LIMIT);
}

function liveSignificantSampleObservations(history, machineContext) {
  const rows = [];
  const seen = new Set();
  const window = history.slice(-LIVE_TELEMETRY_RELATIONSHIP_WINDOW);

  for (let index = window.length - 1; index >= 0 && rows.length < LIVE_OBSERVATION_LIMIT; index -= 1) {
    const sample = window[index];
    const previous = window[index - 1] || null;
    const candidates = liveSampleObservationEvents(sample, previous, machineContext);

    candidates.forEach((observation) => {
      if (rows.length >= LIVE_OBSERVATION_LIMIT) return;
      const signature = `${observation.eventKey}:${observation.title}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      rows.push(observation);
    });
  }

  return rows;
}

function liveSampleObservationEvents(sample, previous, machineContext) {
  const timestampMs = Number.isFinite(sample.timestampMs) ? sample.timestampMs : undefined;
  const dateTime = Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : "";
  const label = sample.label || "sample";
  const host = sample.host || machineContext?.host || "host";
  const rows = [];
  const add = ({ eventKey, tone = "watch", title, detail }) => {
    rows.push({ eventKey, tone, label, timestampMs, dateTime, title, detail });
  };
  const metricConfigs = [
    { key: "cpu", label: "CPU", warn: 70, poor: 90, delta: 15, floor: 20 },
    { key: "ram", label: "RAM", warn: 75, poor: 90, delta: 8, floor: 50 },
    { key: "disk", label: "Disk", warn: 75, poor: 92, delta: 2, floor: 70 },
    { key: "gpu", label: "GPU", warn: 85, poor: 96, delta: 18, floor: 15 },
    { key: "networkUtilization", label: "Network", warn: 70, poor: 88, delta: 15, floor: 20 }
  ];

  metricConfigs.forEach((config) => {
    const value = telemetryValue(sample, config.key);
    if (!Number.isFinite(value)) return;
    const previousValue = previous ? telemetryValue(previous, config.key) : Number.NaN;
    if (value >= config.poor) {
      add({
        eventKey: `${config.key}:poor`,
        tone: "poor",
        title: `${config.label} pressure is high`,
        detail: `${config.label} reached ${pct(value)} on ${host}.`
      });
      return;
    }
    if (value >= config.warn) {
      add({
        eventKey: `${config.key}:watch`,
        tone: "watch",
        title: `${config.label} pressure is elevated`,
        detail: `${config.label} is at ${pct(value)} on ${host}.`
      });
      return;
    }
    if (Number.isFinite(previousValue) && value >= config.floor && Math.abs(value - previousValue) >= config.delta) {
      add({
        eventKey: `${config.key}:delta`,
        tone: "watch",
        title: `${config.label} activity changed`,
        detail: `${config.label} moved ${signedRate(value - previousValue, "pts")} to ${pct(value)} on ${host}.`
      });
    }
  });

  const gpu = telemetryValue(sample, "gpu");
  const previousGpu = previous ? telemetryValue(previous, "gpu") : Number.NaN;
  if (machineContext?.gpuPresent && !Number.isFinite(gpu) && Number.isFinite(previousGpu)) {
    add({
      eventKey: "gpu:missing",
      tone: "watch",
      title: "GPU counter disappeared",
      detail: "The latest live sample did not include GPU utilization after it was previously present."
    });
  }

  const throughput = telemetryValue(sample, "networkThroughputBps");
  const previousThroughput = previous ? telemetryValue(previous, "networkThroughputBps") : Number.NaN;
  const throughputDelta = Number.isFinite(previousThroughput) ? throughput - previousThroughput : 0;
  const materialThroughput = 1024 * 1024;
  if (Number.isFinite(throughput) && throughput >= materialThroughput && Math.abs(throughputDelta) >= materialThroughput) {
    add({
      eventKey: "networkThroughput:delta",
      tone: "watch",
      title: "Network throughput changed",
      detail: `Network throughput moved ${formatBytesPerSecond(Math.abs(throughputDelta))} to ${formatBytesPerSecond(throughput)} on ${host}.`
    });
  }

  return rows;
}

function liveSampleObservation(sample, machineContext) {
  const parts = [
    `CPU ${pct(telemetryValue(sample, "cpu"))}`,
    `RAM ${pct(telemetryValue(sample, "ram"))}`,
    `Disk ${pct(telemetryValue(sample, "disk"))}`
  ];
  const gpu = telemetryValue(sample, "gpu");
  const networkUtilization = telemetryValue(sample, "networkUtilization");
  const networkThroughput = telemetryValue(sample, "networkThroughputBps");

  if (Number.isFinite(gpu)) {
    parts.push(`GPU ${pct(gpu)}`);
  } else if (machineContext?.gpuPresent) {
    parts.push("GPU unavailable");
  }

  if (Number.isFinite(networkUtilization)) {
    parts.push(`Network ${pct(networkUtilization)}`);
  } else if (Number.isFinite(networkThroughput)) {
    parts.push(`Network ${formatBytesPerSecond(networkThroughput)}`);
  }

  return {
    tone: liveSampleObservationTone(sample),
    label: sample.label || "sample",
    timestampMs: Number.isFinite(sample.timestampMs) ? sample.timestampMs : undefined,
    dateTime: Number.isFinite(sample.timestampMs) ? new Date(sample.timestampMs).toISOString() : "",
    title: sample.host || machineContext?.host || "host",
    detail: parts.join(" | ")
  };
}

function liveSampleObservationTone(sample) {
  const cpu = telemetryValue(sample, "cpu");
  const ram = telemetryValue(sample, "ram");
  const disk = telemetryValue(sample, "disk");
  const network = telemetryValue(sample, "networkUtilization");
  if (cpu >= 90 || ram >= 90 || disk >= 92 || network >= 88) return "poor";
  if (cpu >= 70 || ram >= 75 || disk >= 75 || network >= 70) return "watch";
  return "good";
}

function liveObservationItem(observation) {
  const item = document.createElement("li");
  item.className = "live-observation-item";
  item.dataset.tone = observation.tone;

  const marker = document.createElement("span");
  marker.className = "live-observation-marker";
  marker.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  const head = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = observation.title;
  const label = observation.dateTime ? document.createElement("time") : document.createElement("span");
  label.textContent = observation.label;
  if (observation.dateTime) label.setAttribute("datetime", observation.dateTime);
  head.append(title, label);

  const detail = document.createElement("small");
  detail.textContent = observation.detail;
  body.append(head, detail);

  item.append(marker, body);
  return item;
}

function liveCovarianceMatrixCell(cell) {
  const item = document.createElement("div");
  item.className = "live-covariance-cell";
  const { stats } = cell;
  const isDiagonal = cell.rowKey === cell.columnKey;
  const covariance = Number.isFinite(stats.covariance) ? stats.covariance : null;
  const correlation = Number.isFinite(stats.correlation) ? stats.correlation : null;
  const tone = covarianceCellTone(correlation, isDiagonal, stats.sampleCount);
  item.dataset.tone = tone;
  item.style.backgroundColor = covarianceCellBackground(correlation, isDiagonal, stats.sampleCount);

  const value = document.createElement("strong");
  value.textContent = covariance === null ? "learning" : formatCovariance(covariance, isDiagonal);
  const note = document.createElement("small");
  note.textContent = covariance === null
    ? `${stats.sampleCount}/4 pairs`
    : isDiagonal ? "variance" : formatCorrelation(correlation);
  const trend = buildCovarianceSparkline(cell.trend || [], isDiagonal);

  item.title = covariance === null
    ? `${cell.rowLabel} and ${cell.columnLabel}: waiting for at least 4 paired live samples.`
    : `${cell.rowLabel} vs ${cell.columnLabel}: covariance ${formatCovariance(covariance, isDiagonal)} pct-pt^2, ${isDiagonal ? "variance" : formatCorrelation(correlation)}, ${stats.sampleCount} paired samples.`;
  item.setAttribute("role", "cell");
  item.setAttribute("aria-label", item.title);

  item.append(value, trend, note);
  return item;
}

function liveEigenLoadingItem(loading) {
  const item = document.createElement("div");
  item.className = "live-eigen-loading";
  item.dataset.tone = Number.isFinite(loading.value) && Math.abs(loading.value) >= 0.5 ? "strong" : "muted";
  item.dataset.polarity = Number.isFinite(loading.value) && loading.value < 0 ? "negative" : "positive";

  const label = document.createElement("span");
  label.textContent = loading.shortLabel || loading.label;
  label.title = loading.label || "";
  const value = document.createElement("strong");
  value.textContent = Number.isFinite(loading.value) ? signedLoading(loading.value) : "--";
  const trend = buildEigenSparkline(loading.trend || [], true);

  item.title = Number.isFinite(loading.value)
    ? `${loading.label || loading.shortLabel}: principal-mode loading ${signedLoading(loading.value)}.`
    : `${loading.label || loading.shortLabel}: waiting for enough movement to compute a loading.`;
  item.setAttribute("aria-label", item.title);

  item.append(label, value, trend);
  return item;
}

function liveEigenValueItem(entry, index) {
  const item = document.createElement("div");
  item.className = "live-eigen-value";

  const label = document.createElement("span");
  label.textContent = `L${index + 1}`;
  const value = document.createElement("strong");
  value.textContent = formatDecimal(entry.value, 2);
  const trend = buildEigenSparkline(entry.trend || [], false);
  const share = document.createElement("small");
  share.textContent = `${pct(entry.sharePct)} share`;

  item.title = `L${index + 1}: eigenvalue ${formatDecimal(entry.value, 2)}, ${pct(entry.sharePct)} share of rolling resource variance.`;
  item.setAttribute("aria-label", item.title);

  item.append(label, value, trend, share);
  return item;
}

function covarianceCellTone(correlation, isDiagonal, sampleCount) {
  if (sampleCount < 4) return "learning";
  if (isDiagonal) return "self";
  if (!Number.isFinite(correlation) || Math.abs(correlation) < 0.2) return "weak";
  return correlation > 0 ? "positive" : "negative";
}

function covarianceCellBackground(correlation, isDiagonal, sampleCount) {
  if (sampleCount < 4) return "rgba(98, 117, 129, 0.08)";
  if (isDiagonal) return "rgba(36, 95, 145, 0.14)";
  if (!Number.isFinite(correlation)) return "rgba(98, 117, 129, 0.1)";
  const strength = Math.min(1, Math.abs(correlation));
  const alpha = 0.08 + strength * 0.34;
  return correlation >= 0
    ? `rgba(0, 143, 115, ${formatDecimal(alpha, 3)})`
    : `rgba(184, 76, 62, ${formatDecimal(alpha, 3)})`;
}

function formatCovariance(value, unsigned = false) {
  if (!Number.isFinite(value)) return "learning";
  const displayValue = Math.abs(value) < 0.005 ? 0 : value;
  const absValue = Math.abs(displayValue);
  const digits = absValue >= 100 ? 0 : absValue >= 10 ? 1 : 2;
  const sign = unsigned || displayValue < 0 ? "" : "+";
  return `${sign}${displayValue.toFixed(digits)}`;
}

function signedLoading(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}`;
}

function principalMetricName(metric) {
  if (metric.key === "networkUtilization") return "Network";
  if (metric.key === "cpu") return "CPU";
  if (metric.key === "gpu") return "GPU";
  if (metric.key === "ram") return "RAM";
  return metric.shortLabel || metric.label;
}

function liveRelationshipCard(relationship) {
  const item = document.createElement("div");
  item.className = "live-relationship-card";
  item.dataset.tone = relationship.tone;

  const label = document.createElement("span");
  label.textContent = relationship.label;
  const value = document.createElement("strong");
  value.textContent = relationship.value;
  const note = document.createElement("small");
  note.textContent = relationship.note;

  item.append(label, value, note);
  return item;
}

function liveAlertCard(alert) {
  const item = document.createElement("article");
  item.className = "live-alert-card";
  item.dataset.severity = alert.severity;

  const head = document.createElement("div");
  const severity = document.createElement("span");
  severity.textContent = titleCase(alert.severity);
  const confidence = document.createElement("small");
  confidence.textContent = `${pct(alert.confidence * 100)} confidence`;
  head.append(severity, confidence);

  const title = document.createElement("strong");
  title.textContent = alert.title;
  const evidence = document.createElement("p");
  evidence.textContent = alert.evidence;
  const recommendation = document.createElement("small");
  recommendation.textContent = alert.recommendation;

  item.append(head, title, evidence, recommendation);
  return item;
}

function liveTelemetryAlert({ severity, title, evidence, recommendation, confidence }) {
  return { severity, title, evidence, recommendation, confidence: clamp(confidence, 0, 1) };
}

function telemetryValue(sample, key) {
  const value = sample?.[key];
  if (value === undefined || value === null || value === "") return Number.NaN;
  return numeric(value, Number.NaN);
}

function telemetryRelationshipKey(history, keys) {
  return keys.find((key) => history.filter((sample) => Number.isFinite(telemetryValue(sample, key))).length >= 2) || keys[0];
}

function telemetryRelationship(label, correlation, note) {
  if (correlation === null) {
    return {
      label,
      value: "learning",
      note,
      tone: "watch"
    };
  }

  const strength = Math.abs(correlation);
  return {
    label,
    value: formatCorrelation(correlation),
    note: `${strength >= 0.7 ? "Strong" : strength >= 0.35 ? "Moderate" : "Weak"} ${correlation >= 0 ? "positive" : "negative"} relationship`,
    tone: correlation < -0.35 ? "poor" : strength >= 0.7 ? "good" : "watch"
  };
}

function calculatePrincipalResourceMode(history) {
  const activeMetrics = LIVE_COVARIANCE_METRICS
    .map((metric) => ({
      ...metric,
      varianceStats: telemetryCovarianceStats(history, metric.key, metric.key)
    }))
    .filter((metric) => Number.isFinite(metric.varianceStats.covariance) && metric.varianceStats.covariance > LIVE_EIGEN_MIN_VARIANCE);

  if (activeMetrics.length < 2) {
    return {
      status: "learning",
      title: "Learning resource mode",
      badge: "Need moving counters",
      explainedPct: null,
      note: "Need at least two live counters with variance across the rolling window to compute eigenvalues.",
      loadings: LIVE_COVARIANCE_METRICS.map((metric) => ({ ...metric, value: null })),
      eigenvalues: []
    };
  }

  const correlationMatrix = activeMetrics.map((rowMetric) => (
    activeMetrics.map((columnMetric) => {
      if (rowMetric.key === columnMetric.key) return 1;
      const correlation = telemetryCorrelation(history, rowMetric.key, columnMetric.key);
      return Number.isFinite(correlation) ? clamp(correlation, -1, 1) : 0;
    })
  ));
  const decomposition = symmetricEigenDecomposition(correlationMatrix);
  const eigenPairs = decomposition.values
    .map((value, index) => ({
      value: Math.max(0, value),
      vector: decomposition.vectors[index]
    }))
    .sort((left, right) => right.value - left.value);
  const principal = eigenPairs[0];
  const total = eigenPairs.reduce((sum, pair) => sum + pair.value, 0) || activeMetrics.length;
  const dominantIndex = principal.vector.reduce((best, value, index) => (
    Math.abs(value) > Math.abs(principal.vector[best]) ? index : best
  ), 0);
  const direction = principal.vector[dominantIndex] < 0 ? -1 : 1;
  const directedVector = principal.vector.map((value) => value * direction);
  const dominantLabels = directedVector
    .map((value, index) => ({ value: Math.abs(value), label: principalMetricName(activeMetrics[index]) }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((entry) => entry.label);
  const loadingByKey = new Map(activeMetrics.map((metric, index) => [metric.key, directedVector[index]]));

  return {
    status: "ready",
    title: dominantLabels.join(" + ") || "Principal resource mode",
    badge: `${activeMetrics.length} counters`,
    explainedPct: (principal.value / total) * 100,
    note: `Computed from the rolling correlation matrix across ${activeMetrics.length} moving ${activeMetrics.length === 1 ? "counter" : "counters"}.`,
    loadings: LIVE_COVARIANCE_METRICS.map((metric) => ({
      ...metric,
      value: loadingByKey.has(metric.key) ? loadingByKey.get(metric.key) : null
    })),
    eigenvalues: eigenPairs.map((pair) => ({
      value: pair.value,
      sharePct: (pair.value / total) * 100
    }))
  };
}

function telemetryPrincipalModeTrend(history) {
  return history
    .map((sample, index) => {
      const window = history.slice(Math.max(0, index - LIVE_TELEMETRY_RELATIONSHIP_WINDOW + 1), index + 1);
      const mode = calculatePrincipalResourceMode(window);
      if (mode.status !== "ready") return null;
      return {
        timestampMs: sample.timestampMs,
        label: sample.label || "",
        explainedPct: mode.explainedPct,
        loadings: mode.loadings,
        eigenvalues: mode.eigenvalues
      };
    })
    .filter(Boolean);
}

function symmetricEigenDecomposition(matrix) {
  const n = matrix.length;
  const values = matrix.map((row) => row.slice());
  const vectors = Array.from({ length: n }, (_, row) => (
    Array.from({ length: n }, (_, column) => (row === column ? 1 : 0))
  ));

  for (let iteration = 0; iteration < 80; iteration += 1) {
    let p = 0;
    let q = 1;
    let largest = 0;
    for (let row = 0; row < n; row += 1) {
      for (let column = row + 1; column < n; column += 1) {
        const magnitude = Math.abs(values[row][column]);
        if (magnitude > largest) {
          largest = magnitude;
          p = row;
          q = column;
        }
      }
    }
    if (largest < 1e-10) break;

    const app = values[p][p];
    const aqq = values[q][q];
    const apq = values[p][q];
    const tau = (aqq - app) / (2 * apq);
    const sign = tau >= 0 ? 1 : -1;
    const t = sign / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    for (let index = 0; index < n; index += 1) {
      if (index !== p && index !== q) {
        const aip = values[index][p];
        const aiq = values[index][q];
        values[index][p] = c * aip - s * aiq;
        values[p][index] = values[index][p];
        values[index][q] = s * aip + c * aiq;
        values[q][index] = values[index][q];
      }
    }

    values[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    values[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    values[p][q] = 0;
    values[q][p] = 0;

    for (let row = 0; row < n; row += 1) {
      const vip = vectors[row][p];
      const viq = vectors[row][q];
      vectors[row][p] = c * vip - s * viq;
      vectors[row][q] = s * vip + c * viq;
    }
  }

  return {
    values: values.map((row, index) => row[index]),
    vectors: values.map((_, index) => vectors.map((row) => row[index]))
  };
}

function telemetryTrend(history, key) {
  const points = history
    .map((sample) => ({
      x: numeric(sample.timestampMs, Number.NaN),
      y: telemetryValue(sample, key)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (points.length < 2) {
    return {
      count: points.length,
      latest: points[0]?.y ?? 0,
      delta: 0,
      slopePerMinute: 0,
      average: points[0]?.y ?? null
    };
  }

  const start = points[0].x;
  const xs = points.map((point) => (point.x - start) / 60000);
  const ys = points.map((point) => point.y);
  const n = points.length;
  const sumX = xs.reduce((total, value) => total + value, 0);
  const sumY = ys.reduce((total, value) => total + value, 0);
  const sumXY = xs.reduce((total, value, index) => total + value * ys[index], 0);
  const sumX2 = xs.reduce((total, value) => total + value * value, 0);
  const denominator = n * sumX2 - sumX * sumX;
  const slopePerMinute = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;

  return {
    count: n,
    latest: ys[n - 1],
    delta: ys[n - 1] - ys[0],
    slopePerMinute,
    average: sumY / n
  };
}

function telemetryCorrelation(history, leftKey, rightKey) {
  const pairs = history
    .map((sample) => [telemetryValue(sample, leftKey), telemetryValue(sample, rightKey)])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  if (pairs.length < 4) return null;

  const leftAvg = pairs.reduce((total, pair) => total + pair[0], 0) / pairs.length;
  const rightAvg = pairs.reduce((total, pair) => total + pair[1], 0) / pairs.length;
  const covariance = pairs.reduce((total, [left, right]) => total + (left - leftAvg) * (right - rightAvg), 0);
  const leftVariance = pairs.reduce((total, [left]) => total + (left - leftAvg) ** 2, 0);
  const rightVariance = pairs.reduce((total, [, right]) => total + (right - rightAvg) ** 2, 0);
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function telemetryCovarianceStats(history, leftKey, rightKey) {
  const pairs = history
    .map((sample) => [telemetryValue(sample, leftKey), telemetryValue(sample, rightKey)])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));

  if (pairs.length < 4) {
    return {
      sampleCount: pairs.length,
      covariance: null,
      correlation: null
    };
  }

  const leftAvg = pairs.reduce((total, pair) => total + pair[0], 0) / pairs.length;
  const rightAvg = pairs.reduce((total, pair) => total + pair[1], 0) / pairs.length;
  const denominator = Math.max(1, pairs.length - 1);
  const covariance = pairs.reduce((total, [left, right]) => total + (left - leftAvg) * (right - rightAvg), 0) / denominator;
  const leftVariance = pairs.reduce((total, [left]) => total + (left - leftAvg) ** 2, 0) / denominator;
  const rightVariance = pairs.reduce((total, [, right]) => total + (right - rightAvg) ** 2, 0) / denominator;
  const correlation = leftKey === rightKey
    ? 1
    : leftVariance === 0 || rightVariance === 0
      ? null
      : covariance / Math.sqrt(leftVariance * rightVariance);

  return {
    sampleCount: pairs.length,
    covariance,
    correlation
  };
}

function telemetryCovarianceTrend(history, leftKey, rightKey) {
  return history
    .map((sample, index) => {
      const window = history.slice(Math.max(0, index - LIVE_TELEMETRY_RELATIONSHIP_WINDOW + 1), index + 1);
      const stats = telemetryCovarianceStats(window, leftKey, rightKey);
      if (!Number.isFinite(stats.covariance)) return null;
      return {
        timestampMs: sample.timestampMs,
        label: sample.label || "",
        value: stats.covariance
      };
    })
    .filter(Boolean);
}

function telemetryAverage(history, key) {
  const values = history.map((sample) => telemetryValue(sample, key)).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatCorrelation(value) {
  if (value === null || !Number.isFinite(value)) return "learning";
  return `r ${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}`;
}

function signedRate(value, unit) {
  const parsed = numeric(value, 0);
  return `${parsed >= 0 ? "+" : ""}${formatDecimal(parsed, 1)} ${unit}`;
}

function formatDecimal(value, digits) {
  const parsed = numeric(value, 0);
  return parsed.toFixed(digits);
}

function liveTelemetryGraphCard({ label, valueKey, history, latestLabel, valueText, note, max = 100, tone = "watch", series = [] }) {
  const item = document.createElement("div");
  item.className = "live-telemetry-card";
  item.dataset.tone = tone;

  const head = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = valueText;
  head.append(labelEl, valueEl);

  const svg = buildTelemetrySparkline(history, valueKey, max, series);
  const noteEl = document.createElement("small");
  noteEl.textContent = `${note} | ${latestLabel}`;

  item.append(head, svg);
  if (Array.isArray(series) && series.length) {
    item.append(liveTelemetrySeriesLegend(series));
  }
  item.append(noteEl);
  return item;
}

function liveTelemetrySeriesLegend(series) {
  const legend = document.createElement("div");
  legend.className = "telemetry-legend";

  series.slice(0, 6).forEach((entry) => {
    const label = document.createElement("span");
    label.style.setProperty("--series-color", entry.color || "currentColor");
    label.textContent = entry.label || entry.key || "host";
    legend.append(label);
  });

  if (series.length > 6) {
    const remaining = document.createElement("span");
    remaining.className = "telemetry-legend-more";
    remaining.textContent = `+${series.length - 6}`;
    legend.append(remaining);
  }

  return legend;
}

function adaptiveGraphMax(history, key, fallback) {
  const observed = history.map((sample) => telemetryValue(sample, key)).filter(Number.isFinite);
  if (!observed.length) return fallback;
  return Math.max(10, Math.ceil(Math.max(...observed, fallback * 0.2) * 1.25));
}

function liveResourceCard({ label, value, note, percent = null, tone = "watch" }) {
  const item = document.createElement("div");
  item.className = "live-resource-card";
  item.dataset.tone = tone;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const valueEl = document.createElement("strong");
  valueEl.textContent = value;

  const noteEl = document.createElement("small");
  noteEl.textContent = note;

  item.append(labelEl, valueEl, noteEl);

  const track = document.createElement("div");
  track.className = "live-resource-track";
  const fill = document.createElement("span");
  fill.style.width = Number.isFinite(percent) ? `${clamp(percent)}%` : "100%";
  track.append(fill);
  item.append(track);

  return item;
}

function simulatorStat(label, value, tone) {
  const item = document.createElement("div");
  item.dataset.tone = tone;

  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function simulatorNarrativeItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);
  return item;
}

function simulatorScenarioCard(scenario, selected, recommended) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "simulator-scenario";
  button.setAttribute("aria-selected", String(selected));
  button.addEventListener("click", () => {
    state.schedulerScenario = scenario.id;
    render();
  });

  const head = document.createElement("div");
  const title = document.createElement("strong");
  const badge = document.createElement("span");
  title.textContent = scenario.label;
  badge.textContent = recommended ? "Recommended" : `${pct(scenario.confidence)} confidence`;
  head.append(title, badge);

  const metrics = document.createElement("div");
  metrics.className = "simulator-scenario-metrics";
  metrics.append(
    simulatorMiniMetric(currency.format(scenario.dollarUpside), "upside"),
    simulatorMiniMetric(`${round(scenario.deltas.queueWaitMinutes)} min`, "queue"),
    simulatorMiniMetric(`${round(scenario.deltas.usefulCompute)} pts`, "useful")
  );

  const note = document.createElement("small");
  note.textContent = scenario.evidence;

  button.append(head, metrics, note);
  return button;
}

function simulatorMiniMetric(value, label) {
  const item = document.createElement("span");
  const valueEl = document.createElement("strong");
  const labelEl = document.createElement("small");
  valueEl.textContent = value;
  labelEl.textContent = label;
  item.append(valueEl, labelEl);
  return item;
}

function grafanaContextItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value || "n/a";
  item.append(labelEl, valueEl);
  return item;
}

function grafanaLinkItem(link) {
  const item = document.createElement("a");
  item.className = "grafana-link";
  item.href = safeExternalUrl(link.url) || "#";
  item.target = "_blank";
  item.rel = "noopener noreferrer";
  item.dataset.type = String(link.type || "dashboard").toLowerCase();

  const title = document.createElement("strong");
  const meta = document.createElement("span");
  title.textContent = link.label || "Grafana link";
  meta.textContent = titleCase(link.type || "dashboard");
  item.append(title, meta);

  return item;
}

function grafanaTimeRangeLabel(timeRange = {}) {
  if (!timeRange.from && !timeRange.to) return "n/a";
  return `${timeRange.from || "start"} to ${timeRange.to || "now"}`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function taskMemoryBadgeText(memory) {
  if (memory.differenceLevel === "learning") return "Learning";
  if (memory.differenceLevel === "same") return "Stable";
  if (memory.differenceLevel === "major") return "Major drift";
  if (memory.differenceLevel === "changed") return "Changed";
  if (memory.differenceLevel === "minor") return "Minor drift";
  return "Task memory";
}

function taskMemoryTone(level) {
  if (level === "same") return "good";
  if (level === "major" || level === "changed") return "poor";
  return "watch";
}

function taskMemoryIdentityItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  labelEl.textContent = label;
  valueEl.textContent = value || "n/a";
  item.append(labelEl, valueEl);
  return item;
}

function taskMemoryResourceCard(label, value, note) {
  const card = document.createElement("div");
  card.className = "task-memory-resource";

  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  const noteEl = document.createElement("small");
  labelEl.textContent = label;
  valueEl.textContent = value || "n/a";
  noteEl.textContent = note || "n/a";

  card.append(labelEl, valueEl, noteEl);
  return card;
}

function taskMemoryMetricChangeRow(change) {
  const row = document.createElement("div");
  row.className = "task-memory-change";
  row.dataset.direction = change.direction;

  const label = document.createElement("strong");
  const value = document.createElement("span");
  const note = document.createElement("small");

  label.textContent = change.label;
  value.textContent = `${formatTaskMetricValue(change.current, change.unit)} now`;
  note.textContent = `${formatTaskDelta(change.delta, change.unit)} vs ${formatTaskMetricValue(change.baseline, change.unit)} historical average`;

  row.append(label, value, note);
  return row;
}

function taskMemoryCategoryChangeRow(change) {
  const row = document.createElement("div");
  row.className = "task-memory-change";
  row.dataset.direction = "changed";

  const label = document.createElement("strong");
  const value = document.createElement("span");
  const note = document.createElement("small");

  label.textContent = "Utilization category";
  value.textContent = taskMemoryCategoryLabel(change.current);
  note.textContent = `Was ${taskMemoryCategoryLabel(change.previous)}`;

  row.append(label, value, note);
  return row;
}

function taskMemoryResourceChangeRow(change) {
  const row = document.createElement("div");
  row.className = "task-memory-change";
  row.dataset.direction = "changed";

  const label = document.createElement("strong");
  const value = document.createElement("span");
  const note = document.createElement("small");

  label.textContent = change.label;
  value.textContent = change.added.length ? `Added ${listLabel(change.added, 2)}` : "Resource removed";
  note.textContent = change.text;

  row.append(label, value, note);
  return row;
}

function taskMemoryCategoryLabel(value) {
  return titleCase(String(value || "uncategorized").replace(/[-_]+/g, " "));
}

function formatTaskMetricValue(value, unit) {
  if (unit === "USD") return currency.format(value);
  if (unit === "points") return pct(value);
  if (unit === "minutes") return `${round(value)} min`;
  if (unit === "count") return number.format(value);
  return number.format(value);
}

function formatTaskDelta(value, unit) {
  if (unit === "USD") return signedCurrency(value);
  if (unit === "points") return `${signedNumber(value)} pts`;
  if (unit === "minutes") return `${signedNumber(value)} min`;
  if (unit === "count") return signedNumber(value);
  if (unit === "GPU-hours") return `${signedNumber(value)} GPU-hours`;
  return signedNumber(value);
}

function trendPointsFor(summary, metricKey) {
  return snapshotHistory
    .filter((record) => (
      record.scope === summary.scope
      && record.key === summary.key
      && Number.isFinite(record.metrics?.[metricKey])
    ))
    .map((record) => ({
      ...record,
      value: record.metrics[metricKey]
    }))
    .slice(-12);
}

function trendExtent(values, metric) {
  if (values.length === 0) {
    return metric.unit === "points" ? { min: 0, max: 100 } : { min: 0, max: 1 };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const padding = range > 0 ? range * 0.18 : Math.max(5, Math.abs(maxValue) * 0.12);
  const min = metric.unit === "points" ? Math.max(0, minValue - padding) : Math.max(0, minValue - padding);
  const max = metric.unit === "points" ? Math.min(100, maxValue + padding) : maxValue + padding;

  if (max <= min) {
    return { min: Math.max(0, min - 5), max: min + 5 };
  }

  return { min, max };
}

function trendLinePath(coordinates) {
  return coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function trendAreaPath(coordinates, baselineY) {
  const line = trendLinePath(coordinates);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

function providerContextItem(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function providerStat({ label, value, note, grade: gradeKey }) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");
  const noteEl = document.createElement("small");

  item.dataset.grade = gradeKey;
  labelEl.textContent = label;
  valueEl.textContent = value;
  noteEl.textContent = note;
  item.append(labelEl, valueEl, noteEl);

  return item;
}

function providerAction(text) {
  const item = document.createElement("div");
  item.className = "provider-action";
  item.textContent = text;
  return item;
}

function providerPortfolioRows() {
  return ["tenant", "account", "reservation"].flatMap((scope) => (
    buildEntries(scope).map((entry) => {
      const summary = summarizeEntry(entry);
      const provider = providerEconomics(summary);
      const classifier = classifyBottlenecks(summary);

      return {
        key: entry.key,
        label: entry.label,
        scope,
        jobCount: summary.count,
        bottleneck: classifier.primary.short,
        allocatedGpuHours: summary.allocatedGpuHours,
        wastedGpuHours: summary.wastedGpuHours,
        noiseEvents: summary.noiseEvents,
        contentionPct: summary.contentionPct,
        sellableWasteValue: provider.sellableWasteValue,
        queueSloPct: provider.queueSloPct,
        queueSloGapMinutes: provider.queueSloGapMinutes,
        grossMarginPct: provider.grossMarginPct,
        grossMargin: provider.grossMargin,
        hasFloorCost: provider.hasFloorCost
      };
    })
  ));
}

function providerSummaryTable({ title, rows, empty, value, note }) {
  const table = document.createElement("section");
  table.className = "provider-summary-table";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const list = document.createElement("div");
  list.className = "provider-summary-list";

  if (rows.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "provider-summary-empty";
    emptyEl.textContent = empty;
    list.append(emptyEl);
  } else {
    rows.forEach((row) => {
      list.append(providerSummaryRow(row, value(row), note(row)));
    });
  }

  table.append(heading, list);
  return table;
}

function providerSummaryRow(row, value, note) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "provider-summary-row";
  button.setAttribute("aria-selected", String(row.scope === state.scope && row.key === state.selectedKey));
  button.addEventListener("click", () => {
    state.scope = row.scope;
    state.selectedKey = row.key;
    render();
  });

  const copy = document.createElement("div");
  copy.className = "provider-summary-copy";
  const label = document.createElement("strong");
  const meta = document.createElement("span");
  const metric = document.createElement("strong");

  metric.className = "summary-value";
  label.textContent = row.label;
  meta.textContent = `${scopeLabel(row.scope)} | ${row.jobCount} ${row.jobCount === 1 ? "job" : "jobs"} | ${row.bottleneck} | ${note}`;
  metric.textContent = value;

  copy.append(label, meta);
  button.append(copy, metric);

  return button;
}

function opportunityStat(label, value, tone) {
  const item = document.createElement("div");
  item.dataset.tone = tone;

  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function opportunityRow(opportunity) {
  const row = document.createElement("article");
  row.className = "opportunity-row";
  row.dataset.severity = opportunity.severity;

  const head = document.createElement("div");
  head.className = "opportunity-row-head";

  const copy = document.createElement("div");
  const category = document.createElement("span");
  const title = document.createElement("strong");
  category.className = "opportunity-category";
  category.textContent = opportunity.category;
  title.textContent = opportunity.title;
  copy.append(category, title);

  const impact = document.createElement("strong");
  impact.className = "opportunity-impact";
  impact.textContent = opportunity.impactDollars > 0
    ? currency.format(opportunity.impactDollars)
    : `${number.format(opportunity.impactGpuHours)} GPU-hours`;

  head.append(copy, impact);

  const meta = document.createElement("div");
  meta.className = "opportunity-meta";
  meta.append(
    opportunityPill(titleCase(opportunity.severity)),
    opportunityPill(`${pct(opportunity.confidence)} confidence`),
    opportunityPill(opportunity.owner)
  );

  const evidence = document.createElement("p");
  evidence.textContent = opportunity.evidence;

  const recommendation = document.createElement("small");
  recommendation.textContent = opportunity.recommendation;

  row.append(head, meta, evidence, recommendation);
  return row;
}

function opportunityPill(text) {
  const pill = document.createElement("span");
  pill.className = "opportunity-pill";
  pill.textContent = text || "Unassigned";
  return pill;
}

function confidenceTone(confidence) {
  const value = numeric(confidence);
  if (value >= 74) return "high";
  if (value >= 58) return "medium";
  return "low";
}

function providerActionsFor(summary, provider, classifier, sloData) {
  const tenant = listLabel(summary.provider?.tenants, 1);
  const reservation = listLabel(summary.provider?.reservations, 1);
  const priority = listLabel(sloData.priorities, 1).toUpperCase();
  const actions = [];

  if (provider.queueSloGapMinutes > 0) {
    actions.push(`${priority} start-risk: queue wait is ${round(provider.queueSloGapMinutes)} minutes over target for ${tenant}.`);
  }

  if (provider.sellableWasteValue > 0) {
    actions.push(`Customer-success QBR: ${currency.format(provider.sellableWasteValue)} of sellable GPU time is tied to non-useful work in ${reservation}.`);
  }

  if (classifier.primary.short === "Communication" || classifier.primary.short === "Placement") {
    actions.push(`Scheduler action: repack ${reservation} into fewer locality groups before the next reserved burst.`);
  } else if (classifier.primary.short === "Noisy neighbor") {
    actions.push(`Tenant trust: isolate ${tenant} during congestion windows and compare contention against ticket timing.`);
  } else {
    actions.push(`Capacity planning: use the efficiency gap to decide whether this demand should renew, retune, or move to a different pool.`);
  }

  if (provider.efficiencyGap > 0) {
    actions.push(`Renewal risk: useful compute is ${round(provider.efficiencyGap)} points below the target efficiency in the contract/SLO overlay.`);
  }

  return actions.slice(0, 3);
}

function queueSloNote(provider) {
  if (provider.queueSloPct <= 0) return "No start target";
  if (provider.queueSloGapMinutes > 0) return `${round(provider.queueSloGapMinutes)} minutes over target`;
  return `${round(Math.abs(provider.queueSloGapMinutes))} minutes inside target`;
}

function listLabel(values = [], max = 2) {
  const labels = values.filter(Boolean);
  if (labels.length <= max) return labels.join(", ") || "n/a";
  return `${labels.slice(0, max).join(", ")} +${labels.length - max}`;
}

function hasProviderContext(summary) {
  return (summary.sourceItems || []).some((job) => (
    Boolean(job.source?.refs?.tenant || job.source?.refs?.account || job.source?.refs?.reservation)
    || Boolean(job.commercial?.contractId)
    || Boolean(job.slo?.supportTicketId)
    || Number.isFinite(job.commercial?.listGpuHourRate)
    || Number.isFinite(job.commercial?.floorGpuHourCost)
  ));
}

function traceStat(label, value) {
  const item = document.createElement("div");
  const labelEl = document.createElement("span");
  const valueEl = document.createElement("strong");

  labelEl.textContent = label;
  valueEl.textContent = value;
  item.append(labelEl, valueEl);

  return item;
}

function progressRow({ className, fillClass, label, value, suffix, note }) {
  const row = document.createElement("div");
  row.className = className;

  const labelRow = document.createElement("div");
  labelRow.className = className.replace("-row", "-label");

  const strong = document.createElement("strong");
  strong.textContent = label;

  const span = document.createElement("span");
  span.textContent = suffix ? `${pct(value)} ${suffix}` : pct(value);

  labelRow.append(strong, span);

  const track = document.createElement("div");
  track.className = className.replace("-row", "-track");

  const fill = document.createElement("div");
  fill.className = fillClass;
  fill.style.width = `${clamp(value)}%`;

  track.append(fill);
  row.append(labelRow, track);

  if (note) {
    const small = document.createElement("small");
    small.textContent = note;
    row.append(small);
  }

  return row;
}

function classifyBottlenecks(summary) {
  return analytics.classifyBottlenecks(summary);
}

function scoreComponents(summary) {
  return analytics.scoreComponents(summary, state.rate, (value) => currency.format(value));
}

function providerEconomics(summary) {
  return analytics.summarizeProviderEconomics(summary, { rate: state.rate });
}

function simulateScheduler(summary) {
  return analytics.simulateSchedulerScenarios(summary, { rate: state.rate });
}

function generateOpportunities(summary, classifier, provider) {
  return analytics.generateOpportunities(summary, {
    classifier,
    provider,
    rate: state.rate
  });
}

function fingerprintWorkload(summary) {
  return analytics.fingerprintWorkload(summary);
}

function regressionRows(summary) {
  return analytics.regressionRows(summary, (value) => currency.format(value));
}

function recommendationFor(summary, classifier) {
  return analytics.recommendationFor(summary, classifier);
}

function makePlacement(nodes, partialNodes = []) {
  return nodes.map((node) => ({
    node,
    gpus: 8,
    partial: partialNodes.includes(node)
  }));
}

function sumCommercialHours(items, field) {
  return items.reduce((total, job) => total + numeric(job.commercial?.[field]), 0);
}

function sumUniqueCommercialHours(items, field) {
  const keyedHours = new Map();
  let unkeyedHours = 0;

  items.forEach((job) => {
    const value = numeric(job.commercial?.[field]);
    if (value <= 0) return;

    const reservationKey = job.source?.refs?.reservation || job.commercial?.contractId;
    if (!reservationKey) {
      unkeyedHours += value;
      return;
    }

    keyedHours.set(reservationKey, Math.max(keyedHours.get(reservationKey) || 0, value));
  });

  return Array.from(keyedHours.values()).reduce((total, value) => total + value, unkeyedHours);
}

function weightedOptionalAverage(items, getter, weightKey) {
  const weightedItems = items
    .map((item) => ({
      value: Number(getter(item)),
      weight: Number(item[weightKey]) || 0
    }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0 && item.weight > 0);

  const totalWeight = weightedItems.reduce((total, item) => total + item.weight, 0);
  if (totalWeight === 0) return Number.NaN;

  return weightedItems.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function knownLabels(values, fallback) {
  const labels = unique(
    values
      .map((value) => String(value || "").trim())
      .filter((value) => value && value !== "Unknown")
  );

  return labels.length > 0 ? labels : [fallback];
}

function weightedAverage(items, keyOrGetter, weightKey) {
  const totalWeight = sum(items, weightKey);
  if (totalWeight === 0) return 0;

  const getter = typeof keyOrGetter === "function" ? keyOrGetter : (item) => item[keyOrGetter];
  return items.reduce((total, item) => total + (Number(getter(item)) || 0) * (Number(item[weightKey]) || 0), 0) / totalWeight;
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function unique(values) {
  return Array.from(new Set(values));
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value, min = 0, max = 100) {
  return analytics.clamp(value, min, max);
}

function round(value) {
  return analytics.round(value);
}

function pct(value) {
  return analytics.pct(value);
}

function formatBytes(value) {
  const bytes = numeric(value, 0);
  if (bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const scaled = bytes / (1024 ** index);
  return `${scaled >= 10 || index === 0 ? round(scaled) : scaled.toFixed(1)} ${units[index]}`;
}

function formatBytesPerSecond(value) {
  return `${formatBytes(value)}/s`;
}

function titleCase(value) {
  return analytics.titleCase(value);
}

function grade(value, watchAt, goodAt) {
  return analytics.grade(value, watchAt, goodAt);
}

function inverseGrade(value, watchAt, poorAt) {
  return analytics.inverseGrade(value, watchAt, poorAt);
}

function gradeColor(value, higherIsBetter) {
  return analytics.gradeColor(value, higherIsBetter);
}

function pluralTitle(scope) {
  const titles = {
    job: "Machines",
    model: "Models",
    user: "Users",
    team: "Teams",
    cluster: "Clusters",
    tenant: "Tenants",
    account: "Accounts",
    reservation: "Reservations"
  };
  return titles[scope] || "Inventory";
}

function scopeLabel(scope) {
  const labels = {
    job: "Job",
    model: "Model",
    user: "User",
    team: "Team",
    cluster: "Cluster",
    tenant: "Tenant",
    account: "Account",
    reservation: "Reservation"
  };
  return labels[scope] || "Scope";
}

function inventoryMeta(summary) {
  if (summary.isFleetAggregate) {
    const overview = fleetAggregateOverview(summary);
    const lakehouseMeta = overview.totalLakehouseUsedBytes > 0 ? ` | lake ${formatBytes(overview.totalLakehouseUsedBytes)}` : "";
    return `${overview.hostCount} hosts | ${overview.freshCount} fresh | ${round(overview.similarityScore)}% similar | ${overview.outlierCount} watch${lakehouseMeta}`;
  }

  if (summary.scope === "job") {
    const job = summary.jobs[0];
    const machineContext = machineDemoContext(summary);
    if (machineContext) {
      const presence = machineContext.machineInventoryMissing
        ? formatMachineLastSeen(machineContext.machineInventoryLastSeenAt)
        : Number.isFinite(machineContext.uptimeSeconds)
        ? `up ${formatMachineUptime(machineContext.uptimeSeconds)}`
        : job.status;
      return `${job.tenant} | ${job.team} | ${job.gpus} GPUs | ${presence}`;
    }
    return `${job.tenant} | ${job.team} | ${job.gpus} GPUs | ${job.status}`;
  }

  if (summary.scope === "tenant" || summary.scope === "account" || summary.scope === "reservation") {
    return `${summary.count} jobs | ${number.format(summary.allocatedGpuHours)} GPU-hours | ${listLabel(summary.provider.billingModels, 1)}`;
  }

  return `${summary.count} jobs | ${number.format(summary.allocatedGpuHours)} GPU-hours | ${summary.clusters.join(", ")}`;
}

function formatAnalysisTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function formatSnapshotTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function signedNumber(value) {
  const rounded = Math.round(numeric(value));
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${number.format(rounded)}`;
}

function signedCurrency(value) {
  const amount = numeric(value);
  if (Math.abs(amount) < 0.5) return "$0";
  return amount > 0 ? `+${currency.format(amount)}` : `-${currency.format(Math.abs(amount))}`;
}

function fileDateStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function deltaText(delta) {
  return analytics.deltaText(delta);
}

function curvePath(from, to, lift) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 + lift;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

async function copyReport() {
  const report = document.querySelector("#customerReport").textContent;
  const button = document.querySelector("#copyReport");

  await copyTextToClipboard(report);

  button.classList.add("copy-flash");
  window.setTimeout(() => button.classList.remove("copy-flash"), 900);
}

async function copyLlmReport() {
  const report = document.querySelector("#llmCustomerReport").textContent;
  const button = document.querySelector("#copyLlmReport");

  await copyTextToClipboard(report);

  button.classList.add("copy-flash");
  window.setTimeout(() => button.classList.remove("copy-flash"), 900);
}

async function copyLlmPrompt() {
  const prompt = document.querySelector("#llmReportPrompt").textContent;
  const button = document.querySelector("#copyLlmPrompt");

  await copyTextToClipboard(prompt);

  button.classList.add("copy-flash");
  window.setTimeout(() => button.classList.remove("copy-flash"), 900);
}

async function generateLlmReport() {
  const analysis = currentAnalysis();
  if (!analysis) return;

  const config = normalizeLlmReportConfig(state.llmReportConfig);
  if (!config.baseUrl || !config.model) {
    state.llmReportGeneration = {
      status: "error",
      promptFingerprint: "",
      text: "",
      model: config.model,
      generatedAt: "",
      error: "Configure an API URL and model before generation."
    };
    render();
    return;
  }

  const machine = buildMachineL1L6State(analysis.summary);
  const packet = buildLlmReportContextPacket(
    analysis.summary,
    analysis.classifier,
    analysis.provider,
    analysis.opportunityEngine,
    analysis.schedulerSimulator,
    machine
  );
  const prompt = buildLlmCustomerReportPrompt(packet);
  const promptFingerprint = llmReportContextFingerprint(packet);
  state.llmReportGeneration = {
    status: "working",
    promptFingerprint,
    text: "",
    model: config.model,
    generatedAt: "",
    error: ""
  };
  render();

  try {
    const text = await callLlmReportEndpoint(config, prompt);
    state.llmReportGeneration = {
      status: "complete",
      promptFingerprint,
      text,
      model: config.model,
      generatedAt: dateIso(new Date()),
      error: ""
    };
  } catch (error) {
    state.llmReportGeneration = {
      status: "error",
      promptFingerprint,
      text: "",
      model: config.model,
      generatedAt: "",
      error: error?.message || "LLM generation failed."
    };
  }
  render();
}

async function callLlmReportEndpoint(config, prompt) {
  const url = llmChatCompletionsUrl(config.baseUrl);
  const headers = {
    "Content-Type": "application/json"
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await window.fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "You write concise customer-facing infrastructure reports from supplied telemetry context only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 1400
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || `${response.status} ${response.statusText}`;
    throw new Error(`LLM endpoint returned ${detail}`);
  }

  const text = extractLlmReportText(payload);
  if (!text) throw new Error("LLM endpoint returned no report text.");
  return text;
}

function llmChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function extractLlmReportText(payload) {
  const choiceText = payload?.choices?.[0]?.message?.content
    || payload?.choices?.[0]?.text
    || "";
  if (choiceText) return String(choiceText).trim();
  if (payload?.output_text) return String(payload.output_text).trim();
  if (Array.isArray(payload?.output)) {
    return payload.output
      .flatMap((item) => item?.content || [])
      .map((part) => part?.text || part?.content || "")
      .join("\n")
      .trim();
  }
  return "";
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path for non-secure local HTTP contexts.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
