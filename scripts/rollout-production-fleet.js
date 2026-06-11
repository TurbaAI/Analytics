#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const DEFAULT_SPARK_REMOTES = ["user@192.168.10.20", "user@192.168.10.21"];
const PI_FLEET_REMOTES = Array.from({ length: 12 }, (_unused, index) => `pi@pi${index + 1}`);
const excludes = [
  ".git",
  "build",
  "node_modules",
  "frontend/react/node_modules",
  ".DS_Store",
  "__pycache__",
  "*.pyc"
];

const args = parseArgs(process.argv.slice(2));
const options = {
  apply: flagArg(args.apply),
  sync: args.sync === undefined ? true : flagArg(args.sync),
  installSystemd: args["install-systemd"] === undefined ? true : flagArg(args["install-systemd"]),
  systemdMode: normalizeSystemdMode(args["systemd-mode"] || process.env.TURBALANCE_SYSTEMD_MODE || "system"),
  restart: args.restart === undefined ? true : flagArg(args.restart),
  benchmarks: flagArg(args.benchmarks),
  otel: flagArg(args.otel),
  includeLocal: flagArg(args["include-local"]),
  remoteRoot: args["remote-root"] || process.env.TURBALANCE_REMOTE_ROOT || "/opt/turbalance/Analytics",
  collectorUrl: args["collector-url"] || process.env.TURBALANCE_COLLECTOR_URL || "http://192.168.10.30:8801/v1/source-bundles",
  hostUrl: args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.30:8000",
  tenantId: args["tenant-id"] || process.env.TURBALANCE_TENANT_ID || "dgx-lab",
  agentLoopMs: args["agent-loop-ms"] || process.env.TURBALANCE_AGENT_LOOP_MS || "1000",
  postTimeoutMs: args["post-timeout-ms"] || process.env.TURBALANCE_AGENT_POST_TIMEOUT_MS || "10000",
  commandTimeoutMs: Number(args["command-timeout-ms"] || process.env.TURBALANCE_ROLLOUT_COMMAND_TIMEOUT_MS || "60000"),
  productVersion: args["product-version"] || process.env.TURBALANCE_PRODUCT_VERSION || "0.1.0",
  deploymentEnvironment: args["deployment-environment"] || process.env.TURBALANCE_DEPLOYMENT_ENVIRONMENT || "pilot",
  token: args.token || secretEnv("TURBALANCE_COLLECTOR_TOKEN", "TURBALANCE_COLLECTOR_TOKEN_FILE"),
  hmacSecret: args["hmac-secret"] || secretEnv("TURBALANCE_COLLECTOR_HMAC_SECRET", "TURBALANCE_COLLECTOR_HMAC_SECRET_FILE"),
  collectorCaFile: args["collector-ca-file"] || process.env.TURBALANCE_COLLECTOR_CA_FILE || "",
  collectorClientCertFile: args["collector-client-cert-file"] || process.env.TURBALANCE_COLLECTOR_CLIENT_CERT_FILE || "",
  collectorClientKeyFile: args["collector-client-key-file"] || process.env.TURBALANCE_COLLECTOR_CLIENT_KEY_FILE || "",
  out: args.out || ""
};

main();

function main() {
  const targets = resolveTargets();
  const plan = targets.map((target) => buildTargetPlan(target));
  const report = {
    status: options.apply ? "applied" : "dry-run",
    generatedAt: new Date().toISOString(),
    remoteRoot: options.remoteRoot,
    collectorUrl: options.collectorUrl,
    hostUrl: options.hostUrl,
    options: {
      sync: options.sync,
      installSystemd: options.installSystemd,
      systemdMode: options.systemdMode,
      restart: options.restart,
      benchmarks: options.benchmarks,
      otel: options.otel,
      includeLocal: options.includeLocal
    },
    targets: plan.map(redactTargetPlan)
  };

  if (options.apply) {
    report.results = plan.map(applyTargetPlan);
    const failed = report.results.filter((target) => target.steps.some((step) => !step.ok));
    if (failed.length) {
      report.status = "failed";
      process.exitCode = 1;
    }
  }

  writeReport(report);
}

function resolveTargets() {
  const configured = arrayArg(args.remote || process.env.TURBALANCE_REMOTE_MACHINES || "");
  const targets = configured.length ? configured : [...DEFAULT_SPARK_REMOTES, ...PI_FLEET_REMOTES];
  return unique([
    ...(options.includeLocal ? ["local"] : []),
    ...targets
  ]).map((remote) => ({
    remote,
    local: remote === "local",
    role: targetRole(remote)
  }));
}

function buildTargetPlan(target) {
  const env = targetEnv(target);
  const userMode = targetSystemdMode(target) === "user";
  const commands = [];
  commands.push({
    step: "prepare-directories",
    command: target.local
      ? localPrepareCommand(target)
      : ssh(target.remote, userMode ? remoteUserPrepareCommand(target) : remotePrepareCommand())
  });
  if (options.sync && !target.local) {
    commands.push({
      step: "sync-repository",
      command: shellJoin(rsyncCommand(target.remote))
    });
  }
  const tlsMaterial = collectorTlsMaterial();
  if (tlsMaterial.length && !target.local) {
    commands.push({
      step: "install-agent-tls-material",
      command: ssh(target.remote, tlsMaterial.map((item) => installTextCommand(remoteTlsPath(item.value), fs.readFileSync(localTlsPath(item.value), "utf8"), item.mode, { sudo: !userMode })).join(" && "))
    });
  }
  if (options.installSystemd) {
    commands.push({
      step: "install-agent-env",
      command: target.local
        ? localInstallEnvCommand(target, env)
        : ssh(target.remote, installTextCommand(agentEnvPath(target), renderEnv(env), "600", { sudo: !userMode }))
    });
    for (const unit of systemdUnits(target)) {
      commands.push({
        step: `install-${path.basename(unit.path)}`,
        command: target.local
          ? localInstallFileCommand(target, unit.path, unit.content, "644")
          : ssh(target.remote, installTextCommand(unit.path, unit.content, "644", { sudo: !userMode }))
      });
    }
    commands.push({
      step: "systemd-reload",
      command: target.local ? systemdCommand(target, "daemon-reload") : ssh(target.remote, systemdCommand(target, "daemon-reload"))
    });
    if (options.restart) {
      commands.push({
        step: "stop-live-agent",
        command: target.local
          ? tolerantSystemdCommand(target, "stop turbalance-live-machine-agent.service")
          : ssh(target.remote, tolerantSystemdCommand(target, "stop turbalance-live-machine-agent.service"))
      });
      if (options.benchmarks || target.role === "pi") {
        commands.push({
          step: "stop-benchmark-service",
          command: target.local
            ? tolerantSystemdCommand(target, "stop turbalance-machine-benchmark.service")
            : ssh(target.remote, tolerantSystemdCommand(target, "stop turbalance-machine-benchmark.service"))
        });
      }
      commands.push({
        step: "stop-orphan-agent-processes",
        command: target.local
          ? killAgentProcessesCommand()
          : ssh(target.remote, killAgentProcessesCommand())
      });
      commands.push({
        step: "enable-live-agent",
        command: target.local
          ? systemdCommand(target, "enable --now turbalance-live-machine-agent.service")
          : ssh(target.remote, systemdCommand(target, "enable --now turbalance-live-machine-agent.service"))
      });
      commands.push({
        step: "restart-live-agent",
        command: target.local
          ? systemdCommand(target, "restart turbalance-live-machine-agent.service")
          : ssh(target.remote, systemdCommand(target, "restart turbalance-live-machine-agent.service"))
      });
      if (options.benchmarks || target.role === "pi") {
        commands.push({
          step: "enable-benchmark-timer",
          command: target.local
            ? systemdCommand(target, "enable --now turbalance-machine-benchmark.timer")
            : ssh(target.remote, systemdCommand(target, "enable --now turbalance-machine-benchmark.timer"))
        });
        commands.push({
          step: "restart-benchmark-timer",
          command: target.local
            ? systemdCommand(target, "restart turbalance-machine-benchmark.timer")
            : ssh(target.remote, systemdCommand(target, "restart turbalance-machine-benchmark.timer"))
        });
      }
    }
  }
  if (options.otel) {
    const profile = target.role === "spark" ? "--profile gpu " : "";
    commands.push({
      step: "start-otel-exporters",
      command: target.local
        ? `docker compose -f deploy/docker/fleet-observability-compose.yml ${profile}up -d`
        : ssh(target.remote, `cd ${quote(options.remoteRoot)} && sudo -n docker compose -f deploy/docker/fleet-observability-compose.yml ${profile}up -d`)
    });
  }
  return { ...target, env, commands };
}

function collectorTlsMaterial() {
  return [
    { value: options.collectorCaFile, mode: "644" },
    { value: options.collectorClientCertFile, mode: "644" },
    { value: options.collectorClientKeyFile, mode: "600" }
  ].filter((item) => item.value);
}

function localTlsPath(value) {
  return path.resolve(root, value);
}

function remoteTlsPath(value) {
  return path.posix.isAbsolute(value)
    ? value
    : path.posix.join(options.remoteRoot, value.split(path.sep).join(path.posix.sep));
}

function targetEnv(target) {
  const userMode = targetSystemdMode(target) === "user";
  const home = targetHome(target);
  const stateDir = userMode ? `${home}/.local/state/turbalance/live-machine-agent` : "/var/lib/turbalance/live-machine-agent";
  const spoolDir = userMode ? `${stateDir}/spool` : "/var/spool/turbalance/live-machine-agent";
  return {
    TURBALANCE_TENANT_ID: options.tenantId,
    TURBALANCE_HOST_ID: "",
    TURBALANCE_AGENT_ID: target.role === "pi" ? "pi-live-machine-push" : target.role === "spark" ? "spark-live-machine-push" : "nuc-live-machine-push",
    TURBALANCE_PRODUCT_VERSION: options.productVersion,
    TURBALANCE_COLLECTOR_URL: options.collectorUrl,
    TURBALANCE_MACHINE_DEMO_URL: options.hostUrl,
    TURBALANCE_AGENT_LOOP_MS: options.agentLoopMs,
    TURBALANCE_AGENT_POST_TIMEOUT_MS: options.postTimeoutMs,
    TURBALANCE_AGENT_SEQUENCE_PATH: `${stateDir}/sequence-no`,
    TURBALANCE_AGENT_SPOOL_DIR: spoolDir,
    TURBALANCE_AGENT_MAX_REPLAY: "25",
    TURBALANCE_COLLECTOR_TOKEN: options.token,
    TURBALANCE_COLLECTOR_HMAC_SECRET: options.hmacSecret,
    TURBALANCE_COLLECTOR_CA_FILE: options.collectorCaFile,
    TURBALANCE_COLLECTOR_CLIENT_CERT_FILE: options.collectorClientCertFile,
    TURBALANCE_COLLECTOR_CLIENT_KEY_FILE: options.collectorClientKeyFile,
    TURBALANCE_GPU_BACKEND: "auto",
    TURBALANCE_GPUSTAT_BIN: "",
    TURBALANCE_DGX_INTERCONNECT_INTERFACE: target.role === "spark" ? "enp1s0f1np1" : "",
    TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX: target.role === "spark" ? "192.168.100." : "",
    TURBALANCE_MACHINE_BENCHMARKS: options.benchmarks && target.role !== "pi" ? "1" : "0",
    TURBALANCE_PI_BENCHMARKS: target.role === "pi" ? "1" : "0",
    TURBALANCE_BENCHMARK_TTL_MS: "900000",
    TURBALANCE_BENCHMARK_DURATION_MS: target.role === "pi" ? "450" : "250",
    TURBALANCE_BENCHMARK_BUFFER_MIB: target.role === "pi" ? "8" : "16",
    TURBALANCE_BENCHMARK_DISK_MIB: target.role === "pi" ? "16" : "32",
    TURBALANCE_OTEL_FILE_STORAGE_DIR: userMode ? `${home}/.local/state/turbalance/otelcol/file_storage` : "/var/lib/turbalance/otelcol/file_storage",
    TURBALANCE_OTEL_HOST_INTERVAL: "10s",
    TURBALANCE_OTEL_DOCKER_INTERVAL: "15s",
    TURBALANCE_DEPLOYMENT_ENVIRONMENT: options.deploymentEnvironment
  };
}

function applyTargetPlan(targetPlan) {
  const steps = [];
  for (const command of targetPlan.commands) {
    const result = runCommand(command.command);
    steps.push({
      step: command.step,
      ok: result.status === 0,
      status: result.status ?? -1,
      signal: result.signal || "",
      timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
      stdout: result.stdout.slice(-4000),
      stderr: `${result.stderr || ""}${result.error ? `\n${result.error.message}` : ""}`.slice(-4000)
    });
    if (result.status !== 0) break;
  }
  return {
    remote: targetPlan.remote,
    role: targetPlan.role,
    steps
  };
}

function systemdUnits(target) {
  const fileNames = [
    "turbalance-live-machine-agent.service",
    "turbalance-machine-benchmark.service",
    "turbalance-machine-benchmark.timer"
  ];
  if (targetSystemdMode(target) !== "user") {
    return fileNames.map((fileName) => ({
      path: `/etc/systemd/system/${fileName}`,
      content: fs.readFileSync(path.join(root, "deploy", "systemd", fileName), "utf8")
    }));
  }
  return fileNames.map((fileName) => ({
    path: path.posix.join(userUnitDir(target), fileName),
    content: renderUserSystemdUnit(target, fileName)
  }));
}

function remotePrepareCommand() {
  const parent = path.posix.dirname(options.remoteRoot);
  return [
    "set -e",
    `sudo -n mkdir -p ${quote(options.remoteRoot)} ${quote(path.posix.join(options.remoteRoot, "build"))} /etc/turbalance /var/lib/turbalance/live-machine-agent /var/spool/turbalance/live-machine-agent /var/lib/node_exporter/textfile_collector /var/lib/turbalance/otelcol/file_storage`,
    `sudo -n chown -R "$USER":"$USER" ${quote(parent)}`,
    "sudo -n chmod 700 /var/lib/turbalance/live-machine-agent /var/spool/turbalance/live-machine-agent"
  ].join("; ");
}

function remoteUserPrepareCommand(target) {
  const env = targetEnv(target);
  const stateDir = path.posix.dirname(env.TURBALANCE_AGENT_SEQUENCE_PATH);
  return [
    "set -e",
    `mkdir -p ${quote(options.remoteRoot)} ${quote(path.posix.join(options.remoteRoot, "build"))} ${quote(path.posix.dirname(agentEnvPath(target)))} ${quote(userUnitDir(target))} ${quote(stateDir)} ${quote(env.TURBALANCE_AGENT_SPOOL_DIR)} ${quote(env.TURBALANCE_OTEL_FILE_STORAGE_DIR)} ${quote(path.posix.join(targetHome(target), ".local/share/turbalance/node-exporter-textfile"))}`,
    `chmod 700 ${quote(stateDir)} ${quote(env.TURBALANCE_AGENT_SPOOL_DIR)}`
  ].join("; ");
}

function localPrepareCommand(target) {
  if (targetSystemdMode(target) === "user") {
    return remoteUserPrepareCommand(target);
  }
  return [
    `sudo -n mkdir -p ${quote(path.join(options.remoteRoot, "build"))} /etc/turbalance /var/lib/turbalance/live-machine-agent /var/spool/turbalance/live-machine-agent /var/lib/node_exporter/textfile_collector /var/lib/turbalance/otelcol/file_storage`,
    "sudo -n chmod 700 /var/lib/turbalance/live-machine-agent /var/spool/turbalance/live-machine-agent"
  ].join(" && ");
}

function rsyncCommand(remote) {
  return [
    "rsync",
    "-az",
    "--timeout",
    "30",
    "-e",
    "ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=accept-new",
    ...excludes.flatMap((item) => ["--exclude", item]),
    `${root}/`,
    `${remote}:${options.remoteRoot}/`
  ];
}

function localInstallEnvCommand(target, env) {
  return installTextCommand(agentEnvPath(target), renderEnv(env), "600", { sudo: targetSystemdMode(target) !== "user" });
}

function localInstallFileCommand(target, filePath, content, mode) {
  return installTextCommand(filePath, content, mode, { sudo: targetSystemdMode(target) !== "user" });
}

function installTextCommand(filePath, content, mode, { sudo = true } = {}) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  if (!sudo) {
    return `mkdir -p ${quote(path.posix.dirname(filePath))} && printf %s ${quote(encoded)} | base64 -d > ${quote(filePath)} && chmod ${quote(mode)} ${quote(filePath)}`;
  }
  return `printf %s ${quote(encoded)} | base64 -d | sudo -n tee ${quote(filePath)} >/dev/null && sudo -n chmod ${quote(mode)} ${quote(filePath)}`;
}

function renderUserSystemdUnit(target, fileName) {
  const envPath = agentEnvPath(target);
  const workDir = options.remoteRoot;
  if (fileName === "turbalance-live-machine-agent.service") {
    return [
      "[Unit]",
      "Description=Turbalance live machine telemetry push agent",
      "After=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      `EnvironmentFile=-${envPath}`,
      `WorkingDirectory=${workDir}`,
      `ExecStart=/usr/bin/env node ${workDir}/scripts/push-live-machine-telemetry.js`,
      "Restart=always",
      "RestartSec=5",
      "TimeoutStopSec=20",
      "KillSignal=SIGINT",
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      "",
      "[Install]",
      "WantedBy=default.target",
      ""
    ].join("\n");
  }
  if (fileName === "turbalance-machine-benchmark.service") {
    return [
      "[Unit]",
      "Description=Turbalance scheduled machine benchmark publisher",
      "After=network-online.target",
      "",
      "[Service]",
      "Type=oneshot",
      `EnvironmentFile=-${envPath}`,
      `WorkingDirectory=${workDir}`,
      `ExecStart=/usr/bin/env node ${workDir}/scripts/push-live-machine-telemetry.js --benchmark-suite 1 --fast-refresh 1 --ollama-probe 0`,
      "Nice=10",
      "IOSchedulingClass=best-effort",
      "IOSchedulingPriority=7",
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      ""
    ].join("\n");
  }
  return fs.readFileSync(path.join(root, "deploy", "systemd", fileName), "utf8");
}

function systemdCommand(target, command) {
  return targetSystemdMode(target) === "user" ? `systemctl --user ${command}` : `sudo -n systemctl ${command}`;
}

function tolerantSystemdCommand(target, command) {
  return `${systemdCommand(target, command)} || true`;
}

function killAgentProcessesCommand() {
  return "pkill -f '[p]ush-live-machine-telemetry.js' || true";
}

function targetSystemdMode() {
  return options.systemdMode;
}

function agentEnvPath(target) {
  return targetSystemdMode(target) === "user"
    ? path.posix.join(targetHome(target), ".config/turbalance/live-machine-agent.env")
    : "/etc/turbalance/live-machine-agent.env";
}

function userUnitDir(target) {
  return path.posix.join(targetHome(target), ".config/systemd/user");
}

function targetHome(target) {
  if (target.local) return process.env.HOME || "/tmp";
  const user = String(target.remote || "").split("@")[0];
  return user ? `/home/${user}` : "$HOME";
}

function renderEnv(env) {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${shellEnvValue(value)}`)
    .join("\n") + "\n";
}

function shellEnvValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return `"${text.replace(/["\\$`]/g, "\\$&")}"`;
}

function ssh(remote, command) {
  return `ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=accept-new ${quote(remote)} ${quote(command)}`;
}

function shellJoin(argv) {
  return argv.map(quote).join(" ");
}

function runCommand(command) {
  return spawnSync("sh", ["-lc", command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.commandTimeoutMs
  });
}

function redactTargetPlan(plan) {
  return {
    remote: plan.remote,
    role: plan.role,
    env: redactEnv(plan.env),
    commands: plan.commands.map((command) => ({
      ...command,
      command: redactSecrets(command.command)
    }))
  };
}

function redactEnv(env) {
  const redacted = {};
  for (const [key, value] of Object.entries(env)) {
    redacted[key] = /TOKEN|SECRET|AUTHORIZATION|PASSWORD|KEY/i.test(key) && value ? "[REDACTED]" : value;
  }
  return redacted;
}

function redactSecrets(value) {
  let text = String(value);
  for (const secret of [options.token, options.hmacSecret].filter(Boolean)) {
    text = text.split(secret).join("[REDACTED]");
    text = text.split(Buffer.from(secret, "utf8").toString("base64")).join("[REDACTED]");
  }
  return text;
}

function writeReport(report) {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const fullPath = path.resolve(root, options.out);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
  }
  process.stdout.write(body);
}

function targetRole(remote) {
  const host = remote === "local" ? "nuc" : String(remote).split("@").pop();
  if (/^pi(?:[1-9]|1[0-2])$/i.test(host)) return "pi";
  if (/192\.168\.10\.(20|21)$/.test(host) || /^spark/i.test(host)) return "spark";
  return "nuc";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else if (parsed[key] === undefined) {
      parsed[key] = next;
      index += 1;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(next);
      index += 1;
    } else {
      parsed[key] = [parsed[key], next];
      index += 1;
    }
  }
  return parsed;
}

function arrayArg(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}

function flagArg(value) {
  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function normalizeSystemdMode(value) {
  const mode = String(value || "system").toLowerCase();
  return mode === "user" ? "user" : "system";
}

function secretEnv(valueName, fileName) {
  const direct = process.env[valueName] || "";
  if (direct) return direct;
  const filePath = process.env[fileName] || "";
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
