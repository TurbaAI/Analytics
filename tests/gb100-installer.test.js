const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
  return result.stdout;
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

assert.ok(exists("install.sh"), "root installer should exist");
assert.ok(exists("deploy/install/gb100-telemetry.env.example"), "installer env template should exist");
assert.ok(exists("docs/install.md"), "installer docs should exist");

const help = run("sh", ["install.sh", "--help"]);
assert.match(help, /--mode auto\|docker\|k8s\|static/, "installer help should explain modes");
assert.match(help, /--with-systemd/, "installer help should document systemd option");
assert.match(help, /--live-machine/, "installer help should document the live machine collector option");

const dryRunPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "turba-gb100-dry-"));
const dryRun = run("sh", [
  "install.sh",
  "--mode",
  "static",
  "--prefix",
  path.join(dryRunPrefix, "install"),
  "--no-start",
  "--dry-run"
]);
assert.match(dryRun, /Would copy repository files/, "dry run should avoid copying files");
assert.equal(fs.existsSync(path.join(dryRunPrefix, "install", "index.html")), false, "dry run should not write install files");

const systemdDryRun = run("sh", [
  "install.sh",
  "--mode",
  "static",
  "--prefix",
  path.join(dryRunPrefix, "systemd-install"),
  "--with-systemd",
  "--live-machine",
  "--live-machine-host-url",
  "http://192.168.10.20:8000",
  "--node-bin",
  process.execPath,
  "--no-start",
  "--dry-run"
]);
assert.match(systemdDryRun, /turbalance-live-machine-collector\.service/, "dry run should plan the live machine service");
assert.match(systemdDryRun, /systemctl enable turbalance-live-machine-collector\.service/, "dry run should enable the live machine service");

const installPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "turba-gb100-install-"));
run("sh", [
  "install.sh",
  "--mode",
  "static",
  "--prefix",
  path.join(installPrefix, "app"),
  "--no-start"
]);
for (const relativePath of [
  "index.html",
  "app.js",
  "metrics/gb100-dcgm-fields.csv",
  "deploy/docker/docker-compose.yml",
  "collectors/app_telemetry_exporter.py",
  "bin/gb100-telemetry-report",
  "deploy/install/install-state.json"
]) {
  assert.ok(fs.existsSync(path.join(installPrefix, "app", relativePath)), `installed prefix missing ${relativePath}`);
}

const liveInstallPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "turba-gb100-live-install-"));
const liveAppPrefix = path.join(liveInstallPrefix, "app");
run("sh", [
  "install.sh",
  "--mode",
  "static",
  "--prefix",
  liveAppPrefix,
  "--no-start",
  "--live-machine",
  "--live-machine-host-url",
  "http://192.168.10.20:8000",
  "--node-bin",
  process.execPath
]);
const liveState = JSON.parse(fs.readFileSync(path.join(liveAppPrefix, "deploy/install/install-state.json"), "utf8"));
const liveEnv = fs.readFileSync(path.join(liveAppPrefix, "deploy/install/gb100-telemetry.env"), "utf8");
assert.equal(liveState.liveMachine, true, "live install state should preserve live machine setting");
assert.equal(liveState.liveMachineHostUrl, "http://192.168.10.20:8000");
assert.ok(liveEnv.includes("TURBALANCE_MACHINE_DEMO_URL=http://192.168.10.20:8000"));
assert.ok(liveEnv.includes("TURBALANCE_LIVE_MACHINE_BUNDLE=build/demo/live-machine-bundle.json"));

const packageOut = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "turba-gb100-package-")), "package-test");
fs.rmSync(packageOut, { recursive: true, force: true });
run(process.execPath, [
  "scripts/package-gb100-telemetry.js",
  "--out-dir",
  packageOut,
  "--name",
  "turbalance-gb100-test",
  "--skip-tar"
]);
const manifestPath = path.join(packageOut, "turbalance-gb100-test", "PACKAGE-MANIFEST.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.schemaVersion, "turbalance.gb100.package.v1");
assert.ok(manifest.files.includes("install.sh"), "package should include installer");
assert.ok(manifest.files.includes("metrics/gb100-dcgm-fields.csv"), "package should include DCGM allowlist");
assert.ok(manifest.files.includes("deploy/install/gb100-telemetry.env.example"), "package should include install env defaults");
assert.ok(manifest.files.includes("grafana/gb100-overview.json"), "package should include Grafana dashboards");
assert.ok(!manifest.files.some((file) => file.startsWith("build/")), "package should exclude build artifacts");

console.log("GB100 installer tests passed");
