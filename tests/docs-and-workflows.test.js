const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const readme = read("README.md");

assert.ok(readme.includes("docs/customer-productization.md"));

[
  "docs/data-contract.md",
  "docs/bare-metal-fleet-production.md",
  "docs/e2e-data-platform.md",
  "docs/lakehouse-operations.md",
  "docs/customer-productization.md",
  "docs/backend-ingestion.md",
  "docs/operator-walkthrough.md",
  "docs/neo-cloud-provider-fit.md",
  "docs/provider-export-template.md",
  "docs/neo-cloud-pilot-validation.md",
  "docs/redfish-integration.md",
  "docs/telemetry-integration.md",
  "docs/operations.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-logistics.md",
  "docs/demo-script.md",
  "docs/demo-release-checklist.md",
  "assets/turbalance-mark.png",
  "assets/turbalance-analytics-logo.png",
  "Dockerfile",
  ".dockerignore",
  "schemas/turba-ingestion.v1.schema.json",
  "schemas/turba-telemetry-batch.v1.schema.json",
  "schemas/turba-source-bundle.v1.schema.json",
  "schemas/turba-workspace.v2.schema.json",
  "grafana/turbalance-provider-overview.json",
  "lib/source-bundle-validator.js",
  "lib/source-approval-validator.js",
  "ops/pilot-provider.config.example.json",
  "ops/pilot-provider.sandbox.json",
  "ops/source-contracts.example.json",
  "ops/source-contracts.sandbox.json",
  "ops/source-approvals.example.json",
  "ops/source-approvals.sandbox.json",
  "ops/lakehouse-production.env.example",
  "ops/lakehouse-production.values.example.json",
  "ops/turbalance-product.example.json",
  "ops/lakehouse-ebpf-hosts.example.json",
  "ops/lakehouse-slo-policy.example.json",
  "ops/kubernetes/ingestion-configmap.yaml",
  "ops/kubernetes/ingestion-secret.example.yaml",
  "ops/kubernetes/ingestion-serviceaccount.yaml",
  "ops/kubernetes/ingestion-deployment.yaml",
  "ops/kubernetes/ingestion-retention-cronjob.yaml",
  "ops/kubernetes/provider-export-cronjob.yaml",
  "ops/kubernetes/ingestion-service-monitor.yaml",
  "ops/kubernetes/ingestion-prometheus-rules.yaml",
  "ops/kubernetes/spark1-kafka.yaml",
  "ops/kubernetes/spark1-kafka-smoke-job.yaml",
  "server/ingestion-oidc.js",
  "server/ingestion-server.js",
  "server/ingestion-secrets.js",
  "server/ingestion-storage.js",
  "scripts/build-provider-overlay.js",
  "scripts/build-provider-pilot-bundle.js",
  "scripts/build-scheduler-overlay.js",
  "scripts/build-ebpf-overlay.js",
  "scripts/build-publish-ingestion-image.js",
  "scripts/generate-provider-pilot-config.js",
  "scripts/collect-local-machine-bundle.js",
  "scripts/collect-machine-fleet-bundle.js",
  "scripts/push-live-machine-telemetry.js",
  "scripts/rollout-production-fleet.js",
  "scripts/render-product-runtime.js",
  "scripts/turbalance-doctor.js",
  "scripts/turbalance-support-bundle.js",
  "scripts/package-product-release.js",
  "scripts/manage-product-release.js",
  "scripts/manage-product-controller-services.js",
  "scripts/manage-product-observability.js",
  "scripts/generate-product-edge-tls.js",
  "scripts/manage-product-edge.js",
  "scripts/generate-product-secrets.js",
  "scripts/apply-product-security.js",
  "scripts/check-spark1-kafka.js",
  "scripts/prepare-demo.js",
  "scripts/validate-provider-readiness.js",
  "scripts/run-provider-go-live-gates.js",
  "scripts/run-sandbox-go-live.js",
  "scripts/run-sandbox-source-gateway.js",
  "scripts/fetch-source-system-export.js",
  "scripts/fetch-redfish-source-export.js",
  "scripts/fetch-prometheus-source-export.js",
  "scripts/render-managed-kubernetes.js",
  "scripts/validate-source-contracts.js",
  "scripts/validate-source-approvals.js",
  "scripts/run-live-pilot-burn-in.js",
  "scripts/validate-source-bundle.js",
  "scripts/run-screenshot-qa.js",
  "scripts/run-retention-job.js",
  "scripts/provision-tenant.js",
  "scripts/provision-customer-iam.js",
  "scripts/run-provider-pilot-export-job.js",
  "scripts/build-lakehouse-platform-images.js",
  "scripts/render-lakehouse-secrets.js",
  "scripts/render-lakehouse-kustomize-overlay.js",
  "scripts/render-lakehouse-single-host-overlay.js",
  "scripts/package-lakehouse-release.js",
  "scripts/validate-lakehouse-production-config.js",
  "scripts/generate-lakehouse-production-env.js",
  "scripts/create-lakehouse-production-env-from-values.js",
  "scripts/validate-lakehouse-secret-material.js",
  "scripts/sync-lakehouse-aws-secrets.js",
  "scripts/validate-lakehouse-externalsecrets.js",
  "scripts/validate-lakehouse-image-registry.js",
  "scripts/generate-lakehouse-image-lock.js",
  "scripts/sign-lakehouse-images.js",
  "scripts/validate-lakehouse-live-observability.js",
  "scripts/validate-lakehouse-terraform.js",
  "scripts/run-lakehouse-terraform-rollout.js",
  "scripts/validate-lakehouse-kubernetes-release.js",
  "scripts/validate-lakehouse-secret-iam-consistency.js",
  "scripts/validate-lakehouse-ebpf-probe-package.js",
  "scripts/validate-lakehouse-live-prerequisites.js",
  "scripts/validate-lakehouse-release-supply-chain.js",
  "scripts/package-lakehouse-native-ebpf.js",
  "scripts/generate-lakehouse-change-window.js",
  "scripts/create-lakehouse-production-activation-bundle.js",
  "scripts/prepare-lakehouse-target-host.js",
  "scripts/prepare-lakehouse-local-registry.js",
  "scripts/bootstrap-lakehouse-production-material.js",
  "scripts/prepare-lakehouse-operator-workstation.js",
  "scripts/run-lakehouse-image-release.js",
  "scripts/report-lakehouse-production-gaps.js",
  "scripts/validate-lakehouse-slo-policy.js",
  "scripts/prepare-screenshot-qa.js",
  "scripts/collect-lakehouse-ebpf-rollout-evidence.js",
  "scripts/audit-lakehouse-production-readiness.js",
  "scripts/run-lakehouse-go-live.js",
  "scripts/run-lakehouse-production-smoke.js",
  "scripts/run-lakehouse-load-test.js",
  "scripts/run-lakehouse-cluster-smoke.js",
  "scripts/run-lakehouse-burn-in.js",
  "scripts/run-ebpf-fleet-validation.js",
  "scripts/validate-ebpf-agent-host.js",
  "scripts/validate-lakehouse-security.js",
  "scripts/validate-lakehouse-alerts-dashboards.js",
  "scripts/generate-telemetry-protos.sh",
  "proto/telemetry/v1/telemetry_batch.proto",
  "services/platform_common/platform_common/contracts.py",
  "services/platform_common/platform_common/observability.py",
  "services/raw-writer/raw_writer/writer.py",
  "services/raw-writer/raw_writer/storage.py",
  "services/raw-writer/raw_writer/operations.py",
  "services/raw-writer/raw_writer/retention.py",
  "services/collector-gateway/collector_gateway/app.py",
  "services/collector-gateway/collector_gateway/security.py",
  "services/collector-gateway/collector_gateway/identity.py",
  "services/collector-gateway/collector_gateway/queue.py",
  "services/collector-gateway/collector_gateway/backpressure.py",
  "services/collector-gateway/collector_gateway/replay.py",
  "services/collector-gateway/collector_gateway/__main__.py",
  "services/collector-gateway/collector_gateway/grpc_server.py",
  "services/queue-gateway/queue_gateway/app.py",
  "services/discovery-api/discovery_api/app.py",
  "services/discovery-api/discovery_api/certificates.py",
  "services/discovery-api/discovery_api/store.py",
  "services/duckdb-query-service/duckdb_query_service/query.py",
  "services/transform-runner/transform_runner/runner.py",
  "services/transform-runner/transform_runner/validation.py",
  "services/alert-engine/alert_engine/engine.py",
  "services/alert-engine/alert_engine/router.py",
  "services/alert-engine/alert_engine/store.py",
  "services/api-server/api_server/app.py",
  "services/api-server/api_server/auth.py",
  "orchestration/dagster/turbalance_assets.py",
  "orchestration/dagster/workspace.yaml",
  "lakehouse/duckdb/views.sql",
  "lakehouse/sqlmesh/config.yaml",
  "lakehouse/sqlmesh/models/vs_resource_pressure_1m.sql",
  "lakehouse/sqlmesh/models/vs_cpu_gpu_ram_net_covariance.sql",
  "lakehouse/sqlmesh/models/vs_principal_resource_mode.sql",
  "lakehouse/sqlmesh/models/vs_gpu_starvation.sql",
  "lakehouse/sqlmesh/models/vs_network_gpu_coupling.sql",
  "lakehouse/sqlmesh/models/vs_noisy_neighbor.sql",
  "lakehouse/sqlmesh/models/vs_input_pipeline_stall.sql",
  "lakehouse/sqlmesh/models/vs_alert_candidates.sql",
  "lakehouse/dbt/dbt_project.yml",
  "lakehouse/dbt/models/raw_metric_rows.sql",
  "lakehouse/dbt/models/vs_resource_pressure_1m.sql",
  "lakehouse/dbt/models/vs_cpu_gpu_ram_net_covariance.sql",
  "lakehouse/dbt/models/vs_principal_resource_mode.sql",
  "lakehouse/dbt/models/vs_gpu_starvation.sql",
  "lakehouse/dbt/models/vs_network_gpu_coupling.sql",
  "lakehouse/dbt/models/vs_noisy_neighbor.sql",
  "lakehouse/dbt/models/vs_input_pipeline_stall.sql",
  "lakehouse/dbt/models/vs_alert_candidates.sql",
  "deploy/docker/lakehouse-compose.yml",
  "deploy/docker/fleet-observability-compose.yml",
  "deploy/docker/Dockerfile.ebpf-agent",
  "deploy/docker/Dockerfile.platform-service",
  "deploy/docker/Dockerfile.platform-worker",
  "deploy/docker/Dockerfile.dagster",
  "deploy/docker/Dockerfile.sqlmesh",
  "deploy/docker/otel-collector-config.yaml",
  "deploy/docker/otel-collector-config.production.yaml",
  "deploy/systemd/turbalance-live-machine-agent.env.example",
  "deploy/systemd/turbalance-live-machine-agent.service",
  "deploy/systemd/turbalance-machine-benchmark.service",
  "deploy/systemd/turbalance-machine-benchmark.timer",
  "deploy/docker/grafana/provisioning/datasources/turbalance-api.yml",
  "deploy/docker/grafana/provisioning/dashboards/lakehouse.yml",
  "ops/kubernetes/lakehouse-platform.yaml",
  "ops/kubernetes/lakehouse-agent-daemonset.yaml",
  "ops/kubernetes/lakehouse-queue-gateway.yaml",
  "ops/kubernetes/lakehouse-platform-auth-secrets.yaml",
  "ops/kubernetes/lakehouse-alert-routing.yaml",
  "ops/kubernetes/lakehouse-consul-auth.yaml",
  "ops/kubernetes/lakehouse-managed-storage.yaml",
  "ops/kubernetes/lakehouse-otel-backend-secret.yaml",
  "ops/kubernetes/lakehouse-otel-collector.yaml",
  "ops/kubernetes/lakehouse-mtls.yaml",
  "ops/kubernetes/mtls/kustomization.yaml",
  "ops/kubernetes/lakehouse/base/kustomization.yaml",
  "ops/kubernetes/lakehouse/managed-storage/kustomization.yaml",
  "ops/kubernetes/lakehouse/otel-backend/kustomization.yaml",
  "ops/kubernetes/lakehouse/otel-backend/otel-backend-config-patch.yaml",
  "ops/kubernetes/lakehouse/production/kustomization.yaml",
  "ops/kubernetes/lakehouse/production/production-config-patch.yaml",
  "ops/kubernetes/lakehouse/production/delete-placeholder-secrets.yaml",
  "ops/kubernetes/lakehouse/spire/kustomization.yaml",
  "ops/kubernetes/lakehouse/consul/kustomization.yaml",
  "ops/kubernetes/lakehouse-prometheus-rules.yaml",
  "ops/otel/bare-metal-agent.yaml",
  "ops/otel/bare-metal-agent-local.yaml",
  "ops/terraform/lakehouse/aws/versions.tf",
  "ops/terraform/lakehouse/aws/variables.tf",
  "ops/terraform/lakehouse/aws/main.tf",
  "ops/terraform/lakehouse/aws/outputs.tf",
  "requirements-platform.txt",
  "agents/ebpf-agent/Cargo.toml",
  "agents/ebpf-agent/README.md",
  "agents/ebpf-agent/probes/README.md",
  "agents/ebpf-agent/probes/procfs-summary.sh",
  "agents/ebpf-agent/probes/native-ebpf-readiness.sh",
  "agents/ebpf-agent/probes/probe-manifest.json",
  "agents/ebpf-agent/native/README.md",
  "agents/ebpf-agent/native/Makefile",
  "agents/ebpf-agent/native/turbalance_native.bpf.c",
  "agents/ebpf-agent/native/turbalance_native_loader.c",
  "frontend/react/package.json",
  "frontend/react/package-lock.json",
  "frontend/react/src/App.tsx",
  "frontend/react/src/api.ts",
  "grafana/turbalance-lakehouse-virtual-sensors.json",
  "fixtures/prometheus-collector-queries.json",
  "fixtures/provider-overlay-template.json",
  "fixtures/provider-pilot-export-inputs/prometheus.json",
  "fixtures/provider-pilot-export-inputs/redfish.json",
  "fixtures/redfish-source-snapshot.json",
  "fixtures/scheduler-export-inputs/scheduler-events.json",
  "fixtures/ebpf-export-inputs/host-samples.json",
  "fixtures/provider-export-inputs/kubernetes-jobs.json",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/provider-image.yml",
  ".github/workflows/lakehouse-platform.yml",
  ".github/workflows/sandbox-go-live.yml",
  ".github/workflows/visual-qa.yml",
  "build/turbalance-analytics-desktop.png",
  "build/turbalance-analytics-mobile.png"
].forEach((relativePath) => {
  assert.ok(exists(relativePath), `${relativePath} should exist`);
});

[
  "docs/data-contract.md",
  "docs/bare-metal-fleet-production.md",
  "docs/e2e-data-platform.md",
  "docs/lakehouse-operations.md",
  "docs/backend-ingestion.md",
  "docs/operator-walkthrough.md",
  "docs/neo-cloud-provider-fit.md",
  "docs/provider-export-template.md",
  "docs/neo-cloud-pilot-validation.md",
  "docs/redfish-integration.md",
  "docs/telemetry-integration.md",
  "docs/operations.md",
  "docs/visual-qa.md",
  "docs/deployment.md",
  "docs/demo-logistics.md",
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
  "scripts/generate-provider-pilot-config.js",
  "scripts/collect-local-machine-bundle.js",
  "scripts/collect-machine-fleet-bundle.js",
  "scripts/push-live-machine-telemetry.js",
  "scripts/rollout-production-fleet.js",
  "scripts/run-live-lakehouse-fleet.js",
  "scripts/prepare-demo.js",
  "scripts/validate-provider-readiness.js",
  "scripts/run-provider-go-live-gates.js",
  "scripts/run-sandbox-go-live.js",
  "scripts/run-sandbox-source-gateway.js",
  "scripts/fetch-source-system-export.js",
  "scripts/fetch-redfish-source-export.js",
  "scripts/fetch-prometheus-source-export.js",
  "scripts/render-managed-kubernetes.js",
  "scripts/validate-source-contracts.js",
  "scripts/validate-source-approvals.js",
  "scripts/run-live-pilot-burn-in.js",
  "scripts/validate-source-bundle.js",
  "scripts/run-screenshot-qa.js",
  "scripts/run-retention-job.js",
  "scripts/provision-tenant.js",
  "scripts/provision-customer-iam.js",
  "scripts/run-provider-pilot-export-job.js",
  "scripts/build-lakehouse-platform-images.js",
  "scripts/render-lakehouse-secrets.js",
  "scripts/render-lakehouse-kustomize-overlay.js",
  "scripts/render-lakehouse-single-host-overlay.js",
  "scripts/package-lakehouse-release.js",
  "scripts/validate-lakehouse-production-config.js",
  "scripts/generate-lakehouse-production-env.js",
  "scripts/create-lakehouse-production-env-from-values.js",
  "scripts/validate-lakehouse-secret-material.js",
  "scripts/sync-lakehouse-aws-secrets.js",
  "scripts/validate-lakehouse-externalsecrets.js",
  "scripts/validate-lakehouse-image-registry.js",
  "scripts/generate-lakehouse-image-lock.js",
  "scripts/sign-lakehouse-images.js",
  "scripts/validate-lakehouse-live-observability.js",
  "scripts/validate-lakehouse-terraform.js",
  "scripts/run-lakehouse-terraform-rollout.js",
  "scripts/validate-lakehouse-kubernetes-release.js",
  "scripts/validate-lakehouse-secret-iam-consistency.js",
  "scripts/validate-lakehouse-ebpf-probe-package.js",
  "scripts/validate-lakehouse-live-prerequisites.js",
  "scripts/validate-lakehouse-release-supply-chain.js",
  "scripts/package-lakehouse-native-ebpf.js",
  "scripts/generate-lakehouse-change-window.js",
  "scripts/create-lakehouse-production-activation-bundle.js",
  "scripts/prepare-lakehouse-target-host.js",
  "scripts/prepare-lakehouse-local-registry.js",
  "scripts/bootstrap-lakehouse-production-material.js",
  "scripts/prepare-lakehouse-operator-workstation.js",
  "scripts/run-lakehouse-image-release.js",
  "scripts/report-lakehouse-production-gaps.js",
  "scripts/validate-lakehouse-slo-policy.js",
  "scripts/prepare-screenshot-qa.js",
  "scripts/collect-lakehouse-ebpf-rollout-evidence.js",
  "scripts/audit-lakehouse-production-readiness.js",
  "scripts/run-lakehouse-go-live.js",
  "scripts/run-lakehouse-production-smoke.js",
  "scripts/run-lakehouse-load-test.js",
  "scripts/run-lakehouse-cluster-smoke.js",
  "scripts/run-lakehouse-burn-in.js",
  "scripts/run-ebpf-fleet-validation.js",
  "scripts/validate-ebpf-agent-host.js",
  "scripts/validate-lakehouse-security.js",
  "scripts/validate-lakehouse-alerts-dashboards.js",
  "scripts/generate-telemetry-protos.sh",
  "tests/platform-lakehouse.test.js",
  "tests/lakehouse-go-live.test.js",
  "tests/lakehouse-production-readiness.test.js",
  "services/platform_common/platform_common/observability.py",
  "services/raw-writer/raw_writer/writer.py",
  "services/raw-writer/raw_writer/storage.py",
  "services/raw-writer/raw_writer/operations.py",
  "services/collector-gateway/collector_gateway/app.py",
  "services/collector-gateway/collector_gateway/security.py",
  "services/collector-gateway/collector_gateway/identity.py",
  "services/collector-gateway/collector_gateway/queue.py",
  "services/collector-gateway/collector_gateway/backpressure.py",
  "services/collector-gateway/collector_gateway/replay.py",
  "services/collector-gateway/collector_gateway/grpc_server.py",
  "services/queue-gateway/queue_gateway/app.py",
  "services/duckdb-query-service/duckdb_query_service/query.py",
  "services/transform-runner/transform_runner/runner.py",
  "services/transform-runner/transform_runner/validation.py",
  "services/alert-engine/alert_engine/engine.py",
  "services/alert-engine/alert_engine/router.py",
  "services/alert-engine/alert_engine/store.py",
  "services/api-server/api_server/app.py",
  "services/api-server/api_server/auth.py",
  "lakehouse/sqlmesh/models/vs_principal_resource_mode.sql",
  "lakehouse/sqlmesh/models/vs_gpu_starvation.sql",
  "lakehouse/sqlmesh/models/vs_alert_candidates.sql",
  "lakehouse/dbt/models/vs_alert_candidates.sql",
  "deploy/docker/lakehouse-compose.yml",
  "deploy/docker/Dockerfile.ebpf-agent",
  "deploy/docker/Dockerfile.dagster",
  "deploy/docker/Dockerfile.sqlmesh",
  "deploy/docker/otel-collector-config.yaml",
  "deploy/docker/otel-collector-config.production.yaml",
  "deploy/docker/grafana/provisioning/datasources/turbalance-api.yml",
  "deploy/docker/grafana/provisioning/dashboards/lakehouse.yml",
  "ops/kubernetes/lakehouse-platform.yaml",
  "ops/kubernetes/lakehouse-agent-daemonset.yaml",
  "ops/kubernetes/lakehouse-queue-gateway.yaml",
  "ops/kubernetes/lakehouse-alert-routing.yaml",
  "ops/kubernetes/lakehouse-managed-storage.yaml",
  "ops/kubernetes/lakehouse-otel-backend-secret.yaml",
  "ops/kubernetes/lakehouse-otel-collector.yaml",
  "ops/kubernetes/lakehouse-mtls.yaml",
  "ops/kubernetes/mtls/kustomization.yaml",
  "ops/kubernetes/lakehouse/base/kustomization.yaml",
  "ops/kubernetes/lakehouse/managed-storage/kustomization.yaml",
  "ops/kubernetes/lakehouse/otel-backend/kustomization.yaml",
  "ops/kubernetes/lakehouse/spire/kustomization.yaml",
  "ops/kubernetes/lakehouse/production/kustomization.yaml",
  "ops/kubernetes/lakehouse-prometheus-rules.yaml",
  "grafana/turbalance-lakehouse-virtual-sensors.json",
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
  "tests/provider-config-generator.test.js",
  "tests/prepare-demo.test.js",
  "tests/local-machine-bundle.test.js",
  "tests/provider-readiness.test.js",
  "tests/provider-go-live-gates.test.js",
  "tests/sandbox-go-live.test.js",
  "ops/pilot-provider.sandbox.json",
  "ops/source-contracts.sandbox.json",
  "ops/source-approvals.sandbox.json",
  "tests/neo-cloud-provider-fixture.test.js",
  "tests/provider-exporter.test.js",
  "tests/scheduler-exporter.test.js",
  "tests/ebpf-exporter.test.js",
  "tests/prometheus-source-exporter.test.js",
  "tests/redfish-source-exporter.test.js",
  "tests/spark1-kafka.test.js",
  "tests/source-system-collectors.test.js",
  "tests/source-contracts.test.js",
  "tests/source-approvals.test.js",
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
const lakehousePlatformWorkflow = read(".github/workflows/lakehouse-platform.yml");
const sandboxGoLiveWorkflow = read(".github/workflows/sandbox-go-live.yml");

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
assert.ok(lakehousePlatformWorkflow.includes("scripts/build-lakehouse-platform-images.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/package-lakehouse-release.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/validate-lakehouse-release-supply-chain.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/validate-lakehouse-kubernetes-release.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/validate-lakehouse-slo-policy.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/generate-lakehouse-image-lock.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/validate-lakehouse-secret-material.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/sign-lakehouse-images.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/package-lakehouse-native-ebpf.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/generate-lakehouse-change-window.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/create-lakehouse-production-activation-bundle.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/prepare-lakehouse-target-host.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/prepare-lakehouse-local-registry.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/render-lakehouse-single-host-overlay.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/bootstrap-lakehouse-production-material.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/prepare-lakehouse-operator-workstation.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/run-lakehouse-image-release.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/report-lakehouse-production-gaps.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/prepare-screenshot-qa.js"));
assert.ok(lakehousePlatformWorkflow.includes("tests/lakehouse-production-readiness.test.js"));
assert.ok(lakehousePlatformWorkflow.includes("scripts/run-lakehouse-production-smoke.js"));
assert.ok(lakehousePlatformWorkflow.includes("queue_broker_url"));
assert.ok(lakehousePlatformWorkflow.includes("raw-writer"));
assert.ok(lakehousePlatformWorkflow.includes("transform-runner"));
assert.ok(lakehousePlatformWorkflow.includes("actions/upload-artifact"));
assert.ok(sandboxGoLiveWorkflow.includes("scripts/run-sandbox-go-live.js"));
assert.ok(sandboxGoLiveWorkflow.includes("docker/setup-buildx-action"));
assert.ok(sandboxGoLiveWorkflow.includes("actions/upload-artifact"));

const dataContract = read("docs/data-contract.md");
assert.ok(dataContract.includes("turba.ingestion.v1"));
assert.ok(dataContract.includes("turba-source-bundle.v1.schema.json"));
assert.ok(dataContract.includes("turba.workspace.v2"));
assert.ok(dataContract.includes("sources.provider"));
assert.ok(dataContract.includes("sources.scheduler"));
assert.ok(dataContract.includes("sources.grafana"));
assert.ok(dataContract.includes("sources.ebpf"));
assert.ok(dataContract.includes("sources.redfish"));
assert.ok(dataContract.includes("sources.opportunities"));
assert.ok(dataContract.includes("Opportunity Overlay"));
assert.ok(dataContract.includes("Scheduler Event Overlay"));
assert.ok(dataContract.includes("Grafana Handoff Overlay"));
assert.ok(dataContract.includes("Scheduler Simulator"));
assert.ok(dataContract.includes("Markdown evidence pack"));
assert.ok(dataContract.includes("eBPF Host Overlay"));
assert.ok(dataContract.includes("Redfish Hardware Overlay"));
assert.ok(dataContract.includes("Neo-Cloud Provider Overlay"));
assert.ok(dataContract.includes("Validation Behavior"));
assert.ok(dataContract.includes("validate-source-bundle.js"));
assert.ok(dataContract.includes("build-provider-pilot-bundle.js"));
assert.ok(dataContract.includes("fetch-redfish-source-export.js"));

const e2eDataPlatform = read("docs/e2e-data-platform.md");
assert.ok(e2eDataPlatform.includes("Host -> eBPF agent -> collector gateway -> raw writer"));
assert.ok(e2eDataPlatform.includes("Parquet Lake"));
assert.ok(e2eDataPlatform.includes("DuckDB"));
assert.ok(e2eDataPlatform.includes("SQLMesh"));
assert.ok(e2eDataPlatform.includes("dbt-duckdb"));
assert.ok(e2eDataPlatform.includes("Dagster"));
assert.ok(e2eDataPlatform.includes("vs_cpu_gpu_ram_net_covariance"));
assert.ok(e2eDataPlatform.includes("vs_principal_resource_mode"));
assert.ok(e2eDataPlatform.includes("services/raw-writer"));
assert.ok(e2eDataPlatform.includes("collector-gateway"));
assert.ok(e2eDataPlatform.includes("duckdb-query-service"));
assert.ok(e2eDataPlatform.includes("queue/spool backpressure"));
assert.ok(e2eDataPlatform.includes("external queue adapter"));
assert.ok(e2eDataPlatform.includes("queue-gateway"));
assert.ok(e2eDataPlatform.includes("durable spool replay"));
assert.ok(e2eDataPlatform.includes("local-CA certificate issuing"));
assert.ok(e2eDataPlatform.includes("manifest reconciliation"));
assert.ok(e2eDataPlatform.includes("mTLS-ready agent enrollment"));
assert.ok(e2eDataPlatform.includes("collector-mtls-gateway"));
assert.ok(e2eDataPlatform.includes("managed metadata backend selection"));
assert.ok(e2eDataPlatform.includes("API RBAC"));
assert.ok(e2eDataPlatform.includes("JWKS"));
assert.ok(e2eDataPlatform.includes("OpenTelemetry-ready request metrics"));
assert.ok(e2eDataPlatform.includes("OTLP span export"));
assert.ok(e2eDataPlatform.includes("OpenTelemetry Collector scrape/export wiring"));
assert.ok(e2eDataPlatform.includes("render-lakehouse-secrets"));
assert.ok(e2eDataPlatform.includes("render-lakehouse-kustomize-overlay"));
assert.ok(e2eDataPlatform.includes("render-lakehouse-single-host-overlay"));
assert.ok(e2eDataPlatform.includes("run-lakehouse-production-smoke"));
assert.ok(e2eDataPlatform.includes("package-lakehouse-release"));
assert.ok(e2eDataPlatform.includes("run-lakehouse-go-live"));
assert.ok(e2eDataPlatform.includes("validate-lakehouse-production-config"));
assert.ok(e2eDataPlatform.includes("generate-lakehouse-production-env"));
assert.ok(e2eDataPlatform.includes("create-lakehouse-production-env-from-values"));
assert.ok(e2eDataPlatform.includes("validate-lakehouse-secret-material"));
assert.ok(e2eDataPlatform.includes("sync-lakehouse-aws-secrets"));
assert.ok(e2eDataPlatform.includes("validate-lakehouse-externalsecrets"));
assert.ok(e2eDataPlatform.includes("validate-lakehouse-image-registry"));
assert.ok(e2eDataPlatform.includes("generate-lakehouse-image-lock"));
assert.ok(e2eDataPlatform.includes("sign-lakehouse-images"));
assert.ok(e2eDataPlatform.includes("validate-lakehouse-live-observability"));
assert.ok(e2eDataPlatform.includes("validate-lakehouse-terraform"));
assert.ok(e2eDataPlatform.includes("collect-lakehouse-ebpf-rollout-evidence"));
assert.ok(e2eDataPlatform.includes("package-lakehouse-native-ebpf"));
assert.ok(e2eDataPlatform.includes("generate-lakehouse-change-window"));
assert.ok(e2eDataPlatform.includes("create-lakehouse-production-activation-bundle"));
assert.ok(e2eDataPlatform.includes("prepare-lakehouse-target-host"));
assert.ok(e2eDataPlatform.includes("prepare-lakehouse-local-registry"));
assert.ok(e2eDataPlatform.includes("bootstrap-lakehouse-production-material"));
assert.ok(e2eDataPlatform.includes("prepare-lakehouse-operator-workstation"));
assert.ok(e2eDataPlatform.includes("run-lakehouse-image-release"));
assert.ok(e2eDataPlatform.includes("report-lakehouse-production-gaps"));
assert.ok(e2eDataPlatform.includes("audit-lakehouse-production-readiness"));
assert.ok(e2eDataPlatform.includes("run-lakehouse-cluster-smoke"));
assert.ok(e2eDataPlatform.includes("run-lakehouse-burn-in"));
assert.ok(e2eDataPlatform.includes("run-ebpf-fleet-validation"));
assert.ok(e2eDataPlatform.includes("validate-ebpf-agent-host"));
assert.ok(e2eDataPlatform.includes("optional Consul catalog mirroring"));
assert.ok(e2eDataPlatform.includes("ops/terraform/lakehouse/aws"));
assert.ok(e2eDataPlatform.includes("SPIRE and external-CA discovery modes"));
assert.ok(e2eDataPlatform.includes("managed storage ExternalSecret bindings"));
assert.ok(e2eDataPlatform.includes("webhook/Slack/PagerDuty alert routing"));
assert.ok(e2eDataPlatform.includes("ops/kubernetes/lakehouse/base/kustomization.yaml"));
assert.ok(e2eDataPlatform.includes("ops/kubernetes/lakehouse/production/kustomization.yaml"));
assert.ok(readme.includes("docs/e2e-data-platform.md"));

const lakehouseCompose = read("deploy/docker/lakehouse-compose.yml");
assert.ok(lakehouseCompose.includes("transform-runner"));
assert.ok(lakehouseCompose.includes("ebpf-agent"));
assert.ok(lakehouseCompose.includes("TURBALANCE_AGENT_SEQUENCE_PATH"));
assert.ok(lakehouseCompose.includes("TURBALANCE_EBPF_PROBE_COMMAND"));
assert.ok(lakehouseCompose.includes("collector-spool-replay"));
assert.ok(lakehouseCompose.includes("queue-gateway"));
assert.ok(lakehouseCompose.includes("TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND"));
assert.ok(lakehouseCompose.includes("otel-collector"));
assert.ok(lakehouseCompose.includes("OTEL_EXPORTER_OTLP_ENDPOINT"));
assert.ok(lakehouseCompose.includes("13133:13133"));
assert.ok(lakehouseCompose.includes("build/otelcol"));
assert.ok(lakehouseCompose.includes("dagster"));
assert.ok(lakehouseCompose.includes("Dockerfile.sqlmesh"));
assert.ok(lakehouseCompose.includes("grafana/grafana:11.5.2"));
assert.ok(lakehouseCompose.includes("GF_INSTALL_PLUGINS: marcusolsson-json-datasource"));

const lakehouseComposeOtel = read("deploy/docker/otel-collector-config.yaml");
assert.ok(lakehouseComposeOtel.includes("receivers:"));
assert.ok(lakehouseComposeOtel.includes("health_check"));
assert.ok(lakehouseComposeOtel.includes("otlp:"));
assert.ok(lakehouseComposeOtel.includes("prometheus:"));
assert.ok(lakehouseComposeOtel.includes("endpoint: 0.0.0.0:4318"));
assert.ok(lakehouseComposeOtel.includes("exporters: [prometheus, debug]"));

const lakehouseComposeOtelProduction = read("deploy/docker/otel-collector-config.production.yaml");
assert.ok(lakehouseComposeOtelProduction.includes("otlphttp/backend"));
assert.ok(lakehouseComposeOtelProduction.includes("TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT"));
assert.ok(lakehouseComposeOtelProduction.includes("file_storage/production"));
assert.ok(lakehouseComposeOtelProduction.includes("sending_queue"));

const bareMetalFleet = read("docs/bare-metal-fleet-production.md");
assert.ok(bareMetalFleet.includes("node-local live agent"));
assert.ok(bareMetalFleet.includes("rollout-production-fleet"));
assert.ok(bareMetalFleet.includes("turbalance-machine-benchmark.timer"));
assert.ok(bareMetalFleet.includes("node_exporter/cAdvisor/DCGM/OpenTelemetry"));

const livePushAgent = read("scripts/push-live-machine-telemetry.js");
assert.ok(livePushAgent.includes("TURBALANCE_AGENT_SEQUENCE_PATH"));
assert.ok(livePushAgent.includes("TURBALANCE_AGENT_SPOOL_DIR"));
assert.ok(livePushAgent.includes("x-turbalance-signature"));
assert.ok(livePushAgent.includes("replaySpool"));

const fleetRollout = read("scripts/rollout-production-fleet.js");
assert.ok(fleetRollout.includes("PI_FLEET_REMOTES"));
assert.ok(fleetRollout.includes("turbalance-live-machine-agent.service"));
assert.ok(fleetRollout.includes("fleet-observability-compose.yml"));
assert.ok(fleetRollout.includes("StrictHostKeyChecking=accept-new"));

const fleetObservabilityCompose = read("deploy/docker/fleet-observability-compose.yml");
assert.ok(fleetObservabilityCompose.includes("prom/node-exporter"));
assert.ok(fleetObservabilityCompose.includes("gcr.io/cadvisor/cadvisor"));
assert.ok(fleetObservabilityCompose.includes("dcgm-exporter"));
assert.ok(fleetObservabilityCompose.includes("otel/opentelemetry-collector-contrib"));

const liveAgentService = read("deploy/systemd/turbalance-live-machine-agent.service");
assert.ok(liveAgentService.includes("Restart=always"));
assert.ok(liveAgentService.includes("ReadWritePaths=/var/lib/turbalance /var/spool/turbalance"));

const benchmarkTimer = read("deploy/systemd/turbalance-machine-benchmark.timer");
assert.ok(benchmarkTimer.includes("OnUnitActiveSec=15min"));
assert.ok(benchmarkTimer.includes("RandomizedDelaySec=90s"));

const bareMetalOtel = read("ops/otel/bare-metal-agent.yaml");
assert.ok(bareMetalOtel.includes("hostmetrics"));
assert.ok(bareMetalOtel.includes("docker_stats"));
assert.ok(bareMetalOtel.includes("file_storage/fleet"));
assert.ok(bareMetalOtel.includes("sending_queue"));

const lakehouseKubernetes = read("ops/kubernetes/lakehouse-platform.yaml");
assert.ok(lakehouseKubernetes.includes("kind: NetworkPolicy"));
assert.ok(lakehouseKubernetes.includes("kind: ServiceMonitor"));
assert.ok(lakehouseKubernetes.includes("name: collector-spool-replay"));
assert.ok(lakehouseKubernetes.includes("name: dagster"));
assert.ok(lakehouseKubernetes.includes("duckdb-query-service"));
assert.ok(lakehouseKubernetes.includes("discovery-api"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_API_REQUIRE_AUTH"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_API_JWKS"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_API_JWT_ISSUER"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_DISCOVERY_URL"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_DISCOVERY_CERTIFICATE_MODE"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_ALERT_ROUTE_TIMEOUT_SECONDS"));
assert.ok(lakehouseKubernetes.includes("turbalance-api-auth"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_COLLECTOR_MAX_INFLIGHT_WRITES"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_COLLECTOR_QUEUE_BACKEND"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_QUEUE_GATEWAY_BACKEND"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_COLLECTOR_REQUIRE_MTLS"));
assert.ok(lakehouseKubernetes.includes("OTEL_EXPORTER_OTLP_ENDPOINT"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_DISCOVERY_CA_DIR"));
assert.ok(lakehouseKubernetes.includes("TURBALANCE_DISCOVERY_DATABASE_URL"));
assert.ok(lakehouseKubernetes.includes("turbalance-metadata-db"));
assert.ok(lakehouseKubernetes.includes("turbalance-object-store"));
assert.ok(lakehouseKubernetes.includes("turbalance-alert-routing"));
assert.ok(lakehouseKubernetes.includes("lakehouse-reconciliation"));
assert.ok(lakehouseKubernetes.includes("runAsNonRoot: true"));

const lakehouseAgentDaemonSet = read("ops/kubernetes/lakehouse-agent-daemonset.yaml");
assert.ok(lakehouseAgentDaemonSet.includes("kind: DaemonSet"));
assert.ok(lakehouseAgentDaemonSet.includes("privileged: true"));
assert.ok(lakehouseAgentDaemonSet.includes("TURBALANCE_AGENT_MAX_ITERATIONS"));
assert.ok(lakehouseAgentDaemonSet.includes("TURBALANCE_AGENT_SEQUENCE_PATH"));
assert.ok(lakehouseAgentDaemonSet.includes("TURBALANCE_DISCOVERY_ENROLL_URL"));
assert.ok(lakehouseAgentDaemonSet.includes("TURBALANCE_EBPF_PROBE_COMMAND"));

const lakehouseQueueGateway = read("ops/kubernetes/lakehouse-queue-gateway.yaml");
assert.ok(lakehouseQueueGateway.includes("name: queue-gateway"));
assert.ok(lakehouseQueueGateway.includes("configMapRef: { name: turbalance-platform-config }"));
assert.ok(lakehouseQueueGateway.includes("turbalance-collector-queue-auth"));
assert.ok(lakehouseQueueGateway.includes("kind: ServiceMonitor"));

const lakehouseAlertRouting = read("ops/kubernetes/lakehouse-alert-routing.yaml");
assert.ok(lakehouseAlertRouting.includes("TURBALANCE_ALERT_WEBHOOK_URL"));
assert.ok(lakehouseAlertRouting.includes("TURBALANCE_ALERT_SLACK_WEBHOOK_URL"));
assert.ok(lakehouseAlertRouting.includes("TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY"));

const lakehouseManagedStorage = read("ops/kubernetes/lakehouse-managed-storage.yaml");
assert.ok(lakehouseManagedStorage.includes("turbalance-metadata-db"));
assert.ok(lakehouseManagedStorage.includes("turbalance-object-store"));
assert.ok(lakehouseManagedStorage.includes("external-secrets.io/v1"));

const lakehouseOtelBackendSecret = read("ops/kubernetes/lakehouse-otel-backend-secret.yaml");
assert.ok(lakehouseOtelBackendSecret.includes("TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT"));
assert.ok(lakehouseOtelBackendSecret.includes("TURBALANCE_OTEL_BACKEND_AUTHORIZATION"));

const lakehouseOtelCollector = read("ops/kubernetes/lakehouse-otel-collector.yaml");
assert.ok(lakehouseOtelCollector.includes("kind: Deployment"));
assert.ok(lakehouseOtelCollector.includes("otel/opentelemetry-collector-contrib"));
assert.ok(lakehouseOtelCollector.includes("endpoint: 0.0.0.0:4318"));
assert.ok(lakehouseOtelCollector.includes("turbalance-api-server"));
assert.ok(lakehouseOtelCollector.includes("health_check"));
assert.ok(lakehouseOtelCollector.includes("containerPort: 13133"));
assert.ok(lakehouseOtelCollector.includes("exporters: [prometheus, debug]"));

const lakehouseOtelBackendPatch = read("ops/kubernetes/lakehouse/otel-backend/otel-backend-config-patch.yaml");
assert.ok(lakehouseOtelBackendPatch.includes("file_storage/production"));
assert.ok(lakehouseOtelBackendPatch.includes("sending_queue"));

const lakehouseMtls = read("ops/kubernetes/lakehouse-mtls.yaml");
assert.ok(lakehouseMtls.includes("collector-mtls-gateway"));
assert.ok(lakehouseMtls.includes("require_client_certificate: true"));
assert.ok(lakehouseMtls.includes("forward_client_cert_details: SANITIZE_SET"));
assert.ok(lakehouseMtls.includes("turbalance-agent-client-ca"));

const lakehouseMtlsKustomization = read("ops/kubernetes/mtls/kustomization.yaml");
assert.ok(lakehouseMtlsKustomization.includes("TURBALANCE_COLLECTOR_REQUIRE_MTLS"));
assert.ok(lakehouseMtlsKustomization.includes("../lakehouse-mtls.yaml"));

const lakehouseBaseKustomization = read("ops/kubernetes/lakehouse/base/kustomization.yaml");
assert.ok(lakehouseBaseKustomization.includes("../../lakehouse-platform.yaml"));
assert.ok(lakehouseBaseKustomization.includes("../../lakehouse-agent-daemonset.yaml"));
assert.ok(lakehouseBaseKustomization.includes("../../lakehouse-queue-gateway.yaml"));
assert.ok(lakehouseBaseKustomization.includes("../../lakehouse-otel-collector.yaml"));
assert.ok(lakehouseBaseKustomization.includes("../../lakehouse-prometheus-rules.yaml"));

const lakehouseManagedStorageKustomization = read("ops/kubernetes/lakehouse/managed-storage/kustomization.yaml");
assert.ok(lakehouseManagedStorageKustomization.includes("../../lakehouse-managed-storage.yaml"));

const lakehouseOtelBackendKustomization = read("ops/kubernetes/lakehouse/otel-backend/kustomization.yaml");
assert.ok(lakehouseOtelBackendKustomization.includes("../../lakehouse-otel-backend-secret.yaml"));
assert.ok(lakehouseOtelBackendKustomization.includes("turbalance-otel-backend"));

const lakehouseSpireKustomization = read("ops/kubernetes/lakehouse/spire/kustomization.yaml");
assert.ok(lakehouseSpireKustomization.includes("TURBALANCE_DISCOVERY_CERTIFICATE_MODE"));
assert.ok(lakehouseSpireKustomization.includes("SPIFFE_ENDPOINT_SOCKET"));

const lakehouseConsulKustomization = read("ops/kubernetes/lakehouse/consul/kustomization.yaml");
assert.ok(lakehouseConsulKustomization.includes("../../lakehouse-consul-auth.yaml"));
assert.ok(lakehouseConsulKustomization.includes("TURBALANCE_CONSUL_URL"));

const lakehouseProductionKustomization = read("ops/kubernetes/lakehouse/production/kustomization.yaml");
assert.ok(lakehouseProductionKustomization.includes("../base"));
assert.ok(lakehouseProductionKustomization.includes("../../lakehouse-platform-auth-secrets.yaml"));
assert.ok(lakehouseProductionKustomization.includes("../../lakehouse-managed-storage.yaml"));
assert.ok(lakehouseProductionKustomization.includes("../../lakehouse-alert-routing.yaml"));
assert.ok(lakehouseProductionKustomization.includes("../../lakehouse-otel-backend-secret.yaml"));
assert.ok(lakehouseProductionKustomization.includes("../../lakehouse-mtls.yaml"));
assert.ok(lakehouseProductionKustomization.includes("delete-placeholder-secrets.yaml"));
assert.ok(lakehouseProductionKustomization.includes("otel-backend-config-patch.yaml"));
assert.ok(lakehouseProductionKustomization.includes("ghcr.io/your-org/turbalance/api-server"));
assert.ok(lakehouseProductionKustomization.includes("replace-with-release-tag"));

const lakehousePlatformAuthSecrets = read("ops/kubernetes/lakehouse-platform-auth-secrets.yaml");
assert.ok(lakehousePlatformAuthSecrets.includes("lakehouse/collector-auth"));
assert.ok(lakehousePlatformAuthSecrets.includes("lakehouse/api-auth"));

const lakehouseProductionPatch = read("ops/kubernetes/lakehouse/production/production-config-patch.yaml");
assert.ok(lakehouseProductionPatch.includes("TURBALANCE_API_REQUIRE_AUTH: \"true\""));
assert.ok(lakehouseProductionPatch.includes("TURBALANCE_COLLECTOR_REQUIRE_MTLS: \"true\""));
assert.ok(lakehouseProductionPatch.includes("TURBALANCE_COLLECTOR_QUEUE_BACKEND: http"));
assert.ok(lakehouseProductionPatch.includes("TURBALANCE_QUEUE_GATEWAY_BACKEND: kafka"));
assert.ok(lakehouseProductionPatch.includes("s3://replace-with-bucket/turbalance/lakehouse"));

const productionSmoke = read("scripts/run-lakehouse-production-smoke.js");
assert.ok(productionSmoke.includes("run-lakehouse-load-test.js"));
assert.ok(productionSmoke.includes("package-lakehouse-release.js"));
assert.ok(productionSmoke.includes("render-lakehouse-single-host-overlay.js"));
assert.ok(productionSmoke.includes("generate-lakehouse-production-env.js"));
assert.ok(productionSmoke.includes("sync-lakehouse-aws-secrets.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-externalsecrets.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-image-registry.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-live-observability.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-terraform.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-live-prerequisites.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-release-supply-chain.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-slo-policy.js"));
assert.ok(productionSmoke.includes("prepare-screenshot-qa.js"));
assert.ok(productionSmoke.includes("collect-lakehouse-ebpf-rollout-evidence.js"));
assert.ok(productionSmoke.includes("audit-lakehouse-production-readiness.js"));
assert.ok(productionSmoke.includes("run-lakehouse-go-live.js"));
assert.ok(productionSmoke.includes("prepare-lakehouse-target-host.js"));
assert.ok(productionSmoke.includes("bootstrap-lakehouse-production-material.js"));
assert.ok(productionSmoke.includes("prepare-lakehouse-operator-workstation.js"));
assert.ok(productionSmoke.includes("prepare-lakehouse-local-registry.js"));
assert.ok(productionSmoke.includes("run-lakehouse-image-release.js"));
assert.ok(productionSmoke.includes("report-lakehouse-production-gaps.js"));
assert.ok(productionSmoke.includes("run-lakehouse-cluster-smoke.js"));
assert.ok(productionSmoke.includes("run-lakehouse-burn-in.js"));
assert.ok(productionSmoke.includes("run-ebpf-fleet-validation.js"));
assert.ok(productionSmoke.includes("validate-ebpf-agent-host.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-security.js"));
assert.ok(productionSmoke.includes("validate-lakehouse-alerts-dashboards.js"));
assert.ok(productionSmoke.includes("lakehouse-platform-auth-secrets.yaml"));
assert.ok(productionSmoke.includes("lakehouse-managed-storage.yaml"));
assert.ok(productionSmoke.includes("lakehouse-otel-backend-secret.yaml"));

const packageLakehouseRelease = read("scripts/package-lakehouse-release.js");
assert.ok(packageLakehouseRelease.includes("secret-requirements.json"));
assert.ok(packageLakehouseRelease.includes("delete-placeholder-secrets.yaml"));

const singleHostOverlay = read("scripts/render-lakehouse-single-host-overlay.js");
assert.ok(singleHostOverlay.includes("localhost:5000/turbalance"));
assert.ok(singleHostOverlay.includes("TURBALANCE_QUEUE_GATEWAY_BACKEND"));
assert.ok(singleHostOverlay.includes("delete-placeholder-secrets.yaml"));
assert.ok(singleHostOverlay.includes("TURBALANCE_DISCOVERY_DATABASE_URL"));
assert.ok(singleHostOverlay.includes("mkdir -p \\\"$DAGSTER_HOME\\\""));

const buildLakehouseImages = read("scripts/build-lakehouse-platform-images.js");
assert.ok(buildLakehouseImages.includes("raw-writer"));
assert.ok(buildLakehouseImages.includes("transform-runner"));

const lakehouseGoLive = read("scripts/run-lakehouse-go-live.js");
assert.ok(lakehouseGoLive.includes("validate-lakehouse-production-config.js"));
assert.ok(lakehouseGoLive.includes("generate-lakehouse-production-env.js"));
assert.ok(lakehouseGoLive.includes("sync-lakehouse-aws-secrets.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-externalsecrets.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-image-registry.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-live-observability.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-terraform.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-live-prerequisites.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-release-supply-chain.js"));
assert.ok(lakehouseGoLive.includes("validate-lakehouse-slo-policy.js"));
assert.ok(lakehouseGoLive.includes("collect-lakehouse-ebpf-rollout-evidence.js"));
assert.ok(lakehouseGoLive.includes("run-lakehouse-burn-in.js"));
assert.ok(lakehouseGoLive.includes("run-ebpf-fleet-validation.js"));

const terraformLakehouseAws = read("ops/terraform/lakehouse/aws/main.tf");
assert.ok(terraformLakehouseAws.includes("aws_s3_bucket"));
assert.ok(terraformLakehouseAws.includes("aws_db_instance"));
assert.ok(terraformLakehouseAws.includes("aws_msk_cluster"));
assert.ok(terraformLakehouseAws.includes("lakehouse/metadata-db"));
assert.ok(terraformLakehouseAws.includes("lakehouse/consul"));

const lakehousePrometheusRules = read("ops/kubernetes/lakehouse-prometheus-rules.yaml");
assert.ok(lakehousePrometheusRules.includes("TurbalanceCollectorBackpressure"));
assert.ok(lakehousePrometheusRules.includes("turbalance_collector_auth_failures_total"));
assert.ok(lakehousePrometheusRules.includes("TurbalanceCollectorMtlsFailures"));
assert.ok(lakehousePrometheusRules.includes("TurbalanceApiAuthFailures"));
assert.ok(lakehousePrometheusRules.includes("TurbalanceVirtualSensorFreshness"));
assert.ok(lakehousePrometheusRules.includes("TurbalanceEbpfReadinessLow"));

const grafanaApiDatasource = read("deploy/docker/grafana/provisioning/datasources/turbalance-api.yml");
assert.ok(grafanaApiDatasource.includes("marcusolsson-json-datasource"));
assert.ok(grafanaApiDatasource.includes("http://api-server:8080"));

const grafanaLakehouseProvider = read("deploy/docker/grafana/provisioning/dashboards/lakehouse.yml");
assert.ok(grafanaLakehouseProvider.includes("/var/lib/grafana/dashboards/lakehouse"));

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
assert.ok(operations.includes("ops/kubernetes/spark1-kafka.yaml"));
assert.ok(operations.includes("ops/kubernetes/spark1-kafka-smoke-job.yaml"));
assert.ok(operations.includes("scripts/provision-tenant.js"));
assert.ok(operations.includes("scripts/provision-customer-iam.js"));
assert.ok(operations.includes("scripts/render-managed-kubernetes.js"));
assert.ok(operations.includes("scripts/fetch-source-system-export.js"));
assert.ok(operations.includes("redfish"));
assert.ok(operations.includes("scripts/fetch-prometheus-source-export.js"));
assert.ok(operations.includes("scripts/check-spark1-kafka.js"));
assert.ok(operations.includes("scripts/build-publish-ingestion-image.js"));
assert.ok(operations.includes("scripts/generate-provider-pilot-config.js"));
assert.ok(operations.includes("scripts/validate-provider-readiness.js"));
assert.ok(operations.includes("scripts/run-provider-go-live-gates.js"));
assert.ok(operations.includes("scripts/run-sandbox-source-gateway.js"));
assert.ok(operations.includes("scripts/validate-source-contracts.js"));
assert.ok(operations.includes("scripts/validate-source-approvals.js"));
assert.ok(operations.includes("scripts/run-live-pilot-burn-in.js"));
assert.ok(operations.includes("TURBALANCE_OIDC_DISCOVERY_URL"));
assert.ok(operations.includes("managed-postgres-s3"));

const telemetry = read("docs/telemetry-integration.md");
assert.ok(telemetry.includes("Prometheus"));
assert.ok(telemetry.includes("DCGM"));
assert.ok(telemetry.includes("Kubernetes"));
assert.ok(telemetry.includes("Linux eBPF Host Overlay"));
assert.ok(telemetry.includes("Redfish Hardware Overlay"));
assert.ok(telemetry.includes("Grafana Handoff Overlay"));
assert.ok(telemetry.includes("Opportunity Overlay"));
assert.ok(telemetry.includes("NCCL"));
assert.ok(telemetry.includes("Provider Commercial Overlay"));
assert.ok(telemetry.includes("sources.ebpf"));
assert.ok(telemetry.includes("sources.redfish"));
assert.ok(telemetry.includes("sources.grafana"));
assert.ok(telemetry.includes("sources.provider"));
assert.ok(telemetry.includes("sources.scheduler"));
assert.ok(telemetry.includes("sources.opportunities"));
assert.ok(telemetry.includes("scripts/build-ebpf-overlay.js"));
assert.ok(telemetry.includes("scripts/fetch-redfish-source-export.js"));
assert.ok(telemetry.includes("scripts/fetch-source-system-export.js"));
assert.ok(telemetry.includes("scripts/fetch-prometheus-source-export.js"));
assert.ok(telemetry.includes("scripts/check-spark1-kafka.js"));
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
assert.ok(providerFit.includes("Redfish/BMC"));
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
assert.ok(providerTemplate.includes("sources.redfish"));
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
assert.ok(demoScript.includes("scripts/prepare-demo.js"));
assert.ok(demoScript.includes("docs/demo-logistics.md"));
assert.ok(demoScript.includes("SM scheduler"));
assert.ok(demoScript.includes("build/demo/live-machine-bundle.json"));
assert.ok(demoScript.includes("192.168.10.30"));
assert.ok(demoScript.includes("192.168.10.20"));
assert.ok(demoScript.includes("192.168.10.21"));
assert.ok(demoScript.includes("SPARK1"));
assert.ok(demoScript.includes("--live-machine"));
assert.ok(demoScript.includes("100.96.89.98"));
assert.ok(demoScript.includes("DGX-pat"));
assert.ok(demoScript.includes("1 second"));
assert.ok(demoScript.includes("no fabricated multi-node queue or billing/SLO overlay"));
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
assert.ok(demoRelease.includes("scripts/prepare-demo.js"));
assert.ok(demoRelease.includes("docs/demo-logistics.md"));
assert.ok(demoRelease.includes("build/demo/live-machine-bundle.json"));
assert.ok(demoRelease.includes("turbalance-live-machine-collector.service"));
assert.ok(demoRelease.includes("user@192.168.10.21"));
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

const demoLogistics = read("docs/demo-logistics.md");
assert.ok(demoLogistics.includes("Hardware Needed"));
assert.ok(demoLogistics.includes("NVIDIA SM Scheduler Position"));
assert.ok(demoLogistics.includes("scripts/prepare-demo.js"));
assert.ok(demoLogistics.includes("live-machine-bundle.json"));
assert.ok(demoLogistics.includes("192.168.10.20"));
assert.ok(demoLogistics.includes("user@192.168.10.21"));
assert.ok(demoLogistics.includes("SPARK1"));
assert.ok(demoLogistics.includes("standalone `SPARK1`"));
assert.ok(demoLogistics.includes("turbalance-live-machine-collector.service"));
assert.ok(demoLogistics.includes("sudo: ./install.sh: command not found"));
assert.ok(demoLogistics.includes("manually from `/home/user/Analytics`"));
assert.ok(demoLogistics.includes("100.96.89.98"));
assert.ok(demoLogistics.includes("DGX-pat"));
assert.ok(demoLogistics.includes("1 second"));
assert.ok(demoLogistics.includes("tokens-per-second"));
assert.ok(demoLogistics.includes("time-to-first-token"));
assert.ok(demoLogistics.includes("GB10 NVML/gpustat/nvidia-smi"));
assert.ok(demoLogistics.includes("Linux UMA memory"));
assert.ok(demoLogistics.includes("App metrics"));
assert.ok(demoLogistics.includes("Nsight/CUPTI optional profiling exporter"));
assert.ok(demoLogistics.includes("does not pretend Kubernetes, DCGM, eBPF"));
assert.ok(demoLogistics.includes("fixtures/neo-cloud-provider-bundle.json"));
assert.ok(demoLogistics.includes("MPS/MIG"));
assert.ok(demoLogistics.includes("one Linux NVIDIA GPU node"));
assert.ok(demoLogistics.includes("NVIDIA GeForce RTX 4090"));
assert.ok(demoLogistics.includes("scripts/check-spark1-kafka.js"));
assert.ok(demoLogistics.includes("SPARK1 Kafka smoke test passed"));

const metricCapabilityMatrix = read("docs/metric-capability-matrix.md");
assert.ok(metricCapabilityMatrix.includes("native_os"));
assert.ok(metricCapabilityMatrix.includes("GB10 NVML/gpustat/nvidia-smi"));
assert.ok(metricCapabilityMatrix.includes("Linux UMA memory"));
assert.ok(metricCapabilityMatrix.includes("App metrics"));
assert.ok(metricCapabilityMatrix.includes("Nsight/CUPTI optional profiling exporter"));

console.log("docs and workflows tests passed");
