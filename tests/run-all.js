const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const checks = [
  { label: "syntax app.js", args: ["--check", "app.js"] },
  { label: "syntax analytics-core.js", args: ["--check", "analytics-core.js"] },
  { label: "syntax nccl-trace-parser.js", args: ["--check", "nccl-trace-parser.js"] },
  { label: "syntax nccl-trace-fixtures.js", args: ["--check", "nccl-trace-fixtures.js"] },
  { label: "analytics core", args: ["tests/analytics-core.test.js"] },
  { label: "NCCL trace parser", args: ["tests/nccl-trace-parser.test.js"] },
  { label: "external ingestion fixture", args: ["tests/external-ingestion-fixture.test.js"] },
  { label: "neo-cloud provider fixture", args: ["tests/neo-cloud-provider-fixture.test.js"] },
  { label: "provider exporter", args: ["tests/provider-exporter.test.js"] },
  { label: "eBPF exporter", args: ["tests/ebpf-exporter.test.js"] },
  { label: "workspace export fixture", args: ["tests/workspace-export-fixture.test.js"] },
  { label: "redacted workspace export", args: ["tests/redacted-workspace-export.test.js"] },
  { label: "evidence pack export", args: ["tests/evidence-pack-export.test.js"] },
  { label: "schemas", args: ["tests/schemas.test.js"] },
  { label: "source bundle validation", args: ["tests/source-bundle-validation.test.js"] },
  { label: "import validation copy", args: ["tests/import-validation-copy.test.js"] },
  { label: "static page wiring", args: ["tests/static-page-wiring.test.js"] },
  { label: "docs and workflows", args: ["tests/docs-and-workflows.test.js"] }
];

const failures = [];

checks.forEach((check) => {
  console.log(`\n> ${check.label}`);
  const result = spawnSync(process.execPath, check.args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    failures.push(check.label);
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed");
}
