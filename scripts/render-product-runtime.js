#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  parseArgs,
  readProductConfig,
  redactConfig,
  renderEnv
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const config = readProductConfig(args.config || "ops/turbalance-product.example.json");
const outDir = path.resolve(root, args["out-dir"] || "build/product-runtime");
const includeSecrets = Boolean(args["include-secrets"]);

main();

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "agents"), { recursive: true });

  const controllerEnv = buildControllerEnv(config);
  const agentEnvs = config.fleet.machines
    .filter((machine) => machine.enabled)
    .map((machine) => ({ machine, env: buildAgentEnv(config, machine) }));

  writeFile("controller.env", renderEnv(controllerEnv));
  writeFile("fleet-remotes.txt", agentEnvs.map(({ machine }) => machine.remote).filter(Boolean).join("\n") + "\n");
  writeFile("rollout-command.sh", renderRolloutCommand(config, agentEnvs));
  writeFile("controller-services-command.sh", renderControllerServicesCommand(args.config || "ops/turbalance-product.example.json"));
  writeFile("observability-command.sh", renderObservabilityCommand(args.config || "ops/turbalance-product.example.json"));
  writeFile("product-edge-command.sh", renderProductEdgeCommand(args.config || "ops/turbalance-product.example.json"));
  writeFile("doctor-command.sh", renderDoctorCommand(args.config || "ops/turbalance-product.example.json"));
  writeFile("support-bundle-command.sh", renderSupportBundleCommand(args.config || "ops/turbalance-product.example.json"));

  for (const { machine, env } of agentEnvs) {
    writeFile(path.join("agents", `${safeFileName(machine.id)}.env`), renderEnv(env));
  }

  const report = {
    status: "rendered",
    generatedAt: new Date().toISOString(),
    outDir,
    config: redactConfig(config),
    artifacts: {
      controllerEnv: path.join(outDir, "controller.env"),
      fleetRemotes: path.join(outDir, "fleet-remotes.txt"),
      rolloutCommand: path.join(outDir, "rollout-command.sh"),
      controllerServicesCommand: path.join(outDir, "controller-services-command.sh"),
      observabilityCommand: path.join(outDir, "observability-command.sh"),
      productEdgeCommand: path.join(outDir, "product-edge-command.sh"),
      doctorCommand: path.join(outDir, "doctor-command.sh"),
      supportBundleCommand: path.join(outDir, "support-bundle-command.sh"),
      agentEnvDir: path.join(outDir, "agents")
    },
    summary: {
      enabledMachines: agentEnvs.length,
      piMachines: agentEnvs.filter(({ machine }) => machine.role === "pi").length,
      sparkMachines: agentEnvs.filter(({ machine }) => machine.role === "spark").length,
      collectorAuthConfigured: Boolean(config.security.collectorToken || config.security.collectorHmacSecret || config.security.collectorTokenFile || config.security.collectorHmacSecretFile),
      apiAuthRequired: config.security.requireApiAuth,
      tlsMode: config.security.tlsMode
    },
    warnings: productWarnings(config)
  };
  writeFile("product-runtime-report.json", `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function buildControllerEnv(config) {
  return redactMaybe({
    TURBALANCE_PRODUCT_NAME: config.product.name,
    TURBALANCE_PRODUCT_VERSION: config.product.version,
    TURBALANCE_DEPLOYMENT_ENVIRONMENT: config.product.environment,
    TURBALANCE_TENANT_ID: config.fleet.tenantId,
    TURBALANCE_CONTROLLER_HOST: config.controller.host,
    TURBALANCE_STATIC_URL: config.controller.staticUrl,
    TURBALANCE_MACHINE_DEMO_URL: config.controller.staticUrl,
    TURBALANCE_API_URL: config.controller.apiUrl,
    TURBALANCE_COLLECTOR_URL: config.controller.collectorUrl,
    TURBALANCE_LAKE_ROOT: config.controller.lakeRoot,
    TURBALANCE_LIVE_MACHINE_BUNDLE: config.controller.liveBundlePath,
    TURBALANCE_LIVE_FLEET_LOOP_MS: config.controller.loopMs,
    TURBALANCE_TRANSFORM_INTERVAL_MS: config.controller.transformIntervalMs,
    TURBALANCE_RETENTION_DAYS: config.controller.dataRetentionDays,
    TURBALANCE_API_REQUIRE_AUTH: config.security.requireApiAuth ? "true" : "false",
    TURBALANCE_API_TOKENS_FILE: config.security.apiTokensFile,
    TURBALANCE_CORS_ORIGINS: config.security.allowedCorsOrigins.join(","),
    TURBALANCE_COLLECTOR_TOKEN: config.security.collectorToken,
    TURBALANCE_COLLECTOR_TOKEN_FILE: config.security.collectorTokenFile,
    TURBALANCE_COLLECTOR_HMAC_SECRET: config.security.collectorHmacSecret,
    TURBALANCE_COLLECTOR_HMAC_SECRET_FILE: config.security.collectorHmacSecretFile,
    TURBALANCE_GRAFANA_PUBLIC_URL: config.observability.grafanaPublicUrl || config.observability.grafanaUrl,
    TURBALANCE_PROMETHEUS_URL: config.observability.prometheusUrl,
    TURBALANCE_OTEL_EXPORTER_OTLP_ENDPOINT: config.observability.otelEndpoint
  });
}

function buildAgentEnv(config, machine) {
  return redactMaybe({
    TURBALANCE_PRODUCT_VERSION: config.product.version,
    TURBALANCE_DEPLOYMENT_ENVIRONMENT: config.product.environment,
    TURBALANCE_TENANT_ID: machine.tenantId,
    TURBALANCE_HOST_ID: machine.hostId,
    TURBALANCE_AGENT_ID: `${machine.id}-live-machine-push`,
    TURBALANCE_COLLECTOR_URL: config.controller.collectorUrl,
    TURBALANCE_MACHINE_DEMO_URL: config.controller.staticUrl,
    TURBALANCE_AGENT_LOOP_MS: config.fleet.agentLoopMs,
    TURBALANCE_AGENT_POST_TIMEOUT_MS: config.fleet.postTimeoutMs,
    TURBALANCE_AGENT_SEQUENCE_PATH: "/var/lib/turbalance/live-machine-agent/sequence-no",
    TURBALANCE_AGENT_SPOOL_DIR: "/var/spool/turbalance/live-machine-agent",
    TURBALANCE_AGENT_MAX_REPLAY: "25",
    TURBALANCE_COLLECTOR_TOKEN: config.security.collectorToken,
    TURBALANCE_COLLECTOR_TOKEN_FILE: config.security.collectorTokenFile,
    TURBALANCE_COLLECTOR_HMAC_SECRET: config.security.collectorHmacSecret,
    TURBALANCE_COLLECTOR_HMAC_SECRET_FILE: config.security.collectorHmacSecretFile,
    TURBALANCE_COLLECTOR_CA_FILE: config.security.tlsCaFile,
    TURBALANCE_COLLECTOR_CLIENT_CERT_FILE: config.security.collectorClientCertFile,
    TURBALANCE_COLLECTOR_CLIENT_KEY_FILE: config.security.collectorClientKeyFile,
    TURBALANCE_GPU_BACKEND: machine.gpuBackend,
    TURBALANCE_GPUSTAT_BIN: machine.gpustatBin,
    TURBALANCE_LIVE_NETWORK_INTERFACE: machine.networkInterface,
    TURBALANCE_DGX_INTERCONNECT_INTERFACE: machine.dgxInterconnectInterface,
    TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX: machine.dgxInterconnectSubnetPrefix,
    TURBALANCE_MACHINE_BENCHMARKS: machine.benchmarks && machine.role !== "pi" ? "1" : "0",
    TURBALANCE_PI_BENCHMARKS: machine.benchmarks && machine.role === "pi" ? "1" : "0",
    TURBALANCE_BENCHMARK_TTL_MS: "900000",
    TURBALANCE_BENCHMARK_DURATION_MS: machine.role === "pi" ? "450" : "250",
    TURBALANCE_BENCHMARK_BUFFER_MIB: machine.role === "pi" ? "8" : "16",
    TURBALANCE_BENCHMARK_DISK_MIB: machine.role === "pi" ? "16" : "32"
  });
}

function renderRolloutCommand(config, agentEnvs) {
  const remotes = agentEnvs.map(({ machine }) => machine.remote).filter(Boolean);
  const hasBenchmarks = agentEnvs.some(({ machine }) => machine.benchmarks);
  const useEdgeTls = config.security.tlsMode !== "lab-http";
  const command = [
    "node scripts/rollout-production-fleet.js",
    "--apply",
    `--remote-root ${shellQuote(config.fleet.defaultRemoteRoot)}`,
    `--collector-url ${shellQuote(config.controller.collectorUrl)}`,
    `--host-url ${shellQuote(config.controller.staticUrl)}`,
    `--tenant-id ${shellQuote(config.fleet.tenantId)}`,
    `--product-version ${shellQuote(config.product.version)}`,
    `--deployment-environment ${shellQuote(config.product.environment)}`,
    `--agent-loop-ms ${shellQuote(config.fleet.agentLoopMs)}`,
    `--post-timeout-ms ${shellQuote(config.fleet.postTimeoutMs)}`,
    useEdgeTls && config.security.tlsCaFile ? `--collector-ca-file ${shellQuote(config.security.tlsCaFile)}` : "",
    useEdgeTls && config.security.collectorClientCertFile ? `--collector-client-cert-file ${shellQuote(config.security.collectorClientCertFile)}` : "",
    useEdgeTls && config.security.collectorClientKeyFile ? `--collector-client-key-file ${shellQuote(config.security.collectorClientKeyFile)}` : "",
    hasBenchmarks ? "--benchmarks" : "",
    ...remotes.map((remote) => `--remote ${shellQuote(remote)}`)
  ].filter(Boolean).join(" \\\n  ");
  return `#!/usr/bin/env sh\nset -eu\n${command}\n`;
}

function renderDoctorCommand(configPath) {
  return `#!/usr/bin/env sh\nset -eu\nnode scripts/turbalance-doctor.js --config ${shellQuote(configPath)} --remote-checks --out build/product-runtime/doctor-report.json\n`;
}

function renderControllerServicesCommand(configPath) {
  return `#!/usr/bin/env sh\nset -eu\nnode scripts/manage-product-controller-services.js --config ${shellQuote(configPath)} --action install --mode user --apply\n`;
}

function renderObservabilityCommand(configPath) {
  return `#!/usr/bin/env sh\nset -eu\nnode scripts/manage-product-observability.js --config ${shellQuote(configPath)} --action up --secure auto --apply\n`;
}

function renderProductEdgeCommand(configPath) {
  return `#!/usr/bin/env sh\nset -eu\nnode scripts/manage-product-edge.js --config ${shellQuote(configPath)} --action up --apply\n`;
}

function renderSupportBundleCommand(configPath) {
  return `#!/usr/bin/env sh\nset -eu\nnode scripts/turbalance-support-bundle.js --config ${shellQuote(configPath)} --remote-checks --out-dir build/support\n`;
}

function productWarnings(config) {
  const warnings = [];
  if (config.security.tlsMode === "lab-http") warnings.push("TLS is set to lab-http; customer deployments should terminate HTTPS or use mTLS.");
  if (!config.security.requireApiAuth) warnings.push("API auth is disabled; enable TURBALANCE_API_REQUIRE_AUTH before customer access.");
  if (!(config.security.collectorToken || config.security.collectorHmacSecret || config.security.collectorTokenFile || config.security.collectorHmacSecretFile)) {
    warnings.push("Collector auth is empty; configure a bearer token or HMAC secret before customer traffic.");
  }
  return warnings;
}

function redactMaybe(env) {
  if (includeSecrets) return env;
  const redacted = { ...env };
  for (const key of Object.keys(redacted)) {
    if (isSensitiveEnvKey(key) && redacted[key]) redacted[key] = "[REDACTED]";
  }
  return redacted;
}

function isSensitiveEnvKey(key) {
  return /TOKEN|SECRET|PASSWORD|KEY/i.test(key) && !/_FILE$/i.test(key);
}

function writeFile(relativePath, body) {
  const fullPath = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, body);
  if (/\.sh$/.test(relativePath)) fs.chmodSync(fullPath, 0o755);
}

function safeFileName(value) {
  return String(value || "machine").replace(/[^A-Za-z0-9_.-]+/g, "_");
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
