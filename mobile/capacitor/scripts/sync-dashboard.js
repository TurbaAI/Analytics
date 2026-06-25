"use strict";

const fs = require("node:fs");
const path = require("node:path");

const mobileRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const webDir = path.join(mobileRoot, "www");
const dashboardIndex = path.join(repoRoot, "index.html");

fs.rmSync(webDir, { recursive: true, force: true });
fs.mkdirSync(webDir, { recursive: true });

const files = ["index.html", ...discoverDashboardFiles(dashboardIndex)];

files.forEach(copyRepoFile);

copyDir(path.join(repoRoot, "assets"), path.join(webDir, "assets"));
fs.copyFileSync(path.join(mobileRoot, "mobile-config.js"), path.join(webDir, "mobile-config.js"));
injectMobileConfig(path.join(webDir, "index.html"));
validateWebBundle(path.join(webDir, "index.html"));

console.log(`Synced ${files.length} dashboard file(s) to ${path.relative(repoRoot, webDir)}`);

function copyRepoFile(file) {
  const source = path.join(repoRoot, file);
  const target = path.join(webDir, file);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Missing dashboard asset referenced by index.html: ${file}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function discoverDashboardFiles(indexPath) {
  const html = fs.readFileSync(indexPath, "utf8");
  const files = new Set();
  const referencePattern = /\b(?:src|href)=["']([^"']+)["']/g;
  let match;

  while ((match = referencePattern.exec(html)) !== null) {
    const file = normalizeLocalReference(match[1]);
    if (file) files.add(file);
  }

  return Array.from(files).sort();
}

function normalizeLocalReference(value) {
  if (!value || value.startsWith("#")) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(value)) return null;
  if (/^(?:data|mailto|tel):/i.test(value)) return null;

  const clean = value.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith("/") || clean.includes("..")) return null;
  return clean;
}

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
  const firstExternalScript = /(\s*)<script\s+src=["'][^"']+["']><\/script>/;
  const match = html.match(firstExternalScript);
  if (!match) throw new Error("Could not find dashboard script tag for mobile config injection");

  const indent = match[1];
  const replacement = `${indent}<script src="mobile-config.js"></script>${match[0]}`;
  fs.writeFileSync(filePath, html.replace(firstExternalScript, replacement));
}

function validateWebBundle(indexPath) {
  const html = fs.readFileSync(indexPath, "utf8");
  const missing = [];
  const referencePattern = /\b(?:src|href)=["']([^"']+)["']/g;
  let match;

  while ((match = referencePattern.exec(html)) !== null) {
    const file = normalizeLocalReference(match[1]);
    if (!file) continue;
    if (!fs.existsSync(path.join(webDir, file))) missing.push(file);
  }

  if (missing.length > 0) {
    throw new Error(`Mobile web bundle is missing referenced file(s): ${missing.join(", ")}`);
  }
}
