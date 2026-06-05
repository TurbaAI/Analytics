#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

function main() {
  const files = {
    platform: read("ops/kubernetes/lakehouse-platform.yaml"),
    mtls: read("ops/kubernetes/lakehouse-mtls.yaml"),
    authExternalSecrets: read("ops/kubernetes/lakehouse-platform-auth-secrets.yaml"),
    managedStorage: read("ops/kubernetes/lakehouse-managed-storage.yaml"),
    production: read("ops/kubernetes/lakehouse/production/kustomization.yaml"),
    deleteSecrets: read("ops/kubernetes/lakehouse/production/delete-placeholder-secrets.yaml"),
    prometheusRules: read("ops/kubernetes/lakehouse-prometheus-rules.yaml"),
    agent: read("ops/kubernetes/lakehouse-agent-daemonset.yaml"),
    platformServiceDockerfile: read("deploy/docker/Dockerfile.platform-service"),
    platformWorkerDockerfile: read("deploy/docker/Dockerfile.platform-worker"),
    dagsterDockerfile: read("deploy/docker/Dockerfile.dagster"),
    sqlmeshDockerfile: read("deploy/docker/Dockerfile.sqlmesh")
  };
  const checks = [
    check("api_auth_required_in_production", files.production.includes("production-config-patch.yaml") && read("ops/kubernetes/lakehouse/production/production-config-patch.yaml").includes('TURBALANCE_API_REQUIRE_AUTH: "true"'), "production config requires API auth"),
    check("collector_mtls_required_in_production", read("ops/kubernetes/lakehouse/production/production-config-patch.yaml").includes('TURBALANCE_COLLECTOR_REQUIRE_MTLS: "true"'), "collector mTLS is enabled in production"),
    check("placeholder_secrets_deleted", files.production.includes("delete-placeholder-secrets.yaml") && files.deleteSecrets.includes("$patch: delete"), "production overlay deletes checked-in development Secret resources"),
    check("platform_auth_externalized", files.production.includes("lakehouse-platform-auth-secrets.yaml") && files.authExternalSecrets.includes("lakehouse/collector-auth"), "collector, discovery, API, and mTLS CA secrets come from ExternalSecrets"),
    check("managed_storage_externalized", files.production.includes("lakehouse-managed-storage.yaml") && files.managedStorage.includes("lakehouse/metadata-db"), "metadata DB and object-store values come from ExternalSecrets"),
    check("mtls_gateway_sanitizes_xfcc", files.mtls.includes("forward_client_cert_details: SANITIZE_SET"), "Envoy sanitizes forwarded client certificate details"),
    check("mtls_gateway_requires_client_cert", files.mtls.includes("require_client_certificate: true"), "mTLS gateway requires agent client certificates"),
    check("network_policy_present", files.mtls.includes("kind: NetworkPolicy"), "collector gateway network policy is present"),
    check("service_account_tokens_disabled", count(files.platform, "automountServiceAccountToken: false") >= 2 && files.agent.includes("automountServiceAccountToken: false"), "base services and agent disable automatic service account token mounting"),
    check("only_agent_privileged", !files.platform.includes("privileged: true") && files.agent.includes("privileged: true"), "only the host agent DaemonSet runs privileged"),
    check("images_nonroot", [files.platformServiceDockerfile, files.platformWorkerDockerfile, files.dagsterDockerfile, files.sqlmeshDockerfile].every((body) => body.includes("USER 65532")), "platform service images declare non-root runtime users"),
    check("runtime_capabilities_dropped", files.platform.includes('capabilities: { drop: ["ALL"] }'), "platform containers drop Linux capabilities"),
    check("auth_failure_alerts_present", files.prometheusRules.includes("TurbalanceApiAuthFailures") && files.prometheusRules.includes("TurbalanceCollectorMtlsFailures"), "auth and mTLS failures alert through Prometheus")
  ];
  const failed = checks.filter((item) => !item.passed);
  console.log(JSON.stringify({ status: failed.length ? "failed" : "ok", checks }, null, 2));
  if (failed.length) {
    process.exitCode = 1;
  }
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
