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

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

function has(text, pattern) {
  return pattern.test(text);
}

function write(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function main() {
  const packageJson = json("package.json");
  const metering = json("ops/commercial-metering.example.json");
  const pilots = json("ops/design-partner-pilots.example.json");
  const gtm = read("docs/commercial-gtm.md");
  const support = read("docs/support-sla.md");
  const statusPage = read("docs/status-page.md");
  const designPartner = read("docs/design-partner-validation.md");
  const billing = read("docs/billing-usage-integration.md");
  const checks = [
    check("license.file", exists("LICENSE.md") && read("LICENSE.md").includes("Proprietary License"), "proprietary license file exists"),
    check("license.package", packageJson.license === "SEE LICENSE IN LICENSE.md", "package.json points to proprietary license file"),
    check("packaging.pricing", gtm.includes("Appliance") && gtm.includes("Managed SaaS") && gtm.includes("active_gpus"), "packaging and pricing posture covers appliance, SaaS, and meters"),
    check("metering.catalog", metering.meters.some((meter) => meter.name === "active_hosts") && metering.meters.some((meter) => meter.name === "active_gpus") && metering.meters.some((meter) => meter.name === "billable_gpu_hours"), "meter catalog covers host, GPU, and GPU-hour units"),
    check("support.sla", support.includes("P1") && support.includes("Initial Response") && has(support, /support bundle/i), "support SLA is documented"),
    check("status.page", statusPage.includes("Dashboard/API") && statusPage.includes("Billing usage export") && statusPage.includes("Incident States"), "status page model is documented"),
    check("design_partner.plan", pilots.pilots.length >= 3 && pilots.minimumCompletedPilotsBeforeExternalRoiClaims >= 2 && pilots.requiresCustomerSignoff, "2-3 design-partner pilot plan requires sign-off"),
    check("design_partner.real_data", pilots.requiresRealCustomerData && pilots.forbidsDemoDataForRoiClaims && has(designPartner, /seeded demo data/i), "ROI validation requires real customer data"),
    check("evidence_pack.machinery", exists("tests/evidence-pack-export.test.js") && read("docs/data-contract.md").includes("evidence pack"), "evidence-pack machinery is present"),
    check("billing.integration", billing.includes("Usage Record") && billing.includes("tenant-scoped API") && metering.billingExport.requiredFor.includes("managed-saas"), "billing usage integration is specified for SaaS")
  ];
  const failed = checks.filter((item) => !item.passed);
  const report = { status: failed.length ? "failed" : "ok", checks };
  write(report);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
