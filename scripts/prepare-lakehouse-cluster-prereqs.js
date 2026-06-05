#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const defaultVersions = {
  certManager: "v1.20.2",
  externalSecrets: "v2.5.0",
  prometheusOperator: "v0.91.0"
};

const requiredAddons = [
  {
    name: "cert-manager",
    crds: ["certificates.cert-manager.io", "issuers.cert-manager.io"],
    controllers: [
      { namespace: "cert-manager", name: "cert-manager" },
      { namespace: "cert-manager", name: "cert-manager-cainjector" },
      { namespace: "cert-manager", name: "cert-manager-webhook" }
    ],
    fullManifest: (version) => `https://github.com/cert-manager/cert-manager/releases/download/${version}/cert-manager.yaml`,
    crdManifest: (version) => `https://github.com/cert-manager/cert-manager/releases/download/${version}/cert-manager.crds.yaml`,
    applyArgs: (manifest) => ["apply", "-f", manifest]
  },
  {
    name: "external-secrets",
    crds: ["externalsecrets.external-secrets.io", "clustersecretstores.external-secrets.io"],
    controllers: [
      { namespace: "default", name: "external-secrets" },
      { namespace: "default", name: "external-secrets-cert-controller" },
      { namespace: "default", name: "external-secrets-webhook" }
    ],
    fullManifest: (version) => `https://github.com/external-secrets/external-secrets/releases/download/${version}/external-secrets.yaml`,
    crdManifest: (version) => `https://raw.githubusercontent.com/external-secrets/external-secrets/${version}/deploy/crds/bundle.yaml`,
    applyArgs: (manifest) => ["apply", "--server-side", "-f", manifest]
  },
  {
    name: "prometheus-operator",
    crds: ["servicemonitors.monitoring.coreos.com", "prometheusrules.monitoring.coreos.com"],
    controllers: [{ namespace: "default", name: "prometheus-operator" }],
    fullManifest: (version) => `https://github.com/prometheus-operator/prometheus-operator/releases/download/${version}/bundle.yaml`,
    crdManifest: (version) => `https://github.com/prometheus-operator/prometheus-operator/releases/download/${version}/stripped-down-crds.yaml`,
    applyArgs: (manifest) => ["apply", "--server-side", "-f", manifest]
  }
];

function parseArgs(argv) {
  const args = {
    out: "",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    certManagerVersion: process.env.TURBALANCE_CERT_MANAGER_VERSION || defaultVersions.certManager,
    externalSecretsVersion: process.env.TURBALANCE_EXTERNAL_SECRETS_VERSION || defaultVersions.externalSecrets,
    prometheusOperatorVersion: process.env.TURBALANCE_PROMETHEUS_OPERATOR_VERSION || defaultVersions.prometheusOperator,
    runLiveChecks: false,
    install: false,
    installCrdsOnly: false,
    wait: false,
    timeout: process.env.TURBALANCE_CLUSTER_PREREQ_TIMEOUT || "180s"
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--run-live-checks") args.runLiveChecks = true;
    else if (arg === "--install") {
      args.install = true;
      args.runLiveChecks = true;
    } else if (arg === "--install-crds-only") {
      args.installCrdsOnly = true;
      args.runLiveChecks = true;
    } else if (arg === "--wait") args.wait = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in args)) throw new Error(`Unknown argument ${arg}`);
      args[key] = need(arg, next);
      index += 1;
    } else {
      throw new Error(`Unexpected argument ${arg}`);
    }
  }
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/prepare-lakehouse-cluster-prereqs.js [--run-live-checks] [--install|--install-crds-only] [--wait] [--out <json>]

Checks the Kubernetes add-ons required by the lakehouse release overlay: cert-manager, External Secrets Operator, and Prometheus Operator APIs.

Default mode is non-mutating and records the exact kubectl commands. Use --run-live-checks to inspect the active cluster, --install-crds-only to install only CRDs, or --install to apply the pinned upstream add-on manifests.`);
}

function versionMap(args) {
  return {
    "cert-manager": args.certManagerVersion,
    "external-secrets": args.externalSecretsVersion,
    "prometheus-operator": args.prometheusOperatorVersion
  };
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    ...options
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function compactResult(result) {
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  return {
    command: result.command,
    ok: result.ok,
    status: result.status,
    stdout: stdout.length > 4000 ? `${stdout.slice(0, 4000)}\n[truncated ${stdout.length - 4000} chars]` : stdout,
    stderr: stderr.length > 4000 ? `${stderr.slice(0, 4000)}\n[truncated ${stderr.length - 4000} chars]` : stderr,
    ...(result.parseError ? { parseError: result.parseError } : {})
  };
}

function runJson(command, args, options = {}) {
  const result = run(command, args, options);
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch (error) {
    return { ...result, ok: false, parseError: error.message };
  }
  return { ...result, json };
}

function plannedCommands(args) {
  const versions = versionMap(args);
  return requiredAddons.flatMap((addon) => {
    const version = versions[addon.name];
    const fullManifest = addon.fullManifest(version);
    const crdManifest = addon.crdManifest(version);
    return [
      `kubectl ${addon.applyArgs(crdManifest).join(" ")}`,
      `kubectl ${addon.applyArgs(fullManifest).join(" ")}`,
      ...addon.crds.map((crd) => `kubectl get crd ${crd}`),
      ...addon.controllers.map((deployment) => `kubectl -n ${deployment.namespace} rollout status deployment/${deployment.name} --timeout=${args.timeout}`)
    ];
  });
}

function installAddons(args) {
  const versions = versionMap(args);
  const results = [];
  for (const addon of requiredAddons) {
    const manifest = args.installCrdsOnly ? addon.crdManifest(versions[addon.name]) : addon.fullManifest(versions[addon.name]);
    results.push({ addon: addon.name, manifest, result: run("kubectl", addon.applyArgs(manifest)) });
  }
  return results;
}

function getCrds() {
  const result = runJson("kubectl", ["get", "crd", "-o", "json"]);
  if (!result.ok) return { result, names: new Set() };
  return {
    result,
    names: new Set((result.json?.items || []).map((item) => item.metadata?.name).filter(Boolean))
  };
}

function getDeployments() {
  const result = runJson("kubectl", ["get", "deployment", "-A", "-o", "json"]);
  if (!result.ok) return { result, deployments: [] };
  return {
    result,
    deployments: (result.json?.items || []).map((item) => ({
      namespace: item.metadata?.namespace,
      name: item.metadata?.name,
      labels: item.metadata?.labels || {},
      available: Number(item.status?.availableReplicas || 0),
      ready: Number(item.status?.readyReplicas || 0),
      desired: Number(item.spec?.replicas || 0)
    }))
  };
}

function hasDeployment(deployments, expected) {
  return deployments.find((item) => item.namespace === expected.namespace && item.name === expected.name);
}

function waitForControllers(args) {
  const results = [];
  if (args.installCrdsOnly || !args.wait) return results;
  for (const addon of requiredAddons) {
    for (const deployment of addon.controllers) {
      results.push({
        addon: addon.name,
        deployment,
        result: run("kubectl", ["-n", deployment.namespace, "rollout", "status", `deployment/${deployment.name}`, `--timeout=${args.timeout}`])
      });
    }
  }
  return results;
}

function liveChecks(args) {
  const checks = [];
  const liveResults = [];
  const kubectlAvailable = commandAvailable("kubectl");
  checks.push(check("tool.kubectl", kubectlAvailable, kubectlAvailable ? "kubectl is installed" : "kubectl is not installed"));
  if (!kubectlAvailable) return { checks, liveResults };

  const version = run("kubectl", ["version", "--client=true"]);
  const cluster = run("kubectl", ["cluster-info"]);
  const namespace = run("kubectl", ["get", "namespace", args.namespace]);
  const crdPermission = run("kubectl", ["auth", "can-i", "create", "customresourcedefinitions.apiextensions.k8s.io"]);
  liveResults.push(compactResult(version), compactResult(cluster), compactResult(namespace), compactResult(crdPermission));
  checks.push(check("kubectl.client", version.ok, version.stderr || version.stdout));
  checks.push(check("cluster.reachable", cluster.ok, cluster.stderr || cluster.stdout));
  checks.push(check("namespace.present", namespace.ok, namespace.stderr || namespace.stdout));
  checks.push(check("rbac.crd.create", crdPermission.ok && crdPermission.stdout.trim() === "yes", crdPermission.stderr || crdPermission.stdout));

  if (args.install || args.installCrdsOnly) {
    const installs = installAddons(args);
    for (const item of installs) {
      liveResults.push(compactResult(item.result));
      checks.push(check(`install.${item.addon}`, item.result.ok, item.result.stderr || item.result.stdout || item.manifest));
    }
    const waits = waitForControllers(args);
    for (const item of waits) {
      liveResults.push(compactResult(item.result));
      checks.push(check(`rollout.${item.addon}.${item.deployment.name}`, item.result.ok, item.result.stderr || item.result.stdout));
    }
  }

  const crds = getCrds();
  liveResults.push(compactResult(crds.result));
  checks.push(check("cluster.crd.list", crds.result.ok, crds.result.ok ? `${crds.names.size} CRDs listed` : crds.result.stderr || crds.result.stdout));
  const deployments = getDeployments();
  liveResults.push(compactResult(deployments.result));
  checks.push(check("cluster.deployments.list", deployments.result.ok, deployments.result.ok ? `${deployments.deployments.length} deployments listed` : deployments.result.stderr || deployments.result.stdout));

  for (const addon of requiredAddons) {
    for (const crd of addon.crds) {
      checks.push(check(`crd.${crd}`, crds.names.has(crd), crds.names.has(crd) ? `${crd} exists` : `${crd} is missing`));
    }
    if (!args.installCrdsOnly) {
      for (const expected of addon.controllers) {
        const deployment = hasDeployment(deployments.deployments, expected);
        const ready = deployment && deployment.available > 0 && deployment.ready >= Math.max(1, deployment.desired);
        checks.push(
          check(
            `controller.${addon.name}.${expected.name}`,
            ready,
            deployment ? `${expected.namespace}/${expected.name} ready=${deployment.ready} available=${deployment.available} desired=${deployment.desired}` : `${expected.namespace}/${expected.name} is missing`
          )
        );
      }
    }
  }
  return { checks, liveResults };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
    fs.writeFileSync(path.resolve(root, out), body, "utf8");
  }
  process.stdout.write(body);
}

function main() {
  const args = parseArgs(process.argv);
  const checks = [];
  let live = { checks: [], liveResults: [] };
  if (args.runLiveChecks) live = liveChecks(args);
  checks.push(...live.checks);
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  const status = args.runLiveChecks ? (failed.length ? "action-required" : "ready") : "planned";
  const report = {
    status,
    namespace: args.namespace,
    versions: versionMap(args),
    liveChecks: args.runLiveChecks,
    installRequested: args.install,
    installCrdsOnlyRequested: args.installCrdsOnly,
    waitRequested: args.wait,
    timeout: args.timeout,
    checks,
    commands: plannedCommands(args),
    results: live.liveResults
  };
  write(args.out, report);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
