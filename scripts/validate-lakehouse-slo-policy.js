#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    policy: "ops/lakehouse-slo-policy.example.json",
    rules: "ops/kubernetes/lakehouse-prometheus-rules.yaml",
    out: ""
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
  console.log(`Usage: scripts/validate-lakehouse-slo-policy.js [--policy <json>] [--rules <yaml>] [--out <file>]

Validates the lakehouse SLO policy and confirms every policy burn alert is present in the PrometheusRule manifest.`);
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function read(file) {
  return fs.readFileSync(path.resolve(root, file), "utf8");
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body, "utf8");
  }
  process.stdout.write(body);
}

function main() {
  const options = parseArgs(process.argv);
  const checks = [
    check("policy.exists", fs.existsSync(path.resolve(root, options.policy)), `${options.policy} exists`),
    check("rules.exists", fs.existsSync(path.resolve(root, options.rules)), `${options.rules} exists`)
  ];
  if (checks.some((item) => !item.passed)) {
    write(options.out, { status: "failed", checks });
    process.exitCode = 1;
    return;
  }
  const policy = JSON.parse(read(options.policy));
  const rules = read(options.rules);
  checks.push(check("policy.schema", policy.schemaVersion === "turba.lakehouse.slo_policy.v1", "SLO policy schema version is current"));
  checks.push(check("policy.objectives", Array.isArray(policy.objectives) && policy.objectives.length >= 5, "SLO policy includes core objectives"));
  checks.push(check("policy.release_gates", Array.isArray(policy.releaseGates) && policy.releaseGates.length >= 5, "SLO policy declares release gates"));
  for (const objective of policy.objectives || []) {
    checks.push(check(`objective.${objective.name}.name`, Boolean(objective.name), "objective has name"));
    checks.push(check(`objective.${objective.name}.owner`, Boolean(objective.owner), "objective has owner"));
    checks.push(check(`objective.${objective.name}.target`, objective.targetPct >= 95 && objective.targetPct <= 100, "objective target is a production SLO percentage"));
    checks.push(check(`objective.${objective.name}.measurement`, Boolean(objective.measurement), "objective documents measurement"));
    checks.push(check(`objective.${objective.name}.alerts`, Array.isArray(objective.burnAlerts) && objective.burnAlerts.length > 0, "objective has burn alerts"));
    for (const alert of objective.burnAlerts || []) {
      checks.push(check(`alert.${alert}.present`, rules.includes(`alert: ${alert}`), `${alert} is present in Prometheus rules`));
    }
  }
  const requiredGates = [
    "scripts/validate-lakehouse-live-prerequisites.js",
    "scripts/validate-lakehouse-release-supply-chain.js",
    "scripts/validate-lakehouse-kubernetes-release.js",
    "scripts/validate-lakehouse-live-observability.js"
  ];
  for (const gate of requiredGates) {
    checks.push(check(`release_gate.${gate}`, policy.releaseGates?.includes(gate), `${gate} is included in SLO release gates`));
  }
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ok",
    policy: options.policy,
    rules: options.rules,
    objectives: policy.objectives || [],
    checks
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
