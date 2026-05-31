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
  "docs/telemetry-integration.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
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
  "docs/telemetry-integration.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "node tests/run-all.js",
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
assert.ok(dataContract.includes("Validation Behavior"));

const telemetry = read("docs/telemetry-integration.md");
assert.ok(telemetry.includes("Prometheus"));
assert.ok(telemetry.includes("DCGM"));
assert.ok(telemetry.includes("Kubernetes"));
assert.ok(telemetry.includes("NCCL"));

console.log("docs and workflows tests passed");
