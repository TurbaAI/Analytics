# Billing and Usage Integration

Managed SaaS needs a billing usage export. Appliance deployments can generate the
same records locally for procurement and renewal conversations.

## Usage Record

Each usage record should include:

- Tenant ID or customer-approved billing surrogate.
- Billing period start and end.
- Meter name from `ops/commercial-metering.example.json`.
- Quantity, unit, source, and confidence.
- Product edition and deployment mode.
- Evidence reference, not raw evidence payload.

## Source of Truth

For SaaS, tenant-scoped API and collector audit logs are the source of truth for
ingested source bundles, active hosts, active GPUs, and evidence exports.
Provider billing overlays can contribute customer-side billable GPU-hour context
but should not override platform usage records unless the order form says so.

## Billing Flow

1. Collect usage events from tenant-scoped API/collector paths.
2. Aggregate by tenant, meter, and billing period.
3. Redact or surrogate tenant identifiers when exporting to non-production
   finance tooling.
4. Reconcile with customer order-form entitlements.
5. Send signed usage records to the billing system.

## Controls

- Usage export must be covered by audit logging.
- Usage records must never include raw customer telemetry or secrets.
- Invoice-impacting meter changes require release-note and changelog entries.

