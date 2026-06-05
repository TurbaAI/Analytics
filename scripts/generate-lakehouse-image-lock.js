#!/usr/bin/env node
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

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    registry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    tag: process.env.TURBALANCE_IMAGE_TAG || "",
    out: "",
    dryRun: false,
    local: false,
    allowMissingDigests: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--local") args.local = true;
    else if (arg === "--allow-missing-digests") args.allowMissingDigests = true;
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
  console.log(`Usage: scripts/generate-lakehouse-image-lock.js [--env-file <file>] [--registry <prefix>] [--tag <tag>] [--out <json>] [--dry-run]

Creates an immutable image lock report for all lakehouse services. Dry-run mode emits the exact docker inspection plan.`);
}

function parseEnvFile(file) {
  if (!file) return {};
  const fullPath = path.resolve(root, file);
  if (!fs.existsSync(fullPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function isPlaceholder(value) {
  return /replace-with|your-org|registry\.example|example\.com|\.example(?:\/|:|$)|latest\b/i.test(String(value));
}

function imageRef(registry, name, tag) {
  return `${registry}/${name}:${tag}`;
}

function dryRunImages(registry, tag, local) {
  return imageNames.map((name) => {
    const ref = imageRef(registry || "REGISTRY", name, tag || "TAG");
    return {
      name,
      image: ref,
      command: local ? `docker image inspect ${ref}` : `docker manifest inspect --verbose ${ref}`,
      digest: "",
      resolvedImage: "",
      platformDigests: []
    };
  });
}

function inspectImage(name, ref, local) {
  const args = local ? ["image", "inspect", ref] : ["manifest", "inspect", "--verbose", ref];
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const command = ["docker", ...args].join(" ");
  if (result.status !== 0) {
    return {
      name,
      image: ref,
      command,
      ok: false,
      status: result.status,
      digest: "",
      resolvedImage: "",
      platformDigests: [],
      stderr: result.stderr.slice(0, 2000)
    };
  }
  const parsed = parseInspect(result.stdout, local);
  return {
    name,
    image: ref,
    command,
    ok: true,
    status: result.status,
    digest: parsed.digest,
    resolvedImage: parsed.digest ? `${repositoryFromRef(ref)}@${parsed.digest}` : "",
    platformDigests: parsed.platformDigests,
    manifestMediaType: parsed.mediaType
  };
}

function repositoryFromRef(ref) {
  const slash = ref.lastIndexOf("/");
  const colon = ref.lastIndexOf(":");
  if (colon > slash) return ref.slice(0, colon);
  return ref;
}

function parseInspect(stdout, local) {
  let doc = null;
  try {
    doc = JSON.parse(stdout || "{}");
  } catch {
    return { digest: "", platformDigests: [], mediaType: "" };
  }
  if (local) {
    const entry = Array.isArray(doc) ? doc[0] : doc;
    const repoDigest = (entry?.RepoDigests || []).find((value) => /@sha256:/i.test(value)) || "";
    return {
      digest: repoDigest.includes("@") ? repoDigest.split("@").pop() : "",
      platformDigests: [],
      mediaType: entry?.Os && entry?.Architecture ? `${entry.Os}/${entry.Architecture}` : ""
    };
  }
  const descriptorDigest = doc?.Descriptor?.digest || doc?.Descriptor?.Digest || doc?.digest || doc?.Digest || "";
  const platformDigests = Array.isArray(doc?.manifests)
    ? doc.manifests
        .filter((manifest) => manifest.digest || manifest.Digest)
        .map((manifest) => ({
          digest: manifest.digest || manifest.Digest,
          platform: platformName(manifest.platform || manifest.Platform || {})
        }))
    : [];
  return {
    digest: descriptorDigest,
    platformDigests,
    mediaType: doc?.mediaType || doc?.MediaType || doc?.Descriptor?.mediaType || ""
  };
}

function platformName(platform) {
  const parts = [platform.os || platform.OS, platform.architecture || platform.Architecture, platform.variant || platform.Variant].filter(Boolean);
  return parts.join("/") || "unknown";
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
  const env = { ...process.env, ...parseEnvFile(args.envFile) };
  const registry = args.registry || env.TURBALANCE_IMAGE_REGISTRY || "";
  const tag = args.tag || env.TURBALANCE_IMAGE_TAG || "";
  const checks = [
    check("registry.set", Boolean(registry), "image registry is set"),
    check("registry.not_placeholder", registry && !isPlaceholder(registry), "image registry is production-like"),
    check("tag.set", Boolean(tag), "image tag is set"),
    check("tag.immutable", tag && !isPlaceholder(tag), "image tag is immutable")
  ];
  if (args.dryRun) {
    write(args.out, {
      status: "dry-run",
      registry,
      tag,
      mode: args.local ? "local" : "remote",
      checks,
      images: dryRunImages(registry, tag, args.local)
    });
    return;
  }
  if (!commandAvailable("docker")) throw new Error("docker is required outside --dry-run");
  const images = imageNames.map((name) => inspectImage(name, imageRef(registry, name, tag), args.local));
  for (const image of images) {
    checks.push(check(`image.${image.name}.inspect`, image.ok, image.stderr || "image inspect succeeded"));
    checks.push(check(`image.${image.name}.digest`, args.allowMissingDigests || Boolean(image.digest || image.platformDigests.length), "image has a digest lock"));
  }
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(args.out, {
    status: failed.length ? "failed" : "locked",
    registry,
    tag,
    mode: args.local ? "local" : "remote",
    checks,
    images
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
