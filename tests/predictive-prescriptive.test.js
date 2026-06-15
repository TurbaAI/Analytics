const assert = require("node:assert/strict");
const p = require("../predictive-core.js");

// ---------------------------------------------------------------------------
// forecastMetric
// ---------------------------------------------------------------------------
{
  const rising = p.forecastMetric(
    [{ value: 60 }, { value: 64 }, { value: 69 }, { value: 73 }, { value: 78 }],
    { horizon: 3, higherIsBetter: true }
  );
  assert.equal(rising.ok, true);
  assert.equal(rising.direction, "rising");
  assert.equal(rising.trend, "improving");
  assert.equal(rising.projections.length, 3);
  assert.ok(rising.projections[2].value > rising.lastValue, "should project upward");
  assert.ok(rising.projections[0].lower <= rising.projections[0].value, "band lower <= value");
  assert.ok(rising.projections[0].upper >= rising.projections[0].value, "band upper >= value");
  assert.ok(rising.confidence > 50, "clean linear series should be confident");

  // higherIsBetter=false: a rising metric is regressing.
  const regress = p.forecastMetric([10, 14, 19, 25, 31], { higherIsBetter: false, horizon: 2 });
  assert.equal(regress.trend, "regressing");

  // Insufficient data is handled, not thrown.
  assert.equal(p.forecastMetric([]).ok, false);
  assert.equal(p.forecastMetric([{ value: 5 }]).ok, false);

  // Flat series → flat trend.
  const flat = p.forecastMetric([50, 50, 50, 50], { flatThreshold: 0.05 });
  assert.equal(flat.direction, "flat");
}

// ---------------------------------------------------------------------------
// timeToThreshold
// ---------------------------------------------------------------------------
{
  const rising = p.timeToThreshold([70, 74, 79, 84], 95, { direction: "above" });
  assert.equal(rising.ok, true);
  assert.equal(rising.willCross, true);
  assert.ok(rising.periodsToThreshold > 1 && rising.periodsToThreshold < 5, "should cross within a few periods");
  assert.ok(["critical", "high", "watch"].includes(rising.urgency));

  // Falling away from an "above" threshold never crosses it.
  const away = p.timeToThreshold([84, 79, 74, 70], 95, { direction: "above" });
  assert.equal(away.willCross, false);

  // Timestamped series yields an ETA in days.
  const day = 86_400_000;
  const base = Date.parse("2026-01-01T00:00:00Z");
  const timed = p.timeToThreshold(
    [
      { value: 70, t: base },
      { value: 75, t: base + day },
      { value: 80, t: base + 2 * day },
      { value: 85, t: base + 3 * day }
    ],
    95,
    { direction: "above" }
  );
  assert.equal(timed.willCross, true);
  assert.ok(Number.isFinite(timed.etaDays) && timed.etaDays > 0, "should compute ETA in days");
}

// ---------------------------------------------------------------------------
// detectAnomalies
// ---------------------------------------------------------------------------
{
  const series = [50, 51, 49, 50, 52, 48, 95]; // last point is a clear spike
  const mad = p.detectAnomalies(series, { method: "mad" });
  assert.equal(mad.ok, true);
  assert.equal(mad.latest.isAnomaly, true);
  assert.equal(mad.latest.direction, "high");
  assert.ok(mad.anomalies.some((a) => a.index === 6), "spike should be flagged");

  const calm = p.detectAnomalies([50, 51, 49, 50, 52, 48, 50]);
  assert.equal(calm.latest.isAnomaly, false);

  const z = p.detectAnomalies(series, { method: "zscore" });
  assert.equal(z.method, "zscore");
}

// ---------------------------------------------------------------------------
// regressionRiskScore
// ---------------------------------------------------------------------------
{
  // Worsening (higherIsBetter) + volatile → elevated/critical.
  const risky = p.regressionRiskScore([80, 70, 74, 60, 55, 45], { higherIsBetter: true });
  assert.equal(risky.ok, true);
  assert.ok(risky.score > 22, "declining good-metric should carry risk");
  assert.ok(["watch", "elevated", "critical"].includes(risky.band));
  assert.ok(risky.drivers.length >= 1);

  const stable = p.regressionRiskScore([80, 81, 80, 79, 80, 80], { higherIsBetter: true });
  assert.ok(stable.score < risky.score, "stable series should be lower risk");
}

// ---------------------------------------------------------------------------
// analyzePredictive (umbrella + warnings)
// ---------------------------------------------------------------------------
{
  const result = p.analyzePredictive(
    {
      hbmCapacity: [70, 76, 82, 88, 92],
      gpuUtil: [60, 61, 60, 62, 61]
    },
    {
      horizon: 3,
      metrics: {
        hbmCapacity: { higherIsBetter: false, threshold: 98, direction: "above", label: "HBM capacity" },
        gpuUtil: { higherIsBetter: true, label: "GPU utilization" }
      }
    }
  );
  assert.ok(result.metrics.hbmCapacity.forecast.ok);
  assert.ok(result.metrics.hbmCapacity.saturation, "threshold metric should have saturation analysis");
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.some((w) => w.metric === "hbmCapacity"), "rising HBM should warn");
}

// ---------------------------------------------------------------------------
// prescribeActions / optimizeActionPlan / buildActionPlan
// ---------------------------------------------------------------------------
{
  const opportunities = [
    { id: "a", title: "Recover wasted spend", category: "Useful Compute FinOps", owner: "FinOps", impactDollars: 12000, impactGpuHours: 300, confidence: 80, riskScore: 60, priorityScore: 70, severity: "high", recommendation: "Rank pools.", evidence: "evidence A" },
    { id: "b", title: "Repack topology", category: "Fabric + Topology", owner: "Net", impactDollars: 8000, impactGpuHours: 150, confidence: 70, riskScore: 50, priorityScore: 60, severity: "medium", recommendation: "Reserve locality.", evidence: "evidence B" },
    { id: "c", title: "Evidence pack", category: "Customer Evidence Pack", owner: "CS", impactDollars: 1500, impactGpuHours: 20, confidence: 60, riskScore: 20, priorityScore: 35, severity: "low", recommendation: "Export pack.", evidence: "evidence C" }
  ];

  const prescription = p.prescribeActions(opportunities);
  assert.equal(prescription.count, 3);
  prescription.actions.forEach((a) => {
    assert.ok(a.effort >= 1 && a.effort <= 5, "effort in range");
    assert.ok(["low", "medium", "high"].includes(a.risk));
    assert.ok(Number.isFinite(a.roi));
    assert.ok(typeof a.verify === "string" && a.verify.length > 0);
  });
  // Ranked descending by priority.
  for (let i = 1; i < prescription.actions.length; i += 1) {
    assert.ok(prescription.actions[i - 1].priorityScore >= prescription.actions[i].priorityScore);
  }

  // Optimizer respects effort budget.
  const plan = p.optimizeActionPlan(prescription.actions, { effortBudget: 3, riskTolerance: "high" });
  assert.ok(plan.usedEffort <= 3, "must not exceed effort budget");
  assert.ok(plan.selected.length >= 1);
  assert.equal(plan.selected.length + plan.skipped.length, prescription.actions.length);

  // Risk tolerance filters high-risk actions out.
  const lowRiskPlan = p.optimizeActionPlan(prescription.actions, { effortBudget: 20, riskTolerance: "low" });
  assert.ok(lowRiskPlan.selected.every((a) => a.risk === "low"), "low tolerance keeps only low-risk");

  // Action plan is ordered and verifiable.
  const remediation = p.buildActionPlan(plan.selected, { now: "2026-06-15T00:00:00Z" });
  assert.equal(remediation.steps.length, plan.selected.length);
  remediation.steps.forEach((s, i) => {
    assert.equal(s.step, i + 1);
    assert.ok(s.verify && s.do && s.expectedImpact);
  });
  assert.ok(remediation.text.includes("Verify:"));
}

// ---------------------------------------------------------------------------
// forecastDrivenActions + analyzePrescriptive (predictive ↔ prescriptive)
// ---------------------------------------------------------------------------
{
  const opportunities = [
    { id: "mem", title: "Relieve HBM pressure", category: "Memory efficiency fix", owner: "Platform", impactDollars: 5000, impactGpuHours: 120, confidence: 70, riskScore: 55, priorityScore: 40, recommendation: "Reduce HBM pressure.", evidence: "hbm" },
    { id: "fin", title: "Recover spend", category: "Useful Compute FinOps", owner: "FinOps", impactDollars: 9000, impactGpuHours: 200, confidence: 80, riskScore: 50, priorityScore: 65, recommendation: "Rank pools.", evidence: "fin" }
  ];

  const predictive = p.analyzePredictive(
    { hbmCapacity: [70, 78, 85, 91, 95] },
    { horizon: 3, metrics: { hbmCapacity: { higherIsBetter: false, threshold: 99, direction: "above", label: "HBM capacity" } } }
  );

  const prescription = p.prescribeActions(opportunities);
  const driven = p.forecastDrivenActions(prescription, predictive);
  assert.ok(driven.directives.length >= 1, "saturating HBM should produce a directive");
  // The Memory action should be escalated to urgent and bubble to the top.
  const mem = driven.actions.find((a) => a.id === "mem");
  assert.ok(["critical", "high"].includes(mem.urgency), "memory action should be escalated");
  assert.ok(mem.driver && mem.driver.includes("HBM"), "driver explains the prediction link");

  // Umbrella wires it all together.
  const full = p.analyzePrescriptive(opportunities, { predictive, effortBudget: 6, riskTolerance: "high" });
  assert.ok(full.summary.recoverableDollars > 0);
  assert.ok(full.plan.selected.length >= 1);
  assert.ok(full.remediation.steps.length >= 1);
  assert.ok(full.summary.urgentDirectives >= 1);
}

console.log("predictive-prescriptive tests passed");
