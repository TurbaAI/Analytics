#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

function main() {
  const branchProtection = json("ops/github/branch-protection.json");
  const contributing = read("CONTRIBUTING.md");
  const workflow = read(".github/workflows/release-governance.yml");
  const processDoc = read("docs/engineering-process.md");
  const changelog = read("CHANGELOG.md");
  const checks = [
    check("branch_protection.desired_state", branchProtection.branch === "main" && branchProtection.requiredPullRequestReviews.requireCodeOwnerReviews && branchProtection.allowForcePushes === false, "branch protection desired state is defined"),
    check("branch_protection.required_checks", branchProtection.requiredStatusChecks.includes("Verify static prototype") && branchProtection.requiredStatusChecks.includes("Release Governance"), "required status checks include CI and governance"),
    check("codeowners", exists(".github/CODEOWNERS") && read(".github/CODEOWNERS").includes("@"), "CODEOWNERS exists"),
    check("pr_template", exists(".github/pull_request_template.md") && read(".github/pull_request_template.md").includes("npm test"), "pull request template includes verification"),
    check("conventional_commits.docs", contributing.includes("Conventional Commits") && contributing.includes("type(optional-scope):"), "Conventional Commits are documented"),
    check("conventional_commits.workflow", workflow.includes("validate-conventional-commit.js") && exists("scripts/validate-conventional-commit.js"), "PR title conventional commit validation is wired"),
    check("release_process", processDoc.includes("Release Process") && processDoc.includes("CHANGELOG.md") && changelog.includes("## [0.1.0]"), "release process and changelog exist"),
    check("governance_workflow", workflow.includes("validate-commercial-readiness.js") && workflow.includes("validate-engineering-process.js") && workflow.includes("validate-performance-budgets.js"), "governance workflow runs commercial/process/performance gates")
  ];
  const failed = checks.filter((item) => !item.passed);
  process.stdout.write(`${JSON.stringify({ status: failed.length ? "failed" : "ok", checks }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

