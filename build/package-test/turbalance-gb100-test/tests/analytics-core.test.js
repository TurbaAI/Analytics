const assert = require("node:assert/strict");
const analytics = require("../analytics-core.js");

const baseSummary = {
  allocatedGpuHours: 2227,
  gpuUtil: 62,
  usefulCompute: 41,
  smOccupancy: 55,
  tensorCoreUtil: 47,
  ncclTime: 29,
  networkWait: 12,
  dataloaderStall: 5,
  storageWait: 3,
  cpuPrep: 4,
  hbmCapacity: 71,
  hbmBandwidth: 64,
  memoryFragmentation: 14,
  placementQuality: 53,
  crossRackTraffic: 68,
  crossPodTraffic: 41,
  idleGpus: 0,
  partialNodes: 3,
  queueWaitMinutes: 24,
  noiseEvents: 1,
  contentionPct: 14,
  precisionLoss: 7,
  batchInefficiency: 10,
  allToAllTime: 2,
  stepRegularity: 91,
  kvCachePressure: 0,
  latencyTail: 0,
  tokensM: 690,
  steps: 12800,
  inferenceRequestsM: 0,
  baseline: {
    stepTime: 1.82,
    currentStepTime: 2.11,
    ncclTime: 22,
    gpuEfficiency: 56,
    queueWaitMinutes: 18,
    costPerMillionTokens: 19.2
  }
};

function approximately(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

const finalized = analytics.finalizeSummary(baseSummary, 6.2);
approximately(finalized.usefulGpuHours, 913.07);
approximately(finalized.wastedGpuHours, 1313.93);
approximately(finalized.costPerUsefulGpuHour, 15.12);
approximately(finalized.costPerMillionTokens, 20.01);

const providerEconomics = analytics.summarizeProviderEconomics({
  ...finalized,
  provider: {
    listGpuHourRate: 6.8,
    floorGpuHourCost: 3.9,
    committedGpuHours: 6500,
    burstGpuHours: 240,
    billableGpuHours: 2227,
    sellableGpuHours: 2227
  },
  slo: {
    targetStartMinutes: 20,
    targetEfficiency: 55
  }
});
approximately(providerEconomics.sellableWasteValue, 8934.72);
approximately(providerEconomics.grossMarginPct, 42.65);
approximately(providerEconomics.reservationBurnPct, 34.26);
approximately(providerEconomics.queueSloPct, 120);
approximately(providerEconomics.efficiencyGap, 14);

const classifier = analytics.classifyBottlenecks(finalized);
assert.equal(classifier.primary.short, "Communication");
assert.equal(classifier.secondary.short, "Placement");
assert.equal(classifier.improvementRange, "18 to 30%");

const whatIf = analytics.finalizeSummary(analytics.applyPlacementWhatIf(finalized, true), 6.2);
assert.equal(whatIf.whatIfActive, true);
assert.ok(whatIf.usefulCompute > finalized.usefulCompute);
assert.ok(whatIf.crossPodTraffic < finalized.crossPodTraffic);
assert.ok(whatIf.wastedGpuHours < finalized.wastedGpuHours);

const opportunityEngine = analytics.generateOpportunities({
  ...finalized,
  scope: "job",
  key: "run-7421",
  label: "llama-70b-pretrain-7421",
  count: 1,
  gpus: 192,
  provider: {
    listGpuHourRate: 6.8,
    floorGpuHourCost: 3.9,
    committedGpuHours: 6500,
    billableGpuHours: 2227,
    sellableGpuHours: 2227
  },
  slo: {
    targetStartMinutes: 20,
    targetEfficiency: 55
  },
  sourceItems: [{}],
  traceAttribution: { eventCount: 3 }
}, { classifier, provider: providerEconomics, rate: 6.2 });
assert.ok(opportunityEngine.totalImpactDollars > 10000);
assert.ok(opportunityEngine.totalImpactGpuHours > 2000);
assert.equal(opportunityEngine.highestSeverity, "critical");
assert.equal(opportunityEngine.opportunities[0].category, "Provider SLO + Escalation");
assert.ok(opportunityEngine.opportunities.some((opportunity) => opportunity.category === "Fabric + Topology"));
assert.ok(opportunityEngine.opportunities.some((opportunity) => opportunity.category === "Energy + Carbon"));

const schedulerSimulator = analytics.simulateSchedulerScenarios({
  ...finalized,
  gpus: 192,
  partialNodes: 3,
  idleGpus: 0,
  provider: {
    listGpuHourRate: 6.8,
    committedGpuHours: 6500,
    billableGpuHours: 2227
  },
  slo: {
    targetStartMinutes: 20
  },
  schedulerEvidence: {
    eventCount: 5,
    placementRetries: 4,
    localityMisses: 3,
    backfillCandidates: 6,
    gpusPerNode: 8
  },
  traceAttribution: { eventCount: 3 }
}, { rate: 6.8 });
assert.equal(schedulerSimulator.scenarios.length, 3);
assert.ok(schedulerSimulator.recommended.recoveredGpuHours > 0);
assert.ok(schedulerSimulator.recommended.dollarUpside > 0);
assert.ok(schedulerSimulator.recommended.projected.placementQuality > finalized.placementQuality);
assert.ok(schedulerSimulator.recommended.evidence.includes("Scheduler evidence"));
assert.equal(schedulerSimulator.recommended.sourceEvidence.schedulerEvents, 5);
assert.ok(schedulerSimulator.scenarios.some((scenario) => scenario.id === "locality"));

const noWhatIf = analytics.applyPlacementWhatIf(finalized, false);
assert.equal(noWhatIf.whatIfActive, false);
assert.equal(noWhatIf.crossPodTraffic, finalized.crossPodTraffic);

const inferenceFingerprint = analytics.fingerprintWorkload({
  ...finalized,
  inferenceRequestsM: 42,
  latencyTail: 74,
  kvCachePressure: 87
});
assert.equal(inferenceFingerprint.name, "Inference batch serving");

const componentScores = analytics.scoreComponents(finalized, 6.2, (value) => `$${Math.round(value)}`);
assert.equal(componentScores.length, 6);
assert.equal(componentScores[0].name, "Compute efficiency");
assert.equal(componentScores[5].note, "$15 per useful GPU-hour");

const regressions = analytics.regressionRows(finalized, (value) => `$${Math.round(value)}`);
assert.equal(regressions.length, 5);
assert.equal(regressions[0].name, "Step time");
assert.equal(regressions[0].grade.key, "poor");
assert.equal(regressions[2].text, "15% drop");
assert.equal(regressions[4].note, "$20 per million tokens");

const efficiencyTrend = analytics.summarizeTrend([
  { capturedAt: "2026-05-28T10:00:00.000Z", value: 41 },
  { capturedAt: "2026-05-29T10:00:00.000Z", value: 49 },
  { capturedAt: "2026-05-30T10:00:00.000Z", value: 47 }
]);
assert.equal(efficiencyTrend.count, 3);
assert.equal(efficiencyTrend.delta, 6);
assert.equal(efficiencyTrend.best.value, 49);
assert.equal(efficiencyTrend.direction, "improved");

const costTrend = analytics.summarizeTrend([
  { value: 18.4 },
  { value: 16.2 },
  { value: 15.1 }
], { higherIsBetter: false });
assert.equal(costTrend.best.value, 15.1);
assert.equal(costTrend.direction, "improved");

assert.equal(analytics.summarizeTrend([]).direction, "flat");
assert.deepEqual(analytics.grade(72, 55, 72), { key: "good", label: "Healthy" });
assert.deepEqual(analytics.inverseGrade(32, 18, 32), { key: "poor", label: "Lossy" });
assert.equal(analytics.clamp(140), 100);

console.log("analytics-core tests passed");
