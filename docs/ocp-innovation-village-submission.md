# OCP Global Summit 2026 Innovation Village Submission

## Station Title

OCP Benchmark Commons: Member-Owned L6 Benchmark Comparisons for AI Infrastructure

## Submitter

Ahmad Byagowi / Turbalance

## Proposed Area

Innovation Village station aligned with Data Center Telemetry, Hardware Management, Server/HPC, AI hardware/software co-design, and time synchronization communities.

## Public Summary

This station proposes an OCP-hosted Benchmark Commons for member-submitted AI infrastructure benchmark records. The Commons would let OCP members compare delivered hardware quality against comparable production hardware operated by other members, rather than relying only on vendor-owned reference comparisons or their own siloed fleet.

The demo shows a six-level Benchmark Ladder: local metric, one-to-one peer, rack, cluster, fleet, and OCP Commons. The L6 layer imports aggregate corpus results such as peer count, percentile, hardware class, and binning. When a local machine has benchmark samples but no corpus result yet, the tool creates a redacted export record for OCP validation.

## Why It Belongs In Innovation Village

This is an open community proposal, not a commercial product showcase. It asks OCP members to help shape a shared benchmark evidence contract, submission workflow, privacy boundary, and governance model for cross-member hardware comparison.

The station supports hands-on discussion around:

- How members can compare received hardware quality against a neutral aggregate.
- How OCP can reduce vendor-siloed benchmark narratives.
- How vendors can be encouraged to deliver consistently high-quality hardware.
- How benchmark results should be redacted, normalized, and governed.
- How Data Center Telemetry, Hardware Management, Server/HPC, AI, and timing communities can share a common evidence model.

## Demo Experience

Visitors will see:

- A live dashboard with L1 through L6 Benchmark Ladder.
- Local CPU, GPU, memory, network, and disk benchmark cards.
- OCP Commons L6 panel showing corpus, peer count, hardware class, bin, and data policy.
- A generated `turba.ocp_benchmark_commons.v1` export with salted member, host, and run hashes.
- A governance board with open questions for OCP members.

## Community Questions

- Which benchmark suites should be required for each hardware class?
- What k-anonymity threshold should OCP require before showing peer percentiles?
- Should OCP publish percentile bands, exact percentiles, or both?
- What minimum provenance should be required for firmware, accelerator, network, storage, thermal, and power context?
- How should members raise hardware-quality disputes using benchmark evidence?
- Which OCP project group should steward the first schema and validation rules?

## Requested Outcome

Recruit 2-3 design partners and an OCP project home for a small Benchmark Commons working proposal. The first milestone is a member-reviewed schema, a privacy policy for submitted records, and a pilot corpus with enough records to compare at least two hardware classes.

## Non-Commercial Boundary

The station is framed as an OCP community contribution. Turbalance is presented only as a reference implementation that demonstrates the proposed schema and L6 workflow. Commercial product discussion should be redirected outside Innovation Village.

## Materials Available

- Proposal: `docs/ocp-benchmark-commons-proposal.md`
- Reference schema: `schemas/turba-ocp-benchmark-commons.v1.schema.json`
- Export utility: `scripts/export-ocp-benchmark-commons.js`
- Example export: `fixtures/ocp-benchmark-commons.example.json`
- OCP-facing deck: `outputs/ocp-benchmark-commons-proposal.pptx`
- Internal Turbalance deck: `outputs/turbalance-internal-ocp-benchmark-commons.pptx`

## Timing Note

The official 2026 Innovation Village page lists the OCP Global Summit in San Jose, California on October 12-15, 2026 and asks contributors to submit station proposals before June 30, 2026.
