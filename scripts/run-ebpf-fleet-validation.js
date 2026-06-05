#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    hostsFile: process.env.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json",
    out: "",
    dryRun: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--hosts-file") {
      args.hostsFile = need(arg, next);
      index += 1;
    } else if (arg === "--out") {
      args.out = need(arg, next);
      index += 1;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/run-ebpf-fleet-validation.js [--hosts-file <json>] [--dry-run]

Validates eBPF host readiness locally or through SSH commands described in the hosts file.`);
}

function loadHosts(file) {
  const fullPath = path.resolve(root, file);
  const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!Array.isArray(payload.hosts)) throw new Error(`${file} must contain a hosts array`);
  return payload.hosts;
}

function commandFor(host) {
  const probe = host.probeCommand || "";
  const strict = host.strict ? "--strict" : "";
  const nativeBuildMode = host.nativeBuildMode || process.env.TURBALANCE_EBPF_NATIVE_BUILD_MODE || "prebuilt";
  const validator = host.validatorCommand || "node /opt/turbalance/Analytics/scripts/validate-ebpf-agent-host.js";
  const probeArg = probe ? ` --probe-command ${quote(probe)}` : "";
  const nativeBuildModeArg = ` --native-build-mode ${quote(nativeBuildMode)}`;
  const command = `${validator}${strict ? ` ${strict}` : ""}${nativeBuildModeArg}${probeArg}`;
  if (isLocalHost(host.host)) {
    return {
      mode: "local",
      command: `node scripts/validate-ebpf-agent-host.js${strict ? ` ${strict}` : ""}${nativeBuildModeArg}${probeArg}`
    };
  }
  return {
    mode: "ssh",
    command: `${host.sshCommand || "ssh"} ${quote(host.host)} ${quote(command)}`
  };
}

function isLocalHost(host) {
  return !host || ["localhost", "127.0.0.1", "::1", "local"].includes(String(host));
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function runHost(host) {
  const command = commandFor(host);
  const result = spawnSync("sh", ["-lc", command.command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  let payload = null;
  try {
    payload = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    payload = null;
  }
  return {
    host: host.host || "localhost",
    mode: command.mode,
    command: command.command,
    ok: result.status === 0,
    status: result.status,
    stdout: payload || result.stdout,
    stderr: result.stderr
  };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, body);
  }
  process.stdout.write(body);
}

function main() {
  const args = parseArgs(process.argv);
  const hosts = loadHosts(args.hostsFile);
  if (args.dryRun) {
    write(args.out, {
      status: "dry-run",
      hosts: hosts.map((host) => ({ host: host.host || "localhost", ...commandFor(host) }))
    });
    return;
  }
  const results = hosts.map(runHost);
  const failed = results.filter((result) => !result.ok);
  write(args.out, { status: failed.length ? "failed" : "ok", results });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
