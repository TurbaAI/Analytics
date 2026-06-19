const assert = require("node:assert/strict");
const p = require("../predictive-core.js");

const action = {
  id: "act-repack-1",
  title: "Repack stranded GPUs",
  category: "Scheduler + Capacity",
  impactDollars: 360,
  impactGpuHours: 60,
  confidence: 82
};
const baseline = {
  id: "snap-before",
  capturedAt: "2026-06-01T00:00:00.000Z",
  scope: "tenant",
  key: "tenant-a",
  window: "2026-05-01T00:00:00.000Z/2026-06-01T00:00:00.000Z",
  rate: 6,
  metrics: { wastedGpuHours: 120, usefulCompute: 52 }
};
const result = {
  id: "snap-after",
  capturedAt: "2026-06-08T00:00:00.000Z",
  scope: "tenant",
  key: "tenant-a",
  window: "2026-06-01T00:00:00.000Z/2026-06-08T00:00:00.000Z",
  rate: 6,
  metrics: { wastedGpuHours: 70, usefulCompute: 61 }
};

{
  const entry = p.recordOutcome(action, baseline, result);
  assert.equal(entry.actionId, "act-repack-1");
  assert.deepEqual(entry.scope, { type: "tenant", key: "tenant-a" });
  assert.equal(entry.status, "verified");
  assert.equal(entry.attribution, "measured");
  assert.equal(entry.deltaGpuHours, 50);
  assert.equal(entry.deltaDollars, 300);
  assert.equal(entry.predictedGpuHours, 60);
  assert.equal(entry.predictedDollars, 360);
  assert.equal(entry.baseline.snapshotId, "snap-before");
  assert.equal(entry.result.snapshotId, "snap-after");
  assert.ok(entry.id.startsWith("ledger-"));
}

{
  const entry = p.recordOutcome({ ...action, metric: "usefulCompute" }, baseline, result);
  assert.equal(entry.metric, "usefulCompute");
  assert.equal(entry.deltaGpuHours, 9, "higher-is-better metrics use result - baseline");
}

{
  const modeled = p.recordOutcome(action, baseline, null);
  assert.equal(modeled.attribution, "modeled");
  assert.equal(modeled.status, "proposed");
  assert.equal(modeled.deltaGpuHours, 60);
  assert.equal(modeled.deltaDollars, 360);
}

{
  let entry = p.recordOutcome(action, null, null, { status: "proposed" });
  entry = p.advanceLedgerStatus(entry, { type: "accept", at: "2026-06-02T00:00:00.000Z" });
  assert.equal(entry.status, "accepted");
  entry = p.advanceLedgerStatus(entry, { type: "apply", at: "2026-06-03T00:00:00.000Z" });
  assert.equal(entry.status, "applied");
  assert.equal(entry.appliedAt, "2026-06-03T00:00:00.000Z");
  entry = p.advanceLedgerStatus(entry, { type: "verify", at: "2026-06-08T00:00:00.000Z" });
  assert.equal(entry.status, "verified");
  assert.equal(entry.verifiedAt, "2026-06-08T00:00:00.000Z");
  assert.throws(() => p.advanceLedgerStatus(entry, "apply"), /illegal ledger transition/);
  assert.throws(() => p.advanceLedgerStatus({ ...entry, status: "proposed" }, "verify"), /illegal ledger transition/);
}

{
  const verified = p.recordOutcome(action, baseline, result);
  const modeled = p.recordOutcome(
    { ...action, id: "act-modeled", category: "Useful Compute FinOps", impactDollars: 120, impactGpuHours: 20 },
    baseline,
    null
  );
  const otherScope = p.recordOutcome(
    { ...action, id: "act-other", impactDollars: 60, impactGpuHours: 10 },
    { ...baseline, key: "tenant-b" },
    { ...result, key: "tenant-b", metrics: { wastedGpuHours: 50 } }
  );

  const rollup = p.rollupLedger([verified, modeled, otherScope], { scope: { type: "tenant", key: "tenant-a" } });
  assert.equal(rollup.entryCount, 2);
  assert.equal(rollup.verifiedCount, 1);
  assert.equal(rollup.modeledCount, 1);
  assert.equal(rollup.verifiedGpuHours, 50);
  assert.equal(rollup.verifiedDollars, 300);
  assert.equal(rollup.predictedDollars, 480);
  assert.equal(rollup.realizationRate, 62.5);
  assert.equal(rollup.byScope["tenant:tenant-a"].count, 1);
  assert.equal(rollup.byCategory["Scheduler + Capacity"].verifiedGpuHours, 50);

  const windowed = p.rollupLedger([verified], { window: "2026-06-07T00:00:00.000Z/2026-06-09T00:00:00.000Z" });
  assert.equal(windowed.verifiedCount, 1);
  const outside = p.rollupLedger([verified], { window: "2026-06-09T00:00:00.000Z/2026-06-10T00:00:00.000Z" });
  assert.equal(outside.verifiedCount, 0);
}

console.log("savings ledger tests passed");
