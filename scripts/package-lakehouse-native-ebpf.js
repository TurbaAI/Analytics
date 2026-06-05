#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const packageInputs = [
  { source: "agents/ebpf-agent/native", target: "native" },
  { source: "agents/ebpf-agent/probes", target: "probes" },
  { source: "agents/ebpf-agent/README.md", target: "agent-README.md" },
  { source: "agents/ebpf-agent/Cargo.toml", target: "agent-Cargo.toml" },
  { source: "agents/ebpf-agent/src/probes.rs", target: "agent-src/probes.rs" },
  { source: "deploy/docker/Dockerfile.ebpf-agent", target: "deploy/Dockerfile.ebpf-agent" },
  { source: "ops/kubernetes/lakehouse-agent-daemonset.yaml", target: "deploy/lakehouse-agent-daemonset.yaml" },
  { source: "ops/lakehouse-ebpf-hosts.example.json", target: "ops/lakehouse-ebpf-hosts.example.json" }
];

function parseArgs(argv) {
  const args = {
    outDir: path.join("build", "lakehouse-native-ebpf"),
    archive: false,
    build: false,
    skipValidation: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--archive") args.archive = true;
    else if (arg === "--build") args.build = true;
    else if (arg === "--skip-validation") args.skipValidation = true;
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
  console.log(`Usage: scripts/package-lakehouse-native-ebpf.js [--out-dir <dir>] [--archive] [--build]

Creates a checksummed native eBPF release bundle with probe scripts, C sources, deployment context, and validation evidence.`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error ? result.error.message : ""
  };
}

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (!result.ok) throw new Error(`${result.command} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function validatePackage(skipValidation) {
  if (skipValidation) return { status: "skipped", reason: "--skip-validation was passed" };
  const result = runRequired(process.execPath, ["scripts/validate-lakehouse-ebpf-probe-package.js", "--skip-probe-run"]);
  return JSON.parse(result.stdout);
}

function copyInput(input, outDir) {
  const source = path.resolve(root, input.source);
  const target = path.join(outDir, input.target);
  if (!fs.existsSync(source)) throw new Error(`${input.source} is required for native eBPF packaging`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  return {
    source: input.source,
    target: path.relative(outDir, target).split(path.sep).join("/"),
    type: fs.statSync(source).isDirectory() ? "directory" : "file"
  };
}

function buildNative(outDir) {
  const missing = ["make", "clang", "bpftool"].filter((command) => !commandAvailable(command));
  if (os.platform() !== "linux") {
    throw new Error("--build requires a Linux host with kernel BTF access");
  }
  if (missing.length) {
    throw new Error(`--build requires missing tools: ${missing.join(", ")}`);
  }
  const buildDir = path.join(outDir, "build");
  return runRequired("make", ["-C", "agents/ebpf-agent/native", `BUILD_DIR=${buildDir}`]);
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function archive(outDir) {
  const archivePath = `${outDir}.tar.gz`;
  runRequired("tar", ["-czf", archivePath, "-C", path.dirname(outDir), path.basename(outDir)]);
  return archivePath;
}

function main() {
  const options = parseArgs(process.argv);
  const outDir = path.resolve(root, options.outDir);
  const validation = validatePackage(options.skipValidation);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const inputs = packageInputs.map((input) => copyInput(input, outDir));
  const build = options.build ? buildNative(outDir) : { status: "skipped", reason: "--build was not passed" };
  const manifest = {
    status: "ready",
    generatedAt: new Date().toISOString(),
    package: "turbalance-native-ebpf",
    outDir,
    validation,
    inputs,
    build: {
      requested: options.build,
      command: build.command || "",
      status: build.ok ? "ok" : build.status || "skipped",
      stdout: build.stdout || "",
      stderr: build.stderr || "",
      reason: build.reason || ""
    },
    install: {
      probeCommand: "/opt/turbalance/native/turbalance-native-loader --once",
      daemonSet: "kubectl apply -f deploy/lakehouse-agent-daemonset.yaml",
      hostValidation: "node scripts/validate-ebpf-agent-host.js --strict --native-build-mode prebuilt --probe-command '/opt/turbalance/native/turbalance-native-loader --once'"
    }
  };
  const manifestPath = path.join(outDir, "native-ebpf-package-manifest.json");
  writeJson(manifestPath, manifest);
  const files = listFiles(outDir).map((file) => ({
    path: path.relative(outDir, file).split(path.sep).join("/"),
    sha256: sha256(file)
  }));
  const checksumsPath = path.join(outDir, "checksums.json");
  writeJson(checksumsPath, { files });
  const archivePath = options.archive ? archive(outDir) : "";
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ready",
        outDir,
        archivePath,
        manifest: manifestPath,
        checksums: checksumsPath,
        validationStatus: validation.status || "skipped",
        built: Boolean(options.build)
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
