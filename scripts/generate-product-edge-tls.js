#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseArgs,
  readProductConfig
} = require("../lib/product-config");

const root = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "ops/turbalance-product.example.json";
const config = readProductConfig(configPath);
const outDir = path.resolve(root, args["out-dir"] || "build/product-tls");
const apply = Boolean(args.apply);
const force = Boolean(args.force);
const host = args.host || config.controller.host;

main();

function main() {
  const plan = [
    "create product edge server CA",
    "create product edge HTTPS server certificate",
    "create product edge agent client CA",
    "create default agent client certificate"
  ];
  let results = [];
  if (apply) {
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(outDir, 0o700);
    results = generate();
  }
  const report = {
    status: apply ? (results.every((step) => step.ok) ? "written" : "failed") : "dry-run",
    generatedAt: new Date().toISOString(),
    outDir,
    host,
    openssl: opensslVersion(),
    plan,
    files: {
      serverCa: path.join(outDir, "ca.crt"),
      serverCert: path.join(outDir, "server.crt"),
      serverKey: path.join(outDir, "server.key"),
      clientCa: path.join(outDir, "client-ca.crt"),
      clientCert: path.join(outDir, "agent-client.crt"),
      clientKey: path.join(outDir, "agent-client.key")
    },
    results
  };
  if (report.status === "failed") process.exitCode = 1;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function generate() {
  const results = [];
  writeText(path.join(outDir, "server.ext"), [
    `subjectAltName=${serverAltNames().join(",")}`,
    "extendedKeyUsage=serverAuth",
    "keyUsage=digitalSignature,keyEncipherment"
  ].join("\n") + "\n");
  writeText(path.join(outDir, "client.ext"), [
    "subjectAltName=URI:spiffe://turbalance.local/agent/default",
    "extendedKeyUsage=clientAuth",
    "keyUsage=digitalSignature,keyEncipherment"
  ].join("\n") + "\n");

  runStep(results, "server-ca", [
    "req", "-x509", "-newkey", "rsa:4096", "-sha256", "-days", "3650", "-nodes",
    "-subj", "/CN=turbalance Product Edge Root CA",
    "-keyout", path.join(outDir, "ca.key"),
    "-out", path.join(outDir, "ca.crt")
  ], ["ca.key", "ca.crt"]);
  runStep(results, "server-csr", [
    "req", "-newkey", "rsa:2048", "-nodes",
    "-subj", `/CN=${host}`,
    "-keyout", path.join(outDir, "server.key"),
    "-out", path.join(outDir, "server.csr")
  ], ["server.key", "server.csr"]);
  runStep(results, "server-cert", [
    "x509", "-req",
    "-in", path.join(outDir, "server.csr"),
    "-CA", path.join(outDir, "ca.crt"),
    "-CAkey", path.join(outDir, "ca.key"),
    "-CAcreateserial",
    "-out", path.join(outDir, "server.crt"),
    "-days", "397",
    "-sha256",
    "-extfile", path.join(outDir, "server.ext")
  ], ["server.crt"]);
  runStep(results, "client-ca", [
    "req", "-x509", "-newkey", "rsa:4096", "-sha256", "-days", "3650", "-nodes",
    "-subj", "/CN=turbalance Agent Client CA",
    "-keyout", path.join(outDir, "client-ca.key"),
    "-out", path.join(outDir, "client-ca.crt")
  ], ["client-ca.key", "client-ca.crt"]);
  runStep(results, "client-csr", [
    "req", "-newkey", "rsa:2048", "-nodes",
    "-subj", "/CN=turbalance-agent-default",
    "-keyout", path.join(outDir, "agent-client.key"),
    "-out", path.join(outDir, "agent-client.csr")
  ], ["agent-client.key", "agent-client.csr"]);
  runStep(results, "client-cert", [
    "x509", "-req",
    "-in", path.join(outDir, "agent-client.csr"),
    "-CA", path.join(outDir, "client-ca.crt"),
    "-CAkey", path.join(outDir, "client-ca.key"),
    "-CAcreateserial",
    "-out", path.join(outDir, "agent-client.crt"),
    "-days", "397",
    "-sha256",
    "-extfile", path.join(outDir, "client.ext")
  ], ["agent-client.crt"]);

  for (const name of ["ca.key", "server.key", "client-ca.key", "agent-client.key"]) chmodIfExists(path.join(outDir, name), 0o600);
  for (const name of ["ca.crt", "server.crt", "client-ca.crt", "agent-client.crt"]) chmodIfExists(path.join(outDir, name), 0o644);
  return results;
}

function runStep(results, step, commandArgs, outputs) {
  if (!force && outputs.every((name) => fs.existsSync(path.join(outDir, name)))) {
    results.push({ step, ok: true, status: "skipped-existing" });
    return;
  }
  const result = spawnSync("openssl", commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  results.push({
    step,
    ok: result.status === 0,
    status: result.status ?? -1,
    stderr: result.status === 0 ? "" : (result.stderr || result.stdout).slice(-2000)
  });
}

function serverAltNames() {
  const names = ["DNS:localhost", "IP:127.0.0.1"];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) names.unshift(`IP:${host}`);
  else names.unshift(`DNS:${host}`);
  names.push("DNS:nuc14e", "DNS:NUC14E");
  return Array.from(new Set(names));
}

function opensslVersion() {
  const result = spawnSync("openssl", ["version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "missing";
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, value);
}

function chmodIfExists(filePath, mode) {
  if (fs.existsSync(filePath)) fs.chmodSync(filePath, mode);
}
