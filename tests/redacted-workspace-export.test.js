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
        schedulerEvidence: {
          schedulerName: "secret-scheduler",
          queueName: "secret-queue",
          priorityClass: "secret-priority",
          admissionClass: "secret-admission",
          requestedGpuShape: "secret-shape",
          localityPreference: "secret-locality",
          eventCount: 4
        },
        grafanaContext: {
          grafanaBaseUrl: "https://secret-grafana.example",
          instanceName: "secret-grafana-instance",
          orgId: "secret-org",
          dashboardUid: "secret-dashboard-uid",
          dashboardSlug: "secret-dashboard-slug",
          dashboardTitle: "Secret Dashboard",
          folder: "Secret Folder",
          datasourceUid: "secret-datasource-uid",
          datasourceName: "Secret Prometheus",
          timeRange: { from: "now-6h", to: "now" },
          variables: { run: "secret-run", tenant: "secret-tenant" },
          dashboardUrl: "https://secret-grafana.example/d/secret-dashboard-uid/secret-dashboard-slug?var-run=secret-run",
          exploreUrl: "https://secret-grafana.example/explore?left=secret-run",
          links: [
            {
              label: "Secret dashboard link",
              type: "dashboard",
              url: "https://secret-grafana.example/d/secret-dashboard-uid/secret-dashboard-slug?var-run=secret-run"
            }
          ]
        },
        opportunities: [
          {
            id: "secret-opportunity",
            category: "Secret Category",
            title: "secret opportunity title",
            impactDollars: 1200,
            impactGpuHours: 200,
            riskScore: 77,
            confidence: 88,
            evidence: "secret customer evidence",
            recommendation: "secret remediation",
            owner: "secret owner"
          }
        ],
        sourceContext: {
          namespace: "secret-namespace",
          podSelector: "job-name=secret",
          slurmJobId: "secret-slurm",
          ebpfExportId: "secret-ebpf-export",
          host: "secret-host",
          hostname: "secret-hostname",
          node: "secret-node",
          networkLocalAddress: "192.168.10.250",
          ncclRuntimeHostIp: "192.168.10.251",
          machineInventoryKey: "machine-host:secret-hostname",
          podName: "secret-pod",
          containerName: "secret-container",
          cgroupPath: "secret-cgroup",
          providerExportId: "secret-export",
          billingAccountId: "secret-billing",
          reservationWindow: "secret-window",
          schedulerExportId: "secret-scheduler-export",
          schedulerName: "secret-scheduler",
          queueName: "secret-queue",
          priorityClass: "secret-priority",
          admissionClass: "secret-admission",
          requestedGpuShape: "secret-shape",
          localityPreference: "secret-locality",
          grafanaBaseUrl: "https://secret-grafana.example",
          grafanaInstance: "secret-grafana-instance",
          grafanaOrgId: "secret-org",
          grafanaDashboardUid: "secret-dashboard-uid",
          grafanaDashboardSlug: "secret-dashboard-slug",
          grafanaDashboardTitle: "Secret Dashboard",
          grafanaFolder: "Secret Folder",
          grafanaDatasourceUid: "secret-datasource-uid",
          grafanaDatasourceName: "Secret Prometheus",
          grafanaDashboardUrl: "https://secret-grafana.example/d/secret-dashboard-uid/secret-dashboard-slug?var-run=secret-run",
          grafanaExploreUrl: "https://secret-grafana.example/explore?left=secret-run"
        }
      }
    ]
  },
  machineInventory: [
    {
      key: "machine-host:secret-hostname",
      lastSeenAt: "2026-05-31T12:00:00.000Z",
      run: {
        id: "secret-machine-run",
        name: "secret-machine-name",
        refs: {
          model: "secret-model",
          user: "secret-user",
          team: "secret-team",
          cluster: "secret-cluster",
          tenant: "secret-tenant",
          account: "secret-account",
          reservation: "secret-reservation"
        },
        allocation: { allocatedGpuHours: 0, gpus: 1, gpuModel: "H100 SXM" },
        sourceContext: {
          hostname: "secret-hostname",
          networkLocalAddress: "192.168.10.250",
          ncclRuntimeHostIp: "192.168.10.251",
          machineInventoryKey: "machine-host:secret-hostname",
          machineInventoryLastSeenAt: "2026-05-31T12:00:00.000Z"
        }
      }
    }
  ],
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
  "secret-opportunity",
  "secret opportunity title",
  "secret customer evidence",
  "secret remediation",
  "secret owner",
  "secret-namespace",
  "secret-slurm",
  "secret-ebpf-export",
  "secret-host",
  "secret-hostname",
  "192.168.10.250",
  "192.168.10.251",
  "machine-host:secret-hostname",
  "secret-machine-run",
  "secret-machine-name",
  "secret-node",
  "secret-pod",
  "secret-container",
  "secret-cgroup",
  "secret-billing",
  "secret-export",
  "secret-scheduler-export",
  "secret-scheduler",
  "secret-queue",
  "secret-priority",
  "secret-admission",
  "secret-shape",
  "secret-locality",
  "https://secret-grafana.example",
  "secret-grafana-instance",
  "secret-org",
  "secret-dashboard-uid",
  "secret-dashboard-slug",
  "Secret Dashboard",
  "Secret Folder",
  "secret-datasource-uid",
  "Secret Prometheus",
  "Secret dashboard link"
].forEach((secret) => {
  assert.ok(!serialized.includes(secret), `${secret} should be redacted`);
});
assert.ok(!serialized.includes("secret"), "redacted workspace should not retain raw secret markers");

assert.equal(redacted.ingestion.runs[0].id, "run-1");
assert.equal(redacted.ingestion.runs[0].refs.tenant, "tenant-1");
assert.equal(redacted.ingestion.runs[0].commercial.contractId, "contract-1");
assert.equal(redacted.ingestion.runs[0].slo.supportTicketId, "ticket-1");
assert.equal(redacted.ingestion.runs[0].schedulerEvidence.schedulerName, "scheduler-1");
assert.equal(redacted.ingestion.runs[0].schedulerEvidence.queueName, "queue-1");
assert.equal(redacted.ingestion.runs[0].grafanaContext.dashboardUid, "grafana-dashboard-1");
assert.equal(redacted.ingestion.runs[0].grafanaContext.datasourceUid, "grafana-datasource-1");
assert.equal(redacted.ingestion.runs[0].grafanaContext.links[0].url, "grafana-url-1");
assert.equal(redacted.ingestion.runs[0].sourceContext.schedulerExportId, "scheduler-export-1");
assert.equal(redacted.ingestion.runs[0].sourceContext.grafanaBaseUrl, "grafana-base-1");
assert.equal(redacted.ingestion.runs[0].sourceContext.hostname, "host-1");
assert.equal(redacted.ingestion.runs[0].sourceContext.networkLocalAddress, "net-addr-1");
assert.equal(redacted.ingestion.runs[0].sourceContext.machineInventoryKey, "machine-id:machine-1");
assert.equal(redacted.ingestion.runs[0].opportunities[0].category, "Redacted Opportunity");
assert.equal(redacted.ingestion.runs[0].opportunities[0].title, "Redacted imported opportunity");
assert.equal(redacted.ingestion.runs[0].opportunities[0].impactDollars, 1200);
assert.equal(redacted.machineInventory[0].key, "machine-id:machine-1");
assert.equal(redacted.machineInventory[0].run.id, "run-2");
assert.equal(redacted.machineInventory[0].run.sourceContext.hostname, "host-1");
assert.equal(redacted.machineInventory[0].run.sourceContext.networkLocalAddress, "net-addr-1");
assert.equal(redacted.baselines["run-1"].gpuEfficiency, 55);
assert.equal(redacted.snapshots[0].key, "tenant-1");
assert.equal(redacted.snapshots[1].key, "run-1");
assert.equal(redacted.redaction.strategy, "deterministic surrogate IDs");

console.log("redacted workspace export tests passed");
