const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function git(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: args.includes("-z") ? "buffer" : "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed\n${result.stderr}`);
  }
  return result.stdout;
}

const trackedFiles = git(["ls-files", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

assert.equal(trackedFiles.filter((file) => file.startsWith("build/")).length, 0, "build/ artifacts must not be tracked");
assert.equal(trackedFiles.filter((file) => file.endsWith(".pyc") || file.includes("/__pycache__/")).length, 0, "Python bytecode must not be tracked");

const forbiddenTrackedStrings = [
  ["collector", "token", "live"].join("-"),
  ["collector", "hmac", "live"].join("-")
];

const offenders = [];
for (const file of trackedFiles) {
  const body = fs.readFileSync(path.join(root, file));
  for (const secret of forbiddenTrackedStrings) {
    if (body.includes(Buffer.from(secret))) {
      offenders.push(`${file}: contains ${secret}`);
    }
  }
}

assert.deepEqual(offenders, [], "scrubbed collector credential strings must not reappear in tracked files");
