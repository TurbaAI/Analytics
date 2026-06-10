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
  restart: args.restart === undefined ? true : flagArg(args.restart),
  benchmarks: flagArg(args.benchmarks),
  otel: flagArg(args.otel),
  includeLocal: flagArg(args["include-local"]),
  remoteRoot: args["remote-root"] || process.env.TURBALANCE_REMOTE_ROOT || "/opt/turbalance/Analytics",
  collectorUrl: args["collector-url"] || process.env.TURBALANCE_COLLECTOR_URL || "http://192.168.10.30:8801/v1/source-bundles",
  hostUrl: args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "http://192.168.10.30:8000",
  tenantId: args["tenant-id"] || process.env.TURBALANCE_TENANT_ID || "dgx-lab",
  agentLoopMs: args["agent-loop-ms"] || process.env.TURBALANCE_AGENT_LOOP_MS || "5000",
  postTimeoutMs: args["post-timeout-ms"] || process.env.TURBALANCE_AGENT_POST_TIMEOUT_MS || "10000",
  commandTimeoutMs: Number(args["command-timeout-ms"] || process.env.TURBALANCE_ROLLOUT_COMMAND_TIMEOUT_MS || "60000"),
  token: args.token || process.env.TURBALANCE_COLLECTOR_TOKEN || "",
  hmacSecret: args["hmac-secret"] || process.env.TURBALANCE_COLLECTOR_HMAC_SECRET || "",
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
  const commands = [];
  commands.push({
    step: "prepare-directories",
    command: target.local ? localPrepareCommand() : ssh(target.remote, remotePrepareCommand())
  });
  if (options.sync && !target.local) {
    commands.push({
      step: "sync-repository",
      command: shellJoin(rsyncCommand(target.remote))
    });
  }
  if (options.installSystemd) {
    commands.push({
      step: "install-agent-env",
      command: target.local ? localInstallEnvCommand(env) : ssh(target.remote, installTextCommand("/etc/turbalance/live-machine-agent.env", renderEnv(env), "600"))
    });
    for (const unit of systemdUnits()) {
      commands.push({
        step: `install-${path.basename(unit.path)}`,
        command: target.local ? localInstallFileCommand(unit.path, unit.content, "644") : ssh(target.remote, installTextCommand(unit.path, unit.content, "644"))
      });
    }
    commands.push({
      step: "systemd-reload",
      command: target.local ? "sudo -n systemctl daemon-reload" : ssh(target.remote, "sudo -n systemctl daemon-reload")
    });
    if (options.restart) {
      commands.push({
        step: "enable-live-agent",
        command: target.local
          ? "sudo -n systemctl enable --now turbalance-live-machine-agent.service"
          : ssh(target.remote, "sudo -n systemctl enable --now turbalance-live-machine-agent.service")
      });
      if (options.benchmarks || target.role === "pi") {
        commands.push({
          step: "enable-benchmark-timer",
          command: target.local
            ? "sudo -n systemctl enable --now turbalance-machine-benchmark.timer"
            : ssh(target.remote, "sudo -n systemctl enable --now turbalance-machine-benchmark.timer")
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

function targetEnv(target) {
  return {
    TURBALANCE_TENANT_ID: options.tenantId,
    TURBALANCE_HOST_ID: "",
    TURBALANCE_AGENT_ID: target.role === "pi" ? "pi-live-machine-push" : target.role === "spark" ? "spark-live-machine-push" : "nuc-live-machine-push",
    TURBALANCE_COLLECTOR_URL: options.collectorUrl,
    TURBALANCE_MACHINE_DEMO_URL: options.hostUrl,
    TURBALANCE_AGENT_LOOP_MS: options.agentLoopMs,
    TURBALANCE_AGENT_POST_TIMEOUT_MS: options.postTimeoutMs,
    TURBALANCE_AGENT_SEQUENCE_PATH: "/var/lib/turbalance/live-machine-agent/sequence-no",
    TURBALANCE_AGENT_SPOOL_DIR: "/var/spool/turbalance/live-machine-agent",
    TURBALANCE_AGENT_MAX_REPLAY: "25",
    TURBALANCE_COLLECTOR_TOKEN: options.token,
    TURBALANCE_COLLECTOR_HMAC_SECRET: options.hmacSecret,
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
    TURBALANCE_OTEL_FILE_STORAGE_DIR: "/var/lib/turbalance/otelcol/file_storage",
    TURBALANCE_OTEL_HOST_INTERVAL: "10s",
    TURBALANCE_OTEL_DOCKER_INTERVAL: "15s",
    TURBALANCE_DEPLOYMENT_ENVIRONMENT: "lab"
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

function systemdUnits() {
  return [
    "turbalance-live-machine-agent.service",
    "turbalance-machine-benchmark.service",
    "turbalance-machine-benchmark.timer"
  ].map((fileName) => ({
    path: `/etc/systemd/system/${fileName}`,
    content: fs.readFileSync(path.join(root, "deploy", "systemd", fileName), "utf8")
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

function localPrepareCommand() {
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

function localInstallEnvCommand(env) {
  return installTextCommand("/etc/turbalance/live-machine-agent.env", renderEnv(env), "600");
}

function localInstallFileCommand(filePath, content, mode) {
  return installTextCommand(filePath, content, mode);
}

function installTextCommand(filePath, content, mode) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  return `printf %s ${quote(encoded)} | base64 -d | sudo -n tee ${quote(filePath)} >/dev/null && sudo -n chmod ${quote(mode)} ${quote(filePath)}`;
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

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
