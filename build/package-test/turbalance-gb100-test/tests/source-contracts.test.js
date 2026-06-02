const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-contracts-"));
const runId = "provider-run-contracts";
const sourcePayload = {
  "/kubernetes": {
    items: [{
      runId,
      namespace: "frontier",
      labels: {
        "turba.ai/run-id": runId,
        "turba.ai/tenant": "apex-ai",
        "turba.ai/account": "frontier",
        "turba.ai/reservation": "rsv-h100"
      }
    }]
  },
  "/scheduler": [{ runId, schedulerName: "slurm", queueName: "h100", account: "frontier", reservation: "rsv-h100", elapsedGpuHours: 100 }],
  "/grafana": [{ runId, dashboardUid: "provider-overview", dashboardUrl: "https://grafana.example/d/provider-overview" }],
  "/billing-slo": {
    billingRecords: [{ runId, tenant: "apex-ai", account: "frontier", reservation: "rsv-h100", billableGpuHours: 100 }],
    supportTickets: [{ runId, priority: "urgent", supportTicketId: "case-1", targetStartMinutes: 15 }]
  },
  "/ebpf": [{ runId, collector: "bpftrace-summary", cpu: { offCpuTimePct: 6 } }],
  "/nccl": [{ runId, rankCount: 8, events: [{ op: "all_reduce", durationMs: 10 }] }],
  "/opportunities": [{ runId, category: "scheduler", impactDollars: 1000, recommendation: "Improve queue SLO" }]
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/prometheus/api/v1/query") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      status: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [Date.now() / 1000, "1"] }]
      }
    }));
    return;
  }
  const payload = sourcePayload[url.pathname];
  if (!payload) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{\"error\":\"not found\"}");
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const configPath = path.join(tempDir, "contracts.json");
  fs.writeFileSync(configPath, `${JSON.stringify({
    runId,
    contracts: [
      { system: "prometheus", url: `http://127.0.0.1:${port}/prometheus`, queriesFile: "fixtures/prometheus-collector-queries.json" },
      { system: "kubernetes", url: `http://127.0.0.1:${port}/kubernetes` },
      { system: "scheduler-admission", url: `http://127.0.0.1:${port}/scheduler` },
      { system: "grafana", url: `http://127.0.0.1:${port}/grafana` },
      { system: "billing-slo", url: `http://127.0.0.1:${port}/billing-slo` },
      { system: "ebpf", url: `http://127.0.0.1:${port}/ebpf` },
      { system: "nccl", url: `http://127.0.0.1:${port}/nccl` },
      { system: "opportunities", url: `http://127.0.0.1:${port}/opportunities` }
    ]
  }, null, 2)}\n`);

  const result = await runNode([
    "scripts/validate-source-contracts.js",
    "--config",
    configPath,
    "--out-dir",
    path.join(tempDir, "staging")
  ]);
  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.contracts.length, 8);
  assert.equal(report.sourceCounts.prometheus, 1);
  assert.equal(report.sourceCounts.provider, 1);
  assert.ok(report.runIds.includes(runId));
  assert.ok(fs.existsSync(path.join(tempDir, "staging", "prometheus.json")));
  assert.ok(fs.existsSync(path.join(tempDir, "staging", "billing-records.json")));

  console.log("source contract tests passed");
})().catch((error) => {
  server.close(() => {
    console.error(error);
    process.exit(1);
  });
});

function runNode(args) {
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
