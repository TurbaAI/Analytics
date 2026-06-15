const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const analytics = require("../analytics-core.js");

const { appBundleSource } = require("./_app-bundle.js");
const appSource = appBundleSource();
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
  URLSearchParams,
  window: {
    TurbaAnalytics: analytics,
    TurbaNcclTraceParser: null,
    TurbaNcclTraceFixtures: [],
    location: {
      search: "",
      hostname: "example.test"
    },
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
          ebpfExportId: "secret-ebpf",
          schedulerExportId: "secret-scheduler",
          schedulerName: "secret-scheduler-name",
          queueName: "secret-queue",
          priorityClass: "secret-priority",
          grafanaBaseUrl: "https://secret-grafana.example",
          grafanaInstance: "secret-grafana-instance",
          grafanaDashboardUid: "secret-dashboard-uid",
          grafanaDatasourceUid: "secret-datasource-uid",
          grafanaDashboardUrl: "https://secret-grafana.example/d/secret-dashboard-uid/secret-run?var-run=secret-run"
        },
        grafanaContext: {
          grafanaBaseUrl: "https://secret-grafana.example",
          instanceName: "secret-grafana-instance",
          orgId: "secret-org",
          dashboardUid: "secret-dashboard-uid",
          dashboardTitle: "Secret Dashboard",
          datasourceUid: "secret-datasource-uid",
          datasourceName: "Secret Prometheus",
          timeRange: { from: "now-6h", to: "now" },
          variables: { run: "secret-run", tenant: "secret-tenant" },
          dashboardUrl: "https://secret-grafana.example/d/secret-dashboard-uid/secret-run?var-run=secret-run",
          links: [
            {
              label: "Secret dashboard",
              type: "dashboard",
              url: "https://secret-grafana.example/d/secret-dashboard-uid/secret-run?var-run=secret-run"
            }
          ]
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
    schedulerEvidence: {
      sourceCount: 1,
      eventCount: 4,
      placementRetries: 2,
      localityMisses: 1
    },
    sourceItems: [
      {
        id: "secret-run",
        source: {
          refs: {
            tenant: "secret-tenant",
            account: "secret-account",
            reservation: "secret-reservation"
          },
          adapters: ["provider", "scheduler", "ebpf"],
          context: {
            namespace: "secret-namespace",
            podName: "secret-pod",
            host: "secret-host",
            ebpfExportId: "secret-ebpf",
            schedulerExportId: "secret-scheduler",
            schedulerName: "secret-scheduler-name",
            queueName: "secret-queue",
            priorityClass: "secret-priority",
            grafanaBaseUrl: "https://secret-grafana.example",
            grafanaInstance: "secret-grafana-instance",
            grafanaDashboardUid: "secret-dashboard-uid",
            grafanaDatasourceUid: "secret-datasource-uid",
            grafanaDashboardUrl: "https://secret-grafana.example/d/secret-dashboard-uid/secret-run?var-run=secret-run"
          }
        },
        grafanaContext: {
          grafanaBaseUrl: "https://secret-grafana.example",
          instanceName: "secret-grafana-instance",
          orgId: "secret-org",
          dashboardUid: "secret-dashboard-uid",
          dashboardTitle: "Secret Dashboard",
          datasourceUid: "secret-datasource-uid",
          datasourceName: "Secret Prometheus",
          timeRange: { from: "now-6h", to: "now" },
          variables: { run: "secret-run", tenant: "secret-tenant" },
          dashboardUrl: "https://secret-grafana.example/d/secret-dashboard-uid/secret-run?var-run=secret-run",
          links: [
            {
              label: "Secret dashboard",
              type: "dashboard",
              url: "https://secret-grafana.example/d/secret-dashboard-uid/secret-run?var-run=secret-run"
            }
          ]
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
assert.ok(markdown.includes("4 events"));
assert.ok(markdown.includes("## Grafana Handoff"));
assert.ok(markdown.includes("grafana-title-1"));
assert.ok(markdown.includes("grafana-datasource-name-1"));
assert.ok(markdown.includes("grafana-url-1"));
assert.ok(markdown.includes("## Redacted Source Context"));
assert.ok(markdown.includes("run-1"));
assert.ok(markdown.includes("tenant-1"));
assert.ok(markdown.includes("account-1"));
assert.ok(markdown.includes("reservation-1"));
assert.ok(markdown.includes("host-1"));
assert.ok(markdown.includes("ebpf-export-1"));
assert.ok(markdown.includes("scheduler-export-1"));
assert.ok(markdown.includes("queue-1"));
assert.ok(markdown.includes("grafana-base-1"));
assert.ok(markdown.includes("grafana-dashboard-1"));

[
  "secret-run",
  "secret-run-name",
  "Secret Tenant",
  "secret-tenant",
  "secret-account",
  "secret-reservation",
  "secret-host",
  "secret-pod",
  "secret-ebpf",
  "secret-scheduler",
  "secret-scheduler-name",
  "secret-queue",
  "secret-priority",
  "https://secret-grafana.example",
  "secret-grafana-instance",
  "secret-org",
  "secret-dashboard-uid",
  "Secret Dashboard",
  "secret-datasource-uid",
  "Secret Prometheus"
].forEach((secret) => {
  assert.ok(!markdown.includes(secret), `${secret} should not appear in evidence pack`);
});

console.log("evidence pack export tests passed");
