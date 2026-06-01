const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const readme = read("README.md");

[
  "docs/data-contract.md",
  "docs/backend-ingestion.md",
  "docs/operator-walkthrough.md",
  "docs/neo-cloud-provider-fit.md",
  "docs/provider-export-template.md",
  "docs/neo-cloud-pilot-validation.md",
  "docs/telemetry-integration.md",
  "docs/operations.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-script.md",
  "docs/demo-release-checklist.md",
  "assets/turbalance-mark.png",
  "assets/turbalance-analytics-logo.png",
  "Dockerfile",
  ".dockerignore",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-source-bundle.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "grafana/turbalance-provider-overview.json",
  "lib/source-bundle-validator.js",
  "ops/pilot-provider.config.example.json",
  "ops/pilot-provider.sandbox.json",
  "ops/source-contracts.example.json",
  "ops/source-contracts.sandbox.json",
  "ops/kubernetes/ingestion-configmap.yaml",
  "ops/kubernetes/ingestion-secret.example.yaml",
  "ops/kubernetes/ingestion-serviceaccount.yaml",
  "ops/kubernetes/ingestion-deployment.yaml",
  "ops/kubernetes/ingestion-retention-cronjob.yaml",
  "ops/kubernetes/provider-export-cronjob.yaml",
  "ops/kubernetes/ingestion-service-monitor.yaml",
  "ops/kubernetes/ingestion-prometheus-rules.yaml",
  "server/ingestion-oidc.js",
  "server/ingestion-server.js",
  "server/ingestion-secrets.js",
  "server/ingestion-storage.js",
  "scripts/build-provider-overlay.js",
  "scripts/build-provider-pilot-bundle.js",
  "scripts/build-scheduler-overlay.js",
  "scripts/build-ebpf-overlay.js",
  "scripts/build-publish-ingestion-image.js",
  "scripts/validate-provider-readiness.js",
  "scripts/run-provider-go-live-gates.js",
  "scripts/run-sandbox-go-live.js",
  "scripts/run-sandbox-source-gateway.js",
  "scripts/fetch-source-system-export.js",
  "scripts/fetch-prometheus-source-export.js",
  "scripts/render-managed-kubernetes.js",
  "scripts/validate-source-contracts.js",
  "scripts/run-live-pilot-burn-in.js",
  "scripts/validate-source-bundle.js",
  "scripts/run-screenshot-qa.js",
  "scripts/run-retention-job.js",
  "scripts/provision-tenant.js",
  "scripts/provision-customer-iam.js",
  "scripts/run-provider-pilot-export-job.js",
  "fixtures/prometheus-collector-queries.json",
  "fixtures/provider-overlay-template.json",
  "fixtures/provider-pilot-export-inputs/prometheus.json",
  "fixtures/scheduler-export-inputs/scheduler-events.json",
  "fixtures/ebpf-export-inputs/host-samples.json",
  "fixtures/provider-export-inputs/kubernetes-jobs.json",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/provider-image.yml",
  ".github/workflows/visual-qa.yml",
  "build/turbalance-analytics-desktop.png",
  "build/turbalance-analytics-mobile.png"
].forEach((relativePath) => {
  assert.ok(exists(relativePath), `${relativePath} should exist`);
});

[
  "docs/data-contract.md",
  "docs/backend-ingestion.md",
  "docs/operator-walkthrough.md",
  "docs/neo-cloud-provider-fit.md",
  "docs/provider-export-template.md",
  "docs/neo-cloud-pilot-validation.md",
  "docs/telemetry-integration.md",
  "docs/operations.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-script.md",
  "docs/demo-release-checklist.md",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-source-bundle.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "scripts/build-provider-overlay.js",
  "scripts/build-provider-pilot-bundle.js",
  "scripts/build-scheduler-overlay.js",
  "scripts/build-ebpf-overlay.js",
  "scripts/build-publish-ingestion-image.js",
  "scripts/validate-provider-readiness.js",
  "scripts/run-provider-go-live-gates.js",
  "scripts/run-sandbox-go-live.js",
  "scripts/run-sandbox-source-gateway.js",
  "scripts/fetch-source-system-export.js",
  "scripts/fetch-prometheus-source-export.js",
  "scripts/render-managed-kubernetes.js",
  "scripts/validate-source-contracts.js",
  "scripts/run-live-pilot-burn-in.js",
  "scripts/validate-source-bundle.js",
  "scripts/run-screenshot-qa.js",
  "scripts/run-retention-job.js",
  "scripts/provision-tenant.js",
  "scripts/provision-customer-iam.js",
  "scripts/run-provider-pilot-export-job.js",
  "grafana/turbalance-provider-overview.json",
  "ops/kubernetes/ingestion-deployment.yaml",
  "ops/kubernetes/ingestion-retention-cronjob.yaml",
  "ops/kubernetes/provider-export-cronjob.yaml",
  "server/ingestion-oidc.js",
  "server/ingestion-server.js",
  "server/ingestion-secrets.js",
  "server/ingestion-storage.js",
  "node tests/run-all.js",
  "tests/provider-image.test.js",
  "tests/provider-readiness.test.js",
  "tests/provider-go-live-gates.test.js",
  "tests/sandbox-go-live.test.js",
  "ops/pilot-provider.sandbox.json",
  "ops/source-contracts.sandbox.json",
  "tests/neo-cloud-provider-fixture.test.js",
  "tests/provider-exporter.test.js",
  "tests/scheduler-exporter.test.js",
  "tests/ebpf-exporter.test.js",
  "tests/prometheus-source-exporter.test.js",
  "tests/source-system-collectors.test.js",
  "tests/source-contracts.test.js",
  "tests/provider-pilot-bundler.test.js",
  "tests/provider-pilot-export-job.test.js",
  "tests/ingestion-oidc.test.js",
  "tests/ingestion-secrets.test.js",
  "tests/ingestion-storage.test.js",
  "tests/managed-storage.test.js",
  "tests/ingestion-server.test.js",
  "tests/provision-tenant.test.js",
  "tests/provision-customer-iam.test.js",
  "tests/render-managed-kubernetes.test.js",
  "tests/live-pilot-burn-in.test.js",
  "tests/retention-job.test.js",
  "tests/source-bundle-validator.test.js",
  "tests/evidence-pack-export.test.js",
  "tests/source-bundle-validation.test.js",
  "build/turbalance-analytics-desktop.png"
].forEach((text) => {
  assert.ok(readme.includes(text), `README should reference ${text}`);
});

const ci = read(".github/workflows/ci.yml");
const pages = read(".github/workflows/pages.yml");
const visualQaWorkflow = read(".github/workflows/visual-qa.yml");
const providerImageWorkflow = read(".github/workflows/provider-image.yml");

assert.ok(ci.includes("node tests/run-all.js"));
assert.ok(ci.includes("node scripts/validate-source-bundle.js --require-source-export"));
assert.ok(ci.includes("node scripts/run-screenshot-qa.js"));
assert.ok(pages.includes("node tests/run-all.js"));
assert.ok(pages.includes("actions/deploy-pages@v4"));
assert.ok(pages.includes("cp index.html styles.css app.js analytics-core.js nccl-trace-parser.js nccl-trace-fixtures.js site/"));
assert.ok(pages.includes("cp -R assets build fixtures docs schemas scripts grafana lib ops server site/"));
assert.ok(visualQaWorkflow.includes("npx playwright install --with-deps chromium"));
assert.ok(visualQaWorkflow.includes("TURBALANCE_SCREENSHOT_QA_REQUIRED"));
assert.ok(providerImageWorkflow.includes("scripts/build-publish-ingestion-image.js"));
assert.ok(providerImageWorkflow.includes("docker/setup-buildx-action"));

const dataContract = read("docs/data-contract.md");
assert.ok(dataContract.includes("turba.ingestion.v1"));
assert.ok(dataContract.includes("turba-source-bundle.v1.schema.json"));
assert.ok(dataContract.includes("turba.workspace.v2"));
assert.ok(dataContract.includes("sources.provider"));
assert.ok(dataContract.includes("sources.scheduler"));
assert.ok(dataContract.includes("sources.grafana"));
assert.ok(dataContract.includes("sources.ebpf"));
assert.ok(dataContract.includes("sources.opportunities"));
assert.ok(dataContract.includes("Opportunity Overlay"));
assert.ok(dataContract.includes("Scheduler Event Overlay"));
assert.ok(dataContract.includes("Grafana Handoff Overlay"));
assert.ok(dataContract.includes("Scheduler Simulator"));
assert.ok(dataContract.includes("Markdown evidence pack"));
assert.ok(dataContract.includes("eBPF Host Overlay"));
assert.ok(dataContract.includes("Neo-Cloud Provider Overlay"));
assert.ok(dataContract.includes("Validation Behavior"));
assert.ok(dataContract.includes("validate-source-bundle.js"));
assert.ok(dataContract.includes("build-provider-pilot-bundle.js"));

const backendIngestion = read("docs/backend-ingestion.md");
assert.ok(backendIngestion.includes("server/ingestion-server.js"));
assert.ok(backendIngestion.includes("server/ingestion-oidc.js") || backendIngestion.includes("RS256/JWKS"));
assert.ok(backendIngestion.includes("server/ingestion-storage.js"));
assert.ok(backendIngestion.includes("object-sqlite"));
assert.ok(backendIngestion.includes("managed-postgres-s3"));
assert.ok(backendIngestion.includes("TURBALANCE_POSTGRES_URL_FILE"));
assert.ok(backendIngestion.includes("TURBALANCE_TENANT_TOKENS_FILE"));
assert.ok(backendIngestion.includes("signed"));
assert.ok(backendIngestion.includes("JWT"));
assert.ok(backendIngestion.includes("JWKS"));
assert.ok(backendIngestion.includes("OIDC"));
assert.ok(backendIngestion.includes("JWT_TENANT_MAP"));
assert.ok(backendIngestion.includes("tokens/rotate"));
assert.ok(backendIngestion.includes("scripts/provision-tenant.js"));
assert.ok(backendIngestion.includes("upload-keys/rotate"));
assert.ok(backendIngestion.includes("audit/export"));
assert.ok(backendIngestion.includes("/metrics"));
assert.ok(backendIngestion.includes("scripts/run-retention-job.js"));
assert.ok(backendIngestion.includes("scripts/run-provider-pilot-export-job.js"));
assert.ok(backendIngestion.includes("audit"));
assert.ok(backendIngestion.includes("retention"));

const operations = read("docs/operations.md");
assert.ok(operations.includes("ops/kubernetes/ingestion-deployment.yaml"));
assert.ok(operations.includes("ops/kubernetes/ingestion-serviceaccount.yaml"));
assert.ok(operations.includes("ops/kubernetes/ingestion-retention-cronjob.yaml"));
assert.ok(operations.includes("ops/kubernetes/provider-export-cronjob.yaml"));
assert.ok(operations.includes("ops/kubernetes/ingestion-service-monitor.yaml"));
assert.ok(operations.includes("ops/kubernetes/ingestion-prometheus-rules.yaml"));
assert.ok(operations.includes("scripts/provision-tenant.js"));
assert.ok(operations.includes("scripts/provision-customer-iam.js"));
assert.ok(operations.includes("scripts/render-managed-kubernetes.js"));
assert.ok(operations.includes("scripts/fetch-source-system-export.js"));
assert.ok(operations.includes("scripts/fetch-prometheus-source-export.js"));
assert.ok(operations.includes("scripts/build-publish-ingestion-image.js"));
assert.ok(operations.includes("scripts/validate-provider-readiness.js"));
assert.ok(operations.includes("scripts/run-provider-go-live-gates.js"));
assert.ok(operations.includes("scripts/run-sandbox-source-gateway.js"));
assert.ok(operations.includes("scripts/validate-source-contracts.js"));
assert.ok(operations.includes("scripts/run-live-pilot-burn-in.js"));
assert.ok(operations.includes("TURBALANCE_OIDC_DISCOVERY_URL"));
assert.ok(operations.includes("managed-postgres-s3"));

const telemetry = read("docs/telemetry-integration.md");
assert.ok(telemetry.includes("Prometheus"));
assert.ok(telemetry.includes("DCGM"));
assert.ok(telemetry.includes("Kubernetes"));
assert.ok(telemetry.includes("Linux eBPF Host Overlay"));
assert.ok(telemetry.includes("Grafana Handoff Overlay"));
assert.ok(telemetry.includes("Opportunity Overlay"));
assert.ok(telemetry.includes("NCCL"));
assert.ok(telemetry.includes("Provider Commercial Overlay"));
assert.ok(telemetry.includes("sources.ebpf"));
assert.ok(telemetry.includes("sources.grafana"));
assert.ok(telemetry.includes("sources.provider"));
assert.ok(telemetry.includes("sources.scheduler"));
assert.ok(telemetry.includes("sources.opportunities"));
assert.ok(telemetry.includes("scripts/build-ebpf-overlay.js"));
assert.ok(telemetry.includes("scripts/fetch-source-system-export.js"));
assert.ok(telemetry.includes("scripts/fetch-prometheus-source-export.js"));
assert.ok(telemetry.includes("scripts/validate-source-contracts.js"));
assert.ok(telemetry.includes("scripts/build-scheduler-overlay.js"));
assert.ok(telemetry.includes("scripts/build-provider-overlay.js"));
assert.ok(telemetry.includes("scripts/build-provider-pilot-bundle.js"));
assert.ok(telemetry.includes("scripts/validate-source-bundle.js"));
assert.ok(telemetry.includes("grafana/turbalance-provider-overview.json"));

const providerFit = read("docs/neo-cloud-provider-fit.md");
assert.ok(providerFit.includes("Neo-Cloud Provider Fit"));
assert.ok(providerFit.includes("Sellable waste value"));
assert.ok(providerFit.includes("fixtures/neo-cloud-provider-bundle.json"));
assert.ok(providerFit.includes("fixtures/provider-overlay-template.json"));
assert.ok(providerFit.includes("scripts/build-scheduler-overlay.js"));
assert.ok(providerFit.includes("scripts/build-ebpf-overlay.js"));
assert.ok(providerFit.includes("scripts/build-provider-pilot-bundle.js"));
assert.ok(providerFit.includes("server/ingestion-server.js"));
assert.ok(providerFit.includes("sources.grafana"));
assert.ok(providerFit.includes("grafana/turbalance-provider-overview.json"));
assert.ok(providerFit.includes("Opportunity Engine"));
assert.ok(providerFit.includes("Scheduler Simulator"));
assert.ok(providerFit.includes("evidence pack"));
assert.ok(providerFit.includes("CoreWeave"));
assert.ok(providerFit.includes("Lambda"));

const providerTemplate = read("docs/provider-export-template.md");
assert.ok(providerTemplate.includes("fixtures/provider-overlay-template.json"));
assert.ok(providerTemplate.includes("scripts/build-provider-overlay.js"));
assert.ok(providerTemplate.includes("scripts/build-provider-pilot-bundle.js"));
assert.ok(providerTemplate.includes("scripts/fetch-source-system-export.js"));
assert.ok(providerTemplate.includes("scripts/fetch-prometheus-source-export.js"));
assert.ok(providerTemplate.includes("scripts/validate-source-contracts.js"));
assert.ok(providerTemplate.includes("scripts/build-scheduler-overlay.js"));
assert.ok(providerTemplate.includes("scripts/validate-source-bundle.js"));
assert.ok(providerTemplate.includes("turba-source-bundle.v1.schema.json"));
assert.ok(providerTemplate.includes("Kubernetes Join Keys"));
assert.ok(providerTemplate.includes("Slurm Join Keys"));
assert.ok(providerTemplate.includes("sources.ebpf"));
assert.ok(providerTemplate.includes("sources.scheduler"));
assert.ok(providerTemplate.includes("sources.grafana"));
assert.ok(providerTemplate.includes("sources.opportunities"));
assert.ok(providerTemplate.includes("grafana/turbalance-provider-overview.json"));
assert.ok(providerTemplate.includes("redacted workspace export"));

const pilotValidation = read("docs/neo-cloud-pilot-validation.md");
assert.ok(pilotValidation.includes("Tenant"));
assert.ok(pilotValidation.includes("Reservation"));
assert.ok(pilotValidation.includes("redacted workspace"));
assert.ok(pilotValidation.includes("build-ebpf-overlay.js"));
assert.ok(pilotValidation.includes("build-provider-pilot-bundle.js"));
assert.ok(pilotValidation.includes("ingestion-server.js"));
assert.ok(pilotValidation.includes("build-scheduler-overlay.js"));
assert.ok(pilotValidation.includes("Grafana"));
assert.ok(pilotValidation.includes("Opportunity Engine"));
assert.ok(pilotValidation.includes("Scheduler Simulator"));
assert.ok(pilotValidation.includes("evidence pack"));
assert.ok(pilotValidation.includes("GitHub Pages"));

const demoScript = read("docs/demo-script.md");
assert.ok(demoScript.includes("fixtures/external-source-bundle.json"));
assert.ok(demoScript.includes("provider portfolio risk tables"));
assert.ok(demoScript.includes("build-ebpf-overlay.js"));
assert.ok(demoScript.includes("build-provider-pilot-bundle.js"));
assert.ok(demoScript.includes("build-scheduler-overlay.js"));
assert.ok(demoScript.includes("sources.grafana"));
assert.ok(demoScript.includes("grafana/turbalance-provider-overview.json"));
assert.ok(demoScript.includes("Opportunity Engine"));
assert.ok(demoScript.includes("Capacity what-if"));
assert.ok(demoScript.includes("evidence pack"));
assert.ok(demoScript.includes("redacted workspace"));
assert.ok(demoScript.includes("Do Not Claim"));

const demoRelease = read("docs/demo-release-checklist.md");
assert.ok(demoRelease.includes("GitHub Pages"));
assert.ok(demoRelease.includes("provider portfolio risk tables"));
assert.ok(demoRelease.includes("build-ebpf-overlay.js"));
assert.ok(demoRelease.includes("build-provider-pilot-bundle.js"));
assert.ok(demoRelease.includes("validate-source-bundle.js"));
assert.ok(demoRelease.includes("run-screenshot-qa.js"));
assert.ok(demoRelease.includes("ingestion-server.js"));
assert.ok(demoRelease.includes("build-scheduler-overlay.js"));
assert.ok(demoRelease.includes("Grafana Handoff"));
assert.ok(demoRelease.includes("grafana/turbalance-provider-overview.json"));
assert.ok(demoRelease.includes("Opportunity Engine"));
assert.ok(demoRelease.includes("Scheduler Simulator"));
assert.ok(demoRelease.includes("evidence pack"));
assert.ok(demoRelease.includes("turba-source-bundle.v1.schema.json"));
assert.ok(demoRelease.includes("build/turbalance-analytics-desktop.png"));

console.log("docs and workflows tests passed");
