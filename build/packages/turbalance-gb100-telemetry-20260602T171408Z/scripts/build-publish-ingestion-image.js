#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const configPath = args.config || process.env.TURBALANCE_PILOT_CONFIG || path.join(root, "ops", "pilot-provider.config.example.json");
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
const image = args.image || process.env.TURBALANCE_PROVIDER_IMAGE || config.image;
const platform = args.platform || process.env.TURBALANCE_IMAGE_PLATFORM || "linux/amd64";
const dockerfile = args.dockerfile || process.env.TURBALANCE_DOCKERFILE || "Dockerfile";
const push = Boolean(args.push || process.env.TURBALANCE_IMAGE_PUSH);
const dryRun = Boolean(args["dry-run"] || process.env.TURBALANCE_DRY_RUN || !push);
const provenance = args.provenance || process.env.TURBALANCE_IMAGE_PROVENANCE || "false";

if (!image) {
  process.stderr.write("image is required via --image or ops/pilot-provider.config.example.json\n");
  process.exit(1);
}

const buildArgs = [
  "buildx",
  "build",
  "--platform",
  platform,
  "--file",
  dockerfile,
  "--tag",
  image,
  "--provenance",
  provenance,
  ...(push ? ["--push"] : ["--load"]),
  "."
];
const commands = [
  ["docker", buildArgs]
];

if (!push) {
  commands.push(["docker", ["image", "inspect", image]]);
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dryRun: true,
    image,
    commands: commands.map(([command, commandArgs]) => [command, ...commandArgs].join(" "))
  }, null, 2)}\n`);
  process.exit(0);
}

commands.forEach(([command, commandArgs]) => {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  dryRun: false,
  image,
  pushed: push
}, null, 2)}\n`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}
