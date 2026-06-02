"use strict";

const REQUIRED_FIELDS = ["owner", "approvedBy", "approvedAt", "expiresAt", "scope", "ticket"];

function validateSourceApprovals({ contractsConfig, approvalsConfig, now = new Date() }) {
  const contracts = enabledContracts(contractsConfig);
  const approvals = enabledApprovals(approvalsConfig);
  const approvalBySystem = new Map(approvals.map((approval) => [normalizeSystem(approval.system), approval]));
  const errors = [];
  const approved = [];

  contracts.forEach((contract) => {
    const system = normalizeSystem(contract.system);
    const approval = approvalBySystem.get(system);
    if (!approval) {
      errors.push(`${system}: missing source-owner approval`);
      return;
    }

    REQUIRED_FIELDS.forEach((field) => {
      if (!approval[field]) errors.push(`${system}: approval missing ${field}`);
    });

    if (approval.status && approval.status !== "approved") {
      errors.push(`${system}: approval status must be approved`);
    }
    if (!validDate(approval.approvedAt)) {
      errors.push(`${system}: approvedAt must be a valid date`);
    }
    if (!validDate(approval.expiresAt)) {
      errors.push(`${system}: expiresAt must be a valid date`);
    } else if (endOfDay(approval.expiresAt) < now) {
      errors.push(`${system}: approval expired at ${approval.expiresAt}`);
    }
    if (approval.url && approval.url !== contract.url) {
      errors.push(`${system}: approval url does not match contract url`);
    }
    if (system === "prometheus" && approval.queriesFile && approval.queriesFile !== contract.queriesFile) {
      errors.push("prometheus: approval queriesFile does not match contract queriesFile");
    }

    approved.push({
      system,
      owner: approval.owner || "",
      approvedBy: approval.approvedBy || "",
      expiresAt: approval.expiresAt || "",
      ticket: approval.ticket || ""
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    approved,
    requiredSystems: contracts.map((contract) => normalizeSystem(contract.system))
  };
}

function enabledContracts(config) {
  return (Array.isArray(config?.contracts) ? config.contracts : [])
    .filter((contract) => contract.enabled !== false)
    .filter((contract) => contract.system);
}

function enabledApprovals(config) {
  return (Array.isArray(config?.approvals) ? config.approvals : [])
    .filter((approval) => approval.enabled !== false)
    .filter((approval) => approval.system);
}

function normalizeSystem(system) {
  return String(system || "").toLowerCase();
}

function validDate(value) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function endOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

module.exports = {
  validateSourceApprovals
};
