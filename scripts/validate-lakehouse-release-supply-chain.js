#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const imageNames = [
  "collector-gateway",
  "duckdb-query-service",
  "api-server",
  "discovery-api",
  "queue-gateway",
  "raw-writer",
  "transform-runner",
  "ebpf-agent",
  "dagster",
  "sqlmesh"
];

const dockerfiles = [
  "deploy/docker/Dockerfile.platform-service",
  "deploy/docker/Dockerfile.platform-worker",
  "deploy/docker/Dockerfile.ebpf-agent",
  "deploy/docker/Dockerfile.dagster",
  "deploy/docker/Dockerfile.sqlmesh"
];

function parseArgs(argv) {
  const args = {
    releaseDir: process.env.TURBALANCE_RELEASE_DIR || "build/lakehouse-release",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    tag: process.env.TURBALANCE_IMAGE_TAG || "",
    out: "",
    runSyft: false,
    requireCosign: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--run-syft") args.runSyft = true;
    else if (arg === "--require-cosign") args.requireCosign = true;
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
  console.log(`Usage: scripts/validate-lakehouse-release-supply-chain.js [--release-dir <dir>] [--registry <prefix>] [--tag <tag>] [--out <file>]

Validates release image hardening and emits SBOM/signing command plans. Use --run-syft to run syft when installed and --require-cosign to fail when cosign is unavailable.`);
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

function isPlaceholder(value) {
  return /replace-with|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)|latest\b/i.test(String(value));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function loadManifest(releaseDir) {
  const manifestPath = path.join(releaseDir, "release-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function dockerfileChecks() {
  const checks = [];
  for (const file of dockerfiles) {
    const fullPath = path.join(root, file);
    checks.push(check(`dockerfile.${file}.exists`, fs.existsSync(fullPath), `${file} exists`));
    if (!fs.existsSync(fullPath)) continue;
    const body = fs.readFileSync(fullPath, "utf8");
    const froms = body.split(/\r?\n/).filter((line) => /^FROM\s+/i.test(line));
    checks.push(check(`dockerfile.${file}.pinned`, froms.every((line) => !/:latest(\s|$)/i.test(line)), `${file} does not use latest base images`));
    if (file !== "deploy/docker/Dockerfile.ebpf-agent") {
      checks.push(check(`dockerfile.${file}.nonroot`, body.includes("USER 65532"), `${file} declares non-root runtime user`));
    } else {
      checks.push(check(`dockerfile.${file}.root_explained`, body.includes("USER 0"), "eBPF agent remains root because it loads host probes"));
      checks.push(check(`dockerfile.${file}.probe_assets`, body.includes("/opt/turbalance/probes") && body.includes("/opt/turbalance/native"), "eBPF image carries probe assets"));
    }
  }
  return checks;
}

function releaseChecks(releaseDir, registry, tag) {
  const manifest = loadManifest(releaseDir);
  const checks = [
    check("release.manifest", Boolean(manifest), `${path.join(releaseDir, "release-manifest.json")} exists`),
    check("release.checksums", fs.existsSync(path.join(releaseDir, "checksums.json")), "release checksums exist"),
    check("release.secret_requirements", fs.existsSync(path.join(releaseDir, "secret-requirements.json")), "secret requirements exist")
  ];
  const imageRegistry = registry || manifest?.images?.registry || "";
  const imageTag = tag || manifest?.images?.tag || "";
  checks.push(check("images.registry", imageRegistry && !isPlaceholder(imageRegistry), "image registry is production-like"));
  checks.push(check("images.tag", imageTag && !isPlaceholder(imageTag), "image tag is immutable and non-placeholder"));
  return { checks, imageRegistry, imageTag, manifest };
}

function sbom(releaseDir, imageRegistry, imageTag) {
  const files = [
    ...listFiles(releaseDir),
    ...dockerfiles.map((file) => path.join(root, file)).filter((file) => fs.existsSync(file)),
    path.join(root, "requirements-platform.txt"),
    path.join(root, "agents/ebpf-agent/Cargo.lock")
  ].filter((file) => fs.existsSync(file));
  return {
    bomFormat: "CycloneDX-lite",
    specVersion: "1.6",
    generatedAt: new Date().toISOString(),
    images: imageNames.map((name) => `${imageRegistry}/${name}:${imageTag}`),
    components: files.map((file) => ({
      type: "file",
      name: path.relative(root, file).split(path.sep).join("/"),
      hashes: [{ alg: "SHA-256", content: sha256(file) }]
    }))
  };
}

function syftResults(images, runSyft) {
  if (!runSyft) return [];
  if (!commandAvailable("syft")) {
    return images.map((image) => ({ image, ok: false, command: `syft ${image}`, stderr: "syft is not installed" }));
  }
  return images.map((image) => {
    const result = spawnSync("syft", [image, "-o", "cyclonedx-json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    });
    return { image, ok: result.status === 0, command: `syft ${image} -o cyclonedx-json`, status: result.status, stdout: result.stdout, stderr: result.stderr };
  });
}

function plannedCommands(images) {
  return images.flatMap((image) => [
    `docker manifest inspect ${image}`,
    `syft ${image} -o cyclonedx-json > build/sbom/${image.replace(/[^A-Za-z0-9_.-]/g, "_")}.cdx.json`,
    `cosign sign ${image}`,
    `cosign verify ${image}`
  ]);
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
  const releaseDir = path.resolve(root, options.releaseDir);
  const release = releaseChecks(releaseDir, options.registry, options.tag);
  const images = imageNames.map((name) => `${release.imageRegistry}/${name}:${release.imageTag}`);
  const checks = [
    ...release.checks,
    ...dockerfileChecks(),
    check("tool.syft", commandAvailable("syft") || !options.runSyft, commandAvailable("syft") ? "syft is installed" : "syft is not installed", options.runSyft ? "error" : "warning"),
    check("tool.cosign", commandAvailable("cosign") || !options.requireCosign, commandAvailable("cosign") ? "cosign is installed" : "cosign is not installed", options.requireCosign ? "error" : "warning")
  ];
  const sbomDocument = sbom(releaseDir, release.imageRegistry, release.imageTag);
  const syft = syftResults(images, options.runSyft);
  for (const result of syft) checks.push(check(`syft.${result.image}`, result.ok, result.stderr || result.command));
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ok",
    releaseDir,
    images,
    checks,
    sbom: sbomDocument,
    commands: plannedCommands(images),
    syftResults: syft
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
