const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-source-systems-"));
const runId = "provider-run-collector";
const responses = {
  "/kubernetes": {
    items: [{
      metadata: {
        name: "trainer",
        namespace: "frontier",
        labels: {
          "turba.ai/run-id": runId,
          "turba.ai/tenant": "apex-ai",
          "turba.ai/account": "frontier",
          "turba.ai/reservation": "rsv-h100"
        }
      },
      spec: {
        selector: { matchLabels: { job: "trainer" } }
      },
      status: { phase: "Running" },
      metrics: { allocatedGpus: 128 }
    }]
  },
  "/scheduler": [{
    runId,
    schedulerName: "slurm",
    queueName: "h100",
    account: "frontier",
    reservation: "rsv-h100",
    qos: "urgent",
    queueWaitMinutes: 19,
    elapsedGpuHours: 422,
    targetStartMinutes: 15
  }],
  "/grafana": [{
    runId,
    dashboardUid: "turbalance-provider-overview",
    dashboardTitle: "Provider Overview",
    datasourceUid: "prometheus-prod",
    dashboardUrl: "https://grafana.example/d/turbalance-provider-overview",
    variables: { run: runId, tenant: "apex-ai" }
  }],
  "/billing-slo": {
    billingRecords: [{
      runId,
      tenant: "apex-ai",
      account: "frontier",
      reservation: "rsv-h100",
      billingModel: "reserved",
      listGpuHourRate: 3.2,
      floorGpuHourCost: 1.7,
      billableGpuHours: 422
    }],
    supportTickets: [{
      runId,
      tenant: "apex-ai",
      priority: "urgent",
      supportTicketId: "case-123",
      targetStartMinutes: 15,
      targetEfficiency: 72
    }]
  },
  "/ebpf": [{
    runId,
    collector: "bpftrace-summary",
    host: "node-1",
    cpu: { offCpuTimePct: 6 },
    network: { tcpRetransmitPct: 1.8 }
  }],
  "/nccl": [{
    runId,
    rankCount: 128,
    events: [{ op: "all_reduce", durationMs: 92 }]
  }],
  "/opportunities": [{
    runId,
    category: "scheduler",
    impactDollars: 12000,
    recommendation: "Backfill smaller jobs into idle fragments"
  }]
};

(async () => {
  const authHeaders = [];
  const server = http.createServer((req, res) => {
    authHeaders.push(req.headers.authorization);
    const payload = responses[new URL(req.url, "http://127.0.0.1").pathname];
    if (!payload) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{\"error\":\"not found\"}");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const systems = [
    ["kubernetes", "/kubernetes"],
    ["scheduler-admission", "/scheduler"],
    ["grafana", "/grafana"],
    ["billing-slo", "/billing-slo"],
    ["ebpf", "/ebpf"],
    ["nccl", "/nccl"],
    ["opportunities", "/opportunities"]
  ];

  for (const [system, route] of systems) {
    const result = await runCollector([
      "scripts/fetch-source-system-export.js",
      "--system",
      system,
      "--url",
      `http://127.0.0.1:${port}${route}`,
      "--bearer-token",
      "source-token",
      "--out-dir",
      tempDir
    ]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.system, system);
  }
  await new Promise((resolve) => server.close(resolve));

  assert.ok(authHeaders.every((header) => header === "Bearer source-token"));
  [
    "kubernetes.json",
    "kubernetes-jobs.json",
    "scheduler.json",
    "slurm-jobs.json",
    "grafana.json",
    "billing-records.json",
    "support-tickets.json",
    "ebpf.json",
    "nccl-traces.json",
    "opportunities.json"
  ].forEach((fileName) => {
    assert.ok(fs.existsSync(path.join(tempDir, fileName)), `${fileName} should exist`);
  });

  const bundleResult = await runCollector(["scripts/build-provider-pilot-bundle.js", tempDir]);
  assert.equal(bundleResult.status, 0, bundleResult.stderr);
  const bundle = JSON.parse(bundleResult.stdout);
  const validation = validateSourceBundle(bundle, { requireSourceExport: true });
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(bundle.sources.kubernetes[0].runId, runId);
  assert.equal(bundle.sources.provider[0].commercial.billableGpuHours, 422);
  assert.equal(bundle.sources.grafana[0].dashboardUid, "turbalance-provider-overview");
  assert.equal(bundle.ncclTraces[0].rankCount, 128);

  console.log("source system collector tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function runCollector(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
