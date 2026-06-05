#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const registry = process.env.TURBALANCE_IMAGE_REGISTRY || "turbalance";
const tag = process.env.TURBALANCE_IMAGE_TAG || "dev";
const dryRun = process.argv.includes("--dry-run");

const images = [
  {
    name: "collector-gateway",
    dockerfile: "deploy/docker/Dockerfile.platform-service",
    buildArgs: {
      MODULE: "collector_gateway.app",
      PYTHONPATH_VALUE: "/workspace/services/collector-gateway:/workspace/services/raw-writer:/workspace/services/platform_common"
    }
  },
  {
    name: "duckdb-query-service",
    dockerfile: "deploy/docker/Dockerfile.platform-service",
    buildArgs: {
      MODULE: "duckdb_query_service.app",
      PYTHONPATH_VALUE: "/workspace/services/duckdb-query-service:/workspace/services/raw-writer:/workspace/services/platform_common"
    }
  },
  {
    name: "api-server",
    dockerfile: "deploy/docker/Dockerfile.platform-service",
    buildArgs: {
      MODULE: "api_server.app",
      PYTHONPATH_VALUE: "/workspace/services/api-server:/workspace/services/duckdb-query-service:/workspace/services/raw-writer:/workspace/services/alert-engine:/workspace/services/platform_common"
    }
  },
  {
    name: "discovery-api",
    dockerfile: "deploy/docker/Dockerfile.platform-service",
    buildArgs: {
      MODULE: "discovery_api.app",
      PYTHONPATH_VALUE: "/workspace/services/discovery-api:/workspace/services/platform_common"
    }
  },
  {
    name: "queue-gateway",
    dockerfile: "deploy/docker/Dockerfile.platform-service",
    buildArgs: {
      MODULE: "queue_gateway.app",
      PYTHONPATH_VALUE: "/workspace/services/queue-gateway:/workspace/services/platform_common"
    }
  },
  {
    name: "raw-writer",
    dockerfile: "deploy/docker/Dockerfile.platform-worker",
    buildArgs: {
      MODULE: "raw_writer",
      PYTHONPATH_VALUE: "/workspace/services/raw-writer:/workspace/services/platform_common"
    }
  },
  {
    name: "transform-runner",
    dockerfile: "deploy/docker/Dockerfile.platform-worker",
    buildArgs: {
      MODULE: "transform_runner",
      PYTHONPATH_VALUE: "/workspace/services/transform-runner:/workspace/services/duckdb-query-service:/workspace/services/raw-writer:/workspace/services/platform_common"
    }
  },
  { name: "ebpf-agent", dockerfile: "deploy/docker/Dockerfile.ebpf-agent", buildArgs: {} },
  { name: "dagster", dockerfile: "deploy/docker/Dockerfile.dagster", buildArgs: {} },
  { name: "sqlmesh", dockerfile: "deploy/docker/Dockerfile.sqlmesh", buildArgs: {} }
];

for (const image of images) {
  const args = ["build", "-f", image.dockerfile, "-t", `${registry}/${image.name}:${tag}`];
  for (const [key, value] of Object.entries(image.buildArgs)) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(".");
  if (dryRun) {
    console.log(`docker ${args.join(" ")}`);
    continue;
  }
  const result = spawnSync("docker", args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
