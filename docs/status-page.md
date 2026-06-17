# Status Page Model

Managed SaaS deployments need a public or customer-visible status page. Appliance
deployments can use the same component model internally.

## Components

- Dashboard/API
- Controlled ingestion API
- Collector gateway
- Lakehouse writer/query tier
- Managed queue
- Managed metadata DB
- Object storage
- Identity provider integration
- Evidence export
- Billing usage export

## Incident States

- Investigating
- Identified
- Monitoring
- Resolved
- Scheduled maintenance

## Update Rules

- P1 incidents: first update within the SLA response target, then every 30
  minutes until resolved or downgraded.
- P2 incidents: daily update or when material state changes.
- Scheduled maintenance: announce at least 5 business days ahead unless it is an
  emergency security maintenance.

## Evidence

Status-page incidents should link internally to the incident record, SLO burn
alert, affected tenants, release version, rollback decision, and post-incident
review. Do not publish tenant identifiers, raw telemetry, secrets, or support
bundle contents on the public page.

