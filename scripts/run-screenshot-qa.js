#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

let playwright;
try {
  playwright = require("playwright");
} catch {
  const message = "Playwright is not installed; screenshot QA skipped. Set TURBALANCE_SCREENSHOT_QA_REQUIRED=1 to fail instead.";
  if (process.env.TURBALANCE_SCREENSHOT_QA_REQUIRED === "1") {
    console.error(message);
    process.exit(1);
  }
  console.log(message);
  process.exit(0);
}

const root = path.join(__dirname, "..");
const outputDir = path.join(root, "build", "qa");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function createStaticServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = path.resolve(root, `.${requested}`);

    if (!fullPath.startsWith(root) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    res.writeHead(200, {
      "content-type": contentTypes[path.extname(fullPath)] || "application/octet-stream"
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const browser = await playwright.chromium.launch();

  try {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 1100 }
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
      await page.screenshot({ path: path.join(outputDir, `turbalance-${viewport.name}.png`), fullPage: true });
      const report = await page.evaluate(() => {
        const requiredIds = ["simulatorStats", "grafanaLinks", "opportunityList", "providerContext", "topologyMap"];
        const missing = requiredIds.filter((id) => !document.getElementById(id));
        const emptyRects = requiredIds.filter((id) => {
          const rect = document.getElementById(id)?.getBoundingClientRect();
          return !rect || rect.width <= 0 || rect.height <= 0;
        });
        return {
          title: document.title,
          missing,
          emptyRects,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyText: document.body.innerText
        };
      });

      if (!report.title.includes("turbalance Analytics")) {
        throw new Error(`${viewport.name}: unexpected title ${report.title}`);
      }
      if (report.missing.length > 0) {
        throw new Error(`${viewport.name}: missing ${report.missing.join(", ")}`);
      }
      if (report.emptyRects.length > 0) {
        throw new Error(`${viewport.name}: empty render targets ${report.emptyRects.join(", ")}`);
      }
      if (report.scrollWidth > report.clientWidth + 2) {
        throw new Error(`${viewport.name}: horizontal overflow ${report.scrollWidth} > ${report.clientWidth}`);
      }
      if (!report.bodyText.includes("Capacity what-if") || !report.bodyText.includes("Observability links")) {
        throw new Error(`${viewport.name}: expected dashboard panels not rendered`);
      }
      await page.close();
      console.log(`screenshot QA passed: ${viewport.name}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
