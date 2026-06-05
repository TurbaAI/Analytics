#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const deployments = [
  "collector-gateway",
  "duckdb-query-service",
  "api-server",
  "discovery-api",
  "dagster",
  "queue-gateway",
  "otel-collector"
];
const daemonsets = ["turbalance-ebpf-agent"];

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    releaseDir: process.env.TURBALANCE_RELEASE_DIR || path.join("build", "lakehouse-go-live", "release"),
    outDir: process.env.TURBALANCE_CHANGE_WINDOW_OUT_DIR || path.join("build", "lakehouse-change-window"),
    previousOverlay: process.env.TURBALANCE_PREVIOUS_OVERLAY || "",
    namespace: process.env.TURBALANCE_NAMESPACE || ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in args)) throw new Error(`Unknown argument ${arg}`);
      args[key] = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/generate-lakehouse-change-window.js [--env-file <file>] [--release-dir <dir>] [--out-dir <dir>] [--previous-overlay <dir>]

Writes production change-window and rollback evidence for a packaged lakehouse release.`);
}

function parseEnvFile(file) {
  const fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function rel(file) {
  return path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
}

function commandList(config) {
  const namespace = config.namespace;
  const overlay = rel(path.join(config.releaseDir, "kustomize"));
  const releaseDir = rel(config.releaseDir);
  const outDir = rel(config.outDir);
  const envFile = rel(config.envFile);
  const rollbackByWorkload = [
    ...deployments.map((name) => `kubectl -n ${namespace} rollout undo deployment/${name}`),
    ...daemonsets.map((name) => `kubectl -n ${namespace} rollout undo daemonset/${name}`)
  ];
  return {
    preflight: [
      `node scripts/create-lakehouse-production-env-from-values.js --values ops/lakehouse-production.values.example.json --dry-run --report ${outDir}/values-env-assembly.json`,
      `node scripts/generate-lakehouse-production-env.js --env-file ${envFile} --dry-run --report ${outDir}/env-assembly.json`,
      `node scripts/validate-lakehouse-live-prerequisites.js --env-file ${envFile} --run-live-checks --out ${outDir}/live-prerequisites.json`,
      `node scripts/generate-lakehouse-image-lock.js --env-file ${envFile} --out ${outDir}/image-lock.json`,
      `node scripts/validate-lakehouse-kubernetes-release.js --namespace ${namespace} --overlay ${overlay} --server-dry-run --out ${outDir}/kubernetes-release.json`,
      `node scripts/validate-lakehouse-externalsecrets.js --namespace ${namespace} --out ${outDir}/externalsecrets.json`
    ],
    deploy: [
      `kubectl apply -k ${overlay}`,
      ...deployments.map((name) => `kubectl -n ${namespace} rollout status deployment/${name} --timeout=180s`),
      ...daemonsets.map((name) => `kubectl -n ${namespace} rollout status daemonset/${name} --timeout=180s`)
    ],
    verify: [
      `node scripts/run-lakehouse-cluster-smoke.js --namespace ${namespace} --overlay ${overlay}`,
      `node scripts/run-lakehouse-burn-in.js --api-url ${config.apiUrl} --collector-url ${config.collectorUrl} --out ${outDir}/burn-in.json`,
      `node scripts/validate-lakehouse-live-observability.js --env-file ${envFile} --api-url ${config.apiUrl} --out ${outDir}/live-observability.json`,
      `node scripts/run-ebpf-fleet-validation.js --hosts-file ${config.ebpfHostsFile} --out ${outDir}/ebpf-fleet.json`,
      `node scripts/collect-lakehouse-ebpf-rollout-evidence.js --hosts-file ${config.ebpfHostsFile} --out-dir ${outDir}/ebpf-rollout`
    ],
    rollback: config.previousOverlay
      ? [`kubectl apply -k ${rel(config.previousOverlay)}`, ...rollbackByWorkload]
      : rollbackByWorkload,
    evidence: [
      `kubectl -n ${namespace} get deploy,daemonset,pods,svc,externalsecret,secret -o wide > ${outDir}/cluster-objects.txt`,
      `kubectl -n ${namespace} get events --sort-by=.lastTimestamp > ${outDir}/events.txt`,
      `kubectl -n ${namespace} logs deployment/api-server --tail=200 > ${outDir}/api-server.log`,
      `kubectl -n ${namespace} logs deployment/collector-gateway --tail=200 > ${outDir}/collector-gateway.log`,
      `tar -czf ${outDir}/release-evidence.tgz ${releaseDir} ${outDir}`
    ]
  };
}

function loadRelease(releaseDir) {
  const manifestPath = path.resolve(root, releaseDir, "release-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Change Window",
    "",
    `- Status: ${report.status}`,
    `- Namespace: ${report.namespace}`,
    `- Release directory: ${report.releaseDir}`,
    `- Env file: ${report.envFile}`,
    "",
    "## Gates",
    ""
  ];
  for (const gate of report.gates) lines.push(`- ${gate.name}: ${gate.passed ? "PASS" : "WARN"} - ${gate.detail}`);
  for (const [section, commands] of Object.entries(report.commands)) {
    lines.push("", `## ${section[0].toUpperCase()}${section.slice(1)}`, "");
    for (const command of commands) lines.push(`- \`${command}\``);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const env = { ...process.env, ...parseEnvFile(args.envFile) };
  const releaseDir = path.resolve(root, args.releaseDir);
  const outDir = path.resolve(root, args.outDir);
  const namespace = args.namespace || env.TURBALANCE_NAMESPACE || "turbalance-lakehouse";
  const config = {
    envFile: args.envFile,
    releaseDir,
    outDir,
    previousOverlay: args.previousOverlay,
    namespace,
    apiUrl: env.TURBALANCE_API_URL || `http://api-server.${namespace}.svc.cluster.local:8080`,
    collectorUrl: env.TURBALANCE_COLLECTOR_URL || `http://collector-gateway.${namespace}.svc.cluster.local:8801`,
    ebpfHostsFile: env.TURBALANCE_EBPF_HOSTS_FILE || "ops/lakehouse-ebpf-hosts.example.json"
  };
  const release = loadRelease(releaseDir);
  const gates = [
    { name: "release.manifest", passed: Boolean(release), detail: `${rel(path.join(releaseDir, "release-manifest.json"))} exists` },
    { name: "release.overlay", passed: fs.existsSync(path.join(releaseDir, "kustomize", "kustomization.yaml")), detail: `${rel(path.join(releaseDir, "kustomize"))} exists` },
    { name: "env.file", passed: fs.existsSync(path.resolve(root, args.envFile)), detail: `${args.envFile} exists` },
    { name: "previous.overlay", passed: !args.previousOverlay || fs.existsSync(path.resolve(root, args.previousOverlay)), detail: args.previousOverlay || "rollout undo will be used" }
  ];
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    status: gates.every((gate) => gate.passed) ? "ready" : "planned",
    generatedAt: new Date().toISOString(),
    namespace,
    envFile: rel(args.envFile),
    releaseDir: rel(releaseDir),
    previousOverlay: args.previousOverlay ? rel(args.previousOverlay) : "",
    release: release
      ? {
          images: release.images,
          lakeRoot: release.lakeRoot,
          certificateMode: release.certificateMode,
          queue: release.queue
        }
      : null,
    gates,
    commands: commandList(config),
    artifacts: {
      report: path.join(outDir, "change-window.json"),
      markdown: path.join(outDir, "change-window.md")
    }
  };
  writeJson(report.artifacts.report, report);
  fs.writeFileSync(report.artifacts.markdown, markdown(report), "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
