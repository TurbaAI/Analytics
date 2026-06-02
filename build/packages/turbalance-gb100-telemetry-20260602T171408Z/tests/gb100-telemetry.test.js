const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

run(process.execPath, ["scripts/validate-gb100-telemetry.js"]);

const compose = read("deploy/docker/docker-compose.yml");
assert.match(compose, /9400:9400/, "DCGM Exporter should publish port 9400");
assert.match(compose, /9500:9500/, "app collector should publish port 9500");
assert.match(compose, /DCGM_REMOTE_HOSTENGINE_INFO/, "compose should support remote nv-hostengine");
assert.match(compose, /DCGM_EXPORTER_INTERVAL/, "compose should support interval configuration");

const daemonSet = read("deploy/kubernetes/gb100-dcgm-exporter-daemonset.yaml");
assert.match(daemonSet, /DCGM_EXPORTER_KUBERNETES/, "DaemonSet should enable Kubernetes pod mapping");
assert.match(daemonSet, /containerPort: 9400/, "DaemonSet should expose DCGM Exporter port");
assert.match(daemonSet, /gb100-dcgm-fields/, "DaemonSet should mount the custom allowlist");

const collectorOutput = run("python3", [
  "collectors/app_telemetry_exporter.py",
  "--jsonl",
  "collectors/sample-app-metrics.jsonl",
  "--once"
], { echo: false });
assert.match(collectorOutput, /gb100_app_llm_workload_info/, "collector should emit LLM workload marker");
assert.match(collectorOutput, /status="profiler_required"/, "collector should label profiler-only metrics");
assert.match(collectorOutput, /status="external_system_required"/, "collector should label external facility metrics");

const report = JSON.parse(read("build/gb100-validation/support-report.json"));
assert.ok(Array.isArray(report.unavailableDcgmFields), "support report should include unavailable fields");
assert.ok(Array.isArray(report.unsupportedMetrics), "support report should include unsupported metrics");
assert.ok(report.recommendations.length > 0, "support report should include recommendations");

console.log("GB100 telemetry tests passed");
