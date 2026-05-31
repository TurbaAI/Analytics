const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const ingestionSchema = readJson("schemas/turba-ingestion.v1.schema.json");
const workspaceSchema = readJson("schemas/turba-workspace.v2.schema.json");
const workspaceFixture = readJson("fixtures/workspace-export.json");
const sourceFixture = readJson("fixtures/external-source-bundle.json");
const providerFixture = readJson("fixtures/neo-cloud-provider-bundle.json");

assert.equal(ingestionSchema.properties.schemaVersion.const, "turba.ingestion.v1");
assert.equal(workspaceSchema.properties.storageSchemaVersion.const, "turba.workspace.v2");
assert.equal(workspaceSchema.properties.ingestionSchemaVersion.const, "turba.ingestion.v1");
assert.ok(workspaceSchema.properties.ingestion.$ref.includes("turba-ingestion.v1.schema.json"));

["schemaVersion", "runs"].forEach((key) => {
  assert.ok(ingestionSchema.required.includes(key));
});

["storageSchemaVersion", "ingestionSchemaVersion", "ingestion", "baselines", "snapshots"].forEach((key) => {
  assert.ok(workspaceSchema.required.includes(key));
});

assert.equal(workspaceFixture.storageSchemaVersion, workspaceSchema.properties.storageSchemaVersion.const);
assert.equal(workspaceFixture.ingestion.schemaVersion, ingestionSchema.properties.schemaVersion.const);
assert.ok(Array.isArray(sourceFixture.sources.prometheus));
assert.ok(Array.isArray(sourceFixture.sources.provider));
assert.ok(Array.isArray(sourceFixture.ncclTraces));
assert.ok(ingestionSchema.properties.entities.properties.tenants);
assert.ok(ingestionSchema.properties.runs.items.properties.commercial);
assert.ok(ingestionSchema.properties.runs.items.properties.slo);
assert.equal(providerFixture.ingestion.schemaVersion, ingestionSchema.properties.schemaVersion.const);
assert.ok(Array.isArray(providerFixture.sources.provider));

console.log("schema tests passed");
