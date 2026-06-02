#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const kubectl = args.kubectl || process.env.TURBALANCE_KUBECTL || "kubectl";
const namespace = args.namespace || process.env.TURBALANCE_SPARK1_K8S_NAMESPACE || "turbalance-demo";
const brokerManifest = args.manifest || "ops/kubernetes/spark1-kafka.yaml";
const smokeManifest = args["smoke-manifest"] || "ops/kubernetes/spark1-kafka-smoke-job.yaml";
const timeout = args.timeout || "240s";
const skipApply = Boolean(args["skip-apply"]);

if (args.help) {
  usage();
  process.exit(0);
}

main();

function main() {
  if (!skipApply) {
    run(kubectl, ["apply", "-f", brokerManifest]);
  }

  run(kubectl, ["-n", namespace, "rollout", "status", "deployment/spark1-kafka", `--timeout=${timeout}`]);
  run(kubectl, ["-n", namespace, "delete", "job", "spark1-kafka-smoke", "--ignore-not-found", "--wait=true"]);
  run(kubectl, ["apply", "-f", smokeManifest]);
  run(kubectl, ["-n", namespace, "wait", "--for=condition=complete", "job/spark1-kafka-smoke", `--timeout=${timeout}`]);

  const logs = run(kubectl, ["-n", namespace, "logs", "job/spark1-kafka-smoke"], { capture: true });
  const ok = /SPARK1 Kafka smoke test passed/.test(logs.stdout);
  if (!ok) {
    process.stderr.write(logs.stdout || "Kafka smoke job completed, but the success marker was not present.\n");
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    namespace,
    bootstrapServers: "spark1-kafka.turbalance-demo.svc.cluster.local:9092",
    nodePortBootstrap: "192.168.10.20:30992",
    smokeJob: "spark1-kafka-smoke"
  }, null, 2)}\n`);
  process.stdout.write(logs.stdout);
}

function run(bin, commandArgs, options = {}) {
  const result = spawnSync(bin, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: 5 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    process.exit(result.status || 1);
  }

  return result;
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
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function usage() {
  process.stdout.write(`Usage: node scripts/check-spark1-kafka.js [options]

Applies the SPARK1 Kafka broker manifest, waits for readiness, runs a
produce/consume smoke Job, and verifies the success marker in the Job log.

Options:
  --kubectl <path>           kubectl binary to use
  --namespace <name>         Kubernetes namespace (default: turbalance-demo)
  --manifest <path>          Broker manifest (default: ops/kubernetes/spark1-kafka.yaml)
  --smoke-manifest <path>    Smoke Job manifest (default: ops/kubernetes/spark1-kafka-smoke-job.yaml)
  --timeout <duration>       kubectl rollout/wait timeout (default: 240s)
  --skip-apply               Do not apply the broker manifest before checking
`);
}
