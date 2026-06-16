/**
 * turbalance Analytics — DOM rendering and operator-cockpit view functions
 *
 * Extracted from app.js (PR5 modularization). Loaded as a classic <script>
 * BEFORE app.js; these are top-level function declarations (global, hoisted,
 * lazily executed), so load order among the app-*.js modules does not matter
 * and they may freely reference app.js's top-level state at call time.
 */

function render() {
  renderScopeControls();
  renderAnalysisStamp();
  renderIngestState();
  renderDashboardSettingsPanel();

  const entries = buildEntries(state.scope);
  if (!entries.some((entry) => entry.key === state.selectedKey)) {
    state.selectedKey = entries[0].key;
  }

  const activeEntry = entries.find((entry) => entry.key === state.selectedKey);
  const summary = displaySummary(activeEntry);
  const classifier = classifyBottlenecks(summary);
  const components = scoreComponents(summary);
  const fingerprint = fingerprintWorkload(summary);
  const provider = providerEconomics(summary);
  const opportunityEngine = generateOpportunities(summary, classifier, provider);
  const schedulerSimulator = simulateScheduler(summary);

  renderInventory(entries);
  renderDiagnosis(summary, classifier);
  renderLiveResources(summary);
  renderOperatorCockpit(summary, classifier, opportunityEngine, schedulerSimulator);
  renderMetricRibbon(summary);
  renderStandaloneUnitEconomics(summary);
  renderSchedulerSimulator(schedulerSimulator, summary);
  renderGrafanaHandoff(summary);
  renderTaskMemory(buildTaskMemory(summary, classifier));
  renderTrend(summary);
  renderTruthTable(summary);
  renderBottleneck(summary, classifier);
  renderProviderLens(summary, provider, classifier);
  renderProviderSummaryTables();
  renderOpportunityCenter(opportunityEngine);
  renderPredictivePrescriptive(summary, classifier, opportunityEngine);
  renderComponents(components);
  renderTopology(summary);
  renderFingerprint(fingerprint);
  renderRegression(summary);
  renderReport(summary, classifier);
  applyDashboardBlockVisibility();
}

function renderPredictivePrescriptive(summary, classifier, opportunityEngine) {
  const predictivePanel = document.querySelector("#predictiveAnalyticsPanel");
  const prescriptivePanel = document.querySelector("#prescriptiveActionsPanel");
  if (!predictivePanel && !prescriptivePanel) return;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  if (typeof TurbaPredictive === "undefined") {
    const unavailable = "Predictive and prescriptive analysis is unavailable in this build.";
    if (predictivePanel && dashboardBlockEnabled("predictiveAnalytics")) {
      predictivePanel.replaceChildren(el("div", "operator-empty predictive-empty", unavailable));
      updatePanelBadge("#predictiveAnalyticsBadge", "Offline", "poor");
    }
    if (prescriptivePanel && dashboardBlockEnabled("prescriptiveActions")) {
      prescriptivePanel.replaceChildren(el("div", "operator-empty predictive-empty", unavailable));
      updatePanelBadge("#prescriptiveActionsBadge", "Offline", "poor");
    }
    return;
  }

  const series = predictiveSeriesForScope(summary);
  const predictive = TurbaPredictive.analyzePredictive(series, { horizon: 4, metrics: PREDICTIVE_METRIC_CONFIG });
  const prescriptive = TurbaPredictive.analyzePrescriptive(opportunityEngine?.opportunities || [], {
    predictive,
    effortBudget: 8,
    riskTolerance: "medium",
    minImpactDollars: 25,
    minImpactGpuHours: 1
  });

  if (predictivePanel) {
    if (dashboardBlockEnabled("predictiveAnalytics")) {
      const rendered = buildPredictivePanelNodes(el, predictive, series);
      predictivePanel.replaceChildren(...rendered.nodes);
      updatePanelBadge("#predictiveAnalyticsBadge", rendered.badge, rendered.tone);
    } else {
      predictivePanel.replaceChildren();
    }
  }

  if (prescriptivePanel) {
    if (dashboardBlockEnabled("prescriptiveActions")) {
      const rendered = buildPrescriptivePanelNodes(el, prescriptive);
      prescriptivePanel.replaceChildren(...rendered.nodes);
      updatePanelBadge("#prescriptiveActionsBadge", rendered.badge, rendered.tone);
    } else {
      prescriptivePanel.replaceChildren();
    }
  }

}

function buildPredictivePanelNodes(el, predictive, series) {
  const nodes = [];

  const forecastKeys = Object.keys(predictive.metrics);
  if (!forecastKeys.length) {
    nodes.push(el("div", "operator-empty predictive-empty",
      "Capture two or more analysis snapshots for this scope to unlock predictive forecasts."));
    return { nodes, badge: "Needs history", tone: "watch" };
  }

  const grid = el("div", "predictive-forecast-grid");
  let signalCount = 0;
  forecastKeys.forEach((key) => {
    const metric = predictive.metrics[key];
    const fc = metric.forecast;
    if (!fc || !fc.ok) return;
    if (!predictiveMetricHasSignal(metric, series[key])) return;
    signalCount += 1;
    const card = el("div", "predictive-forecast-card");
    card.dataset.trend = fc.trend;
    card.append(el("div", "predictive-metric-label", metric.label));
    card.append(el("div", "predictive-metric-now", `now ${fc.lastValue} -> ${fc.projectedValue} in ${fc.horizon} snapshots`));
    const meta = el("div", "predictive-metric-meta");
    meta.append(el("span", "predictive-trend-pill", fc.trend));
    meta.append(el("span", "predictive-conf", `conf ${fc.confidence}%`));
    if (metric.saturation && metric.saturation.ok && metric.saturation.willCross) {
      const sat = metric.saturation;
      const eta = Number.isFinite(sat.etaDays) ? `~${sat.etaDays}d` : `~${sat.periodsToThreshold} periods`;
      meta.append(el("span", "predictive-saturation", `crosses ${sat.threshold} in ${eta}`));
    }
    if (metric.risk && metric.risk.ok && (metric.risk.band === "elevated" || metric.risk.band === "critical")) {
      meta.append(el("span", "predictive-risk", `regression risk ${metric.risk.score}`));
    }
    if (metric.anomalies && metric.anomalies.ok && metric.anomalies.latest && metric.anomalies.latest.isAnomaly) {
      meta.append(el("span", "predictive-anomaly", `anomaly ${metric.anomalies.latest.score}`));
    }
    card.append(meta);
    grid.append(card);
  });

  if (signalCount) {
    const wrap = el("div", "predictive-forecasts");
    wrap.append(el("h4", "predictive-subhead", `Forecasts (next ${predictive.horizon} snapshots)`));
    wrap.append(grid);
    nodes.push(wrap);
    return { nodes, badge: countLabel(signalCount, "signal"), tone: "good" };
  }

  nodes.push(el("div", "operator-empty predictive-empty",
    "No directional predictive signal yet for this scope. Capture another materially different snapshot to unlock forecast cards."));
  return { nodes, badge: "No signal", tone: "watch" };
}

function buildPrescriptivePanelNodes(el, prescriptive) {
  const nodes = [];

  if (prescriptive.directives.length) {
    const directives = el("div", "predictive-directives");
    directives.append(el("h4", "predictive-subhead", "Forecast-driven directives"));
    prescriptive.directives.slice(0, 5).forEach((directive) => {
      const row = el("div", "predictive-directive");
      row.dataset.urgency = directive.urgency || "low";
      row.append(el("span", "predictive-urgency-pill", (directive.urgency || "low").toUpperCase()));
      row.append(el("span", "predictive-directive-text", directive.message));
      directives.append(row);
    });
    nodes.push(directives);
  }

  const plan = prescriptive.remediation;
  if (plan && plan.steps.length) {
    const planWrap = el("div", "prescriptive-plan");
    const head = el("h4", "predictive-subhead", "Prescribed action plan");
    head.append(el("span", "prescriptive-plan-summary",
      ` recover ~${formatPrescriptiveDollars(prescriptive.summary.recoverableDollars)} / ${prescriptive.summary.recoverableGpuHours} GPU-hours · ${prescriptive.summary.selectedActions} of ${prescriptive.summary.totalActions} actions · confidence ${prescriptive.summary.blendedConfidence}%`));
    planWrap.append(head);

    const list = el("ol", "prescriptive-steps");
    plan.steps.forEach((step) => {
      const item = el("li", "prescriptive-step");
      item.dataset.urgency = step.urgency || "standard";
      const title = el("div", "prescriptive-step-title");
      title.append(el("span", "prescriptive-step-name", step.action));
      title.append(el("span", "prescriptive-step-owner", step.owner));
      item.append(title);
      item.append(el("div", "prescriptive-step-do", step.do));
      item.append(el("div", "prescriptive-step-impact", `Expected: ${step.expectedImpact}`));
      item.append(el("div", "prescriptive-step-verify", `Verify: ${step.verify}`));
      list.append(item);
    });
    planWrap.append(list);
    nodes.push(planWrap);
  }

  if (!nodes.length) {
    nodes.push(el("div", "operator-empty predictive-empty",
      "No prescriptive actions above the impact floor for this scope."));
    return { nodes, badge: "No actions", tone: "good" };
  }

  const stepCount = plan?.steps.length || 0;
  const urgentCount = prescriptive.summary?.urgentDirectives || 0;
  if (urgentCount) return { nodes, badge: countLabel(urgentCount, "urgent"), tone: "poor" };
  return { nodes, badge: countLabel(stepCount, "action"), tone: "watch" };
}

function updatePanelBadge(selector, label, tone) {
  const badge = document.querySelector(selector);
  if (!badge) return;
  badge.textContent = label;
  if (tone) badge.dataset.tone = tone;
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function predictiveMetricHasSignal(metric, points = []) {
  const fc = metric?.forecast;
  if (!fc || !fc.ok) return false;
  if (fc.trend && fc.trend !== "flat") return true;
  if (metric?.saturation?.ok && metric.saturation.willCross) return true;
  if (metric?.anomalies?.ok && metric.anomalies.latest?.isAnomaly) return true;
  if (metric?.risk?.ok && (metric.risk.band === "elevated" || metric.risk.band === "critical")) return true;

  const values = (Array.isArray(points) ? points : [])
    .map((point) => Number(typeof point === "object" && point ? point.value : point))
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) return false;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const magnitude = Math.max(...values.map((value) => Math.abs(value)), 1);
  return (max - min) >= Math.max(0.5, magnitude * 0.02);
}

function renderIngestState() {
  const ingestEl = document.querySelector("#ingestState");
  if (!ingestEl) return;

  ingestEl.textContent = state.ingestLabel;
  ingestEl.dataset.status = state.ingestTone;
}

function renderDashboardSettingsPanel() {
  const panel = document.querySelector("#dashboardSettingsPanel");
  const controls = document.querySelector("#dashboardSettingsControls");
  const badge = document.querySelector("#dashboardSettingsBadge");
  if (!panel || !controls) return;

  const enabledCount = DASHBOARD_BLOCKS.filter((block) => dashboardBlockEnabled(block.id)).length;
  const defaultCount = DASHBOARD_BLOCKS.filter((block) => block.defaultOn).length;
  const atDefault = DASHBOARD_BLOCKS.every((block) => dashboardBlockEnabled(block.id) === Boolean(block.defaultOn));

  if (badge) {
    badge.textContent = atDefault ? "Bare minimum" : `${enabledCount}/${DASHBOARD_BLOCKS.length} on`;
    badge.dataset.tone = atDefault ? "good" : enabledCount <= defaultCount ? "good" : "watch";
  }

  const actions = document.createElement("div");
  actions.className = "dashboard-settings-actions";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Bare minimum";
  reset.addEventListener("click", resetDashboardBlocksToDefault);
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "Show all";
  all.addEventListener("click", enableAllDashboardBlocks);
  actions.append(reset, all);

  const grid = document.createElement("div");
  grid.className = "dashboard-settings-grid";
  DASHBOARD_BLOCKS.forEach((block) => {
    grid.append(dashboardBlockToggle(block));
  });

  controls.replaceChildren(actions, dashboardApiTokenControl(), grid);
  panel.hidden = false;
}

function renderScopeControls() {
  document.querySelectorAll("#scopeControls button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.scope === state.scope));
  });
}

function renderAnalysisStamp() {
  const stateEl = document.querySelector("#analysisState");
  const storageEl = document.querySelector("#storageState");
  const timeEl = document.querySelector("#analysisTime");

  stateEl.textContent = "Ready";
  storageEl.textContent = state.storageLabel;
  storageEl.dataset.status = state.storageTone;
  timeEl.textContent = formatAnalysisTime(state.lastAnalysis);
  timeEl.setAttribute("datetime", state.lastAnalysis.toISOString());
}

function renderInventory(entries) {
  const list = document.querySelector("#entityList");
  const title = document.querySelector("#inventoryTitle");
  const count = document.querySelector("#inventoryCount");

  title.textContent = pluralTitle(state.scope);
  count.textContent = entries.length;
  list.replaceChildren();

  entries.forEach((entry) => {
    const summary = summarizeEntry(entry);
    const classifier = classifyBottlenecks(summary);
    const machineContext = machineDemoContext(summary);
    const machineInventoryState = machineInventoryEntryState(summary, machineContext);
    const row = document.createElement(machineInventoryState.missing ? "div" : "button");
    if (row.tagName === "BUTTON") row.type = "button";
    row.className = "entity-row";
    row.dataset.entryKey = entry.key;
    if (machineInventoryState.key) row.dataset.machineInventoryKey = machineInventoryState.key;
    if (machineInventoryState.missing) {
      row.dataset.machineMissing = "true";
      row.setAttribute("role", "button");
      row.tabIndex = 0;
    }
    if (summary.isFleetAggregate) row.dataset.aggregate = "true";
    row.setAttribute("aria-selected", String(entry.key === state.selectedKey));
    row.addEventListener("click", () => {
      state.selectedKey = entry.key;
      render();
      activateSelectedInventoryPopout(entry.key);
    });
    if (machineInventoryState.missing) {
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        state.selectedKey = entry.key;
        render();
        activateSelectedInventoryPopout(entry.key);
      });
    }

    const titleEl = document.createElement("strong");
    titleEl.textContent = entry.label;

    const meta = document.createElement("span");
    meta.className = "entity-meta";
    meta.textContent = inventoryMeta(summary);

    const foot = document.createElement("span");
    foot.className = "entity-foot";
    const fleetOverview = summary.isFleetAggregate ? fleetAggregateOverview(summary) : null;

    const score = document.createElement("span");
    score.textContent = fleetOverview
      ? `${fleetOverview.hostCount} hosts`
      : machineInventoryState.missing
      ? "missing"
      : Number.isFinite(machineInventoryState.uptimeSeconds)
      ? `up ${formatMachineUptime(machineInventoryState.uptimeSeconds)}`
      : machineContext?.driverUnavailable || machineContext?.noGpu
      ? "host only"
      : machineContext?.idle ? "idle now" : `${round(summary.usefulCompute)}% useful`;

    const bottleneck = document.createElement("span");
    bottleneck.textContent = fleetOverview
      ? `${round(fleetOverview.similarityScore)}% similar`
      : machineInventoryState.missing
      ? formatMachineLastSeen(machineInventoryState.lastSeenAt)
      : machineContext?.driverUnavailable
      ? "GPU unavailable"
      : machineContext?.noGpu ? "No GPU telemetry" : machineContext?.idle ? "Idle capacity" : classifier.primary.name.replace("-bound", "");

    foot.append(score, bottleneck);
    row.append(titleEl, meta, foot);

    if (machineInventoryState.missing) {
      const actions = document.createElement("span");
      actions.className = "entity-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "entity-remove-button";
      remove.textContent = "Remove";
      remove.title = `Remove ${entry.label} from Inventory Machines`;
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        removeMachineInventoryEntry(machineInventoryState.key);
      });
      actions.append(remove);
      row.append(actions);
    }

    list.append(row);
  });
}

function renderDiagnosis(summary, classifier) {
  const primary = classifier.primary;
  const secondary = classifier.secondary;
  const useful = round(summary.usefulCompute);
  const gpuUtil = round(summary.gpuUtil);
  const primaryLoss = primary.name.replace("-bound", "").toLowerCase();
  const fleetOverview = summary.isFleetAggregate ? fleetAggregateOverview(summary) : null;
  const machineContext = machineDemoContext(summary);
  const meta = fleetOverview
    ? [
      "Fleet",
      `${fleetOverview.hostCount} hosts`,
      `${fleetOverview.freshCount}/${fleetOverview.hostCount} fresh`,
      `${round(fleetOverview.similarityScore)}% similarity`
    ].join(" | ")
    : machineContext
    ? [
      "Machine",
      machineContext.host,
      machineContext.gpuModel,
      machineContext.adapters
    ].join(" | ")
    : [
      scopeLabel(summary.scope),
      summary.clusters.join(", "),
      summary.gpuModels.join(", "),
      `${summary.count} ${summary.count === 1 ? "job" : "jobs"}`
    ].join(" | ");
  const headline = fleetOverview
    ? fleetOverview.headline
    : machineContext
    ? machineDemoHeadline(machineContext, gpuUtil, useful)
    : summary.whatIfActive
    ? `Same-pod what-if lifts useful compute to ${useful}% and cuts cross-pod traffic to ${round(summary.crossPodTraffic)}%.`
    : `${gpuUtil}% GPU utilization, ${useful}% useful compute. ${titleCase(primaryLoss)} is the dominant loss.`;

  const narrative = fleetOverview
    ? fleetOverview.narrative
    : machineContext
    ? machineDemoNarrative(machineContext)
    : summary.whatIfActive
    ? `Current evidence points to ${primaryLoss} first and ${secondary.name.replace("-bound", "").toLowerCase()} second. Constraining this work to one pod is estimated to improve runtime by ${classifier.improvementRange}.`
    : `${primary.reason} ${recommendationFor(summary, classifier)}`;

  document.querySelector("#selectedMeta").textContent = meta;
  document.querySelector("#diagnosisHeadline").textContent = headline;
  document.querySelector("#diagnosisNarrative").textContent = narrative;
  renderScoreDial(fleetOverview ? fleetOverview.healthScore : summary.usefulCompute);
}

function renderScoreDial(score) {
  const value = clamp(score);
  const circle = document.querySelector(".dial-value");
  const circumference = 2 * Math.PI * 48;
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${circumference - (value / 100) * circumference}`;
  circle.style.stroke = gradeColor(value, true);
  document.querySelector("#scoreValue").textContent = pct(value);
}

function renderMetricRibbon(summary) {
  document.querySelector("#allocatedGpuHours").textContent = number.format(summary.allocatedGpuHours);
  document.querySelector("#usefulGpuHours").textContent = number.format(summary.usefulGpuHours);
  document.querySelector("#wastedGpuHours").textContent = number.format(summary.wastedGpuHours);
  document.querySelector("#wasteDollars").textContent = currency.format(summary.wasteDollars);
  document.querySelector("#costPerUseful").textContent = currency.format(summary.costPerUsefulGpuHour);
}

function renderLiveResources(summary) {
  const panel = document.querySelector("#liveResourcePanel");
  const title = document.querySelector("#liveResourceTitle");
  const badge = document.querySelector("#liveResourceBadge");
  const grid = document.querySelector("#liveResourceGrid");
  const alerts = document.querySelector("#liveTelemetryAlerts");
  const observationLog = document.querySelector("#liveObservationLog");
  const graphs = document.querySelector("#liveTelemetryGraphs");
  if (!panel || !title || !badge || !grid || !alerts || !observationLog || !graphs) return;

  const machineContext = machineDemoContext(summary);
  if (summary.isFleetAggregate) {
    renderFleetAggregateResources(summary, { panel, title, badge, grid, alerts, observationLog, graphs });
    return;
  }

  if (!machineContext) {
    renderAnalysisResourceFallback(summary, { panel, title, badge, grid, alerts, observationLog, graphs });
    return;
  }

  const context = machineContext.context || {};
  const generatedAt = context.generatedAt ? safeDate(context.generatedAt, new Date(0)) : null;
  const telemetry = recordLiveTelemetrySample(machineContext, generatedAt);
  const ageSeconds = generatedAt ? Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 1000)) : null;
  const memoryTotal = numeric(context.memoryTotalBytes);
  const memoryAvailable = numeric(context.memoryAvailableBytes);
  const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);
  const dockerCpu = machineContext.dockerContainers.reduce((total, container) => total + numeric(container.cpuPct), 0);
  const gpuMemoryNote = machineContext.gpuPresent
    ? `${number.format(machineContext.gpuMemoryUsedMiB)} / ${number.format(machineContext.gpuMemoryTotalMiB)} MiB`
    : machineContext.driverUnavailable ? "nvidia-smi cannot reach driver" : "No GPU counter source";
  const gpuMissingValue = machineContext.driverUnavailable ? "unavailable" : machineContext.noGpu ? "not detected" : "not reported";
  const gpuMissingNote = machineContext.driverUnavailable
    ? "Driver telemetry blocked"
    : machineContext.noGpu ? "No GPU counter source" : "Vendor field unavailable";
  const gpuPowerAvailable = machineContext.gpuPresent && Number.isFinite(machineContext.gpuPowerWatts) && machineContext.gpuPowerWatts > 0;
  const gpuTemperatureAvailable = machineContext.gpuPresent && Number.isFinite(machineContext.gpuTemperatureC) && machineContext.gpuTemperatureC > 0;
  const gpuFanAvailable = machineContext.gpuPresent && Number.isFinite(machineContext.gpuFanSpeedPct);
  const gpuClockAvailable = machineContext.gpuPresent && Number.isFinite(machineContext.gpuClockMHz);
  const gpuMemoryClockAvailable = machineContext.gpuPresent && Number.isFinite(machineContext.gpuMemoryClockMHz);
  const gpuMemoryAllocationAvailable = machineContext.gpuPresent && machineContext.gpuMemoryTotalMiB > 0;
  const gpuMemoryUtilizationAvailable = machineContext.gpuPresent && Number.isFinite(machineContext.gpuMemoryUtilizationPct);
  const pcie = context.gpuPcie ? ` | ${context.gpuPcie}` : "";
  const gpuSampleNote = machineContext.gpuSampleCached
    ? `nvidia-smi cached ${Math.max(1, Math.round(machineContext.gpuSampleAgeMs / 1000))}s`
    : "nvidia-smi live sample";
  const gpuMemoryAllocationNote = gpuMemoryAllocationAvailable
    ? `${formatBytes(machineContext.gpuMemoryTotalMiB * 1024 * 1024)} total | ${pct(machineContext.gpuMemoryUsedPct)} allocated`
    : gpuMemoryNote;
  const gpuClockNote = Number.isFinite(machineContext.gpuSmClockMHz)
    && machineContext.gpuSmClockMHz !== machineContext.gpuClockMHz
    ? `SM ${round(machineContext.gpuSmClockMHz)} MHz${pcie}`
    : `graphics/SM clock${pcie}`;
  const observedServiceList = machineDemoServices(context.observedServices);
  const ollamaReachable = observedServiceList.includes("ollama");
  const ollamaModelLabel = machineContext.ollamaProbeModel || machineContext.ollamaRunningModels[0] || (Array.isArray(context.ollamaModels) ? context.ollamaModels[0] : "") || "";
  const ollamaNote = machineContext.ollamaTelemetryAvailable
    ? `${round(machineContext.ollamaTimeToFirstTokenMs)}ms TTFT${ollamaModelLabel ? ` | ${ollamaModelLabel}` : ""}`
    : machineContext.ollamaTelemetryStatus === "no-running-model"
      ? `${machineContext.modelCount} local model${machineContext.modelCount === 1 ? "" : "s"} | no loaded model`
      : machineContext.ollamaProbeError || `${machineContext.modelCount} local model${machineContext.modelCount === 1 ? "" : "s"}`;
  const gb10MonitorTotal = machineContext.gb10MonitoringList.length;
  const gb10MonitorAvailable = machineContext.gb10MonitoringList.filter(gb10MonitoringAvailable).length;
  const umaMemoryTotal = machineContext.linuxUmaMemoryTotalBytes || memoryTotal;
  const umaMemoryAvailable = machineContext.linuxUmaMemoryAvailableBytes || memoryAvailable;
  const umaMemoryUsed = Math.max(0, umaMemoryTotal - umaMemoryAvailable);
  const umaMemoryUsedPct = machineContext.linuxUmaMemoryUsedPct || machineContext.memoryUsedPct;
  const networkDisplay = liveNetworkDisplay(machineContext);
  const collectorRateAvailable = machineContext.collectorGatewayReachable
    && Number.isFinite(machineContext.collectorIncomingReportsPerMinute);
  const collectorWindowSeconds = Number.isFinite(machineContext.collectorIncomingReportsWindowSeconds)
    ? Math.max(1, round(machineContext.collectorIncomingReportsWindowSeconds))
    : 60;
  const collectorWindowCount = Number.isFinite(machineContext.collectorIncomingReportsWindowCount)
    ? number.format(round(machineContext.collectorIncomingReportsWindowCount))
    : "0";
  const collectorAccepted = Number.isFinite(machineContext.collectorAcceptedBatchesTotal)
    ? number.format(round(machineContext.collectorAcceptedBatchesTotal))
    : "n/a";
  const hardwareScoreAvailable = Number.isFinite(machineContext.hardwareHealthScore);
  const hardwareFaultCount = Number.isFinite(machineContext.hardwareFaultCount) ? round(machineContext.hardwareFaultCount) : 0;
  const hardwareTopFault = machineContext.hardwareFaults[0];
  const hardwareNote = hardwareFaultCount > 0
    ? `${hardwareFaultCount} fault${hardwareFaultCount === 1 ? "" : "s"} | ${machineContext.hardwareRepairAction || "inspect-host"}`
    : "No observed hardware fault pattern";

  panel.hidden = false;
  title.textContent = `${machineContext.host} live resources`;
  renderLiveResourceHeartbeatBadge(badge, ageSeconds);

  grid.replaceChildren(
    liveResourceCard({
      label: "CPU",
      value: pct(machineContext.cpuUsagePct),
      note: `${context.cpuCount || "n/a"} logical CPUs | load ${round(numeric(context.load1))}`,
      percent: machineContext.cpuUsagePct,
      tone: inverseGrade(machineContext.cpuUsagePct, 70, 90).key
    }),
    liveResourceCard({
      label: "RAM",
      value: pct(machineContext.memoryUsedPct),
      note: memoryTotal ? `${formatBytes(memoryUsed)} / ${formatBytes(memoryTotal)}` : "Host memory pressure",
      percent: machineContext.memoryUsedPct,
      tone: inverseGrade(machineContext.memoryUsedPct, 75, 90).key
    }),
    liveResourceCard({
      label: "Network utilization",
      value: networkDisplay.value,
      note: networkDisplay.note,
      percent: networkDisplay.percent,
      tone: networkDisplay.tone
    }),
    ...(machineContext.gb10Present ? [
      liveResourceCard({
        label: "UMA memory",
        value: pct(umaMemoryUsedPct),
        note: umaMemoryTotal ? `${formatBytes(umaMemoryUsed)} / ${formatBytes(umaMemoryTotal)} Linux UMA` : "Linux UMA meminfo",
        percent: umaMemoryUsedPct,
        tone: inverseGrade(umaMemoryUsedPct, 75, 90).key
      })
    ] : []),
    liveResourceCard({
      label: "GPU Utilization",
      value: machineContext.driverUnavailable ? "unavailable" : machineContext.noGpu ? "not detected" : pct(machineContext.gpuUtilizationPct),
      note: machineContext.driverUnavailable
        ? "Driver telemetry blocked"
        : machineContext.noGpu
          ? "No NVIDIA counter source"
          : machineContext.gpuProcessQuerySkipped
            ? gpuSampleNote
            : `${machineContext.gpuProcesses.length} compute process${machineContext.gpuProcesses.length === 1 ? "" : "es"}`,
      percent: machineContext.gpuPresent ? machineContext.gpuUtilizationPct : null,
      tone: machineContext.driverUnavailable || machineContext.noGpu ? "poor" : machineContext.gpuUtilizationPct > 0 ? grade(machineContext.gpuUtilizationPct, 30, 70).key : "watch"
    }),
    liveResourceCard({
      label: "Power Draw",
      value: gpuPowerAvailable ? `${round(machineContext.gpuPowerWatts)} W` : gpuMissingValue,
      note: gpuPowerAvailable ? gpuSampleNote : gpuMissingNote,
      percent: gpuPowerAvailable ? clamp((machineContext.gpuPowerWatts / 450) * 100) : null,
      tone: gpuPowerAvailable ? inverseGrade(machineContext.gpuPowerWatts, 330, 430).key : "watch"
    }),
    liveResourceCard({
      label: "Fan Speed",
      value: gpuFanAvailable ? pct(machineContext.gpuFanSpeedPct) : gpuMissingValue,
      note: gpuFanAvailable ? "fan.speed" : gpuMissingNote,
      percent: gpuFanAvailable ? machineContext.gpuFanSpeedPct : null,
      tone: gpuFanAvailable ? inverseGrade(machineContext.gpuFanSpeedPct, 85, 96).key : "watch"
    }),
    liveResourceCard({
      label: "Temperature",
      value: gpuTemperatureAvailable ? `${round(machineContext.gpuTemperatureC)} C` : gpuMissingValue,
      note: gpuTemperatureAvailable ? `${gpuSampleNote}${pcie}` : gpuMissingNote,
      percent: gpuTemperatureAvailable ? clamp((machineContext.gpuTemperatureC / 95) * 100) : null,
      tone: gpuTemperatureAvailable ? inverseGrade(machineContext.gpuTemperatureC, 75, 86).key : "watch"
    }),
    liveResourceCard({
      label: "GPU Clock Speed",
      value: gpuClockAvailable ? `${round(machineContext.gpuClockMHz)} MHz` : gpuMissingValue,
      note: gpuClockAvailable ? gpuClockNote : gpuMissingNote,
      percent: gpuClockAvailable ? clamp((machineContext.gpuClockMHz / 2500) * 100) : null,
      tone: gpuClockAvailable ? "good" : "watch"
    }),
    liveResourceCard({
      label: "Memory Clock Speed",
      value: gpuMemoryClockAvailable ? `${round(machineContext.gpuMemoryClockMHz)} MHz` : gpuMissingValue,
      note: gpuMemoryClockAvailable ? "HBM/VRAM memory clock" : gpuMissingNote,
      percent: gpuMemoryClockAvailable ? clamp((machineContext.gpuMemoryClockMHz / 12000) * 100) : null,
      tone: gpuMemoryClockAvailable ? "good" : "watch"
    }),
    liveResourceCard({
      label: "Memory allocation",
      value: gpuMemoryAllocationAvailable ? formatBytes(machineContext.gpuMemoryUsedMiB * 1024 * 1024) : gpuMissingValue,
      note: gpuMemoryAllocationAvailable ? gpuMemoryAllocationNote : gpuMissingNote,
      percent: gpuMemoryAllocationAvailable ? machineContext.gpuMemoryUsedPct : null,
      tone: gpuMemoryAllocationAvailable ? inverseGrade(machineContext.gpuMemoryUsedPct, 82, 94).key : "watch"
    }),
    liveResourceCard({
      label: "Memory Utilization",
      value: gpuMemoryUtilizationAvailable ? pct(machineContext.gpuMemoryUtilizationPct) : gpuMissingValue,
      note: gpuMemoryUtilizationAvailable ? "memory controller activity" : gpuMissingNote,
      percent: gpuMemoryUtilizationAvailable ? machineContext.gpuMemoryUtilizationPct : null,
      tone: gpuMemoryUtilizationAvailable ? grade(machineContext.gpuMemoryUtilizationPct, 30, 70).key : "watch"
    }),
    liveResourceCard({
      label: "Docker",
      value: `${machineContext.dockerContainers.length}`,
      note: `${pct(dockerCpu)} aggregate container CPU`,
      percent: clamp(dockerCpu),
      tone: machineContext.dockerContainers.length ? "good" : "watch"
    }),
    liveResourceCard({
      label: "Disk",
      value: pct(machineContext.diskUsedPct),
      note: context.diskTotalBytes ? `${formatBytes(context.diskUsedBytes)} / ${formatBytes(context.diskTotalBytes)}` : "Root filesystem",
      percent: machineContext.diskUsedPct,
      tone: inverseGrade(machineContext.diskUsedPct, 75, 90).key
    }),
    liveResourceCard({
      label: "Ollama",
      value: ollamaReachable
        ? machineContext.ollamaTelemetryAvailable
          ? `${formatDecimal(machineContext.ollamaTokensPerSecond, 1)} tok/s`
          : "reachable"
        : "offline",
      note: ollamaReachable ? ollamaNote : "Local model API not observed",
      percent: null,
      tone: ollamaReachable ? (machineContext.ollamaTelemetryAvailable ? "good" : "watch") : "poor"
    }),
    liveResourceCard({
      label: "Hardware health",
      value: hardwareScoreAvailable ? `${round(machineContext.hardwareHealthScore)}/100` : "learning",
      note: hardwareTopFault?.detail || hardwareNote,
      percent: hardwareScoreAvailable ? machineContext.hardwareHealthScore : null,
      tone: Number.isFinite(machineContext.hardwareFaultScore)
        ? inverseGrade(machineContext.hardwareFaultScore, 35, 70).key
        : "watch"
    }),
    ...(machineContext.collectorGatewayReachable ? [
      liveResourceCard({
        label: "Telemetry ingest",
        value: collectorRateAvailable ? `${formatDecimal(machineContext.collectorIncomingReportsPerMinute, machineContext.collectorIncomingReportsPerMinute >= 100 ? 0 : 1)}/min` : "reachable",
        note: `last ${collectorWindowSeconds}s: ${collectorWindowCount} reports | ${collectorAccepted} total`,
        percent: collectorRateAvailable ? clamp((machineContext.collectorIncomingReportsPerMinute / 120) * 100) : null,
        tone: collectorRateAvailable && machineContext.collectorIncomingReportsPerMinute > 0 ? "good" : "watch"
      })
    ] : []),
    ...(machineContext.gb10Present ? [
      liveResourceCard({
        label: "GB10 monitor",
        value: `${gb10MonitorAvailable}/${Math.max(1, gb10MonitorTotal)}`,
        note: "NVML/nvidia-smi, UMA, app metrics, Nsight/CUPTI",
        percent: null,
        tone: gb10MonitorAvailable === gb10MonitorTotal ? "good" : gb10MonitorAvailable >= 2 ? "watch" : "poor"
      })
    ] : []),
    liveResourceCard({
      label: "Signals",
      value: `${observedServiceList.length}`,
      note: machineContext.adapters,
      percent: null,
      tone: "good"
    })
  );

  const analysis = analyzeLiveTelemetryRelationships(telemetry, machineContext);
  renderLiveTelemetryAlerts(alerts, analysis);
  renderLiveObservationLog(observationLog, analysis, machineContext, telemetry);
  renderLiveTelemetryGraphs(graphs, machineContext, telemetry);
}

function renderAnalysisResourceFallback(summary, nodes) {
  const { panel, title, badge, grid, alerts, observationLog, graphs } = nodes;
  const analysis = analyzeAnalysisResourceRelationships(summary);
  liveTelemetryHistory = [];

  panel.hidden = false;
  title.textContent = `${summary.label} resource signals`;
  renderAnalysisResourceBadge(badge);

  grid.replaceChildren(
    liveResourceCard({
      label: "Network utilization",
      value: pct(summary.networkUtilization),
      note: `${pct(summary.networkWait)} network wait | ${pct(summary.ncclTime)} NCCL`,
      percent: summary.networkUtilization,
      tone: inverseGrade(summary.networkUtilization, 70, 88).key
    }),
    liveResourceCard({
      label: "GPU utilization",
      value: pct(summary.gpuUtil),
      note: `${pct(summary.usefulCompute)} useful compute | ${number.format(summary.gpus)} GPUs`,
      percent: summary.gpuUtil,
      tone: grade(summary.gpuUtil, 45, 70).key
    }),
    liveResourceCard({
      label: "CPU prep",
      value: pct(summary.cpuPrep),
      note: "Host-side CPU/preprocessing proxy",
      percent: summary.cpuPrep,
      tone: inverseGrade(summary.cpuPrep, 20, 35).key
    }),
    liveResourceCard({
      label: "Network wait",
      value: pct(summary.networkWait),
      note: "Latency/loss/stall pressure, separate from utilization",
      percent: summary.networkWait,
      tone: inverseGrade(summary.networkWait, 10, 20).key
    }),
    liveResourceCard({
      label: "NCCL time",
      value: pct(summary.ncclTime),
      note: "Collective communication time",
      percent: summary.ncclTime,
      tone: inverseGrade(summary.ncclTime, 15, 30).key
    }),
    liveResourceCard({
      label: "Placement fit",
      value: pct(summary.placementQuality),
      note: `${pct(summary.crossPodTraffic)} cross-pod | ${pct(summary.crossRackTraffic)} cross-rack`,
      percent: summary.placementQuality,
      tone: grade(summary.placementQuality, 65, 82).key
    })
  );

  renderLiveTelemetryAlerts(alerts, analysis);
  renderLiveObservationLog(observationLog, analysis, null, analysis.history);
  renderAnalysisResourceGraphs(graphs, summary, analysis.history);
}

function renderAnalysisResourceBadge(badge) {
  const label = document.createElement("span");
  label.className = "live-resource-badge-text";
  label.textContent = "Analysis snapshot";
  badge.replaceChildren(label);
  badge.dataset.tone = "watch";
  badge.dataset.fresh = "false";
  badge.title = "Showing interpreted run metrics until live host counters are available";
  badge.setAttribute("aria-label", `${label.textContent}. ${badge.title}.`);
}

function renderLiveResourceHeartbeatBadge(badge, ageSeconds) {
  const fresh = ageSeconds === null || ageSeconds <= MACHINE_DEMO_FRESH_SECONDS;
  const text = ageSeconds === null ? "Live" : `Updated ${ageSeconds}s ago`;
  let heart = badge.querySelector(".live-resource-heart");
  let label = badge.querySelector(".live-resource-badge-text");

  if (!heart) {
    heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    heart.setAttribute("class", "live-resource-heart");
    heart.setAttribute("viewBox", "0 0 24 24");
    heart.setAttribute("aria-hidden", "true");
    heart.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 20.2 5.1 13.4C1.8 10.1 3.4 4.8 7.9 4.4c1.8-.2 3.4.7 4.1 2.1.7-1.4 2.3-2.3 4.1-2.1 4.5.4 6.1 5.7 2.8 9.1L12 20.2Z");
    heart.append(path);
  }

  if (!label) {
    label = document.createElement("span");
    label.className = "live-resource-badge-text";
  }

  label.textContent = text;
  badge.replaceChildren(heart, label);
  badge.dataset.tone = fresh ? "good" : "watch";
  badge.dataset.fresh = fresh ? "true" : "false";
  badge.title = fresh ? "Live data is coming in" : "Waiting for a fresh live sample";
  badge.setAttribute("aria-label", `${text}. ${badge.title}.`);
}

function renderFleetAggregateResources(summary, nodes) {
  const { panel, title, badge, grid, alerts, observationLog, graphs } = nodes;
  const overview = fleetAggregateOverview(summary);
  const ageSeconds = Number.isFinite(overview.maxAgeMs) ? Math.max(0, Math.round(overview.maxAgeMs / 1000)) : null;
  const freshPct = overview.hostCount ? (overview.freshCount / overview.hostCount) * 100 : 0;
  const outlierPct = overview.hostCount ? (overview.outlierCount / overview.hostCount) * 100 : 0;
  const capacityNote = `${number.format(overview.totalCpuCores)} cores | ${formatBytes(overview.totalMemoryBytes)} RAM | ${formatBytes(overview.totalDiskBytes)} disk`;
  const pressureNote = `${pct(overview.avgCpuUsagePct)} CPU | ${pct(overview.avgMemoryUsedPct)} RAM | ${pct(overview.avgGpuUtilizationPct)} GPU`;
  const lakehouseNote = overview.lakehouseHostCount
    ? `${overview.lakehouseHostCount} storage ${overview.lakehouseHostCount === 1 ? "source" : "sources"} | ${overview.largestLakehouseRow?.host || "largest"} ${formatBytes(overview.largestLakehouseRow?.lakehouseUsedBytes || 0)}`
    : "Waiting for lakehouse path";
  const pairNote = overview.closestPair
    ? `Closest ${overview.closestPair.left} / ${overview.closestPair.right}; widest ${overview.divergentPair?.left || "--"} / ${overview.divergentPair?.right || "--"}`
    : "Need at least two live hosts";
  const widestNote = overview.widestSpread
    ? `${overview.widestSpread.label}: ${overview.widestSpread.bestHost || "--"} vs ${overview.widestSpread.worstHost || "--"}`
    : "Spread learning";

  liveTelemetryHistory = [];
  panel.hidden = false;
  title.textContent = "Fleet aggregate live resources";
  renderLiveResourceHeartbeatBadge(badge, ageSeconds);

  grid.replaceChildren(
    liveResourceCard({
      label: "Fleet similarity",
      value: pct(overview.similarityScore),
      note: pairNote,
      percent: overview.similarityScore,
      tone: grade(overview.similarityScore, 62, 82).key
    }),
    liveResourceCard({
      label: "Fleet health",
      value: `${round(overview.healthScore)}/100`,
      note: `${round(overview.averageHostScore)} avg host rank | ${round(outlierPct)}% outlier hosts`,
      percent: overview.healthScore,
      tone: grade(overview.healthScore, 58, 78).key
    }),
    liveResourceCard({
      label: "Fresh hosts",
      value: `${overview.freshCount}/${overview.hostCount}`,
      note: Number.isFinite(overview.maxAgeMs) ? `Oldest sample ${sparkPairAgeLabel(overview.maxAgeMs)}` : "No heartbeat timestamps",
      percent: freshPct,
      tone: grade(freshPct, 75, 100).key
    }),
    liveResourceCard({
      label: "Outliers",
      value: `${overview.outlierCount}`,
      note: widestNote,
      percent: outlierPct,
      tone: inverseGrade(outlierPct, 18, 38).key
    }),
    liveResourceCard({
      label: "Resource pressure",
      value: pct(overview.maxPressurePct),
      note: pressureNote,
      percent: overview.maxPressurePct,
      tone: inverseGrade(overview.maxPressurePct, 72, 88).key
    }),
    liveResourceCard({
      label: "Capacity",
      value: `${overview.gpuHostCount}/${overview.hostCount} GPU`,
      note: capacityNote,
      percent: overview.hostCount ? (overview.gpuHostCount / overview.hostCount) * 100 : null,
      tone: overview.gpuHostCount ? "good" : "watch"
    }),
    liveResourceCard({
      label: "Data lake storage",
      value: formatBytes(overview.totalLakehouseUsedBytes),
      note: lakehouseNote,
      percent: overview.lakehouseHostCount ? overview.avgLakehouseDiskUsedPct : null,
      tone: overview.lakehouseHostCount ? inverseGrade(overview.avgLakehouseDiskUsedPct, 75, 90).key : "watch"
    }),
    liveResourceCard({
      label: "Network activity",
      value: formatBytesPerSecond(overview.totalNetworkThroughputBps),
      note: `${fleetMbpsLabel(overview.fastestLinkMbps)} fastest link | ${overview.networkIssueCount} interface issues`,
      percent: overview.avgNetworkUtilizationPct,
      tone: overview.networkIssueCount ? "watch" : inverseGrade(overview.avgNetworkUtilizationPct, 70, 88).key
    }),
    liveResourceCard({
      label: "Fingerprints",
      value: `${overview.fingerprintCount}/${overview.hostCount}`,
      note: overview.signatureSpreadLabel,
      percent: overview.hostCount ? (overview.fingerprintCount / overview.hostCount) * 100 : null,
      tone: overview.fingerprintCount >= overview.hostCount ? "good" : overview.fingerprintCount ? "watch" : "poor"
    }),
    liveResourceCard({
      label: "Top rank",
      value: overview.topRow?.host || "--",
      note: overview.topRow ? `${round(overview.topRow.score)} score | ${overview.topRow.outlierLabels.join(", ") || "no outliers"}` : "No ranked hosts",
      percent: overview.topRow?.score ?? null,
      tone: overview.topRow?.tone || "watch"
    }),
    liveResourceCard({
      label: "Watch host",
      value: overview.watchRow?.host || "--",
      note: overview.watchRow ? `${round(overview.watchRow.score)} score | ${overview.watchRow.outlierLabels.join(", ") || "lowest rank"}` : "No watch host",
      percent: overview.watchRow?.score ?? null,
      tone: overview.watchRow?.tone || "watch"
    })
  );

  const analysis = fleetAggregateAnalysis(overview);
  renderLiveTelemetryAlerts(alerts, analysis);
  renderLiveObservationLog(observationLog, analysis, null, fleetAggregateGraphRows(overview));
  renderFleetAggregateGraphs(graphs, overview);
}

function renderFleetAggregateGraphs(container, overview) {
  const history = fleetAggregateGraphRows(overview);
  const lakehouseHistory = fleetAggregateLakehouseGraphRows(overview, history);
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = "Waiting for live fleet rows.";
    container.replaceChildren(empty);
    return;
  }

  const latestLabel = `${overview.hostCount} host cross-section`;
  container.replaceChildren(
    liveTelemetryGraphCard({
      label: "Rank score",
      valueKey: "score",
      history,
      latestLabel,
      valueText: `${round(overview.averageHostScore)} avg`,
      note: "Composite host rank",
      max: 100,
      tone: grade(overview.averageHostScore, 58, 78).key
    }),
    liveTelemetryGraphCard({
      label: "CPU",
      valueKey: "cpu",
      history,
      latestLabel,
      valueText: pct(overview.avgCpuUsagePct),
      note: "Host CPU cross-section",
      max: 100,
      tone: inverseGrade(overview.avgCpuUsagePct, 70, 90).key
    }),
    liveTelemetryGraphCard({
      label: "RAM",
      valueKey: "ram",
      history,
      latestLabel,
      valueText: pct(overview.avgMemoryUsedPct),
      note: "Host memory cross-section",
      max: 100,
      tone: inverseGrade(overview.avgMemoryUsedPct, 75, 90).key
    }),
    liveTelemetryGraphCard({
      label: "GPU util",
      valueKey: "gpu",
      history,
      latestLabel,
      valueText: overview.gpuHostCount ? pct(overview.avgGpuUtilizationPct) : "unavailable",
      note: `${overview.gpuHostCount}/${overview.hostCount} hosts report GPU counters`,
      max: 100,
      tone: overview.gpuHostCount ? grade(overview.avgGpuUtilizationPct, 30, 70).key : "poor"
    }),
    liveTelemetryGraphCard({
      label: "Network",
      valueKey: "networkThroughputBps",
      history,
      latestLabel,
      valueText: formatBytesPerSecond(overview.totalNetworkThroughputBps),
      note: "Per-host throughput cross-section",
      max: adaptiveGraphMax(history, "networkThroughputBps", 1),
      tone: overview.networkIssueCount ? "watch" : "good"
    }),
    liveTelemetryGraphCard({
      label: "Data lake",
      valueKey: "lakehouseUsedBytes",
      history: lakehouseHistory,
      latestLabel,
      valueText: overview.lakehouseHostCount ? formatBytes(overview.totalLakehouseUsedBytes) : "not reported",
      note: "Lakehouse directory usage",
      max: adaptiveGraphMax(lakehouseHistory, "lakehouseUsedBytes", Math.max(1, overview.totalLakehouseUsedBytes)),
      tone: overview.lakehouseHostCount ? inverseGrade(overview.avgLakehouseDiskUsedPct, 75, 90).key : "watch"
    }),
    liveTelemetryGraphCard({
      label: "Signature delta",
      valueKey: "signatureDelta",
      history,
      latestLabel,
      valueText: Number.isFinite(overview.signatureMedian) ? formatDecimal(overview.signatureMedian, 2) : "learning",
      note: "System-ID distance from fleet median",
      max: adaptiveGraphMax(history, "signatureDelta", 4),
      tone: overview.fingerprintCount >= overview.hostCount ? "good" : overview.fingerprintCount ? "watch" : "poor"
    })
  );
}

function renderStandaloneUnitEconomics(summary) {
  const panel = document.querySelector("#unitEconomicsStandalonePanel");
  const badge = document.querySelector("#unitEconomicsStandaloneBadge");
  if (!panel) return;

  const economics = buildUnitEconomicsState(summary, machineDemoContext(summary));
  if (badge) {
    badge.textContent = economics.badge;
    badge.dataset.tone = economics.tone;
  }
  renderUnitEconomicsPanel(panel, economics);
}

function renderOperatorCockpit(summary, classifier, opportunityEngine, schedulerSimulator) {
  const panel = document.querySelector("#operatorCockpitPanel");
  const title = document.querySelector("#operatorCockpitTitle");
  const confidenceBadge = document.querySelector("#operatorConfidenceBadge");
  const heartbeatStrip = document.querySelector("#sourceHeartbeatStrip");
  const timeline = document.querySelector("#eventTimeline");
  const timelineBadge = document.querySelector("#eventTimelineBadge");
  const launchpad = document.querySelector("#demoLaunchpad");
  const autoDiscoveryDeploymentPanel = document.querySelector("#autoDiscoveryDeploymentPanel");
  const autoDiscoveryDeploymentBadge = document.querySelector("#autoDiscoveryDeploymentBadge");
  const executionIdleEnergyPanel = document.querySelector("#executionIdleEnergyPanel");
  const executionIdleEnergyBadge = document.querySelector("#executionIdleEnergyBadge");
  const gpuExporterCoveragePanel = document.querySelector("#gpuExporterCoveragePanel");
  const gpuExporterCoverageBadge = document.querySelector("#gpuExporterCoverageBadge");
  const backgroundTasksPanel = document.querySelector("#backgroundTasksPanel");
  const backgroundTasksBadge = document.querySelector("#backgroundTasksBadge");
  const kafkaPanel = document.querySelector("#kafkaStreamPanel");
  const kafkaBadge = document.querySelector("#kafkaStreamBadge");
  const confidencePanel = document.querySelector("#confidencePanel");
  const confidenceDetailBadge = document.querySelector("#confidenceDetailBadge");
  const replayPanel = document.querySelector("#replayModePanel");
  const replayBadge = document.querySelector("#replayModeBadge");
  const grafanaPanel = document.querySelector("#grafanaMiniPanel");
  const grafanaBadge = document.querySelector("#grafanaMiniBadge");
  const productReadinessPanel = document.querySelector("#productReadinessPanel");
  const productReadinessBadge = document.querySelector("#productReadinessBadge");
  const fleetTiles = document.querySelector("#fleetTiles");
  const fleetBadge = document.querySelector("#fleetTilesBadge");
  const unitEconomicsPanel = document.querySelector("#unitEconomicsPanel");
  const unitEconomicsBadge = document.querySelector("#unitEconomicsBadge");
  const sparkPairComparePanel = document.querySelector("#sparkPairComparePanel");
  const sparkPairCompareBadge = document.querySelector("#sparkPairCompareBadge");
  const fleetComparisonPanel = document.querySelector("#fleetComparisonPanel");
  const fleetComparisonBadge = document.querySelector("#fleetComparisonBadge");
  const benchmarkLadderPanel = document.querySelector("#benchmarkLadderPanel");
  const benchmarkLadderBadge = document.querySelector("#benchmarkLadderBadge");
  const characterizationPanel = document.querySelector("#systemCharacterizationPanel");
  const characterizationBadge = document.querySelector("#systemCharacterizationBadge");
  if (!panel || !title || !confidenceBadge || !heartbeatStrip || !timeline || !launchpad || !autoDiscoveryDeploymentPanel || !executionIdleEnergyPanel || !gpuExporterCoveragePanel || !backgroundTasksPanel || !kafkaPanel || !confidencePanel || !replayPanel || !grafanaPanel || !productReadinessPanel || !fleetTiles || !unitEconomicsPanel || !sparkPairComparePanel || !fleetComparisonPanel || !benchmarkLadderPanel || !characterizationPanel) return;

  const cockpit = buildOperatorCockpitContext(summary, classifier, opportunityEngine, schedulerSimulator);
  if (!cockpit.visible) {
    panel.hidden = true;
    heartbeatStrip.replaceChildren();
    timeline.replaceChildren();
    launchpad.replaceChildren();
    autoDiscoveryDeploymentPanel.replaceChildren();
    executionIdleEnergyPanel.replaceChildren();
    gpuExporterCoveragePanel.replaceChildren();
    backgroundTasksPanel.replaceChildren();
    operatorLaunchpadSignature = "";
    kafkaPanel.replaceChildren();
    confidencePanel.replaceChildren();
    replayPanel.replaceChildren();
    grafanaPanel.replaceChildren();
    productReadinessPanel.replaceChildren();
    fleetTiles.replaceChildren();
    unitEconomicsPanel.replaceChildren();
    sparkPairComparePanel.replaceChildren();
    fleetComparisonPanel.replaceChildren();
    benchmarkLadderPanel.replaceChildren();
    characterizationPanel.replaceChildren();
    return;
  }

  panel.hidden = false;
  title.textContent = `${cockpit.hostLabel} source health and control`;
  confidenceBadge.textContent = `Confidence ${pct(cockpit.confidence.score)}`;
  confidenceBadge.dataset.tone = cockpit.confidence.score >= 80 ? "good" : cockpit.confidence.score >= 55 ? "watch" : "poor";
  if (timelineBadge) timelineBadge.textContent = `${cockpit.timeline.length} events`;
  if (autoDiscoveryDeploymentBadge) {
    autoDiscoveryDeploymentBadge.textContent = cockpit.autoDiscovery.badge;
    autoDiscoveryDeploymentBadge.dataset.tone = cockpit.autoDiscovery.tone;
  }
  if (executionIdleEnergyBadge) {
    executionIdleEnergyBadge.textContent = cockpit.executionIdle.badge;
    executionIdleEnergyBadge.dataset.tone = cockpit.executionIdle.tone;
  }
  if (gpuExporterCoverageBadge) {
    gpuExporterCoverageBadge.textContent = cockpit.gpuExporterCoverage.badge;
    gpuExporterCoverageBadge.dataset.tone = cockpit.gpuExporterCoverage.tone;
  }
  if (backgroundTasksBadge) {
    backgroundTasksBadge.textContent = cockpit.backgroundTasks.badge;
    backgroundTasksBadge.dataset.tone = cockpit.backgroundTasks.tone;
  }
  if (kafkaBadge) kafkaBadge.textContent = cockpit.kafka.reachable ? "Reachable" : "Missing";
  if (confidenceDetailBadge) confidenceDetailBadge.textContent = cockpit.confidence.label;
  if (replayBadge) replayBadge.textContent = state.operatorReplay ? "Playing" : `${liveTelemetryHistory.length} samples`;
  if (grafanaBadge) grafanaBadge.textContent = cockpit.grafana.links.length ? `${cockpit.grafana.links.length} links` : "No link";
  if (productReadinessBadge) {
    productReadinessBadge.textContent = cockpit.productReadiness.badge;
    productReadinessBadge.dataset.tone = cockpit.productReadiness.tone;
  }
  if (fleetBadge) fleetBadge.textContent = `${cockpit.fleet.length} ${cockpit.fleet.length === 1 ? "host" : "hosts"}`;
  if (unitEconomicsBadge) {
    unitEconomicsBadge.textContent = cockpit.unitEconomics.badge;
    unitEconomicsBadge.dataset.tone = cockpit.unitEconomics.tone;
  }
  if (sparkPairCompareBadge) {
    sparkPairCompareBadge.textContent = cockpit.sparkComparison.badge;
    sparkPairCompareBadge.dataset.tone = cockpit.sparkComparison.tone;
  }
  if (fleetComparisonBadge) {
    fleetComparisonBadge.textContent = cockpit.fleetComparison.badge;
    fleetComparisonBadge.dataset.tone = cockpit.fleetComparison.tone;
  }
  if (benchmarkLadderBadge) {
    benchmarkLadderBadge.textContent = cockpit.benchmarkLadder.badge;
    benchmarkLadderBadge.dataset.tone = cockpit.benchmarkLadder.tone;
  }
  updateSystemCharacterizationBadge(characterizationBadge, platformVirtualSensorCache.systemIdentification);

  heartbeatStrip.replaceChildren(...cockpit.heartbeats.map(operatorHeartbeatCard));
  timeline.replaceChildren(...cockpit.timeline.map(operatorTimelineItem));
  renderOperatorLaunchpad(launchpad, cockpit.commands);
  autoDiscoveryDeploymentPanel.replaceChildren(...operatorAutoDiscoveryDeploymentNodes(cockpit.autoDiscovery));
  executionIdleEnergyPanel.replaceChildren(...operatorExecutionIdleNodes(cockpit.executionIdle));
  gpuExporterCoveragePanel.replaceChildren(...operatorGpuExporterCoverageNodes(cockpit.gpuExporterCoverage));
  backgroundTasksPanel.replaceChildren(...operatorBackgroundTasksNodes(cockpit.backgroundTasks));
  kafkaPanel.replaceChildren(...operatorKafkaNodes(cockpit.kafka));
  confidencePanel.replaceChildren(...operatorConfidenceNodes(cockpit.confidence));
  replayPanel.replaceChildren(...operatorReplayNodes(cockpit));
  grafanaPanel.replaceChildren(...operatorGrafanaNodes(cockpit.grafana));
  productReadinessPanel.replaceChildren(...operatorProductReadinessNodes(cockpit.productReadiness));
  fleetTiles.replaceChildren(...cockpit.fleet.map(operatorFleetTile));
  renderUnitEconomicsPanel(unitEconomicsPanel, cockpit.unitEconomics);
  latestSparkPairComparison = cockpit.sparkComparison.available ? cockpit.sparkComparison : null;
  renderSparkPairComparisonPanel(sparkPairComparePanel, cockpit.sparkComparison);
  renderFleetComparisonPanel(fleetComparisonPanel, cockpit.fleetComparison);
  renderBenchmarkLadderPanel(benchmarkLadderPanel, cockpit.benchmarkLadder);
  renderSystemCharacterizationPanel(characterizationPanel, platformVirtualSensorCache.systemIdentification);
}

function operatorSourceLabel(id) {
  return {
    host: "Host",
    kubernetes: "Kubernetes",
    prometheus: "Prometheus",
    dcgm: "DCGM",
    "amd-dme": "AMD DME",
    kafka: "Kafka",
    grafana: "Grafana",
    docker: "Docker",
    ollama: "Ollama",
    "node-exporter": "Node Exporter",
    ebpf: "eBPF",
    provider: "Provider",
    "nccl-trace": "NCCL",
    "gb10-nvml-nvidia-smi": "GB10 NVML",
    "linux-uma-memory": "Linux UMA",
    "app-metrics": "App Metrics",
    "nsight-cupti-profiling": "Nsight/CUPTI"
  }[id] || titleCase(id);
}

function operatorSourceNote({ id, present, status, ageMilliseconds, summary, machineContext, kafka, observedServices }) {
  if (!present) return "No signal attached";
  if (id === "host") return ageMilliseconds === null ? "Host sample attached" : `${formatHostSampleAgeMilliseconds(ageMilliseconds)} since host sample`;
  if (id === "kafka") return kafka.messageId ? `Smoke message ${kafka.messageId}` : kafka.nodePortBootstrap || "Broker reachable";
  if (id === "grafana") return summary.grafana?.links?.[0]?.label || summary.grafana?.dashboards?.[0] || (observedServices.includes("grafana") ? "Service reachable" : "Dashboard handoff");
  if (id === "kubernetes") return summary.schedulerEvidence?.schedulerNames?.[0] || machineContext?.context?.namespace || "Pod/job evidence";
  if (id === "prometheus") return "Prometheus source metrics";
  if (id === "dcgm") return "GPU counter source";
  if (id === "amd-dme") return "AMD Device Metrics Exporter source";
  if (id === "docker") return `${machineContext?.dockerContainers?.length || 0} containers observed`;
  if (id === "nccl-trace") {
    if (machineContext?.ncclRuntimePresent) {
      return machineContext.ncclRuntimeDetail
        || `${machineContext.ncclRuntimeContainers.join(", ") || machineContext.ncclRuntimeSource || "NCCL runtime"} observed`;
    }
    return "NCCL trace export attached";
  }
  if (id === "ollama") {
    if (machineContext?.ollamaTelemetryAvailable) {
      return `${formatDecimal(machineContext.ollamaTokensPerSecond, 1)} tok/s | ${round(machineContext.ollamaTimeToFirstTokenMs)}ms TTFT`;
    }
    if (machineContext?.ollamaTelemetryStatus === "no-running-model") {
      return `${machineContext.modelCount || 0} local models | no loaded model`;
    }
    return `${machineContext?.modelCount || 0} local models`;
  }
  if (status === "attached") return "Source export attached";
  return "Live service reachable";
}

function operatorAutoDiscoveryDeploymentNodes(discovery) {
  const summary = document.createElement("div");
  summary.className = "auto-discovery-summary";
  summary.dataset.tone = discovery.tone;
  const score = document.createElement("strong");
  score.textContent = discovery.badge;
  const copy = document.createElement("span");
  copy.textContent = `${discovery.subnet} | ${discovery.controller} | SSH credential gate`;
  summary.append(score, copy);

  const grid = document.createElement("div");
  grid.className = "auto-discovery-grid";
  discovery.rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "auto-discovery-item";
    item.dataset.tone = row.tone;
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value;
    const note = document.createElement("small");
    note.textContent = row.note;
    item.append(label, value, note);
    grid.append(item);
  });

  const commands = document.createElement("div");
  commands.className = "auto-discovery-commands";
  commands.append(
    operatorCommandButton({
      label: "Discovery dry-run",
      detail: "Copy controller scan and plan command",
      command: discovery.dryRunCommand
    }),
    operatorCommandButton({
      label: "Apply credentialed hosts",
      detail: "Copy controlled deployment command",
      command: discovery.applyCommand
    })
  );

  const hosts = document.createElement("div");
  hosts.className = "auto-discovery-hosts";
  const hostRows = discovery.hosts.slice(0, 8);
  if (!hostRows.length) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = "Waiting for live fleet hosts.";
    hosts.append(empty);
  } else {
    hostRows.forEach((host) => {
      const row = document.createElement("div");
      row.className = "auto-discovery-host";
      row.dataset.tone = host.tone || "watch";
      const label = document.createElement("strong");
      label.textContent = host.host || "host";
      const meta = document.createElement("span");
      meta.textContent = [host.address, host.gpu].filter(Boolean).join(" | ") || "address learning";
      const status = document.createElement("small");
      status.textContent = host.status || "observed";
      row.append(label, meta, status);
      hosts.append(row);
    });
  }

  return [summary, grid, commands, hosts];
}

function operatorExecutionIdleNodes(executionIdle) {
  if (!executionIdle.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = executionIdle.emptyText;
    return [empty];
  }

  const summary = document.createElement("div");
  summary.className = "execution-idle-summary";
  summary.append(...executionIdle.summaries.map(executionIdleSummaryItem));

  const rows = document.createElement("div");
  rows.className = "execution-idle-grid";
  rows.append(executionIdleHeader(), ...executionIdle.rows.map(executionIdleRowNode));

  const policies = document.createElement("div");
  policies.className = "execution-idle-policy-grid";
  policies.append(...executionIdle.policyRows.map(executionIdlePolicyItem));

  return [summary, rows, policies];
}

function executionIdleRowNode(rowData) {
  const row = document.createElement("div");
  row.className = "execution-idle-row";
  row.dataset.tone = rowData.tone;
  row.append(
    executionIdleCell(rowData.host, rowData.gpuModel),
    executionIdleCell(rowData.stateLabel, `${round(rowData.confidence)}% confidence`),
    executionIdleCell(executionIdleWattsLabel(rowData.wasteWatts), Number.isFinite(rowData.powerWatts) ? `${round(rowData.powerWatts)} W board` : "power missing"),
    executionIdleCell(pct(rowData.activityPct), `${formatBytesPerSecond(rowData.deviceCommBps)} device comm`),
    executionIdleCell(rowData.cause.label, rowData.cause.note),
    executionIdleCell(rowData.action, rowData.evidence)
  );
  return row;
}

function operatorGpuExporterCoverageNodes(coverage) {
  if (!coverage.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = coverage.emptyText;
    return [empty];
  }

  const summary = document.createElement("div");
  summary.className = "gpu-exporter-summary";
  summary.append(...coverage.summaries.map(gpuExporterSummaryItem));

  const rows = document.createElement("div");
  rows.className = "gpu-exporter-grid";
  rows.append(gpuExporterHeader(), ...coverage.rows.map(gpuExporterRowNode));

  const policies = document.createElement("div");
  policies.className = "gpu-exporter-policy-grid";
  policies.append(...coverage.policyRows.map(gpuExporterPolicyItem));

  return [summary, rows, policies];
}

function gpuExporterRowNode(rowData) {
  const row = document.createElement("div");
  row.className = "gpu-exporter-row";
  row.dataset.tone = rowData.tone;
  const examples = rowData.examples.length ? rowData.examples.join(", ") : "waiting for raw metric";
  row.append(
    gpuExporterCell(rowData.label, `${round(rowData.coveragePct)}% host coverage`),
    gpuExporterCell(`${rowData.nvidiaHosts}/${rowData.hostCount}`, rowData.nvidiaHosts ? examples : "DCGM/nvidia-smi aliases"),
    gpuExporterCell(`${rowData.amdHosts}/${rowData.hostCount}`, rowData.amdHosts ? examples : "AMD DME aliases"),
    gpuExporterCell(`${rowData.normalizedHosts}/${rowData.hostCount}`, rowData.normalizedHosts ? "shared turbalance fields" : "normalizer pending"),
    gpuExporterCell(rowData.use, examples)
  );
  return row;
}

function operatorBackgroundTasksNodes(backgroundTasks) {
  const summary = document.createElement("div");
  summary.className = "background-tasks-summary";
  summary.dataset.tone = backgroundTasks.tone;

  const score = document.createElement("strong");
  score.textContent = `${backgroundTasks.counts.running}/${backgroundTasks.tasks.length}`;
  const copy = document.createElement("span");
  copy.textContent = `${backgroundTasks.counts.running} running | ${backgroundTasks.counts.watch} watch | ${backgroundTasks.counts.blocked} blocked | ${backgroundTasks.generatedLabel}`;
  summary.append(score, copy);

  const grid = document.createElement("div");
  grid.className = "background-task-grid";
  backgroundTasks.tasks.forEach((task) => {
    const row = document.createElement("article");
    row.className = "background-task-row";
    row.dataset.tone = task.tone;
    row.dataset.task = task.id;

    const marker = document.createElement("span");
    marker.className = "background-task-dot";
    marker.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    const head = document.createElement("div");
    head.className = "background-task-head";
    const label = document.createElement("strong");
    label.textContent = task.label;
    const value = document.createElement("span");
    value.textContent = task.value;
    head.append(label, value);

    const detail = document.createElement("small");
    detail.textContent = task.detail;
    const cadence = document.createElement("em");
    cadence.textContent = task.cadence;
    body.append(head, detail, cadence);
    row.append(marker, body);
    grid.append(row);
  });

  return [summary, grid];
}

function operatorProductReadinessNodes(readiness) {
  const summary = document.createElement("div");
  summary.className = "product-readiness-summary";
  summary.dataset.tone = readiness.tone;

  const score = document.createElement("strong");
  score.textContent = `${readiness.score}/100`;
  const copy = document.createElement("span");
  copy.textContent = readiness.badge === "Pilot-ready"
    ? "Operationally ready for a friendly pilot; customer security gates still need explicit sign-off."
    : readiness.badge === "Needs repair"
      ? "Repair failing runtime checks before putting this in front of a customer."
      : "Core runtime is taking shape; finish customer hardening gates before external access.";
  summary.append(score, copy);

  const grid = document.createElement("div");
  grid.className = "product-readiness-grid";
  readiness.rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "product-readiness-item";
    item.dataset.tone = row.tone;
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value;
    const note = document.createElement("small");
    note.textContent = row.note;
    item.append(label, value, note);
    grid.append(item);
  });

  return [summary, grid];
}

function operatorFleetSourceItems(summary) {
  const summaryItems = (summary.sourceItems || [])
    .filter((item) => isMachineDemoItem(item) || item.source?.context?.hostname || item.source?.context?.node);
  const machineJobs = jobs
    .filter((item) => isMachineDemoItem(item) || item.source?.context?.hostname || item.source?.context?.node);
  return machineJobs.length > 1 ? machineJobs : summaryItems;
}

function refreshSparkPairClockPanel() {
  const current = document.querySelector("#sparkPairComparePanel .spark-pair-clock-panel");
  if (!current) return;
  current.replaceWith(sparkPairClockGraphPanel(sparkPairClockHistory));
}

function renderUnitEconomicsPanel(container, economics) {
  if (!economics.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = economics.emptyText;
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "unit-economics-summary";
  summary.append(...economics.summaries.map(unitEconomicsSummaryItem));

  const grid = document.createElement("div");
  grid.className = "unit-economics-grid";
  grid.append(...economics.rows.map(unitEconomicsCard));

  container.replaceChildren(summary, grid);
}

function renderFleetComparisonPanel(container, comparison) {
  if (!comparison.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = comparison.emptyText;
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "fleet-comparison-summary";
  summary.append(...comparison.summaries.map(fleetComparisonSummaryItem));

  const benchmarkGrid = document.createElement("div");
  benchmarkGrid.className = "fleet-benchmark-histograms";
  if (comparison.benchmarkHistograms?.length) {
    benchmarkGrid.append(...comparison.benchmarkHistograms.map(fleetBenchmarkHistogramNode));
  }
  const benchmarkSection = fleetBenchmarkHistogramSection(comparison, benchmarkGrid);

  const rankGrid = document.createElement("div");
  rankGrid.className = "fleet-comparison-rank-grid";
  rankGrid.append(fleetComparisonHeader(["Rank", "Host", "Score", "Pressure", "Capacity", "Network", "Signature"], "fleet-comparison-rank-row"));
  comparison.rows.forEach((row) => {
    rankGrid.append(fleetComparisonRankRow(row));
  });

  const spreadGrid = document.createElement("div");
  spreadGrid.className = "fleet-comparison-spread-grid";
  spreadGrid.append(fleetComparisonHeader(["Metric", "Median", "Range", "Spread", "Outliers"], "fleet-comparison-spread-row"));
  comparison.spreadRows.slice(0, 10).forEach((row) => {
    spreadGrid.append(fleetComparisonSpreadRow(row));
  });

  container.replaceChildren(
    summary,
    ...(benchmarkSection ? [benchmarkSection] : []),
    rankGrid,
    spreadGrid
  );
}

function fleetBenchmarkHistogramNode(histogram) {
  const node = document.createElement("div");
  node.className = "fleet-benchmark-histogram";

  const head = document.createElement("div");
  head.className = "fleet-benchmark-head";
  const title = document.createElement("strong");
  title.textContent = histogram.label;
  const meta = document.createElement("small");
  meta.textContent = histogram.sampleCount
    ? `${histogram.bestHost || "--"} best | median ${histogram.formatter(histogram.median)}`
    : `${histogram.pendingCount} pending`;
  head.append(title, meta);

  const bars = document.createElement("div");
  bars.className = "fleet-benchmark-bars";
  histogram.bars.forEach((bar) => {
    bars.append(fleetBenchmarkBarNode(bar));
  });

  node.append(head, bars);
  return node;
}

function fleetBenchmarkBarNode(bar) {
  const row = document.createElement("div");
  row.className = "fleet-benchmark-bar-row";
  row.dataset.status = bar.status;
  if (!bar.available) row.dataset.available = "false";

  const host = document.createElement("span");
  host.textContent = bar.host;
  const track = document.createElement("span");
  track.className = "fleet-benchmark-track";
  const fill = document.createElement("i");
  fill.style.width = `${bar.percent}%`;
  track.append(fill);
  const value = document.createElement("strong");
  value.textContent = bar.label;
  const age = document.createElement("small");
  age.textContent = bar.age;
  row.append(host, track, value, age);
  return row;
}

function renderBenchmarkLadderPanel(container, ladder) {
  if (!ladder.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = ladder.emptyText;
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "benchmark-ladder-summary";
  summary.append(
    benchmarkLadderSummaryItem({
      label: "Focus",
      value: ladder.target.host,
      note: `${ladder.target.rackLabel} | ${ladder.target.clusterLabel}`,
      tone: "good"
    }),
    benchmarkLadderSummaryItem({
      label: "Coverage",
      value: `${ladder.availableMetricCount}/5`,
      note: `${ladder.measuredMetricCount} measured samples`,
      tone: ladder.availableMetricCount >= 4 ? "good" : ladder.availableMetricCount >= 2 ? "watch" : "poor"
    }),
    benchmarkLadderSummaryItem({
      label: "Index",
      value: `${round(ladder.comparisonScore)}`,
      note: "ready levels average",
      tone: ladder.tone
    })
  );

  const metrics = document.createElement("div");
  metrics.className = "benchmark-metric-grid";
  metrics.append(...ladder.metrics.map(benchmarkMetricCard));

  const levels = document.createElement("div");
  levels.className = "benchmark-ladder-grid";
  levels.append(benchmarkLadderHeader(), ...ladder.levels.map(benchmarkLadderRow));

  const sources = document.createElement("div");
  sources.className = "benchmark-source-strip";
  sources.append(...ladder.sourceLinks.map(benchmarkSourceLink));

  container.replaceChildren(summary, metrics, levels, sources);
}

function renderSparkPairComparisonPanel(container, comparison) {
  if (!comparison.available) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = comparison.emptyText;
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "spark-pair-summary";
  summary.append(...comparison.summaries.map(sparkPairSummaryItem));

  const clockPanel = sparkPairClockGraphPanel(comparison.clockHistory || []);

  const grid = document.createElement("div");
  grid.className = "spark-pair-grid";
  const header = document.createElement("div");
  header.className = "spark-pair-row spark-pair-row-head";
  ["Metric", comparison.leftLabel, comparison.rightLabel, "Delta"].forEach((text) => {
    const cell = document.createElement("span");
    cell.textContent = text;
    header.append(cell);
  });
  grid.append(header, ...comparison.rows.map(sparkPairMetricRow));

  container.replaceChildren(summary, clockPanel, grid);
}

function sparkPairClockGraphPanel(history) {
  const panel = document.createElement("div");
  panel.className = "spark-pair-clock-panel";
  const latest = history[history.length - 1] || {};
  const offsetValues = history.flatMap((sample) => [sample.leftOffsetNs, sample.rightOffsetNs, sample.offsetDeltaNs]).filter(Number.isFinite);
  const skewValues = history.map((sample) => sample.sampleSkewMs).filter(Number.isFinite);

  const head = document.createElement("div");
  head.className = "spark-pair-clock-head";
  const title = document.createElement("strong");
  title.textContent = "Clock offset";
  const meta = document.createElement("small");
  meta.textContent = history.length
    ? `${history.length} samples | delta ${sparkPairClockOffsetLabel(latest.offsetDeltaNs)} | skew ${sparkPairAgeLabel(latest.sampleSkewMs)}`
    : "waiting for SPARK clock samples";
  head.append(title, meta);

  const body = document.createElement("div");
  body.className = "spark-pair-clock-body";
  body.append(
    sparkPairClockGraphCard({
      label: "Offset",
      history,
      series: [
        { key: "leftOffsetNs", label: "SPARK1" },
        { key: "rightOffsetNs", label: "SPARK2" },
        { key: "offsetDeltaNs", label: "Delta" }
      ],
      formatter: sparkPairClockOffsetLabel,
      values: offsetValues,
      empty: "offset unavailable"
    }),
    sparkPairClockGraphCard({
      label: "Sample skew",
      history,
      series: [
        { key: "sampleSkewMs", label: "Skew" }
      ],
      formatter: sparkPairAgeLabel,
      values: skewValues,
      empty: "skew unavailable"
    })
  );

  const legend = document.createElement("div");
  legend.className = "spark-pair-clock-legend";
  [
    ["SPARK1", "spark1"],
    ["SPARK2", "spark2"],
    ["Delta", "delta"],
    ["Skew", "skew"]
  ].forEach(([label, key]) => {
    const item = document.createElement("span");
    item.dataset.series = key;
    item.textContent = label;
    legend.append(item);
  });

  panel.append(head, body, legend);
  return panel;
}

function renderOperatorLaunchpad(launchpad, commands) {
  const signature = operatorLaunchpadCommandSignature(commands);
  if (operatorLaunchpadSignature === signature && launchpad.children.length === commands.length) {
    return;
  }

  operatorLaunchpadSignature = signature;
  launchpad.replaceChildren(...commands.map(operatorCommandButton));
}

function operatorLaunchpadCommandSignature(commands) {
  return JSON.stringify(commands.map((command) => ({
    label: command.label,
    detail: command.detail,
    command: command.command || "",
    url: command.url || "",
    action: Boolean(command.action)
  })));
}

function operatorHeartbeatCard(source) {
  const item = document.createElement("div");
  item.className = "source-heartbeat-card";
  item.dataset.tone = source.tone;

  const heart = document.createElement("span");
  heart.className = "source-heartbeat-heart";
  heart.setAttribute("aria-hidden", "true");
  heart.textContent = "♥";

  const copy = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = source.label;
  const note = document.createElement("small");
  note.textContent = source.note;
  copy.append(label, note);

  const status = document.createElement("span");
  status.className = "source-heartbeat-status";
  status.textContent = source.status;

  item.append(heart, copy, status);
  return item;
}

function operatorTimelineItem(event) {
  const item = document.createElement("article");
  item.className = "event-timeline-item";
  item.dataset.tone = event.tone;

  const marker = document.createElement("span");
  marker.className = "event-timeline-marker";
  marker.textContent = operatorTimelineIcon(event.source);
  const body = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = event.label;
  const note = document.createElement("small");
  note.textContent = event.note || event.source;
  const time = document.createElement("time");
  time.textContent = event.time ? event.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "now";
  if (event.time) time.dateTime = event.time.toISOString();
  body.append(label, note);

  item.append(marker, body, time);
  return item;
}

function operatorTimelineIcon(source) {
  return {
    host: "H",
    kubernetes: "K8s",
    scheduler: "Q",
    prometheus: "P",
    dcgm: "GPU",
    kafka: "K",
    grafana: "G",
    gb10: "G10",
    analyzer: "A",
    opportunity: "$",
    simulator: "S",
    confidence: "%"
  }[source] || "•";
}

function operatorCommandButton(command) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-command-button";
  const label = document.createElement("strong");
  label.textContent = command.label;
  const detail = document.createElement("small");
  detail.textContent = command.detail;
  button.append(label, detail);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.dataset.state = "working";
    try {
      if (command.action) {
        command.action();
        setLaunchpadButtonFeedback(button, detail, "Started");
        return;
      }
      if (command.url) {
        const opened = window.open(command.url, "_blank");
        if (opened) {
          opened.opener = null;
          setIngestStatus(`${command.label} opened`, "good");
          setLaunchpadButtonFeedback(button, detail, "Opened");
          return;
        }
        const copied = await copyTextToClipboard(command.url);
        setIngestStatus(copied ? `${command.label} link copied` : `${command.label} link ready to copy`, copied ? "good" : "watch");
        setLaunchpadButtonFeedback(button, detail, copied ? "Link copied" : "Link ready");
        if (!copied) showManualCopyPrompt(command.label, command.url);
        return;
      }
      const copied = await copyTextToClipboard(command.command);
      setIngestStatus(copied ? `${command.label} command copied` : `${command.label} command ready to copy`, copied ? "good" : "watch");
      setLaunchpadButtonFeedback(button, detail, copied ? "Command copied" : "Command ready");
      if (!copied) showManualCopyPrompt(command.label, command.command);
    } catch (error) {
      setIngestStatus(`${command.label} failed`, "poor");
      setLaunchpadButtonFeedback(button, detail, "Try again");
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.dataset.state = "";
        detail.textContent = command.detail;
      }, 1400);
    }
  });
  return button;
}

function operatorKafkaNodes(kafka) {
  const nodes = [];
  const summary = document.createElement("div");
  summary.className = "kafka-stream-summary";
  summary.dataset.tone = kafka.reachable ? "good" : "poor";
  summary.append(
    operatorMetricPill(kafka.reachable ? "reachable" : "missing", "Broker"),
    operatorMetricPill(kafka.processedMessages ? `${kafka.processedMessages}` : "n/a", "Messages"),
    operatorMetricPill(kafka.status, "Smoke")
  );
  nodes.push(summary);

  const details = document.createElement("dl");
  details.className = "operator-detail-list";
  [
    ["Cluster bootstrap", kafka.bootstrapServers],
    ["NodePort", kafka.nodePortBootstrap],
    ["Topic", kafka.topic || "No smoke topic observed"],
    ["Message ID", kafka.messageId || "No consumed payload observed"],
    ["Timestamp", kafka.timestamp || "n/a"]
  ].forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    details.append(dt, dd);
  });
  nodes.push(details);

  const pre = document.createElement("pre");
  pre.className = "kafka-payload";
  pre.textContent = Object.keys(kafka.payload || {}).length ? JSON.stringify(kafka.payload, null, 2) : "No Kafka payload captured yet. Run the Kafka smoke check to attach the latest proof.";
  nodes.push(pre);
  return nodes;
}

function operatorConfidenceNodes(confidence) {
  const meter = document.createElement("div");
  meter.className = "confidence-meter";
  meter.dataset.tone = confidence.score >= 80 ? "good" : confidence.score >= 55 ? "watch" : "poor";
  const value = document.createElement("strong");
  value.textContent = pct(confidence.score);
  const track = document.createElement("span");
  const fill = document.createElement("i");
  fill.style.width = `${clamp(confidence.score)}%`;
  track.append(fill);
  meter.append(value, track);

  const list = document.createElement("ul");
  list.className = "confidence-list";
  [
    `${confidence.sourceCount}/${confidence.totalSources} sources present`,
    `Source freshness score ${pct(confidence.sourceScore)}`,
    `Workload evidence score ${pct(confidence.workloadScore)}`,
    confidence.missing.length ? `Missing: ${confidence.missing.join(", ")}` : "No critical source is fully missing",
    confidence.stale.length ? `Stale: ${confidence.stale.join(", ")}` : "No critical source is stale"
  ].forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  });

  return [meter, list];
}

function operatorReplayNodes(cockpit) {
  const status = document.createElement("p");
  status.textContent = state.operatorReplay
    ? `Replaying the latest ${liveTelemetryHistory.length} live telemetry samples.`
    : `Ready to replay ${liveTelemetryHistory.length} captured live telemetry samples.`;

  const controls = document.createElement("div");
  controls.className = "replay-controls";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = state.operatorReplay ? "Stop Replay" : "Replay Latest";
  toggle.disabled = liveTelemetryHistory.length < 2;
  toggle.addEventListener("click", () => {
    state.operatorReplay = !state.operatorReplay;
    state.operatorReplayStartedAt = state.operatorReplay ? new Date() : null;
    render();
  });
  const capture = document.createElement("button");
  capture.type = "button";
  capture.textContent = "Export Evidence v2";
  capture.addEventListener("click", exportEvidencePack);
  controls.append(toggle, capture);

  const note = document.createElement("small");
  note.textContent = cockpit.generatedAt
    ? `Latest live sample ${formatHostSampleAgeMilliseconds(cockpit.ageMilliseconds)} old. Replay is browser-local and uses the current session history.`
    : "Replay will activate once live samples are collected.";
  return [status, controls, note];
}

function operatorGrafanaNodes(grafana) {
  if (!grafana.links.length) {
    const empty = document.createElement("p");
    empty.className = "operator-empty";
    empty.textContent = "No Grafana dashboard or Explore link is attached to this selection yet.";
    return [empty];
  }

  const details = document.createElement("dl");
  details.className = "operator-detail-list";
  [
    ["Dashboard", grafana.dashboards[0] || "n/a"],
    ["Datasource", grafana.datasources[0] || "n/a"],
    ["Instance", grafana.instances[0] || "n/a"],
    ["Range", grafanaTimeRangeLabel(grafana.timeRange)]
  ].forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    details.append(dt, dd);
  });

  const links = document.createElement("div");
  links.className = "grafana-mini-links";
  grafana.links.slice(0, 3).forEach((link) => {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label || titleCase(link.type || "Grafana link");
    links.append(anchor);
  });

  return [details, links];
}

function operatorFleetTile(tile) {
  const item = document.createElement(tile.key ? "button" : "article");
  item.className = "fleet-tile";
  item.dataset.tone = tile.tone;
  if (tile.key) {
    item.type = "button";
    item.setAttribute("aria-selected", String(tile.selected));
    item.setAttribute("aria-label", `Show ${tile.host} telemetry`);
    item.addEventListener("click", () => {
      state.scope = "job";
      state.selectedKey = tile.key;
      render();
    });
  }
  const title = document.createElement("strong");
  title.textContent = tile.host;
  const gpu = document.createElement("span");
  gpu.textContent = tile.gpu;
  const status = document.createElement("small");
  status.textContent = `${tile.status}${tile.age === null ? "" : ` | ${tile.age}s old`}`;
  const services = document.createElement("small");
  services.textContent = tile.services.length ? tile.services.join(", ") : "No local services";
  item.append(title, gpu, status, services);
  return item;
}

function operatorMetricPill(value, label) {
  const pill = document.createElement("span");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = value;
  small.textContent = label;
  pill.append(strong, small);
  return pill;
}

function renderLiveTelemetryAlerts(container, analysis) {
  const platformMatrix = platformVirtualSensorCache.baseUrl === platformApiBaseUrl()
    ? platformVirtualSensorCache.matrix
    : null;
  const effectiveAnalysis = platformMatrix
    ? {
        ...analysis,
        covarianceMatrix: platformMatrix,
        covarianceBadgeText: "API virtual sensors",
        covarianceFootText: "Covariance and principal mode loaded from the platform API virtual sensor tables."
      }
    : analysis;
  const wrapper = document.createElement("section");
  wrapper.className = "live-relationship-panel";

  const head = document.createElement("div");
  head.className = "live-relationship-head";
  const label = document.createElement("p");
  label.textContent = "Relationship Watch";
  const title = document.createElement("h3");
  title.textContent = effectiveAnalysis.status;
  const badge = document.createElement("span");
  badge.textContent = effectiveAnalysis.badgeText || (effectiveAnalysis.sampleCount
    ? `${effectiveAnalysis.sampleCount} samples | ${effectiveAnalysis.windowSeconds}s`
    : "No samples");
  head.append(label, title, badge);

  const relationshipGrid = document.createElement("div");
  relationshipGrid.className = "live-relationship-grid";
  effectiveAnalysis.relationships.forEach((relationship) => {
    relationshipGrid.append(liveRelationshipCard(relationship));
  });

  const covariancePanel = effectiveAnalysis.covarianceMatrix
    ? liveCovarianceMatrixPanel(effectiveAnalysis.covarianceMatrix, effectiveAnalysis)
    : null;

  const alertList = document.createElement("div");
  alertList.className = "live-alert-list";
  if (!effectiveAnalysis.alerts.length) {
    const empty = document.createElement("div");
    empty.className = "live-alert-empty";
    empty.textContent = effectiveAnalysis.emptyAlertText || (effectiveAnalysis.sampleCount < 6
      ? "Learning enough signal history to score adverse trends."
      : "No adverse relationship trend detected in the current window.");
    alertList.append(empty);
  } else {
    effectiveAnalysis.alerts.forEach((alert) => {
      alertList.append(liveAlertCard(alert));
    });
  }

  wrapper.append(head);
  if (covariancePanel) wrapper.append(covariancePanel);
  wrapper.append(relationshipGrid, alertList);
  container.replaceChildren(wrapper);
  refreshPlatformVirtualSensors(container, analysis);
}

function renderSystemCharacterizationPanel(container, characterization) {
  if (!characterization || characterization.status !== "ready" || !characterization.hosts.length) {
    const empty = document.createElement("div");
    empty.className = "operator-empty";
    empty.textContent = platformApiBaseUrl()
      ? "Waiting for system-identification virtual sensor rows."
      : "Platform API is not configured for this dashboard host.";
    container.replaceChildren(empty);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "system-characterization-summary";
  characterization.hosts.slice(0, SYSTEM_CHARACTERIZATION_HOST_LIMIT).forEach((host) => {
    summary.append(systemCharacterizationHostCard(host));
  });

  const chart = systemCharacterizationProfileChart(characterization.hosts);
  const trends = systemCharacterizationTrendGrid(characterization.hosts);
  container.replaceChildren(summary, chart, trends);
}

function renderLiveObservationLog(container, analysis, machineContext, history) {
  const sampleHistory = Array.isArray(history) ? history : [];
  const contextKey = liveObservationContextKey(analysis, machineContext, sampleHistory);
  const rawObservations = Array.isArray(analysis.observations)
    ? analysis.observations.slice(0, LIVE_OBSERVATION_LIMIT)
    : liveObservations(analysis, machineContext, sampleHistory);
  const observations = filterLiveObservationRows(rawObservations, contextKey);
  const latest = sampleHistory[sampleHistory.length - 1] || {};
  const wrapper = document.createElement("section");
  wrapper.className = "live-observation-panel";

  const head = document.createElement("div");
  head.className = "live-observation-head";
  const label = document.createElement("p");
  label.textContent = "Observation Log";
  const title = document.createElement("h3");
  title.textContent = `${observations.length} ${observations.length === 1 ? "entry" : "entries"}`;
  const meta = document.createElement("div");
  meta.className = "live-observation-meta";
  const badge = document.createElement("span");
  badge.textContent = latest.label ? `Latest ${latest.label}` : analysis.badgeText || "Waiting";
  meta.append(
    badge,
    liveObservationActions({
      observations,
      contextKey,
      clearTimestampMs: liveObservationClearTimestamp(rawObservations, sampleHistory),
      onClear: () => renderLiveObservationLog(container, analysis, machineContext, sampleHistory)
    })
  );
  head.append(label, title, meta);

  if (!observations.length) {
    const empty = document.createElement("div");
    empty.className = "live-observation-empty";
    empty.textContent = liveObservationWasCleared(contextKey) && rawObservations.length
      ? "Observation log cleared. Waiting for a newer sample."
      : analysis.emptyObservationText || (sampleHistory.length ? "No meaningful observation events in the current window." : "Waiting for live samples.");
    wrapper.append(head, empty);
    container.replaceChildren(wrapper);
    return;
  }

  const list = document.createElement("ol");
  list.className = "live-observation-list";
  observations.forEach((observation) => {
    list.append(liveObservationItem(observation));
  });

  wrapper.append(head, list);
  container.replaceChildren(wrapper);
}

function liveCovarianceMatrixPanel(matrix, analysis) {
  const panel = document.createElement("section");
  panel.className = "live-covariance-panel";

  const head = document.createElement("div");
  head.className = "live-covariance-head";
  const label = document.createElement("p");
  label.textContent = "Covariance Matrix";
  const title = document.createElement("h3");
  title.textContent = "CPU, GPU, RAM, network";
  const badge = document.createElement("span");
  badge.textContent = analysis.covarianceBadgeText || (analysis.sampleCount >= 4
    ? `Rolling ${Math.min(analysis.sampleCount, LIVE_TELEMETRY_RELATIONSHIP_WINDOW)} samples`
    : "Learning");
  head.append(label, title, badge);

  const scroller = document.createElement("div");
  scroller.className = "live-covariance-scroll";
  const grid = document.createElement("div");
  grid.className = "live-covariance-grid";
  grid.setAttribute("role", "table");
  grid.setAttribute("aria-label", "Rolling live covariance matrix for CPU load, GPU utilization, RAM usage, and network utilization");

  const corner = document.createElement("div");
  corner.className = "live-covariance-corner";
  corner.setAttribute("aria-hidden", "true");
  grid.append(corner);

  matrix.metrics.forEach((metric) => {
    const columnHeader = document.createElement("div");
    columnHeader.className = "live-covariance-axis live-covariance-axis-column";
    columnHeader.setAttribute("role", "columnheader");
    columnHeader.textContent = metric.shortLabel;
    columnHeader.title = metric.label;
    grid.append(columnHeader);
  });

  matrix.rows.forEach((row) => {
    const rowHeader = document.createElement("div");
    rowHeader.className = "live-covariance-axis live-covariance-axis-row";
    rowHeader.setAttribute("role", "rowheader");
    rowHeader.textContent = row.metric.shortLabel;
    rowHeader.title = row.metric.label;
    grid.append(rowHeader);

    row.cells.forEach((cell) => {
      grid.append(liveCovarianceMatrixCell(cell));
    });
  });

  scroller.append(grid);
  const principalMode = livePrincipalResourceModePanel(matrix.principalMode);
  const foot = document.createElement("div");
  foot.className = "live-covariance-foot";
  foot.textContent = analysis.covarianceFootText || "Covariance in percentage-point^2; color follows correlation. Mini-lines show each cell's rolling trend.";
  panel.append(head, scroller, principalMode, foot);
  return panel;
}

function livePrincipalResourceModePanel(mode) {
  const panel = document.createElement("section");
  panel.className = "live-eigen-panel";
  panel.dataset.status = mode?.status || "learning";

  const head = document.createElement("div");
  head.className = "live-eigen-head";
  const label = document.createElement("p");
  label.textContent = "Principal Resource Mode";
  const title = document.createElement("h3");
  title.textContent = mode?.title || "Learning resource mode";
  const badge = document.createElement("span");
  badge.textContent = Number.isFinite(mode?.explainedPct)
    ? `${pct(mode.explainedPct)} explained`
    : mode?.badge || "Learning";
  head.append(label, title, badge);

  const loadings = document.createElement("div");
  loadings.className = "live-eigen-loadings";
  (mode?.loadings || LIVE_COVARIANCE_METRICS.map((metric) => ({ ...metric, value: null }))).forEach((loading) => {
    loadings.append(liveEigenLoadingItem(loading));
  });

  const values = document.createElement("div");
  values.className = "live-eigen-values";
  if (mode?.eigenvalues?.length) {
    mode.eigenvalues.forEach((entry, index) => {
      values.append(liveEigenValueItem(entry, index));
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "live-eigen-empty";
    empty.textContent = mode?.note || "Waiting for enough live covariance history to compute eigenvalues.";
    values.append(empty);
  }

  const note = document.createElement("small");
  note.className = "live-eigen-note";
  note.textContent = mode?.note || "Computed from the rolling correlation matrix so each resource contributes on the same scale.";

  panel.append(head, loadings, values, note);
  return panel;
}

function renderAnalysisResourceGraphs(container, summary, history = analysisResourceHistory(summary)) {
  const latest = history[history.length - 1] || {};
  const latestLabel = "Current analysis snapshot";
  container.replaceChildren(
    liveTelemetryGraphCard({
      label: "Network util",
      valueKey: "networkUtilization",
      history,
      latestLabel,
      valueText: pct(latest.networkUtilization),
      note: "NIC/link utilization from run evidence",
      max: 100,
      tone: inverseGrade(latest.networkUtilization, 70, 88).key
    }),
    liveTelemetryGraphCard({
      label: "GPU util",
      valueKey: "gpu",
      history,
      latestLabel,
      valueText: pct(latest.gpu),
      note: "Accelerator utilization",
      max: 100,
      tone: grade(latest.gpu, 45, 70).key
    }),
    liveTelemetryGraphCard({
      label: "CPU prep",
      valueKey: "cpuPrep",
      history,
      latestLabel,
      valueText: pct(latest.cpuPrep),
      note: "Host-side CPU proxy",
      max: 100,
      tone: inverseGrade(latest.cpuPrep, 20, 35).key
    }),
    liveTelemetryGraphCard({
      label: "Network wait",
      valueKey: "networkWait",
      history,
      latestLabel,
      valueText: pct(latest.networkWait),
      note: "Latency/loss/stall pressure",
      max: 100,
      tone: inverseGrade(latest.networkWait, 10, 20).key
    }),
    liveTelemetryGraphCard({
      label: "NCCL time",
      valueKey: "ncclTime",
      history,
      latestLabel,
      valueText: pct(latest.ncclTime),
      note: "Collective communication time",
      max: 100,
      tone: inverseGrade(latest.ncclTime, 15, 30).key
    })
  );
}

function renderLiveTelemetryGraphs(container, machineContext, history) {
  const sampleCount = history.length;
  const latest = history[sampleCount - 1] || {};
  const latestLabel = latest.label ? `Latest sample ${latest.label}` : "Waiting for live samples";
  const networkGraphKey = Number.isFinite(latest.networkUtilization) ? "networkUtilization" : "networkThroughputBps";
  const networkGraphHasPercent = networkGraphKey === "networkUtilization";
  container.replaceChildren(
    liveTelemetryGraphCard({
      label: "CPU",
      valueKey: "cpu",
      history,
      latestLabel,
      valueText: pct(latest.cpu),
      note: "Host CPU usage",
      max: 100,
      tone: inverseGrade(latest.cpu, 70, 90).key
    }),
    liveTelemetryGraphCard({
      label: "RAM",
      valueKey: "ram",
      history,
      latestLabel,
      valueText: pct(latest.ram),
      note: latest.memoryUsedBytes ? `${formatBytes(latest.memoryUsedBytes)} used` : "Host memory usage",
      max: 100,
      tone: inverseGrade(latest.ram, 75, 90).key
    }),
    liveTelemetryGraphCard({
      label: "GPU util",
      valueKey: "gpu",
      history,
      latestLabel,
      valueText: machineContext.gpuPresent ? pct(latest.gpu) : "unavailable",
      note: machineContext.gpuPresent
        ? machineContext.gpuSampleCached
          ? `nvidia-smi cached ${Math.max(1, Math.round(machineContext.gpuSampleAgeMs / 1000))}s`
          : "nvidia-smi utilization.gpu"
        : "Driver telemetry blocked",
      max: 100,
      tone: machineContext.gpuPresent ? grade(latest.gpu, 30, 70).key : "poor"
    }),
    liveTelemetryGraphCard({
      label: "GPU power",
      valueKey: "gpuPower",
      history,
      latestLabel,
      valueText: latest.gpuPower ? `${round(latest.gpuPower)} W` : "not reported",
      note: latest.gpuTemperature ? `${round(latest.gpuTemperature)} C` : "Power counter unavailable",
      max: adaptiveGraphMax(history, "gpuPower", 450),
      tone: latest.gpuPower ? inverseGrade(latest.gpuPower, 330, 430).key : "watch"
    }),
    liveTelemetryGraphCard({
      label: "GPU memory",
      valueKey: "gpuMemory",
      history,
      latestLabel,
      valueText: machineContext.gpuPresent ? pct(latest.gpuMemory) : "unavailable",
      note: machineContext.gpuPresent ? "GPU memory in use" : "Driver telemetry blocked",
      max: 100,
      tone: machineContext.gpuPresent ? inverseGrade(latest.gpuMemory, 82, 94).key : "poor"
    }),
    liveTelemetryGraphCard({
      label: "Disk",
      valueKey: "disk",
      history,
      latestLabel,
      valueText: pct(latest.disk),
      note: "Root filesystem usage",
      max: 100,
      tone: inverseGrade(latest.disk, 75, 90).key
    }),
    liveTelemetryGraphCard({
      label: "Network util",
      valueKey: networkGraphKey,
      history,
      latestLabel,
      valueText: networkGraphHasPercent
        ? pct(latest.networkUtilization)
        : Number.isFinite(latest.networkThroughputBps) ? formatBytesPerSecond(latest.networkThroughputBps) : "learning",
      note: networkGraphHasPercent ? "NIC link utilization" : "NIC throughput",
      max: networkGraphHasPercent ? 100 : adaptiveGraphMax(history, "networkThroughputBps", 1),
      tone: networkGraphHasPercent ? inverseGrade(latest.networkUtilization, 70, 88).key : "watch"
    })
  );
}

function renderSchedulerSimulator(simulator, summary = null) {
  const controls = document.querySelectorAll("#simulatorControls button");
  const stats = document.querySelector("#simulatorStats");
  const narrative = document.querySelector("#simulatorNarrative");
  const list = document.querySelector("#simulatorScenarios");
  const badge = document.querySelector("#simulatorBadge");
  if (!stats || !narrative || !list || !badge) return;
  const machineContext = summary ? machineDemoContext(summary) : null;

  if (machineContext) {
    controls.forEach((button) => button.setAttribute("aria-selected", "false"));
    badge.textContent = "No scheduler export";
    stats.replaceChildren(
      simulatorStat("GPU process", machineContext.gpuProcessQuerySkipped ? "skipped" : machineContext.gpuProcesses.length ? `${machineContext.gpuProcesses.length} active` : "none", machineContext.gpuProcesses.length ? "good" : "watch"),
      simulatorStat("Docker", `${machineContext.dockerContainers.length} containers`, machineContext.dockerContainers.length ? "good" : "watch"),
      simulatorStat("Services", `${machineDemoServices(machineContext.context.observedServices).length} reachable`, "good"),
      simulatorStat("Workload counters", machineContext.workloadCountersObserved ? "present" : "not collected", machineContext.workloadCountersObserved ? "good" : "watch")
    );
    narrative.replaceChildren(
      simulatorNarrativeItem("Scope", "Single Linux host observation"),
      simulatorNarrativeItem("Scheduler", "No Kubernetes, Slurm, admission, or provider scheduler export is attached"),
      simulatorNarrativeItem("Next signal", machineContext.driverUnavailable ? "Fix NVIDIA driver access before expecting GPU counters" : machineContext.gpuProcessQuerySkipped ? "Use a slower diagnostic collection when process attribution matters" : machineContext.idle ? "Start a controlled GPU workload to measure active behavior" : "Join request or training counters to the host sample")
    );
    list.replaceChildren();
    return;
  }

  const scenarios = simulator.scenarios || [];
  const recommended = simulator.recommended || scenarios[0];
  const selected = state.schedulerScenario === "recommended"
    ? recommended
    : scenarios.find((scenario) => scenario.id === state.schedulerScenario) || recommended;

  if (!selected) {
    stats.replaceChildren();
    narrative.replaceChildren();
    list.replaceChildren();
    badge.textContent = "No scenario";
    return;
  }

  controls.forEach((button) => {
    const selectedControl = button.dataset.schedulerScenario === state.schedulerScenario
      || (state.schedulerScenario === "recommended" && selected.id === recommended?.id && button.dataset.schedulerScenario === "recommended");
    button.setAttribute("aria-selected", String(selectedControl));
  });

  badge.textContent = selected.id === recommended?.id ? "Recommended" : selected.label;
  stats.replaceChildren(
    simulatorStat("GPU-hour upside", number.format(selected.recoveredGpuHours), "good"),
    simulatorStat("Dollar upside", currency.format(selected.dollarUpside), "good"),
    simulatorStat("Queue saved", `${round(selected.deltas.queueWaitMinutes)} min`, selected.deltas.queueWaitMinutes > 0 ? "good" : "watch"),
    simulatorStat("Placement fit", pct(selected.projected.placementQuality), grade(selected.projected.placementQuality, 65, 82).key)
  );

  narrative.replaceChildren(
    simulatorNarrativeItem("Scenario", selected.label),
    simulatorNarrativeItem("Action", selected.action),
    simulatorNarrativeItem("Projection", `${pct(selected.projected.usefulCompute)} useful compute, ${round(selected.projected.queueWaitMinutes)} minute queue wait, ${pct(selected.projected.crossPodTraffic)} cross-pod traffic.`)
  );

  list.replaceChildren();
  scenarios.forEach((scenario) => {
    list.append(simulatorScenarioCard(scenario, selected.id === scenario.id, recommended?.id === scenario.id));
  });
}

function renderGrafanaHandoff(summary) {
  const badge = document.querySelector("#grafanaBadge");
  const context = document.querySelector("#grafanaContext");
  const links = document.querySelector("#grafanaLinks");
  if (!badge || !context || !links) return;
  const machineContext = machineDemoContext(summary);

  if (machineContext) {
    const services = machineDemoServices(machineContext.context.observedServices);
    const grafanaLinks = [
      machineContext.context.grafanaDashboardUrl ? {
        label: machineContext.context.grafanaDashboardTitle || "turbalance Fleet Runtime",
        type: "dashboard",
        url: machineContext.context.grafanaDashboardUrl
      } : null,
      machineContext.context.grafanaExploreUrl ? {
        label: "Explore",
        type: "explore",
        url: machineContext.context.grafanaExploreUrl
      } : null
    ].filter(Boolean);
    badge.textContent = services.includes("grafana") ? "Service reachable" : "No Grafana";
    context.replaceChildren(
      grafanaContextItem("Dashboard", machineContext.context.grafanaDashboardTitle || "No dashboard overlay imported"),
      grafanaContextItem("Datasource", machineContext.context.grafanaDatasourceName || (services.includes("node-exporter") ? "node-exporter reachable" : "No datasource export")),
      grafanaContextItem("Window", "live host sample"),
      grafanaContextItem("Variables", machineContext.host)
    );
    links.replaceChildren();
    if (grafanaLinks.length) {
      grafanaLinks.forEach((link) => links.append(grafanaLinkItem(link)));
      return;
    }
    const empty = document.createElement("div");
    empty.className = "grafana-empty";
    empty.textContent = services.includes("grafana")
      ? "Grafana health is reachable, but no dashboard/export contract is attached to this live sample."
      : "No Grafana service was detected on this host.";
    links.append(empty);
    return;
  }

  const grafana = summary.grafana || {};
  const sourceCount = numeric(grafana.sourceCount);
  const linkItems = grafana.links || [];

  badge.textContent = sourceCount > 0
    ? `${linkItems.length} ${linkItems.length === 1 ? "link" : "links"}`
    : "No overlay";

  context.replaceChildren(
    grafanaContextItem("Dashboard", listLabel(grafana.dashboards, 2)),
    grafanaContextItem("Datasource", listLabel(grafana.datasources, 2)),
    grafanaContextItem("Window", grafanaTimeRangeLabel(grafana.timeRange)),
    grafanaContextItem("Variables", grafana.variableKeys?.length ? grafana.variableKeys.slice(0, 4).join(", ") : "n/a")
  );

  links.replaceChildren();
  if (linkItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grafana-empty";
    empty.textContent = "No Grafana links attached";
    links.append(empty);
    return;
  }

  linkItems.slice(0, 5).forEach((link) => {
    links.append(grafanaLinkItem(link));
  });
}

function renderTaskMemory(memory) {
  const panel = document.querySelector("#taskMemoryPanel");
  const badge = document.querySelector("#taskMemoryBadge");
  const identity = document.querySelector("#taskMemoryIdentity");
  const resources = document.querySelector("#taskMemoryResources");
  const changes = document.querySelector("#taskMemoryChanges");
  if (!panel || !badge || !identity || !resources || !changes) return;

  if (!memory?.visible || !memory.current) {
    panel.hidden = true;
    identity.replaceChildren();
    resources.replaceChildren();
    changes.replaceChildren();
    return;
  }

  const current = memory.current;
  const resource = current.resources || {};
  const category = current.categories || {};

  panel.hidden = false;
  badge.textContent = taskMemoryBadgeText(memory);
  badge.dataset.tone = taskMemoryTone(memory.differenceLevel);

  identity.replaceChildren(
    taskMemoryIdentityItem("Task family", current.taskLabel),
    taskMemoryIdentityItem("Current run", listLabel(current.runIds.length ? current.runIds : [current.key], 2)),
    taskMemoryIdentityItem("Category", taskMemoryCategoryLabel(category.primary)),
    taskMemoryIdentityItem("History", memory.previousRuns > 0 ? `${memory.previousRuns} previous ${memory.previousRuns === 1 ? "run" : "runs"}` : "Learning")
  );

  resources.replaceChildren(
    taskMemoryResourceCard("Accelerators", `${number.format(resource.gpus)} GPUs`, listLabel(resource.gpuModels, 2) || "GPU model unknown"),
    taskMemoryResourceCard("Placement", `${number.format(resource.nodes.length)} nodes`, `${listLabel(resource.clusters, 2)} | ${number.format(resource.partialNodes.length)} partial`),
    taskMemoryResourceCard("Scheduler", listLabel(resource.queueNames, 2) || "No queue", listLabel(resource.requestedGpuShapes, 2) || listLabel(resource.priorityClasses, 2) || "No shape"),
    taskMemoryResourceCard("Owner", listLabel(resource.tenants, 1), listLabel(resource.reservations, 1)),
    taskMemoryResourceCard("Sources", `${number.format(resource.adapters.length)} adapters`, listLabel(resource.adapters, 3) || "Seeded run")
  );

  changes.replaceChildren();
  const changeRows = [
    ...(memory.categoryChange ? [taskMemoryCategoryChangeRow(memory.categoryChange)] : []),
    ...memory.significantChanges.slice(0, 5).map(taskMemoryMetricChangeRow),
    ...memory.resourceChanges.slice(0, 3).map(taskMemoryResourceChangeRow)
  ];

  if (changeRows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task-memory-empty";
    empty.textContent = memory.summary;
    changes.append(empty);
    return;
  }

  changeRows.forEach((row) => changes.append(row));
}

function renderTrend(summary) {
  const metricKey = TREND_METRIC_DEFS[state.trendMetric] ? state.trendMetric : "usefulCompute";
  const metric = TREND_METRIC_DEFS[metricKey];
  const points = trendPointsFor(summary, metricKey);
  const trend = analytics.summarizeTrend(points, metric);

  renderTrendControls(metricKey);
  renderTrendStats(trend, metric);
  renderTrendChart(points, metric);
  renderTrendList(points, metric);

  const badge = document.querySelector("#trendBadge");
  if (badge) {
    badge.textContent = `${trend.count} ${trend.count === 1 ? "point" : "points"}`;
  }
}

function renderTrendControls(metricKey) {
  document.querySelectorAll("#trendMetricControls button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.trendMetric === metricKey));
  });
}

function renderTrendStats(trend, metric) {
  const latest = document.querySelector("#trendLatest");
  const delta = document.querySelector("#trendDelta");
  const best = document.querySelector("#trendBest");

  if (!latest || !delta || !best) return;

  if (trend.count === 0) {
    latest.textContent = "-";
    delta.textContent = "-";
    best.textContent = "-";
    delta.dataset.direction = "flat";
    return;
  }

  latest.textContent = metric.format(trend.latest.value);
  delta.textContent = metric.formatDelta(trend.delta);
  delta.dataset.direction = trend.direction;
  best.textContent = metric.format(trend.best.value);
}

function renderTrendChart(points, metric) {
  const svg = document.querySelector("#trendChart");
  if (!svg) return;

  const width = 760;
  const height = 260;
  const margin = { top: 22, right: 24, bottom: 42, left: 62 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  svg.replaceChildren();
  const title = svgNode("title", { id: "trendTitle" });
  title.textContent = `${metric.label} trend`;
  const desc = svgNode("desc", { id: "trendDesc" });
  desc.textContent = "Recent persisted analysis snapshots for the selected scope.";
  svg.append(title, desc);

  const values = points.map((point) => point.value);
  const extent = trendExtent(values, metric);
  drawTrendGrid(svg, extent, metric, margin, chartWidth, chartHeight);

  if (points.length === 0) {
    const empty = svgNode("text", {
      x: width / 2,
      y: height / 2,
      class: "trend-empty"
    });
    empty.textContent = "No snapshots";
    svg.append(empty);
    return;
  }

  const coordinates = points.map((point, index) => ({
    point,
    x: margin.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
    y: margin.top + ((extent.max - point.value) / (extent.max - extent.min)) * chartHeight
  }));

  if (coordinates.length > 1) {
    svg.append(svgNode("path", {
      d: trendAreaPath(coordinates, margin.top + chartHeight),
      class: "trend-area"
    }));
    svg.append(svgNode("path", {
      d: trendLinePath(coordinates),
      class: "trend-line"
    }));
  }

  coordinates.forEach((coordinate) => {
    const dot = svgNode("circle", {
      cx: coordinate.x,
      cy: coordinate.y,
      r: 5,
      class: "trend-dot"
    });
    const dotTitle = svgNode("title");
    dotTitle.textContent = `${formatSnapshotTime(coordinate.point.capturedAt)} ${metric.format(coordinate.point.value)}`;
    dot.append(dotTitle);
    svg.append(dot);
  });

  drawTrendDateLabels(svg, coordinates, margin.top + chartHeight + 28);
}

function drawTrendGrid(svg, extent, metric, margin, chartWidth, chartHeight) {
  const ticks = 4;

  for (let index = 0; index <= ticks; index += 1) {
    const ratio = index / ticks;
    const y = margin.top + ratio * chartHeight;
    const value = extent.max - ratio * (extent.max - extent.min);
    svg.append(svgNode("line", {
      x1: margin.left,
      y1: y,
      x2: margin.left + chartWidth,
      y2: y,
      class: "trend-grid-line"
    }));

    const label = svgNode("text", {
      x: margin.left - 10,
      y: y + 4,
      class: "trend-axis-label",
      "text-anchor": "end"
    });
    label.textContent = metric.format(value);
    svg.append(label);
  }
}

function drawTrendDateLabels(svg, coordinates, y) {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  [first, last].filter(Boolean).forEach((coordinate, index) => {
    if (index === 1 && first === last) return;

    const label = svgNode("text", {
      x: coordinate.x,
      y,
      class: "trend-axis-label",
      "text-anchor": index === 0 ? "start" : "end"
    });
    label.textContent = formatSnapshotTime(coordinate.point.capturedAt);
    svg.append(label);
  });
}

function renderTrendList(points, metric) {
  const list = document.querySelector("#trendList");
  if (!list) return;

  list.replaceChildren();
  points.slice(-5).reverse().forEach((point) => {
    const item = document.createElement("div");
    item.className = "trend-row";

    const value = document.createElement("strong");
    value.textContent = metric.format(point.value);

    const source = document.createElement("span");
    source.textContent = `${formatSnapshotTime(point.capturedAt)} | ${point.source}`;

    const bottleneck = document.createElement("span");
    bottleneck.textContent = point.primaryBottleneck;

    item.append(value, source, bottleneck);
    list.append(item);
  });
}

function renderTruthTable(summary) {
  const rows = [
    {
      question: "Are GPUs doing useful work?",
      metric: `${pct(summary.gpuUtil)} GPU utilization, ${pct(summary.usefulCompute)} useful compute, ${pct(summary.tensorCoreUtil)} tensor-core use`,
      status: grade(summary.usefulCompute, 55, 72)
    },
    {
      question: "Are GPUs idle because of communication?",
      metric: `${pct(summary.ncclTime)} collectives time, ${pct(summary.networkWait)} network wait, ${pct(summary.networkUtilization)} network utilization`,
      status: inverseGrade(summary.ncclTime + summary.networkWait + summary.networkUtilization * 0.16, 18, 34)
    },
    {
      question: "Are GPUs idle because of input pipeline?",
      metric: `${pct(summary.dataloaderStall)} dataloader stalls, ${pct(summary.storageWait)} storage wait, ${pct(summary.cpuPrep)} CPU preprocessing`,
      status: inverseGrade(summary.dataloaderStall + summary.storageWait + summary.cpuPrep, 20, 34)
    },
    {
      question: "Are jobs fragmented across the cluster?",
      metric: `${pct(summary.placementQuality)} placement quality, ${pct(summary.crossRackTraffic)} cross-rack traffic, ${summary.partialNodes} partial nodes`,
      status: grade(summary.placementQuality, 65, 82)
    },
    {
      question: "Are expensive resources stranded?",
      metric: `${summary.idleGpus} idle GPUs, ${summary.partialNodes} partially used nodes, ${pct(summary.memoryFragmentation)} memory fragmentation`,
      status: inverseGrade(summary.idleGpus * 3 + summary.partialNodes * 8 + summary.memoryFragmentation, 32, 52)
    }
  ];

  const table = document.querySelector("#truthTable");
  table.replaceChildren();

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "truth-row";

    const question = document.createElement("strong");
    question.textContent = row.question;

    const metric = document.createElement("span");
    metric.textContent = row.metric;

    const status = document.createElement("small");
    status.className = `status-pill status-${row.status.key}`;
    status.textContent = row.status.label;

    item.append(question, metric, status);
    table.append(item);
  });

  const worst = rows.find((row) => row.status.key === "poor") || rows.find((row) => row.status.key === "watch");
  const badge = document.querySelector("#truthBadge");
  badge.textContent = worst ? worst.status.label : "Healthy";
}

function renderBottleneck(summary, classifier) {
  const machineContext = machineDemoContext(summary);
  if (machineContext) {
    document.querySelector("#primaryBottleneck").textContent = machineContext.driverUnavailable ? "NVIDIA telemetry unavailable" : machineContext.noGpu ? "Host-only telemetry" : machineContext.idle ? "Idle GPU capacity" : "Live host utilization";
    document.querySelector("#secondaryBottleneck").textContent = machineContext.driverUnavailable ? "nvidia-smi cannot reach driver" : machineContext.gpuProcessQuerySkipped ? "Process query skipped for 1s refresh" : machineContext.gpuProcesses.length ? "Active NVIDIA process" : "No NVIDIA compute process";
    document.querySelector("#improvementEstimate").textContent = machineContext.driverUnavailable ? "Repair driver access or use a supported GPU counter source, then collect again." : machineContext.gpuProcessQuerySkipped ? "Use high-rate graphs for resource movement, then run slower process attribution only when needed." : machineContext.idle ? "Start a controlled workload, then compare the next live sample." : "Attach request or training counters before tuning.";
    document.querySelector("#bottleneckBadge").textContent = "Live host";

    const list = document.querySelector("#bottleneckBars");
    list.replaceChildren(
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "GPU utilization",
        value: machineContext.gpuUtilizationPct,
        suffix: "observed",
        note: machineContext.driverUnavailable ? machineContext.gpuError || "nvidia-smi unavailable" : "nvidia-smi utilization.gpu"
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "GPU memory",
        value: machineContext.gpuMemoryUsedPct,
        suffix: "observed",
        note: `${number.format(machineContext.gpuMemoryUsedMiB)} / ${number.format(machineContext.gpuMemoryTotalMiB)} MiB`
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "CPU usage",
        value: machineContext.cpuUsagePct,
        suffix: "observed",
        note: "Sampled from host CPU counters"
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "Memory used",
        value: machineContext.memoryUsedPct,
        suffix: "observed",
        note: "Host memory pressure"
      }),
      progressRow({
        className: "bar-row",
        fillClass: "bar-fill",
        label: "Disk used",
        value: machineContext.diskUsedPct,
        suffix: "observed",
        note: "Root filesystem usage"
      })
    );
    return;
  }

  document.querySelector("#primaryBottleneck").textContent = classifier.primary.name;
  document.querySelector("#secondaryBottleneck").textContent = classifier.secondary.name;
  document.querySelector("#improvementEstimate").textContent = classifier.improvementRange;
  document.querySelector("#bottleneckBadge").textContent = classifier.primary.short;

  const list = document.querySelector("#bottleneckBars");
  list.replaceChildren();

  classifier.bars.forEach((bar) => {
    list.append(progressRow({
      className: "bar-row",
      fillClass: "bar-fill",
      label: bar.name,
      value: bar.score,
      suffix: "loss",
      note: bar.reason
    }));
  });
}

function renderProviderLens(summary, provider, classifier) {
  const badge = document.querySelector("#providerBadge");
  const context = document.querySelector("#providerContext");
  const stats = document.querySelector("#providerStats");
  const actions = document.querySelector("#providerActions");
  const providerData = summary.provider || {};
  const sloData = summary.slo || {};
  const machineContext = machineDemoContext(summary);

  if (machineContext) {
    badge.textContent = "Local host";
    context.replaceChildren(
      providerContextItem("Host", machineContext.host),
      providerContextItem("OS", machineContext.context.os || "unknown"),
      providerContextItem("GPU", machineContext.gpuModel),
      providerContextItem("Services", machineContext.services)
    );
    stats.replaceChildren(
      providerStat({
        label: "GPU temp",
        value: machineContext.gpuTemperatureC ? `${round(machineContext.gpuTemperatureC)} C` : "n/a",
        note: machineContext.gpuPowerWatts ? `${round(machineContext.gpuPowerWatts)} W draw` : "Power not reported",
        grade: machineContext.gpuTemperatureC ? inverseGrade(machineContext.gpuTemperatureC, 75, 86).key : "watch"
      }),
      providerStat({
        label: "CPU usage",
        value: pct(machineContext.cpuUsagePct),
        note: `${machineContext.context.cpuCount || "n/a"} logical CPUs`,
        grade: inverseGrade(machineContext.cpuUsagePct, 70, 90).key
      }),
      providerStat({
        label: "Memory used",
        value: pct(machineContext.memoryUsedPct),
        note: "Host memory pressure",
        grade: inverseGrade(machineContext.memoryUsedPct, 75, 90).key
      }),
      providerStat({
        label: "Disk used",
        value: pct(machineContext.diskUsedPct),
        note: "Root filesystem",
        grade: inverseGrade(machineContext.diskUsedPct, 75, 90).key
      })
    );
    actions.replaceChildren(
      providerAction("No provider billing, SLO, Kubernetes, DCGM, eBPF, or scheduler export is attached to this live machine sample."),
      providerAction(machineContext.driverUnavailable ? "Fix NVIDIA driver telemetry on this host before presenting GPU utilization from it." : machineContext.idle ? "Start a controlled local GPU workload before the demo to show active utilization changing live." : "Join request logs or training counters before making workload-efficiency claims."),
      providerAction("Use provider pilot bundles only when approved source-system exports are available.")
    );
    return;
  }

  badge.textContent = listLabel(providerData.customerTiers, 1);
  context.replaceChildren(
    providerContextItem("Tenant", listLabel(providerData.tenants)),
    providerContextItem("Account", listLabel(providerData.accounts)),
    providerContextItem("Reservation", listLabel(providerData.reservations)),
    providerContextItem("Billing", listLabel(providerData.billingModels))
  );

  stats.replaceChildren(
    providerStat({
      label: "Sellable waste",
      value: currency.format(provider.sellableWasteValue),
      note: `${number.format(summary.wastedGpuHours)} GPU-hours not useful`,
      grade: inverseGrade(provider.sellableWastePct, 22, 42).key
    }),
    providerStat({
      label: "Commit burn",
      value: provider.committedGpuHours > 0 ? pct(provider.reservationBurnPct) : "n/a",
      note: provider.committedGpuHours > 0
        ? `${number.format(summary.allocatedGpuHours)} / ${number.format(provider.committedGpuHours)} committed GPU-hours`
        : "No commitment metadata",
      grade: provider.committedGpuHours > 0 ? grade(Math.min(provider.reservationBurnPct, 100), 35, 65).key : "watch"
    }),
    providerStat({
      label: "Queue SLO",
      value: provider.queueSloPct > 0 ? pct(provider.queueSloPct) : "n/a",
      note: queueSloNote(provider),
      grade: provider.queueSloPct > 0 ? inverseGrade(provider.queueSloPct, 100, 140).key : "watch"
    }),
    providerStat({
      label: "Gross margin",
      value: provider.hasFloorCost ? pct(provider.grossMarginPct) : "n/a",
      note: provider.hasFloorCost ? `${currency.format(provider.grossMargin)} after floor cost` : "Floor cost missing",
      grade: provider.hasFloorCost ? grade(provider.grossMarginPct, 22, 38).key : "watch"
    })
  );

  actions.replaceChildren(
    ...providerActionsFor(summary, provider, classifier, sloData).map(providerAction)
  );
}

function renderProviderSummaryTables() {
  const container = document.querySelector("#providerSummaryTables");
  const badge = document.querySelector("#providerSummaryBadge");
  if (!container || !badge) return;

  const rows = providerPortfolioRows();
  const queueMisses = rows
    .filter((row) => row.queueSloPct > 100)
    .sort((a, b) => b.queueSloPct - a.queueSloPct)
    .slice(0, 4);
  const marginRows = rows
    .filter((row) => row.hasFloorCost)
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct)
    .slice(0, 4);
  const noiseRows = rows
    .filter((row) => row.noiseEvents > 0 || row.contentionPct > 0)
    .sort((a, b) => (b.noiseEvents * 100 + b.contentionPct) - (a.noiseEvents * 100 + a.contentionPct))
    .slice(0, 4);

  badge.textContent = `${rows.length} ${rows.length === 1 ? "group" : "groups"}`;
  container.replaceChildren(
    providerSummaryTable({
      title: "Top sellable waste",
      rows: [...rows].sort((a, b) => b.sellableWasteValue - a.sellableWasteValue).slice(0, 4),
      empty: "No sellable waste",
      value: (row) => currency.format(row.sellableWasteValue),
      note: (row) => `${number.format(row.wastedGpuHours)} wasted GPU-hours`
    }),
    providerSummaryTable({
      title: "Queue SLO misses",
      rows: queueMisses,
      empty: "No queue misses",
      value: (row) => pct(row.queueSloPct),
      note: (row) => `${round(row.queueSloGapMinutes)} minutes over target`
    }),
    providerSummaryTable({
      title: "Margin pressure",
      rows: marginRows,
      empty: "No floor cost metadata",
      value: (row) => pct(row.grossMarginPct),
      note: (row) => `${currency.format(row.grossMargin)} after floor cost`
    }),
    providerSummaryTable({
      title: "Noisy neighbor",
      rows: noiseRows,
      empty: "No contention events",
      value: (row) => `${number.format(row.noiseEvents)}`,
      note: (row) => `${pct(row.contentionPct)} contention`
    })
  );
}

function renderOpportunityCenter(engine) {
  const badge = document.querySelector("#opportunityBadge");
  const stats = document.querySelector("#opportunityStats");
  const list = document.querySelector("#opportunityList");
  if (!badge || !stats || !list) return;

  const opportunities = engine.opportunities || [];
  badge.textContent = `${opportunities.length} ${opportunities.length === 1 ? "open" : "open"}`;
  badge.dataset.severity = engine.highestSeverity;
  stats.replaceChildren(
    opportunityStat("Recoverable value", currency.format(engine.totalImpactDollars), engine.highestSeverity),
    opportunityStat("GPU-hour upside", number.format(engine.totalImpactGpuHours), engine.highestSeverity),
    opportunityStat("Top severity", titleCase(engine.highestSeverity), engine.highestSeverity),
    opportunityStat("Confidence", opportunities[0] ? pct(opportunities[0].confidence) : "n/a", confidenceTone(opportunities[0]?.confidence))
  );

  list.replaceChildren();
  if (opportunities.length === 0) {
    const empty = document.createElement("div");
    empty.className = "opportunity-empty";
    empty.textContent = "No ranked opportunities";
    list.append(empty);
    return;
  }

  opportunities.slice(0, 5).forEach((opportunity) => {
    list.append(opportunityRow(opportunity));
  });
}

function renderComponents(components) {
  const list = document.querySelector("#componentScores");
  list.replaceChildren();

  components.forEach((component) => {
    const row = progressRow({
      className: "component-row",
      fillClass: "component-fill",
      label: component.name,
      value: component.score,
      suffix: "score",
      note: component.note
    });
    row.dataset.grade = grade(component.score, 55, 72).key;
    list.append(row);
  });
}

function renderTopology(summary) {
  const svg = document.querySelector("#topologyMap");
  const ns = "http://www.w3.org/2000/svg";
  const activeNodes = new Map(summary.placement.map((node) => [node.node, node]));
  const positions = new Map();
  const podCenters = new Map();
  const width = 760;
  const podGap = 18;
  const podWidth = (width - podGap * 4) / 3;
  const podHeight = 300;
  const rackGap = 10;
  const rackWidth = (podWidth - 34) / 2;
  const rackHeight = 206;

  svg.replaceChildren();

  const title = svgNode("title", { id: "topologyTitle" });
  title.textContent = "Cluster topology placement map";
  const desc = svgNode("desc", { id: "topologyDesc" });
  desc.textContent = "Racks and pods used by the selected workload with highlighted cross-pod traffic.";
  svg.append(title, desc);

  TOPOLOGY.forEach((pod, podIndex) => {
    const podX = podGap + podIndex * (podWidth + podGap);
    const podY = 18;
    const center = { x: podX + podWidth / 2, y: podY + podHeight / 2 };
    podCenters.set(pod.id, center);

    svg.append(svgNode("rect", {
      x: podX,
      y: podY,
      width: podWidth,
      height: podHeight,
      rx: 8,
      class: "topology-pod"
    }));

    svg.append(textNode(pod.label, podX + 14, podY + 26, "topology-label"));

    pod.racks.forEach((rack, rackIndex) => {
      const rackX = podX + 12 + rackIndex * (rackWidth + rackGap);
      const rackY = podY + 54;
      svg.append(svgNode("rect", {
        x: rackX,
        y: rackY,
        width: rackWidth,
        height: rackHeight,
        rx: 6,
        class: "topology-rack"
      }));
      svg.append(textNode(rack.label, rackX + 10, rackY + 22, "topology-small"));

      rack.nodes.forEach((node, nodeIndex) => {
        const col = nodeIndex % 2;
        const row = Math.floor(nodeIndex / 2);
        const nodeWidth = (rackWidth - 26) / 2;
        const nodeHeight = 42;
        const nodeX = rackX + 8 + col * (nodeWidth + 10);
        const nodeY = rackY + 44 + row * (nodeHeight + 12);
        const active = activeNodes.get(node);
        const nodeClass = active ? (active.partial ? "topology-node partial" : "topology-node active") : "topology-node";

        positions.set(node, {
          x: nodeX + nodeWidth / 2,
          y: nodeY + nodeHeight / 2,
          pod: NODE_INDEX[node].pod
        });

        svg.append(svgNode("rect", {
          x: nodeX,
          y: nodeY,
          width: nodeWidth,
          height: nodeHeight,
          rx: 5,
          class: nodeClass
        }));
        svg.append(textNode(node, nodeX + 7, nodeY + 25, active ? "topology-small active-label" : "topology-small"));
      });
    });
  });

  drawTopologyLinks(svg, positions, podCenters, activeNodes, summary);
  drawLegend(svg, ns);
  renderTraceAttribution(summary.traceAttribution);

  document.querySelector("#topologyScore").textContent = `${pct(summary.placementQuality)} fit`;
}

function renderTraceAttribution(traceAttribution) {
  const list = document.querySelector("#traceAttribution");
  const tiers = traceAttribution?.byTier || [];
  const hottestTier = traceAttribution?.hottestTier;
  list.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "trace-summary";
  summary.append(
    traceStat("NCCL events", number.format(traceAttribution?.eventCount || 0)),
    traceStat("Trace duration", `${number.format(traceAttribution?.totalDurationMs || 0)} ms`),
    traceStat("Hot tier", hottestTier?.label || "Unknown")
  );
  list.append(summary);

  tiers.forEach((tier) => {
    list.append(progressRow({
      className: "trace-row",
      fillClass: "trace-fill",
      label: tier.label,
      value: tier.durationPct,
      suffix: "trace time",
      note: `${number.format(tier.durationMs)} ms, ${compactNumber.format(tier.bytes)} bytes, ${tier.eventCount} events`
    }));
  });
}

function drawTopologyLinks(svg, positions, podCenters, activeNodes, summary) {
  const activePods = unique(Array.from(activeNodes.keys()).map((node) => NODE_INDEX[node]?.pod).filter(Boolean));
  const activeRacks = unique(Array.from(activeNodes.keys()).map((node) => NODE_INDEX[node]?.rack).filter(Boolean));

  if (activePods.length > 1) {
    for (let i = 0; i < activePods.length - 1; i += 1) {
      const from = podCenters.get(activePods[i]);
      const to = podCenters.get(activePods[i + 1]);
      const thickness = 2 + Math.min(5, summary.crossPodTraffic / 16);
      const path = svgNode("path", {
        d: curvePath(from, to, -32 - i * 14),
        class: "topology-link",
        "stroke-width": thickness
      });
      svg.prepend(path);
    }
  } else if (activeRacks.length > 1) {
    const activePositions = Array.from(activeNodes.keys())
      .map((node) => positions.get(node))
      .filter(Boolean);
    const from = activePositions[0];
    const to = activePositions[activePositions.length - 1];
    svg.prepend(svgNode("path", {
      d: curvePath(from, to, -20),
      class: "topology-link local"
    }));
  }
}

function drawLegend(svg) {
  const x = 20;
  const y = 335;
  svg.append(svgNode("rect", {
    x,
    y,
    width: 214,
    height: 38,
    rx: 7,
    class: "topology-legend"
  }));
  svg.append(svgNode("rect", { x: x + 12, y: y + 12, width: 14, height: 14, rx: 3, class: "topology-node active" }));
  svg.append(textNode("allocated", x + 34, y + 24, "topology-small"));
  svg.append(svgNode("rect", { x: x + 98, y: y + 12, width: 14, height: 14, rx: 3, class: "topology-node partial" }));
  svg.append(textNode("partial", x + 120, y + 24, "topology-small"));
}

function renderFingerprint(fingerprint) {
  document.querySelector("#fingerprintName").textContent = fingerprint.name;
  const list = document.querySelector("#fingerprintSignals");
  list.replaceChildren();

  fingerprint.signals.forEach((signal) => {
    list.append(progressRow({
      className: "signal-row",
      fillClass: "signal-fill",
      label: signal.name,
      value: signal.value,
      suffix: signal.label
    }));
  });
}

function renderRegression(summary) {
  const rows = regressionRows(summary);
  const list = document.querySelector("#regressionList");
  list.replaceChildren();

  rows.forEach((row) => {
    const item = progressRow({
      className: "regression-row",
      fillClass: "regression-fill",
      label: row.name,
      value: Math.min(100, Math.abs(row.delta)),
      suffix: row.text,
      note: row.note
    });
    item.dataset.grade = row.grade.key;
    list.append(item);
  });

  const worst = rows.find((row) => row.grade.key === "poor") || rows.find((row) => row.grade.key === "watch");
  const badge = document.querySelector("#regressionBadge");
  badge.textContent = worst ? worst.grade.label : "Stable";
  badge.className = "";
}

function renderReport(summary, classifier) {
  const primary = classifier.primary.name.replace("-bound", "").toLowerCase();
  const secondary = classifier.secondary.name.replace("-bound", "").toLowerCase();
  const provider = providerEconomics(summary);
  const tenant = listLabel(summary.provider?.tenants, 1);
  const reservation = listLabel(summary.provider?.reservations, 1);
  const workMetric = summary.tokensM > 0
    ? `${currency.format(summary.costPerMillionTokens)} per million training tokens`
    : summary.inferenceRequestsM > 0
      ? `${currency.format(summary.costPerMillionRequests)} per million inference requests`
      : `${currency.format(summary.costPerStep)} per training step`;
  const providerLine = hasProviderContext(summary)
    ? `Provider lens: ${tenant} shows ${currency.format(provider.sellableWasteValue)} of sellable waste value on ${reservation}.`
    : "";
  const report = [
    `${summary.label} achieved ${pct(summary.usefulCompute)} accelerator efficiency in ${state.window.toLowerCase()}, consuming ${number.format(summary.allocatedGpuHours)} GPU-hours with ${number.format(summary.usefulGpuHours)} useful GPU-hours.`,
    `Estimated waste is ${number.format(summary.wastedGpuHours)} GPU-hours (${currency.format(summary.wasteDollars)}), mostly from ${primary} with ${secondary} as the secondary bottleneck.`,
    `Current useful-work cost is ${workMetric}.`,
    providerLine,
    recommendationFor(summary, classifier)
  ].filter(Boolean).join(" ");

  document.querySelector("#customerReport").textContent = report;
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

function textNode(value, x, y, className) {
  const text = svgNode("text", { x, y, class: className });
  text.textContent = value;
  return text;
}
