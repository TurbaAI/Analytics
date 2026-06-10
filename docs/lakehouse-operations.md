# Lakehouse Operations Runbook

This runbook covers the executable lakehouse telemetry path:

```text
agent -> collector-gateway -> raw-writer -> Parquet/DuckDB -> transform-runner -> API/Grafana/Dagster
```

For the current NUC/SPARK/Pi bare-metal rollout path, see `docs/bare-metal-fleet-production.md`.

## Health Checks

- Collector: `GET /health`, `GET /ready`, `GET /metrics` on `collector-gateway:8801`.
- Product API: `GET /health`, `GET /metrics` on `api-server:8080`.
- Discovery: `GET /health` on `discovery-api:8803`.
- Dagster: `dagster dev -w orchestration/dagster/workspace.yaml` or the `dagster` service in `deploy/docker/lakehouse-compose.yml`.

## Collector Backpressure And Replay

The collector admits a bounded number of in-flight writes. When saturated, authenticated requests are written to `TURBALANCE_COLLECTOR_SPOOL_DIR`.

Set `TURBALANCE_COLLECTOR_QUEUE_BACKEND` to `file`, `http`, `nats`, `redpanda`, or `kafka` to publish saturated requests to an external queue adapter before using the local spool fallback. The broker-oriented modes expect `TURBALANCE_COLLECTOR_QUEUE_URL` to point at an internal gateway service that owns broker-specific delivery, retries, and credentials.

The repo includes a deployable HTTP queue gateway at `services/queue-gateway/queue_gateway/app.py` and `ops/kubernetes/lakehouse-queue-gateway.yaml`. Point the collector at it with:

```sh
TURBALANCE_COLLECTOR_QUEUE_BACKEND=http
TURBALANCE_COLLECTOR_QUEUE_URL=http://queue-gateway.turbalance-lakehouse.svc.cluster.local:8804/v1/queue/collector
TURBALANCE_COLLECTOR_QUEUE_TOKEN=...
```

The queue gateway can persist locally or publish to Kafka, Redpanda, or NATS by invoking the broker producer available in its container:

```sh
TURBALANCE_QUEUE_GATEWAY_BACKEND=kafka
TURBALANCE_QUEUE_GATEWAY_BROKER_URL=kafka.kafka.svc.cluster.local:9092
TURBALANCE_QUEUE_GATEWAY_TOPIC=turbalance.collector.telemetry
TURBALANCE_QUEUE_GATEWAY_PRODUCER_COMMAND="kafka-console-producer --bootstrap-server kafka.kafka.svc.cluster.local:9092 --topic turbalance.collector.telemetry"
```

For Redpanda use `TURBALANCE_QUEUE_GATEWAY_BACKEND=redpanda` with `rpk topic produce`; for NATS use `TURBALANCE_QUEUE_GATEWAY_BACKEND=nats` with `nats pub`. Set `TURBALANCE_QUEUE_GATEWAY_DRY_RUN=true` to validate collector overflow routing without touching a broker.

Replay manually:

```sh
PYTHONPATH=services/collector-gateway:services/raw-writer:services/platform_common \
python3 -m collector_gateway \
  --replay-spool \
  --lake-root build/lakehouse \
  --spool-dir build/collector/spool \
  --processed-dir build/collector/processed \
  --dead-letter-dir build/collector/dead-letter
```

Expected result: `status` is `ok`, `failed` is `0`, and `remaining` trends down. Dead-letter files include an `.error.json` reason file.

Load-test smoke:

```sh
node scripts/run-lakehouse-load-test.js --dry-run
node scripts/run-lakehouse-load-test.js --url http://127.0.0.1:8801 --requests 100 --concurrency 8
```

Use `TURBALANCE_COLLECTOR_TOKEN` or `TURBALANCE_COLLECTOR_HMAC_SECRET` to exercise the same auth path as agents.

## Agent Enrollment And Certificate Rotation

Enroll an agent through discovery with `Authorization: Bearer $TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN`. Discovery issues a local-CA client certificate for dev/test and records SPIFFE-style identity metadata.

The Rust agent runs once by default. Set `TURBALANCE_AGENT_MAX_ITERATIONS=0` for daemon mode, `TURBALANCE_AGENT_INTERVAL_SECONDS` for cadence, `TURBALANCE_AGENT_SEQUENCE_PATH` for monotonic sequence persistence, and `TURBALANCE_AGENT_IDENTITY_PATH` for the cached discovery identity response.

Kubernetes host collection is opt-in through `ops/kubernetes/lakehouse-agent-daemonset.yaml`. It is privileged, uses host PID/network context, mounts host proc/sys/bpffs/tracingfs, enrolls with discovery, and posts signed heartbeat/probe telemetry to the collector.

Set `TURBALANCE_EBPF_PROBE_COMMAND` when a host has a compiled eBPF summarizer or loader already installed. The command runs once per agent loop and should emit `metric.name=value` lines; the agent folds those into the signed batch with `source=external-ebpf`.

Rotate:

```sh
curl -X POST \
  -H "Authorization: Bearer $TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttlDays": 30}' \
  http://127.0.0.1:8803/v1/agents/agent-1/certificates/rotate
```

Revoke:

```sh
curl -X POST \
  -H "Authorization: Bearer $TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN" \
  http://127.0.0.1:8803/v1/agents/agent-1/certificates/revoke
```

Production should replace the local CA with SPIRE, cert-manager, Vault PKI, or another managed CA. Use `TURBALANCE_DISCOVERY_CERTIFICATE_MODE=spire` for SPIRE-managed SVIDs, or `TURBALANCE_DISCOVERY_CERTIFICATE_MODE=external-ca` with `TURBALANCE_DISCOVERY_EXTERNAL_CA_COMMAND` for a signer command that reads enrollment JSON on stdin and returns certificate JSON on stdout. `ops/kubernetes/lakehouse/spire/kustomization.yaml` patches discovery and the agent DaemonSet for SPIRE workload API socket access.

## Collector mTLS Identity Enforcement

The collector can require an upstream TLS proxy to forward a trusted Envoy-style `X-Forwarded-Client-Cert` identity. Enable it only when the collector is reachable through a proxy that sanitizes inbound XFCC headers and sets the current client certificate details:

```sh
TURBALANCE_COLLECTOR_REQUIRE_MTLS=true
TURBALANCE_TRUSTED_SPIFFE_PREFIX=spiffe://turbalance.local/
```

When enabled, the collector accepts only SPIFFE URI identities under the trusted prefix. If bearer or HMAC credentials are also configured, those still apply after mTLS identity validation.

For Kubernetes, apply the production overlay from `ops/kubernetes/mtls/kustomization.yaml`. It includes `ops/kubernetes/lakehouse-mtls.yaml`, which defines cert-manager issuer/certificate examples, a `collector-mtls-gateway` Envoy service, XFCC sanitization, and a network policy that only lets the gateway reach the internal collector.

## Metadata Backend

Discovery uses SQLite at `TURBALANCE_DISCOVERY_DB` by default. Set `TURBALANCE_DISCOVERY_DATABASE_URL` to a Postgres DSN to move hosts, agents, services, certificate state, and enrollment metadata into managed Postgres. In Kubernetes, create a `turbalance-metadata-db` secret with key `database-url`; the platform manifest reads it as an optional override.

`ops/kubernetes/lakehouse-managed-storage.yaml` defines ExternalSecret bindings for `turbalance-metadata-db`, `turbalance-object-store`, and queue credentials. Use `ops/kubernetes/lakehouse/managed-storage/kustomization.yaml` when you want those bindings without the full production overlay.

## Object Lake

Use a local filesystem lake for development. For S3 or MinIO, set `TURBALANCE_LAKE_ROOT=s3://bucket/prefix` and provide object-store credentials through `turbalance-object-store` or equivalent environment variables:

```sh
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2
AWS_ENDPOINT_URL=https://minio.example.internal
```

The raw writer and query service both use the same PyArrow-backed storage adapter, so object storage is supported for writes, manifest reconciliation, compaction reads, and virtual sensor queries.

## Kubernetes Release Overlays

Build images with a registry and immutable tag:

```sh
TURBALANCE_IMAGE_REGISTRY=ghcr.io/acme/turbalance \
TURBALANCE_IMAGE_TAG=2026.06.04 \
scripts/build-lakehouse-platform-images.js
```

Use the checked-in base for local cluster smoke tests:

```sh
kubectl apply -k ops/kubernetes/lakehouse/base
```

For production, render an environment-specific overlay and apply it after secrets:

```sh
scripts/render-lakehouse-secrets.js --out build/lakehouse-secrets.yaml

scripts/package-lakehouse-release.js \
  --out build/lakehouse-release \
  --registry ghcr.io/acme/turbalance \
  --tag 2026.06.04 \
  --lake-root s3://acme-observability/turbalance/lakehouse \
  --jwt-issuer https://issuer.acme.internal \
  --jwt-audience turbalance-api \
  --queue-broker-url kafka.prod.svc.cluster.local:9092 \
  --certificate-mode spire

kubectl apply -f build/lakehouse-secrets.yaml
kubectl apply -k build/lakehouse-release/kustomize
```

For a single auditable pass, put production values in an env file based on `ops/lakehouse-production.env.example`, then run:

```sh
node scripts/run-lakehouse-go-live.js \
  --env-file ops/lakehouse-production.env \
  --out-dir build/lakehouse-go-live \
  --apply-infra \
  --build-images \
  --push-images \
  --deploy \
  --burn-in \
  --validate-ebpf
```

Without those live-action flags, the same command performs a dry-run plan, packages the release, and writes `go-live-report.json` plus `go-live-report.md`.

Before the rollout window, assemble and inspect a normalized production env report. Use `--include-secrets` only when writing to a secure location outside source control:

```sh
node scripts/generate-lakehouse-production-env.js \
  --env-file ops/lakehouse-production.env \
  --dry-run \
  --report build/lakehouse-production-readiness/production-env-assembly.json

node scripts/generate-lakehouse-production-env.js \
  --env-file ops/lakehouse-production.env \
  --terraform-output build/terraform-output.json \
  --out build/lakehouse-production.env
```

For a structured values workflow, use `ops/lakehouse-production.values.example.json` as the operator-owned source of truth. Secret values are omitted from the generated env unless `--include-secrets` is passed, and reports redact secret-like keys:

```sh
node scripts/create-lakehouse-production-env-from-values.js \
  --values ops/lakehouse-production.values.json \
  --dry-run \
  --report build/lakehouse-production-readiness/production-values-env-assembly.json

node scripts/create-lakehouse-production-env-from-values.js \
  --values ops/lakehouse-production.values.json \
  --terraform-output build/terraform-output.json \
  --out build/lakehouse-production.env
```

Validate that required production secret material is present without printing the material. Use `--strict` for the real production env; without it, the report is a non-mutating readiness plan:

```sh
node scripts/validate-lakehouse-secret-material.js \
  --env-file ops/lakehouse-production.env \
  --values ops/lakehouse-production.values.json \
  --strict \
  --out build/lakehouse-production-readiness/secret-material.json
```

To generate operator-owned material outside source control, bootstrap into an ignored build directory. This creates random tokens, a JWKS file/private key, an agent CA cert/key, a structured values file, an env file, and a strict validation report:

```sh
node scripts/bootstrap-lakehouse-production-material.js \
  --out-dir build/lakehouse-production-material \
  --force

node scripts/report-lakehouse-production-gaps.js \
  --env-file build/lakehouse-production-material/lakehouse-production.env \
  --values-file build/lakehouse-production-material/lakehouse-production.values.json \
  --target-host user@192.168.10.20 \
  --remote-root /home/user/Analytics \
  --out-dir build/lakehouse-production-gaps-material
```

Before live actions, validate operator workstation tools, credentials, and production env values. Add `--run-live-checks` during the rollout window to execute Docker, Terraform, AWS, and kubectl checks:

```sh
node scripts/prepare-lakehouse-operator-workstation.js \
  --env-file ops/lakehouse-production.env \
  --out build/lakehouse-go-live/operator-workstation.json

node scripts/validate-lakehouse-live-prerequisites.js \
  --env-file ops/lakehouse-production.env \
  --out build/lakehouse-go-live/live-prerequisites.json
```

`ops/kubernetes/lakehouse/production/kustomization.yaml` is a checked-in template with mTLS, queue overflow, object-lake, and API auth defaults enabled. Use `scripts/package-lakehouse-release.js` for strict packaging; it refuses placeholder registry, tag, issuer, lake root, and broker values, and it removes checked-in development Secret resources from the generated production overlay. The generated release includes `secret-requirements.json`, `release-manifest.json`, and checksums.

`ops/terraform/lakehouse/aws/` can provision the S3 lake, RDS Postgres metadata DB, optional MSK broker, IAM policy, and AWS Secrets Manager keys expected by the ExternalSecret manifests, including the optional `lakehouse/consul` token for the Consul overlay. Equivalent provider infrastructure should preserve the same secret keys documented in `secret-requirements.json`.

Validate the Terraform module shape before a live apply:

```sh
node scripts/validate-lakehouse-terraform.js --dir ops/terraform/lakehouse/aws
```

Create auditable Terraform rollout artifacts before the change window. Default mode is non-mutating and records the exact commands; `--plan` captures a real plan and `--apply` captures apply/output evidence:

```sh
node scripts/run-lakehouse-terraform-rollout.js \
  --env-file ops/lakehouse-production.env \
  --dir ops/terraform/lakehouse/aws \
  --out-dir build/lakehouse-go-live/terraform-rollout
```

After the provider infrastructure exists, sync the production env values into AWS Secrets Manager. The dry-run report redacts secret values and shows the exact remote keys that will be updated:

```sh
node scripts/sync-lakehouse-aws-secrets.js \
  --env-file ops/lakehouse-production.env \
  --dry-run \
  --out build/lakehouse-go-live/aws-secret-sync.json

node scripts/sync-lakehouse-aws-secrets.js \
  --env-file ops/lakehouse-production.env
```

Cross-check the release secret contract against ExternalSecret remote refs, Terraform Secrets Manager keys, and S3 lake IAM policy shape:

```sh
node scripts/validate-lakehouse-secret-iam-consistency.js \
  --secret-requirements build/lakehouse-release/secret-requirements.json \
  --out build/lakehouse-go-live/secret-iam-consistency.json
```

Generate release supply-chain evidence after packaging. This emits an SBOM-style file inventory and commands for image SBOM/signing verification; add `--run-syft` or `--require-cosign` in environments where those tools are installed:

```sh
node scripts/validate-lakehouse-release-supply-chain.js \
  --release-dir build/lakehouse-release \
  --registry ghcr.io/acme/turbalance \
  --tag 2026.06.04.2 \
  --out build/lakehouse-go-live/release-supply-chain.json
```

After applying the release overlay, prove the ExternalSecret resources are Ready and that each target Secret contains the keys mounted by workloads:

```sh
node scripts/validate-lakehouse-externalsecrets.js \
  --namespace turbalance-lakehouse \
  --out build/lakehouse-go-live/externalsecrets.json
```

After pushing images, prove every platform image tag is visible to the cluster pull path:

```sh
node scripts/validate-lakehouse-image-registry.js \
  --env-file ops/lakehouse-production.env \
  --out build/lakehouse-go-live/image-registry.json
```

Then lock the exact immutable image references that the change window intends to deploy:

```sh
node scripts/generate-lakehouse-image-lock.js \
  --env-file ops/lakehouse-production.env \
  --out build/lakehouse-go-live/image-lock.json
```

Plan or run cosign signing and verification. Prefer passing the image lock so the commands target immutable digest references:

```sh
node scripts/sign-lakehouse-images.js \
  --env-file ops/lakehouse-production.env \
  --image-lock build/lakehouse-go-live/image-lock.json \
  --dry-run \
  --out build/lakehouse-go-live/image-signatures.json
```

For one image-release lane report, use the wrapper first in dry-run mode, then with live build/push/sign/verify flags during the approved window:

```sh
node scripts/run-lakehouse-image-release.js \
  --env-file ops/lakehouse-production.env \
  --dry-run \
  --out-dir build/lakehouse-go-live/image-release

node scripts/run-lakehouse-image-release.js \
  --env-file ops/lakehouse-production.env \
  --build \
  --push \
  --sign \
  --verify \
  --out-dir build/lakehouse-go-live/image-release
```

Run the full non-mutating readiness audit before the live rollout window:

```sh
node scripts/audit-lakehouse-production-readiness.js \
  --env-file ops/lakehouse-production.env \
  --out-dir build/lakehouse-production-readiness
```

Before applying a rendered release, run the Kubernetes preflight. Use `--server-dry-run` during the rollout window after cluster credentials and CRDs are available:

```sh
node scripts/validate-lakehouse-kubernetes-release.js \
  --namespace turbalance-lakehouse \
  --overlay build/lakehouse-release/kustomize \
  --out build/lakehouse-go-live/kubernetes-release.json
```

Generate the change-window plan and rollback evidence before applying the rendered release. Pass `--previous-overlay` when a known-good prior overlay is available; otherwise the rollback plan uses `kubectl rollout undo` for every lakehouse workload:

```sh
node scripts/generate-lakehouse-change-window.js \
  --env-file ops/lakehouse-production.env \
  --release-dir build/lakehouse-release \
  --out-dir build/lakehouse-go-live/change-window \
  --previous-overlay build/lakehouse-previous-release/kustomize
```

Create the consolidated production activation bundle. The default target host is `user@192.168.10.20`; this also writes a strict target-host eBPF manifest when no `--hosts-file` is supplied:

```sh
node scripts/create-lakehouse-production-activation-bundle.js \
  --env-file ops/lakehouse-production.env \
  --values-file ops/lakehouse-production.values.json \
  --target-host user@192.168.10.20 \
  --remote-root /home/user/Analytics \
  --out-dir build/lakehouse-production-activation
```

Generate a concise report of the remaining production material before the change window. By default this stays non-mutating and does not SSH into the target host; add `--live-target-host` when you want to include the real host probe:

```sh
node scripts/report-lakehouse-production-gaps.js \
  --env-file ops/lakehouse-production.env \
  --values-file ops/lakehouse-production.values.json \
  --target-host user@192.168.10.20 \
  --remote-root /home/user/Analytics \
  --out-dir build/lakehouse-production-gaps

node scripts/report-lakehouse-production-gaps.js \
  --env-file ops/lakehouse-production.env \
  --values-file ops/lakehouse-production.values.json \
  --target-host user@192.168.10.20 \
  --remote-root /home/user/Analytics \
  --live-target-host \
  --out-dir build/lakehouse-production-gaps-live
```

Validate the SLO policy and alert coverage:

```sh
node scripts/validate-lakehouse-slo-policy.js \
  --policy ops/lakehouse-slo-policy.example.json \
  --out build/lakehouse-go-live/slo-policy.json
```

Run live cluster smoke after applying the release:

```sh
node scripts/run-lakehouse-cluster-smoke.js \
  --namespace turbalance-lakehouse \
  --overlay build/lakehouse-release/kustomize
```

Run live API and collector burn-in after the cluster smoke:

```sh
node scripts/run-lakehouse-burn-in.js \
  --api-url https://turbalance-api.acme.internal \
  --collector-url https://collector.acme.internal \
  --requests 100 \
  --concurrency 8
```

Then prove the live user-facing and observability endpoints:

```sh
node scripts/validate-lakehouse-live-observability.js \
  --env-file ops/lakehouse-production.env \
  --api-url https://turbalance-api.acme.internal \
  --grafana-url https://grafana.acme.internal \
  --otel-url https://otel-collector.acme.internal/metrics \
  --prometheus-url https://prometheus.acme.internal \
  --out build/lakehouse-go-live/live-observability.json
```

Plan target-host preparation, then sync and validate the monitored Linux target before enabling eBPF probe commands. The default `--native-build-mode prebuilt` validates the host for a shipped probe artifact and does not require clang on the monitored host:

```sh
node scripts/prepare-lakehouse-target-host.js \
  --target-host user@192.168.10.20 \
  --dry-run \
  --out build/lakehouse-go-live/target-host-prep.json

node scripts/prepare-lakehouse-target-host.js \
  --target-host user@192.168.10.20 \
  --remote-root /home/user/Analytics \
  --sync \
  --validate \
  --out build/lakehouse-go-live/target-host-prep-live.json
```

If non-interactive sudo is unavailable on the target host, keep the repo in a user-owned path. Run `--install-native-deps --native-build-mode host` only when the target itself must compile CO-RE/libbpf probes:

```sh
node scripts/prepare-lakehouse-target-host.js \
  --target-host user@192.168.10.20 \
  --remote-root /home/user/Analytics \
  --sync \
  --validate \
  --out build/lakehouse-go-live/target-host-home-sync.json
```

Validate the repo-shipped probe package and manifest before host rollout:

```sh
node scripts/validate-lakehouse-ebpf-probe-package.js \
  --out build/lakehouse-go-live/ebpf-probe-package.json
```

Create a checksummed native eBPF release bundle for host rollout. Add `--build` only on a Linux build host with clang/LLVM, bpftool, kernel BTF, and libbpf installed:

```sh
node scripts/package-lakehouse-native-ebpf.js \
  --out-dir build/lakehouse-go-live/native-ebpf \
  --archive
```

The native probe source package lives in `agents/ebpf-agent/native/`. Build it on a Linux build host or container with clang/LLVM, bpftool, and libbpf, then ship the resulting artifact and keep monitored hosts on `--native-build-mode prebuilt`. Use `--native-build-mode host` only when compiling directly on monitored hosts, and point `TURBALANCE_EBPF_PROBE_COMMAND` at `turbalance-native-loader --once` after strict host validation passes.

For fleet validation, `ops/lakehouse-ebpf-hosts.example.json` targets `user@192.168.10.20` by default. Adjust it for additional hosts and run:

```sh
node scripts/run-ebpf-fleet-validation.js --hosts-file ops/lakehouse-ebpf-hosts.json
node scripts/collect-lakehouse-ebpf-rollout-evidence.js \
  --hosts-file ops/lakehouse-ebpf-hosts.json \
  --out-dir build/lakehouse-ebpf-rollout
```

## OpenTelemetry Collector

Compose includes `otel-collector` with `deploy/docker/otel-collector-config.yaml`. It receives OTLP HTTP/gRPC on `4318`/`4317`, scrapes service `/metrics` endpoints, exposes normalized Prometheus metrics on `9464`, and exposes collector self-metrics on `8888`.

The Kubernetes base includes `ops/kubernetes/lakehouse-otel-collector.yaml`. Platform services read `OTEL_EXPORTER_OTLP_ENDPOINT` from `turbalance-platform-config`; when set, the shared FastAPI middleware emits dependency-light OTLP HTTP spans while still exposing Prometheus request counters.

Use a real exporter sink by replacing the checked-in debug exporter with your collector backend, for example managed Prometheus/Tempo, Datadog, Honeycomb, or another OTLP-compatible endpoint.

For production OTLP export, use `deploy/docker/otel-collector-config.production.yaml` or `ops/kubernetes/lakehouse/otel-backend/kustomization.yaml`. The Kubernetes overlay reads `TURBALANCE_OTEL_BACKEND_OTLP_ENDPOINT` and `TURBALANCE_OTEL_BACKEND_AUTHORIZATION` from `turbalance-otel-backend`.

## Consul Mirror

Discovery API is the canonical product catalog. Set `TURBALANCE_CONSUL_URL` when a deployment also wants Consul service discovery or KV catalog mirroring. `ops/kubernetes/lakehouse/consul/kustomization.yaml` enables the default in-cluster Consul URL and `ops/kubernetes/lakehouse-consul-auth.yaml` sources the optional Consul token from the provider secret store.

## Product API Auth

The product API is open by default for local development. Set `TURBALANCE_API_REQUIRE_AUTH=true` and provide `TURBALANCE_API_TOKENS` or `TURBALANCE_API_TOKENS_FILE` to enforce tenant-scoped bearer tokens.

Token entries use `tenant:token:role:subject`, where role is `viewer`, `operator`, or `admin`. Viewers can read virtual sensors and alerts, operators can acknowledge or resolve alerts, and admins can query across tenants. The React shell sends `VITE_TURBALANCE_API_TOKEN` as a bearer token when present.

For OIDC/JWKS-backed auth, set `TURBALANCE_API_JWKS`, `TURBALANCE_API_JWKS_PATH`, or `TURBALANCE_API_JWKS_URL` with RS256 keys, then configure:

```sh
TURBALANCE_API_JWT_ISSUER=https://issuer.example
TURBALANCE_API_JWT_AUDIENCE=turbalance-api
TURBALANCE_API_JWT_TENANT_CLAIM=tenant_id
TURBALANCE_API_JWT_ROLE_CLAIM=role
```

Render production Kubernetes secrets from environment values:

```sh
scripts/render-lakehouse-secrets.js --example > build/lakehouse-secrets.example.yaml
TURBALANCE_COLLECTOR_TOKEN=... \
TURBALANCE_COLLECTOR_HMAC_SECRET=... \
TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN=... \
TURBALANCE_API_TOKENS="tenant-a:viewer-token:viewer:tenant-a-viewer" \
TURBALANCE_AGENT_CLIENT_CA_FILE=agent-client-ca.pem \
scripts/render-lakehouse-secrets.js --out build/lakehouse-secrets.yaml
```

## Compaction And Reconciliation

Compact raw partitions after small-file buildup:

```sh
PYTHONPATH=services/raw-writer:services/platform_common \
python3 -m raw_writer \
  --lake-root build/lakehouse \
  --compact-table raw_source_bundle_metric \
  --tenant-id tenant-a \
  --compact-date 2026-06-04 \
  --delete-compacted-inputs
```

Reconcile manifests against lake files:

```sh
PYTHONPATH=services/raw-writer:services/platform_common \
python3 -m raw_writer --lake-root build/lakehouse --reconcile
```

Expected result: `status` is `ok`, with no missing files, row mismatches, or orphan raw files.

## Transform Runtime

Materialize and validate:

```sh
PYTHONPATH=services/transform-runner:services/duckdb-query-service:services/raw-writer:services/platform_common \
python3 -m transform_runner --lake-root build/lakehouse --tenant-id tenant-a

PYTHONPATH=services/transform-runner:services/duckdb-query-service:services/raw-writer:services/platform_common \
python3 -m transform_runner --lake-root build/lakehouse --tenant-id tenant-a --validate
```

Validation checks SQLMesh models, dbt-duckdb models, DuckDB views, raw table queryability, covariance/eigen outputs, expanded virtual sensor queryability, and raw manifest reconciliation.

## Grafana And Alerts

Local Compose exposes Grafana at `http://127.0.0.1:3001`. The provisioned JSON datasource points to `http://api-server:8080`, and the dashboard provider loads `grafana/turbalance-lakehouse-virtual-sensors.json`.

Kubernetes alert rules live in `ops/kubernetes/lakehouse-prometheus-rules.yaml`.

Product alerts can also route through `TURBALANCE_ALERT_WEBHOOK_URL`, `TURBALANCE_ALERT_SLACK_WEBHOOK_URL`, `TURBALANCE_ALERT_PAGERDUTY_ROUTING_KEY`, or `TURBALANCE_ALERT_DRY_RUN_PATH`. Kubernetes production overlays can source those from `ops/kubernetes/lakehouse-alert-routing.yaml`.

Run the production smoke before shipping a release overlay:

```sh
node scripts/run-lakehouse-production-smoke.js
```

The production smoke runs syntax checks, strict release packaging, structured values/env assembly, secret-material validation, target-host preparation planning, image release lane planning, production gap reporting, image registry, image-lock, and cosign signature planning, live prerequisite planning, release supply-chain/SBOM checks, native eBPF package generation, change-window rollback evidence generation, production activation bundle generation for `user@192.168.10.20`, SLO policy validation, Terraform rollout artifact dry-run, secret/IAM consistency checks, Kubernetes release preflight, go-live dry-run, load-test dry-run, cluster smoke dry-run, burn-in dry-run, eBPF probe package and command-contract validation, security hardening checks, and Grafana/alert coverage checks.

For browser visual QA, prepare Playwright locally and then require screenshot checks:

```sh
node scripts/prepare-screenshot-qa.js --install --browsers
TURBALANCE_SCREENSHOT_QA_REQUIRED=1 node scripts/run-screenshot-qa.js
```
