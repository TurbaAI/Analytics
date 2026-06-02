#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const requiredFields = [
  "DCGM_FI_DEV_NAME",
  "DCGM_FI_DEV_UUID",
  "DCGM_FI_DEV_GPU_UTIL",
  "DCGM_FI_PROF_SM_ACTIVE",
  "DCGM_FI_PROF_SM_OCCUPANCY",
  "DCGM_FI_PROF_PIPE_TENSOR_ACTIVE",
  "DCGM_FI_PROF_DRAM_ACTIVE",
  "DCGM_FI_DEV_POWER_USAGE",
  "DCGM_FI_DEV_GPU_TEMP",
  "DCGM_FI_DEV_MEMORY_TEMP",
  "DCGM_FI_DEV_FB_USED",
  "DCGM_FI_DEV_ECC_DBE_AGG_TOTAL",
  "DCGM_FI_DEV_XID_ERRORS",
  "DCGM_FI_PROF_PCIE_TX_BYTES",
  "DCGM_FI_PROF_NVLINK_TX_BYTES",
  "DCGM_FI_DEV_FABRIC_HEALTH_MASK",
  "DCGM_FI_DEV_C2C_LINK_STATUS",
  "DCGM_FI_PROF_C2C_TX_ALL_BYTES"
];

const normalizedMetrics = [
  "gpu_power_watts",
  "gpu_power_instant_watts",
  "gpu_temperature_celsius",
  "gpu_memory_temperature_celsius",
  "gpu_memory_used_bytes",
  "gpu_memory_used_ratio",
  "gpu_sm_active_ratio",
  "gpu_sm_occupancy_ratio",
  "gpu_tensor_pipe_active_ratio",
  "gpu_dram_active_ratio",
  "gpu_pcie_tx_bytes_per_second",
  "gpu_pcie_rx_bytes_per_second",
  "gpu_nvlink_tx_bytes_per_second",
  "gpu_nvlink_rx_bytes_per_second",
  "gpu_c2c_tx_bytes_per_second",
  "gpu_c2c_rx_bytes_per_second",
  "gpu_xid_error_code",
  "gpu_ecc_sbe_total",
  "gpu_ecc_dbe_total",
  "gpu_retired_pages_total"
];

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function assertFile(filePath) {
  assert.ok(fs.existsSync(path.join(root, filePath)), `${filePath} should exist`);
}

function run(command, args, options = {}) {
  const { echo = true, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...spawnOptions
  });
  if (echo && result.stdout) process.stdout.write(result.stdout);
  if (echo && result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
  return result.stdout;
}

function validateFiles() {
  [
    "deploy/docker/docker-compose.yml",
    "deploy/kubernetes/gb100-dcgm-exporter-daemonset.yaml",
    "prometheus/prometheus.yml",
    "prometheus/gb100-recording-rules.yml",
    "alerts/gb100-alerts.yml",
    "collectors/app_telemetry_exporter.py",
    "collectors/nvml_confidential_collector.py",
    "collectors/facility_adapter.py",
    "docs/metric-capability-matrix.md",
    "docs/architecture.md",
    "docs/unsupported-metrics.md",
    "docs/runbook.md",
    "docs/install.md",
    "install.sh",
    "scripts/package-gb100-telemetry.js",
    "bin/gb100-telemetry-report"
  ].forEach(assertFile);
}

function validateDcgmAllowlist() {
  const csv = read("metrics/gb100-dcgm-fields.csv");
  const fields = csv.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",")[0].trim());
  for (const field of requiredFields) {
    assert.ok(fields.includes(field), `allowlist missing ${field}`);
  }
  assert.equal(fields.length, new Set(fields).size, "DCGM allowlist should not contain duplicate fields");
}

function validateCapabilities() {
  const capabilities = JSON.parse(read("metrics/gb100-metric-capabilities.json"));
  const nonNative = capabilities.nonNative || {};
  for (const [metric, expected] of Object.entries({
    fp4_tensor_core_utilization: "profiler_required",
    fp8_tensor_core_utilization: "profiler_required",
    nvfp4_tensor_core_utilization: "profiler_required",
    transformer_engine_activity: "app_instrumentation_required",
    decompression_engine_utilization: "app_instrumentation_required",
    coolant_temperature: "external_system_required",
    ras_engine_internals: "unsupported_currently"
  })) {
    assert.equal(nonNative[metric]?.status, expected, `${metric} should be ${expected}`);
    assert.ok(nonNative[metric]?.reason, `${metric} should include a reason`);
  }
  assert.ok((capabilities.blockedLabels || []).includes("request_id"), "request_id should be blocked by default");
}

function validatePrometheus() {
  const prometheus = read("prometheus/prometheus.yml");
  assert.match(prometheus, /dcgm-exporter:9400/, "Prometheus should scrape DCGM Exporter");
  assert.match(prometheus, /gb100-app-collector:9500/, "Prometheus should scrape app collector");
  const rules = read("prometheus/gb100-recording-rules.yml");
  for (const metric of normalizedMetrics) {
    assert.match(rules, new RegExp(`record: ${metric}\\b`), `recording rules missing ${metric}`);
  }
  assert.doesNotMatch(rules, /unsupported.*vector\(0\)|requires_.*vector\(0\)/i, "unsupported metrics must not be silently zeroed");
}

function validateAlerts() {
  const alerts = read("alerts/gb100-alerts.yml");
  [
    "GB100XidErrorObserved",
    "GB100DoubleBitEccErrorObserved",
    "GB100RetiredPagesIncreasing",
    "GB100RowRemapFailure",
    "GB100TemperatureNearSlowdown",
    "GB100MemoryTemperatureNearMax",
    "GB100PowerViolationIncreasing",
    "GB100ThermalViolationIncreasing",
    "GB100ReliabilityViolationIncreasing",
    "GB100NvlinkErrorsIncreasing",
    "GB100NvlinkLinkDown",
    "GB100C2cLinkDown",
    "GB100FabricManagerUnhealthy",
    "GB100FabricHealthMaskNonZero",
    "GB100PcieReplayCounterHigh",
    "GB100MemoryAboveThreshold",
    "GB100LowSmOccupancyHighMemory",
    "GB100TensorPipeLowForLlmWorkload"
  ].forEach((alertName) => {
    assert.match(alerts, new RegExp(`alert: ${alertName}\\b`), `missing alert ${alertName}`);
  });
  const alertBlocks = alerts.split(/\n\s*- alert:/).slice(1);
  for (const block of alertBlocks) {
    assert.match(block, /severity:/, "alert should include severity");
    assert.match(block, /summary:/, "alert should include summary");
    assert.match(block, /description:/, "alert should include description");
    assert.match(block, /suggested_remediation:/, "alert should include suggested remediation");
    assert.match(block, /dashboard:/, "alert should include dashboard link placeholder");
  }

  const promtool = spawnSync("promtool", ["check", "rules", "alerts/gb100-alerts.yml"], {
    cwd: root,
    encoding: "utf8"
  });
  if (promtool.status === 0) {
    process.stdout.write(promtool.stdout);
  } else if (promtool.error && promtool.error.code === "ENOENT") {
    console.log("promtool not found; static alert validation completed");
  } else {
    process.stdout.write(promtool.stdout || "");
    process.stderr.write(promtool.stderr || "");
    throw new Error("promtool validation failed");
  }
}

function validateGrafana() {
  const expected = [
    "gb100-overview.json",
    "gb100-compute.json",
    "gb100-memory.json",
    "gb100-interconnect.json",
    "gb100-health-ras.json",
    "gb100-power-thermal.json",
    "gb100-tenant-workloads.json"
  ];
  for (const fileName of expected) {
    const dashboard = JSON.parse(read(path.join("grafana", fileName)));
    assert.ok(dashboard.title, `${fileName} should have a title`);
    const variableNames = (dashboard.templating?.list || []).map((item) => item.name);
    for (const variable of ["cluster", "node", "gpu_uuid", "namespace", "pod", "container"]) {
      assert.ok(variableNames.includes(variable), `${fileName} missing ${variable} variable`);
    }
  }
  const overview = read("grafana/gb100-overview.json");
  [
    "GPU Inventory",
    "GPU Utilization",
    "Power Draw",
    "Core Temperature",
    "Memory Temperature",
    "HBM Usage",
    "SM Active",
    "SM Occupancy",
    "Tensor Pipe Active",
    "DRAM Active",
    "PCIe Throughput",
    "NVLink Throughput",
    "C2C Throughput",
    "ECC Errors",
    "XID Errors",
    "Fabric Health"
  ].forEach((title) => assert.match(overview, new RegExp(title), `overview missing ${title}`));
}

function validateCollector() {
  run("python3", ["-m", "py_compile", "collectors/app_telemetry_exporter.py", "collectors/facility_adapter.py", "collectors/nvml_confidential_collector.py"]);
  const output = run("python3", [
    "collectors/app_telemetry_exporter.py",
    "--jsonl",
    "collectors/sample-app-metrics.jsonl",
    "--once"
  ], { echo: false });
  assert.match(output, /gb100_app_tokens_per_second/, "collector should emit app throughput");
  assert.match(output, /gb100_metric_capability\{[^}]*fp4_tensor_core_utilization/, "collector should emit unsupported FP4 capability row");
  assert.doesNotMatch(output, /request_id=/, "collector should not expose blocked request_id label");
}

function validateReport() {
  run(process.execPath, ["bin/gb100-telemetry-report", "--skip-live", "--out-dir", "build/gb100-validation"], { echo: false });
  const report = JSON.parse(read("build/gb100-validation/support-report.json"));
  assert.equal(report.schemaVersion, "gb100.telemetry.support-report.v1");
  assert.ok(report.requestedDcgmFieldCount >= requiredFields.length);
  assert.ok(report.unsupportedMetrics.some((item) => item.metric === "fp4_tensor_core_utilization"));
}

function main() {
  validateFiles();
  validateDcgmAllowlist();
  validateCapabilities();
  validatePrometheus();
  validateAlerts();
  validateGrafana();
  validateCollector();
  validateReport();
  console.log("GB100 telemetry validation passed");
}

main();
