# Design-Partner ROI Validation

Design-partner validation is the sales proof for Turbalance Analytics. The goal
is to prove recovered GPU-hours with real customer numbers while preserving
tenant confidentiality.

## Minimum Cohort

Run 2-3 pilots before claiming production ROI externally. Each pilot should use
real source bundles or controlled ingestion from the customer environment, not
seeded demo data.

## Required Evidence

- Baseline window with allocated GPU-hours, wasted GPU-hours, and cost context.
- Top recommended action, owner, implementation date, and expected impact.
- Post-action window with measured recovered GPU-hours.
- Exported evidence pack and redacted workspace export.
- Customer sign-off for how the ROI number may be used.

## ROI Formula

Recovered GPU-hours are the difference between baseline wasted GPU-hours and
post-action wasted GPU-hours over comparable workload and fleet scope. Recovered
value is recovered GPU-hours multiplied by the customer-approved GPU-hour rate.

Do not add overlapping recommendations together unless the design partner
approves the accounting model.

## Handoff

Store the signed pilot summary outside git. Commit only templates, redacted
examples, and validation scripts. Sales collateral should cite the approved
range, customer permission, scope, and measurement window.

