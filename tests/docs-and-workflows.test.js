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
  "docs/provider-export-template.md",
  "docs/neo-cloud-pilot-validation.md",
  "docs/telemetry-integration.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-script.md",
  "docs/demo-release-checklist.md",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-source-bundle.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "scripts/build-provider-overlay.js",
  "fixtures/provider-overlay-template.json",
  "fixtures/provider-export-inputs/kubernetes-jobs.json",
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
  "docs/provider-export-template.md",
  "docs/neo-cloud-pilot-validation.md",
  "docs/telemetry-integration.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-script.md",
  "docs/demo-release-checklist.md",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-source-bundle.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "scripts/build-provider-overlay.js",
  "node tests/run-all.js",
  "tests/neo-cloud-provider-fixture.test.js",
  "tests/provider-exporter.test.js",
  "tests/source-bundle-validation.test.js",
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
assert.ok(pages.includes("cp -R build fixtures docs schemas scripts site/"));

const dataContract = read("docs/data-contract.md");
assert.ok(dataContract.includes("turba.ingestion.v1"));
assert.ok(dataContract.includes("turba-source-bundle.v1.schema.json"));
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
assert.ok(telemetry.includes("scripts/build-provider-overlay.js"));

const providerFit = read("docs/neo-cloud-provider-fit.md");
assert.ok(providerFit.includes("Neo-Cloud Provider Fit"));
assert.ok(providerFit.includes("Sellable waste value"));
assert.ok(providerFit.includes("fixtures/neo-cloud-provider-bundle.json"));
assert.ok(providerFit.includes("fixtures/provider-overlay-template.json"));
assert.ok(providerFit.includes("CoreWeave"));
assert.ok(providerFit.includes("Lambda"));

const providerTemplate = read("docs/provider-export-template.md");
assert.ok(providerTemplate.includes("fixtures/provider-overlay-template.json"));
assert.ok(providerTemplate.includes("scripts/build-provider-overlay.js"));
assert.ok(providerTemplate.includes("turba-source-bundle.v1.schema.json"));
assert.ok(providerTemplate.includes("Kubernetes Join Keys"));
assert.ok(providerTemplate.includes("Slurm Join Keys"));
assert.ok(providerTemplate.includes("redacted workspace export"));

const pilotValidation = read("docs/neo-cloud-pilot-validation.md");
assert.ok(pilotValidation.includes("Tenant"));
assert.ok(pilotValidation.includes("Reservation"));
assert.ok(pilotValidation.includes("redacted workspace"));
assert.ok(pilotValidation.includes("GitHub Pages"));

const demoScript = read("docs/demo-script.md");
assert.ok(demoScript.includes("fixtures/external-source-bundle.json"));
assert.ok(demoScript.includes("provider portfolio risk tables"));
assert.ok(demoScript.includes("redacted workspace"));
assert.ok(demoScript.includes("Do Not Claim"));

const demoRelease = read("docs/demo-release-checklist.md");
assert.ok(demoRelease.includes("GitHub Pages"));
assert.ok(demoRelease.includes("provider portfolio risk tables"));
assert.ok(demoRelease.includes("turba-source-bundle.v1.schema.json"));
assert.ok(demoRelease.includes("build/turba-analytics-desktop.png"));

console.log("docs and workflows tests passed");
