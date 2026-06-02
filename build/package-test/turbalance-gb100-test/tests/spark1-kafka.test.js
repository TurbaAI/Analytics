const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const broker = read("ops/kubernetes/spark1-kafka.yaml");
const smoke = read("ops/kubernetes/spark1-kafka-smoke-job.yaml");
const checker = read("scripts/check-spark1-kafka.js");

assert.ok(broker.includes("kind: Deployment"));
assert.ok(broker.includes("name: spark1-kafka"));
assert.ok(broker.includes("apache/kafka:4.3.0"));
assert.ok(broker.includes("KAFKA_PROCESS_ROLES"));
assert.ok(broker.includes("broker,controller"));
assert.ok(broker.includes("KAFKA_CONTROLLER_QUORUM_VOTERS"));
assert.ok(broker.includes("KAFKA_ADVERTISED_LISTENERS"));
assert.ok(broker.includes("spark1-kafka.turbalance-demo.svc.cluster.local:9092"));
assert.ok(broker.includes("192.168.10.20:30992"));
assert.ok(broker.includes("type: NodePort"));
assert.ok(broker.includes("nodePort: 30992"));

assert.ok(smoke.includes("kind: Job"));
assert.ok(smoke.includes("name: spark1-kafka-smoke"));
assert.ok(smoke.includes("kafka-topics.sh"));
assert.ok(smoke.includes("kafka-console-producer.sh"));
assert.ok(smoke.includes("kafka-console-consumer.sh"));
assert.ok(smoke.includes("messageId"));
assert.ok(smoke.includes("SPARK1 Kafka smoke test passed"));

assert.ok(checker.includes("ops/kubernetes/spark1-kafka.yaml"));
assert.ok(checker.includes("ops/kubernetes/spark1-kafka-smoke-job.yaml"));
assert.ok(checker.includes("rollout"));
assert.ok(checker.includes("deployment/spark1-kafka"));
assert.ok(checker.includes("condition=complete"));
assert.ok(checker.includes("SPARK1 Kafka smoke test passed"));

const syntax = spawnSync(process.execPath, ["--check", "scripts/check-spark1-kafka.js"], {
  cwd: root,
  encoding: "utf8"
});
assert.equal(syntax.status, 0, syntax.stderr);

console.log("SPARK1 Kafka tests passed");
