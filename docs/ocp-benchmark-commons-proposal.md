# OCP Benchmark Commons Proposal

## Proposal

Create an OCP-hosted Benchmark Commons for AI and accelerated infrastructure. The Commons would collect member-submitted, provenance-preserving benchmark records across machines, hardware classes, firmware versions, accelerators, network links, storage paths, and benchmark suites. Members would use it as the L6 layer of a Benchmark Ladder: local metric, one-to-one peer, rack, cluster, fleet, and OCP Commons comparison.

The goal is not to replace benchmark suites such as MLPerf, SPEC, OpenBenchmarking, or vendor qualification. The goal is to give OCP members a neutral, member-governed corpus that answers a different operational question: "How does the hardware I received compare against comparable production hardware operated by other members?"

## Why OCP

OCP is well positioned because this is a multi-member trust problem, not a single-vendor dashboard problem. A shared benchmark corpus lets members:

- Compare delivered hardware quality against a neutral aggregate, not only the vendor's own reference fleet.
- Detect binning, firmware, thermal, power, storage, network, and accelerator variance earlier.
- Encourage vendors to ship consistently high-quality hardware because member-side variance becomes quantitatively visible.
- Avoid siloed comparisons where every buyer can only compare against their own installed base.
- Build open evidence contracts that can align with Data Center Telemetry, Hardware Management, Server/HPC, AI hardware/software co-design, and time-synchronization work.

## Benchmark Ladder L6

The Turbalance reference implementation now treats L6 as `OCP Commons` rather than a generic global label. The dashboard supports:

- Imported OCP corpus fields: `benchmarkOcpCommonsDataset`, `benchmarkOcpCommonsPeerCount`, `benchmarkOcpCommonsPercentile`, `benchmarkOcpCommonsScore`, `benchmarkOcpCommonsBinning`, and reference URL.
- Export-ready local records when only local benchmark samples exist.
- A redacted export utility: `scripts/export-ocp-benchmark-commons.js`.
- A schema for exchange: `schemas/turba-ocp-benchmark-commons.v1.schema.json`.

This keeps older `benchmarkGlobal*` imports compatible while making the OCP Commons path explicit.

## Record Model

Each submitted record should include:

- Benchmark suite name, version/status, duration, freshness, and cache status.
- Hardware class and configuration fingerprint.
- CPU, memory, disk, network, GPU, accelerator, and composite benchmark metrics when available.
- Optional corpus comparison fields: peer count, percentile, score, and bin label.
- Provenance: source adapters, generated time, data boundary, and benchmark policy.
- Privacy controls: salted member/host/run hashes, no hostname, no IP, no tenant/account/billing IDs.

The initial schema intentionally stays small so OCP can govern the canonical contract instead of inheriting a vendor-specific data model.

## Governance

OCP should own the Commons governance model:

- Membership and access policy for submitters and readers.
- Required benchmark suites and allowed optional suites by hardware class.
- Minimum sample quality rules, freshness windows, and retest rules after firmware changes.
- Aggregation and k-anonymity thresholds before peer percentiles are shown.
- Vendor-visible and member-visible views.
- Dispute/retest process when a member sees outlier or poor-bin hardware.

## Reference Workflow

1. Member runs local benchmark and telemetry collection.
2. Member reviews an export preview and confirms that no host or tenant identity is present.
3. Export utility writes `turba.ocp_benchmark_commons.v1`.
4. OCP validates schema, benchmark provenance, and data policy.
5. OCP publishes aggregate percentiles and bins when the corpus for a hardware class reaches the visibility threshold.
6. Members import corpus comparison fields into their L6 Benchmark Ladder.

## Innovation Village Station

For the 2026 OCP Global Summit Innovation Village, the proposed station would show:

- A live Benchmark Ladder from L1 through L6.
- Before/after view of a local benchmark record becoming a redacted OCP Commons submission.
- Example corpus comparison with peer count, percentile, and binning.
- Discussion cards for governance choices OCP should make.
- A short call for design partners across operators, OEMs, benchmark experts, and OCP project communities.

The station should be positioned as an open community proposal, not a commercial booth.

## Pilot Success Criteria

The first OCP pilot should prove:

- At least 3 member/operators can export records without leaking host, tenant, account, or billing identity.
- At least 2 hardware classes reach enough peer records to compute useful percentile bands.
- Members can identify at least one hardware-quality, firmware, thermal, power, or configuration variance that would otherwise have remained siloed.
- OCP can define a governance path for canonical schema, corpus access, and vendor/member review.

## Open Decisions

- Which benchmark suites are mandatory by hardware class?
- Should OCP publish exact percentiles, bands, or both?
- What k-anonymity threshold is required before a bin is visible?
- How should vendors respond to poor-bin findings?
- How should confidential production configuration be normalized without erasing the useful comparison signal?
- Which OCP project should steward the first version of the schema and validation rules?
