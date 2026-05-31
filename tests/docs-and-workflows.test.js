const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const readme = read("README.md");

[
  "docs/data-contract.md",
  "docs/operator-walkthrough.md",
  "docs/neo-cloud-provider-fit.md",
  "docs/telemetry-integration.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-script.md",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  "build/turba-analytics-desktop.png",
  "build/turba-analytics-mobile.png"
].forEach((relativePath) => {
  assert.ok(exists(relativePath), `${relativePath} should exist`);
});

[
  "docs/data-contract.md",
  "docs/operator-walkthrough.md",
  "docs/neo-cloud-provider-fit.md",
  "docs/telemetry-integration.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-script.md",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "node tests/run-all.js",
  "tests/neo-cloud-provider-fixture.test.js",
  "build/turba-analytics-desktop.png"
].forEach((text) => {
  assert.ok(readme.includes(text), `README should reference ${text}`);
});

const ci = read(".github/workflows/ci.yml");
const pages = read(".github/workflows/pages.yml");

assert.ok(ci.includes("node tests/run-all.js"));
assert.ok(pages.includes("node tests/run-all.js"));
assert.ok(pages.includes("actions/deploy-pages@v4"));
assert.ok(pages.includes("cp index.html styles.css app.js analytics-core.js nccl-trace-parser.js nccl-trace-fixtures.js site/"));
assert.ok(pages.includes("cp -R build fixtures docs schemas site/"));

const dataContract = read("docs/data-contract.md");
assert.ok(dataContract.includes("turba.ingestion.v1"));
assert.ok(dataContract.includes("turba.workspace.v2"));
assert.ok(dataContract.includes("sources.provider"));
assert.ok(dataContract.includes("Neo-Cloud Provider Overlay"));
assert.ok(dataContract.includes("Validation Behavior"));

const telemetry = read("docs/telemetry-integration.md");
assert.ok(telemetry.includes("Prometheus"));
assert.ok(telemetry.includes("DCGM"));
assert.ok(telemetry.includes("Kubernetes"));
assert.ok(telemetry.includes("NCCL"));
assert.ok(telemetry.includes("Provider Commercial Overlay"));
assert.ok(telemetry.includes("sources.provider"));

const providerFit = read("docs/neo-cloud-provider-fit.md");
assert.ok(providerFit.includes("Neo-Cloud Provider Fit"));
assert.ok(providerFit.includes("Sellable waste value"));
assert.ok(providerFit.includes("fixtures/neo-cloud-provider-bundle.json"));
assert.ok(providerFit.includes("CoreWeave"));
assert.ok(providerFit.includes("Lambda"));

const demoScript = read("docs/demo-script.md");
assert.ok(demoScript.includes("fixtures/external-source-bundle.json"));
assert.ok(demoScript.includes("Do Not Claim"));

console.log("docs and workflows tests passed");
