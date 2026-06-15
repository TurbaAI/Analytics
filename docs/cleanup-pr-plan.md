# Cleanup PR Plan

A staged, low-risk sequence to address the repo-hygiene findings without disrupting the pilot. Each PR is independently shippable and ordered so the riskiest/most valuable work (secrets, artifacts) lands first and the structural refactor (app.js) lands last on a clean base.

Recommended order: **PR 1 → PR 2 → PR 3 → PR 4 → PR 5**.

---

## PR 1 — Purge committed artifacts and secrets from version control

**Why:** 427 files under `build/` are tracked, including two full 195-file duplicate copies of the app (`build/packages/turbalance-gb100-telemetry-20260602T171408Z/` and `build/package-test/turbalance-gb100-test/`), `.parquet` lake data, `.tar.gz` packages, logs, and — most urgently — `build/lakehouse-secrets-live.yaml`. These bloat the repo, drift from their originals (already visible in `git status`), and the secrets file is a disclosure risk.

**Highest priority — secrets:**

1. Rotate any credentials in `build/lakehouse-secrets-live.yaml` (assume they are compromised since they are in history).
2. `git rm --cached build/lakehouse-secrets-live.yaml` and confirm `.gitignore` covers it (the `build/lakehouse-*.yaml` patterns suggest it was force-added).
3. Decide whether to scrub history (`git filter-repo`) — recommended if the repo will ever be shared more widely. Coordinate, since this rewrites SHAs.

**Then remove the rest of the tracked build output:**

```sh
git rm -r --cached \
  build/packages \
  build/package-test \
  build/system-identification \
  build/gb100-validation \
  build/*.log build/*.err build/*.txt build/*.json build/*.tar.gz build/*.yaml
```

**`.gitignore` change:** the current file ignores many `build/` subpaths but not all. Replace the enumerated list with a blanket ignore plus explicit allow-list for anything that must stay tracked:

```gitignore
# Ignore all build output by default
/build/**
# Re-include only intentionally tracked fixtures, if any:
# !/build/<thing-you-actually-need>/
```

**Acceptance:** `git ls-files build/ | wc -l` drops to ~0 (or only the intentional allow-list); `git status` no longer shows divergent duplicate app copies; `node tests/run-all.js` still passes (tests regenerate build/ output at runtime).

---

## PR 2 — Stop tracking `.pyc` / `__pycache__`

**Why:** 53 compiled `.pyc` files are tracked across 14 `__pycache__` dirs (e.g. `services/*/__pycache__`, `collectors/__pycache__`, `orchestration/dagster/__pycache__`) and currently show as modified.

```sh
git rm -r --cached $(git ls-files '*.pyc')
```

Add to `.gitignore`:

```gitignore
__pycache__/
*.pyc
```

**Acceptance:** `git ls-files | grep -c '\.pyc$'` returns 0; Python services still import and test cleanly.

---

## PR 3 — Add a root Node manifest and lockfile

**Why:** There is no root `package.json`. Node version is pinned only in CI; the Makefile relies on `node --check`. New contributors have nothing declaring deps, scripts, or engine.

Add `package.json` with:

- `"engines": { "node": ">=22" }` to match CI.
- `"scripts"`: `"test": "node tests/run-all.js"`, `"lint": "make lint"`, `"validate": "node scripts/validate-source-bundle.js --require-source-export"`.
- Declared dependencies for anything `require`d beyond Node built-ins (audit with a quick grep; the suite currently runs on built-ins only, so this may legitimately be dependency-free — in which case still add the manifest with empty deps and a lockfile for reproducibility).

Update CI to `npm ci` + `npm test` (or keep direct node invocation but reference the script). Note the existing `frontend/react/` already has its own `package-lock.json`; this root manifest is separate and should not absorb it.

**Acceptance:** `npm test` runs the suite; CI green; `node --version` constraint documented in one place.

---

## PR 4 — Commit-message and contribution conventions

**Why:** History is dominated by generic messages ("update features" ×many, "update documents", "add covaraince matrix" — typo repeated 3×). Hard to audit.

- Add `CONTRIBUTING.md` with a lightweight Conventional Commits guideline (`feat:`, `fix:`, `chore:`, `docs:`, etc.) and a one-line PR-title rule.
- Optional: add a `commitlint` + `husky` hook, or a CI check on PR titles. Keep it advisory first to avoid friction.

**Acceptance:** New PRs follow the convention; no history rewrite required.

---

## PR 5 — Modularize `app.js` (631 KB / 15,779 lines)

**Why:** A single browser-global script holds topology, schemas, sample data, workspace persistence, theming, and all UI logic. It is the main review/maintenance bottleneck.

**Constraint to respect:** `app.js` is **not** an ES module. It runs as a classic `<script src>` in `index.html` (loaded after `analytics-core.js`, `nccl-trace-parser.js`, `nccl-trace-fixtures.js`) and consumes globals like `window.TurbaAnalytics`. The split must preserve runtime behavior — either keep the global-script pattern across multiple files, or introduce a bundler. Two options:

**Option A — incremental, no build step (lower risk, recommended first):**
Split into ordered `<script>` files that attach to a single namespace, mirroring the existing `window.Turba*` pattern. Suggested boundaries follow the natural sections already in the file:

| New file | Contents (current line ranges as a guide) |
| --- | --- |
| `app/constants.js` | `TOPOLOGY`, `*_SCHEMA`, `*_STORAGE_KEY`, all `const` config (~1–1186) |
| `app/sample-data.js` | `SAMPLE_INGESTION`, `SAMPLE_SOURCE_EXPORTS`, `DEFAULT_INGESTION` (~95–1259) |
| `app/workspace-store.js` | `loadWorkspaceStore`/`persist`/`restore`/machine-inventory reconcile (~1418–1779) |
| `app/theme.js` | `initThemeMode`, `resolve/read/write/applyThemeMode` (~1343–1417) |
| `app/dashboard-blocks.js` | block prefs (~1780–1812+) |
| `app/render-*.js` | the remaining render/UI logic, split by panel/feature |
| `app/main.js` | the `DOMContentLoaded` bootstrap |

Each file attaches to e.g. `window.TurbaApp = window.TurbaApp || {}`. Update `index.html` to load them in dependency order. Bump the `?v=` cache-busting query consistently. No behavior change, fully reviewable diffs.

**Option B — introduce a bundler (higher value, more setup):**
Convert to ES modules with explicit `import`/`export`, bundle with esbuild/Vite/Rollup into a single `app.js` for `index.html`. This gives real module boundaries, tree-shaking, and unit-testability of UI helpers, but adds a build step and touches the `frontend/` story. Defer until after PR 3 establishes a Node toolchain.

**Either way:** do the split in **mechanical, behavior-preserving commits** (move code, don't rewrite), and lean on `tests/run-all.js` plus the screenshot/visual-QA workflow (`scripts/run-screenshot-qa.js`, `.github/workflows/visual-qa.yml`) to catch regressions. Consider extracting pure helpers far enough to add targeted unit tests.

**Acceptance:** No single source file > ~2,000 lines; dashboard renders identically (visual-QA passes); test suite green.

---

## Summary

| PR | Effort | Risk | Value |
| --- | --- | --- | --- |
| 1. Purge artifacts + secrets | M | Low (tests regenerate build/) | High — repo size, drift, **security** |
| 2. Stop tracking `.pyc` | S | Low | Medium |
| 3. Root manifest + lockfile | S | Low | Medium |
| 4. Commit conventions | S | None | Medium (long-term) |
| 5. Modularize `app.js` | L | Medium | High — maintainability |

PRs 1–4 are mechanical and can land within a day. PR 5 is the only one needing real care; Option A keeps it safe and reviewable.
