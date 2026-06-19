# Security, Reliability, and Data Governance Posture

This posture is the operating boundary for taking Turbalance Analytics from pilot to production. It ties the existing repo controls to the customer-facing security, reliability, and privacy questions that infrastructure buyers usually ask first.

## Reliability and On-Call

- Availability targets live in `ops/lakehouse-slo-policy.example.json` and are validated by `scripts/validate-lakehouse-slo-policy.js`.
- Platform alerts live in `ops/kubernetes/lakehouse-prometheus-rules.yaml` and cover API availability and latency, collector ingest health, virtual-sensor freshness, eBPF readiness, auth failures, and ExternalSecret readiness.
- Incident routing is wired through `ops/kubernetes/lakehouse-alert-routing.yaml` for webhook, Slack, and PagerDuty sinks.
- Production go-live should run `scripts/run-lakehouse-go-live.js`, `scripts/run-lakehouse-production-smoke.js`, `scripts/run-lakehouse-cluster-smoke.js`, and `scripts/run-lakehouse-burn-in.js` before customer traffic.
- The default incident process is detect, page the owning service team from the SLO policy, freeze deploys, preserve audit and support-bundle evidence, mitigate through rollback or traffic isolation, publish customer-facing impact, and complete a blameless post-incident review with follow-up owners.

## Security Program

- Treat any credential once committed to git as compromised. Rotate live collector bearer tokens and HMAC secrets in the customer secret manager, then force-update any remote branch after the local history scrub is reviewed.
- Threat-model coverage starts with tenant isolation, collector authentication, signed upload URLs, mTLS enrollment, ExternalSecret syncing, image provenance, support-bundle redaction, and S3/RDS/MSK IAM boundaries.
- CI and release lanes must keep `scripts/validate-lakehouse-security.js`, `scripts/validate-lakehouse-release-supply-chain.js`, `scripts/validate-lakehouse-secret-material.js`, `scripts/validate-lakehouse-externalsecrets.js`, and `scripts/validate-lakehouse-secret-iam-consistency.js` green.
- Dependency and vulnerability scanning should run in the customer CI system that owns registry credentials. The repo has image signing, SBOM/release gates, and registry validation; production adoption should add organization policy checks such as Dependabot, OSV/Trivy/Grype, and container admission policies.
- Schedule an external penetration test before broad customer rollout, with specific test cases for tenant breakout, bearer/HMAC replay, JWT/JWKS validation, ExternalSecret scope, support-bundle redaction, upload-key rotation, and mTLS XFCC sanitization.
- SOC 2 Type II readiness should map these controls to access control, change management, incident response, vendor risk, vulnerability management, backup/restore evidence, and customer data deletion evidence over an observation period.

## Data Governance and Privacy

- The product ingests operational telemetry, billing overlays, tenant metadata, scheduler history, support evidence, and optional provider business metrics. Classify all production data as customer confidential unless the tenant contract says otherwise.
- Data residency is controlled by the selected object store, metadata DB, queue, and observability backends. Production configs must use customer-approved regions and managed services before go-live.
- Retention is enforced by tenant policy in `server/ingestion-server.js`, `scripts/run-retention-job.js`, `ops/kubernetes/ingestion-retention-cronjob.yaml`, and raw-writer retention for the lakehouse lane.
- Deletion and right-to-be-forgotten requests should delete or tombstone tenant-scoped uploads, object-store prefixes, metadata rows, audit export copies, support bundles, and derived Parquet partitions according to the customer contract. Keep a deletion evidence record without retaining the deleted payload.
- Support bundles and release artifacts must keep secret-like values redacted and must not include generated `build/` material unless the operator intentionally attaches a regenerated artifact.
- Demo data must remain labelled as demo data. A production deployment should clear the demo boundary by importing a real source bundle, connecting the controlled ingestion API, or using a live feed before any customer-facing screenshots or dashboards are shared.

## Cross-Fleet Benchmark Governance

- Benchmarking is off by default and requires an explicit operator opt-in before percentile context is shown or contribution payloads are prepared.
- Contributions use `schemas/turba-benchmark-contribution.v1.schema.json`, which permits only coarse GPU model, workload class, region class, MFU bucket, and bounded aggregate metrics. Tenant, host, run, user, account, namespace, pod, container, IP, and support identifiers are outside the schema.
- `services/benchmark-commons` suppresses percentile output until the comparison bucket reaches the configured k-anonymity threshold. Buckets below k return only a suppressed status and count.
- Redacted workspaces remain the safe sharing path for support/QBR workflows; benchmark contributions are a separate opt-in aggregate lane and must not be used to reconstruct customer topology or workload identity.
