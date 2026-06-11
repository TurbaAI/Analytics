const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const valuesByQuery = new Map([
  ["avg(DCGM_FI_DEV_GPU_UTIL) / 100", 0.71],
  ["avg(DCGM_FI_PROF_PIPE_TENSOR_ACTIVE) / 100", 0.49],
  ["avg((DCGM_FI_DEV_POWER_USAGE) or (GPU_POWER_USAGE) or (GPU_PACKAGE_POWER) or (GPU_AVERAGE_PACKAGE_POWER))", 218],
  ["avg((DCGM_FI_DEV_GPU_UTIL / 100) or (DCGM_FI_PROF_SM_ACTIVE) or (GPU_GFX_ACTIVITY / 100) or (GPU_GFX_BUSY_INSTANTANEOUS / 100))", 0.66],
  ["avg((DCGM_FI_DEV_FB_USED / clamp_min(DCGM_FI_DEV_FB_TOTAL, 1)) or (GPU_USED_VRAM / clamp_min(GPU_TOTAL_VRAM, 1)))", 0.73],
  ["avg((DCGM_FI_PROF_DRAM_ACTIVE) or (GPU_UMC_ACTIVITY / 100))", 0.58],
  ["avg(DCGM_FI_DEV_GPU_TEMP or GPU_EDGE_TEMPERATURE or GPU_JUNCTION_TEMPERATURE)", 61],
  ["avg(DCGM_FI_DEV_FAN_SPEED or GPU_FAN_SPEED)", 44],
  ["avg((DCGM_FI_PROF_PCIE_TX_BYTES) or (DCGM_FI_PROF_PCIE_RX_BYTES) or (DCGM_FI_PROF_NVLINK_TX_BYTES) or (DCGM_FI_PROF_NVLINK_RX_BYTES) or (PCIE_BANDWIDTH * 125000) or (PCIE_BIDIRECTIONAL_BANDWIDTH * 1000000000))", 1250000000],
  ["sum((DCGM_FI_DEV_ECC_SBE_AGG_TOTAL) or (DCGM_FI_DEV_ECC_DBE_AGG_TOTAL) or (GPU_ECC_CORRECT_TOTAL) or (GPU_ECC_UNCORRECT_TOTAL))", 2],
  ["avg(DCGM_FI_DEV_SM_CLOCK or GPU_CLOCK)", 1410],
  ["avg(DCGM_FI_DEV_MEM_CLOCK or GPU_MEMORY_CLOCK)", 5001],
  ["avg(turbalance_network_wait_ratio)", 0.12],
  ["avg(turbalance_network_utilization_ratio)", 0.64],
  ["avg(turbalance_queue_wait_minutes)", 23],
  ["avg(DCGM_FI_PROF_SM_OCCUPANCY)", 59],
  ["avg(DCGM_FI_PROF_PIPE_TENSOR_ACTIVE)", 52],
  ["avg(DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_TOTAL) * 100", 74],
  ["avg(DCGM_FI_PROF_DRAM_ACTIVE)", 67],
  ["avg(DCGM_FI_DEV_POWER_USAGE)", 218],
  ["avg(DCGM_FI_DEV_GPU_TEMP)", 61],
  ["avg(DCGM_FI_DEV_FAN_SPEED)", 44],
  ["avg(DCGM_FI_DEV_SM_CLOCK)", 1410],
  ["avg(DCGM_FI_DEV_MEM_CLOCK)", 5001],
  ["avg(DCGM_FI_PROF_PCIE_TX_BYTES)", 820000000],
  ["avg(DCGM_FI_PROF_PCIE_RX_BYTES)", 430000000],
  ["avg(DCGM_FI_PROF_NVLINK_TX_BYTES)", 0],
  ["avg(DCGM_FI_PROF_NVLINK_RX_BYTES)", 0]
]);

(async () => {
  const receivedAuthHeaders = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const query = url.searchParams.get("query");
    receivedAuthHeaders.push(req.headers.authorization);
    const value = valuesByQuery.get(query);

    if (value === undefined) {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: `unexpected query ${query}` }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      status: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [Date.now() / 1000, String(value)] }]
      }
    }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-prom-export-"));
  const outputPath = path.join(tempDir, "bundle.json");
  const outputDir = path.join(tempDir, "provider-inputs");

  const result = await runExporter([
    "scripts/fetch-prometheus-source-export.js",
    "--url",
    `http://127.0.0.1:${port}`,
    "--run-id",
    "provider-run-live",
    "--queries-file",
    "fixtures/prometheus-collector-queries.json",
    "--bearer-token",
    "prom-token",
    "--out",
    outputPath,
    "--out-dir",
    outputDir
  ]);
  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.sourceCounts.prometheus, 1);
  assert.equal(report.sourceCounts.dcgm, 1);
  assert.ok(receivedAuthHeaders.every((header) => header === "Bearer prom-token"));

  const bundle = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const validation = validateSourceBundle(bundle, { requireSourceExport: true });
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(bundle.sources.prometheus[0].runId, "provider-run-live");
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_utilization_ratio, 0.71);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_network_utilization_ratio, 0.64);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_power_watts, 218);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_memory_utilization_ratio, 0.58);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_fan_speed_pct, 44);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_clock_mhz, 1410);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_memory_clock_mhz, 5001);
  assert.equal(bundle.sources.prometheus[0].metrics.turba_gpu_interconnect_bytes_per_second, 1250000000);
  assert.equal(bundle.sources.dcgm[0].fields.DCGM_FI_PROF_SM_OCCUPANCY, 59);
  assert.equal(bundle.sources.dcgm[0].fields.DCGM_FI_DEV_POWER_USAGE, 218);
  assert.equal(bundle.sources.dcgm[0].fields.DCGM_FI_DEV_FAN_SPEED, 44);
  assert.equal(bundle.sources.dcgm[0].fields.DCGM_FI_DEV_SM_CLOCK, 1410);
  assert.equal(bundle.sources.dcgm[0].fields.DCGM_FI_DEV_MEM_CLOCK, 5001);

  const stagedPrometheus = JSON.parse(fs.readFileSync(path.join(outputDir, "prometheus.json"), "utf8"));
  const stagedDcgm = JSON.parse(fs.readFileSync(path.join(outputDir, "dcgm.json"), "utf8"));
  assert.equal(stagedPrometheus[0].metrics.turba_queue_wait_minutes, 23);
  assert.equal(stagedDcgm[0].fields.DCGM_FI_PROF_DRAM_ACTIVE, 67);
  assert.equal(stagedDcgm[0].fields.DCGM_FI_PROF_PCIE_TX_BYTES, 820000000);

  console.log("prometheus source exporter tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function runExporter(args) {
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
