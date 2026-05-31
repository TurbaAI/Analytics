const assert = require("node:assert/strict");
const parser = require("../nccl-trace-parser.js");
const fixtures = require("../nccl-trace-fixtures.js");

const topologyIndex = {
  "A1-01": { pod: "pod-a", rack: "A1" },
  "A1-02": { pod: "pod-a", rack: "A1" },
  "A2-01": { pod: "pod-a", rack: "A2" },
  "B1-01": { pod: "pod-b", rack: "B1" },
  "C1-01": { pod: "pod-c", rack: "C1" }
};

function approximately(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

assert.equal(parser.inferTier(["A1-01", "A1-02"], topologyIndex), "intra-rack");
assert.equal(parser.inferTier(["A1-01", "A2-01"], topologyIndex), "cross-rack");
assert.equal(parser.inferTier(["A1-01", "B1-01"], topologyIndex), "cross-pod");

const parsed = parser.parseNcclTraces(fixtures);
assert.equal(parsed.length, 5);

const pretrain = parsed.find((trace) => trace.runId === "run-7421");
assert.equal(pretrain.eventCount, 5);
assert.equal(pretrain.totalDurationMs, 3420);
assert.equal(pretrain.hottestTier.tier, "cross-pod");
approximately(pretrain.ncclTime, 94.74);
approximately(pretrain.crossRackTraffic, 94.74);
approximately(pretrain.crossPodTraffic, 55.56);
assert.equal(pretrain.byTier[0].label, "Cross-pod");

const serving = parsed.find((trace) => trace.runId === "svc-1190");
approximately(serving.allToAllTime, 89.81);
approximately(serving.crossRackTraffic, 89.81);
assert.equal(serving.byOperation[0].op, "all_to_all");

const inferred = parser.parseNcclTrace({
  runId: "inferred",
  events: [
    { op: "all_reduce", durationMs: 100, bytes: 1000, nodes: ["A1-01", "C1-01"] }
  ]
}, topologyIndex);
assert.equal(inferred.hottestTier.tier, "cross-pod");
assert.equal(inferred.byTier[0].durationPct, 100);

console.log("nccl-trace-parser tests passed");
