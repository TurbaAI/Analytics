# OCP Global Summit 2026 Submission Packet

## Submission Strategy

Recommended submission type: **OCP Global Summit Breakout Session, Special Focus Session**

Recommended session category / project alignment:

- Primary: **Data Center Facility / Data Center Telemetry (DCT)**
- Secondary: **Hardware Management**, especially Redfish/BMC source evidence
- Secondary: **Server / High Performance Computing** and **AI HW SW CoDesign**
- Secondary: **Time Appliances Project (TAP)** for clock-aligned telemetry and sample-skew evidence
- Strategic alignment: **Open Data Centers for AI** and **Open Cluster Designs for AI**

Why this route:

- OCP says breakout content should be collaborative, open, non-confidential, engineering-oriented, and non-commercial.
- A pure product pitch is risky. Frame turbalance as a reference implementation and field report for an open telemetry evidence model.
- A Special Focus Session is the best fit if the work is not yet formally inside an OCP project. A project breakout becomes stronger if a DCT, Hardware Management, TAP, or Server/HPC contributor joins as co-speaker.

Important OCP dates and constraints:

- Event: October 12-15, 2026, San Jose, California.
- Abstract deadline: June 15, 2026.
- Draft slides due: August 24, 2026.
- Final slides due: September 28, 2026.
- In-person only; remote presentation is not supported.

Source pages:

- https://www.opencompute.org/summit/global-summit/call-for-content
- https://www.opencompute.org/summit/global-summit/theme
- https://www.opencompute.org/blog/crafting-a-winning-ocp-summit-breakout-submission-a-guide-to-collaboration-innovation-and-community-impact

## Recommended Submission

### Title

Clock-Aligned Telemetry for AI Clusters: From BMC to GPU to Fleet

### Subtitle

Turning Redfish, DCGM/NVML, host telemetry, benchmarks, and PTP/NTP state into comparable AI infrastructure signals.

### Short Abstract

AI cluster operators often have many dashboards but no shared evidence model that connects GPU counters, host pressure, BMC power and thermal state, scheduler placement, network/NCCL behavior, benchmark context, and clock skew. This session shares a lab-built reference architecture for clock-aligned AI infrastructure telemetry: a source-bundle contract, live agents, conservative benchmark ladder, Redfish/BMC lane, and lakehouse path that preserve provenance and refuse to synthesize unsupported metrics.

Using a small heterogeneous fleet with DGX/GB10-class hosts, a controller appliance, and edge nodes, we will show how 1-second live telemetry, capability labels, sample freshness, auto-discovery, and multi-level comparisons can help answer a practical operator question: why is useful compute lower than expected, and which evidence is trustworthy enough to act on?

Attendees will leave with concrete schema patterns, hot-path versus forensic collection tradeoffs, and a proposal for OCP collaboration on open telemetry evidence contracts for AI data centers.

### Portal Abstract

AI infrastructure operators often have plenty of dashboards but no common evidence model that links GPU counters, host pressure, BMC power and thermal state, scheduler placement, network/NCCL behavior, benchmark context, and clock skew. This session shares a lab-built reference architecture for clock-aligned AI infrastructure telemetry: a source-bundle contract, live agents, conservative benchmark ladder, Redfish/BMC lane, and lakehouse path that preserve provenance and refuse to synthesize unsupported metrics.

The work was developed as an open, non-confidential prototype around a heterogeneous lab fleet: DGX/GB10-class hosts, a controller appliance, and small edge nodes. It connects DCGM/NVML/gpustat, Linux host counters, Prometheus/Grafana, Kubernetes/scheduler exports, Redfish, eBPF/OpenTelemetry-style host evidence, and PTP/NTP/chrony clock state. The system separates fast live sampling from deeper forensic probes and distinguishes current status from controlled benchmarks.

We will show a six-level benchmark comparison ladder: individual metric, host-to-host, rack, cluster, fleet, and global baseline. We will also discuss auto-discovery and credential-gated agent deployment, 1-second live sample freshness, capability labels for unsupported metrics, and how clock alignment changes the trustworthiness of cross-machine comparisons.

Attendees will leave with concrete schema patterns, collection tradeoffs, and a proposed collaboration path for OCP Data Center Telemetry, Hardware Management, Server/HPC, and Time Appliances communities to define open evidence contracts for AI data centers.

### Ultra-Short Abstract

This session proposes an open evidence model for AI infrastructure telemetry. It links DCGM/NVML GPU counters, Linux host pressure, Redfish/BMC power and thermal state, scheduler/Kubernetes context, benchmarks, and PTP/NTP clock evidence into a provenance-preserving source-bundle and lakehouse path. The talk uses a lab fleet reference implementation to show 1-second live telemetry, auto-discovery, conservative benchmark comparisons from host to fleet, and capability labels that avoid fake metrics.

## Why This Matters To OCP

The 2026 OCP Global Summit theme is "Scaling Innovation for the AI Era." AI data centers need open infrastructure patterns that can scale across GPU systems, facilities, telemetry, power, cooling, and management planes. This work contributes a practical, non-commercial reference model for one missing layer: how to make telemetry evidence comparable and trustworthy enough for operators, hardware vendors, and software teams to collaborate.

The proposal is aligned with OCP because it is:

- Open and engineering-oriented: the talk focuses on source contracts, provenance, collection tradeoffs, and validation patterns.
- Collaborative: it invites DCT, Hardware Management, Server/HPC, AI HW SW CoDesign, and TAP participants to converge on a shared evidence contract.
- Relevant to AI scale: it addresses useful compute, benchmark comparability, live sample freshness, unsupported metric disclosure, and cross-machine timing.
- Not commercial: turbalance is treated as a reference implementation and field report, not as a product pitch.

## Session Outline

### 30-Minute Breakout Flow

1. **Problem: dashboards are not evidence** (3 minutes)
   - AI operators need to know why useful compute drops, not just that a counter changed.
   - Fragmentation across GPU, host, scheduler, BMC, facility, and time sources weakens root-cause confidence.

2. **Open evidence contract** (6 minutes)
   - Source-bundle schema with provenance and source ownership.
   - Capability matrix: native, external-system-required, app-instrumentation-required, profiler-required, benchmark-required, unsupported.
   - No synthetic metrics and no fake zeros.

3. **Live collection architecture** (6 minutes)
   - Controller appliance, live agents, auto-discovery, credential-gated deployment.
   - 1-second hot-path telemetry versus slower forensic probes.
   - Spooling, sequence numbers, auth, mTLS/HMAC options, and sample freshness.

4. **Cross-layer AI infrastructure evidence** (6 minutes)
   - DCGM/NVML/gpustat GPU telemetry.
   - Linux/procfs/eBPF/OpenTelemetry-style host pressure.
   - Redfish/BMC inventory, health, power, thermals, and firmware context.
   - Kubernetes/scheduler/Grafana/source handoff.
   - PTP/NTP/chrony sample skew and why time alignment affects comparison validity.

5. **Benchmark ladder and fleet comparison** (5 minutes)
   - Level 1: individual metric.
   - Level 2: 1:1 host comparison.
   - Level 3: rack comparison.
   - Level 4: cluster comparison.
   - Level 5: fleet comparison.
   - Level 6: global baseline.
   - How benchmark freshness, cache TTL, and safety limits prevent benchmark noise from becoming telemetry truth.

6. **OCP collaboration proposal** (3 minutes)
   - Candidate source-bundle contract for DCT/Hardware Management/TAP review.
   - Shared benchmark metadata for AI systems.
   - Common labels for capability and unsupported metric disclosure.

7. **Takeaways and Q&A** (1 minute)

## Attendee Takeaways

- A concrete source-bundle pattern for preserving telemetry provenance across GPU, host, scheduler, Redfish/BMC, and time sources.
- A capability-labeling approach that prevents dashboards from filling unavailable metrics with fake values.
- A six-level benchmark ladder that separates live status, controlled benchmarks, peer comparison, rack/cluster/fleet comparison, and global baselines.
- A practical collection strategy for 1-second live telemetry without confusing hot-path samples with expensive forensic probes.
- A proposal for OCP community collaboration on open AI data center telemetry evidence contracts.

## Suggested Portal Fields

### Session Type

Breakout Session / Special Focus Session

### Topic / Track

Data Center Telemetry; Hardware Management; Server/HPC; AI HW SW CoDesign; Time Appliances Project

### Intended Audience

AI data center operators, GPU cluster SREs, platform engineers, hardware management teams, telemetry architects, benchmark/validation engineers, and OCP project contributors working on DCT, Hardware Management, Server/HPC, AI clusters, and time synchronization.

### Technical Level

Intermediate to advanced.

### Preferred Duration

30-minute breakout plus Q&A, or standard OCP breakout slot if the program committee uses a fixed duration.

### Keywords

AI data center telemetry, Data Center Telemetry, Redfish, BMC, DCGM, NVML, GPU observability, benchmark comparison, PTP, NTP, clock skew, eBPF, OpenTelemetry, Kubernetes, scheduler, lakehouse, DuckDB, Parquet, source bundle, evidence model, useful compute, GPU efficiency.

### Non-Commercial Statement

This session is not a product pitch. It presents a non-confidential reference implementation, schema patterns, collection tradeoffs, and proposed OCP collaboration points for open AI infrastructure telemetry.

### Confidentiality Statement

All examples will use lab data, redacted source-bundle examples, or generated fixtures. The session will not disclose customer-private data, credentials, proprietary model workloads, or confidential hardware details.

### Collaboration Statement

The goal is to invite OCP DCT, Hardware Management, Server/HPC, AI HW SW CoDesign, and TAP contributors to review and refine a common telemetry evidence contract for AI data centers. The speaker is seeking co-presenters or reviewers from these communities before final slides.

### Prior Presentation

This exact session has not been presented before. It combines recent lab implementation work, updated benchmark-ladder design, Redfish/BMC source integration, and clock-aligned telemetry analysis into a new OCP-oriented proposal.

### Permission To Publish

Slides can be published after redaction of private hostnames, IP addresses, credentials, and any non-public lab details. The session will use public architecture diagrams, redacted screenshots, and generated or fixture-based telemetry examples.

### Open Materials

The submission should point to a public repository, redacted source-bundle examples, or a short technical note if available before final slide review. If the current repo is not public, publish only the source contract, capability matrix, and demo fixtures that are safe to share.

## Title Alternatives

1. **Clock-Aligned Telemetry for AI Clusters: From BMC to GPU to Fleet**
2. **From GPU Counters to Fleet Evidence: Open Telemetry Patterns for AI Data Centers**
3. **Making AI Infrastructure Metrics Trustworthy: Provenance, Benchmarks, and Clock-Aligned Telemetry**
4. **An Open Source-Bundle Contract for AI Data Center Telemetry**
5. **Beyond Dashboards: Correlating Redfish, DCGM, Host, Benchmark, and Time Evidence for AI Fleets**

## Demo Narrative

Use the demo as proof of engineering substance, not as a sales walkthrough:

1. Show the fleet aggregate dashboard with three DGX/GB10-class hosts.
2. Show sample freshness and the difference between live telemetry and cached benchmark results.
3. Show the inventory machine aggregate and similarity/comparison view.
4. Show benchmark ladder cards for CPU, GPU, RAM, network, and disk.
5. Show Redfish/BMC source lane concept from a fixture or redacted sample.
6. Show clock discipline / sample skew for SPARK or DGX pair comparison.
7. End with source-bundle JSON and the proposed OCP collaboration surface.

Recommended demo guardrails:

- Do not use passwords or live private IPs in slides.
- Use redacted screenshots or fixtures.
- Avoid any customer names or claims about production outcomes unless permission is explicit.
- Label all unsupported or unavailable metrics visibly.

## Draft Slide Outline If Accepted

1. Title: Clock-Aligned Telemetry for AI Clusters
2. Why AI infrastructure telemetry is fragmented
3. OCP alignment: DCT, Hardware Management, Server/HPC, TAP
4. Evidence model: source bundle, provenance, capability labels
5. Architecture: controller appliance and lakehouse path
6. Live hot path: agents, 1-second samples, freshness, spooling
7. GPU/host layer: DCGM/NVML/gpustat, Linux counters, eBPF/OTel
8. Management layer: Redfish/BMC power, thermals, health, firmware
9. Time layer: PTP/NTP/chrony and cross-machine comparison validity
10. Benchmark ladder: metric to global baseline
11. Demo: fleet aggregate and benchmark ladder
12. Lessons learned: what must stay fast, what must stay forensic
13. Proposed open contract for OCP collaboration
14. Call to action: review, co-author, standardize, test across fleets
15. Q&A

## Speaker Bio Draft

Replace bracketed fields before submission.

Ahmad Byagowi is a systems and infrastructure engineer working on observability, timing, and AI infrastructure performance. His recent work focuses on open telemetry evidence for GPU fleets: live host agents, Redfish/BMC source integration, benchmark comparison, clock-aligned sample analysis, and lakehouse-backed operational analytics. He has built lab prototypes across DGX/GB10-class hosts, controller appliances, and edge nodes to study how operators can explain useful compute, resource pressure, and fleet variance without relying on synthetic or unsupported metrics.

Affiliation: `[company / organization / independent]`

Speaker location: `[city, state/country]`

Speaker email: `[email]`

## Co-Speaker / Reviewer Targets

Best acceptance path:

- One contributor from OCP Data Center Telemetry or Data Center Facility.
- One contributor from Hardware Management / Redfish ecosystem.
- One AI cluster operator, server/HPC contributor, or TAP/time synchronization contributor.

Suggested outreach ask:

> I am submitting a non-commercial OCP Global Summit breakout proposal on clock-aligned AI infrastructure telemetry. It is based on a lab reference implementation that correlates DCGM/NVML, Linux host counters, Redfish/BMC, scheduler/Kubernetes, benchmark, and PTP/NTP evidence into provenance-preserving source bundles. I would value a short review from the DCT / Hardware Management / TAP perspective and would be open to making this a collaborative session if it aligns with your project roadmap.

## Final Pre-Submission Checklist

- Confirm speaker name, title, affiliation, email, phone, and headshot.
- Confirm in-person availability for San Jose, October 12-15, 2026.
- Confirm whether the submitter is an OCP member or has project participation history.
- Replace any private IPs, hostnames, customer names, credentials, or proprietary references with redacted labels.
- Ask DCT, Hardware Management, TAP, or Server/HPC contributors for review before June 15.
- Decide whether to submit a second Future Technologies Symposium paper. If yes, turn this into a two-page IEEE-format paper around the evidence contract and benchmark ladder.
- Keep the portal copy non-commercial: no pricing, no product claims, no customer promises.

## Optional Future Technologies Symposium Angle

If submitting a paper as well, use a more research-style title:

**A Provenance-Preserving Evidence Contract for Clock-Aligned AI Infrastructure Telemetry**

Paper thesis:

AI infrastructure telemetry is becoming a multi-plane measurement problem spanning GPU counters, host/kernel pressure, scheduler state, BMC/facility data, benchmarks, and time synchronization. A provenance-preserving source-bundle contract plus benchmark ladder can make cross-machine comparison reproducible while preventing unsupported metrics from being silently synthesized.

Paper outline:

1. Problem statement and motivation.
2. Related OCP project surfaces.
3. Source-bundle contract and capability labeling.
4. Hot-path collection versus forensic probes.
5. Benchmark ladder and comparison scopes.
6. Clock alignment and sample freshness.
7. Lab reference implementation.
8. Proposed standardization questions for OCP.
