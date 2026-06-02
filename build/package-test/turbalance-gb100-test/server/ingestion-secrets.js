"use strict";

const fs = require("node:fs");

function readSecretValue({ value, env, fileEnv, fallback = "" } = {}) {
  if (value !== undefined && value !== null && value !== "") return String(value);

  const filePath = fileEnv ? process.env[fileEnv] : "";
  if (filePath) {
    return fs.readFileSync(filePath, "utf8").trim();
  }

  if (env && process.env[env] !== undefined) {
    return String(process.env[env]);
  }

  return fallback;
}

module.exports = {
  readSecretValue
};
