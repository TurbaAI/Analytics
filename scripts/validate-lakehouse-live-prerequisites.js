#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    out: "",
    requireDocker: false,
    requireKubectl: false,
    requireAws: false,
    requireTerraform: false,
    runLiveChecks: false,
    allowExample: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--require-docker") args.requireDocker = true;
    else if (arg === "--require-kubectl") args.requireKubectl = true;
    else if (arg === "--require-aws") args.requireAws = true;
    else if (arg === "--require-terraform") args.requireTerraform = true;
    else if (arg === "--run-live-checks") args.runLiveChecks = true;
    else if (arg === "--allow-example") args.allowExample = true;
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
  console.log(`Usage: scripts/validate-lakehouse-live-prerequisites.js [--env-file <file>] [--run-live-checks]

Validates operator workstation prerequisites for a real lakehouse rollout. Default mode is static and records the commands that will be run; --run-live-checks executes local Docker, kubectl, AWS, and Terraform checks when the tools are present or required.`);
}

function parseEnvFile(file) {
  const fullPath = path.resolve(root, file);
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

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${quote(command)}`], { encoding: "utf8" }).status === 0;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr)
  };
}

function redact(value) {
  return String(value || "")
    .replace(/([A-Za-z0-9+/=]{24,})/g, "[REDACTED]")
    .replace(/(token|secret|password|authorization)["'=:\s]+[^\s,"']+/gi, "$1=[REDACTED]");
}

function isPlaceholder(value) {
  return /replace-with|your-org|issuer\.example|provider\.example|registry\.example|s3:\/\/replace|example\.com|\.example(?:\/|:|$)|latest\b/i.test(String(value));
}

function toolChecks(options) {
  const required = {
    docker: options.requireDocker,
    kubectl: options.requireKubectl,
    aws: options.requireAws,
    terraform: options.requireTerraform
  };
  return Object.entries(required).map(([tool, isRequired]) => {
    const available = commandAvailable(tool);
    return check(`tool.${tool}`, available || !isRequired, available ? `${tool} is installed` : `${tool} is not installed`, isRequired ? "error" : "warning");
  });
}

function envChecks(config, options) {
  const requiredKeys = [
    "TURBALANCE_IMAGE_REGISTRY",
    "TURBALANCE_IMAGE_TAG",
    "TURBALANCE_NAMESPACE",
    "TURBALANCE_LAKE_ROOT",
    "TURBALANCE_API_JWT_ISSUER",
    "TURBALANCE_QUEUE_GATEWAY_BROKER_URL",
    "TURBALANCE_TERRAFORM_DIR"
  ];
  const checks = [];
  for (const key of requiredKeys) {
    checks.push(check(`env.${key}.set`, Boolean(config[key]), `${key} is set`));
    checks.push(check(`env.${key}.not_placeholder`, options.allowExample || !isPlaceholder(config[key]), `${key} is not placeholder/example`));
  }
  checks.push(check("env.image_tag.immutable", config.TURBALANCE_IMAGE_TAG !== "latest", "image tag is immutable"));
  checks.push(check("env.lake_root.s3", String(config.TURBALANCE_LAKE_ROOT || "").startsWith("s3://"), "lake root uses s3://"));
  return checks;
}

function liveCommands(config) {
  const namespace = config.TURBALANCE_NAMESPACE || "turbalance-lakehouse";
  const terraformDir = config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws";
  return [
    "docker info",
    "docker buildx version",
    "terraform version",
    `terraform -chdir=${terraformDir} providers`,
    "aws sts get-caller-identity",
    "kubectl version --client=true",
    "kubectl config current-context",
    `kubectl auth can-i get pods -n ${namespace}`,
    `kubectl get namespace ${namespace}`
  ];
}

function liveChecks(config, env, options) {
  if (!options.runLiveChecks) return { status: "planned", results: [] };
  const namespace = config.TURBALANCE_NAMESPACE || "turbalance-lakehouse";
  const terraformDir = config.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws";
  const commands = [
    { command: "docker", args: ["info"], required: options.requireDocker },
    { command: "docker", args: ["buildx", "version"], required: options.requireDocker },
    { command: "terraform", args: ["version"], required: options.requireTerraform },
    { command: "terraform", args: [`-chdir=${terraformDir}`, "providers"], required: options.requireTerraform },
    { command: "aws", args: ["sts", "get-caller-identity"], required: options.requireAws },
    { command: "kubectl", args: ["version", "--client=true"], required: options.requireKubectl },
    { command: "kubectl", args: ["config", "current-context"], required: options.requireKubectl },
    { command: "kubectl", args: ["auth", "can-i", "get", "pods", "-n", namespace], required: options.requireKubectl },
    { command: "kubectl", args: ["get", "namespace", namespace], required: options.requireKubectl }
  ];
  const results = commands.map((item) => {
    const commandText = [item.command, ...item.args].join(" ");
    if (!commandAvailable(item.command)) {
      return {
        command: commandText,
        ok: !item.required,
        skipped: !item.required,
        required: item.required,
        severity: item.required ? "error" : "warning",
        status: null,
        stdout: "",
        stderr: `${item.command} is not installed`
      };
    }
    const result = run(item.command, item.args, env);
    return { ...result, required: item.required, severity: item.required ? "error" : "warning" };
  });
  return {
    status: results.every((item) => item.ok || item.severity === "warning") ? "validated" : "failed",
    results
  };
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
  const config = { ...process.env, ...parseEnvFile(options.envFile) };
  const env = { ...process.env, ...config };
  const checks = [...toolChecks(options), ...envChecks(config, options)];
  const live = liveChecks(config, env, options);
  for (const result of live.results) {
    checks.push(check(`live.${result.command}`, result.ok, result.stderr || result.stdout || result.command, result.severity || "error"));
  }
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : live.status,
    envFile: options.envFile,
    checks,
    commands: liveCommands(config),
    liveResults: live.results
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
