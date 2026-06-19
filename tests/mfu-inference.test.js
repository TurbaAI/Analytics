const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const analytics = require("../analytics-core.js");

const root = path.join(__dirname, "..");
const pythonCommand = process.platform === "darwin" ? ["/usr/bin/arch", "-arm64", "python3"] : ["python3"];

function approximately(actual, expected, epsilon = 0.0001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

const summary = {
  allocatedGpuHours: 2227,
  tokensM: 690,
  gpuModels: ["H100 SXM"],
  inferenceRequestsM: 0,
  usefulCompute: 41,
  gpuUtil: 62,
  costPerMillionRequests: 0,
  latencyTail: 0,
  kvCachePressure: 0,
  batchInefficiency: 10,
  wastedGpuHours: 1300,
  wasteDollars: 8060
};
const modelSpec = {
  paramsB: 70,
  precision: "bf16",
  gpuModel: "H100 SXM",
  hardwareFlopMultiplier: 1.18
};

const flops = analytics.modelFlopsUtilization(summary, modelSpec);
assert.equal(flops.status, "measured");
assert.ok(flops.mfuPct > 0);
assert.ok(flops.mfuPct <= 100);
assert.ok(flops.hfuPct >= flops.mfuPct);
assert.ok(flops.hfuPct <= 100);

const finalized = analytics.finalizeSummary({ ...summary, modelSpec }, 6.2);
approximately(finalized.mfuPct, flops.mfuPct);
approximately(finalized.hfuPct, flops.hfuPct);

const unknown = analytics.modelFlopsUtilization({ allocatedGpuHours: 12 }, {});
assert.equal(unknown.status, "unknown");
assert.equal(unknown.mfuPct, null);

const inferenceSummary = analytics.finalizeSummary({
  ...summary,
  inferenceRequestsM: 42,
  latencyTail: 64,
  kvCachePressure: 71,
  batchInefficiency: 28,
  wastedGpuHours: 420,
  modelSpec
}, 6.2);
const inferenceOpportunities = analytics.generateOpportunities({
  ...inferenceSummary,
  scope: "job",
  key: "inference-a",
  label: "inference-a",
  count: 1,
  sourceItems: [{}],
  provider: {},
  slo: {}
}, { rate: 6.2 });
assert.ok(inferenceOpportunities.opportunities.some((opportunity) => opportunity.category === "inference-serving"));

const trainingOpportunities = analytics.generateOpportunities({
  ...finalized,
  scope: "job",
  key: "training-a",
  label: "training-a",
  count: 1,
  sourceItems: [{}],
  provider: {},
  slo: {}
}, { rate: 6.2 });
assert.equal(trainingOpportunities.opportunities.some((opportunity) => opportunity.category === "inference-serving"), false);

const parity = JSON.parse(spawnSync(pythonCommand[0], [
  ...pythonCommand.slice(1),
  "-c",
  `
import json
from platform_common.analytics import model_flops_utilization
summary = ${JSON.stringify(JSON.stringify(summary))}
model_spec = ${JSON.stringify(JSON.stringify(modelSpec))}
print(json.dumps(model_flops_utilization(json.loads(summary), json.loads(model_spec))))
`
], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    PYTHONPATH: ["services/platform_common"].join(path.delimiter)
  }
}).stdout.trim());
assert.equal(parity.status, flops.status);
approximately(parity.mfuPct, flops.mfuPct);
approximately(parity.hfuPct, flops.hfuPct);
approximately(parity.peakTflops, flops.peakTflops);

console.log("MFU and inference economics tests passed");
