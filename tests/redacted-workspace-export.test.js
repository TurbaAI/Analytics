const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const analytics = require("../analytics-core.js");

const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const context = {
  console,
  Date,
  Intl,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Set,
  String,
  window: {
    TurbaAnalytics: analytics,
    TurbaNcclTraceParser: null,
    TurbaNcclTraceFixtures: [],
    localStorage: {
      getItem: () => null,
      setItem: () => true
    }
  },
  document: {
    addEventListener: () => {}
  }
};

vm.createContext(context);
vm.runInContext(appSource, context);

const store = {
  storageSchemaVersion: "turba.workspace.v2",
  ingestionSchemaVersion: "turba.ingestion.v1",
  savedAt: "2026-05-31T12:00:00.000Z",
  lastAnalysisAt: "2026-05-31T12:00:00.000Z",
  ingestion: {
    schemaVersion: "turba.ingestion.v1",
    entities: {
      models: { "secret-model": { label: "Secret Model" } },
      users: { "secret-user": { label: "Secret User" } },
      teams: { "secret-team": { label: "Secret Team" } },
      clusters: { "secret-cluster": { label: "Secret Cluster", gpuModel: "H100 SXM" } },
      tenants: { "secret-tenant": { label: "Secret Tenant" } },
      accounts: { "secret-account": { label: "Secret Account" } },
      reservations: { "secret-reservation": { label: "Secret Reservation" } }
    },
    runs: [
      {
        id: "secret-run",
        name: "secret-run-name",
        refs: {
          model: "secret-model",
          user: "secret-user",
          team: "secret-team",
          cluster: "secret-cluster",
          tenant: "secret-tenant",
          account: "secret-account",
          reservation: "secret-reservation"
        },
        allocation: { allocatedGpuHours: 10 },
        commercial: { contractId: "secret-contract", listGpuHourRate: 6.8 },
        slo: { supportTicketId: "secret-ticket" },
        sourceContext: {
          namespace: "secret-namespace",
          podSelector: "job-name=secret",
          slurmJobId: "secret-slurm",
          ebpfExportId: "secret-ebpf-export",
          host: "secret-host",
          node: "secret-node",
          podName: "secret-pod",
          containerName: "secret-container",
          cgroupPath: "secret-cgroup",
          providerExportId: "secret-export",
          billingAccountId: "secret-billing",
          reservationWindow: "secret-window"
        }
      }
    ]
  },
  baselines: {
    "secret-run": { gpuEfficiency: 55 }
  },
  snapshots: [
    {
      capturedAt: "2026-05-31T12:00:00.000Z",
      source: "pilot",
      scope: "tenant",
      key: "Secret Tenant",
      label: "Secret Tenant",
      metrics: { usefulCompute: 42 }
    },
    {
      capturedAt: "2026-05-31T12:00:00.000Z",
      source: "pilot",
      scope: "job",
      key: "secret-run",
      label: "secret-run-name",
      metrics: { usefulCompute: 42 }
    }
  ]
};

const redacted = context.redactWorkspaceStore(store);
const serialized = JSON.stringify(redacted);

[
  "secret-run",
  "secret-run-name",
  "secret-model",
  "Secret Model",
  "secret-user",
  "Secret User",
  "secret-team",
  "Secret Team",
  "secret-cluster",
  "Secret Cluster",
  "secret-tenant",
  "Secret Tenant",
  "secret-account",
  "Secret Account",
  "secret-reservation",
  "Secret Reservation",
  "secret-contract",
  "secret-ticket",
  "secret-namespace",
  "secret-slurm",
  "secret-ebpf-export",
  "secret-host",
  "secret-node",
  "secret-pod",
  "secret-container",
  "secret-cgroup",
  "secret-billing",
  "secret-export"
].forEach((secret) => {
  assert.ok(!serialized.includes(secret), `${secret} should be redacted`);
});
assert.ok(!serialized.includes("secret"), "redacted workspace should not retain raw secret markers");

assert.equal(redacted.ingestion.runs[0].id, "run-1");
assert.equal(redacted.ingestion.runs[0].refs.tenant, "tenant-1");
assert.equal(redacted.ingestion.runs[0].commercial.contractId, "contract-1");
assert.equal(redacted.ingestion.runs[0].slo.supportTicketId, "ticket-1");
assert.equal(redacted.baselines["run-1"].gpuEfficiency, 55);
assert.equal(redacted.snapshots[0].key, "tenant-1");
assert.equal(redacted.snapshots[1].key, "run-1");
assert.equal(redacted.redaction.strategy, "deterministic surrogate IDs");

console.log("redacted workspace export tests passed");
