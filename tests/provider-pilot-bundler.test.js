const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { validateSourceBundle } = require("../lib/source-bundle-validator.js");

const root = path.join(__dirname, "..");
const result = spawnSync(
  process.execPath,
  ["scripts/build-provider-pilot-bundle.js", "fixtures/provider-pilot-export-inputs"],
  { cwd: root, encoding: "utf8" }
);

assert.equal(result.status, 0, result.stderr);

const bundle = JSON.parse(result.stdout);
const validation = validateSourceBundle(bundle, { requireSourceExport: true });
assert.equal(validation.ok, true, validation.errors.join("; "));

[
  "prometheus",
  "dcgm",
  "kubernetes",
  "scheduler",
  "grafana",
  "ebpf",
  "redfish",
  "provider",
  "opportunities"
].forEach((key) => {
  assert.equal(bundle.sources[key].length, 1, `${key} should have one pilot sample`);
});
assert.equal(bundle.ncclTraces.length, 1);
assert.equal(bundle.sources.provider[0].commercial.billingModel, "reserved-cluster");
assert.equal(bundle.sources.provider[0].slo.supportTicketId, "CS-2044");
assert.equal(bundle.sources.grafana[0].dashboardUid, "turbalance-provider-overview");
assert.equal(bundle.sources.scheduler[0].placementRetries, 8);
assert.equal(bundle.sources.ebpf[0].network.tcpRetransmitPct, 3.2);
assert.equal(bundle.sources.redfish[0].metrics.redfish_power_watts, 4850);
assert.equal(bundle.sources.redfish[0].health.rollup, "Warning");

console.log("provider pilot bundler tests passed");
