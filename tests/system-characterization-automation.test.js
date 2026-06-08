const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "turba-system-characterization-"));
const out = path.join(temp, "automation-run.json");
const piOut = path.join(temp, "pi-automation-run.json");

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${process.execPath} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

run(["--check", "scripts/run-system-characterization.js"]);
run([
  "scripts/run-system-characterization.js",
  "--dry-run",
  "--nuc",
  "local",
  "--out",
  out
]);

const report = JSON.parse(fs.readFileSync(out, "utf8"));
assert.equal(report.schemaVersion, "turba.system_characterization_automation.v1");
assert.equal(report.status, "ok");
assert.equal(report.dryRun, true);
assert.deepEqual(report.targets, ["cpu", "gpu", "ram", "network", "disk"]);
assert.deepEqual(report.profiles, ["impulse", "step", "ramp"]);
assert.equal(report.hosts.length, 2);
assert.ok(report.steps.some((step) => step.hostId === "SPARK1" && step.command.includes("system_id_worker")));
assert.ok(report.steps.some((step) => step.hostId === "SPARK2" && step.command.includes("/v1/telemetry/batches")));
assert.ok(report.steps.some((step) => step.step === "materialize-transforms" && step.command.includes("transform_runner")));

run([
  "scripts/run-system-characterization.js",
  "--dry-run",
  "--nuc",
  "local",
  "--pi-fleet",
  "--skip-transform",
  "--out",
  piOut
]);

const piReport = JSON.parse(fs.readFileSync(piOut, "utf8"));
assert.equal(piReport.status, "ok");
assert.equal(piReport.hosts.length, 12);
assert.ok(piReport.hosts.some((host) => host.ssh === "pi@pi1" && host.hostId === "PI1"));
assert.ok(piReport.hosts.some((host) => host.ssh === "pi@pi12" && host.hostId === "PI12"));
assert.ok(piReport.steps.some((step) => step.hostId === "PI12" && step.command.includes("/home/pi/Analytics")));
assert.ok(piReport.steps.every((step) => step.step === "characterize-and-post"));

console.log("system characterization automation tests passed");
