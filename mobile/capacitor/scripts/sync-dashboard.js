"use strict";

const fs = require("node:fs");
const path = require("node:path");

const mobileRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const webDir = path.join(mobileRoot, "www");

const files = [
  "analytics-core.js",
  "app.js",
  "index.html",
  "nccl-trace-fixtures.js",
  "nccl-trace-parser.js",
  "styles.css"
];

fs.rmSync(webDir, { recursive: true, force: true });
fs.mkdirSync(webDir, { recursive: true });

files.forEach((file) => {
  const source = path.join(repoRoot, file);
  const target = path.join(webDir, file);
  fs.copyFileSync(source, target);
});

copyDir(path.join(repoRoot, "assets"), path.join(webDir, "assets"));
fs.copyFileSync(path.join(mobileRoot, "mobile-config.js"), path.join(webDir, "mobile-config.js"));
injectMobileConfig(path.join(webDir, "index.html"));

console.log(`Synced dashboard assets to ${path.relative(repoRoot, webDir)}`);

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}

function injectMobileConfig(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  if (html.includes("mobile-config.js")) return;
  const marker = '    <script src="analytics-core.js';
  const replacement = '    <script src="mobile-config.js"></script>\n' + marker;
  fs.writeFileSync(filePath, html.replace(marker, replacement));
}
