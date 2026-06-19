/**
 * turbalance Analytics — workspace, snapshot, theme, and dashboard-state functions
 *
 * Extracted from app.js (PR5 modularization). Loaded as a classic <script>
 * BEFORE app.js; these are top-level function declarations (global, hoisted,
 * lazily executed), so load order among the app-*.js modules does not matter
 * and they may freely reference app.js's top-level state at call time.
 */

function loadWorkspaceStore(defaultIngestion) {
  const persisted = readWorkspaceStore();

  if (isValidWorkspaceStore(persisted)) {
    const dataBoundary = normalizeDataBoundary(persisted.dataBoundary, persisted.ingestion);
    return {
      ...persisted,
      dataBoundary,
      machineInventory: normalizeMachineInventoryArchive(persisted.machineInventory),
      snapshots: normalizeSnapshotStore(persisted.snapshots),
      taskHistory: normalizeTaskHistoryStore(persisted.taskHistory),
      savingsLedger: normalizeSavingsLedgerStore(persisted.savingsLedger),
      actionExecutions: normalizeActionExecutionStore(persisted.actionExecutions),
      storageLabel: "Loaded locally",
      storageTone: dataBoundary.kind === "demo" ? "watch" : "good"
    };
  }

  const seeded = createWorkspaceStore(defaultIngestion, {
    savedAt: new Date(),
    lastAnalysisAt: null,
    dataBoundary: demoDataBoundary()
  });
  const saved = writeWorkspaceStore(seeded);

  return {
    ...seeded,
    storageLabel: saved ? "Seeded demo data" : "Demo session only",
    storageTone: "watch"
  };
}

function persistWorkspaceStore() {
  const nextStore = createWorkspaceStore(activeIngestion, {
    savedAt: new Date(),
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory,
    taskHistory,
    savingsLedger,
    actionExecutions: actionExecutionHistory,
    machineInventory: machineInventoryArchive,
    dataBoundary: state.dataBoundary
  });
  const saved = writeWorkspaceStore(nextStore);

  workspaceStore = {
    ...nextStore,
    storageLabel: saved ? "Saved locally" : "Session only",
    storageTone: saved ? "good" : "watch"
  };
  state.storageLabel = workspaceStore.storageLabel;
  state.storageTone = workspaceStore.storageTone;
}

function reconcileMachineInventory(feed) {
  if (!isIngestionFeed(feed)) return feed;

  const existingArchive = new Map(normalizeMachineInventoryArchive(machineInventoryArchive).map((record) => [record.key, record]));
  const liveKeys = new Set();
  const sourceRuns = Array.isArray(feed.runs) ? feed.runs : [];
  const retainedRuns = [];

  sourceRuns.forEach((run) => {
    if (isMachineInventoryMissingRun(run)) return;

    if (!isMachineRunLike(run)) {
      retainedRuns.push(run);
      return;
    }

    const key = machineInventoryKeyForRun(run);
    if (!key) {
      retainedRuns.push(run);
      return;
    }

    const lastSeenAt = machineRunObservedAt(run);
    const liveRun = machineInventoryLiveRunSnapshot(run, key, lastSeenAt);
    liveKeys.add(key);
    existingArchive.set(key, {
      key,
      lastSeenAt,
      run: liveRun
    });
    retainedRuns.push(liveRun);
  });

  machineInventoryArchive = Array.from(existingArchive.values())
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())
    .slice(0, MACHINE_INVENTORY_ARCHIVE_LIMIT);

  const usedIds = new Set(retainedRuns.map((run) => run.id).filter(Boolean));
  const archivedRuns = machineInventoryArchive
    .filter((record) => !liveKeys.has(record.key))
    .map((record) => machineInventoryArchivedRun(record, usedIds))
    .filter(Boolean);

  return {
    ...feed,
    runs: [...retainedRuns, ...archivedRuns]
  };
}

function normalizeMachineInventoryArchive(records = []) {
  if (!Array.isArray(records)) return [];

  const byKey = new Map();
  records.forEach((record) => {
    if (!isPlainObject(record) || !isPlainObject(record.run)) return;
    const key = normalizeMachineInventoryKey(record.key || machineInventoryKeyForRun(record.run));
    if (!key) return;
    const lastSeenAt = validDateIso(record.lastSeenAt || machineRunObservedAt(record.run));
    if (!lastSeenAt) return;
    const normalized = {
      key,
      lastSeenAt,
      run: machineInventoryLiveRunSnapshot(record.run, key, lastSeenAt)
    };
    const existing = byKey.get(key);
    if (!existing || new Date(normalized.lastSeenAt).getTime() >= new Date(existing.lastSeenAt).getTime()) {
      byKey.set(key, normalized);
    }
  });

  return Array.from(byKey.values())
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())
    .slice(0, MACHINE_INVENTORY_ARCHIVE_LIMIT);
}

function machineInventoryContextForRun(run) {
  return isPlainObject(run?.sourceContext)
    ? run.sourceContext
    : isPlainObject(run?.source?.context) ? run.source.context : {};
}

function machineInventoryKeyForRun(run) {
  const context = machineInventoryContextForRun(run);
  return machineInventoryKeyFromContext(context, {
    cluster: run?.refs?.cluster || run?.cluster,
    name: run?.name,
    id: run?.id
  });
}

function machineInventoryKeyForItem(item) {
  const context = item?.source?.context || {};
  return machineInventoryKeyFromContext(context, {
    cluster: item?.cluster,
    name: item?.name,
    id: item?.id
  });
}

function machineInventoryKeyFromContext(context = {}, fallback = {}) {
  const existingKey = normalizeMachineInventoryKey(context.machineInventoryKey);
  if (existingKey) return existingKey;

  const host = firstString([
    context.hostname,
    context.node,
    context.host,
    context.hostName,
    context.cluster,
    fallback.cluster,
    fallback.name
  ]);
  if (host) return `machine-host:${normalizedSelectionToken(host)}`;

  const address = firstString([
    context.networkLocalAddress,
    context.hostAddress,
    context.primaryAddress,
    context.ncclRuntimeHostIp,
    context.ipAddress
  ]);
  if (address) return `machine-address:${normalizedSelectionToken(address)}`;

  return fallback.id ? `machine-id:${normalizedSelectionToken(fallback.id)}` : "";
}

function normalizeMachineInventoryKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return key.includes(":") ? key : "";
}

function machineRunObservedAt(run) {
  const context = machineInventoryContextForRun(run);
  const observed = validDateIso(
    context.generatedAt
      || context.machineInventoryLastSeenAt
      || context.clockTimeUnixMs
      || run?.metadata?.generatedAt
  );
  return observed || dateIso(new Date());
}

function machineInventoryLiveRunSnapshot(run, key, lastSeenAt) {
  const snapshot = cloneJson(run);
  const context = isPlainObject(snapshot.sourceContext) ? snapshot.sourceContext : {};
  snapshot.sourceContext = {
    ...context,
    machineInventoryKey: key,
    machineInventoryLive: true,
    machineInventoryLastSeenAt: lastSeenAt
  };
  delete snapshot.sourceContext.machineInventoryMissing;
  delete snapshot.sourceContext.machineInventoryMissingSince;
  return snapshot;
}

function machineInventoryArchivedRun(record, usedIds) {
  if (!isPlainObject(record) || !isPlainObject(record.run)) return null;

  const run = cloneJson(record.run);
  const key = normalizeMachineInventoryKey(record.key || machineInventoryKeyForRun(run));
  if (!key) return null;

  const lastSeenAt = validDateIso(record.lastSeenAt || machineRunObservedAt(run)) || dateIso(new Date());
  const context = isPlainObject(run.sourceContext) ? run.sourceContext : {};
  const host = firstString([context.hostname, context.node, run.refs?.cluster, run.name, run.id]) || "machine";
  const archivedId = machineInventoryArchivedRunId(key, usedIds);

  run.id = archivedId;
  run.name = `${host} last-known host window`;
  run.status = "Offline - last known telemetry";
  run.importedSources = unique(["local-machine", "last-known-machine", ...(run.importedSources || [])]);
  run.sourceContext = {
    ...context,
    hostname: context.hostname || host,
    generatedAt: lastSeenAt,
    machineInventoryKey: key,
    machineInventoryLive: false,
    machineInventoryMissing: true,
    machineInventoryMissingSince: dateIso(new Date()),
    machineInventoryLastSeenAt: lastSeenAt
  };
  usedIds.add(archivedId);
  return run;
}

function machineInventoryArchivedRunId(key, usedIds) {
  const base = `machine-archive-${String(key).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "host"}`;
  if (!usedIds.has(base)) return base;
  let index = 2;
  while (usedIds.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function restoreWorkspaceStore(store, label) {
  machineInventoryArchive = normalizeMachineInventoryArchive(store.machineInventory);
  const retainedIngestion = reconcileMachineInventory(store.ingestion);
  activeIngestion = applyPersistedBaselines(retainedIngestion, store.baselines);
  jobs = normalizeIngestion(activeIngestion);
  snapshotHistory = normalizeSnapshotStore(store.snapshots);
  taskHistory = normalizeTaskHistoryStore(store.taskHistory);
  savingsLedger = normalizeSavingsLedgerStore(store.savingsLedger);
  actionExecutionHistory = normalizeActionExecutionStore(store.actionExecutions);
  state.selectedKey = jobs[0]?.id || "";
  state.scope = "job";
  state.ingestLabel = label;
  state.ingestTone = "good";
  state.dataBoundary = normalizeDataBoundary(store.dataBoundary, retainedIngestion);
  state.lastAnalysis = safeDate(store.lastAnalysisAt, new Date());

  if (snapshotHistory.length === 0) {
    captureAnalysisSnapshot(label, state.lastAnalysis);
  }

  persistWorkspaceStore();
  render();
}

function createWorkspaceStore(ingestion, { savedAt, lastAnalysisAt, snapshots = [], taskHistory = [], savingsLedger = [], actionExecutions = [], machineInventory = [], dataBoundary = null }) {
  return {
    storageSchemaVersion: STORAGE_SCHEMA.version,
    ingestionSchemaVersion: ingestion.schemaVersion,
    savedAt: dateIso(savedAt),
    lastAnalysisAt: dateIso(lastAnalysisAt),
    dataBoundary: normalizeDataBoundary(dataBoundary, ingestion),
    ingestion,
    baselines: buildBaselineStore(ingestion.runs),
    machineInventory: normalizeMachineInventoryArchive(machineInventory),
    snapshots: normalizeSnapshotStore(snapshots),
    taskHistory: normalizeTaskHistoryStore(taskHistory),
    savingsLedger: normalizeSavingsLedgerStore(savingsLedger),
    actionExecutions: normalizeActionExecutionStore(actionExecutions)
  };
}

function demoDataBoundary() {
  return {
    kind: "demo",
    label: "Demo data",
    tone: "watch",
    source: "SAMPLE_INGESTION",
    message: "Sample figures only. Connect an imported, API, or live feed before deployment."
  };
}

function normalizeDataBoundary(boundary, ingestion) {
  const raw = isPlainObject(boundary) ? boundary : {};
  const kind = ["demo", "imported", "api", "live", "workspace"].includes(raw.kind)
    ? raw.kind
    : isSampleIngestion(ingestion) ? "demo" : "workspace";
  const defaults = dataBoundaryDefaults(kind);

  return {
    kind,
    label: String(raw.label || defaults.label),
    tone: String(raw.tone || defaults.tone),
    source: String(raw.source || defaults.source || ""),
    message: String(raw.message || defaults.message)
  };
}

function dataBoundaryDefaults(kind) {
  if (kind === "demo") return demoDataBoundary();
  if (kind === "live") {
    return {
      label: "Live data",
      tone: "good",
      source: "live-machine-bundle",
      message: "Observed telemetry feed."
    };
  }
  if (kind === "api") {
    return {
      label: "API data",
      tone: "good",
      source: "api",
      message: "Fetched from the configured API endpoint."
    };
  }
  if (kind === "imported") {
    return {
      label: "Imported data",
      tone: "good",
      source: "file",
      message: "Imported from an operator-provided JSON bundle."
    };
  }
  return {
    label: "Workspace data",
    tone: "good",
    source: "workspace",
    message: "Restored from a saved workspace."
  };
}

function dataBoundaryForSourceLabel(sourceLabel, payload = null) {
  if (isPlainObject(payload?.dataBoundary)) {
    return normalizeDataBoundary(payload.dataBoundary, payload.ingestion || payload);
  }

  const label = String(sourceLabel || "");
  if (/^Live machine telemetry/i.test(label)) return dataBoundaryDefaults("live");
  if (/^Fetched API feed/i.test(label)) return dataBoundaryDefaults("api");
  if (/^Imported /i.test(label)) return dataBoundaryDefaults("imported");
  if (/sample/i.test(label)) return demoDataBoundary();
  return dataBoundaryDefaults("workspace");
}

function isSampleIngestion(ingestion) {
  const runs = Array.isArray(ingestion?.runs) ? ingestion.runs : [];
  const tenants = ingestion?.entities?.tenants || {};
  return runs.some((run) => run?.id === "run-7421")
    && runs.some((run) => run?.id === "run-7318")
    && Boolean(tenants["apex-ai"]);
}

function readWorkspaceStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_SCHEMA.key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeWorkspaceStore(store) {
  try {
    window.localStorage.setItem(STORAGE_SCHEMA.key, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

function loadDashboardBlockPreferences() {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_BLOCK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeDashboardBlockPreferences(parsed);
  } catch {
    return normalizeDashboardBlockPreferences(null);
  }
}

function saveDashboardBlockPreferences() {
  try {
    window.localStorage.setItem(DASHBOARD_BLOCK_STORAGE_KEY, JSON.stringify(state.dashboardBlocks));
    return true;
  } catch {
    return false;
  }
}

function normalizeDashboardBlockPreferences(preferences) {
  const normalized = { ...DASHBOARD_BLOCK_DEFAULTS };
  if (!isPlainObject(preferences)) return normalized;
  if (typeof preferences.predictivePrescriptive === "boolean") {
    if (typeof preferences.predictiveAnalytics !== "boolean") {
      normalized.predictiveAnalytics = preferences.predictivePrescriptive;
    }
    if (typeof preferences.prescriptiveActions !== "boolean") {
      normalized.prescriptiveActions = preferences.predictivePrescriptive;
    }
  }
  DASHBOARD_BLOCKS.forEach((block) => {
    if (typeof preferences[block.id] === "boolean") normalized[block.id] = preferences[block.id];
  });
  return normalized;
}

function dashboardBlockEnabled(id) {
  return state.dashboardBlocks?.[id] !== false;
}

function loadBenchmarkOptIn() {
  try {
    return window.localStorage.getItem("turba.benchmark.opt_in.v1") === "true";
  } catch (error) {
    return false;
  }
}

function setBenchmarkOptIn(value) {
  state.benchmarkOptIn = Boolean(value);
  try {
    window.localStorage.setItem("turba.benchmark.opt_in.v1", String(state.benchmarkOptIn));
  } catch (error) {
    // Local opt-in persistence is best-effort in locked-down browsers.
  }
  render();
}

function snapshotFromSummary(summary, classifier, sourceLabel, capturedAt) {
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);

  return {
    capturedAt,
    source: sourceLabel || "Analysis",
    scope: summary.scope,
    key: summary.key,
    label: summary.label,
    window: state.window,
    rate: state.rate,
    primaryBottleneck: classifier.primary.short,
    metrics: {
      usefulCompute: summary.usefulCompute,
      mfuPct: summary.mfuPct,
      hfuPct: summary.hfuPct,
      gpuUtil: summary.gpuUtil,
      allocatedGpuHours: summary.allocatedGpuHours,
      usefulGpuHours: summary.usefulGpuHours,
      wastedGpuHours: summary.wastedGpuHours,
      wasteDollars: summary.wasteDollars,
      costPerUsefulGpuHour: summary.costPerUsefulGpuHour,
      costPerMillionRequests: summary.costPerMillionRequests,
      sellableWasteValue: provider.sellableWasteValue,
      opportunityImpactDollars: opportunityEngine.totalImpactDollars,
      opportunityGpuHours: opportunityEngine.totalImpactGpuHours,
      opportunityCount: opportunityEngine.opportunities.length,
      reservationBurnPct: provider.reservationBurnPct,
      queueSloPct: provider.queueSloPct,
      grossMarginPct: provider.grossMarginPct,
      ncclTime: summary.ncclTime,
      networkWait: summary.networkWait,
      networkUtilization: summary.networkUtilization,
      kvCachePressure: summary.kvCachePressure,
      latencyTail: summary.latencyTail,
      placementQuality: summary.placementQuality,
      crossPodTraffic: summary.crossPodTraffic,
      queueWaitMinutes: summary.queueWaitMinutes
    }
  };
}

function normalizeSnapshotStore(records = []) {
  if (!Array.isArray(records)) return [];

  return records
    .map(normalizeSnapshotRecord)
    .filter(Boolean)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(-SNAPSHOT_LIMIT);
}

function normalizeSnapshotRecord(record) {
  const capturedAt = validDateIso(record?.capturedAt);
  const scope = String(record?.scope || "");
  const key = String(record?.key || "");

  if (!capturedAt || !SNAPSHOT_SCOPES.includes(scope) || !key) {
    return null;
  }

  return {
    capturedAt,
    source: String(record.source || "Analysis"),
    scope,
    key,
    label: String(record.label || key),
    window: String(record.window || "Last 24 hours"),
    rate: numeric(record.rate),
    primaryBottleneck: String(record.primaryBottleneck || "Unknown"),
    metrics: normalizeSnapshotMetrics(record.metrics)
  };
}

function normalizeSnapshotMetrics(metrics = {}) {
  return Object.fromEntries(
    Object.entries(metrics)
      .map(([key, value]) => [key, numeric(value, Number.NaN)])
      .filter(([, value]) => Number.isFinite(value))
  );
}

function normalizeTaskHistoryStore(records = []) {
  if (!Array.isArray(records)) return [];

  return records
    .map((record) => analytics.normalizeTaskUtilizationRecord(record))
    .filter(Boolean)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(-TASK_HISTORY_LIMIT);
}

function normalizeSavingsLedgerStore(records = []) {
  if (!Array.isArray(records)) return [];

  return records
    .map(normalizeSavingsLedgerEntry)
    .filter(Boolean)
    .sort((a, b) => new Date(a.verifiedAt || a.appliedAt || 0) - new Date(b.verifiedAt || b.appliedAt || 0))
    .slice(-SNAPSHOT_LIMIT);
}

function normalizeSavingsLedgerEntry(entry) {
  if (!isPlainObject(entry) || !entry.id || !entry.actionId) return null;
  const status = ["proposed", "accepted", "applied", "verified", "rejected", "expired"].includes(entry.status)
    ? entry.status
    : "proposed";
  const attribution = entry.attribution === "measured" ? "measured" : "modeled";
  const scope = isPlainObject(entry.scope) ? entry.scope : {};

  return {
    id: String(entry.id),
    actionId: String(entry.actionId),
    actionTitle: String(entry.actionTitle || ""),
    category: String(entry.category || "Uncategorized"),
    scope: {
      type: String(scope.type || "tenant"),
      key: String(scope.key || "unknown")
    },
    status,
    metric: String(entry.metric || "wastedGpuHours"),
    baseline: normalizeLedgerSnapshotMetric(entry.baseline),
    result: normalizeLedgerSnapshotMetric(entry.result),
    deltaGpuHours: numeric(entry.deltaGpuHours),
    deltaDollars: numeric(entry.deltaDollars),
    predictedGpuHours: numeric(entry.predictedGpuHours),
    predictedDollars: numeric(entry.predictedDollars),
    confidence: clamp(numeric(entry.confidence), 0, 100),
    attribution,
    appliedAt: validDateIso(entry.appliedAt) || "",
    verifiedAt: validDateIso(entry.verifiedAt) || "",
    evidenceRef: String(entry.evidenceRef || "")
  };
}

function normalizeLedgerSnapshotMetric(value = {}) {
  return {
    value: numeric(value.value),
    window: String(value.window || ""),
    snapshotId: String(value.snapshotId || "")
  };
}

function normalizeActionExecutionStore(records = []) {
  if (!Array.isArray(records)) return [];

  return records
    .map(normalizeActionExecutionRecord)
    .filter(Boolean)
    .sort((a, b) => new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0))
    .slice(-SNAPSHOT_LIMIT);
}

function normalizeActionExecutionRecord(record) {
  if (!isPlainObject(record) || !record.id || !record.actionId) return null;
  const status = ["planned", "applied", "reverted", "refused"].includes(record.status) ? record.status : "planned";
  const scope = isPlainObject(record.scope) ? record.scope : {};

  return {
    id: String(record.id),
    planId: String(record.planId || record.id),
    actionId: String(record.actionId),
    actionTitle: String(record.actionTitle || ""),
    connectorId: String(record.connectorId || "ticketing"),
    status,
    risk: String(record.risk || "low"),
    reversible: record.reversible !== false,
    scope: {
      type: String(scope.type || "tenant"),
      key: String(scope.key || "unknown")
    },
    changes: normalizeActionExecutionSteps(record.changes),
    revert: normalizeActionExecutionSteps(record.revert),
    externalRef: String(record.externalRef || ""),
    approvedBy: String(record.approvedBy || ""),
    createdAt: validDateIso(record.createdAt) || "",
    appliedAt: validDateIso(record.appliedAt) || "",
    revertedAt: validDateIso(record.revertedAt) || "",
    updatedAt: validDateIso(record.updatedAt || record.revertedAt || record.appliedAt || record.createdAt) || ""
  };
}

function normalizeActionExecutionSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter(isPlainObject)
    .map((step) => ({
      kind: String(step.kind || "change"),
      operation: String(step.operation || step.title || "dry-run-change"),
      target: String(step.target || ""),
      dryRun: step.dryRun !== false
    }));
}

function currentActionExecution(action, summary) {
  if (!action || !summary) return null;
  const scope = { type: summary.scope, key: summary.key };
  return actionExecutionHistory.find((record) => (
    record.actionId === action.id
    && record.scope.type === scope.type
    && record.scope.key === scope.key
  )) || null;
}

function previewActionWriteback(action, summary) {
  if (!action || !summary) return;
  const record = buildLocalActionWritebackPlan(action, summary);
  actionExecutionHistory = upsertActionExecutionRecord(actionExecutionHistory, record);
  persistWorkspaceStore();
  setIngestStatus("Dry-run change previewed", "good");
  render();
}

function applyActionWriteback(action, summary) {
  if (!action || !summary) return;
  const existing = currentActionExecution(action, summary);
  const plan = existing || buildLocalActionWritebackPlan(action, summary);
  const approvedBy = window.prompt ? window.prompt("Approval record for this change", "operator-approved") : "operator-approved";
  if (!approvedBy) {
    actionExecutionHistory = upsertActionExecutionRecord(actionExecutionHistory, {
      ...plan,
      status: "refused",
      updatedAt: dateIso(new Date())
    });
    persistWorkspaceStore();
    setIngestStatus("Approval required", "watch");
    render();
    return;
  }
  const appliedAt = dateIso(new Date());
  const applied = {
    ...plan,
    status: "applied",
    approvedBy,
    appliedAt,
    updatedAt: appliedAt,
    externalRef: plan.externalRef || `${plan.connectorId}://turba/${safeFileSlug(plan.actionId)}-${Date.now().toString(36)}`
  };
  actionExecutionHistory = upsertActionExecutionRecord(actionExecutionHistory, applied);
  persistWorkspaceStore();
  markSavingsLedgerActionApplied(action, summary);
  setIngestStatus("Approved action applied", "good");
  render();
}

function revertActionWriteback(action, summary) {
  const existing = currentActionExecution(action, summary);
  if (!existing || existing.status !== "applied") {
    setIngestStatus("No applied change to revert", "watch");
    return;
  }
  const revertedAt = dateIso(new Date());
  actionExecutionHistory = upsertActionExecutionRecord(actionExecutionHistory, {
    ...existing,
    status: "reverted",
    revertedAt,
    updatedAt: revertedAt
  });
  persistWorkspaceStore();
  setIngestStatus("Revert recorded", "good");
  render();
}

function buildLocalActionWritebackPlan(action, summary) {
  const connectorId = actionConnectorFor(action);
  const scope = { type: summary.scope, key: summary.key };
  const actionId = String(action.id || action.actionId || action.title || "action");
  const planId = `plan-${safeFileSlug(actionId)}-${safeFileSlug(scope.type)}-${safeFileSlug(scope.key)}`;
  const target = scope.key;
  const operation = connectorId === "ticketing"
    ? "open-approval-request"
    : connectorId === "slurm"
      ? "scontrol-requeue-with-placement-hint"
      : connectorId === "runai"
        ? "update-project-quota-or-placement-hint"
        : "label-nodepool-for-repack";

  return {
    id: planId,
    planId,
    actionId,
    actionTitle: String(action.title || action.name || actionId),
    connectorId,
    status: "planned",
    risk: connectorId === "ticketing" ? "low" : "medium",
    reversible: true,
    scope,
    changes: [{ kind: connectorId, operation, target, dryRun: true }],
    revert: [{ kind: connectorId, operation: `revert-${operation}`, target, dryRun: true }],
    createdAt: dateIso(new Date()),
    updatedAt: dateIso(new Date())
  };
}

function actionConnectorFor(action = {}) {
  const requested = action.connectorId || action.connector;
  if (requested) return String(requested);
  const category = String(action.category || "").toLowerCase();
  if (category.includes("slurm")) return "slurm";
  if (category.includes("run:ai") || category.includes("runai")) return "runai";
  if (category.includes("scheduler") || category.includes("placement")) return "kubernetes-karpenter";
  return "ticketing";
}

function upsertActionExecutionRecord(records = [], record) {
  const normalized = normalizeActionExecutionRecord(record);
  if (!normalized) return normalizeActionExecutionStore(records);
  const next = normalizeActionExecutionStore(records).filter((item) => item.id !== normalized.id);
  next.push(normalized);
  return normalizeActionExecutionStore(next);
}

function markSavingsLedgerActionApplied(action, summary) {
  if (typeof TurbaPredictive === "undefined" || !action || !summary) {
    setIngestStatus("Ledger unavailable", "poor");
    return;
  }
  const now = new Date();
  const baseline = ledgerSnapshotFromSummary(summary, "Applied action baseline", now);
  const entry = TurbaPredictive.recordOutcome(action, baseline, null, {
    status: "applied",
    appliedAt: now,
    scope: { type: summary.scope, key: summary.key },
    metric: action.metric || "wastedGpuHours",
    evidenceRef: baseline.id
  });
  savingsLedger = upsertSavingsLedgerEntry(savingsLedger, entry);
  persistWorkspaceStore();
  setIngestStatus("Action applied in ledger", "good");
  render();
}

function verifySavingsLedgerEntry(entry, summary) {
  if (typeof TurbaPredictive === "undefined" || !entry || !summary) {
    setIngestStatus("Ledger unavailable", "poor");
    return;
  }
  const now = new Date();
  const metric = entry.metric || "wastedGpuHours";
  const baseline = {
    id: entry.baseline?.snapshotId || `${entry.id}-baseline`,
    capturedAt: entry.appliedAt || now.toISOString(),
    scope: entry.scope?.type || summary.scope,
    key: entry.scope?.key || summary.key,
    window: entry.baseline?.window || state.window,
    rate: state.rate,
    metrics: { [metric]: numeric(entry.baseline?.value) }
  };
  const result = ledgerSnapshotFromSummary(summary, "Verified action result", now);
  const nextEntry = TurbaPredictive.recordOutcome({
    id: entry.actionId,
    title: entry.actionTitle,
    category: entry.category,
    expectedDollars: entry.predictedDollars,
    expectedGpuHours: entry.predictedGpuHours,
    confidence: entry.confidence,
    metric
  }, baseline, result, {
    id: entry.id,
    status: "verified",
    appliedAt: entry.appliedAt,
    verifiedAt: now,
    scope: entry.scope,
    metric,
    evidenceRef: [entry.evidenceRef, result.id].filter(Boolean).join("..")
  });
  savingsLedger = upsertSavingsLedgerEntry(savingsLedger, nextEntry);
  persistWorkspaceStore();
  setIngestStatus("Savings verified", "good");
  render();
}

function ledgerSnapshotFromSummary(summary, sourceLabel, capturedAt = new Date()) {
  const classifier = classifyBottlenecks(summary);
  const snapshot = snapshotFromSummary(summary, classifier, sourceLabel, capturedAt.toISOString());
  return {
    ...snapshot,
    id: `ledger-${summary.scope}-${safeFileSlug(summary.key)}-${capturedAt.getTime()}`
  };
}

function upsertSavingsLedgerEntry(entries = [], entry) {
  const next = normalizeSavingsLedgerStore(entries).filter((item) => item.id !== entry.id);
  next.push(entry);
  return normalizeSavingsLedgerStore(next);
}

function restoredSourceLabel(sourceLabel) {
  return sourceLabel
    .replace(/^Imported /, "Restored ")
    .replace(/^Fetched /, "Restored ");
}

function machineDemoBundleUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseImportUrl(params.get("bundle") || mobileDashboardConfig().bundleUrl || "build/demo/live-machine-bundle.json");
}

function exportWorkspace({ redacted = false } = {}) {
  const exportedAt = new Date();
  const rawStore = createWorkspaceStore(activeIngestion, {
    savedAt: exportedAt,
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory,
    taskHistory,
    savingsLedger,
    actionExecutions: actionExecutionHistory,
    machineInventory: machineInventoryArchive
  });
  const store = redacted ? redactWorkspaceStore(rawStore) : rawStore;
  const blob = new Blob([`${JSON.stringify(store, null, 2)}\n`], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `turba-workspace${redacted ? "-redacted" : ""}-${fileDateStamp(exportedAt)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  setIngestStatus(redacted ? "Redacted workspace exported" : "Workspace exported", "good");
}

function exportEvidencePack() {
  const exportedAt = new Date();
  const analysis = currentAnalysis();
  if (!analysis) {
    setIngestStatus("No evidence target", "watch");
    return;
  }

  const store = createWorkspaceStore(activeIngestion, {
    savedAt: exportedAt,
    lastAnalysisAt: state.lastAnalysis,
    snapshots: snapshotHistory,
    taskHistory,
    savingsLedger,
    actionExecutions: actionExecutionHistory,
    machineInventory: machineInventoryArchive
  });
  const plan = buildRedactionPlan(store);
  const markdown = buildEvidencePackMarkdown({
    ...analysis,
    plan,
    exportedAt
  });
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `turbalance-evidence-pack-${safeFileSlug(analysis.summary.scope)}-${safeFileSlug(redactedSummaryKey(analysis.summary, plan))}-${fileDateStamp(exportedAt)}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  setIngestStatus("Evidence pack exported", "good");
}

function redactedSummaryKey(summary, plan) {
  return redactSnapshotKey(summary.scope, summary.key, plan);
}

function redactedSummaryLabel(summary, plan) {
  const key = redactedSummaryKey(summary, plan);
  return key === summary.key ? summary.label : redactedLabel(key);
}

function redactedProviderContext(summary, plan) {
  return {
    tenant: redactedRefList(summary, plan, "tenant"),
    account: redactedRefList(summary, plan, "account"),
    reservation: redactedRefList(summary, plan, "reservation")
  };
}

function redactedRefList(summary, plan, refKey) {
  const collection = REF_COLLECTIONS[refKey];
  if (!collection) return "n/a";

  const values = unique((summary.sourceItems || [])
    .map((job) => job.source?.refs?.[refKey] || job[refKey])
    .filter(Boolean)
    .map((value) => mappedValue(plan.entities[collection], value, refKey)));

  return listLabel(values, 3);
}

function redactedSourceRows(summary, plan) {
  return (summary.sourceItems || []).map((job) => {
    const refs = redactRefs(job.source?.refs || {}, plan);
    const context = redactSourceContext(job.source?.context || {}, plan);
    const contextPairs = Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${value}`);

    return {
      run: mappedValue(plan.runs, job.id, "run"),
      adapters: (job.source?.adapters || []).join(", ") || "seed",
      tenant: refs.tenant || "n/a",
      account: refs.account || "n/a",
      reservation: refs.reservation || "n/a",
      context: contextPairs.length > 0 ? contextPairs.join("; ") : "no source context"
    };
  });
}

function redactedGrafanaRows(summary, plan) {
  return (summary.sourceItems || []).flatMap((job) => {
    const context = redactGrafanaContext(job.grafanaContext || {}, plan);
    if (!context || Object.keys(context).length === 0) return [];

    const links = context.links?.length ? context.links : [
      context.dashboardUrl ? { label: context.dashboardTitle || "Dashboard", type: "dashboard", url: context.dashboardUrl } : null,
      context.exploreUrl ? { label: "Explore", type: "explore", url: context.exploreUrl } : null
    ].filter(Boolean);

    return links.map((link) => ({
      run: mappedValue(plan.runs, job.id, "run"),
      dashboard: context.dashboardTitle || context.dashboardUid || "n/a",
      datasource: context.datasourceName || context.datasourceUid || "n/a",
      link: `${link.label || titleCase(link.type || "link")}: ${link.url}`,
      timeRange: grafanaTimeRangeLabel(context.timeRange)
    }));
  });
}

function redactWorkspaceStore(store) {
  const plan = buildRedactionPlan(store);
  const redacted = cloneJson(store);

  redacted.ingestion = redactIngestion(redacted.ingestion, plan);
  redacted.baselines = redactBaselineStore(redacted.baselines, plan);
  redacted.machineInventory = redactMachineInventoryArchive(redacted.machineInventory, plan);
  redacted.snapshots = redactSnapshots(redacted.snapshots, plan);
  redacted.taskHistory = redactTaskHistory(redacted.taskHistory, plan);
  redacted.savingsLedger = redactSavingsLedger(redacted.savingsLedger, plan);
  redacted.actionExecutions = redactActionExecutions(redacted.actionExecutions, plan);
  redacted.redaction = {
    redactedAt: dateIso(new Date()),
    strategy: "deterministic surrogate IDs",
    fields: [
      "run ids",
      "model/user/team/cluster/tenant/account/reservation refs",
    "commercial contract ids",
    "support ticket ids",
    "provider and eBPF source context",
    "scheduler source context",
    "Grafana dashboard and Explore links",
    "Redfish management-plane context",
    "machine inventory archive",
    "savings ledger scope identifiers",
    "action execution external refs",
    "imported opportunity free text"
    ]
  };

  return redacted;
}

function redactIngestion(ingestion, plan) {
  return {
    ...ingestion,
    entities: redactEntities(ingestion.entities || {}, plan),
    runs: (ingestion.runs || []).map((run) => redactRun(run, plan))
  };
}

function redactMachineInventoryArchive(records = [], plan) {
  if (!Array.isArray(records)) return [];

  return records
    .filter((record) => isPlainObject(record) && isPlainObject(record.run))
    .map((record) => ({
      key: redactMachineInventoryKey(record.key, plan),
      lastSeenAt: record.lastSeenAt,
      run: redactRun(record.run, plan)
    }));
}

function redactMachineInventoryKey(value, plan) {
  if (!value) return undefined;
  return `machine-id:${mappedValue(plan.machineInventoryKeys, value, "machine")}`;
}

function redactEntities(entities, plan) {
  const nextEntities = { ...entities };

  Object.entries(ENTITY_REDACTION_PREFIXES).forEach(([collection, prefix]) => {
    if (!entities[collection]) return;

    nextEntities[collection] = Object.fromEntries(
      Object.entries(entities[collection]).map(([key, value]) => {
        const redactedKey = mappedValue(plan.entities[collection], key, prefix);
        return [
          redactedKey,
          {
            ...value,
            label: redactedLabel(redactedKey)
          }
        ];
      })
    );
  });

  return nextEntities;
}

function redactRun(run, plan) {
  const redactedRunId = mappedValue(plan.runs, run.id, "run");

  return {
    ...run,
    id: redactedRunId,
    name: redactedLabel(redactedRunId),
    refs: redactRefs(run.refs || {}, plan),
    commercial: redactCommercial(run.commercial || {}, plan),
    slo: redactSlo(run.slo || {}, plan),
    schedulerEvidence: redactSchedulerEvidence(run.schedulerEvidence || {}, plan),
    grafanaContext: redactGrafanaContext(run.grafanaContext || {}, plan),
    opportunities: redactOpportunities(run.opportunities || []),
    sourceContext: redactSourceContext(run.sourceContext || {}, plan)
  };
}

function redactRefs(refs, plan) {
  return Object.fromEntries(
    Object.entries(refs).map(([key, value]) => {
      const collection = REF_COLLECTIONS[key];
      return [key, collection ? mappedValue(plan.entities[collection], value, key) : value];
    })
  );
}

function redactCommercial(commercial, plan) {
  return {
    ...commercial,
    contractId: mappedValue(plan.contracts, commercial.contractId, "contract")
  };
}

function redactSlo(slo, plan) {
  return {
    ...slo,
    supportTicketId: mappedValue(plan.tickets, slo.supportTicketId, "ticket")
  };
}

function redactOpportunities(opportunities = []) {
  if (!Array.isArray(opportunities)) return [];

  return opportunities.map((opportunity, index) => compactObject({
    id: opportunity.id ? `opportunity-${index + 1}` : undefined,
    category: opportunity.category ? "Redacted Opportunity" : undefined,
    title: opportunity.title ? "Redacted imported opportunity" : undefined,
    impactDollars: opportunity.impactDollars,
    impactGpuHours: opportunity.impactGpuHours,
    riskScore: opportunity.riskScore,
    confidence: opportunity.confidence,
    evidence: opportunity.evidence ? "Redacted imported opportunity evidence." : undefined,
    recommendation: opportunity.recommendation ? "Review the redacted opportunity in the original workspace." : undefined,
    owner: opportunity.owner ? "redacted-owner" : undefined,
    sourceSignals: opportunity.sourceSignals || {}
  }));
}

function redactSchedulerEvidence(evidence = {}, plan) {
  if (!isPlainObject(evidence)) return {};

  return compactObject({
    ...evidence,
    schedulerName: mappedValue(plan.schedulerNames, evidence.schedulerName, "scheduler"),
    queueName: mappedValue(plan.schedulerQueues, evidence.queueName, "queue"),
    priorityClass: mappedValue(plan.priorityClasses, evidence.priorityClass, "priority"),
    admissionClass: mappedValue(plan.admissionClasses, evidence.admissionClass, "admission"),
    requestedGpuShape: mappedValue(plan.requestedGpuShapes, evidence.requestedGpuShape, "shape"),
    localityPreference: mappedValue(plan.localityPreferences, evidence.localityPreference, "locality"),
    schedulerNames: redactValueList(plan.schedulerNames, evidence.schedulerNames, "scheduler"),
    queueNames: redactValueList(plan.schedulerQueues, evidence.queueNames, "queue"),
    priorityClasses: redactValueList(plan.priorityClasses, evidence.priorityClasses, "priority"),
    admissionClasses: redactValueList(plan.admissionClasses, evidence.admissionClasses, "admission"),
    requestedGpuShapes: redactValueList(plan.requestedGpuShapes, evidence.requestedGpuShapes, "shape"),
    localityPreferences: redactValueList(plan.localityPreferences, evidence.localityPreferences, "locality")
  });
}

function redactGrafanaContext(context = {}, plan) {
  if (!isPlainObject(context)) return {};

  const variables = isPlainObject(context.variables)
    ? Object.fromEntries(Object.entries(context.variables).map(([key, value]) => [
      key,
      mappedValue(plan.grafanaVariableValues, value, "grafana-var")
    ]))
    : undefined;
  const links = Array.isArray(context.links)
    ? context.links.map((link) => compactObject({
      ...link,
      label: link.label ? `${titleCase(link.type || "grafana")} link` : undefined,
      url: mappedValue(plan.grafanaUrls, link.url, "grafana-url")
    }))
    : undefined;

  return compactObject({
    ...context,
    grafanaBaseUrl: mappedValue(plan.grafanaBaseUrls, context.grafanaBaseUrl, "grafana-base"),
    instanceName: mappedValue(plan.grafanaInstances, context.instanceName, "grafana-instance"),
    orgId: mappedValue(plan.grafanaOrgIds, context.orgId, "grafana-org"),
    dashboardUid: mappedValue(plan.grafanaDashboardUids, context.dashboardUid, "grafana-dashboard"),
    dashboardSlug: mappedValue(plan.grafanaDashboardSlugs, context.dashboardSlug, "grafana-slug"),
    dashboardTitle: mappedValue(plan.grafanaDashboardTitles, context.dashboardTitle, "grafana-title"),
    folder: mappedValue(plan.grafanaFolders, context.folder, "grafana-folder"),
    datasourceUid: mappedValue(plan.grafanaDatasourceUids, context.datasourceUid, "grafana-datasource"),
    datasourceName: mappedValue(plan.grafanaDatasourceNames, context.datasourceName, "grafana-datasource-name"),
    dashboardUrl: mappedValue(plan.grafanaUrls, context.dashboardUrl, "grafana-url"),
    exploreUrl: mappedValue(plan.grafanaUrls, context.exploreUrl, "grafana-url"),
    variables,
    links
  });
}

function redactSourceContext(context, plan) {
  return compactObject({
    ...context,
    namespace: mappedValue(plan.namespaces, context.namespace, "namespace"),
    podSelector: mappedValue(plan.podSelectors, context.podSelector, "pod-selector"),
    slurmJobId: mappedValue(plan.slurmJobIds, context.slurmJobId, "slurm-job"),
    ebpfExportId: mappedValue(plan.ebpfExports, context.ebpfExportId, "ebpf-export"),
    host: mappedValue(plan.hosts, context.host, "host"),
    hostname: mappedValue(plan.hostnames, context.hostname, "host"),
    node: mappedValue(plan.nodes, context.node, "node"),
    networkLocalAddress: mappedValue(plan.networkAddresses, context.networkLocalAddress, "net-addr"),
    hostAddress: mappedValue(plan.networkAddresses, context.hostAddress, "net-addr"),
    primaryAddress: mappedValue(plan.networkAddresses, context.primaryAddress, "net-addr"),
    ncclRuntimeHostIp: mappedValue(plan.networkAddresses, context.ncclRuntimeHostIp, "net-addr"),
    ipAddress: mappedValue(plan.networkAddresses, context.ipAddress, "net-addr"),
    machineInventoryKey: redactMachineInventoryKey(context.machineInventoryKey, plan),
    podName: mappedValue(plan.podNames, context.podName, "pod"),
    containerName: mappedValue(plan.containerNames, context.containerName, "container"),
    cgroupPath: mappedValue(plan.cgroupPaths, context.cgroupPath, "cgroup"),
    providerExportId: mappedValue(plan.providerExports, context.providerExportId, "provider-export"),
    billingAccountId: mappedValue(plan.billingAccounts, context.billingAccountId, "billing-account"),
    reservationWindow: mappedValue(plan.reservationWindows, context.reservationWindow, "reservation-window"),
    schedulerExportId: mappedValue(plan.schedulerExports, context.schedulerExportId, "scheduler-export"),
    schedulerName: mappedValue(plan.schedulerNames, context.schedulerName, "scheduler"),
    queueName: mappedValue(plan.schedulerQueues, context.queueName, "queue"),
    priorityClass: mappedValue(plan.priorityClasses, context.priorityClass, "priority"),
    admissionClass: mappedValue(plan.admissionClasses, context.admissionClass, "admission"),
    requestedGpuShape: mappedValue(plan.requestedGpuShapes, context.requestedGpuShape, "shape"),
    localityPreference: mappedValue(plan.localityPreferences, context.localityPreference, "locality"),
    grafanaBaseUrl: mappedValue(plan.grafanaBaseUrls, context.grafanaBaseUrl, "grafana-base"),
    grafanaInstance: mappedValue(plan.grafanaInstances, context.grafanaInstance, "grafana-instance"),
    grafanaOrgId: mappedValue(plan.grafanaOrgIds, context.grafanaOrgId, "grafana-org"),
    grafanaDashboardUid: mappedValue(plan.grafanaDashboardUids, context.grafanaDashboardUid, "grafana-dashboard"),
    grafanaDashboardSlug: mappedValue(plan.grafanaDashboardSlugs, context.grafanaDashboardSlug, "grafana-slug"),
    grafanaDashboardTitle: mappedValue(plan.grafanaDashboardTitles, context.grafanaDashboardTitle, "grafana-title"),
    grafanaFolder: mappedValue(plan.grafanaFolders, context.grafanaFolder, "grafana-folder"),
    grafanaDatasourceUid: mappedValue(plan.grafanaDatasourceUids, context.grafanaDatasourceUid, "grafana-datasource"),
    grafanaDatasourceName: mappedValue(plan.grafanaDatasourceNames, context.grafanaDatasourceName, "grafana-datasource-name"),
    grafanaDashboardUrl: mappedValue(plan.grafanaUrls, context.grafanaDashboardUrl, "grafana-url"),
    grafanaExploreUrl: mappedValue(plan.grafanaUrls, context.grafanaExploreUrl, "grafana-url"),
    redfishBaseUrl: mappedValue(plan.redfishBaseUrls, context.redfishBaseUrl, "redfish-base"),
    redfishServiceUuid: mappedValue(plan.redfishServiceUuids, context.redfishServiceUuid, "redfish-service"),
    redfishBiosVersion: mappedValue(plan.redfishBiosVersions, context.redfishBiosVersion, "redfish-bios"),
    redfishManagerFirmwareVersion: mappedValue(plan.redfishManagerFirmwareVersions, context.redfishManagerFirmwareVersion, "redfish-manager-fw"),
    redfishSystems: redactValueList(plan.redfishSystems, context.redfishSystems, "redfish-system"),
    redfishChassis: redactValueList(plan.redfishChassis, context.redfishChassis, "redfish-chassis"),
    redfishManagers: redactValueList(plan.redfishManagers, context.redfishManagers, "redfish-manager"),
    redfishFirmwareInventory: redactValueList(plan.redfishFirmwareInventory, context.redfishFirmwareInventory, "redfish-firmware"),
    redfishWarnings: Array.isArray(context.redfishWarnings) ? context.redfishWarnings.map((_warning, index) => `redfish-warning-${index + 1}`) : undefined,
    gpuComputeProcesses: redactGpuProcesses(context.gpuComputeProcesses, plan),
    gpuProcessOwners: redactValueList(plan.gpuProcessUsers, context.gpuProcessOwners, "gpu-user"),
    gpuProcessInspector: redactGpuProcessInspector(context.gpuProcessInspector, plan)
  });
}

function redactGpuProcesses(processes, plan) {
  return Array.isArray(processes)
    ? processes.map((processEntry) => compactObject({
      ...processEntry,
      username: mappedValue(plan.gpuProcessUsers, processEntry?.username, "gpu-user"),
      processName: mappedValue(plan.gpuProcessCommands, processEntry?.processName, "gpu-process"),
      command: mappedValue(plan.gpuProcessCommands, processEntry?.command, "gpu-process")
    }))
    : undefined;
}

function redactGpuProcessInspector(inspector, plan) {
  if (!isPlainObject(inspector)) return undefined;
  return compactObject({
    ...inspector,
    ownerNames: redactValueList(plan.gpuProcessUsers, inspector.ownerNames, "gpu-user"),
    topProcesses: redactGpuProcesses(inspector.topProcesses, plan),
    largestProcess: redactGpuProcesses(inspector.largestProcess ? [inspector.largestProcess] : [], plan)?.[0] || null
  });
}

function redactBaselineStore(baselines = {}, plan) {
  return Object.fromEntries(
    Object.entries(baselines).map(([runId, baseline]) => [
      mappedValue(plan.runs, runId, "run"),
      baseline
    ])
  );
}

function redactSnapshots(snapshots = [], plan) {
  return snapshots.map((snapshot) => {
    const key = redactSnapshotKey(snapshot.scope, snapshot.key, plan);
    return {
      ...snapshot,
      key,
      label: key === snapshot.key ? snapshot.label : redactedLabel(key)
    };
  });
}

function redactTaskHistory(records = [], plan) {
  if (!Array.isArray(records)) return [];

  return records.map((record) => {
    const taskKey = mappedValue(plan.taskKeys, record.taskKey, "task");
    const key = record.scope === "job" ? mappedValue(plan.runs, record.key, "run") : record.key;

    return {
      ...record,
      key,
      label: redactedLabel(taskKey),
      taskKey,
      taskLabel: redactedLabel(taskKey),
      taskFamily: taskKey,
      runIds: redactValueList(plan.runs, record.runIds, "run"),
      resources: redactTaskResources(record.resources || {}, plan)
    };
  });
}

function redactSavingsLedger(records = [], plan) {
  if (!Array.isArray(records)) return [];

  return records.map((entry) => {
    const scope = isPlainObject(entry.scope) ? entry.scope : {};
    const scopeKey = redactSnapshotKey(scope.type, scope.key, plan);
    return {
      ...entry,
      actionTitle: entry.actionTitle ? "Redacted ledger action" : "",
      scope: {
        type: scope.type || "tenant",
        key: scopeKey
      },
      evidenceRef: entry.evidenceRef ? "redacted-evidence-ref" : ""
    };
  });
}

function redactActionExecutions(records = [], plan) {
  if (!Array.isArray(records)) return [];

  return records.map((record) => {
    const scope = isPlainObject(record.scope) ? record.scope : {};
    return {
      ...record,
      actionTitle: record.actionTitle ? "Redacted action execution" : "",
      scope: {
        type: scope.type || "tenant",
        key: redactSnapshotKey(scope.type, scope.key, plan)
      },
      externalRef: record.externalRef ? "redacted-external-ref" : "",
      approvedBy: record.approvedBy ? "redacted-approver" : ""
    };
  });
}

function redactTaskResources(resources = {}, plan) {
  return {
    ...resources,
    gpuModels: redactValueList(plan.taskGpuModels, resources.gpuModels, "gpu-model"),
    clusters: redactValueList(plan.taskClusters, resources.clusters, "cluster"),
    nodes: redactValueList(plan.taskNodes, resources.nodes, "node"),
    partialNodes: redactValueList(plan.taskNodes, resources.partialNodes, "node"),
    tenants: redactValueList(plan.taskTenants, resources.tenants, "tenant"),
    accounts: redactValueList(plan.taskAccounts, resources.accounts, "account"),
    reservations: redactValueList(plan.taskReservations, resources.reservations, "reservation"),
    schedulerNames: redactValueList(plan.schedulerNames, resources.schedulerNames, "scheduler"),
    queueNames: redactValueList(plan.schedulerQueues, resources.queueNames, "queue"),
    priorityClasses: redactValueList(plan.priorityClasses, resources.priorityClasses, "priority"),
    admissionClasses: redactValueList(plan.admissionClasses, resources.admissionClasses, "admission"),
    requestedGpuShapes: redactValueList(plan.requestedGpuShapes, resources.requestedGpuShapes, "shape"),
    localityPreferences: redactValueList(plan.localityPreferences, resources.localityPreferences, "locality"),
    hosts: redactValueList(plan.taskHosts, resources.hosts, "host")
  };
}

function redactSnapshotKey(scope, key, plan) {
  if (scope === "job") return mappedValue(plan.runs, key, "run");

  const collection = REF_COLLECTIONS[scope];
  if (!collection) return key;

  return mappedValue(plan.entities[collection], key, scope);
}

function redactValueList(map, values, prefix) {
  if (!Array.isArray(values)) return undefined;
  return values.map((value) => mappedValue(map, value, prefix)).filter(Boolean);
}

function redactedLabel(key) {
  const [prefix, suffix] = String(key).split("-");
  return `${titleCase(prefix)} ${suffix || ""}`.trim();
}

function dashboardApiTokenControl() {
  const wrap = document.createElement("div");
  wrap.className = "dashboard-api-token-control";

  const label = document.createElement("label");
  label.setAttribute("for", "platformApiTokenInput");
  label.textContent = "Platform API token";

  const input = document.createElement("input");
  input.id = "platformApiTokenInput";
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = platformApiAuthToken() ? "Token saved locally" : "Paste bearer token";
  input.value = platformApiAuthToken();

  const status = document.createElement("span");
  status.textContent = platformApiAuthToken() ? "Saved locally" : "No token";
  status.dataset.tone = platformApiAuthToken() ? "good" : "watch";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.addEventListener("click", () => {
    const ok = writePlatformApiAuthToken(input.value.trim());
    status.textContent = ok ? (input.value.trim() ? "Saved locally" : "No token") : "Not saved";
    status.dataset.tone = ok ? (input.value.trim() ? "good" : "watch") : "poor";
  });

  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    input.value = "";
    const ok = writePlatformApiAuthToken("");
    status.textContent = ok ? "No token" : "Not cleared";
    status.dataset.tone = ok ? "watch" : "poor";
  });

  const actions = document.createElement("div");
  actions.append(save, clear);

  wrap.append(label, input, actions, status);
  return wrap;
}

function dashboardBlockToggle(block) {
  const label = document.createElement("label");
  label.className = "dashboard-block-toggle";
  label.dataset.enabled = String(dashboardBlockEnabled(block.id));

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = dashboardBlockEnabled(block.id);
  input.addEventListener("change", () => setDashboardBlockEnabled(block.id, input.checked));

  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = block.label;
  const note = document.createElement("small");
  note.textContent = block.note;
  copy.append(title, note);

  label.append(input, copy);
  return label;
}

function machineInventoryEntryState(summary, machineContext) {
  const item = (summary.sourceItems || []).find(isMachineDemoItem) || summary.jobs?.[0] || null;
  const context = machineContext?.context || item?.source?.context || {};
  const uptimeSeconds = optionalMetric(context, "uptimeSeconds");

  return {
    key: machineInventoryKeyForItem(item),
    missing: Boolean(context.machineInventoryMissing),
    lastSeenAt: validDateIso(context.machineInventoryLastSeenAt || context.generatedAt),
    uptimeSeconds
  };
}

function machineDemoContext(summary) {
  const sourceItems = summary.sourceItems || [];
  const machineItem = sourceItems.find(isMachineDemoItem);
  if (!machineItem) return null;

  const context = machineItem.source?.context || {};
  const services = machineDemoServices(context.observedServices);
  const ollamaModels = Array.isArray(context.ollamaModels) ? context.ollamaModels : [];
  const ollamaRunningModels = Array.isArray(context.ollamaRunningModels) ? context.ollamaRunningModels : [];
  const ollamaTokensPerSecond = numeric(context.ollamaTokensPerSecond, 0);
  const ollamaTimeToFirstTokenMs = numeric(context.ollamaTimeToFirstTokenMs, 0);
  const idleStatus = sourceItems.some((item) => /gpu idle|idle capacity/i.test(String(item.status || "")));
  const adapters = unique(["local-machine", ...(machineItem.source?.adapters || [])]);
  const gpuModel = machineDemoGpuModel(context, summary, machineItem);
  const gpuPresent = context.gpuPresent === true || (
    summary.gpus > 0
    && !/no nvidia|unavailable|none/i.test(gpuModel)
  );
  const driverUnavailable = !gpuPresent && context.gpuSource === "nvidia-smi-unavailable";
  const gb10MonitoringList = Array.isArray(context.gb10MonitoringList) ? context.gb10MonitoringList : [];
  const gb10Present = Boolean(context.gb10Present) || isGb10GpuModel(gpuModel);

  return {
    host: context.hostname || summary.clusters[0] || "this host",
    gpuModel,
    adapters: adapters.join(", "),
    services: services.length ? services.join(", ") : "local observability services",
    modelCount: ollamaModels.length,
    ollamaRunningModels,
    ollamaTelemetryStatus: String(context.ollamaTelemetryStatus || ""),
    ollamaProbeModel: String(context.ollamaProbeModel || ""),
    ollamaTokensPerSecond,
    ollamaTimeToFirstTokenMs,
    ollamaTelemetryAvailable: ollamaTokensPerSecond > 0 || ollamaTimeToFirstTokenMs > 0,
    ollamaProbeCached: Boolean(context.ollamaProbeCached),
    ollamaProbeAgeMs: numeric(context.ollamaProbeAgeMs),
    ollamaProbeError: String(context.ollamaProbeError || ""),
    gb10Present,
    gb10MonitoringList,
    linuxUmaMemoryTotalBytes: numeric(context.linuxUmaMemoryTotalBytes, context.memoryTotalBytes),
    linuxUmaMemoryAvailableBytes: numeric(context.linuxUmaMemoryAvailableBytes, context.memoryAvailableBytes),
    linuxUmaMemoryUsedPct: numeric(context.linuxUmaMemoryUsedPct, context.memoryUsedPct),
    appMetricsReachable: Boolean(context.appMetricsReachable),
    collectorGatewayReachable: Boolean(context.collectorGatewayReachable),
    collectorAcceptedBatchesTotal: optionalMetric(context, "collectorAcceptedBatchesTotal"),
    collectorWrittenRowsTotal: optionalMetric(context, "collectorWrittenRowsTotal"),
    collectorIncomingReportsPerSecond: optionalMetric(context, "collectorIncomingReportsPerSecond"),
    collectorIncomingReportsPerMinute: optionalMetric(context, "collectorIncomingReportsPerMinute"),
    collectorIncomingReportsWindowCount: optionalMetric(context, "collectorIncomingReportsWindowCount"),
    collectorIncomingReportsWindowSeconds: optionalMetric(context, "collectorIncomingReportsWindowSeconds"),
    collectorAuthBearer: Boolean(context.collectorAuthBearer),
    collectorAuthHmac: Boolean(context.collectorAuthHmac),
    collectorAuthMtls: Boolean(context.collectorAuthMtls),
    apiAuthRequired: Boolean(context.apiAuthRequired),
    hardwareHealthScore: optionalMetric(context, "hardwareHealthScore"),
    hardwareFaultScore: optionalMetric(context, "hardwareFaultScore"),
    hardwareFaultLevel: String(context.hardwareFaultLevel || ""),
    hardwareFaultCount: optionalMetric(context, "hardwareFaultCount"),
    hardwareCriticalFaultCount: optionalMetric(context, "hardwareCriticalFaultCount"),
    hardwareWarningFaultCount: optionalMetric(context, "hardwareWarningFaultCount"),
    hardwareKernelEventCount: optionalMetric(context, "hardwareKernelEventCount"),
    hardwareMachineCheckCount: optionalMetric(context, "hardwareMachineCheckCount"),
    hardwareGpuXidCount: optionalMetric(context, "hardwareGpuXidCount"),
    hardwareStorageErrorCount: optionalMetric(context, "hardwareStorageErrorCount"),
    hardwarePcieAerCount: optionalMetric(context, "hardwarePcieAerCount"),
    hardwareOomKillCount: optionalMetric(context, "hardwareOomKillCount"),
    hardwareFailedUnitCount: optionalMetric(context, "hardwareFailedUnitCount"),
    hardwareThermalThrottleActive: Boolean(context.hardwareThermalThrottleActive),
    hardwareRepairAction: String(context.hardwareRepairAction || ""),
    hardwareRepairConfidence: optionalMetric(context, "hardwareRepairConfidence"),
    hardwareRepairRequiresApproval: Boolean(context.hardwareRepairRequiresApproval),
    hardwareRcaFingerprint: String(context.hardwareRcaFingerprint || ""),
    hardwareFaults: Array.isArray(context.hardwareFaults) ? context.hardwareFaults : [],
    nsightCuptiProfilingStatus: String(context.nsightCuptiProfilingStatus || ""),
    ncclRuntimePresent: Boolean(context.ncclRuntimePresent),
    ncclRuntimeStatus: String(context.ncclRuntimeStatus || ""),
    ncclRuntimeSource: String(context.ncclRuntimeSource || ""),
    ncclRuntimeContainers: Array.isArray(context.ncclRuntimeContainers) ? context.ncclRuntimeContainers : [],
    ncclRuntimeImages: Array.isArray(context.ncclRuntimeImages) ? context.ncclRuntimeImages : [],
    ncclRuntimeSocketIfname: String(context.ncclRuntimeSocketIfname || ""),
    ncclRuntimeHostIp: String(context.ncclRuntimeHostIp || ""),
    ncclRuntimeDetail: String(context.ncclRuntimeDetail || ""),
    benchmarkSuiteName: String(context.benchmarkSuiteName || ""),
    benchmarkSuiteStatus: String(context.benchmarkSuiteStatus || ""),
    benchmarkGeneratedAt: String(context.benchmarkGeneratedAt || ""),
    benchmarkSampleCached: Boolean(context.benchmarkSampleCached),
    benchmarkSampleAgeMs: optionalMetric(context, "benchmarkSampleAgeMs"),
    benchmarkTtlMs: optionalMetric(context, "benchmarkTtlMs"),
    benchmarkDurationMs: optionalMetric(context, "benchmarkDurationMs"),
    benchmarkCpuOpsPerSecond: optionalMetric(context, "benchmarkCpuOpsPerSecond"),
    benchmarkMemoryMiBps: optionalMetric(context, "benchmarkMemoryMiBps"),
    benchmarkDiskWriteMiBps: optionalMetric(context, "benchmarkDiskWriteMiBps"),
    benchmarkDiskReadMiBps: optionalMetric(context, "benchmarkDiskReadMiBps"),
    benchmarkGpuScore: optionalMetric(context, "benchmarkGpuScore"),
    benchmarkGpuMemoryMiBps: optionalMetric(context, "benchmarkGpuMemoryMiBps"),
    benchmarkGpuTensorOpsPerSecond: optionalMetric(context, "benchmarkGpuTensorOpsPerSecond"),
    benchmarkNetworkMbps: optionalMetric(context, "benchmarkNetworkMbps"),
    benchmarkNetworkLatencyUs: optionalMetric(context, "benchmarkNetworkLatencyUs"),
    benchmarkGlobalScore: optionalMetric(context, "benchmarkGlobalScore"),
    benchmarkGlobalPercentile: optionalMetric(context, "benchmarkGlobalPercentile"),
    benchmarkGlobalDataset: String(context.benchmarkGlobalDataset || ""),
    benchmarkGlobalUrl: String(context.benchmarkGlobalUrl || ""),
    benchmarkOcpCommonsScore: optionalMetric(context, "benchmarkOcpCommonsScore"),
    benchmarkOcpCommonsPercentile: optionalMetric(context, "benchmarkOcpCommonsPercentile"),
    benchmarkOcpCommonsDataset: String(context.benchmarkOcpCommonsDataset || ""),
    benchmarkOcpCommonsUrl: String(context.benchmarkOcpCommonsUrl || ""),
    benchmarkOcpCommonsPeerCount: optionalMetric(context, "benchmarkOcpCommonsPeerCount"),
    benchmarkOcpCommonsHardwareClass: String(context.benchmarkOcpCommonsHardwareClass || ""),
    benchmarkOcpCommonsConfigHash: String(context.benchmarkOcpCommonsConfigHash || ""),
    benchmarkOcpCommonsBinning: String(context.benchmarkOcpCommonsBinning || ""),
    benchmarkOcpCommonsPolicy: String(context.benchmarkOcpCommonsPolicy || ""),
    benchmarkScore: optionalMetric(context, "benchmarkScore"),
    benchmarkError: String(context.benchmarkError || ""),
    clockSource: String(context.clockSource || ""),
    clockSynchronized: Boolean(context.clockSynchronized),
    clockTimeUnixMs: optionalMetric(context, "clockTimeUnixMs"),
    clockTimeUnixNs: String(context.clockTimeUnixNs || ""),
    clockTimezone: String(context.clockTimezone || ""),
    clockLocalRtc: Boolean(context.clockLocalRtc),
    clockOffsetNs: optionalMetric(context, "clockOffsetNs"),
    clockRmsOffsetNs: optionalMetric(context, "clockRmsOffsetNs"),
    clockPtpInstalled: Boolean(context.clockPtpInstalled),
    clockPtpActive: Boolean(context.clockPtpActive),
    clockPtpPortState: String(context.clockPtpPortState || ""),
    clockPtpGrandmaster: String(context.clockPtpGrandmaster || ""),
    clockChronyReference: String(context.clockChronyReference || ""),
    clockChronyStratum: optionalMetric(context, "clockChronyStratum"),
    clockSyncServices: Array.isArray(context.clockSyncServices) ? context.clockSyncServices : [],
    clockSyncDetail: String(context.clockSyncDetail || ""),
    machineInventoryKey: String(context.machineInventoryKey || ""),
    machineInventoryLive: context.machineInventoryLive !== false,
    machineInventoryMissing: Boolean(context.machineInventoryMissing),
    machineInventoryLastSeenAt: String(context.machineInventoryLastSeenAt || context.generatedAt || ""),
    context,
    platform: String(context.platform || ""),
    arch: String(context.arch || ""),
    uptimeSeconds: optionalMetric(context, "uptimeSeconds"),
    gpuUtilizationPct: numeric(context.gpuUtilizationPct, summary.gpuUtil),
    gpuMemoryUsedPct: numeric(context.gpuMemoryUsedPct, summary.hbmCapacity),
    gpuMemoryUsedMiB: numeric(context.gpuMemoryUsedMiB),
    gpuMemoryTotalMiB: numeric(context.gpuMemoryTotalMiB),
    gpuMemoryUtilizationPct: optionalMetric(context, "gpuMemoryUtilizationPct"),
    gpuTemperatureC: numeric(context.gpuTemperatureC),
    gpuPowerWatts: numeric(context.gpuPowerWatts),
    gpuFanSpeedPct: optionalMetric(context, "gpuFanSpeedPct"),
    gpuClockMHz: firstFinite(optionalMetric(context, "gpuClockMHz"), optionalMetric(context, "gpuSmClockMHz")),
    gpuSmClockMHz: optionalMetric(context, "gpuSmClockMHz"),
    gpuMemoryClockMHz: optionalMetric(context, "gpuMemoryClockMHz"),
    gpuProcesses: Array.isArray(context.gpuComputeProcesses) ? context.gpuComputeProcesses : [],
    gpuProcessInspector: isPlainObject(context.gpuProcessInspector) ? context.gpuProcessInspector : {},
    gpuProcessInspectorStatus: String(context.gpuProcessInspectorStatus || context.gpuProcessInspector?.status || ""),
    gpuProcessInspectorSummary: String(context.gpuProcessInspectorSummary || context.gpuProcessInspector?.summary || ""),
    gpuProcessCount: optionalMetric(context, "gpuProcessCount"),
    gpuProcessMemoryMiB: optionalMetric(context, "gpuProcessMemoryMiB"),
    gpuProcessOwners: Array.isArray(context.gpuProcessOwners) ? context.gpuProcessOwners : [],
    gpuProcessQuerySkipped: Boolean(context.gpuComputeProcessQuerySkipped),
    gpuSampleCached: Boolean(context.gpuSampleCached),
    gpuSampleAgeMs: numeric(context.gpuSampleAgeMs),
    gpuDiagnosticsSampleCached: Boolean(context.gpuDiagnosticsSampleCached),
    gpuThermalQualification: isPlainObject(context.gpuThermalQualification) ? context.gpuThermalQualification : {},
    gpuThermalQualificationStatus: String(context.gpuThermalQualificationStatus || context.gpuThermalQualification?.status || ""),
    gpuThermalQualificationSummary: String(context.gpuThermalQualificationSummary || context.gpuThermalQualification?.summary || ""),
    gpuThermalQualificationComparable: Boolean(context.gpuThermalQualificationComparable),
    gpuThermalThrottleActive: Boolean(context.gpuThermalThrottleActive),
    gpuThermalMarginToSlowdownC: optionalMetric(context, "gpuThermalMarginToSlowdownC"),
    gpuThermalMarginToMaxOperatingC: optionalMetric(context, "gpuThermalMarginToMaxOperatingC"),
    gpuMemoryTemperatureC: optionalMetric(context, "gpuMemoryTemperatureC"),
    gpuPowerLimitWatts: optionalMetric(context, "gpuPowerLimitWatts"),
    gpuTopology: isPlainObject(context.gpuTopology) ? context.gpuTopology : {},
    gpuTopologyStatus: String(context.gpuTopologyStatus || context.gpuTopology?.status || ""),
    gpuTopologyFingerprint: String(context.gpuTopologyFingerprint || context.gpuTopology?.fingerprint || ""),
    gpuTopologySummary: String(context.gpuTopologySummary || context.gpuTopology?.summary || ""),
    gpuTopologyDeviceCount: optionalMetric(context, "gpuTopologyDeviceCount"),
    gpuTopologyPeerLinkCount: optionalMetric(context, "gpuTopologyPeerLinkCount"),
    gpuTopologyNvlinkLinks: optionalMetric(context, "gpuTopologyNvlinkLinks"),
    gpuTopologyPcieLinks: optionalMetric(context, "gpuTopologyPcieLinks"),
    cpuUsagePct: numeric(context.cpuUsagePct),
    cpuTemperatureC: optionalMetric(context, "cpuTemperatureC"),
    memoryUsedPct: numeric(context.memoryUsedPct),
    diskUsedPct: numeric(context.diskUsedPct),
    lakehouseRoot: String(context.lakehouseRoot || ""),
    lakehouseExists: Boolean(context.lakehouseExists),
    lakehouseMeasuredAt: String(context.lakehouseMeasuredAt || ""),
    lakehouseUsedBytes: optionalMetric(context, "lakehouseUsedBytes"),
    lakehouseDiskFilesystem: String(context.lakehouseDiskFilesystem || ""),
    lakehouseDiskType: String(context.lakehouseDiskType || ""),
    lakehouseDiskTotalBytes: optionalMetric(context, "lakehouseDiskTotalBytes"),
    lakehouseDiskUsedBytes: optionalMetric(context, "lakehouseDiskUsedBytes"),
    lakehouseDiskAvailableBytes: optionalMetric(context, "lakehouseDiskAvailableBytes"),
    lakehouseDiskUsedPct: optionalMetric(context, "lakehouseDiskUsedPct"),
    networkInterface: String(context.networkInterface || ""),
    networkLocalAddress: String(context.networkLocalAddress || ""),
    networkPeerAddress: String(context.networkPeerAddress || ""),
    networkLinkRole: String(context.networkLinkRole || ""),
    networkSelectionReason: String(context.networkSelectionReason || ""),
    networkLinkSpeedMbps: optionalMetric(context, "networkLinkSpeedMbps"),
    networkRxBytes: optionalMetric(context, "networkRxBytes"),
    networkTxBytes: optionalMetric(context, "networkTxBytes"),
    networkRxBytesPerSecond: optionalMetric(context, "networkRxBytesPerSecond"),
    networkTxBytesPerSecond: optionalMetric(context, "networkTxBytesPerSecond"),
    networkUtilizationPct: optionalMetric(context, "networkUtilizationPct"),
    networkThroughputBps: maxFinite(context.networkRxBytesPerSecond, context.networkTxBytesPerSecond),
    networkRxDrops: optionalMetric(context, "networkRxDrops"),
    networkTxDrops: optionalMetric(context, "networkTxDrops"),
    networkRxErrors: optionalMetric(context, "networkRxErrors"),
    networkTxErrors: optionalMetric(context, "networkTxErrors"),
    dockerContainers: Array.isArray(context.dockerContainers) ? context.dockerContainers : [],
    workloadCountersObserved: Boolean(context.workloadCountersObserved),
    unavailableExports: Array.isArray(context.unavailableExports) ? context.unavailableExports : [],
    gpuPresent,
    gpuSource: String(context.gpuSource || ""),
    gpuError: String(context.gpuError || ""),
    driverUnavailable,
    noGpu: !gpuPresent && !driverUnavailable,
    idle: gpuPresent && (idleStatus || (
      summary.gpus > 0
      && summary.gpuUtil <= 1
      && summary.usefulCompute <= 1
      && summary.steps === 0
      && summary.inferenceRequestsM === 0
    ))
  };
}

function machineDemoHeadline(machineContext, gpuUtil, useful) {
  if (machineContext.machineInventoryMissing) {
    return `${machineContext.host} is offline; showing last-known telemetry.`;
  }
  if (machineContext.driverUnavailable) {
    return `NVIDIA telemetry is unavailable on ${machineContext.host}.`;
  }
  if (machineContext.noGpu) {
    return `${machineContext.host} is reporting host telemetry without NVIDIA GPU counters.`;
  }
  if (machineContext.idle) {
    return `${machineContext.gpuModel} is present but idle on ${machineContext.host}.`;
  }

  return `Live ${machineContext.host} telemetry: ${gpuUtil}% GPU utilization, ${useful}% useful compute.`;
}

function machineDemoNarrative(machineContext) {
  const modelText = `${machineContext.modelCount} local Ollama model${machineContext.modelCount === 1 ? "" : "s"}`;
  const serviceText = machineDemoServicePhrase(machineContext);
  if (machineContext.machineInventoryMissing) {
    return `${machineContext.host} was ${formatMachineLastSeen(machineContext.machineInventoryLastSeenAt)}. The inventory keeps this grayed-out record until telemetry returns or it is removed from Inventory Machines.`;
  }
  if (machineContext.driverUnavailable) {
    const error = machineContext.gpuError ? ` ${machineContext.gpuError}` : "";
    return `Observed from ${machineContext.adapters}. nvidia-smi is installed, but it cannot communicate with the NVIDIA driver.${error} ${serviceText}, and ${modelText} are installed.`;
  }
  if (machineContext.noGpu) {
    return `Observed from ${machineContext.adapters}. No usable NVIDIA GPU counter source was detected; ${serviceText}, and ${modelText} are installed.`;
  }
  if (machineContext.idle && machineContext.gpuProcessQuerySkipped) {
    return `Observed from ${machineContext.adapters}. NVIDIA process lookup is skipped in high-rate refresh mode; ${serviceText}, and ${modelText} are installed. This is a live utilization view, not a workload bottleneck claim.`;
  }
  if (machineContext.idle) {
    return `Observed from ${machineContext.adapters}. No active NVIDIA compute process was detected; ${serviceText}, and ${modelText} are installed. This is an idle-capacity observation, not a workload bottleneck claim.`;
  }

  return `Observed from ${machineContext.adapters}. ${machineContext.services} are available on the host, so refreshes reflect the current machine bundle rather than a provider fixture.`;
}

function machineDemoServicePhrase(machineContext) {
  const services = machineDemoServices(machineContext.context.observedServices);
  if (!services.length) return "no local observability service was detected";
  return `${services.join(", ")} ${services.length === 1 ? "is" : "are"} running`;
}

function machineDemoGpuModel(context, summary, machineItem) {
  const summaryModel = (summary.gpuModels || []).find((model) => model && model !== "none");
  if (summaryModel) return summaryModel;
  if (context.gpuName) return context.gpuName;
  if (context.gpuSource === "nvidia-smi-unavailable") return "NVIDIA telemetry unavailable";
  return machineItem.gpuModel || "No NVIDIA GPU telemetry";
}

function machineDemoServices(observedServices) {
  if (Array.isArray(observedServices)) return observedServices.filter(Boolean);
  if (typeof observedServices === "string") {
    return observedServices.split(",").map((service) => service.trim()).filter(Boolean);
  }

  return [];
}

function machineContextFromSourceItem(summary, item) {
  const rawContext = item.source?.context || {};
  if (!isPlainObject(rawContext)) return null;

  const host = rawContext.hostname || rawContext.node || item.cluster || item.name || item.id || "this host";
  const gpuModel = rawContext.gpuName || item.gpuModel || "";
  const hasGpu = rawContext.gpuPresent === true || Boolean(rawContext.gpuName) || numeric(item.gpus, 0) > 0;
  const source = item.source || {};
  const context = {
    ...rawContext,
    hostname: host
  };
  const singleItem = {
    ...item,
    source: {
      ...source,
      adapters: unique(["local-machine", ...(source.adapters || [])]),
      context
    }
  };
  const singleSummary = {
    ...summary,
    sourceItems: [singleItem],
    clusters: [host],
    gpuModels: gpuModel ? [gpuModel] : [],
    gpus: hasGpu ? Math.max(1, numeric(item.gpus, 1)) : 0,
    gpuUtil: numeric(rawContext.gpuUtilizationPct, numeric(item.gpuUtil, summary.gpuUtil)),
    usefulCompute: numeric(rawContext.gpuUtilizationPct, numeric(item.usefulCompute, summary.usefulCompute)),
    hbmCapacity: numeric(rawContext.gpuMemoryUsedPct, summary.hbmCapacity),
    steps: numeric(item.steps, summary.steps),
    inferenceRequestsM: numeric(item.inferenceRequestsM, summary.inferenceRequestsM)
  };

  return machineDemoContext(singleSummary);
}
