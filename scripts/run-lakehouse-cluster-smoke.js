#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const workloads = [
  ["deployment", "collector-gateway"],
  ["deployment", "duckdb-query-service"],
  ["deployment", "api-server"],
  ["deployment", "discovery-api"],
  ["deployment", "dagster"],
  ["deployment", "queue-gateway"],
  ["deployment", "otel-collector"],
  ["daemonset", "turbalance-ebpf-agent"]
];

const serviceChecks = [
  { name: "collector-gateway", url: "http://collector-gateway:8801/ready" },
  { name: "duckdb-query-service", url: "http://duckdb-query-service:8802/health" },
  { name: "api-server", url: "http://api-server:8080/health" },
  { name: "discovery-api", url: "http://discovery-api:8803/ready" },
  { name: "queue-gateway", url: "http://queue-gateway:8804/ready" }
];

function parseArgs(argv) {
  const options = {
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    overlay: "",
    apply: false,
    dryRun: false,
    forceConflicts: false,
    timeoutSeconds: 180,
    probeDeployment: process.env.TURBALANCE_SMOKE_PROBE_DEPLOYMENT || "api-server"
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force-conflicts") {
      options.forceConflicts = true;
    } else if (arg === "--namespace") {
      options.namespace = required(arg, next);
      index += 1;
    } else if (arg === "--overlay") {
      options.overlay = required(arg, next);
      index += 1;
    } else if (arg === "--timeout-seconds") {
      options.timeoutSeconds = Number(required(arg, next));
      index += 1;
    } else if (arg === "--probe-deployment") {
      options.probeDeployment = required(arg, next);
      index += 1;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return options;
}

function required(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/run-lakehouse-cluster-smoke.js --namespace <ns> [--overlay <dir>] [--apply] [--dry-run] [--force-conflicts]

Without --dry-run this uses kubectl to optionally apply a rendered overlay, wait for workloads, and probe internal health endpoints from an existing platform deployment.`);
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ok: result.status === 0
  };
}

function runShell(command) {
  const result = spawnSync("sh", ["-c", command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  return {
    command,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ok: result.status === 0
  };
}

function dryRunPlan(options) {
  return {
    status: "dry-run",
    namespace: options.namespace,
    overlay: options.overlay,
    apply: options.apply,
    forceConflicts: options.forceConflicts,
    probeDeployment: options.probeDeployment,
    waits: workloads.map(([kind, name]) => `kubectl -n ${options.namespace} rollout status ${kind}/${name}`),
    serviceChecks: serviceChecks.map((check) => `kubectl -n ${options.namespace} exec deploy/${options.probeDeployment} -- python -c ${quote(probePython(check.url))}`)
  };
}

function probePython(url) {
  return [
    "import urllib.request",
    `url=${JSON.stringify(url)}`,
    "response=urllib.request.urlopen(url, timeout=10)",
    "print(response.status)",
    "print(response.read(500).decode('utf-8', errors='replace'))"
  ].join("; ");
}

function main() {
  const options = parseArgs(process.argv);
  if (options.dryRun) {
    console.log(JSON.stringify(dryRunPlan(options), null, 2));
    return;
  }
  if (!commandAvailable("kubectl")) {
    throw new Error("kubectl is required for cluster smoke");
  }
  const results = [];
  if (options.apply) {
    if (!options.overlay) {
      throw new Error("--overlay is required when --apply is used");
    }
    results.push(
      runShell(
        `kubectl kustomize ${quote(options.overlay)} --load-restrictor=LoadRestrictionsNone | kubectl apply${options.forceConflicts ? " --server-side --force-conflicts" : ""} -f -`
      )
    );
  }
  results.push(run("kubectl", ["get", "namespace", options.namespace]));
  for (const [kind, name] of workloads) {
    results.push(run("kubectl", ["-n", options.namespace, "rollout", "status", `${kind}/${name}`, `--timeout=${options.timeoutSeconds}s`]));
  }
  for (const check of serviceChecks) {
    results.push(
      run("kubectl", [
        "-n",
        options.namespace,
        "exec",
        `deploy/${options.probeDeployment}`,
        "--",
        "python",
        "-c",
        probePython(check.url)
      ])
    );
  }
  const failures = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        status: failures.length ? "failed" : "ok",
        namespace: options.namespace,
        results
      },
      null,
      2
    )
  );
  if (failures.length) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
