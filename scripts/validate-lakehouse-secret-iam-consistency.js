#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const baseRequiredSecretBindings = [
  { secret: "turbalance-api-auth", remoteKey: "lakehouse/api-auth", properties: ["api-tokens", "jwks"] },
  { secret: "turbalance-collector-auth", remoteKey: "lakehouse/collector-auth", properties: ["bearer-token", "hmac-secret"] },
  { secret: "turbalance-discovery-auth", remoteKey: "lakehouse/discovery-auth", properties: ["enrollment-token"] },
  { secret: "turbalance-agent-client-ca", remoteKey: "lakehouse/mtls-agent-ca", properties: ["ca.crt"] },
  { secret: "turbalance-metadata-db", remoteKey: "lakehouse/metadata-db", properties: ["database-url"] },
  {
    secret: "turbalance-object-store",
    remoteKey: "lakehouse/object-store",
    properties: ["access-key-id", "secret-access-key", "region", "endpoint-url", "scheme"]
  },
  { secret: "turbalance-collector-queue-auth", remoteKey: "lakehouse/queue-gateway", properties: ["bearer-token"] },
  { secret: "turbalance-otel-backend", remoteKey: "lakehouse/otel-backend", properties: ["otlp-endpoint", "authorization"] },
  {
    secret: "turbalance-alert-routing",
    remoteKey: "lakehouse/alert-routing",
    properties: ["webhook-url", "slack-webhook-url", "pagerduty-routing-key"]
  }
];

const consulBinding = { secret: "turbalance-consul-auth", remoteKey: "lakehouse/consul", properties: ["token"] };

const defaultExternalSecretFiles = [
  "ops/kubernetes/lakehouse-platform-auth-secrets.yaml",
  "ops/kubernetes/lakehouse-managed-storage.yaml",
  "ops/kubernetes/lakehouse-otel-backend-secret.yaml",
  "ops/kubernetes/lakehouse-alert-routing.yaml"
];

function parseArgs(argv) {
  const args = {
    terraformDir: process.env.TURBALANCE_TERRAFORM_DIR || "ops/terraform/lakehouse/aws",
    externalSecretFiles: "",
    secretRequirements: "",
    out: "",
    includeConsul: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--include-consul") {
      args.includeConsul = true;
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
  console.log(`Usage: scripts/validate-lakehouse-secret-iam-consistency.js [--terraform-dir <dir>] [--secret-requirements <json>] [--out <file>]

Cross-checks the release secret contract against Kubernetes ExternalSecret remoteRefs, Terraform Secrets Manager resources, and S3 lake IAM policy shape.`);
}

function check(name, passed, detail, severity = "error") {
  return { name, passed: Boolean(passed), detail, severity };
}

function read(relativeOrAbsolute) {
  return fs.readFileSync(path.resolve(root, relativeOrAbsolute), "utf8");
}

function loadRequiredBindings(options) {
  let bindings = baseRequiredSecretBindings;
  if (options.secretRequirements) {
    const fullPath = path.resolve(root, options.secretRequirements);
    const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (!Array.isArray(payload.requiredSecretBindings)) throw new Error(`${options.secretRequirements} must contain requiredSecretBindings`);
    bindings = payload.requiredSecretBindings.map((item) => ({
      secret: item.secret,
      remoteKey: item.remoteKey,
      properties: item.properties || []
    }));
  }
  if (options.includeConsul && !bindings.some((item) => item.remoteKey === consulBinding.remoteKey)) {
    bindings = [...bindings, consulBinding];
  }
  return bindings;
}

function externalSecretFiles(options) {
  const files = options.externalSecretFiles
    ? options.externalSecretFiles.split(",").map((item) => item.trim()).filter(Boolean)
    : defaultExternalSecretFiles;
  return options.includeConsul ? [...files, "ops/kubernetes/lakehouse-consul-auth.yaml"] : files;
}

function parseExternalSecrets(files) {
  const resources = [];
  for (const file of files) {
    const fullPath = path.resolve(root, file);
    if (!fs.existsSync(fullPath)) {
      resources.push({ file, missing: true, name: "", remoteRefs: [] });
      continue;
    }
    const docs = fs.readFileSync(fullPath, "utf8").split(/^---\s*$/m);
    for (const doc of docs) {
      if (!/kind:\s*ExternalSecret\b/.test(doc)) continue;
      const name = matchMetadataName(doc);
      const target = matchBlockName(doc, "target") || name;
      const remoteRefs = [];
      const remotePattern = /remoteRef:\s*\n\s*key:\s*([^\s#]+)\s*\n\s*property:\s*([^\s#]+)/g;
      let match = remotePattern.exec(doc);
      while (match) {
        remoteRefs.push({ key: cleanYamlScalar(match[1]), property: cleanYamlScalar(match[2]) });
        match = remotePattern.exec(doc);
      }
      resources.push({ file, name, target, remoteRefs });
    }
  }
  return resources;
}

function matchMetadataName(doc) {
  const metadataMatch = doc.match(/metadata:\s*\n([\s\S]*?)(?:\n\S|$)/);
  if (!metadataMatch) return "";
  const nameMatch = metadataMatch[1].match(/^\s+name:\s*([^\s#]+)/m);
  return nameMatch ? cleanYamlScalar(nameMatch[1]) : "";
}

function matchBlockName(doc, block) {
  const pattern = new RegExp(`${block}:\\s*\\n([\\s\\S]*?)(?:\\n\\s{0,2}\\S|$)`);
  const blockMatch = doc.match(pattern);
  if (!blockMatch) return "";
  const nameMatch = blockMatch[1].match(/^\s+name:\s*([^\s#]+)/m);
  return nameMatch ? cleanYamlScalar(nameMatch[1]) : "";
}

function cleanYamlScalar(value) {
  return String(value).trim().replace(/^["']|["']$/g, "");
}

function terraformSecretNames(main) {
  const names = new Set();
  const secretPattern = /resource\s+"aws_secretsmanager_secret"\s+"[^"]+"\s*\{([\s\S]*?)\n\}/g;
  let match = secretPattern.exec(main);
  while (match) {
    const nameMatch = match[1].match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) names.add(nameMatch[1]);
    match = secretPattern.exec(main);
  }
  return names;
}

function externalSecretChecks(bindings, resources, files) {
  const checks = files.map((file) => check(`externalsecret.file.${file}`, fs.existsSync(path.resolve(root, file)), `${file} exists`));
  for (const binding of bindings) {
    const resource = resources.find((item) => item.name === binding.secret || item.target === binding.secret);
    checks.push(check(`externalsecret.${binding.secret}.exists`, Boolean(resource), `${binding.secret} ExternalSecret exists`));
    if (!resource) continue;
    const remoteProperties = new Set(resource.remoteRefs.filter((item) => item.key === binding.remoteKey).map((item) => item.property));
    checks.push(check(`externalsecret.${binding.secret}.remote_key`, remoteProperties.size > 0, `${binding.secret} reads ${binding.remoteKey}`));
    for (const property of binding.properties) {
      checks.push(
        check(
          `externalsecret.${binding.secret}.${property}`,
          remoteProperties.has(property),
          `${binding.secret} maps ${binding.remoteKey}.${property}`
        )
      );
    }
  }
  return checks;
}

function terraformChecks(terraformDir, bindings) {
  const fullDir = path.resolve(root, terraformDir);
  const mainPath = path.join(fullDir, "main.tf");
  const outputsPath = path.join(fullDir, "outputs.tf");
  const checks = [
    check("terraform.main", fs.existsSync(mainPath), `${mainPath} exists`),
    check("terraform.outputs", fs.existsSync(outputsPath), `${outputsPath} exists`)
  ];
  if (checks.some((item) => !item.passed)) return checks;
  const main = read(mainPath);
  const outputs = read(outputsPath);
  const secretNames = terraformSecretNames(main);
  for (const binding of bindings) {
    checks.push(check(`terraform.secret.${binding.remoteKey}`, secretNames.has(binding.remoteKey), `${binding.remoteKey} Secrets Manager resource exists`));
    for (const property of binding.properties) {
      checks.push(
        check(
          `terraform.secret_property.${binding.remoteKey}.${property}`,
          main.includes(`"${property}"`),
          `${binding.remoteKey} includes ${property}`
        )
      );
    }
  }
  checks.push(check("terraform.outputs.secret_names", count(outputs, "secret_name") >= bindings.length, "secret-name outputs cover required bindings"));
  checks.push(check("iam.policy.exists", main.includes('resource "aws_iam_policy" "object_lake_rw"'), "object lake read/write policy exists"));
  checks.push(check("iam.s3.list_bucket", main.includes('"s3:ListBucket"'), "S3 ListBucket is allowed"));
  checks.push(check("iam.s3.object_read", main.includes('"s3:GetObject"'), "S3 GetObject is allowed"));
  checks.push(check("iam.s3.object_write", main.includes('"s3:PutObject"'), "S3 PutObject is allowed"));
  checks.push(check("iam.s3.object_delete", main.includes('"s3:DeleteObject"'), "S3 DeleteObject is allowed"));
  checks.push(check("iam.s3.bucket_resource", main.includes("Resource = aws_s3_bucket.lake.arn"), "bucket-level ARN is scoped"));
  checks.push(check("iam.s3.object_resource", main.includes('Resource = "${aws_s3_bucket.lake.arn}/*"'), "object-level ARN is scoped to the lake bucket"));
  return checks;
}

function count(value, needle) {
  return value.split(needle).length - 1;
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
  const bindings = loadRequiredBindings(options);
  const files = externalSecretFiles(options);
  const resources = parseExternalSecrets(files);
  const checks = [
    ...externalSecretChecks(bindings, resources, files),
    ...terraformChecks(options.terraformDir, bindings)
  ];
  const failed = checks.filter((item) => !item.passed && item.severity === "error");
  write(options.out, {
    status: failed.length ? "failed" : "ok",
    terraformDir: options.terraformDir,
    secretRequirements: options.secretRequirements || "default",
    includeConsul: options.includeConsul,
    externalSecretFiles: files,
    requiredSecretBindings: bindings,
    checks
  });
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
