# Engineering Process

This process turns the repo into a reviewable product lane.

## Branch Protection

`ops/github/branch-protection.json` defines the expected protection for `main`:

- Pull request required before merge.
- Code-owner review required.
- Linear history required.
- Required status checks for CI and release governance.
- Force pushes and branch deletion disabled.

The JSON file is an auditable desired state. A repository administrator still
needs to apply it in GitHub or through an organization settings tool.

## Code Review

`.github/CODEOWNERS` defines default reviewers. Pull requests should stay focused
on one logical change and must pass `node tests/run-all.js`.

## Conventional Commits

`CONTRIBUTING.md` defines the commit format. The `Release Governance` workflow
validates pull request titles with `scripts/validate-conventional-commit.js` so
squash merges produce readable release history.

## Release Process

1. Land changes through a protected pull request.
2. Update `CHANGELOG.md` for customer-visible changes.
3. Run `npm test`, `npm run productization:audit`, `npm run commercial:validate`,
   `npm run process:validate`, and `npm run performance:budgets`.
4. Build and validate product/lakehouse release packages.
5. Tag the release with an immutable version and attach release artifacts.

## Performance Budgets

`ops/performance-budgets.example.json` records the current product budgets for
dashboard bundle size, screenshot QA, ingestion load, lakehouse burn-in, and
regression checks. `scripts/validate-performance-budgets.js` validates the
budget file and confirms the load/regression test lanes are present.

