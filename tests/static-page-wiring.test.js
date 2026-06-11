const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const idSet = new Set(ids);
const classSet = new Set(
  [...html.matchAll(/\bclass="([^"]+)"/g)]
    .flatMap((match) => match[1].split(/\s+/).filter(Boolean))
);
const selectorMatches = [
  ...app.matchAll(/document\.querySelector(?:All)?\("([^"]+)"\)/g)
].map((match) => match[1]);
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
const normalizedScripts = scripts.map((script) => script.split("?")[0]);

assert.equal(ids.length, idSet.size, "HTML ids should be unique");
assert.ok(html.includes("assets/turbalance-mark.png"));
assert.ok(html.includes("assets/turbalance-wordmark-special-t.png"));
assert.ok(html.includes("<title>turbalance Analytics</title>"));
assert.deepEqual(normalizedScripts, [
  "analytics-core.js",
  "nccl-trace-parser.js",
  "nccl-trace-fixtures.js",
  "app.js"
]);

selectorMatches.forEach((selector) => {
  const idMatch = selector.match(/^#([A-Za-z0-9_-]+)/);
  const classMatch = selector.match(/^\.([A-Za-z0-9_-]+)/);

  if (idMatch) {
    assert.ok(idSet.has(idMatch[1]), `${selector} should target an existing id`);
  } else if (classMatch) {
    assert.ok(classSet.has(classMatch[1]), `${selector} should target an existing class`);
  }
});

[
  "windowSelect",
  "rateInput",
  "samePodToggle",
  "themeToggle",
  "themeToggleText",
  "ingestFile",
  "apiInput",
  "fetchApiButton",
  "exportWorkspaceButton",
  "exportRedactedWorkspaceButton",
  "resetWorkspaceButton",
  "copyReport",
  "providerBadge",
  "providerContext",
  "providerStats",
  "providerActions",
  "providerSummaryBadge",
  "providerSummaryTables",
  "simulatorBadge",
  "simulatorControls",
  "simulatorStats",
  "simulatorNarrative",
  "simulatorScenarios",
  "grafanaBadge",
  "grafanaContext",
  "grafanaLinks",
  "captureSnapshotButton",
  "opportunityBadge",
  "opportunityStats",
  "opportunityList",
  "taskMemoryPanel",
  "taskMemoryBadge",
  "taskMemoryIdentity",
  "taskMemoryResources",
  "taskMemoryChanges",
  "exportEvidencePackButton",
  "dashboardSettingsPanel",
  "dashboardSettingsControls",
  "dashboardSettingsBadge",
  "liveTelemetryAlerts",
  "liveObservationLog",
  "sparkPairComparePanel",
  "sparkPairCompareBadge",
  "fleetComparisonPanel",
  "fleetComparisonBadge",
  "productReadinessPanel",
  "productReadinessBadge",
  "systemCharacterizationPanel",
  "systemCharacterizationBadge",
  "trendChart",
  "topologyMap"
].forEach((id) => {
  assert.ok(idSet.has(id), `${id} should exist in index.html`);
});

assert.equal((html.match(/data-scope="/g) || []).length, 8);
assert.equal((html.match(/data-trend-metric="/g) || []).length, 10);
assert.equal((html.match(/data-scheduler-scenario="/g) || []).length, 4);
assert.ok(html.includes('accept="application/json,.json"'));
assert.ok(app.includes("turba.analytics.workspace.v2"));
assert.ok(app.includes("turba.workspace.v2"));
assert.ok(app.includes("renderProviderLens"));
assert.ok(app.includes("renderProviderSummaryTables"));
assert.ok(app.includes("renderOpportunityCenter"));
assert.ok(app.includes("renderSchedulerSimulator"));
assert.ok(app.includes("renderGrafanaHandoff"));
assert.ok(app.includes("summarizeProviderEconomics"));
assert.ok(app.includes("simulateSchedulerScenarios"));
assert.ok(app.includes("generateOpportunities"));
assert.ok(app.includes("renderTaskMemory"));
assert.ok(app.includes("taskUtilizationSnapshot"));
assert.ok(app.includes("compareTaskUtilizationPattern"));
assert.ok(app.includes("taskHistory"));
assert.ok(app.includes("importSchedulerSamples"));
assert.ok(app.includes("importGrafanaSamples"));
assert.ok(app.includes("exportEvidencePack"));
assert.ok(app.includes("buildEvidencePackMarkdown"));
assert.ok(app.includes("importEbpfSamples"));
assert.ok(app.includes("importProviderSamples"));
assert.ok(app.includes("importOpportunitySamples"));
assert.ok(app.includes("maybeAutoLoadMachineDemoBundle"));
assert.ok(app.includes("MACHINE_DEMO_REFRESH_MS"));
assert.ok(app.includes("MACHINE_DEMO_REFRESH_MS = 1000"));
assert.ok(app.includes("SPARK_PAIR_CLOCK_REFRESH_MS"));
assert.ok(app.includes("SPARK_PAIR_CLOCK_REFRESH_MS = 1000"));
assert.ok(app.includes("LIVE_TELEMETRY_LIMIT = 300"));
assert.ok(app.includes("renderLiveResources"));
assert.ok(app.includes("renderLiveResourceHeartbeatBadge"));
assert.ok(app.includes("GPU Utilization"));
assert.ok(app.includes("Power Draw"));
assert.ok(app.includes("Fan Speed"));
assert.ok(app.includes("GPU Clock Speed"));
assert.ok(app.includes("Memory Clock Speed"));
assert.ok(app.includes("Memory allocation"));
assert.ok(app.includes("Memory Utilization"));
assert.ok(app.includes("gpuMemoryUtilizationPct"));
assert.ok(app.includes("gpuFanSpeedPct"));
assert.ok(app.includes("gpuMemoryClockMHz"));
assert.ok(app.includes("GB10_OPERATOR_SOURCE_ORDER"));
assert.ok(app.includes("gb10MonitoringAvailable"));
assert.ok(app.includes("GB10 monitor"));
assert.ok(app.includes("UMA memory"));
assert.ok(app.includes("Nsight/CUPTI"));
assert.ok(app.includes("renderOperatorCockpit"));
assert.ok(app.includes("buildOperatorCockpitContext"));
assert.ok(app.includes("renderOperatorLaunchpad"));
assert.ok(app.includes("buildAutoDiscoveryDeploymentState"));
assert.ok(app.includes("operatorAutoDiscoveryDeploymentNodes"));
assert.ok(app.includes("Auto Discovery and Deployment"));
assert.ok(app.includes("scripts/auto-discover-deploy.py"));
assert.ok(app.includes("buildBackgroundTasksState"));
assert.ok(app.includes("operatorBackgroundTasksNodes"));
assert.ok(app.includes("Background tasks"));
assert.ok(app.includes("buildGpuExporterCoverageState"));
assert.ok(app.includes("operatorGpuExporterCoverageNodes"));
assert.ok(app.includes("GPU_EXPORTER_METRIC_GROUPS"));
assert.ok(app.includes("GPU_POWER_USAGE"));
assert.ok(app.includes("PCIE_BIDIRECTIONAL_BANDWIDTH"));
assert.ok(app.includes("AMD DME"));
assert.ok(app.includes("gpu-exporter-normalizer"));
assert.ok(app.includes("DASHBOARD_BLOCKS"));
assert.ok(app.includes("renderDashboardSettingsPanel"));
assert.ok(app.includes("dashboardBlockToggle"));
assert.ok(app.includes("applyDashboardBlockVisibility"));
assert.ok(app.includes("operatorLaunchpadCommandSignature"));
assert.ok(app.includes("showManualCopyPrompt"));
assert.ok(app.includes("formatHostSampleAgeMilliseconds"));
assert.ok(app.includes("since host sample"));
assert.ok(app.includes("ollamaTokensPerSecond"));
assert.ok(app.includes("tok/s"));
assert.ok(app.includes("TTFT"));
assert.ok(app.includes("sourceHeartbeatStrip"));
assert.ok(app.includes("eventTimeline"));
assert.ok(app.includes("kafkaStreamPanel"));
assert.ok(app.includes("operatorReplay"));
assert.ok(app.includes("liveResourceCard"));
assert.ok(app.includes("Telemetry ingest"));
assert.ok(app.includes("collectorIncomingReportsPerMinute"));
assert.ok(app.includes("Hardware health"));
assert.ok(app.includes("hardwareRepairAction"));
assert.ok(app.includes("buildProductReadinessState"));
assert.ok(app.includes("operatorProductReadinessNodes"));
assert.ok(app.includes("renderLiveTelemetryGraphs"));
assert.ok(app.includes("renderAnalysisResourceFallback"));
assert.ok(app.includes("analyzeAnalysisResourceRelationships"));
assert.ok(app.includes("renderAnalysisResourceGraphs"));
assert.ok(app.includes("buildTelemetrySparkline"));
assert.ok(app.includes("networkUtilization"));
assert.ok(app.includes("Network/GPU"));
assert.ok(app.includes("Network/CPU"));
assert.ok(app.includes("liveNetworkDisplay"));
assert.ok(app.includes("networkLocalAddress"));
assert.ok(app.includes("networkPeerAddress"));
assert.ok(app.includes("networkLinkRole"));
assert.ok(app.includes("ncclRuntimePresent"));
assert.ok(app.includes("ncclRuntimeDetail"));
assert.ok(app.includes("nccl-runtime"));
assert.ok(app.includes("jobSelectionIdentity"));
assert.ok(app.includes("resolveJobSelectionKey"));
assert.ok(app.includes("operatorFleetSourceItems"));
assert.ok(app.includes("buildSparkPairComparison"));
assert.ok(app.includes("renderSparkPairComparisonPanel"));
assert.ok(app.includes("sparkPairHostRole"));
assert.ok(app.includes("sparkPairClockSyncMetric"));
assert.ok(app.includes("sparkPairClockOffsetMetric"));
assert.ok(app.includes("SPARK_PAIR_CLOCK_HISTORY_LIMIT"));
assert.ok(app.includes("recordSparkPairClockSample"));
assert.ok(app.includes("loadSparkPairClockFeed"));
assert.ok(app.includes("sparkPairClockFeedUrl"));
assert.ok(app.includes("build/demo/spark-clock-offset.json"));
assert.ok(app.includes("sparkPairClockGraphPanel"));
assert.ok(app.includes("buildSparkPairClockGraph"));
assert.ok(app.includes("clockPtpActive"));
assert.ok(app.includes("PTP/chrony/timesync discipline"));
assert.ok(app.includes("NCCL runtime"));
assert.ok(app.includes("Ollama tok/s"));
assert.ok(app.includes("buildFleetComparison"));
assert.ok(app.includes("renderFleetComparisonPanel"));
assert.ok(app.includes("fleetMetricSpread"));
assert.ok(app.includes("assignFleetSignatureDistances"));
assert.ok(app.includes("FLEET_COMPARISON_HOST_LIMIT"));
assert.ok(app.includes("SYSTEM_CHARACTERIZATION_HOST_LIMIT"));
{
  const liveGridStart = app.indexOf("grid.replaceChildren(");
  const liveNetworkIndex = app.indexOf('label: "Network utilization"', liveGridStart);
  const liveGpuIndex = app.indexOf('label: "GPU"', liveGridStart);
  assert.ok(liveNetworkIndex > liveGridStart);
  assert.ok(liveNetworkIndex < liveGpuIndex);
  assert.ok(app.indexOf('telemetryRelationship("Network/GPU"') < app.indexOf('telemetryRelationship("CPU/GPU"'));
  assert.ok(app.indexOf('telemetryRelationship("Network/CPU"') < app.indexOf('telemetryRelationship("CPU/GPU"'));
}
assert.ok(app.includes("gpuProcessQuerySkipped"));
assert.ok(app.includes("gpuSampleCached"));
assert.ok(app.includes("analyzeLiveTelemetryRelationships"));
assert.ok(app.includes("renderLiveTelemetryAlerts"));
assert.ok(app.includes("telemetryCorrelation"));
assert.ok(app.includes("LIVE_COVARIANCE_METRICS"));
assert.ok(app.includes("buildLiveCovarianceMatrix"));
assert.ok(app.includes("liveCovarianceMatrixPanel"));
assert.ok(app.includes("Principal Resource Mode"));
assert.ok(app.includes("buildPrincipalResourceMode"));
assert.ok(app.includes("calculatePrincipalResourceMode"));
assert.ok(app.includes("telemetryPrincipalModeTrend"));
assert.ok(app.includes("platformApiBaseUrl"));
assert.ok(app.includes("PLATFORM_API_TOKEN_STORAGE_KEY"));
assert.ok(app.includes("platformApiAuthToken"));
assert.ok(app.includes("writePlatformApiAuthToken"));
assert.ok(app.includes("platformApiFetch"));
assert.ok(app.includes("dashboardApiTokenControl"));
assert.ok(app.includes("isLakehouseDashboardHost"));
assert.ok(app.includes("192.168.10.30"));
assert.ok(app.includes("refreshPlatformVirtualSensors"));
assert.ok(app.includes("platformCovarianceMatrix"));
assert.ok(app.includes("platformPrincipalMode"));
assert.ok(app.includes("/v1/virtual-sensors/system-identification"));
assert.ok(app.includes("platformSystemIdentification"));
assert.ok(app.includes("SYSTEM_ID_SUBSYSTEMS"));
assert.ok(app.includes("systemIdentificationSubsystemSummaries"));
assert.ok(app.includes("Subsystem profile response"));
assert.ok(app.includes("renderSystemCharacterizationPanel"));
assert.ok(app.includes("systemCharacterizationProfileChart"));
assert.ok(app.includes("symmetricEigenDecomposition"));
assert.ok(app.includes("signedLoading"));
assert.ok(app.includes("buildEigenSparkline"));
assert.ok(app.includes("buildTrendSparkline"));
assert.ok(app.includes("buildCovarianceSparkline"));
assert.ok(app.includes("telemetryCovarianceStats"));
assert.ok(app.includes("telemetryCovarianceTrend"));
assert.ok(app.includes("telemetryTrend"));
assert.ok(app.includes("machineDemoContext"));
assert.ok(app.includes("isKnownMachineDemoHost"));
assert.ok(app.includes("192.168.10.20"));
assert.ok(app.includes("192.168.10.21"));
assert.ok(app.includes("spark1"));
assert.ok(app.includes("PI_FLEET_HOSTNAMES"));
assert.ok(app.includes("buildPiBenchmarkHistograms"));
assert.ok(app.includes("fleetBenchmarkHistogramSection"));
assert.ok(app.includes("fleetBenchmarkHistogramNode"));
assert.ok(app.includes("isPiFleetRow"));
assert.ok(app.includes("buildBenchmarkComparisonLadder"));
assert.ok(app.includes("renderBenchmarkLadderPanel"));
assert.ok(app.includes("benchmarkGlobalReferenceLinks"));
assert.ok(app.includes("benchmarkGpuScore"));
assert.ok(app.includes("benchmarkNetworkMbps"));
assert.ok(app.includes("benchmarkCpuOpsPerSecond"));
assert.ok(app.includes("benchmarkDiskReadMiBps"));
assert.ok(app.includes("DGX interconnect"));
assert.ok(app.includes("100.96.89.98"));
assert.ok(app.includes("dgx-pat"));
assert.ok(app.includes("machineDemoHeadline"));
assert.ok(app.includes("machineDemoGpuModel"));
assert.ok(app.includes("machineDemoServicePhrase"));
assert.ok(app.includes("machineDemoServices"));
assert.ok(app.includes("isMachineDemoItem"));
assert.ok(app.includes("machineInventoryArchive"));
assert.ok(app.includes("reconcileMachineInventory"));
assert.ok(app.includes("machineInventoryMissing"));
assert.ok(app.includes("removeMachineInventoryEntry"));
assert.ok(app.includes("formatMachineUptime"));
assert.ok(app.includes("formatMachineLastSeen"));
assert.ok(app.includes("entity-remove-button"));
assert.ok(app.includes("dataset.machineMissing"));
assert.ok(app.includes("No scheduler export"));
assert.ok(app.includes("No provider billing"));
assert.ok(app.includes("build/demo/live-machine-bundle.json"));
assert.ok(html.includes("liveResourcePanel"));
assert.ok(html.includes("live-resource-heart"));
assert.ok(html.includes("operatorCockpitPanel"));
assert.ok(html.includes("sourceHeartbeatStrip"));
assert.ok(html.includes("eventTimeline"));
assert.ok(html.includes("demoLaunchpad"));
assert.ok(html.includes("autoDiscoveryDeploymentPanel"));
assert.ok(html.includes("executionIdleEnergyPanel"));
assert.ok(html.includes("executionIdleEnergyBadge"));
assert.ok(html.includes("gpuExporterCoveragePanel"));
assert.ok(html.includes("gpuExporterCoverageBadge"));
assert.ok(html.includes("backgroundTasksPanel"));
assert.ok(html.includes("backgroundTasksBadge"));
assert.ok(app.includes("operatorLaunchpadSignature"));
assert.ok(app.includes("document.execCommand(\"copy\")"));
assert.ok(html.includes("kafkaStreamPanel"));
assert.ok(html.includes("fleetTiles"));
assert.ok(html.includes("sparkPairComparePanel"));
assert.ok(html.includes("fleetComparisonPanel"));
assert.ok(html.includes("benchmarkLadderPanel"));
assert.ok(html.includes("systemCharacterizationPanel"));
assert.ok(html.includes("liveResourceGrid"));
assert.ok(html.includes("liveTelemetryAlerts"));
assert.ok(html.includes("liveObservationLog"));
assert.ok(html.includes("liveTelemetryGraphs"));
assert.ok(html.includes("app.js?v=machine-inventory-20260611"));
assert.ok(html.includes("styles.css?v=machine-inventory-20260611"));
assert.ok(html.includes("turba.analytics.theme"));
assert.ok(html.includes('id="themeToggle"'));
assert.ok(html.includes('data-dashboard-block="sparkPair"'));
assert.ok(html.includes('data-dashboard-block="fleetComparison"'));
assert.ok(html.includes('data-dashboard-block="benchmarkLadder"'));
assert.ok(html.includes('data-dashboard-block="productReadiness"'));
assert.ok(html.includes('data-dashboard-block="autoDiscoveryDeployment"'));
assert.ok(html.includes('data-dashboard-block="executionIdleEnergy"'));
assert.ok(html.includes('data-dashboard-block="gpuExporterCoverage"'));
assert.ok(html.includes('data-dashboard-block="backgroundTasks"'));
assert.ok(app.includes("buildExecutionIdleEnergyState"));
assert.ok(app.includes("EXECUTION_IDLE_LOW_ACTIVITY_PCT"));
assert.ok(app.includes("Execution-idle watchdog"));
assert.ok(app.includes("renderLiveObservationLog"));
assert.ok(app.includes("liveObservationActions"));
assert.ok(app.includes("liveSignificantSampleObservations"));
assert.ok(app.includes("liveSampleObservationEvents"));
assert.ok(app.includes("No meaningful observation events"));
assert.ok(app.includes("hostWorkObserved"));
assert.ok(app.includes("formatLiveObservationLog"));
assert.ok(app.includes("Observation log copied"));
assert.ok(app.includes("Waiting for live counters"));
assert.ok(css.includes("live-observation-action"));
assert.ok(css.includes("live-covariance-grid"));
assert.ok(css.includes("dashboard-settings-panel"));
assert.ok(css.includes("dashboard-settings-grid"));
assert.ok(css.includes("dashboard-block-toggle"));
assert.ok(css.includes("theme-switch"));
assert.ok(css.includes('html[data-theme="dark"]'));
assert.ok(css.includes("product-readiness-panel"));
assert.ok(css.includes("product-readiness-summary"));
assert.ok(css.includes("auto-discovery-panel"));
assert.ok(css.includes("auto-discovery-commands"));
assert.ok(css.includes("execution-idle-panel"));
assert.ok(css.includes("execution-idle-grid"));
assert.ok(css.includes("gpu-exporter-panel"));
assert.ok(css.includes("gpu-exporter-grid"));
assert.ok(css.includes("gpu-exporter-row"));
assert.ok(css.includes('data-machine-missing="true"'));
assert.ok(css.includes("entity-remove-button"));
assert.ok(app.includes("initThemeMode"));
assert.ok(app.includes("applyThemeMode"));
assert.ok(app.includes("THEME_STORAGE_KEY"));
assert.ok(css.includes("spark-pair-compare-panel"));
assert.ok(css.includes("spark-pair-grid"));
assert.ok(css.includes("spark-pair-clock-panel"));
assert.ok(css.includes("spark-pair-clock-line-leftOffsetNs"));
assert.ok(css.includes("spark-pair-clock-legend"));
assert.ok(css.includes("fleet-comparison-panel"));
assert.ok(css.includes("fleet-comparison-rank-grid"));
assert.ok(css.includes("fleet-benchmark-section"));
assert.ok(css.includes("fleet-benchmark-section-head"));
assert.ok(css.includes("fleet-benchmark-histograms"));
assert.ok(css.includes("fleet-benchmark-bar-row"));
assert.ok(css.includes("fleet-benchmark-empty"));
assert.ok(css.includes("benchmark-ladder-panel"));
assert.ok(css.includes("benchmark-metric-grid"));
assert.ok(css.includes("benchmark-ladder-row"));
assert.ok(css.includes("benchmark-source-strip"));
assert.ok(css.includes("system-characterization-panel"));
assert.ok(css.includes("system-characterization-bar"));
assert.ok(css.includes('.fleet-tile[aria-selected="true"]'));
assert.ok(css.includes("live-covariance-trend-line"));
assert.ok(css.includes("live-eigen-panel"));
assert.ok(css.includes("live-eigen-trend-line"));
assert.ok(app.indexOf("if (covariancePanel) wrapper.append(covariancePanel);") < app.indexOf("wrapper.append(relationshipGrid, alertList);"));
assert.ok(app.includes("liveSampleObservation"));
assert.ok(app.includes("redactWorkspaceStore"));
assert.ok(app.includes("exportWorkspace({ redacted: true })"));
assert.ok(app.includes('"tenant", "account", "reservation"'));

console.log("static page wiring tests passed");
