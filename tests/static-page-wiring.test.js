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
  "analyzeButton",
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
  "opportunityBadge",
  "opportunityStats",
  "opportunityList",
  "exportEvidencePackButton",
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
assert.ok(app.includes("summarizeProviderEconomics"));
assert.ok(app.includes("simulateSchedulerScenarios"));
assert.ok(app.includes("generateOpportunities"));
assert.ok(app.includes("importSchedulerSamples"));
assert.ok(app.includes("exportEvidencePack"));
assert.ok(app.includes("buildEvidencePackMarkdown"));
assert.ok(app.includes("importEbpfSamples"));
assert.ok(app.includes("importProviderSamples"));
assert.ok(app.includes("importOpportunitySamples"));
assert.ok(app.includes("redactWorkspaceStore"));
assert.ok(app.includes("exportWorkspace({ redacted: true })"));
assert.ok(app.includes('"tenant", "account", "reservation"'));

console.log("static page wiring tests passed");
