const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

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

assert.equal(ids.length, idSet.size, "HTML ids should be unique");
assert.ok(html.includes("assets/turbalance-mark.png"));
assert.ok(html.includes("assets/turbalance-analytics-logo.png"));
assert.ok(html.includes("<title>turbalance Analytics</title>"));
assert.deepEqual(scripts, [
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
  "liveTelemetryAlerts",
  "trendChart",
  "topologyMap"
].forEach((id) => {
  assert.ok(idSet.has(id), `${id} should exist in index.html`);
});

assert.equal((html.match(/data-scope="/g) || []).length, 8);
assert.equal((html.match(/data-trend-metric="/g) || []).length, 9);
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
assert.ok(app.includes("LIVE_TELEMETRY_LIMIT = 300"));
assert.ok(app.includes("renderLiveResources"));
assert.ok(app.includes("renderLiveResourceHeartbeatBadge"));
assert.ok(app.includes("GB10_OPERATOR_SOURCE_ORDER"));
assert.ok(app.includes("gb10MonitoringAvailable"));
assert.ok(app.includes("GB10 monitor"));
assert.ok(app.includes("UMA memory"));
assert.ok(app.includes("Nsight/CUPTI"));
assert.ok(app.includes("renderOperatorCockpit"));
assert.ok(app.includes("buildOperatorCockpitContext"));
assert.ok(app.includes("renderOperatorLaunchpad"));
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
assert.ok(app.includes("renderLiveTelemetryGraphs"));
assert.ok(app.includes("buildTelemetrySparkline"));
assert.ok(app.includes("gpuProcessQuerySkipped"));
assert.ok(app.includes("gpuSampleCached"));
assert.ok(app.includes("analyzeLiveTelemetryRelationships"));
assert.ok(app.includes("renderLiveTelemetryAlerts"));
assert.ok(app.includes("telemetryCorrelation"));
assert.ok(app.includes("telemetryTrend"));
assert.ok(app.includes("machineDemoContext"));
assert.ok(app.includes("isKnownMachineDemoHost"));
assert.ok(app.includes("192.168.10.20"));
assert.ok(app.includes("spark1"));
assert.ok(app.includes("100.96.89.98"));
assert.ok(app.includes("dgx-pat"));
assert.ok(app.includes("machineDemoHeadline"));
assert.ok(app.includes("machineDemoGpuModel"));
assert.ok(app.includes("machineDemoServicePhrase"));
assert.ok(app.includes("machineDemoServices"));
assert.ok(app.includes("isMachineDemoItem"));
assert.ok(app.includes("No scheduler export"));
assert.ok(app.includes("No provider billing"));
assert.ok(app.includes("build/demo/live-machine-bundle.json"));
assert.ok(html.includes("liveResourcePanel"));
assert.ok(html.includes("live-resource-heart"));
assert.ok(html.includes("operatorCockpitPanel"));
assert.ok(html.includes("sourceHeartbeatStrip"));
assert.ok(html.includes("eventTimeline"));
assert.ok(html.includes("demoLaunchpad"));
assert.ok(app.includes("operatorLaunchpadSignature"));
assert.ok(app.includes("document.execCommand(\"copy\")"));
assert.ok(html.includes("kafkaStreamPanel"));
assert.ok(html.includes("fleetTiles"));
assert.ok(html.includes("liveResourceGrid"));
assert.ok(html.includes("liveTelemetryAlerts"));
assert.ok(html.includes("liveTelemetryGraphs"));
assert.ok(app.includes("redactWorkspaceStore"));
assert.ok(app.includes("exportWorkspace({ redacted: true })"));
assert.ok(app.includes('"tenant", "account", "reservation"'));

console.log("static page wiring tests passed");
