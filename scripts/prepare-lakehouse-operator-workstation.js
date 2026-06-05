#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const tools = [
  { command: "terraform", brew: "hashicorp/tap/terraform", purpose: "Terraform infrastructure plan/apply" },
  { command: "aws", brew: "awscli", purpose: "AWS identity and Secrets Manager sync" },
  { command: "kubectl", brew: "kubectl", purpose: "Kubernetes release apply and preflight" },
  { command: "docker", brew: "docker", purpose: "Docker image build/push client" }
];

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    out: "",
    localBin: process.env.TURBALANCE_LAKEHOUSE_TOOL_BIN || path.join("build", "lakehouse-tools", "bin"),
    terraformVersion: process.env.TURBALANCE_TERRAFORM_VERSION || "1.15.5",
    dockerContext: process.env.DOCKER_CONTEXT || process.env.TURBALANCE_DOCKER_CONTEXT || "",
    install: false,
    skipBrew: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--install") args.install = true;
    else if (arg === "--skip-brew") args.skipBrew = true;
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
  console.log(`Usage: scripts/prepare-lakehouse-operator-workstation.js [--env-file <file>] [--docker-context <name>] [--install] [--out <json>]

Plans or installs local operator tools needed for live lakehouse rollout. On macOS with Homebrew, --install installs missing CLI tools; Docker daemon, registry login, AWS credentials, and kubeconfig are still validated separately.`);
}

function envFor(extraBin = "", dockerContext = "") {
  return {
    ...process.env,
    ...(extraBin ? { PATH: `${extraBin}:${process.env.PATH || ""}` } : {}),
    ...(dockerContext ? { DOCKER_CONTEXT: dockerContext } : {})
  };
}

function commandAvailable(command, extraBin = "", dockerContext = "") {
  const env = envFor(extraBin, dockerContext);
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8", env }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args, extraBin = "", dockerContext = "") {
  const env = envFor(extraBin, dockerContext);
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

function dockerDaemon(extraBin = "", dockerContext = "") {
  if (!commandAvailable("docker", extraBin, dockerContext)) return { ok: false, detail: "docker CLI is not installed" };
  const info = run("docker", ["info"], extraBin, dockerContext);
  return { ok: info.ok, detail: info.stderr || info.stdout || "docker daemon is reachable" };
}

function dockerBuildx(extraBin = "", dockerContext = "") {
  if (!commandAvailable("docker", extraBin, dockerContext)) return { ok: false, detail: "docker CLI is not installed" };
  const buildx = run("docker", ["buildx", "version"], extraBin, dockerContext);
  return { ok: buildx.ok, detail: buildx.stderr || buildx.stdout || "docker buildx is available" };
}

function kubectlCluster(extraBin = "") {
  if (!commandAvailable("kubectl", extraBin)) return { ok: false, detail: "kubectl CLI is not installed" };
  const context = run("kubectl", ["config", "current-context"], extraBin);
  if (!context.ok) return { ok: false, detail: context.stderr || context.stdout || "kubectl context is not configured" };
  const cluster = run("kubectl", ["cluster-info"], extraBin);
  return { ok: cluster.ok, detail: cluster.stderr || cluster.stdout || context.stdout || "kubectl cluster is reachable" };
}

function awsIdentity(extraBin = "") {
  if (!commandAvailable("aws", extraBin)) return { ok: false, detail: "aws CLI is not installed" };
  const identity = run("aws", ["sts", "get-caller-identity"], extraBin);
  return { ok: identity.ok, detail: identity.stderr || identity.stdout || "AWS identity is configured" };
}

function brewInstall(tool) {
  if (!commandAvailable("brew")) {
    return { tool: tool.command, ok: false, skipped: true, command: `brew install ${tool.brew}`, stderr: "brew is not installed" };
  }
  if (commandAvailable(tool.command)) {
    return { tool: tool.command, ok: true, skipped: true, command: `brew install ${tool.brew}`, stdout: `${tool.command} already installed` };
  }
  const result = run("brew", ["install", tool.brew]);
  if (!result.ok && commandAvailable(tool.command)) {
    return { tool: tool.command, ...result, ok: true, recovered: true, stdout: `${result.stdout}\n${tool.command} is available after install attempt` };
  }
  return { tool: tool.command, ...result };
}

function platformPackage() {
  const platform = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : "";
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "amd64" : "";
  if (!platform || !arch) throw new Error(`unsupported platform for local Terraform fallback: ${process.platform}/${process.arch}`);
  return `${platform}_${arch}`;
}

function installLocalTerraform(args, localBin) {
  if (commandAvailable("terraform", localBin)) {
    return { tool: "terraform-local", ok: true, skipped: true, command: "local terraform fallback", stdout: "terraform already available in local bin" };
  }
  fs.mkdirSync(localBin, { recursive: true });
  const version = args.terraformVersion;
  const zipName = `terraform_${version}_${platformPackage()}.zip`;
  const url = `https://releases.hashicorp.com/terraform/${version}/${zipName}`;
  const zipPath = path.join(path.dirname(localBin), zipName);
  const curl = run("curl", ["-fsSL", "-o", zipPath, url]);
  if (!curl.ok) return { tool: "terraform-local", ...curl, command: `curl -fsSL -o ${zipPath} ${url}` };
  const unzip = run("unzip", ["-o", zipPath, "-d", localBin]);
  if (!unzip.ok) return { tool: "terraform-local", ...unzip };
  fs.chmodSync(path.join(localBin, "terraform"), 0o755);
  return {
    tool: "terraform-local",
    ok: commandAvailable("terraform", localBin),
    command: `curl -fsSL -o ${zipPath} ${url} && unzip -o ${zipPath} -d ${localBin}`,
    stdout: `terraform ${version} installed to ${localBin}`
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
  const plannedInstalls = tools
    .filter((tool) => !commandAvailable(tool.command, localBin))
    .map((tool) => ({ tool: tool.command, purpose: tool.purpose, command: `brew install ${tool.brew}` }));
  const installResults = args.install && !args.skipBrew ? tools.map(brewInstall) : [];
  if (args.install && !commandAvailable("terraform", localBin)) installResults.push(installLocalTerraform(args, localBin));
  const docker = dockerDaemon(localBin, args.dockerContext);
  const buildx = dockerBuildx(localBin, args.dockerContext);
  const kube = kubectlCluster(localBin);
  const aws = awsIdentity(localBin);
  const checks = [
    ...tools.map((tool) => check(`tool.${tool.command}`, commandAvailable(tool.command, localBin, args.dockerContext), `${tool.command}: ${tool.purpose}`, tool.command === "docker" ? "warning" : "error")),
    check("docker.daemon", docker.ok, docker.detail, "warning"),
    check("docker.buildx", buildx.ok, `${buildx.detail}${buildx.ok ? "" : " Install Docker Buildx with Docker Desktop or a CLI plugin before building multi-arch images."}`, "warning"),
    check("kubectl.cluster", kube.ok, kube.detail, "warning"),
    check("aws.identity", aws.ok, aws.detail, "warning")
  ];
  const terraformRecovered = commandAvailable("terraform", localBin, args.dockerContext);
  const manualActions = [
    ...(docker.ok ? [] : [`Start Docker Desktop, another Docker daemon, or set DOCKER_CONTEXT to a reachable daemon${args.dockerContext ? `; current context ${args.dockerContext} is not reachable` : ""}`]),
    "Run scripts/configure-lakehouse-registry-auth.js with the approved registry credentials before --push",
    ...(aws.ok ? [] : ["Configure AWS credentials before --sync-aws-secrets or --apply-infra"]),
    ...(kube.ok ? [] : ["Configure kubeconfig context for the target cluster before --deploy"])
  ];
  for (const result of installResults) {
    const recovered = result.tool === "terraform" && terraformRecovered;
    checks.push(check(`install.${result.tool}`, result.ok || recovered, result.stderr || result.stdout || result.command, recovered ? "warning" : "error"));
  }
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(args.out, {
    status: failed.length ? "action-required" : "ready",
	    envFile: args.envFile,
	    localBin,
	    dockerContext: args.dockerContext,
	    pathHint: `export PATH=${localBin}:$PATH${args.dockerContext ? ` && export DOCKER_CONTEXT=${args.dockerContext}` : ""}`,
	    installRequested: args.install,
	    plannedInstalls,
	    installResults,
	    manualActions,
	    checks
	  });
  if (args.install && failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
