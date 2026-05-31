const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const analytics = require("../analytics-core.js");

const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const context = {
  console,
  Date,
  Intl,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Set,
  String,
  window: {
    TurbaAnalytics: analytics,
    TurbaNcclTraceParser: null,
    TurbaNcclTraceFixtures: [],
    localStorage: {
      getItem: () => null,
      setItem: () => true
    }
  },
  document: {
    addEventListener: () => {}
  }
};

vm.createContext(context);
vm.runInContext(appSource, context);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { provider: [{}] } }),
  /sources\.provider\[1\] is missing runId\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ sources: { prometheus: [null] } }),
  /sources\.prometheus\[1\] must be an object\./
);

assert.throws(
  () => context.buildIngestionFromExternalPayload({ ncclTraces: [{ events: [] }] }),
  /ncclTraces\[1\] is missing runId\./
);

const providerTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/provider-overlay-template.json"), "utf8"));
const sourceBundle = context.buildIngestionFromExternalPayload(providerTemplate);
assert.ok(sourceBundle.sourceAdapters.includes("provider"));

console.log("source bundle validation tests passed");
