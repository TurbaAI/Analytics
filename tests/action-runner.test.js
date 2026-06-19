const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const pythonCommand = process.platform === "darwin" ? ["/usr/bin/arch", "-arm64", "python3"] : ["python3"];

function run(args) {
  const result = spawnSync(pythonCommand[0], [...pythonCommand.slice(1), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: ["services/action-runner"].join(path.delimiter)
    }
  });
  if (result.status !== 0) {
    throw new Error(`${pythonCommand.join(" ")} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

const result = JSON.parse(run([
  "-c",
  `
import json
from action_runner import ActionRunner, ApprovalRequiredError, MockSchedulerConnector

mock = MockSchedulerConnector()
runner = ActionRunner(
    registry={"mock-scheduler": mock},
    policy={"tenants": {"tenant-a": {"allowedConnectors": ["mock-scheduler"], "allowedActions": ["rightsize-a"]}}},
)
action = {"id": "rightsize-a", "title": "Right-size idle GPU workers", "category": "scheduler"}
context = {"tenantId": "tenant-a", "connectorId": "mock-scheduler", "scope": {"type": "team", "key": "vision"}}
plan = runner.plan(action, context)
refused = False
try:
    runner.apply(plan)
except ApprovalRequiredError:
    refused = True
execution = runner.apply(plan, {"approvedBy": "operator@example.com", "ticket": "CHANGE-42"})
reverted = runner.revert(execution)
ticket_runner = ActionRunner()
ticket_plan = ticket_runner.plan({"id": "open-ticket", "title": "Open fallback ticket"}, {"tenantId": "tenant-z"})
print(json.dumps({
    "planConnector": plan["connectorId"],
    "planDryRun": plan["dryRun"],
    "refused": refused,
    "executionStatus": execution["status"],
    "approvedBy": execution["approvedBy"],
    "externalRef": execution["externalRef"],
    "ledgerStatus": execution["ledgerEvent"]["status"],
    "revertedStatus": reverted["status"],
    "auditEvents": [entry["event"] for entry in runner.audit_log],
    "mockApplied": len(mock.applied),
    "mockReverted": len(mock.reverted),
    "ticketConnector": ticket_plan["connectorId"],
    "ticketHasChange": len(ticket_plan["changes"]) > 0,
}))
`
]));

assert.equal(result.planConnector, "mock-scheduler");
assert.equal(result.planDryRun, true);
assert.equal(result.refused, true);
assert.equal(result.executionStatus, "applied");
assert.equal(result.approvedBy, "operator@example.com");
assert.match(result.externalRef, /^mock:\/\//);
assert.equal(result.ledgerStatus, "applied");
assert.equal(result.revertedStatus, "reverted");
assert.deepEqual(result.auditEvents, ["planned", "apply_refused", "applied", "reverted"]);
assert.equal(result.mockApplied, 1);
assert.equal(result.mockReverted, 1);
assert.equal(result.ticketConnector, "ticketing");
assert.equal(result.ticketHasChange, true);

console.log("action runner tests passed");
