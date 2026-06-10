.PHONY: lint test run-local deploy-k8s validate-gpu package-gb100

lint:
	sh -n install.sh
	node --check app.js
	node --check analytics-core.js
	node --check scripts/validate-gb100-telemetry.js
	node --check scripts/package-gb100-telemetry.js
	node --check scripts/build-lakehouse-platform-images.js
	node --check scripts/render-lakehouse-secrets.js
	node --check scripts/render-lakehouse-kustomize-overlay.js
	node --check scripts/render-lakehouse-single-host-overlay.js
	node --check scripts/package-lakehouse-release.js
	node --check scripts/validate-lakehouse-production-config.js
	node --check scripts/generate-lakehouse-production-env.js
	node --check scripts/create-lakehouse-production-env-from-values.js
	node --check scripts/validate-lakehouse-secret-material.js
	node --check scripts/sync-lakehouse-aws-secrets.js
	node --check scripts/validate-lakehouse-externalsecrets.js
	node --check scripts/validate-lakehouse-image-registry.js
	node --check scripts/generate-lakehouse-image-lock.js
	node --check scripts/sign-lakehouse-images.js
	node --check scripts/configure-lakehouse-registry-auth.js
	node --check scripts/validate-lakehouse-live-observability.js
	node --check scripts/validate-lakehouse-terraform.js
	node --check scripts/run-lakehouse-terraform-rollout.js
	node --check scripts/validate-lakehouse-kubernetes-release.js
	node --check scripts/prepare-lakehouse-kube-access.js
	node --check scripts/prepare-lakehouse-cluster-prereqs.js
	node --check scripts/validate-lakehouse-secret-iam-consistency.js
	node --check scripts/validate-lakehouse-ebpf-probe-package.js
	node --check scripts/validate-lakehouse-live-prerequisites.js
	node --check scripts/validate-lakehouse-release-supply-chain.js
	node --check scripts/package-lakehouse-native-ebpf.js
	node --check scripts/generate-lakehouse-change-window.js
	node --check scripts/create-lakehouse-production-activation-bundle.js
	node --check scripts/bootstrap-lakehouse-production-material.js
	node --check scripts/prepare-lakehouse-operator-workstation.js
	node --check scripts/prepare-lakehouse-target-host.js
	node --check scripts/prepare-lakehouse-local-registry.js
	node --check scripts/run-lakehouse-image-release.js
	node --check scripts/report-lakehouse-production-gaps.js
	node --check scripts/validate-lakehouse-slo-policy.js
	node --check scripts/prepare-screenshot-qa.js
	node --check scripts/collect-lakehouse-ebpf-rollout-evidence.js
	node --check scripts/audit-lakehouse-production-readiness.js
	node --check scripts/run-lakehouse-go-live.js
	node --check scripts/run-lakehouse-production-smoke.js
	node --check scripts/run-lakehouse-load-test.js
	node --check scripts/run-lakehouse-cluster-smoke.js
	node --check scripts/run-lakehouse-burn-in.js
	node --check scripts/run-ebpf-fleet-validation.js
	node --check scripts/validate-ebpf-agent-host.js
	node --check scripts/validate-lakehouse-security.js
	node --check scripts/validate-lakehouse-alerts-dashboards.js
	node --check scripts/push-live-machine-telemetry.js
	node --check scripts/rollout-production-fleet.js
	node --check scripts/render-product-runtime.js
	node --check scripts/turbalance-doctor.js
	node --check scripts/turbalance-support-bundle.js
	node --check scripts/package-product-release.js
	node --check scripts/manage-product-release.js
	node --check scripts/manage-product-controller-services.js
	node --check scripts/manage-product-observability.js
	node --check scripts/generate-product-edge-tls.js
	node --check scripts/manage-product-edge.js
	node --check scripts/generate-product-secrets.js
	node --check scripts/apply-product-security.js
	node --check bin/gb100-telemetry-report
	python3 -m py_compile collectors/app_telemetry_exporter.py collectors/facility_adapter.py collectors/nvml_confidential_collector.py
	python3 -m py_compile services/platform_common/platform_common/contracts.py services/platform_common/platform_common/analytics.py services/platform_common/platform_common/observability.py
	python3 -m py_compile services/raw-writer/raw_writer/writer.py services/raw-writer/raw_writer/storage.py services/raw-writer/raw_writer/operations.py services/raw-writer/raw_writer/retention.py services/raw-writer/raw_writer/__main__.py
	python3 -m py_compile services/collector-gateway/collector_gateway/app.py services/collector-gateway/collector_gateway/security.py services/collector-gateway/collector_gateway/identity.py services/collector-gateway/collector_gateway/queue.py services/collector-gateway/collector_gateway/backpressure.py services/collector-gateway/collector_gateway/replay.py services/collector-gateway/collector_gateway/grpc_server.py services/collector-gateway/collector_gateway/__main__.py services/discovery-api/discovery_api/app.py services/discovery-api/discovery_api/certificates.py services/discovery-api/discovery_api/consul.py services/discovery-api/discovery_api/store.py
	python3 -m py_compile services/queue-gateway/queue_gateway/app.py
	python3 -m py_compile services/duckdb-query-service/duckdb_query_service/query.py services/duckdb-query-service/duckdb_query_service/app.py
	python3 -m py_compile services/transform-runner/transform_runner/runner.py services/transform-runner/transform_runner/validation.py services/transform-runner/transform_runner/__main__.py
	python3 -m py_compile services/alert-engine/alert_engine/engine.py services/alert-engine/alert_engine/router.py services/alert-engine/alert_engine/store.py services/api-server/api_server/app.py services/api-server/api_server/auth.py
	python3 -m py_compile orchestration/dagster/turbalance_assets.py

test:
	node tests/run-all.js

run-local:
	docker compose -f deploy/docker/docker-compose.yml up

deploy-k8s:
	kubectl apply -f deploy/kubernetes/namespace.yaml
	kubectl -n gb100-telemetry create configmap gb100-dcgm-fields --from-file=gb100-dcgm-fields.csv=metrics/gb100-dcgm-fields.csv --dry-run=client -o yaml | kubectl apply -f -
	kubectl -n gb100-telemetry create configmap gb100-metric-capabilities --from-file=gb100-metric-capabilities.json=metrics/gb100-metric-capabilities.json --dry-run=client -o yaml | kubectl apply -f -
	kubectl -n gb100-telemetry create configmap gb100-app-collector-source --from-file=app_telemetry_exporter.py=collectors/app_telemetry_exporter.py --from-file=facility_adapter.py=collectors/facility_adapter.py --from-file=nvml_confidential_collector.py=collectors/nvml_confidential_collector.py --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -f deploy/kubernetes/gb100-dcgm-exporter-daemonset.yaml
	kubectl apply -f deploy/kubernetes/gb100-app-collector-deployment.yaml

validate-gpu:
	node scripts/validate-gb100-telemetry.js
	./bin/gb100-telemetry-report --out-dir build/gb100-support

package-gb100:
	node scripts/package-gb100-telemetry.js
