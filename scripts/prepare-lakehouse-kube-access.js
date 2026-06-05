#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    targetHost: process.env.TURBALANCE_TARGET_HOST || "user@192.168.10.20",
    remoteRoot: process.env.TURBALANCE_REMOTE_ROOT || "/home/user/Analytics",
    namespace: process.env.TURBALANCE_NAMESPACE || "turbalance-lakehouse",
    localBin: process.env.TURBALANCE_LAKEHOUSE_TOOL_BIN || path.join("build", "lakehouse-tools", "bin"),
    out: "",
    install: false,
    createNamespace: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--install") args.install = true;
    else if (arg === "--create-namespace") args.createNamespace = true;
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

function printHelp() {
  console.log(`Usage: scripts/prepare-lakehouse-kube-access.js [--target-host user@host] [--remote-root <path>] [--namespace <ns>] [--install] [--create-namespace] [--out <json>]

Creates an ignored kubectl wrapper that executes against the target host's Kubernetes context through SSH, then validates namespace access.`);
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function writeWrapper(args) {
  const localBin = path.resolve(root, args.localBin);
  fs.mkdirSync(localBin, { recursive: true });
  const wrapper = path.join(localBin, "kubectl");
  const body = [
    "#!/bin/sh",
    "set -eu",
    "quote_arg() { printf \"%s\\n\" \"$1\" | sed \"s/'/'\\\\\\\\''/g; 1s/^/'/; \\$s/\\$/'/\"; }",
    "remote_args=\"\"",
    "for arg in \"$@\"; do remote_args=\"$remote_args $(quote_arg \"$arg\")\"; done",
    `exec ssh -o BatchMode=yes -o ConnectTimeout=8 ${quote(args.targetHost)} "cd ${quote(args.remoteRoot)} && exec kubectl$remote_args"`,
    ""
  ].join("\n");
  fs.writeFileSync(wrapper, body, { mode: 0o755 });
  fs.chmodSync(wrapper, 0o755);
  return wrapper;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
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
  const localBin = path.resolve(root, args.localBin);
  const wrapper = args.install ? writeWrapper(args) : path.join(localBin, "kubectl");
  const env = { ...process.env, PATH: `${localBin}:${process.env.PATH || ""}` };
  const results = [];
  results.push(run("kubectl", ["config", "current-context"], env));
  results.push(run("kubectl", ["cluster-info"], env));
  results.push(run("kubectl", ["get", "nodes", "-o", "wide"], env));
  let namespaceResult = run("kubectl", ["get", "namespace", args.namespace], env);
  if (!namespaceResult.ok && args.createNamespace) {
    results.push(run("kubectl", ["create", "namespace", args.namespace], env));
    namespaceResult = run("kubectl", ["get", "namespace", args.namespace], env);
  }
  results.push(namespaceResult);
  results.push(run("kubectl", ["auth", "can-i", "get", "pods", "-n", args.namespace], env));
  const checks = [
    check("wrapper.present", fs.existsSync(wrapper), wrapper, args.install ? "error" : "warning"),
    check("context.current", results[0].ok, results[0].stderr || results[0].stdout),
    check("cluster.reachable", results[1].ok, results[1].stderr || results[1].stdout),
    check("nodes.ready", results[2].ok && / Ready /.test(results[2].stdout), results[2].stderr || results[2].stdout),
    check("namespace.present", namespaceResult.ok, namespaceResult.stderr || namespaceResult.stdout),
    check("rbac.pods.get", results.at(-1).ok && results.at(-1).stdout.trim() === "yes", results.at(-1).stderr || results.at(-1).stdout)
  ];
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  const report = {
    status: failed.length ? "action-required" : "ready",
    targetHost: args.targetHost,
    remoteRoot: args.remoteRoot,
    namespace: args.namespace,
    localBin,
    wrapper,
    pathHint: `export PATH=${localBin}:$PATH`,
    installRequested: args.install,
    namespaceCreateRequested: args.createNamespace,
    checks,
    results
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
