#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

function main() {
  const budgets = JSON.parse(read("ops/performance-budgets.example.json"));
  const checks = [
    check("schema", budgets.schemaVersion === "turba.performance_budgets.v1", "performance budget schema is current"),
    check("dashboard.bundle", budgets.dashboard.maxAppBundleKb > 0 && budgets.dashboard.maxAppBundleKb <= 1500, "dashboard bundle budget is bounded"),
    check("dashboard.screenshot", budgets.dashboard.screenshotQaRequired === true && exists("scripts/run-screenshot-qa.js"), "screenshot QA is required"),
    check("ingestion.load_script", exists(budgets.ingestion.loadTestScript), "ingestion load test script exists"),
    check("ingestion.load_budget", budgets.ingestion.defaultRequests >= 100 && budgets.ingestion.defaultConcurrency >= 4 && budgets.ingestion.p95MsBudget > 0, "ingestion load budget is production-shaped"),
    check("lakehouse.burn_in", exists(budgets.lakehouse.burnInScript) && exists(budgets.lakehouse.clusterSmokeScript) && exists(budgets.lakehouse.productionSmokeScript), "lakehouse burn-in and smoke scripts exist"),
    check("regression.tests", budgets.regression.requiredTests.every((relativePath) => exists(relativePath)), "required regression tests exist"),
    check("regression.suite", exists("tests/run-all.js") && read("tests/run-all.js").includes("predictive + prescriptive core") && read("tests/run-all.js").includes("lakehouse production readiness"), "full suite includes regression lanes")
  ];
  const failed = checks.filter((item) => !item.passed);
  process.stdout.write(`${JSON.stringify({ status: failed.length ? "failed" : "ok", checks }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

