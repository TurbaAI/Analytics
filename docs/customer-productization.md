# Customer Productization Path

This is the narrow customer-ready spine for the bare-metal NUC/SPARK/Pi deployment. It does not replace the lakehouse production lane; it gives a small pilot customer a repeatable appliance workflow:

1. keep one product config,
2. render controller and agent runtime files,
3. roll out live-machine agents,
4. run a doctor check,
5. produce a redacted support bundle,
6. package a checksummed release with rollback notes.

## Files

- `ops/turbalance-product.example.json`: structured product config for the NUC controller, SPARK/Pi fleet, security defaults, and observability URLs.
- `scripts/render-product-runtime.js`: renders `controller.env`, per-host agent env files, fleet remotes, and ready-to-run rollout/doctor/support commands.
- `scripts/turbalance-doctor.js`: checks dashboard, API, collector, Prometheus, Grafana, live bundle freshness, runtime containers, and optional remote agent systemd state.
- `scripts/turbalance-support-bundle.js`: writes a redacted `tar.gz` with config, doctor output, runtime file summary, Docker/process snapshots, and optional remote agent snapshots.
- `scripts/package-product-release.js`: creates a checksummed product release directory/tarball with manifest and rollback notes.
- `scripts/manage-product-release.js`: installs, updates, and rolls back packaged releases under an install root with backups and a `current` symlink.
- `scripts/manage-product-controller-services.js`: installs/restarts/stops/status-checks dashboard, API, collector, and live-fleet controller services under systemd.
- `scripts/manage-product-observability.js`: starts/stops/status-checks the Grafana/Prometheus runtime stack and uses the secure Prometheus scrape override when API auth is enabled.
- `scripts/generate-product-edge-tls.js`: creates local CA, server certificate, and default agent client certificate material for the single-controller edge.
- `scripts/manage-product-edge.js`: starts/stops/status-checks the HTTPS and mTLS Nginx edge layer.
- `scripts/generate-product-secrets.js`: creates local-only collector/API tokens and env snippets for a planned auth rollover.

## Render Runtime Material

```sh
node scripts/render-product-runtime.js \
  --config ops/turbalance-product.example.json \
  --out-dir build/product-runtime
```

The report intentionally redacts secret-like values unless `--include-secrets` is used. Keep `--include-secrets` out of normal support workflows.

Important outputs:

- `build/product-runtime/controller.env`
- `build/product-runtime/agents/*.env`
- `build/product-runtime/fleet-remotes.txt`
- `build/product-runtime/rollout-command.sh`
- `build/product-runtime/controller-services-command.sh`
- `build/product-runtime/observability-command.sh`
- `build/product-runtime/product-edge-command.sh`
- `build/product-runtime/doctor-command.sh`
- `build/product-runtime/support-bundle-command.sh`

## Package Release

Create a release bundle before a customer-facing change window:

```sh
node scripts/package-product-release.js \
  --config ops/turbalance-product.example.json \
  --out-dir build/releases
```

The release bundle includes `RELEASE-MANIFEST.json`, `checksums.json`, `checksums.sha256`, `product-config.redacted.json`, and `ROLLBACK.md`.

## Install, Update, And Roll Back Releases

Use the release manager for customer-facing change windows. It is a dry run unless `--apply` is present.

```sh
node scripts/manage-product-release.js \
  --action install \
  --source build/releases/turbalance-product-0.1.0-live-20260610.tar.gz \
  --install-root /opt/turbalance/product \
  --apply
```

Updates use the same layout and create a timestamped backup of the previous `current` release before switching:

```sh
node scripts/manage-product-release.js \
  --action update \
  --source build/releases/turbalance-product-0.1.0-live-20260610.tar.gz \
  --install-root /opt/turbalance/product \
  --apply
```

Rollback switches `current` back to the previous package recorded in `release-state.json` and backs up the release being replaced:

```sh
node scripts/manage-product-release.js \
  --action rollback \
  --install-root /opt/turbalance/product \
  --apply
```

The install root contains `releases/`, `backups/`, `current`, and `release-state.json`. Controller service managers can point `WorkingDirectory` at `current` once a customer install root is adopted.

## Install Controller Services

The NUC controller should run its long-lived pieces under systemd instead of detached shells:

```sh
node scripts/manage-product-controller-services.js \
  --config ops/turbalance-product.example.json \
  --action install \
  --mode user \
  --apply
```

This manages:

- `turbalance-product-dashboard.service`
- `turbalance-product-collector.service`
- `turbalance-product-api.service`
- `turbalance-product-live-fleet.service`

Use `--mode system` for customer installs with passwordless sudo and boot-time service management. Lab installs without sudo can use `--mode user`; the service manager attempts to enable linger so user-mode services restart after reboot. If the status check still reports `enable-linger-for-boot`, run:

```sh
sudo loginctl enable-linger "$USER"
```

## Generate Security Material

Create local-only auth material before enabling customer access:

```sh
node scripts/generate-product-secrets.js \
  --config ops/turbalance-product.example.json \
  --out-dir build/product-secrets
```

This writes `controller-secure.env`, `agent-auth.env`, `api-tokens`, collector bearer/HMAC secrets, and a redacted report. The product config references these files by path; the rollout helper loads the sensitive values through environment material instead of command-line arguments. Do not use `--rotate` outside a planned rollover, because every agent must receive the new collector credentials.

Apply the staged auth material in a controlled order:

```sh
node scripts/apply-product-security.js \
  --config ops/turbalance-product.example.json \
  --secrets-dir build/product-secrets \
  --apply \
  --out build/product-runtime/security-apply-report.json
```

The helper updates agents first, restarts API/collector with `controller-secure.env`, verifies `/ready`, checks API bearer-token enforcement, and sends one authenticated collector push. It is a dry run unless `--apply` is present.

## Start Observability

When API auth is enabled, Prometheus must scrape the API `/metrics` endpoint with a viewer token instead of disabling API protection. The generated secret material includes `build/product-secrets/api-viewer-token`; the observability manager creates a Docker-readable runtime copy under `build/product-runtime/prometheus-secrets/`, passes that copy to Docker Compose as a mounted secret, and switches Prometheus to `deploy/docker/grafana-runtime/prometheus.secure.yml`.

```sh
node scripts/manage-product-observability.js \
  --config ops/turbalance-product.example.json \
  --action up \
  --secure auto \
  --apply
```

Use `--action status` after startup to check Grafana health, Prometheus readiness, container state, and whether any active Prometheus targets are down.

## Start Product Edge

The single-controller product edge gives pilot deployments a TLS boundary without moving the internal service ports. It starts Nginx in host networking with:

- HTTPS dashboard/API proxy on `https://192.168.10.30:8443`
- mTLS collector proxy on `https://192.168.10.30:9443`

```sh
node scripts/manage-product-edge.js \
  --config ops/turbalance-product.example.json \
  --action up \
  --apply
```

The manager generates local certificate material in `build/product-tls`, starts `turbalance-product-edge`, checks the HTTPS dashboard and `/api/ready`, verifies the collector mTLS path with the generated client certificate, and confirms the mTLS collector endpoint rejects requests without a client certificate.

## Apply Agents

Inspect `build/product-runtime/rollout-command.sh`, then run it from the repo root during the change window. For secured environments, source `build/product-secrets/agent-auth.env` first or use `scripts/apply-product-security.js` so collector credentials are not exposed in process arguments:

```sh
build/product-runtime/rollout-command.sh
```

This uses the existing `scripts/rollout-production-fleet.js` path and systemd units:

- `turbalance-live-machine-agent.service`
- `turbalance-machine-benchmark.service`
- `turbalance-machine-benchmark.timer`

Customer installs should use the default system service mode when passwordless sudo is available. Lab hosts without passwordless sudo can use a rootless user service fallback:

```sh
node scripts/rollout-production-fleet.js \
  --apply \
  --systemd-mode user \
  --remote-root "$HOME/turbalance-analytics" \
  --collector-url http://192.168.10.30:8801/v1/source-bundles \
  --host-url http://192.168.10.30:8000 \
  --benchmarks \
  --remote user@192.168.10.20
```

In user mode the env file is written to `~/.config/turbalance/live-machine-agent.env`, units are written to `~/.config/systemd/user`, and spool/state are kept under `~/.local/state/turbalance`.

## Run Doctor

Controller-only:

```sh
node scripts/turbalance-doctor.js \
  --config ops/turbalance-product.example.json \
  --out build/product-runtime/doctor-report.json
```

Controller plus remote agents:

```sh
node scripts/turbalance-doctor.js \
  --config ops/turbalance-product.example.json \
  --remote-checks \
  --out build/product-runtime/doctor-report.json
```

Doctor status meanings:

- `pass`: all checks passed.
- `warn`: customer-visible service is mostly usable, but freshness, containers, or remote agents need attention.
- `fail`: a required endpoint or critical service is unreachable.

## Support Bundle

```sh
node scripts/turbalance-support-bundle.js \
  --config ops/turbalance-product.example.json \
  --remote-checks \
  --out-dir build/support
```

The bundle redacts token/secret/password/key-like values and includes:

- product config with secrets removed,
- doctor report,
- Git status and diff stat,
- Docker/runtime port snapshots,
- runtime file summary,
- a small live-machine bundle sample when it is below the safety limit,
- optional remote systemd/spool/env snapshots.

## Customer Hardening Gates

Before a pilot moves outside the lab:

- Keep `security.tlsMode` on an HTTPS or mTLS deployment mode. The single-controller default is `edge-self-signed`; customer deployments should replace generated local CA material with customer-managed certificates before external exposure.
- Keep `security.requireApiAuth` enabled and backed by `build/product-secrets/api-tokens` or the customer identity provider.
- Keep collector bearer token and HMAC auth enabled through local secret files or the customer secret manager.
- Store secret material outside git and render only redacted reports for support.
- Run `scripts/turbalance-doctor.js --remote-checks` after each upgrade.
- Attach the support bundle to customer incidents instead of raw logs.

## Current Limit

This productization path is for friendly pilots and single-controller deployments. Larger customers should use the lakehouse production lane in `docs/lakehouse-operations.md`, with managed object storage, production IAM, image signing, Kubernetes overlays, and mTLS/ExternalSecret gates.
