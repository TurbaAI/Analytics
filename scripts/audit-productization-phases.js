#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

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

Audits the four productization phases: repo debt, tenancy and identity, production infrastructure, and reliability/security/compliance posture.`);
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
      check("tenant_admin_api", includes("server/ingestion-server.js", "/v1/tenants") && includes("server/ingestion-server.js", "tenant:manage"), "tenant onboarding is available through admin API")
    ]),
    phase("phase-2", "Production Infrastructure", [
      check("object_store_required", includes("scripts/validate-lakehouse-production-config.js", "lake_root_object_store") && includes("ops/lakehouse-production.env.example", "s3://"), "production config requires object storage for the lake"),
      check("managed_metadata_db", includes("scripts/validate-lakehouse-production-config.js", "metadata_db_managed") && includes("ops/lakehouse-production.env.example", "postgresql://"), "production config requires managed metadata DB"),
      check("managed_queue", includes("scripts/validate-lakehouse-production-config.js", "queue_backend_managed") && matches("ops/lakehouse-production.env.example", /TURBALANCE_QUEUE_GATEWAY_BACKEND=(kafka|redpanda|nats)/), "production config requires managed queue backend"),
      check("terraform_managed_backends", includes("ops/terraform/lakehouse/aws/main.tf", "aws_s3_bucket") && includes("ops/terraform/lakehouse/aws/main.tf", "aws_db_instance") && includes("ops/terraform/lakehouse/aws/main.tf", "aws_msk_cluster"), "Terraform defines S3, RDS, and MSK backends"),
      check("ha_backup_retention", includes("ops/terraform/lakehouse/aws/main.tf", "backup_retention_period") && includes("ops/terraform/lakehouse/aws/main.tf", "deletion_protection") && includes("ops/kubernetes/lakehouse-platform.yaml", "lakehouse-retention"), "backup, deletion protection, and retention wiring exist"),
      check("scale_test_lane", exists("scripts/run-lakehouse-load-test.js") && exists("scripts/run-lakehouse-burn-in.js") && exists("scripts/run-lakehouse-cluster-smoke.js"), "load, burn-in, and cluster smoke lanes exist"),
      check("image_lifecycle", exists("scripts/run-lakehouse-image-release.js") && exists("scripts/sign-lakehouse-images.js") && exists("scripts/generate-lakehouse-image-lock.js") && exists("scripts/validate-lakehouse-image-registry.js"), "registry, signing, image lock, and release lanes exist"),
      check("automated_migrations_upgrades", includes("scripts/package-lakehouse-release.js", "release-manifest.json") && includes("scripts/run-lakehouse-go-live.js", "image-lock") && includes("scripts/run-lakehouse-go-live.js", "kubernetes-release"), "release packaging and go-live orchestration include upgrade gates")
    ]),
    phase("phase-3", "Reliability, Security, and Compliance", [
      check("slo_policy", exists("ops/lakehouse-slo-policy.example.json") && exists("scripts/validate-lakehouse-slo-policy.js"), "SLO policy and validator exist"),
      check("platform_alerting", includes("ops/kubernetes/lakehouse-prometheus-rules.yaml", "TurbalanceApiDown") && includes("ops/kubernetes/lakehouse-prometheus-rules.yaml", "TurbalanceSecretSyncNotReady"), "platform Prometheus alerts cover API and secret sync health"),
      check("incident_routing", includes("ops/kubernetes/lakehouse-alert-routing.yaml", "PAGERDUTY") && includes("docs/security-compliance-posture.md", "incident process"), "incident routing and process are documented"),
      check("security_gates", exists("scripts/validate-lakehouse-security.js") && exists("scripts/validate-lakehouse-release-supply-chain.js") && exists("scripts/validate-lakehouse-secret-material.js"), "security, supply-chain, and secret gates exist"),
      check("compliance_posture", includes("docs/security-compliance-posture.md", "SOC 2 Type II") && includes("docs/security-compliance-posture.md", "penetration test") && includes("docs/security-compliance-posture.md", "vulnerability"), "compliance posture documents SOC 2, pen test, and vulnerability-management expectations"),
      check("data_governance", includes("docs/security-compliance-posture.md", "right-to-be-forgotten") && matches("docs/security-compliance-posture.md", /data residency/i) && exists("scripts/run-retention-job.js") && exists("ops/kubernetes/ingestion-retention-cronjob.yaml"), "data residency, deletion, and retention controls are documented and wired"),
      check("privacy_demo_boundary", includes("docs/security-compliance-posture.md", "Demo data") && includes("README.md", "Demo Data Boundary"), "privacy posture preserves a demo-data boundary")
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
      "Run live go-live gates against customer-managed object storage, metadata DB, queue, certificate authority, registry, and IdP before external rollout."
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
