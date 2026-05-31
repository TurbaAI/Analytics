const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

[
  "Import must be a JSON object.",
  "Unsupported workspace schema:",
  "Workspace export is missing ingestion, baselines, or schema metadata.",
  "Unsupported ingestion schema:",
  "The runs field must be an array.",
  "Ingestion feed has no runs.",
  "Run ${index + 1} is missing id.",
  "${prefix}[${index + 1}] must be an object.",
  "${prefix}[${index + 1}] is missing runId.",
  "File is not valid JSON.",
  "API did not return valid JSON.",
  "API URL is not valid."
].forEach((message) => {
  assert.ok(app.includes(message), `Expected validation copy: ${message}`);
});

assert.ok(app.includes("allowCurrentFeed ? activeIngestion : null"));

[
  "validateImportPayloadRoot",
  "validateIngestionFeed",
  "validateSourceArrays",
  "validateSourceSamples",
  "validateRunIdSamples",
  "parseImportJson",
  "parseImportUrl",
  "importErrorMessage"
].forEach((functionName) => {
  assert.ok(app.includes(`function ${functionName}`), `Expected ${functionName} helper`);
});

console.log("import-validation copy tests passed");
