#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const defaultTargetHost = "user@192.168.10.20";

const excludes = [
  ".git",
  "build",
  "node_modules",
  "frontend/react/node_modules",
  ".DS_Store",
  "__pycache__",
  "*.pyc"
];

function parseArgs(argv) {
  const args = {
    targetHost: process.env.TURBALANCE_TARGET_HOST || defaultTargetHost,
    remoteRoot: process.env.TURBALANCE_REMOTE_ROOT || "/opt/turbalance/Analytics",
    out: "",
    dryRun: false,
    sync: false,
    validate: false,
    strict: true,
    nativeBuildMode: process.env.TURBALANCE_EBPF_NATIVE_BUILD_MODE || "prebuilt",
    installNativeDeps: false,
    delete: false,
    sudo: false,
    probeCommand: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--sync") args.sync = true;
    else if (arg === "--validate") args.validate = true;
    else if (arg === "--non-strict") args.strict = false;
    else if (arg === "--install-native-deps") args.installNativeDeps = true;
    else if (arg === "--delete") args.delete = true;
    else if (arg === "--sudo") args.sudo = true;
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
  if (!args.probeCommand) args.probeCommand = `${args.remoteRoot}/agents/ebpf-agent/probes/native-ebpf-readiness.sh`;
  return args;
}

function need(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: scripts/prepare-lakehouse-target-host.js [--target-host user@host] [--remote-root /opt/turbalance/Analytics] [--dry-run] [--sync] [--validate] [--non-strict] [--install-native-deps] [--delete]

Plans or performs the target-host preparation needed for eBPF validation: SSH probe, native dependency install, remote directory creation, optional rsync, and remote prerequisite checks.`);
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshCommand(options, command) {
  return `ssh -o BatchMode=yes -o ConnectTimeout=8 ${quote(options.targetHost)} ${quote(command)}`;
}

function rsyncCommand(options) {
  return [
    "rsync",
    "-az",
    ...(options.delete ? ["--delete"] : []),
    ...excludes.flatMap((item) => ["--exclude", item]),
    `${root}/`,
    `${options.targetHost}:${options.remoteRoot}/`
  ];
}

function remotePrepareCommand(options) {
  const parent = path.posix.dirname(options.remoteRoot);
  if (!options.sudo) return `mkdir -p ${quote(options.remoteRoot)}`;
  return `sudo mkdir -p ${quote(options.remoteRoot)} && sudo chown -R "$USER":"$USER" ${quote(parent)}`;
}

function remoteProbeCommand(options) {
  return [
    "set -e",
    `printf 'hostname=%s\\n' "$(hostname)"`,
    "uname -a",
    `test -d ${quote(options.remoteRoot)} && printf 'repo=present\\n' || printf 'repo=missing\\n'`,
    "command -v node >/dev/null && printf 'node=present\\n' || printf 'node=missing\\n'",
    "command -v docker >/dev/null && printf 'docker=present\\n' || printf 'docker=missing\\n'",
    "command -v bpftool >/dev/null && printf 'bpftool=present\\n' || printf 'bpftool=missing\\n'",
    "command -v clang >/dev/null && printf 'clang=present\\n' || printf 'clang=missing\\n'",
    ". /etc/os-release 2>/dev/null && printf 'os_id=%s\\n' \"$ID\" || printf 'os_id=unknown\\n'",
    "if command -v apt-get >/dev/null; then printf 'package_manager=apt\\n'; elif command -v dnf >/dev/null; then printf 'package_manager=dnf\\n'; elif command -v yum >/dev/null; then printf 'package_manager=yum\\n'; elif command -v zypper >/dev/null; then printf 'package_manager=zypper\\n'; elif command -v pacman >/dev/null; then printf 'package_manager=pacman\\n'; else printf 'package_manager=unknown\\n'; fi",
    "test -e /sys/fs/bpf && printf 'bpffs=present\\n' || printf 'bpffs=missing\\n'",
    "test -e /sys/kernel/tracing -o -e /sys/kernel/debug/tracing && printf 'tracingfs=present\\n' || printf 'tracingfs=missing\\n'",
    "test -e /sys/fs/cgroup/cgroup.controllers && printf 'cgroupv2=present\\n' || printf 'cgroupv2=missing\\n'"
  ].join("; ");
}

function remoteValidateCommand(options) {
  return `cd ${quote(options.remoteRoot)} && node scripts/validate-ebpf-agent-host.js${options.strict ? " --strict" : ""} --native-build-mode ${quote(options.nativeBuildMode)} --probe-command ${quote(options.probeCommand)}`;
}

function remoteNativeDepsCommand() {
  return [
    "set -e;",
    "if ! sudo -n true 2>/dev/null; then printf 'sudo=unavailable\\n' >&2; exit 3; fi;",
    "if command -v apt-get >/dev/null; then sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y clang llvm bpftool libbpf-dev make gcc pkg-config;",
    "elif command -v dnf >/dev/null; then sudo dnf install -y clang llvm bpftool libbpf-devel make gcc pkgconf-pkg-config;",
    "elif command -v yum >/dev/null; then sudo yum install -y clang llvm bpftool libbpf-devel make gcc pkgconfig;",
    "elif command -v zypper >/dev/null; then sudo zypper --non-interactive install clang llvm bpftool libbpf-devel make gcc pkg-config;",
    "elif command -v pacman >/dev/null; then sudo pacman -Sy --noconfirm clang llvm bpftool libbpf make gcc pkgconf;",
    "else printf 'package_manager=unsupported\\n' >&2; exit 2; fi"
  ].join(" ");
}

function plan(options) {
  return {
    sshProbe: sshCommand(options, remoteProbeCommand(options)),
    installNativeDeps: sshCommand(options, remoteNativeDepsCommand()),
    prepareDirectory: sshCommand(options, remotePrepareCommand(options)),
    syncRepository: rsyncCommand(options).join(" "),
    validateHost: sshCommand(options, remoteValidateCommand(options))
  };
}

function runShell(command) {
  const result = spawnSync("sh", ["-lc", command], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    command,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
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

function parseProbeOutput(stdout) {
  const values = {};
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const [key, ...rest] = line.split("=");
    if (!key || !rest.length) continue;
    values[key.trim()] = rest.join("=").trim();
  }
  return values;
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
  const commands = plan(options);
  if (options.dryRun || (!options.sync && !options.validate)) {
    write(options.out, {
      status: "dry-run",
      targetHost: options.targetHost,
      remoteRoot: options.remoteRoot,
      strict: options.strict,
      nativeBuildMode: options.nativeBuildMode,
      commands
    });
    return;
  }
  const results = [];
  const probe = runShell(commands.sshProbe);
  results.push({ step: "ssh-probe", ...probe, parsed: parseProbeOutput(probe.stdout) });
  if (options.installNativeDeps) {
    results.push({ step: "install-native-deps", ...runShell(commands.installNativeDeps) });
  }
  if (options.sync) {
    results.push({ step: "prepare-directory", ...runShell(commands.prepareDirectory) });
    results.push({ step: "sync-repository", ...runCommand("rsync", rsyncCommand(options).slice(1)) });
  }
  if (options.validate) {
    results.push({ step: "validate-host", ...runShell(commands.validateHost) });
  }
  const checks = [
    check("ssh.reachable", probe.ok, probe.stderr || "SSH target is reachable"),
    check("repo.present", results.find((item) => item.step === "ssh-probe")?.parsed?.repo === "present" || options.sync, "repo is present or sync was requested", "warning")
  ];
  for (const result of results) checks.push(check(`step.${result.step}`, result.ok, result.stderr || result.stdout || result.command));
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ready",
    targetHost: options.targetHost,
    remoteRoot: options.remoteRoot,
    strict: options.strict,
    nativeBuildMode: options.nativeBuildMode,
    commands,
    checks,
    results
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
