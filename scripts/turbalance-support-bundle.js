#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig,
  redactConfig
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "ops/turbalance-product.example.json";
const config = readProductConfig(configPath);
const outDir = path.resolve(root, args["out-dir"] || "build/support");
const remoteChecks = Boolean(args["remote-checks"]);
const timeoutMs = Number(args.timeout || 8000);

main();

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `turbalance-support-${stamp}-`));
  const bundleRoot = path.join(workDir, "turbalance-support");
  fs.mkdirSync(bundleRoot, { recursive: true });

  writeJson(path.join(bundleRoot, "manifest.json"), {
    product: config.product,
    generatedAt: new Date().toISOString(),
    redaction: "secret-like config keys and environment values are redacted",
    configPath,
    remoteChecks
  });
  writeJson(path.join(bundleRoot, "product-config.redacted.json"), redactConfig(config));
  writeJson(path.join(bundleRoot, "doctor-report.json"), runDoctor());
  writeText(path.join(bundleRoot, "git-status.txt"), runText("git", ["status", "--short"]));
  writeText(path.join(bundleRoot, "git-diff-stat.txt"), runText("git", ["diff", "--stat"]));
  writeText(path.join(bundleRoot, "docker-ps.txt"), runText("docker", ["ps", "--format", "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"]));
  writeText(path.join(bundleRoot, "controller-ports.txt"), runText("sh", ["-lc", "ss -ltnp 2>/dev/null | grep -E ':(8000|8080|8801|9091|3001)\\b' || true"]));
  writeText(path.join(bundleRoot, "runtime-files.txt"), runtimeFileSummary());
  copyIfExists(path.resolve(root, config.controller.liveBundlePath), path.join(bundleRoot, "live-machine-bundle.sample.json"), { maxBytes: 1024 * 1024 });

  if (remoteChecks) {
    const remoteDir = path.join(bundleRoot, "remote-agents");
    fs.mkdirSync(remoteDir, { recursive: true });
    for (const machine of config.fleet.machines.filter((item) => item.enabled && item.remote)) {
      writeText(path.join(remoteDir, `${safeFileName(machine.id)}.txt`), remoteSnapshot(machine));
    }
  }

  const archivePath = path.join(outDir, `turbalance-support-${stamp}.tar.gz`);
  const tar = spawnSync("tar", ["-czf", archivePath, "-C", workDir, "turbalance-support"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (tar.status !== 0) {
    throw new Error(`tar failed: ${tar.stderr}`);
  }

  const report = {
    status: "written",
    generatedAt: new Date().toISOString(),
    archive: archivePath,
    sizeBytes: fs.statSync(archivePath).size,
    remoteChecks
  };
  writeJson(path.join(outDir, `turbalance-support-${stamp}.json`), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function runDoctor() {
  const doctorArgs = [
    "scripts/turbalance-doctor.js",
    "--config",
    configPath,
    "--no-fail",
    "--timeout",
    String(timeoutMs)
  ];
  if (remoteChecks) doctorArgs.push("--remote-checks");
  const result = spawnSync(process.execPath, doctorArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
    timeout: timeoutMs * Math.max(2, config.fleet.machines.length)
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return {
      status: "failed",
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-4000)
    };
  }
}

function runtimeFileSummary() {
  const files = [
    "index.html",
    "app.js",
    "app-data.js",
    "app-core.js",
    "app-pipeline.js",
    "app-state.js",
    "app-render.js",
    "analytics-core.js",
    "predictive-core.js",
    "styles.css",
    "deploy/docker/product-edge-compose.yml",
    "deploy/docker/product-edge/nginx.conf",
    "deploy/docker/grafana-runtime-compose.yml",
    "deploy/docker/grafana-runtime-compose.secure.yml",
    "deploy/docker/grafana-runtime/prometheus.yml",
    "deploy/docker/grafana-runtime/prometheus.secure.yml",
    "build/product-runtime/observability-command.sh",
    "deploy/systemd/turbalance-live-machine-agent.service",
    "deploy/systemd/turbalance-live-machine-agent.env.example",
    config.controller.liveBundlePath
  ];
  return files.map((relativePath) => {
    const fullPath = path.resolve(root, relativePath);
    try {
      const stat = fs.statSync(fullPath);
      return `${relativePath}\t${stat.size}\t${stat.mtime.toISOString()}`;
    } catch (error) {
      return `${relativePath}\tmissing\t${error.message}`;
    }
  }).join("\n") + "\n";
}

function remoteSnapshot(machine) {
  const command = [
    "set +e",
    "echo '[identity]'",
    "hostname",
    "uname -a",
    "echo '[agent-system]'",
    "systemctl is-active turbalance-live-machine-agent.service 2>&1",
    "systemctl status turbalance-live-machine-agent.service --no-pager -n 20 2>&1",
    "echo '[agent-user]'",
    "systemctl --user is-active turbalance-live-machine-agent.service 2>&1",
    "systemctl --user status turbalance-live-machine-agent.service --no-pager -n 20 2>&1",
    "echo '[benchmark-system]'",
    "systemctl is-active turbalance-machine-benchmark.timer 2>&1",
    "systemctl status turbalance-machine-benchmark.timer --no-pager -n 10 2>&1",
    "echo '[benchmark-user]'",
    "systemctl --user is-active turbalance-machine-benchmark.timer 2>&1",
    "systemctl --user status turbalance-machine-benchmark.timer --no-pager -n 10 2>&1",
    "echo '[spool]'",
    "{ find /var/spool/turbalance/live-machine-agent \"$HOME/.local/state/turbalance/live-machine-agent/spool\" -maxdepth 1 -type f 2>/dev/null || true; } | wc -l",
    "echo '[env-system-redacted]'",
    "if [ -f /etc/turbalance/live-machine-agent.env ]; then sed -E 's/(TOKEN|SECRET|PASSWORD|KEY)=.*/\\1=[REDACTED]/' /etc/turbalance/live-machine-agent.env; else echo missing; fi",
    "echo '[env-user-redacted]'",
    "if [ -f \"$HOME/.config/turbalance/live-machine-agent.env\" ]; then sed -E 's/(TOKEN|SECRET|PASSWORD|KEY)=.*/\\1=[REDACTED]/' \"$HOME/.config/turbalance/live-machine-agent.env\"; else echo missing; fi"
  ].join("; ");
  const result = spawnSync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "StrictHostKeyChecking=accept-new",
    machine.remote,
    command
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: timeoutMs
  });
  return [
    `machine=${machine.id}`,
    `remote=${machine.remote}`,
    `role=${machine.role}`,
    `status=${result.status ?? -1}`,
    "--- stdout ---",
    redactText(result.stdout || ""),
    "--- stderr ---",
    redactText(result.stderr || "")
  ].join("\n");
}

function runText(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: timeoutMs
  });
  return redactText(`${result.stdout || ""}${result.stderr ? `\n--- stderr ---\n${result.stderr}` : ""}`);
}

function copyIfExists(source, target, { maxBytes }) {
  try {
    const stat = fs.statSync(source);
    if (stat.size > maxBytes) {
      writeText(target, JSON.stringify({ skipped: true, reason: `file exceeds ${maxBytes} bytes`, source, sizeBytes: stat.size }, null, 2));
      return;
    }
    fs.copyFileSync(source, target);
  } catch (error) {
    writeText(`${target}.missing.txt`, error.message);
  }
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, redactText(String(value || "")));
}

function redactText(value) {
  let text = String(value || "");
  for (const secret of [
    config.security.collectorToken,
    config.security.collectorHmacSecret
  ].filter(Boolean)) {
    text = text.split(secret).join("[REDACTED]");
  }
  text = text.replace(/(TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|HMAC|BEARER|AUTHORIZATION|KEY)=([^\n\r]*)/gi, "$1=[REDACTED]");
  return text;
}

function safeFileName(value) {
  return String(value || "machine").replace(/[^A-Za-z0-9_.-]+/g, "_");
}
