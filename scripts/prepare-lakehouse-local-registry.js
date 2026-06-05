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
    sourceRegistry: process.env.TURBALANCE_IMAGE_REGISTRY || "",
    destinationRegistry: process.env.TURBALANCE_LOCAL_IMAGE_REGISTRY || "",
    tag: process.env.TURBALANCE_IMAGE_TAG || "",
    registryHost: process.env.TURBALANCE_LOCAL_REGISTRY_HOST || "localhost",
    registryPort: process.env.TURBALANCE_LOCAL_REGISTRY_PORT || "5000",
    registryPrefix: process.env.TURBALANCE_LOCAL_REGISTRY_PREFIX || "turbalance",
    registryImage: process.env.TURBALANCE_LOCAL_REGISTRY_IMAGE || "registry:2",
    containerName: process.env.TURBALANCE_LOCAL_REGISTRY_CONTAINER || "turbalance-local-registry",
    dockerContext: process.env.DOCKER_CONTEXT || "",
    targetHost: process.env.TURBALANCE_TARGET_HOST || "",
    out: "",
    dryRun: false,
    start: false,
    push: false,
    validate: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--start") args.start = true;
    else if (arg === "--push") args.push = true;
    else if (arg === "--validate") args.validate = true;
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
  console.log(`Usage: scripts/prepare-lakehouse-local-registry.js [--env-file <file>] [--docker-context <name>] [--start] [--push] [--validate] [--dry-run]

Starts or plans a single-node Docker registry, mirrors the lakehouse images from the configured production registry into it, and writes a redacted JSON report.

Common SPARK1 flow:
  DOCKER_CONTEXT=spark1 node scripts/prepare-lakehouse-local-registry.js --start --push --validate --out build/lakehouse-local-registry.json

Options:
  --source-registry <prefix>         Existing image prefix, default TURBALANCE_IMAGE_REGISTRY
  --destination-registry <prefix>    Registry prefix for k3s pulls, default localhost:5000/turbalance
  --tag <tag>                        Image tag, default TURBALANCE_IMAGE_TAG
  --registry-host <host>             Local registry host from the node point of view, default localhost
  --registry-port <port>             Host port mapped to the registry container, default 5000
  --registry-prefix <path>           Repository prefix inside the registry, default turbalance
  --registry-image <image>           Registry container image, default registry:2
  --container-name <name>            Registry container name, default turbalance-local-registry
  --target-host <user@host>          SSH target for Registry API validation; inferred from ssh Docker contexts when possible
  --out <json>                       Write report to a file`);
}

function parseEnvFile(file) {
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

function isPlaceholder(value) {
  return /replace-with|your-org|registry\.example|issuer\.example|example\.com|\.example(?:\/|:|$)/i.test(String(value));
}

function destinationRegistry(args) {
  if (args.destinationRegistry) return args.destinationRegistry.replace(/\/$/, "");
  return `${args.registryHost}:${args.registryPort}/${args.registryPrefix}`.replace(/\/$/, "");
}

function registryParts(destRegistry, name, tag) {
  const [host, ...prefixParts] = destRegistry.split("/");
  return {
    host,
    repository: [...prefixParts, name].join("/"),
    url: `http://${host}/v2/${[...prefixParts, name].join("/")}/manifests/${tag}`
  };
}

function imageRef(registry, name, tag) {
  return `${registry.replace(/\/$/, "")}/${name}:${tag}`;
}

function dockerBaseArgs(args) {
  return args.dockerContext ? ["--context", args.dockerContext] : [];
}

function dockerCommand(args, dockerArgs) {
  return ["docker", ...dockerBaseArgs(args), ...dockerArgs];
}

function commandText(args, dockerArgs) {
  return dockerCommand(args, dockerArgs).join(" ");
}

function runDocker(args, dockerArgs) {
  const command = dockerCommand(args, dockerArgs);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  return {
    command: command.join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: compact(result.stdout),
    stderr: compact(result.stderr)
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: compact(result.stdout),
    stderr: compact(result.stderr)
  };
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function compact(value) {
  const text = String(value || "");
  if (text.length <= 4000) return text;
  return `${text.slice(0, 1800)}\n...[truncated ${text.length - 3600} bytes]...\n${text.slice(-1800)}`;
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function registryPlan(args, dest) {
  const inspect = ["container", "inspect", args.containerName, "--format", "{{.State.Running}}"];
  return {
    inspect: commandText(args, inspect),
    create: commandText(args, [
      "run",
      "-d",
      "--restart",
      "unless-stopped",
      "-p",
      `${args.registryPort}:5000`,
      "--name",
      args.containerName,
      args.registryImage
    ]),
    start: commandText(args, ["start", args.containerName]),
    destinationRegistry: dest
  };
}

function contextTargetHost(args) {
  if (args.targetHost) return args.targetHost;
  if (!args.dockerContext) return "";
  const result = run("docker", ["context", "inspect", args.dockerContext, "--format", "{{json (index .Endpoints \"docker\").Host}}"]);
  if (!result.ok) return "";
  let host = "";
  try {
    host = JSON.parse(result.stdout.trim());
  } catch {
    host = result.stdout.trim();
  }
  if (!host.startsWith("ssh://")) return "";
  return host.slice("ssh://".length).split(/[?#]/)[0];
}

function registryApiCommand(targetHost, url) {
  const header = "Accept: application/vnd.docker.distribution.manifest.v2+json";
  if (targetHost) {
    return [
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      targetHost,
      `curl -fsSI -H ${quote(header)} ${quote(url)}`
    ];
  }
  return ["curl", "-fsSI", "-H", header, url];
}

function startRegistry(args) {
  const inspect = runDocker(args, ["container", "inspect", args.containerName, "--format", "{{.State.Running}}"]);
  if (inspect.ok && inspect.stdout.trim() === "true") {
    return { status: "running", results: [inspect] };
  }
  if (inspect.ok) {
    const start = runDocker(args, ["start", args.containerName]);
    return { status: start.ok ? "started" : "failed", results: [inspect, start] };
  }
  const create = runDocker(args, [
    "run",
    "-d",
    "--restart",
    "unless-stopped",
    "-p",
    `${args.registryPort}:5000`,
    "--name",
    args.containerName,
    args.registryImage
  ]);
  return { status: create.ok ? "created" : "failed", results: [inspect, create] };
}

function mirrorImages(args, sourceRegistry, destRegistry, tag) {
  return imageNames.map((name) => {
    const source = imageRef(sourceRegistry, name, tag);
    const destination = imageRef(destRegistry, name, tag);
    const inspect = runDocker(args, ["image", "inspect", source]);
    if (!inspect.ok) return { name, source, destination, ok: false, results: [inspect] };
    const tagResult = runDocker(args, ["tag", source, destination]);
    if (!tagResult.ok) return { name, source, destination, ok: false, results: [inspect, tagResult] };
    const push = runDocker(args, ["push", destination]);
    return { name, source, destination, ok: push.ok, results: [inspect, tagResult, push] };
  });
}

function validateImages(args, destRegistry, tag, targetHost) {
  return imageNames.map((name) => {
    const destination = imageRef(destRegistry, name, tag);
    const { url } = registryParts(destRegistry, name, tag);
    const command = registryApiCommand(targetHost, url);
    const result = run(command[0], command.slice(1));
    return { name, image: destination, ok: result.ok, result };
  });
}

function planImages(sourceRegistry, destRegistry, tag, args, targetHost) {
  return imageNames.map((name) => {
    const source = imageRef(sourceRegistry || "SOURCE_REGISTRY", name, tag || "TAG");
    const destination = imageRef(destRegistry || "DESTINATION_REGISTRY", name, tag || "TAG");
    const { url } = registryParts(destRegistry || "DESTINATION_REGISTRY", name, tag || "TAG");
    return {
      name,
      source,
      destination,
      commands: [
        commandText(args, ["image", "inspect", source]),
        commandText(args, ["tag", source, destination]),
        commandText(args, ["push", destination]),
        registryApiCommand(targetHost, url).join(" ")
      ]
    };
  });
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
  const sourceRegistry = (args.sourceRegistry || env.TURBALANCE_IMAGE_REGISTRY || "").replace(/\/$/, "");
  const tag = args.tag || env.TURBALANCE_IMAGE_TAG || "";
  const destRegistry = destinationRegistry(args);
  const targetHost = contextTargetHost(args);
  const dryRun = args.dryRun || (!args.start && !args.push && !args.validate);
  const checks = [
    check("source_registry.set", Boolean(sourceRegistry), "source image registry is set"),
    check("source_registry.not_placeholder", sourceRegistry && !isPlaceholder(sourceRegistry), "source image registry is not a placeholder"),
    check("destination_registry.set", Boolean(destRegistry), "destination image registry is set"),
    check("tag.set", Boolean(tag), "image tag is set"),
    check("tag.immutable", Boolean(tag && tag !== "latest"), "image tag is immutable")
  ];
  const releasePackage = [
    "node",
    "scripts/package-lakehouse-release.js",
    "--registry",
    destRegistry,
    "--tag",
    tag || "TAG"
  ].join(" ");

  if (dryRun) {
    write(args.out, {
      status: "dry-run",
      envFile: args.envFile,
      dockerContext: args.dockerContext,
      targetHost,
      sourceRegistry,
      destinationRegistry: destRegistry,
      tag,
      checks,
      registry: registryPlan(args, destRegistry),
      images: planImages(sourceRegistry, destRegistry, tag, args, targetHost),
      kubernetes: {
        imageRegistry: destRegistry,
        note: "Use this registry prefix only for a single-node cluster where kubelet resolves localhost to the target node."
      },
      releasePackage
    });
    return;
  }

  const failedStatic = checks.filter((item) => !item.passed);
  const registry = args.start ? startRegistry(args) : { status: "skipped", results: [] };
  const mirrored = args.push && !failedStatic.length ? mirrorImages(args, sourceRegistry, destRegistry, tag) : [];
  const validated = args.validate && !failedStatic.length ? validateImages(args, destRegistry, tag, targetHost) : [];
  const failedRuntime = [
    ...(registry.results || []).filter((item) => !item.ok),
    ...mirrored.filter((item) => !item.ok),
    ...validated.filter((item) => !item.ok)
  ];
  const status = failedStatic.length || failedRuntime.length ? "failed" : "ready";
  write(args.out, {
    status,
    envFile: args.envFile,
    dockerContext: args.dockerContext,
    targetHost,
    sourceRegistry,
    destinationRegistry: destRegistry,
    tag,
    checks,
    registry,
    images: mirrored,
    validation: validated,
    kubernetes: {
      imageRegistry: destRegistry,
      note: "Use this registry prefix only for a single-node cluster where kubelet resolves localhost to the target node."
    },
    releasePackage
  });
  if (status !== "ready") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
