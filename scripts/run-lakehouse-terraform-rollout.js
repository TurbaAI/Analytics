#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    envFile: process.env.TURBALANCE_LAKEHOUSE_ENV_FILE || "ops/lakehouse-production.env.example",
    dir: process.env.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
    varFile: process.env.TURBALANCE_TERRAFORM_VAR_FILE || "",
    outDir: process.env.TURBALANCE_TERRAFORM_ROLLOUT_OUT_DIR || path.join("build", "lakehouse-terraform-rollout"),
    out: "",
    plan: false,
    apply: false,
    destroyPlan: false,
    noInit: false,
    requireTerraform: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--plan") {
      args.plan = true;
    } else if (arg === "--apply") {
      args.apply = true;
      args.plan = true;
    } else if (arg === "--destroy-plan") {
      args.destroyPlan = true;
      args.plan = true;
    } else if (arg === "--no-init") {
      args.noInit = true;
    } else if (arg === "--require-terraform") {
      args.requireTerraform = true;
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
  console.log(`Usage: scripts/run-lakehouse-terraform-rollout.js [--env-file <file>] [--dir <terraform-dir>] [--var-file <tfvars>] [--out-dir <dir>]

Produces an auditable Terraform rollout report. Default mode is non-mutating and records the exact init/plan/show/apply/output commands. Use --plan to execute init/plan/show, and --apply to execute apply plus output capture.`);
}

function parseEnvFile(file) {
  const fullPath = path.resolve(root, file);
  const values = {};
  if (!fs.existsSync(fullPath)) return values;
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
    stderr: result.stderr
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

function terraformCommand(dir, args) {
  return ["terraform", `-chdir=${path.resolve(root, dir)}`, ...args];
}

function terraformRun(dir, args, env) {
  const [command, ...commandArgs] = terraformCommand(dir, args);
  return run(command, commandArgs, { env });
}

function planArgs(options, artifacts) {
  return [
    "plan",
    ...(options.destroyPlan ? ["-destroy"] : []),
    ...(options.varFile ? ["-var-file", path.resolve(root, options.varFile)] : []),
    "-out",
    artifacts.plan
  ];
}

function plannedCommands(dir, artifacts, options) {
  const commands = [];
  if (!options.noInit) commands.push(terraformCommand(dir, ["init"]).join(" "));
  commands.push(terraformCommand(dir, planArgs(options, artifacts)).join(" "));
  commands.push(`${terraformCommand(dir, ["show", "-json", artifacts.plan]).join(" ")} > ${artifacts.planJson}`);
  commands.push(terraformCommand(dir, ["apply", "-auto-approve", artifacts.plan]).join(" "));
  commands.push(`${terraformCommand(dir, ["output", "-json"]).join(" ")} > ${artifacts.outputs}`);
  return commands;
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function markdown(report) {
  const lines = [
    "# turbalance Lakehouse Terraform Rollout",
    "",
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Mode: ${report.status}`,
    `- Terraform directory: ${report.terraformDir}`,
    `- Env file: ${report.envFile}`,
    "",
    "## Artifacts",
    "",
    `- Report JSON: ${report.artifacts.report}`,
    `- Plan file: ${report.artifacts.plan}`,
    `- Plan JSON: ${report.artifacts.planJson}`,
    `- Output JSON: ${report.artifacts.outputs}`,
    "",
    "## Commands",
    ""
  ];
  for (const command of report.commands) lines.push(`- ${command}`);
  const failed = report.steps.filter((item) => item.ok === false);
  if (failed.length) {
    lines.push("", "## Failures", "");
    for (const item of failed) lines.push(`- ${item.name}: ${item.stderr || item.error || item.command}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv);
  const outDir = path.resolve(root, options.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = options.out ? path.resolve(root, options.out) : path.join(outDir, "terraform-rollout-report.json");
  const markdownPath = reportPath.replace(/\.json$/i, ".md");
  const artifacts = {
    report: reportPath,
    markdown: markdownPath,
    plan: path.join(outDir, "lakehouse.tfplan"),
    planJson: path.join(outDir, "terraform-plan.json"),
    outputs: path.join(outDir, "terraform-output.json")
  };
  const config = { ...process.env, ...parseEnvFile(options.envFile) };
  const env = { ...process.env, ...config };
  const steps = [];
  const staticValidation = runJson(process.execPath, [
    "scripts/validate-lakehouse-terraform.js",
    "--dir",
    options.dir,
    "--out",
    path.join(outDir, "terraform-static.json")
  ], { env });
  steps.push({
    name: "terraform-static",
    ok: staticValidation.ok && staticValidation.json?.status === "ok",
    command: staticValidation.command,
    report: staticValidation.json,
    stderr: staticValidation.stderr,
    parseError: staticValidation.parseError
  });

  const terraformAvailable = commandAvailable("terraform");
  if (!terraformAvailable && (options.requireTerraform || options.plan || options.apply)) {
    steps.push({ name: "terraform.available", ok: false, error: "terraform command is not installed" });
  }

  if (steps.every((item) => item.ok) && terraformAvailable && options.plan) {
    if (!options.noInit) steps.push({ name: "terraform.init", ...terraformRun(options.dir, ["init"], env) });
    steps.push({
      name: "terraform.plan",
      ...terraformRun(options.dir, planArgs(options, artifacts), env)
    });
    const show = terraformRun(options.dir, ["show", "-json", artifacts.plan], env);
    if (show.ok) fs.writeFileSync(artifacts.planJson, show.stdout, "utf8");
    steps.push({ name: "terraform.show-json", ...show, stdout: show.ok ? `${artifacts.planJson}\n` : show.stdout });
    if (show.ok && options.apply) {
      steps.push({ name: "terraform.apply", ...terraformRun(options.dir, ["apply", "-auto-approve", artifacts.plan], env) });
      const output = terraformRun(options.dir, ["output", "-json"], env);
      if (output.ok) fs.writeFileSync(artifacts.outputs, output.stdout, "utf8");
      steps.push({ name: "terraform.output-json", ...output, stdout: output.ok ? `${artifacts.outputs}\n` : output.stdout });
    }
  }

  const report = {
    ok: steps.every((item) => item.ok),
    status: options.apply ? "applied" : options.plan ? "planned" : "dry-run",
    envFile: options.envFile,
    terraformDir: options.dir,
    varFile: options.varFile,
    terraformAvailable,
    liveActions: {
      plan: options.plan,
      apply: options.apply,
      destroyPlan: options.destroyPlan
    },
    commands: plannedCommands(options.dir, artifacts, options),
    artifacts,
    steps
  };
  writeJson(reportPath, report);
  fs.writeFileSync(markdownPath, markdown(report), "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
