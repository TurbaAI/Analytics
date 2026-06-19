#!/usr/bin/env node
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const LIVE_SECRET_HISTORY_FILE = "build/lakehouse-secrets-live.yaml";
const LEAKED_LIVE_SECRET_VALUE_SHA256 = new Set([
  "77d0d05e32e4fc3fc75c48ffdd70fe2fff1715e58122ae478c846633db7d243b",
  "9a5eeca39e25ad725610ff870e0b57c24c2c846261c9f2c2861c3eb91f26f1c6",
  "0d3ec953fc95e176eb22ddabf33c9b2d136e9f51d25b2edd8a0092887657a6d4",
  "15a1df7faf3d709b936f80d8ef3be07456f183d0d9f74402a031e78ca00f385e",
  "b90f0019303ad12f42dc09a4d06a108283ee019a7208bb390ea24c051bf46312"
]);

function parseArgs(argv) {
  const args = { out: "" };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "--out") {
      args.out = requireValue(arg, next);
      index += 1;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/audit-productization-phases.js [--out <file>]

Audits the productization phases: repo debt, tenancy and identity, production infrastructure, reliability/security/compliance, commercial GTM, and engineering process.`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function includes(relativePath, text) {
  return exists(relativePath) && read(relativePath).includes(text);
}

function matches(relativePath, pattern) {
  return exists(relativePath) && pattern.test(read(relativePath));
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: args.includes("-z") ? "buffer" : "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed\n${result.stderr}`);
  }
  return result.stdout;
}

function gitOptional(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
}

function trackedFiles() {
  return git(["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function noGitGrepMatch(parts) {
  const needle = parts.join("-");
  const result = gitOptional(["grep", "-I", "-n", "--fixed-strings", "--", needle]);
  if (result.status === 1) return true;
  if (result.status === 0) return false;
  throw new Error(`git grep failed\n${result.stderr}`);
}

function noGitHistoryMatch(parts) {
  const needle = parts.join("-");
  const result = gitOptional(["log", "--all", "-S", needle, "--format=%H", "--"]);
  if (result.status !== 0) throw new Error(`git log failed\n${result.stderr}`);
  return !result.stdout.trim();
}

function noGitPathHistoryMatch(relativePath) {
  const result = gitOptional(["log", "--all", "--format=%H", "--", relativePath]);
  if (result.status !== 0) throw new Error(`git log failed\n${result.stderr}`);
  return !result.stdout.trim();
}

function noGitHistorySecretHashMatch(secretHashes) {
  const revs = git(["rev-list", "--all"])
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!revs.length) return true;

  const result = gitOptional([
    "grep",
    "-I",
    "-h",
    "-E",
    "(bearer-token|hmac-secret|enrollment-token|api-tokens):|\\b(collector|hmac|queue|enroll)_[A-Za-z0-9_+/=-]{12,}",
    ...revs,
    "--"
  ]);
  if (result.status === 1) return true;
  if (result.status !== 0) throw new Error(`git grep failed\n${result.stderr}`);

  const candidates = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    const keyValue = line.match(/\b(?:bearer-token|hmac-secret|enrollment-token|api-tokens):\s*["']?([^"'\r\n]+)/);
    if (keyValue) candidates.add(keyValue[1].trim());
    for (const token of line.matchAll(/\b(?:collector|hmac|queue|enroll)_[A-Za-z0-9_+/=-]{12,}/g)) {
      candidates.add(token[0]);
    }
  }

  return !Array.from(candidates).some((candidate) => (
    secretHashes.has(crypto.createHash("sha256").update(candidate).digest("hex"))
  ));
}

function check(name, passed, detail, severity = "error") {
  return {
    name,
    passed: Boolean(passed),
    detail,
    severity
  };
}

function pathChecks(paths) {
  return paths.map((relativePath) => check(`path.${relativePath}`, exists(relativePath), `${relativePath} exists`));
}

function phase(id, title, checks) {
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  const warnings = checks.filter((item) => !item.passed && item.severity === "warning");
  return {
    id,
    title,
    status: failed.length ? "failed" : warnings.length ? "attention" : "ok",
    checks
  };
}

function buildReport() {
  const files = trackedFiles();
  const leakedToken = ["collector", "token", "live"];
  const leakedHmac = ["collector", "hmac", "live"];
  const gitignore = exists(".gitignore") ? read(".gitignore") : "";

  const phases = [
    phase("phase-0", "Close Existing Debt", [
      check("no_tracked_build_artifacts", files.every((file) => !file.startsWith("build/")), "build/ artifacts are untracked"),
      check("no_tracked_python_bytecode", files.every((file) => !file.endsWith(".pyc") && !file.includes("/__pycache__/")), "Python bytecode is untracked"),
      check("gitignore_build", gitignore.includes("/build/"), ".gitignore excludes generated build output"),
      check("gitignore_python_bytecode", gitignore.includes("*.pyc") && gitignore.includes("__pycache__/"), ".gitignore excludes Python bytecode"),
      check("scrubbed_token_head", noGitGrepMatch(leakedToken), "leaked collector bearer-token marker is absent from tracked files"),
      check("scrubbed_hmac_head", noGitGrepMatch(leakedHmac), "leaked collector HMAC marker is absent from tracked files"),
      check("scrubbed_token_history", noGitHistoryMatch(leakedToken), "leaked collector bearer-token marker is absent from local git history"),
      check("scrubbed_hmac_history", noGitHistoryMatch(leakedHmac), "leaked collector HMAC marker is absent from local git history"),
      check("scrubbed_live_secrets_file_head", !files.includes(LIVE_SECRET_HISTORY_FILE), "live generated secrets file is absent from tracked files"),
      check("scrubbed_live_secrets_file_history", noGitPathHistoryMatch(LIVE_SECRET_HISTORY_FILE), "live generated secrets file is absent from local git history"),
      check("scrubbed_live_secret_values_history", noGitHistorySecretHashMatch(LEAKED_LIVE_SECRET_VALUE_SHA256), "known leaked live credential hashes are absent from local git history"),
      check("demo_data_boundary_ui", includes("index.html", "dataBoundaryBanner"), "dashboard renders a demo-data boundary"),
      check("demo_data_boundary_state", includes("app-state.js", "demoDataBoundary") && includes("app-render.js", "renderDataBoundary"), "workspace state and render path carry the demo-data boundary"),
      check("demo_data_boundary_schema", includes("schemas/turba-workspace.v2.schema.json", "\"dataBoundary\""), "workspace exports declare dataBoundary"),
      check("demo_data_boundary_docs", includes("README.md", "Demo Data Boundary"), "README documents the demo-data boundary")
    ]),
    phase("phase-1", "Multi-Tenant and Identity-Aware", [
      check("api_rbac", includes("services/api-server/api_server/auth.py", "ROLE_RANK") && includes("services/api-server/api_server/auth.py", "scoped_tenant"), "API auth enforces role rank and scoped tenant access"),
      check("api_oidc_jwks", includes("services/api-server/api_server/auth.py", "JwtVerifier") && includes("services/api-server/api_server/auth.py", "jwks_url"), "API supports JWT/JWKS identity verification"),
      check("ingestion_rbac", includes("server/ingestion-server.js", "ROLE_PERMISSIONS") && includes("server/ingestion-server.js", "tenantForRequest"), "ingestion API uses tenant-aware RBAC"),
      check("audit_logging", includes("server/ingestion-server.js", "/v1/audit") && includes("services/collector-gateway/collector_gateway/app.py", "AuditLog"), "tenant and collector actions are audit logged"),
      check("collector_tenant_credentials", includes("services/collector-gateway/collector_gateway/app.py", "CollectorCredential") && includes("services/collector-gateway/collector_gateway/app.py", "TURBALANCE_COLLECTOR_TENANT_CREDENTIALS") && includes("services/collector-gateway/collector_gateway/app.py", "_enforce_principal_tenant"), "collector supports tenant-scoped bearer/HMAC credentials"),
      check("customer_managed_certs", includes("services/discovery-api/discovery_api/app.py", "external-ca") && includes("services/discovery-api/discovery_api/app.py", "spire") && includes("ops/kubernetes/lakehouse-mtls.yaml", "cert-manager.io/v1"), "discovery and mTLS manifests support managed CA modes"),
      check("cert_rotation_revocation", includes("services/discovery-api/discovery_api/app.py", "/certificates/rotate") && includes("services/discovery-api/discovery_api/app.py", "/certificates/revoke"), "agent certificates can rotate and revoke"),
      ...pathChecks(["scripts/provision-tenant.js", "scripts/provision-customer-iam.js"]),
      check("tenant_admin_api", includes("server/ingestion-server.js", "/v1/tenants") && includes("server/ingestion-server.js", "tenant:manage"), "tenant onboarding is available through admin API"),
      check("action_writeback_approval_gate", includes("services/action-runner/action_runner/runner.py", "CONNECTOR_REGISTRY") && includes("services/action-runner/action_runner/runner.py", "ACTION_RUNNER_REQUIRE_APPROVAL") && includes("services/action-runner/action_runner/runner.py", "ApprovalRequiredError") && includes("app-render.js", "Apply (requires approval)") && includes("tests/run-all.js", "action-runner.test.js"), "action write-back connectors are registry-backed and approval-gated")
    ]),
    phase("phase-2", "Production Infrastructure", [
      check("object_store_required", includes("scripts/validate-lakehouse-production-config.js", "lake_root_object_store") && includes("ops/lakehouse-production.env.example", "s3://"), "production config requires object storage for the lake"),
      check("managed_metadata_db", includes("scripts/validate-lakehouse-production-config.js", "metadata_db_managed") && includes("ops/lakehouse-production.env.example", "postgresql://"), "production config requires managed metadata DB"),
      check("managed_queue", includes("scripts/validate-lakehouse-production-config.js", "queue_backend_managed") && matches("ops/lakehouse-production.env.example", /TURBALANCE_QUEUE_GATEWAY_BACKEND=(kafka|redpanda|nats)/), "production config requires managed queue backend"),
      check("terraform_managed_backends", includes("ops/terraform/lakehouse/aws/main.tf", "aws_s3_bucket") && includes("ops/terraform/lakehouse/aws/main.tf", "aws_db_instance") && includes("ops/terraform/lakehouse/aws/main.tf", "aws_msk_cluster"), "Terraform defines S3, RDS, and MSK backends"),
      check("ha_backup_retention", includes("ops/terraform/lakehouse/aws/main.tf", "backup_retention_period") && includes("ops/terraform/lakehouse/aws/main.tf", "deletion_protection") && includes("ops/kubernetes/lakehouse-platform.yaml", "lakehouse-retention"), "backup, deletion protection, and retention wiring exist"),
      check("scale_test_lane", exists("scripts/run-lakehouse-load-test.js") && exists("scripts/run-lakehouse-burn-in.js") && exists("scripts/run-lakehouse-cluster-smoke.js"), "load, burn-in, and cluster smoke lanes exist"),
      check("image_lifecycle", exists("scripts/run-lakehouse-image-release.js") && exists("scripts/sign-lakehouse-images.js") && exists("scripts/generate-lakehouse-image-lock.js") && exists("scripts/validate-lakehouse-image-registry.js"), "registry, signing, image lock, and release lanes exist"),
      check("automated_migrations_upgrades", includes("scripts/package-lakehouse-release.js", "release-manifest.json") && includes("scripts/run-lakehouse-go-live.js", "image-lock") && includes("scripts/run-lakehouse-go-live.js", "kubernetes-release"), "release packaging and go-live orchestration include upgrade gates"),
      check("mfu_inference_economics", includes("analytics-core.js", "modelFlopsUtilization") && exists("schemas/turba-device-flops.v1.json") && includes("app.js", "inferenceEconomics") && includes("app.js", "kvCachePressure") && includes("tests/run-all.js", "mfu-inference.test.js"), "MFU/HFU and inference economics analytics are wired")
    ]),
    phase("phase-3", "Reliability, Security, and Compliance", [
      check("slo_policy", exists("ops/lakehouse-slo-policy.example.json") && exists("scripts/validate-lakehouse-slo-policy.js"), "SLO policy and validator exist"),
      check("platform_alerting", includes("ops/kubernetes/lakehouse-prometheus-rules.yaml", "TurbalanceApiDown") && includes("ops/kubernetes/lakehouse-prometheus-rules.yaml", "TurbalanceSecretSyncNotReady"), "platform Prometheus alerts cover API and secret sync health"),
      check("incident_routing", includes("ops/kubernetes/lakehouse-alert-routing.yaml", "PAGERDUTY") && includes("docs/security-compliance-posture.md", "incident process"), "incident routing and process are documented"),
      check("security_gates", exists("scripts/validate-lakehouse-security.js") && exists("scripts/validate-lakehouse-release-supply-chain.js") && exists("scripts/validate-lakehouse-secret-material.js"), "security, supply-chain, and secret gates exist"),
      check("compliance_posture", includes("docs/security-compliance-posture.md", "SOC 2 Type II") && includes("docs/security-compliance-posture.md", "penetration test") && includes("docs/security-compliance-posture.md", "vulnerability"), "compliance posture documents SOC 2, pen test, and vulnerability-management expectations"),
      check("data_governance", includes("docs/security-compliance-posture.md", "right-to-be-forgotten") && matches("docs/security-compliance-posture.md", /data residency/i) && exists("scripts/run-retention-job.js") && exists("ops/kubernetes/ingestion-retention-cronjob.yaml"), "data residency, deletion, and retention controls are documented and wired"),
      check("privacy_demo_boundary", includes("docs/security-compliance-posture.md", "Demo data") && includes("README.md", "Demo Data Boundary"), "privacy posture preserves a demo-data boundary"),
      check("benchmark_privacy_guard", exists("schemas/turba-benchmark-contribution.v1.schema.json") && includes("services/benchmark-commons/benchmark_commons/aggregator.py", "IDENTIFIER_FIELDS") && includes("services/benchmark-commons/benchmark_commons/aggregator.py", "minimumK") && includes("app-render.js", "Benchmark opt-in") && includes("docs/security-compliance-posture.md", "k-anonymity") && includes("tests/run-all.js", "benchmark-commons.test.js"), "cross-fleet benchmark contribution is opt-in, coarse, and k-anonymous")
    ]),
    phase("phase-4", "Commercial and GTM", [
      check("proprietary_license", exists("LICENSE.md") && includes("LICENSE.md", "Proprietary License") && includes("package.json", "SEE LICENSE IN LICENSE.md"), "proprietary license is formalized"),
      check("packaging_pricing", includes("docs/commercial-gtm.md", "Appliance") && includes("docs/commercial-gtm.md", "Managed SaaS") && includes("ops/commercial-metering.example.json", "active_gpus"), "appliance/SaaS packaging and metering are documented"),
      check("support_sla", includes("docs/support-sla.md", "P1") && includes("docs/support-sla.md", "Initial Response"), "support SLA is documented"),
      check("status_page", includes("docs/status-page.md", "Incident States") && includes("docs/status-page.md", "Billing usage export"), "status page model is documented"),
      check("design_partner_roi", includes("ops/design-partner-pilots.example.json", "minimumCompletedPilotsBeforeExternalRoiClaims") && includes("docs/design-partner-validation.md", "Recovered GPU-hours") && exists("tests/evidence-pack-export.test.js"), "design-partner ROI validation plan and evidence machinery exist"),
      check("verified_savings_ledger_engine", exists("schemas/turba-savings-ledger.v1.schema.json") && includes("predictive-core.js", "recordOutcome") && includes("predictive-core.js", "advanceLedgerStatus") && includes("predictive-core.js", "rollupLedger") && includes("tests/run-all.js", "savings-ledger.test.js") && includes("tests/run-all.js", "savings-ledger-python.test.js"), "verified savings ledger schema, engine, lifecycle, and parity tests are wired"),
      check("verified_savings_ledger_lakehouse", includes("services/api-server/api_server/app.py", '"/v1/savings-ledger"') && includes("services/duckdb-query-service/duckdb_query_service/query.py", "def savings_ledger") && includes("services/transform-runner/transform_runner/runner.py", '"vs_savings_ledger"') && includes("tests/run-all.js", "savings-ledger-lakehouse.test.js"), "verified savings ledger API route and derived lakehouse table are wired"),
      check("turbatop_operator_tui", exists("cli/turbatop/turbatop.py") && exists("docs/turbatop.md") && includes("Makefile", "turbatop:") && includes("tests/run-all.js", "turbatop.test.js"), "turbatop terminal operator UI, build target, docs, and smoke test are wired"),
      check("billing_usage_integration", includes("docs/billing-usage-integration.md", "Usage Record") && includes("ops/commercial-metering.example.json", "billingExport"), "billing usage integration is specified"),
      check("commercial_validator", exists("scripts/validate-commercial-readiness.js") && includes("package.json", "commercial:validate"), "commercial readiness validator is wired")
    ]),
    phase("phase-5", "Engineering Org and Process", [
      check("branch_protection", exists("ops/github/branch-protection.json") && includes("ops/github/branch-protection.json", "Release Governance") && includes("ops/github/branch-protection.json", "allowForcePushes"), "branch protection desired state is documented"),
      check("code_review", exists(".github/CODEOWNERS") && exists(".github/pull_request_template.md"), "code-owner review and PR template are present"),
      check("conventional_commits_enforced", includes("CONTRIBUTING.md", "Conventional Commits") && exists("scripts/validate-conventional-commit.js") && includes(".github/workflows/release-governance.yml", "validate-conventional-commit.js"), "Conventional Commit PR-title gate is wired"),
      check("release_process_changelog", exists("CHANGELOG.md") && includes("docs/engineering-process.md", "Release Process"), "release process and changelog are documented"),
      check("performance_budgets", exists("ops/performance-budgets.example.json") && exists("scripts/validate-performance-budgets.js"), "performance budget validator is present"),
      check("load_regression_suite", exists("scripts/run-lakehouse-load-test.js") && exists("scripts/run-lakehouse-burn-in.js") && includes("tests/run-all.js", "predictive + prescriptive core") && includes("tests/run-all.js", "commercial and engineering process"), "load and regression lanes are wired"),
      check("process_validator", exists("scripts/validate-engineering-process.js") && includes("package.json", "process:validate"), "engineering process validator is wired")
    ])
  ];

  const failed = phases.flatMap((item) => item.checks).filter((item) => !item.passed && item.severity === "error");
  return {
    status: failed.length ? "failed" : "ok",
    generatedAt: new Date().toISOString(),
    phases,
    requiredOperationalActions: [
      "Rotate any live collector credentials that ever matched the historical leaked values in the customer secret manager.",
      "Force-update protected remotes only after the rewritten local history is reviewed and coordinated with collaborators.",
      "Run live go-live gates against customer-managed object storage, metadata DB, queue, certificate authority, registry, and IdP before external rollout.",
      "Complete 2-3 real design-partner pilots with signed ROI evidence before making external recovered-GPU-hour claims.",
      "Apply branch protection, CODEOWNERS, and required status checks in the remote GitHub repository settings."
    ]
  };
}

function writeReport(report, out) {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (out) {
    const fullPath = path.resolve(root, out);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body, "utf8");
  }
  process.stdout.write(body);
}

try {
  const args = parseArgs(process.argv);
  const report = buildReport();
  writeReport(report, args.out);
  if (report.status !== "ok") process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
