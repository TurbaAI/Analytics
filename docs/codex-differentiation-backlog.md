# Differentiation backlog — implementation action items

Hand these to codex. They are ordered by leverage. Each epic lists concrete tasks
with the files to touch, the data model, acceptance criteria, and the tests/audit
gates to add. Conventions to follow (already in the repo):

- Conventional commits (`feat:`/`fix:`/`chore:`/`docs:`), one logical change per commit.
- Pure analytics logic goes in dependency-free engines: `analytics-core.js` (browser)
  with a Python mirror under `services/platform_common/platform_common/` and a
  cross-language **parity test** in `tests/`.
- Every new capability gets: (a) a `node:assert` test wired into `tests/run-all.js`,
  and (b) a check added to `scripts/audit-productization-phases.js` that asserts a
  **real** marker (match the actual symbol/value — do not use placeholder markers).
- UI lives in `app-render.js` + `index.html`, gated by a `data-dashboard-block`
  entry in `app-core.js`'s `DASHBOARD_BLOCKS`.
- Run `node tests/run-all.js` and `node scripts/audit-productization-phases.js`
  before each commit; both must stay green for the right reasons.

---

## EPIC A — Verified Savings Ledger  (highest priority)

**Goal:** turn prescriptive *advice* into proven, banked outcomes. Track every action
through its lifecycle and accumulate audited "$ and GPU-hours recovered."

**Why it wins:** no observability or cost competitor proves the outcome. This becomes
the headline metric, the renewal story, and the sales demo.

### Data model
Add a new contract `schemas/turba-savings-ledger.v1.schema.json`. A ledger entry:

```
{
  "id": "string",                     // stable id
  "actionId": "string",               // FK to a prescribed action (predictive-core)
  "scope": { "type": "job|model|team|tenant|cluster|account", "key": "string" },
  "status": "proposed|accepted|applied|verified|rejected|expired",
  "metric": "wastedGpuHours|usefulCompute|costPerUsefulGpuHour|...",
  "baseline": { "value": number, "window": "ISO interval", "snapshotId": "string" },
  "result":   { "value": number, "window": "ISO interval", "snapshotId": "string" },
  "deltaGpuHours": number,            // signed, baseline - result (or result - baseline)
  "deltaDollars": number,
  "confidence": number,               // 0-100, carried from the action + fit quality
  "attribution": "measured|modeled",  // measured = real before/after; modeled = estimate only
  "appliedAt": "ISO", "verifiedAt": "ISO",
  "evidenceRef": "string"             // link to evidence pack / snapshot ids
}
```

### Tasks
1. **Engine: ledger math.** Add to `predictive-core.js` (and the Python mirror
   `predictive.py`): `recordOutcome(action, baselineSnapshot, resultSnapshot, opts)`
   returning a ledger entry, and `rollupLedger(entries, {scope, window})` returning
   `{ verifiedDollars, verifiedGpuHours, byScope, byCategory, realizationRate }`
   where `realizationRate = verified / predicted`. Pure, deterministic, no deps.
2. **Lifecycle state machine.** `advanceLedgerStatus(entry, event)` enforcing
   `proposed→accepted→applied→verified` (+ `rejected`/`expired`); reject illegal
   transitions. Unit-test every transition.
3. **Wire to snapshots.** In `app-state.js`, when an action is marked applied, capture
   a `baseline` snapshot from `snapshotHistory` for the action's scope; after a
   configurable window, capture `result` and compute the delta via `recordOutcome`.
   Persist ledger entries in the workspace store (extend `STORAGE_SCHEMA` / the
   `turba.workspace` version; add a migration).
4. **API + lakehouse.** Add ledger read/write endpoints to `services/api-server`
   (tenant-scoped, RBAC-gated — reuse `scoped_tenant`/`ROLE_RANK`), and a derived
   lakehouse table `vs_savings_ledger` produced by the transform runner so the
   ledger is durable and queryable, partitioned by tenant/date.
5. **UI: "Recovered" panel.** New `DASHBOARD_BLOCKS` entry `savingsLedger`; render a
   headline stat ("$X / N GPU-hours verified recovered, last 90 days"), a
   realization-rate gauge (verified vs predicted), and a table of recent verified
   actions with before/after. Add to `app-render.js` + `index.html`.
6. **Evidence pack integration.** Extend `buildEvidencePackMarkdown` / the evidence
   export to embed the ledger rollup and per-action before/after so the proof is
   exportable and tenant-safe.

### Acceptance criteria
- `recordOutcome` produces signed deltas; `attribution: "measured"` only when both
  baseline and result snapshots exist, else `"modeled"`.
- Rollup never counts a `modeled` entry toward "verified" totals.
- Illegal status transitions throw / are rejected.
- JS and Python produce identical rollups (parity test).

### Tests / gates
- `tests/savings-ledger.test.js` (engine + lifecycle + rollup edge cases).
- `tests/savings-ledger-python.test.js` (cross-language parity, mirror of the
  existing `predictive-python.test.js` pattern).
- Add a phase-4 (Commercial) audit check: ledger schema exists, API route present,
  derived table wired.

---

## EPIC B — Action write-back connectors  (highest priority)

**Goal:** apply the prescribed fix through the customer's *existing* scheduler or
ticketing — do not build a scheduler. This closes detect→prescribe→**act**→verify and
feeds Epic A its "applied" event.

**Why it wins:** moves from "advice" (observability tools) to "applied + proven" while
staying complementary to Run:ai / Cast AI rather than competing with them.

### Design
A connector interface with a **dry-run-first, approval-gated** execution model. Never
auto-apply without an explicit policy/approval. Reuse the source-owner approval pattern
already in `ops/source-approvals.*`.

```
connector.plan(action, context)  -> { changes:[...], reversible:bool, risk }
connector.apply(plan, {approvedBy}) -> { status, externalRef, appliedAt }
connector.revert(plan)            -> { status }
```

### Tasks
1. **Connector framework** under `services/` (e.g. `services/action-runner/`): registry,
   the interface above, an audit-logged execution record, and a global "require approval"
   guard. Emit an `applied` event consumable by the Epic A ledger.
2. **First connectors (thin, real):**
   - Kubernetes/Karpenter: cordon/drain, change a nodepool/requests, label for repack
     (via the cluster API the discovery service already talks to).
   - Slurm: requeue / placement constraint via `scontrol` over the existing agent channel.
   - Run:ai: project/quota or placement hint via its API.
   - Ticketing fallback: open a Jira/GitHub issue or Slack approval with the action plan
     (always available even when no scheduler write is permitted).
3. **Policy + safety:** per-tenant allow-list of connectors and actions; max blast radius;
   mandatory dry-run diff surfaced in the UI before apply; full revert path.
4. **UI:** on each prescribed action card (`app-render.js`), add "Preview change",
   "Apply (requires approval)", and "Revert", showing the dry-run diff and the external ref.

### Acceptance criteria
- No connector applies without an approval record; everything is audit-logged.
- Every apply has a stored, runnable revert.
- Ticketing connector works with zero scheduler credentials (safe default).

### Tests / gates
- `tests/action-runner.test.js` with a **mock scheduler** (no live calls): plan→approve→
  apply→revert, and assert apply is refused without approval.
- Phase-1 audit check: connector registry + approval guard symbols present.

---

## EPIC C — MFU / HFU + inference economics  (high priority)

**Goal:** speak the buyer's real efficiency metric (Model FLOPs Utilization) and cover
the inference-serving shift, not just training.

### Tasks
1. **MFU/HFU in the engine.** Add `modelFlopsUtilization(summary, modelSpec)` to
   `analytics-core.js` (+ Python mirror): compute achieved vs theoretical FLOPs from
   tokens/step, batch, seq-len, params, and peak device FLOPs. Add `mfu`/`hfu` to the
   summary, metric ribbon, and trend metrics.
2. **Device FLOPs table.** `schemas/` or a data file mapping GPU model → peak FLOPs by
   precision (H100/H200/B200/MI300X/Gaudi3/TPU). Make it overridable per deployment.
3. **Inference economics block.** New `DASHBOARD_BLOCKS` entry `inferenceEconomics`:
   cost per 1M tokens, cost per 1M requests, KV-cache pressure, batch efficiency,
   tail latency vs cost. Wire a new opportunity category `inference-serving` into
   `generateOpportunities` (it already has an inference seed — extend it).
4. **Predictive coverage.** Add inference metrics to `PREDICTIVE_METRIC_CONFIG` so
   forecasts/saturation/anomaly apply (e.g., KV-cache saturation ETA).

### Acceptance criteria
- MFU is bounded 0–100%, returns `unknown` when modelSpec is incomplete (never throws).
- Inference opportunities appear only when `inferenceRequestsM > 0`.

### Tests / gates
- `tests/mfu-inference.test.js` (+ parity test). Phase-2/analytics audit check for MFU
  symbol + device-FLOPs table.

---

## EPIC D — Cross-fleet benchmarking  (Tier 2 — the data moat)

**Goal:** anonymized percentile ranking ("your H100 LLM-training MFU is 31st
percentile") that compounds with every customer. This is the only durable moat.

### Tasks
1. **Privacy-safe aggregation contract** `schemas/turba-benchmark-contribution.v1.schema.json`:
   only coarse, non-identifying features (GPU model, workload class, MFU bucket, region
   class) — no tenant/host identifiers. Opt-in per tenant; redaction reuses the existing
   redacted-workspace path.
2. **Aggregation service** (`services/benchmark-commons/`): ingest contributions,
   compute percentiles per (GPU model × workload class), enforce k-anonymity (suppress
   buckets with < k contributors). Ties into the existing OCP benchmark-commons lane.
3. **UI:** add percentile context to the efficiency headline ("top-quartile fleets
   recover this by …"), sourced from the aggregate.
4. **Governance:** explicit opt-in toggle + doc in `docs/security-compliance-posture.md`.

### Acceptance criteria
- No raw identifiers leave the tenant; buckets below k-anonymity threshold are suppressed.
- Benchmarking is off by default and requires explicit opt-in.

### Tests / gates
- `tests/benchmark-commons.test.js`: assert k-anonymity suppression and that no
  identifier fields survive contribution normalization.

---

## Tier 3 — accelerants (spec later, smaller tasks)

- **NL copilot** over the attribution engine: a thin `services/` endpoint that takes a
  natural-language question, calls the existing analytics/predictive APIs, and returns
  the attributed answer + ranked actions. No model training — orchestrate existing APIs.
- **Carbon/power actions:** extend the existing energy/carbon estimate into power-cap
  hints emitted as prescriptive actions; tie into Epic B connectors.
- **Vendor-neutral parity:** ensure AMD (amd-dme is already a source), Intel Gaudi, and
  TPU/Trainium have collector coverage + device-FLOPs entries (supports Epic C).
- **OpenTelemetry GPU semantic conventions:** publish the ingestion contract as an OTel
  semantic-convention proposal; emit/accept that schema.

---

## Suggested sequencing for codex
1. Epic A (ledger) — engine + tests first, then snapshot wiring, then UI, then API/lake.
2. Epic B (write-back) — start with the ticketing/Slack connector (safe, no creds),
   then one scheduler connector; wire its `applied` event into Epic A.
3. Epic C (MFU/inference) — engine + parity, then UI block.
4. Epic D (benchmarking) — contract + k-anonymity first; UI last.

Each epic should land behind its tests + a real audit-gate check, and the full suite
(`node tests/run-all.js`) plus `audit-productization-phases.js` must stay green.
