#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const requiredSecretNames = [
  "lakehouse/metadata-db",
  "lakehouse/object-store",
  "lakehouse/collector-auth",
  "lakehouse/discovery-auth",
  "lakehouse/api-auth",
  "lakehouse/queue-gateway",
  "lakehouse/otel-backend",
  "lakehouse/alert-routing",
  "lakehouse/mtls-agent-ca",
  "lakehouse/consul"
];

function parseArgs(argv) {
  const args = {
    dir: process.env.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
    out: "",
    runTerraform: false,
    requireTerraform: false,
    noInit: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--run-terraform") {
      args.runTerraform = true;
    } else if (arg === "--require-terraform") {
      args.requireTerraform = true;
    } else if (arg === "--no-init") {
      args.noInit = true;
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
  console.log(`Usage: scripts/validate-lakehouse-terraform.js [--dir <terraform-dir>] [--run-terraform] [--out <file>]

Runs static production checks against the AWS lakehouse Terraform module. With --run-terraform it also runs terraform fmt/init/validate when Terraform is installed.`);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
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

function terraformRun(dir, args) {
  const result = spawnSync("terraform", [`-chdir=${dir}`, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    command: ["terraform", `-chdir=${dir}`, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function staticChecks(dir) {
  const fullDir = path.resolve(root, dir);
  const files = {
    versions: path.join(fullDir, "versions.tf"),
    variables: path.join(fullDir, "variables.tf"),
    main: path.join(fullDir, "main.tf"),
    outputs: path.join(fullDir, "outputs.tf"),
    readme: path.join(fullDir, "README.md")
  };
  const checks = Object.entries(files).map(([name, file]) => check(`file.${name}`, fs.existsSync(file), `${file} exists`));
  if (checks.some((item) => !item.passed)) return checks;

  const versions = read(files.versions);
  const variables = read(files.variables);
  const main = read(files.main);
  const outputs = read(files.outputs);
  const readme = read(files.readme);
  checks.push(check("provider.aws", versions.includes("hashicorp/aws"), "AWS provider is pinned"));
  checks.push(check("provider.random", versions.includes("hashicorp/random"), "random provider is pinned for generated secrets"));
  checks.push(check("variable.vpc", variables.includes('variable "vpc_id"'), "VPC input is required"));
  checks.push(check("variable.private_subnets", variables.includes('variable "private_subnet_ids"'), "private subnet input is required"));
  checks.push(check("s3.bucket", main.includes('resource "aws_s3_bucket" "lake"'), "S3 lake bucket is provisioned"));
  checks.push(check("s3.public_access_block", main.includes('resource "aws_s3_bucket_public_access_block" "lake"'), "S3 public access is blocked"));
  checks.push(check("s3.versioning", main.includes('resource "aws_s3_bucket_versioning" "lake"') && main.includes('status = "Enabled"'), "S3 versioning is enabled"));
  checks.push(
    check(
      "s3.encryption",
      main.includes('resource "aws_s3_bucket_server_side_encryption_configuration" "lake"') && main.includes('sse_algorithm = "AES256"'),
      "S3 server-side encryption is configured"
    )
  );
  checks.push(check("rds.postgres", main.includes('resource "aws_db_instance" "metadata"') && main.includes('engine                      = "postgres"'), "RDS Postgres metadata database is provisioned"));
  checks.push(check("rds.encrypted", main.includes("storage_encrypted           = true"), "RDS storage is encrypted"));
  checks.push(check("rds.deletion_protection", main.includes("deletion_protection         = true"), "RDS deletion protection is enabled"));
  checks.push(check("rds.backups", /backup_retention_period\s+=\s+[1-9]/.test(main), "RDS backups are retained"));
  checks.push(check("msk.optional", main.includes('resource "aws_msk_cluster" "queue"') && main.includes("var.enable_msk"), "MSK queue broker is optional but supported"));
  checks.push(check("iam.object_lake_policy", main.includes('resource "aws_iam_policy" "object_lake_rw"') && main.includes("s3:PutObject"), "object lake read/write IAM policy is defined"));
  checks.push(check("secrets.manager", count(main, 'resource "aws_secretsmanager_secret"') >= requiredSecretNames.length, "Secrets Manager resources are defined for ExternalSecrets"));
  for (const name of requiredSecretNames) {
    checks.push(check(`secret.${name}`, main.includes(`name = "${name}"`) && outputs.includes(name.split("/").pop().replace(/-/g, "_").slice(0, 18)) || main.includes(`name = "${name}"`), `${name} secret exists`));
  }
  checks.push(check("secret.metadata_property", main.includes('"database-url"'), "metadata DB secret contains database-url"));
  checks.push(check("secret.object_store_properties", ["access-key-id", "secret-access-key", "region", "endpoint-url", "scheme"].every((item) => main.includes(`"${item}"`)), "object-store secret contains all expected properties"));
  checks.push(check("secret.collector_properties", ["bearer-token", "hmac-secret"].every((item) => main.includes(`"${item}"`)), "collector auth secret contains bearer-token and hmac-secret"));
  checks.push(check("secret.alert_properties", ["webhook-url", "slack-webhook-url", "pagerduty-routing-key"].every((item) => main.includes(`"${item}"`)), "alert routing secret contains webhook, Slack, and PagerDuty fields"));
  checks.push(check("secret.consul_properties", main.includes('"token"') && main.includes('name = "lakehouse/consul"'), "Consul secret contains token"));
  checks.push(check("outputs.lake_root", outputs.includes('output "lake_root"'), "lake root output is present"));
  checks.push(check("outputs.secret_names", count(outputs, "secret_name") >= 10, "secret-name outputs are present"));
  checks.push(check("readme.external_secrets", readme.includes("ExternalSecret") && readme.includes("Secrets Manager"), "Terraform README documents ExternalSecret bindings"));
  return checks;
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function terraformChecks(dir, options) {
  const available = commandAvailable("terraform");
  const checks = [check("terraform.available", available || !options.requireTerraform, available ? "terraform is installed" : "terraform is not installed", options.requireTerraform ? "error" : "warning")];
  const results = [];
  if (!available || !options.runTerraform) return { checks, results, available };
  results.push(terraformRun(dir, ["fmt", "-check", "-recursive"]));
  if (!options.noInit) results.push(terraformRun(dir, ["init", "-backend=false"]));
  results.push(terraformRun(dir, ["validate"]));
  for (const result of results) {
    checks.push(check(`terraform.${result.command.split(" ").slice(2).join("_")}`, result.ok, result.command));
  }
  return { checks, results, available };
}

function write(out, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, body);
  }
  process.stdout.write(body);
}

function main() {
  const options = parseArgs(process.argv);
  const checks = staticChecks(options.dir);
  const terraform = terraformChecks(options.dir, options);
  const allChecks = [...checks, ...terraform.checks];
  const failed = allChecks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ok",
    terraformDir: options.dir,
    terraformAvailable: terraform.available,
    checks: allChecks,
    terraformResults: terraform.results
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
