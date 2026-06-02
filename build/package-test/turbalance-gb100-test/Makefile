.PHONY: lint test run-local deploy-k8s validate-gpu package-gb100

lint:
	sh -n install.sh
	node --check app.js
	node --check analytics-core.js
	node --check scripts/validate-gb100-telemetry.js
	node --check scripts/package-gb100-telemetry.js
	node --check bin/gb100-telemetry-report
	python3 -m py_compile collectors/app_telemetry_exporter.py collectors/facility_adapter.py collectors/nvml_confidential_collector.py

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
