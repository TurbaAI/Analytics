const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const checks = [
  { label: "syntax app.js", args: ["--check", "app.js"] },
  { label: "syntax analytics-core.js", args: ["--check", "analytics-core.js"] },
  { label: "syntax nccl-trace-parser.js", args: ["--check", "nccl-trace-parser.js"] },
  { label: "syntax nccl-trace-fixtures.js", args: ["--check", "nccl-trace-fixtures.js"] },
  { label: "provider image", args: ["tests/provider-image.test.js"] },
  { label: "provider config generator", args: ["tests/provider-config-generator.test.js"] },
  { label: "demo prep", args: ["tests/prepare-demo.test.js"] },
  { label: "local machine bundle", args: ["tests/local-machine-bundle.test.js"] },
  { label: "fleet remediation", args: ["tests/fleet-remediation.test.js"] },
  { label: "productization tooling", args: ["tests/productization.test.js"] },
  { label: "live machine push agent", args: ["tests/live-machine-push-agent.test.js"] },
  { label: "system identification worker", args: ["tests/system-identification-worker.test.js"] },
  { label: "system characterization automation", args: ["tests/system-characterization-automation.test.js"] },
  { label: "SPARK1 Kubernetes demo collector", args: ["tests/spark1-kubernetes-demo.test.js"] },
  { label: "SPARK1 Kafka manifests", args: ["tests/spark1-kafka.test.js"] },
  { label: "DGX Spark inference deployment", args: ["tests/dgx-spark-inference.test.js"] },
  { label: "GB100 telemetry package", args: ["tests/gb100-telemetry.test.js"] },
  { label: "GB100 installer package", args: ["tests/gb100-installer.test.js"] },
  { label: "provider readiness", args: ["tests/provider-readiness.test.js"] },
  { label: "provider go-live gates", args: ["tests/provider-go-live-gates.test.js"] },
  { label: "sandbox go-live", args: ["tests/sandbox-go-live.test.js"] },
  { label: "analytics core", args: ["tests/analytics-core.test.js"] },
  { label: "NCCL trace parser", args: ["tests/nccl-trace-parser.test.js"] },
  { label: "external ingestion fixture", args: ["tests/external-ingestion-fixture.test.js"] },
  { label: "neo-cloud provider fixture", args: ["tests/neo-cloud-provider-fixture.test.js"] },
  { label: "source bundle validator", args: ["tests/source-bundle-validator.test.js"] },
  { label: "provider exporter", args: ["tests/provider-exporter.test.js"] },
  { label: "scheduler exporter", args: ["tests/scheduler-exporter.test.js"] },
  { label: "eBPF exporter", args: ["tests/ebpf-exporter.test.js"] },
  { label: "Prometheus source exporter", args: ["tests/prometheus-source-exporter.test.js"] },
  { label: "Redfish source exporter", args: ["tests/redfish-source-exporter.test.js"] },
  { label: "source system collectors", args: ["tests/source-system-collectors.test.js"] },
  { label: "source contracts", args: ["tests/source-contracts.test.js"] },
  { label: "source approvals", args: ["tests/source-approvals.test.js"] },
  { label: "provider pilot bundler", args: ["tests/provider-pilot-bundler.test.js"] },
  { label: "provider pilot export job", args: ["tests/provider-pilot-export-job.test.js"] },
  { label: "ingestion OIDC", args: ["tests/ingestion-oidc.test.js"] },
  { label: "ingestion secrets", args: ["tests/ingestion-secrets.test.js"] },
  { label: "ingestion storage", args: ["tests/ingestion-storage.test.js"] },
  { label: "managed storage", args: ["tests/managed-storage.test.js"] },
  { label: "ingestion server", args: ["tests/ingestion-server.test.js"] },
  { label: "provision tenant", args: ["tests/provision-tenant.test.js"] },
  { label: "customer IAM provisioning", args: ["tests/provision-customer-iam.test.js"] },
  { label: "managed Kubernetes render", args: ["tests/render-managed-kubernetes.test.js"] },
  { label: "live pilot burn-in", args: ["tests/live-pilot-burn-in.test.js"] },
  { label: "retention job", args: ["tests/retention-job.test.js"] },
  { label: "workspace export fixture", args: ["tests/workspace-export-fixture.test.js"] },
  { label: "redacted workspace export", args: ["tests/redacted-workspace-export.test.js"] },
  { label: "evidence pack export", args: ["tests/evidence-pack-export.test.js"] },
  { label: "schemas", args: ["tests/schemas.test.js"] },
  { label: "source bundle validation", args: ["tests/source-bundle-validation.test.js"] },
  { label: "import validation copy", args: ["tests/import-validation-copy.test.js"] },
  { label: "platform lakehouse", args: ["tests/platform-lakehouse.test.js"] },
  { label: "lakehouse go-live", args: ["tests/lakehouse-go-live.test.js"] },
  { label: "lakehouse production readiness", args: ["tests/lakehouse-production-readiness.test.js"] },
  { label: "lakehouse production smoke", args: ["scripts/run-lakehouse-production-smoke.js"] },
  { label: "static page wiring", args: ["tests/static-page-wiring.test.js"] },
  { label: "docs and workflows", args: ["tests/docs-and-workflows.test.js"] },
  { label: "screenshot QA", args: ["scripts/run-screenshot-qa.js"] }
];

const failures = [];

checks.forEach((check) => {
  console.log(`\n> ${check.label}`);
  const result = spawnSync(process.execPath, check.args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    failures.push(check.label);
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed");
}
