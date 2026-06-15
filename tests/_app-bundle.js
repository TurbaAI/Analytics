// Shared test helper: the browser app is split across app-data.js and the
// app-*.js modules (loaded as classic scripts before app.js). Tests that
// execute the app in a VM or string-match its source must use the full bundle,
// concatenated in the same order index.html loads them.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

// Order mirrors index.html: data + function modules before app.js.
const APP_BUNDLE_FILES = [
  "app-data.js",
  "app-core.js",
  "app-pipeline.js",
  "app-state.js",
  "app-render.js",
  "app.js"
];

function appBundleSource() {
  return APP_BUNDLE_FILES
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n;\n");
}

module.exports = { appBundleSource, APP_BUNDLE_FILES };
