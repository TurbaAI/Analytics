const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const ingestionSchema = readJson("schemas/turba-ingestion.v1.schema.json");
const sourceBundleSchema = readJson("schemas/turba-source-bundle.v1.schema.json");
const workspaceSchema = readJson("schemas/turba-workspace.v2.schema.json");
const workspaceFixture = readJson("fixtures/workspace-export.json");
const sourceFixture = readJson("fixtures/external-source-bundle.json");
const providerFixture = readJson("fixtures/neo-cloud-provider-bundle.json");
const providerTemplate = readJson("fixtures/provider-overlay-template.json");
const providerExportBilling = readJson("fixtures/provider-export-inputs/billing-records.json");
const ebpfExportInput = readJson("fixtures/ebpf-export-inputs/host-samples.json");
const schedulerExportInput = readJson("fixtures/scheduler-export-inputs/scheduler-events.json");
const grafanaDashboard = readJson("grafana/turbalance-provider-overview.json");

assert.equal(ingestionSchema.properties.schemaVersion.const, "turba.ingestion.v1");
assert.equal(sourceBundleSchema.$id, "https://turba.analytics/schemas/turba-source-bundle.v1.schema.json");
assert.equal(workspaceSchema.properties.storageSchemaVersion.const, "turba.workspace.v2");
assert.equal(workspaceSchema.properties.ingestionSchemaVersion.const, "turba.ingestion.v1");
assert.ok(workspaceSchema.properties.ingestion.$ref.includes("turba-ingestion.v1.schema.json"));
assert.ok(sourceBundleSchema.properties.ingestion.$ref.includes("turba-ingestion.v1.schema.json"));

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
assert.ok(Array.isArray(sourceFixture.sources.scheduler));
assert.ok(Array.isArray(sourceFixture.sources.grafana));
assert.ok(Array.isArray(sourceFixture.sources.ebpf));
assert.ok(Array.isArray(sourceFixture.sources.opportunities));
assert.ok(Array.isArray(sourceFixture.ncclTraces));
assert.ok(sourceBundleSchema.properties.sources.$ref.includes("sourceExports"));
assert.ok(sourceBundleSchema.properties.sourceExports.$ref.includes("sourceExports"));
assert.ok(sourceBundleSchema.$defs.sourceExports.properties.ebpf.items.$ref.includes("ebpfSample"));
assert.ok(sourceBundleSchema.$defs.sourceExports.properties.scheduler.items.$ref.includes("schedulerSample"));
assert.ok(sourceBundleSchema.$defs.sourceExports.properties.grafana.items.$ref.includes("grafanaSample"));
assert.ok(sourceBundleSchema.$defs.sourceExports.properties.provider.items.$ref.includes("providerSample"));
assert.ok(sourceBundleSchema.$defs.sourceExports.properties.opportunities.items.$ref.includes("opportunitySample"));
assert.ok(sourceBundleSchema.$defs.sourceExports.properties.ncclTraces.items.$ref.includes("traceSample"));
assert.ok(sourceBundleSchema.$defs.ebpfSample.required.includes("runId"));
assert.ok(sourceBundleSchema.$defs.ebpfSample.properties.network);
assert.ok(sourceBundleSchema.$defs.ebpfSample.properties.storage);
assert.ok(sourceBundleSchema.$defs.schedulerSample.required.includes("runId"));
assert.ok(sourceBundleSchema.$defs.schedulerSample.properties.events);
assert.ok(sourceBundleSchema.$defs.schedulerSample.properties.queueName);
assert.ok(sourceBundleSchema.$defs.grafanaSample.required.includes("runId"));
assert.ok(sourceBundleSchema.$defs.grafanaSample.properties.dashboardUrl);
assert.ok(sourceBundleSchema.$defs.grafanaSample.properties.exploreUrl);
assert.ok(sourceBundleSchema.$defs.providerSample.required.includes("runId"));
assert.ok(sourceBundleSchema.$defs.opportunitySample.required.includes("runId"));
assert.ok(sourceBundleSchema.$defs.traceSample.required.includes("runId"));
assert.ok(sourceBundleSchema.$defs.providerSample.properties.commercial.$ref.includes("commercial"));
assert.ok(sourceBundleSchema.$defs.providerSample.properties.slo.$ref.includes("slo"));
assert.ok(ingestionSchema.properties.entities.properties.tenants);
assert.ok(ingestionSchema.properties.runs.items.properties.sourceContext);
assert.ok(ingestionSchema.properties.runs.items.properties.schedulerEvidence);
assert.ok(ingestionSchema.properties.runs.items.properties.grafanaContext);
assert.ok(ingestionSchema.properties.runs.items.properties.opportunities.items.$ref.includes("opportunity"));
assert.ok(ingestionSchema.properties.runs.items.properties.commercial);
assert.ok(ingestionSchema.properties.runs.items.properties.slo);
assert.ok(workspaceSchema.properties.snapshots.items.properties.scope.enum.includes("tenant"));
assert.ok(workspaceSchema.properties.snapshots.items.properties.scope.enum.includes("account"));
assert.ok(workspaceSchema.properties.snapshots.items.properties.scope.enum.includes("reservation"));
assert.equal(providerFixture.ingestion.schemaVersion, ingestionSchema.properties.schemaVersion.const);
assert.ok(Array.isArray(providerFixture.sources.provider));
assert.ok(Array.isArray(providerFixture.sources.scheduler));
assert.ok(Array.isArray(providerFixture.sources.grafana));
assert.ok(Array.isArray(providerFixture.sources.ebpf));
assert.ok(Array.isArray(providerFixture.sources.opportunities));
assert.ok(Array.isArray(providerTemplate.sources.provider));
assert.ok(Array.isArray(providerTemplate.sources.scheduler));
assert.ok(Array.isArray(providerTemplate.sources.grafana));
assert.ok(Array.isArray(providerTemplate.sources.opportunities));
assert.equal(providerTemplate.sources.provider[0].runId, "replace-with-run-id");
assert.equal(providerTemplate.sources.grafana[0].dashboardUid, "turbalance-provider-overview");
assert.equal(providerExportBilling[0].providerExportId, "billing-2026-05-week-4");
assert.equal(providerExportBilling[0].contractId, "ctr-apex-2026-q2");
assert.equal(ebpfExportInput[0].ebpfExportId, "ebpf-2026-05-week-4");
assert.equal(schedulerExportInput[0].schedulerExportId, "sched-2026-05-week-4");
assert.equal(grafanaDashboard.uid, "turbalance-provider-overview");
assert.equal(grafanaDashboard.title, "turbalance Provider Overview");
assert.ok(grafanaDashboard.templating.list.some((variable) => variable.name === "run"));

console.log("schema tests passed");
