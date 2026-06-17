const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turba-productization-"));
const configPath = path.join(tempDir, "product.json");
const outDir = path.join(tempDir, "runtime");
const supportDir = path.join(tempDir, "support");
const releaseDir = path.join(tempDir, "release");
const installRoot = path.join(tempDir, "install-root");
const secretDir = path.join(tempDir, "secrets");

fs.writeFileSync(configPath, JSON.stringify({
  schemaVersion: "turba.product.v1",
  product: {
    version: "9.9.9-test",
    environment: "test"
  },
  controller: {
    host: "127.0.0.1",
    staticUrl: "http://127.0.0.1:65501",
    apiUrl: "http://127.0.0.1:65502",
    collectorUrl: "http://127.0.0.1:65503/v1/source-bundles",
    prometheusUrl: "http://127.0.0.1:65504",
    grafanaUrl: "http://127.0.0.1:65505",
    liveBundlePath: path.join(tempDir, "live-machine-bundle.json")
  },
  fleet: {
    tenantId: "tenant-test",
    defaultRemoteRoot: "/opt/turbalance/Analytics",
    machines: [
      {
        id: "host-a",
        hostId: "host-a",
        remote: "user@example-host",
        role: "spark",
        benchmarks: true
      }
    ]
  },
  security: {
    requireApiAuth: true,
    collectorToken: "test-token",
    collectorHmacSecret: "test-secret",
    tlsMode: "lab-http",
    allowedCorsOrigins: ["http://127.0.0.1:65501"]
  },
  observability: {
    prometheusUrl: "http://127.0.0.1:65504",
    grafanaUrl: "http://127.0.0.1:65505",
    grafanaPublicUrl: "https://127.0.0.1:65510/grafana"
  }
}, null, 2));

fs.writeFileSync(path.join(tempDir, "live-machine-bundle.json"), JSON.stringify({
  ingestion: {
    runs: [{ sourceContext: { hostname: "host-a" } }]
  }
}, null, 2));

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`node ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

runNode(["--check", "lib/product-config.js"]);
runNode(["--check", "scripts/render-product-runtime.js"]);
runNode(["--check", "scripts/turbalance-doctor.js"]);
runNode(["--check", "scripts/turbalance-support-bundle.js"]);
runNode(["--check", "scripts/rollout-production-fleet.js"]);
runNode(["--check", "scripts/package-product-release.js"]);
runNode(["--check", "scripts/manage-product-release.js"]);
runNode(["--check", "scripts/manage-product-controller-services.js"]);
runNode(["--check", "scripts/manage-product-observability.js"]);
runNode(["--check", "scripts/generate-product-edge-tls.js"]);
runNode(["--check", "scripts/manage-product-edge.js"]);
runNode(["--check", "scripts/generate-product-secrets.js"]);
runNode(["--check", "scripts/apply-product-security.js"]);

const renderReport = JSON.parse(runNode([
  "scripts/render-product-runtime.js",
  "--config",
  configPath,
  "--out-dir",
  outDir
]));

assert.equal(renderReport.status, "rendered");
assert.equal(renderReport.summary.enabledMachines, 1);
assert.equal(renderReport.summary.apiAuthRequired, true);
assert.equal(renderReport.summary.collectorAuthConfigured, true);
assert.ok(renderReport.warnings.some((warning) => warning.includes("TLS")));

const controllerEnv = fs.readFileSync(path.join(outDir, "controller.env"), "utf8");
assert.ok(controllerEnv.includes("TURBALANCE_PRODUCT_VERSION=9.9.9-test"));
assert.ok(controllerEnv.includes("TURBALANCE_API_REQUIRE_AUTH=true"));
assert.ok(controllerEnv.includes("TURBALANCE_COLLECTOR_TOKEN=\"[REDACTED]\""));
assert.ok(controllerEnv.includes("TURBALANCE_GRAFANA_PUBLIC_URL=https://127.0.0.1:65510/grafana"));
assert.ok(!controllerEnv.includes("test-token"));
assert.ok(!controllerEnv.includes("test-secret"));

const agentEnv = fs.readFileSync(path.join(outDir, "agents", "host-a.env"), "utf8");
assert.ok(agentEnv.includes("TURBALANCE_AGENT_ID=host-a-live-machine-push"));
assert.ok(agentEnv.includes("TURBALANCE_MACHINE_BENCHMARKS=1"));
assert.ok(agentEnv.includes("TURBALANCE_COLLECTOR_HMAC_SECRET=\"[REDACTED]\""));

const rollout = fs.readFileSync(path.join(outDir, "rollout-command.sh"), "utf8");
assert.ok(rollout.includes("scripts/rollout-production-fleet.js"));
assert.ok(rollout.includes("--product-version 9.9.9-test"));
assert.ok(rollout.includes("--deployment-environment test"));
assert.ok(rollout.includes("--remote user@example-host"));
const controllerServicesCommand = fs.readFileSync(path.join(outDir, "controller-services-command.sh"), "utf8");
assert.ok(controllerServicesCommand.includes("scripts/manage-product-controller-services.js"));
assert.ok(controllerServicesCommand.includes("--action install"));
const observabilityCommand = fs.readFileSync(path.join(outDir, "observability-command.sh"), "utf8");
assert.ok(observabilityCommand.includes("scripts/manage-product-observability.js"));
assert.ok(observabilityCommand.includes("--secure auto"));
const productEdgeCommand = fs.readFileSync(path.join(outDir, "product-edge-command.sh"), "utf8");
assert.ok(productEdgeCommand.includes("scripts/manage-product-edge.js"));
assert.ok(productEdgeCommand.includes("--action up"));

const userModeRollout = JSON.parse(runNode([
  "scripts/rollout-production-fleet.js",
  "--systemd-mode",
  "user",
  "--remote-root",
  "/home/user/turbalance-analytics",
  "--product-version",
  "9.9.9-test",
  "--deployment-environment",
  "test",
  "--remote",
  "user@example-host",
  "--benchmarks"
]));
assert.equal(userModeRollout.status, "dry-run");
assert.equal(userModeRollout.options.systemdMode, "user");
assert.equal(userModeRollout.targets[0].env.TURBALANCE_PRODUCT_VERSION, "9.9.9-test");
assert.equal(userModeRollout.targets[0].env.TURBALANCE_DEPLOYMENT_ENVIRONMENT, "test");
assert.ok(userModeRollout.targets[0].env.TURBALANCE_AGENT_SPOOL_DIR.includes("/home/user/.local/state/turbalance"));
assert.ok(userModeRollout.targets[0].commands.some((command) => command.command.includes("systemctl --user enable --now turbalance-live-machine-agent.service")));
assert.ok(userModeRollout.targets[0].commands.some((command) => command.command.includes("systemctl --user restart turbalance-live-machine-agent.service")));
assert.ok(userModeRollout.targets[0].commands.some((command) => command.step === "stop-orphan-agent-processes"));
assert.ok(userModeRollout.targets[0].commands.some((command) => command.command.includes("systemctl --user stop turbalance-machine-benchmark.service")));
assert.ok(userModeRollout.targets[0].commands.some((command) => command.command.includes("systemctl --user restart turbalance-machine-benchmark.timer")));
assert.ok(userModeRollout.targets[0].commands.every((command) => command.step !== "restart-benchmark-service"));
assert.ok(userModeRollout.targets[0].commands.every((command) => !command.command.includes("sudo -n")));

const tlsDir = path.join(tempDir, "tls");
fs.mkdirSync(tlsDir, { recursive: true });
fs.writeFileSync(path.join(tlsDir, "ca.crt"), "test-ca\n");
fs.writeFileSync(path.join(tlsDir, "agent-client.crt"), "test-cert\n");
fs.writeFileSync(path.join(tlsDir, "agent-client.key"), "test-key\n");
const tlsRollout = JSON.parse(runNode([
  "scripts/rollout-production-fleet.js",
  "--systemd-mode",
  "user",
  "--remote-root",
  "/home/user/turbalance-analytics",
  "--remote",
  "user@example-host",
  "--collector-url",
  "https://collector.example:9443/v1/source-bundles",
  "--collector-ca-file",
  path.join(tlsDir, "ca.crt"),
  "--collector-client-cert-file",
  path.join(tlsDir, "agent-client.crt"),
  "--collector-client-key-file",
  path.join(tlsDir, "agent-client.key")
]));
assert.equal(tlsRollout.status, "dry-run");
assert.ok(tlsRollout.targets[0].commands.some((command) => command.step === "install-agent-tls-material"));
assert.equal(tlsRollout.targets[0].env.TURBALANCE_COLLECTOR_URL, "https://collector.example:9443/v1/source-bundles");
assert.equal(tlsRollout.targets[0].env.TURBALANCE_COLLECTOR_CA_FILE, path.join(tlsDir, "ca.crt"));

const controllerServicePlan = JSON.parse(runNode([
  "scripts/manage-product-controller-services.js",
  "--config",
  configPath,
  "--action",
  "install",
  "--mode",
  "user",
  "--env-path",
  path.join(tempDir, "controller.env"),
  "--unit-dir",
  path.join(tempDir, "systemd-user")
]));
assert.equal(controllerServicePlan.status, "dry-run");
assert.equal(controllerServicePlan.mode, "user");
assert.ok(controllerServicePlan.plan.some((step) => step.step === "install-turbalance-product-api.service"));
assert.ok(controllerServicePlan.plan.some((step) => step.step === "install-turbalance-product-collector.service"));
assert.ok(controllerServicePlan.plan.some((step) => step.step === "install-turbalance-product-dashboard.service"));
assert.ok(controllerServicePlan.plan.some((step) => step.step === "install-turbalance-product-live-fleet.service"));
assert.ok(controllerServicePlan.plan.some((step) => step.step === "enable-systemd-user-linger"));
assert.ok(controllerServicePlan.plan.some((step) => step.step === "stop-orphan-controller-processes"));
assert.ok(controllerServicePlan.plan.some((step) => step.command.includes("systemctl --user restart turbalance-product-api.service")));
assert.ok(controllerServicePlan.plan.every((step) => !step.command.includes(Buffer.from("test-token").toString("base64"))));

const securePrometheusConfig = fs.readFileSync(path.join(root, "deploy/docker/grafana-runtime/prometheus.secure.yml"), "utf8");
assert.ok(securePrometheusConfig.includes("authorization:"));
assert.ok(securePrometheusConfig.includes("credentials_file: /run/secrets/turbalance_api_viewer_token"));
const secureCompose = fs.readFileSync(path.join(root, "deploy/docker/grafana-runtime-compose.secure.yml"), "utf8");
assert.ok(secureCompose.includes("TURBALANCE_PROMETHEUS_API_TOKEN_FILE"));
assert.ok(secureCompose.includes("prometheus.secure.yml"));

const observabilityPlan = JSON.parse(runNode([
  "scripts/manage-product-observability.js",
  "--config",
  configPath,
  "--action",
  "up",
  "--secure",
  "true",
  "--prometheus-api-token-file",
  path.join(tempDir, "api-viewer-token"),
  "--timeout",
  "100"
]));
assert.equal(observabilityPlan.status, "dry-run");
assert.equal(observabilityPlan.securePrometheus, true);
assert.ok(observabilityPlan.composeFiles.some((file) => file.includes("grafana-runtime-compose.secure.yml")));
assert.ok(observabilityPlan.plan.some((step) => step.command.includes("docker compose")));
assert.ok(observabilityPlan.plan.some((step) => step.command.includes("TURBALANCE_GRAFANA_PUBLIC_URL=https://127.0.0.1:65510/grafana")));
assert.ok(observabilityPlan.plan.every((step) => !step.command.includes("api-viewer-token")));

const edgeTlsPlan = JSON.parse(runNode([
  "scripts/generate-product-edge-tls.js",
  "--config",
  configPath,
  "--out-dir",
  path.join(tempDir, "product-tls")
]));
assert.equal(edgeTlsPlan.status, "dry-run");
assert.ok(edgeTlsPlan.files.serverCert.endsWith("server.crt"));
assert.ok(edgeTlsPlan.files.clientCert.endsWith("agent-client.crt"));

const edgePlan = JSON.parse(runNode([
  "scripts/manage-product-edge.js",
  "--config",
  configPath,
  "--action",
  "up",
  "--tls-dir",
  path.join(tempDir, "product-tls"),
  "--timeout",
  "100"
]));
assert.equal(edgePlan.status, "dry-run");
assert.ok(edgePlan.plan.some((step) => step.step === "generate-product-edge-tls"));
assert.ok(edgePlan.plan.some((step) => step.step === "start-product-edge"));
assert.ok(edgePlan.checks.some((check) => check.name === "edge-grafana-health"));

const doctorReport = JSON.parse(runNode([
  "scripts/turbalance-doctor.js",
  "--config",
  configPath,
  "--no-fail",
  "--timeout",
  "250"
]));
assert.equal(doctorReport.status, "fail");
assert.ok(doctorReport.checks.some((check) => check.name === "product-api-version"));
assert.ok(doctorReport.checks.some((check) => check.name === "collector-version"));
assert.ok(doctorReport.checks.every((check) => !JSON.stringify(check).includes("test-token")));

const supportReport = JSON.parse(runNode([
  "scripts/turbalance-support-bundle.js",
  "--config",
  configPath,
  "--out-dir",
  supportDir,
  "--timeout",
  "250"
]));
assert.equal(supportReport.status, "written");
assert.ok(fs.existsSync(supportReport.archive));
assert.ok(supportReport.sizeBytes > 0);

const releaseReport = JSON.parse(runNode([
  "scripts/package-product-release.js",
  "--config",
  configPath,
  "--out-dir",
  releaseDir,
  "--name",
  "test-product-release",
  "--skip-tar"
]));
assert.equal(releaseReport.status, "packaged");
assert.equal(releaseReport.packageName, "test-product-release");
assert.equal(releaseReport.tarball, null);
const releaseManifest = JSON.parse(fs.readFileSync(path.join(releaseReport.stagingDir, "RELEASE-MANIFEST.json"), "utf8"));
assert.equal(releaseManifest.schemaVersion, "turba.product.release.v1");
assert.equal(releaseManifest.product.version, "9.9.9-test");
assert.ok(releaseManifest.files.includes("ROLLBACK.md"));
assert.ok(releaseManifest.commands.install.includes("scripts/manage-product-release.js"));
assert.ok(releaseManifest.commands.rollback.includes("--action rollback"));
assert.ok(releaseManifest.commands.controllerServices.includes("scripts/manage-product-controller-services.js"));
assert.ok(releaseManifest.commands.observability.includes("scripts/manage-product-observability.js"));
assert.ok(releaseManifest.commands.productEdge.includes("scripts/manage-product-edge.js"));
assert.ok(releaseManifest.files.includes("deploy/docker/grafana-runtime-compose.secure.yml"));
assert.ok(releaseManifest.files.includes("deploy/docker/grafana-runtime/prometheus.secure.yml"));
assert.ok(releaseManifest.files.includes("deploy/docker/product-edge-compose.yml"));
assert.ok(releaseManifest.files.includes("deploy/docker/product-edge/nginx.conf"));
const releaseChecksums = JSON.parse(fs.readFileSync(path.join(releaseReport.stagingDir, "checksums.json"), "utf8"));
assert.ok(releaseChecksums.files.some((file) => file.path === "app.js"));

const installReport = JSON.parse(runNode([
  "scripts/manage-product-release.js",
  "--action",
  "install",
  "--source",
  releaseReport.stagingDir,
  "--install-root",
  installRoot,
  "--apply"
]));
assert.equal(installReport.status, "applied");
assert.equal(installReport.packageName, "test-product-release");
assert.equal(installReport.previousPackage, "");
assert.ok(fs.existsSync(path.join(installRoot, "current", "RELEASE-MANIFEST.json")));

const secondReleaseReport = JSON.parse(runNode([
  "scripts/package-product-release.js",
  "--config",
  configPath,
  "--out-dir",
  releaseDir,
  "--name",
  "test-product-release-2",
  "--skip-tar"
]));
const updateReport = JSON.parse(runNode([
  "scripts/manage-product-release.js",
  "--action",
  "update",
  "--source",
  secondReleaseReport.stagingDir,
  "--install-root",
  installRoot,
  "--apply"
]));
assert.equal(updateReport.status, "applied");
assert.equal(updateReport.packageName, "test-product-release-2");
assert.equal(updateReport.previousPackage, "test-product-release");
assert.ok(fs.existsSync(updateReport.backup.archive));

const rollbackReport = JSON.parse(runNode([
  "scripts/manage-product-release.js",
  "--action",
  "rollback",
  "--install-root",
  installRoot,
  "--apply"
]));
assert.equal(rollbackReport.status, "applied");
assert.equal(rollbackReport.targetPackage, "test-product-release");
const releaseStatus = JSON.parse(runNode([
  "scripts/manage-product-release.js",
  "--action",
  "status",
  "--install-root",
  installRoot
]));
assert.equal(releaseStatus.current.packageName, "test-product-release");
assert.ok(releaseStatus.backups.length >= 2);

const secretReport = JSON.parse(runNode([
  "scripts/generate-product-secrets.js",
  "--config",
  configPath,
  "--out-dir",
  secretDir
]));
assert.equal(secretReport.status, "written");
assert.equal(secretReport.tenantId, "tenant-test");
assert.equal(secretReport.controllerEnv.TURBALANCE_COLLECTOR_TOKEN, "[REDACTED]");
assert.ok(fs.existsSync(path.join(secretDir, "controller-secure.env")));
assert.ok(fs.existsSync(path.join(secretDir, "agent-auth.env")));
const controllerSecureEnv = fs.readFileSync(path.join(secretDir, "controller-secure.env"), "utf8");
assert.ok(controllerSecureEnv.includes("TURBALANCE_API_REQUIRE_AUTH=true"));
assert.ok(controllerSecureEnv.includes("TURBALANCE_API_TOKENS_FILE="));
assert.ok(!JSON.stringify(secretReport).includes("collector_"));

const securityApplyDryRun = JSON.parse(runNode([
  "scripts/apply-product-security.js",
  "--config",
  configPath,
  "--secrets-dir",
  secretDir
]));
assert.equal(securityApplyDryRun.status, "dry-run");
assert.equal(securityApplyDryRun.plan.agentRollout, true);
assert.equal(securityApplyDryRun.plan.controllerRestart, true);
assert.ok(securityApplyDryRun.plan.groups.some((group) => group.name === "spark-user-agents"));
assert.ok(!JSON.stringify(securityApplyDryRun).includes("collector_"));

console.log("productization tests passed");
