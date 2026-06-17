# Commercial and GTM Plan

This plan turns the productization work into a customer-facing packaging,
pricing, licensing, pilot-validation, and billing posture. It is intentionally
conservative: demo data and example pricing are not customer ROI claims.

## Packaging

### Appliance

The appliance package is for customers who want data to stay inside their
environment. It includes the static dashboard, controlled ingestion API,
collector gateway, lakehouse services, Kubernetes manifests, support bundle
tooling, release packages, and optional managed-backend integrations.

Commercial unit:

- Annual platform subscription per fleet.
- Metered active monitored hosts.
- Metered active GPUs, with GPU-family tiers when required by the order form.
- Optional premium support and onboarding package.

### Managed SaaS

The managed SaaS package is for customers who want Turbalance to operate the
control plane. It uses the same source-bundle and evidence-pack contracts but
adds hosted control-plane operations, status-page commitments, billing usage
export, managed upgrades, and customer-managed identity integration.

Commercial unit:

- Base platform subscription per customer or business unit.
- Active host count and active GPU count over the billing window.
- Optional billable GPU-hour or fleet-size tiers for high-scale providers.
- Storage/retention add-ons for extended evidence retention.

## Metering

The repo treats metering as product telemetry, not licensing enforcement inside
the browser. `ops/commercial-metering.example.json` defines the commercial meter
catalog:

- `active_hosts`
- `active_gpus`
- `fleet_count`
- `billable_gpu_hours`
- `recovered_gpu_hours`
- `evidence_packs_exported`
- `source_bundles_ingested`
- `retention_gb_days`

For SaaS, usage events should be emitted from the controlled ingestion/API lane
after tenant scoping and audit logging. For appliance deployments, usage reports
should be generated locally and shared under the order form.

## Licensing

This repository is proprietary. `LICENSE.md` is the source of truth, and
`package.json` points to that proprietary license file. A customer needs a
signed agreement for evaluation, design-partner, appliance, managed SaaS,
support, redistribution, or production use.

## Design-Partner Validation

The sales proof should be built from 2-3 design partners with real, tenant-safe
data. `ops/design-partner-pilots.example.json` defines the minimum pilot
structure and acceptance criteria:

- Baseline GPU-hours and wasted GPU-hours from source bundles.
- A recommended action with owner and implementation date.
- Post-action GPU-hours and recovered GPU-hours.
- Exported evidence pack and redacted workspace export.
- Customer sign-off that the ROI figure is approved for internal sales use.

Do not use seeded demo data or example fixtures as external ROI claims.

## Billing and Usage Integration

Managed SaaS requires a billing usage export from tenant-scoped API events into
the billing system. The first integration should publish signed monthly usage
records by tenant, meter, quantity, source, and billing period. Appliance
customers can receive the same structure as a local report until a hosted
billing connector is selected.

