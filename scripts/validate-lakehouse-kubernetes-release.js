#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const requiredResourceFragments = [
  "lakehouse/base",
  "lakehouse-platform-auth-secrets.yaml",
  "lakehouse-managed-storage.yaml",
  "lakehouse-otel-backend-secret.yaml",
  "lakehouse-alert-routing.yaml",
  "lakehouse-mtls.yaml"
];

const requiredPatchFragments = [
  "production-config-patch.yaml",
  "delete-placeholder-secrets.yaml",
  "otel-backend-config-patch.yaml"
];

const requiredDeletedSecrets = [
  "turbalance-api-auth",
  "turbalance-collector-auth",
  "turbalance-discovery-auth",
  "turbalance-agent-client-ca"
];

const requiredConfigKeys = [
  "TURBALANCE_LAKE_ROOT",
  "TURBALANCE_API_REQUIRE_AUTH",
  "TURBALANCE_API_JWT_ISSUER",
  "TURBALANCE_DISCOVERY_CERTIFICATE_MODE",
  "TURBALANCE_COLLECTOR_REQUIRE_MTLS",
  "TURBALANCE_QUEUE_GATEWAY_BACKEND",
  "TURBALANCE_QUEUE_GATEWAY_BROKER_URL"
];

function parseArgs(argv) {
  const args = {
    overlay: process.env.TURBALANCE_RELEASE_OVERLAY || "ops/kubernetes/lakehouse/production",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    out: "",
    allowPlaceholders: false,
    runClientDryRun: false,
    serverDryRun: false,
    dryRun: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--allow-placeholders") {
      args.allowPlaceholders = true;
    } else if (arg === "--run-client-dry-run") {
      args.runClientDryRun = true;
    } else if (arg === "--server-dry-run") {
      args.serverDryRun = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help") {
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
  console.log(`Usage: scripts/validate-lakehouse-kubernetes-release.js [--overlay <dir>] [--namespace <ns>] [--out <file>]

Checks a lakehouse Kustomize release overlay before apply. By default this is static and non-mutating. Add --run-client-dry-run for kubectl client dry-run, and --server-dry-run for apiserver validation.`);
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function isPlaceholder(value) {
  return /replace-with|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)|latest\b/i.test(
    String(value)
  );
}

function staticChecks(overlay, options) {
  const fullOverlay = path.resolve(root, overlay);
  const kustomizationPath = path.join(fullOverlay, "kustomization.yaml");
  const configPatchPath = path.join(fullOverlay, "production-config-patch.yaml");
  const deletePatchPath = path.join(fullOverlay, "delete-placeholder-secrets.yaml");
  const checks = [
    check("overlay.exists", fs.existsSync(fullOverlay), `${fullOverlay} exists`),
    check("kustomization.exists", fs.existsSync(kustomizationPath), `${kustomizationPath} exists`),
    check("production-config-patch.exists", fs.existsSync(configPatchPath), `${configPatchPath} exists`),
    check("delete-placeholder-secrets.exists", fs.existsSync(deletePatchPath), `${deletePatchPath} exists`)
  ];
  if (checks.some((item) => !item.passed)) return checks;

  const kustomization = read(kustomizationPath);
  const configPatch = read(configPatchPath);
  const deletePatch = read(deletePatchPath);
  for (const fragment of requiredResourceFragments) {
    checks.push(check(`resource.${fragment}`, kustomization.includes(fragment), `kustomization includes ${fragment}`));
  }
  for (const fragment of requiredPatchFragments) {
    checks.push(check(`patch.${fragment}`, kustomization.includes(fragment), `kustomization includes ${fragment}`));
  }
  checks.push(check("namespace", kustomization.includes(`namespace: ${options.namespace}`), `overlay namespace is ${options.namespace}`));
  checks.push(check("images.present", count(kustomization, "newName:") >= 9 && count(kustomization, "newTag:") >= 9, "release image replacements are present"));
  checks.push(check("images.immutable", !/newTag:\s*latest\b/i.test(kustomization), "release images do not use latest"));
  for (const key of requiredConfigKeys) {
    checks.push(check(`config.${key}`, configPatch.includes(key), `production config patch includes ${key}`));
  }
  checks.push(check("config.auth_required", configPatch.includes('TURBALANCE_API_REQUIRE_AUTH: "true"'), "API auth is required"));
  checks.push(check("config.mtls_required", configPatch.includes('TURBALANCE_COLLECTOR_REQUIRE_MTLS: "true"'), "collector mTLS is required"));
  for (const secret of requiredDeletedSecrets) {
    const hasSecret = deletePatch.includes(`name: ${secret}`) && deletePatch.includes("$patch: delete");
    checks.push(check(`delete-placeholder.${secret}`, hasSecret, `${secret} placeholder Secret is deleted`));
  }
  const placeholderFiles = listFiles(fullOverlay).filter((file) => isPlaceholder(read(file)));
  checks.push(
    check(
      "placeholders",
      options.allowPlaceholders || placeholderFiles.length === 0,
      placeholderFiles.length ? `placeholder values found in ${placeholderFiles.map((file) => path.relative(root, file)).join(", ")}` : "no placeholder values found"
    )
  );
  return checks;
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function runKubectl(args) {
  const result = spawnSync("kubectl", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  return {
    command: ["kubectl", ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function runKubectlShell(command) {
  const result = spawnSync("sh", ["-c", command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  return {
    command,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function compact(value, limit = 4000) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]` : text;
}

function compactResult(result) {
  return {
    ...result,
    stdout: compact(result.stdout),
    stderr: compact(result.stderr)
  };
}

function kubectlChecks(options) {
  const available = commandAvailable("kubectl");
  const checks = [check("kubectl.available", available || (!options.runClientDryRun && !options.serverDryRun), available ? "kubectl is installed" : "kubectl is not installed", options.runClientDryRun || options.serverDryRun ? "error" : "warning")];
  const results = [];
  if (!available) return { checks, results, available };
  if (options.runClientDryRun) {
    results.push(runKubectlShell(`kubectl kustomize ${quote(options.overlay)} --load-restrictor=LoadRestrictionsNone | kubectl apply --dry-run=client -o yaml -f -`));
  }
  if (options.serverDryRun) {
    results.push(runKubectlShell(`kubectl kustomize ${quote(options.overlay)} --load-restrictor=LoadRestrictionsNone | kubectl apply --server-side --dry-run=server -o yaml -f -`));
  }
  for (const result of results) {
    checks.push(check(`kubectl.${result.command.replace(/\s+/g, "_")}`, result.ok, result.ok ? `${result.command} succeeded` : compact(result.stderr || result.stdout || result.command)));
  }
  return { checks, results: results.map(compactResult), available };
}

function plannedCommands(options) {
  return [
    `kubectl kustomize ${options.overlay} --load-restrictor=LoadRestrictionsNone | kubectl apply --dry-run=client -o yaml -f -`,
    `kubectl kustomize ${options.overlay} --load-restrictor=LoadRestrictionsNone | kubectl apply --server-side --dry-run=server -o yaml -f -`,
    `kubectl -n ${options.namespace} rollout status deployment/api-server`,
    `kubectl -n ${options.namespace} rollout status daemonset/ebpf-agent`
  ];
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
  const options = parseArgs(process.argv);
  const staticResult = staticChecks(options.overlay, options);
  const kubectl = kubectlChecks(options);
  const checks = [...staticResult, ...kubectl.checks];
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  const report = {
    status: failed.length ? "failed" : options.runClientDryRun || options.serverDryRun ? "validated" : "dry-run",
    overlay: options.overlay,
    namespace: options.namespace,
    checks,
    commands: plannedCommands(options),
    kubectlAvailable: kubectl.available,
    kubectlResults: kubectl.results
  };
  write(options.out, report);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
