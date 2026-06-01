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
      tenants: { "secret-tenant": { label: "Secret Tenant" } },
      accounts: { "secret-account": { label: "Secret Account" } },
      reservations: { "secret-reservation": { label: "Secret Reservation" } }
    },
    runs: [
      {
        id: "secret-run",
        name: "secret-run-name",
        refs: {
          tenant: "secret-tenant",
          account: "secret-account",
          reservation: "secret-reservation"
        },
        allocation: { allocatedGpuHours: 10 },
        sourceContext: {
          namespace: "secret-namespace",
          podName: "secret-pod",
          host: "secret-host",
          ebpfExportId: "secret-ebpf"
        }
      }
    ]
  },
  baselines: {},
  snapshots: []
};

const plan = context.buildRedactionPlan(store);
const markdown = context.buildEvidencePackMarkdown({
  summary: {
    scope: "job",
    key: "secret-run",
    label: "secret-run-name",
    allocatedGpuHours: 100,
    usefulCompute: 42,
    wastedGpuHours: 58,
    wasteDollars: 360,
    sourceItems: [
      {
        id: "secret-run",
        source: {
          refs: {
            tenant: "secret-tenant",
            account: "secret-account",
            reservation: "secret-reservation"
          },
          adapters: ["provider", "ebpf"],
          context: {
            namespace: "secret-namespace",
            podName: "secret-pod",
            host: "secret-host",
            ebpfExportId: "secret-ebpf"
          }
        }
      }
    ]
  },
  classifier: {
    primary: { name: "Communication-bound" },
    secondary: { name: "Placement-bound" }
  },
  provider: {
    sellableWasteValue: 1200,
    queueSloPct: 125,
    queueSloGapMinutes: 5
  },
  opportunityEngine: {
    totalImpactDollars: 1800,
    totalImpactGpuHours: 260,
    opportunities: [
      {
        category: "Fabric + Topology",
        title: "Repack topology-sensitive workload",
        severity: "high",
        impactDollars: 1800,
        impactGpuHours: 260,
        confidence: 86,
        evidence: "Cross-pod pressure aligns with communication loss.",
        recommendation: "Keep the next run inside one pod.",
        owner: "Scheduler team"
      }
    ]
  },
  schedulerSimulator: {
    recommended: {
      label: "Reserve locality group",
      dollarUpside: 950,
      recoveredGpuHours: 140
    },
    scenarios: [
      {
        label: "Reserve locality group",
        dollarUpside: 950,
        recoveredGpuHours: 140,
        deltas: { queueWaitMinutes: 8, usefulCompute: 6 },
        projected: { usefulCompute: 48 },
        action: "Keep the next run inside one pod."
      }
    ]
  },
  plan,
  exportedAt: new Date("2026-05-31T12:00:00.000Z")
});

assert.ok(markdown.includes("# turbalance Evidence Pack"));
assert.ok(markdown.includes("Repack topology-sensitive workload"));
assert.ok(markdown.includes("## Scheduler / Capacity What-If"));
assert.ok(markdown.includes("Reserve locality group"));
assert.ok(markdown.includes("## Redacted Source Context"));
assert.ok(markdown.includes("run-1"));
assert.ok(markdown.includes("tenant-1"));
assert.ok(markdown.includes("account-1"));
assert.ok(markdown.includes("reservation-1"));
assert.ok(markdown.includes("host-1"));
assert.ok(markdown.includes("ebpf-export-1"));

[
  "secret-run",
  "secret-run-name",
  "Secret Tenant",
  "secret-tenant",
  "secret-account",
  "secret-reservation",
  "secret-host",
  "secret-pod",
  "secret-ebpf"
].forEach((secret) => {
  assert.ok(!markdown.includes(secret), `${secret} should not appear in evidence pack`);
});

console.log("evidence pack export tests passed");
