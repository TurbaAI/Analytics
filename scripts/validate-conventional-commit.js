#!/usr/bin/env node

const allowedTypes = ["feat", "fix", "docs", "test", "chore", "refactor", "perf", "ci", "build", "revert"];

function messageFromArgv(argv) {
  const positional = argv.slice(2).filter((arg) => arg !== "--message");
  if (positional.length) return positional.join(" ").trim();
  return String(process.env.TURBALANCE_COMMIT_MESSAGE || "").trim();
}

function validate(message) {
  if (!message) return { ok: false, error: "commit or pull request title is required" };
  if (/^Revert "?[\s\S]+"?/.test(message)) return { ok: true, type: "revert" };
  const firstLine = message.split(/\r?\n/)[0];
  const match = firstLine.match(/^([a-z]+)(\([a-z0-9._/-]+\))?!?: .{1,120}$/);
  if (!match) {
    return {
      ok: false,
      error: "subject must match type(optional-scope): short imperative summary"
    };
  }
  if (!allowedTypes.includes(match[1])) {
    return {
      ok: false,
      error: `unsupported conventional commit type ${match[1]}`
    };
  }
  return { ok: true, type: match[1] };
}

const message = messageFromArgv(process.argv);
const result = validate(message);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", type: result.type, subject: message.split(/\r?\n/)[0] }, null, 2));

