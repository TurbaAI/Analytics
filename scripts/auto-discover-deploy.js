#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const options = {
  apply: flagArg(args.apply),
  scan: args.scan === undefined ? true : flagArg(args.scan),
  subnet: args.subnet || process.env.TURBALANCE_DISCOVERY_SUBNET || "192.168.10.0/24",
  range: args.range || process.env.TURBALANCE_DISCOVERY_RANGE || "1-254",
  port: Number(args.port || process.env.TURBALANCE_DISCOVERY_SSH_PORT || "22"),
  user: args.user || process.env.TURBALANCE_DISCOVERY_USER || "",
  credentialsFile: args["credentials-file"] || process.env.TURBALANCE_DISCOVERY_CREDENTIALS_FILE || "",
  liveBundle: args["live-bundle"] || process.env.TURBALANCE_LIVE_MACHINE_BUNDLE || "build/demo/live-machine-bundle.json",
  probeTimeoutMs: Number(args["probe-timeout-ms"] || process.env.TURBALANCE_DISCOVERY_PROBE_TIMEOUT_MS || "220"),
  sshTimeoutSeconds: Number(args["ssh-timeout-seconds"] || process.env.TURBALANCE_DISCOVERY_SSH_TIMEOUT_SECONDS || "5"),
  concurrency: Number(args.concurrency || process.env.TURBALANCE_DISCOVERY_CONCURRENCY || "32"),
  collectorUrl: args["collector-url"] || process.env.TURBALANCE_COLLECTOR_URL || "",
  hostUrl: args["host-url"] || process.env.TURBALANCE_MACHINE_DEMO_URL || "",
  remoteRoot: args["remote-root"] || process.env.TURBALANCE_REMOTE_ROOT || "/opt/turbalance/Analytics",
  systemdMode: args["systemd-mode"] || process.env.TURBALANCE_SYSTEMD_MODE || "system",
  tenantId: args["tenant-id"] || process.env.TURBALANCE_TENANT_ID || "dgx-lab",
  benchmarks: args.benchmarks === undefined ? true : flagArg(args.benchmarks),
  otel: flagArg(args.otel),
  includeMonitored: args["include-monitored"] === undefined ? false : flagArg(args["include-monitored"]),
  out: args.out || process.env.TURBALANCE_DISCOVERY_DEPLOY_REPORT || "build/auto-discovery/latest-report.json",
  rolloutScript: args["rollout-script"] || "scripts/rollout-production-fleet.js"
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

async function main() {
  const credentialConfig = loadCredentialConfig(options.credentialsFile);
  const knownRemotes = [
    ...arrayArg(args.remote || process.env.TURBALANCE_DISCOVERY_REMOTES || ""),
    ...credentialConfig.hosts.map((host) => host.remote).filter(Boolean)
  ];
  const discoveredHosts = options.scan
    ? await scanSubnet(options.subnet, options.range, options.port, options.probeTimeoutMs, options.concurrency)
    : [];
  const forcedHosts = arrayArg(args["discovered-host"] || args.host || "");
  const knownRemoteHosts = knownRemotes.map(remoteHost).filter(Boolean);
  const candidateHosts = unique([...discoveredHosts, ...forcedHosts, ...knownRemoteHosts]).sort(naturalIpSort);
  const monitored = monitoredHosts(options.liveBundle);
  const candidates = candidateHosts.map((host) => candidateForHost(host, credentialConfig, knownRemotes, monitored));
  const eligible = candidates.filter((candidate) => candidate.deploymentEligible);
  const rollout = eligible.length ? runRollout(eligible.map((candidate) => candidate.remote)) : null;
  const report = {
    status: options.apply
      ? eligible.length && rollout?.ok ? "applied" : eligible.length ? "failed" : "blocked"
      : "dry-run",
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    subnet: options.subnet,
    port: options.port,
    scanEnabled: options.scan,
    credentialsFile: options.credentialsFile ? redactPath(options.credentialsFile) : "",
    liveBundle: options.liveBundle,
    summary: {
      discoveredHosts: discoveredHosts.length,
      candidateHosts: candidates.length,
      credentialedHosts: candidates.filter((candidate) => candidate.credentialStatus === "ok").length,
      monitoredHosts: candidates.filter((candidate) => candidate.alreadyMonitored).length,
      deploymentEligibleHosts: eligible.length
    },
    commands: {
      dryRun: renderSelfCommand(false),
      apply: renderSelfCommand(true)
    },
    candidates,
    rollout
  };

  writeReport(report);
  if (report.status === "failed") process.exitCode = 1;
}

function candidateForHost(host, credentialConfig, knownRemotes, monitored) {
  const configured = credentialForHost(host, credentialConfig, knownRemotes);
  const remote = configured.remote || (options.user ? `${options.user}@${host}` : "");
  const alreadyMonitored = monitored.has(normalizeHost(host)) || monitored.has(normalizeHost(configured.hostname));
  const credential = remote ? checkSshCredential(remote) : { status: "missing", detail: "No user/remote mapping" };
  const deploymentEligible = credential.status === "ok" && (!alreadyMonitored || options.includeMonitored);
  return {
    host,
    hostname: configured.hostname || "",
    remote,
    role: configured.role || targetRole(host, configured.hostname),
    discovered: true,
    alreadyMonitored,
    credentialStatus: credential.status,
    credentialDetail: credential.detail,
    deploymentEligible,
    deploymentPlan: deploymentEligible
      ? "install-or-refresh-live-machine-agent"
      : alreadyMonitored && !options.includeMonitored
        ? "skip-already-monitored"
        : "skip-no-credential"
  };
}

function loadCredentialConfig(filePath) {
  const config = {
    defaults: {},
    hosts: []
  };
  if (!filePath) return config;
  const fullPath = path.resolve(root, filePath);
  if (!fs.existsSync(fullPath)) return config;
  const body = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  config.defaults = body.defaults || {};
  config.hosts = (body.hosts || body.credentials || []).map((entry) => {
    const host = String(entry.host || remoteHost(entry.remote) || "").trim();
    const user = entry.user || config.defaults.user || options.user || "";
    const remote = entry.remote || (user && host ? `${user}@${host}` : "");
    return {
      host,
      hostname: entry.hostname || "",
      remote,
      role: entry.role || "",
      labels: entry.labels || {}
    };
  }).filter((entry) => entry.host || entry.remote);
  return config;
}

function credentialForHost(host, credentialConfig, knownRemotes) {
  const normalizedHost = normalizeHost(host);
  const entry = credentialConfig.hosts.find((item) => (
    normalizeHost(item.host) === normalizedHost
    || normalizeHost(item.hostname) === normalizedHost
    || normalizeHost(remoteHost(item.remote)) === normalizedHost
  ));
  if (entry) return entry;
  const remote = knownRemotes.find((item) => normalizeHost(remoteHost(item)) === normalizedHost);
  if (remote) return { remote, host, hostname: "", role: "" };
  return { host, hostname: "", remote: options.user ? `${options.user}@${host}` : "", role: "" };
}

function checkSshCredential(remote) {
  const result = spawnSync("ssh", [
    "-o", "BatchMode=yes",
    "-o", `ConnectTimeout=${Math.max(1, options.sshTimeoutSeconds)}`,
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=1",
    "-o", "StrictHostKeyChecking=accept-new",
    "-p", String(options.port),
    remote,
    "printf turbalance-ssh-ok"
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: Math.max(2000, options.sshTimeoutSeconds * 1000 + 1000),
    maxBuffer: 1024 * 1024
  });
  if (result.status === 0 && /turbalance-ssh-ok/.test(result.stdout)) {
    return { status: "ok", detail: "BatchMode SSH accepted" };
  }
  const stderr = `${result.stderr || ""}${result.error ? ` ${result.error.message}` : ""}`.trim();
  return {
    status: "missing",
    detail: stderr ? stderr.slice(-240) : `SSH exited ${result.status ?? "unknown"}`
  };
}

function runRollout(remotes) {
  const argv = [
    options.rolloutScript,
    "--remote",
    remotes.join(","),
    "--remote-root",
    options.remoteRoot,
    "--systemd-mode",
    options.systemdMode,
    "--tenant-id",
    options.tenantId,
    "--out",
    "build/auto-discovery/rollout-report.json"
  ];
  if (options.collectorUrl) argv.push("--collector-url", options.collectorUrl);
  if (options.hostUrl) argv.push("--host-url", options.hostUrl);
  if (options.benchmarks) argv.push("--benchmarks");
  if (options.otel) argv.push("--otel");
  if (options.apply) argv.push("--apply");

  const result = spawnSync(process.execPath, argv, {
    cwd: root,
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 50 * 1024 * 1024
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  return {
    ok: result.status === 0,
    status: result.status ?? -1,
    mode: options.apply ? "apply" : "dry-run",
    remotes,
    command: redactCommand([process.execPath, ...argv].join(" ")),
    report: parsed,
    stdout: parsed ? "" : (result.stdout || "").slice(-4000),
    stderr: (result.stderr || "").slice(-4000)
  };
}

async function scanSubnet(subnet, rangeText, port, timeoutMs, concurrency) {
  const prefix = subnetPrefix(subnet);
  const range = parseRange(rangeText);
  const hosts = range.map((suffix) => `${prefix}${suffix}`);
  const results = [];
  let index = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, 128));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (index < hosts.length) {
      const host = hosts[index];
      index += 1;
      if (await tcpOpen(host, port, timeoutMs)) results.push(host);
    }
  }));
  return results;
}

function tcpOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function monitoredHosts(liveBundlePath) {
  const hosts = new Set();
  const fullPath = path.resolve(root, liveBundlePath);
  if (!fs.existsSync(fullPath)) return hosts;
  try {
    const bundle = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const runs = bundle?.ingestion?.runs || bundle?.runs || [];
    runs.forEach((run) => {
      const context = run.sourceContext || run.source?.context || {};
      [
        run.name,
        run.cluster,
        context.hostname,
        context.node,
        context.host,
        context.networkLocalAddress,
        context.hostAddress,
        context.primaryAddress
      ].forEach((value) => {
        if (value) hosts.add(normalizeHost(value));
      });
    });
    (bundle?.metadata?.observedHosts || []).forEach((value) => hosts.add(normalizeHost(value)));
  } catch {
    return hosts;
  }
  return hosts;
}

function renderSelfCommand(apply) {
  const parts = [
    nodeCommand(),
    "scripts/auto-discover-deploy.js",
    "--subnet", options.subnet,
    "--range", options.range,
    options.user ? ["--user", options.user] : [],
    options.credentialsFile ? ["--credentials-file", options.credentialsFile] : [],
    options.collectorUrl ? ["--collector-url", options.collectorUrl] : [],
    options.hostUrl ? ["--host-url", options.hostUrl] : [],
    "--remote-root", options.remoteRoot,
    "--systemd-mode", options.systemdMode,
    "--out", options.out,
    options.benchmarks ? "--benchmarks" : "",
    apply ? "--apply" : ""
  ].flat().filter(Boolean);
  return parts.map(shellQuote).join(" ");
}

function nodeCommand() {
  const relative = path.relative(root, process.execPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join(path.posix.sep)
    : process.execPath;
}

function writeReport(report) {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const fullPath = path.resolve(root, options.out);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body, { mode: 0o600 });
  }
  process.stdout.write(body);
}

function subnetPrefix(subnet) {
  const value = String(subnet || "").trim();
  const match = value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(?:0|x|\*)\/24$/i)
    || value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.$/);
  if (!match) {
    throw new Error(`auto discovery currently accepts /24 subnets such as 192.168.10.0/24; got ${value}`);
  }
  return `${match[1]}.`;
}

function parseRange(value) {
  const ranges = String(value || "1-254").split(",");
  const items = [];
  ranges.forEach((part) => {
    const text = part.trim();
    if (!text) return;
    const match = text.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!match) throw new Error(`invalid discovery range ${text}`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    for (let item = Math.max(1, start); item <= Math.min(254, end); item += 1) {
      items.push(item);
    }
  });
  return unique(items).sort((left, right) => left - right);
}

function targetRole(host, hostname) {
  const label = `${host} ${hostname || ""}`;
  if (/^pi(?:[1-9]|1[0-2])$/i.test(hostname || "") || /\bpi\d+\b/i.test(label)) return "pi";
  if (/192\.168\.10\.(20|21|27|33|38|42)\b/.test(label) || /\bdgx|spark/i.test(label)) return "spark";
  return "nuc";
}

function remoteHost(remote) {
  const value = String(remote || "").trim();
  return value.includes("@") ? value.split("@").pop() : value;
}

function naturalIpSort(left, right) {
  return ipSortKey(left).localeCompare(ipSortKey(right), undefined, { numeric: true });
}

function ipSortKey(value) {
  return String(value || "").replace(/\d+/g, (part) => part.padStart(3, "0"));
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase();
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

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function redactCommand(value) {
  return String(value).replace(/(TOKEN|SECRET|PASSWORD|KEY)=\S+/gi, "$1=[REDACTED]");
}

function redactPath(value) {
  return String(value).replace(/([^/\\]{2})[^/\\]*(?=\.[^.]+$|$)/, "$1...");
}
