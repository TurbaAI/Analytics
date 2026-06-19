from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol

ACTION_RUNNER_REQUIRE_APPROVAL = True


class ApprovalRequiredError(PermissionError):
    pass


class Connector(Protocol):
    connector_id: str

    def plan(self, action: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        ...

    def apply(self, plan: dict[str, Any], approval: dict[str, Any]) -> dict[str, Any]:
        ...

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass
class TicketingConnector:
    connector_id: str = "ticketing"

    def plan(self, action: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        action_id = _action_id(action)
        return _plan(
            connector_id=self.connector_id,
            action=action,
            context=context,
            risk="low",
            reversible=True,
            changes=[
                {
                    "kind": "ticket",
                    "operation": "open-approval-request",
                    "target": context.get("ticketProject") or context.get("tenantId") or "tenant",
                    "summary": action.get("title") or action_id,
                }
            ],
            revert=[
                {
                    "kind": "ticket",
                    "operation": "close-or-cancel-request",
                    "target": context.get("ticketProject") or context.get("tenantId") or "tenant",
                }
            ],
        )

    def apply(self, plan: dict[str, Any], approval: dict[str, Any]) -> dict[str, Any]:
        return _execution(plan, approval, external_ref=f"ticket://turba/{_stable_hash(plan)[:10]}")

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        return _reverted(execution)


@dataclass
class KubernetesKarpenterConnector:
    connector_id: str = "kubernetes-karpenter"

    def plan(self, action: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        nodepool = context.get("nodePool") or action.get("nodePool") or "gpu-workers"
        namespace = context.get("namespace") or action.get("namespace") or "default"
        return _plan(
            connector_id=self.connector_id,
            action=action,
            context=context,
            risk="medium",
            reversible=True,
            changes=[
                {"kind": "kubernetes", "operation": "label-nodepool-for-repack", "target": nodepool, "dryRun": True},
                {"kind": "kubernetes", "operation": "patch-workload-requests", "target": namespace, "dryRun": True},
            ],
            revert=[
                {"kind": "kubernetes", "operation": "restore-nodepool-labels", "target": nodepool},
                {"kind": "kubernetes", "operation": "restore-workload-requests", "target": namespace},
            ],
        )

    def apply(self, plan: dict[str, Any], approval: dict[str, Any]) -> dict[str, Any]:
        return _execution(plan, approval, external_ref=f"k8s-change://{_stable_hash(plan)[:12]}")

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        return _reverted(execution)


@dataclass
class SlurmConnector:
    connector_id: str = "slurm"

    def plan(self, action: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        partition = context.get("partition") or action.get("partition") or "gpu"
        return _plan(
            connector_id=self.connector_id,
            action=action,
            context=context,
            risk="medium",
            reversible=True,
            changes=[
                {"kind": "slurm", "operation": "scontrol-requeue-with-placement-hint", "target": partition, "dryRun": True}
            ],
            revert=[
                {"kind": "slurm", "operation": "remove-placement-hint", "target": partition}
            ],
        )

    def apply(self, plan: dict[str, Any], approval: dict[str, Any]) -> dict[str, Any]:
        return _execution(plan, approval, external_ref=f"slurm-change://{_stable_hash(plan)[:12]}")

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        return _reverted(execution)


@dataclass
class RunAiConnector:
    connector_id: str = "runai"

    def plan(self, action: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        project = context.get("project") or action.get("project") or "default"
        return _plan(
            connector_id=self.connector_id,
            action=action,
            context=context,
            risk="medium",
            reversible=True,
            changes=[
                {"kind": "runai", "operation": "update-project-quota-or-placement-hint", "target": project, "dryRun": True}
            ],
            revert=[
                {"kind": "runai", "operation": "restore-project-quota-or-placement-hint", "target": project}
            ],
        )

    def apply(self, plan: dict[str, Any], approval: dict[str, Any]) -> dict[str, Any]:
        return _execution(plan, approval, external_ref=f"runai-change://{_stable_hash(plan)[:12]}")

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        return _reverted(execution)


@dataclass
class MockSchedulerConnector:
    connector_id: str = "mock-scheduler"
    applied: list[dict[str, Any]] = field(default_factory=list)
    reverted: list[dict[str, Any]] = field(default_factory=list)

    def plan(self, action: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return _plan(
            connector_id=self.connector_id,
            action=action,
            context=context,
            risk="low",
            reversible=True,
            changes=[{"kind": "mock", "operation": "apply-placement-hint", "target": _action_id(action), "dryRun": True}],
            revert=[{"kind": "mock", "operation": "remove-placement-hint", "target": _action_id(action)}],
        )

    def apply(self, plan: dict[str, Any], approval: dict[str, Any]) -> dict[str, Any]:
        execution = _execution(plan, approval, external_ref=f"mock://{_stable_hash(plan)[:10]}")
        self.applied.append(execution)
        return execution

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        reverted = _reverted(execution)
        self.reverted.append(reverted)
        return reverted


CONNECTOR_REGISTRY: dict[str, Connector] = {
    "ticketing": TicketingConnector(),
    "kubernetes-karpenter": KubernetesKarpenterConnector(),
    "slurm": SlurmConnector(),
    "runai": RunAiConnector(),
}


class ActionRunner:
    def __init__(
        self,
        *,
        registry: dict[str, Connector] | None = None,
        policy: dict[str, Any] | None = None,
        require_approval: bool = ACTION_RUNNER_REQUIRE_APPROVAL,
    ) -> None:
        self.registry = dict(registry or CONNECTOR_REGISTRY)
        self.policy = policy or {}
        self.require_approval = require_approval
        self.audit_log: list[dict[str, Any]] = []

    def plan(self, action: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
        context = context or {}
        connector_id = self._connector_id(action, context)
        connector = self._connector(connector_id)
        self._assert_allowed(connector_id, action, context)
        plan = connector.plan(action, context)
        plan["approvalRequired"] = self.require_approval
        plan["allowedByPolicy"] = True
        self._audit("planned", plan)
        return plan

    def apply(self, plan: dict[str, Any], approval: dict[str, Any] | None = None) -> dict[str, Any]:
        approval = approval or {}
        if self.require_approval and not _approved_by(approval):
            self._audit("apply_refused", {"planId": plan.get("id"), "reason": "approval-required"})
            raise ApprovalRequiredError("action runner apply requires an approval record")
        connector = self._connector(str(plan.get("connectorId") or "ticketing"))
        execution = connector.apply(plan, approval)
        execution["ledgerEvent"] = {
            "actionId": plan.get("actionId"),
            "status": "applied",
            "appliedAt": execution.get("appliedAt"),
            "externalRef": execution.get("externalRef"),
        }
        self._audit("applied", execution)
        return execution

    def revert(self, execution: dict[str, Any]) -> dict[str, Any]:
        connector = self._connector(str(execution.get("connectorId") or "ticketing"))
        result = connector.revert(execution)
        self._audit("reverted", result)
        return result

    def _connector_id(self, action: dict[str, Any], context: dict[str, Any]) -> str:
        requested = context.get("connectorId") or action.get("connectorId") or action.get("connector")
        if requested:
            return str(requested)
        category = str(action.get("category") or "").lower()
        if "slurm" in category:
            return "slurm"
        if "run:ai" in category or "runai" in category:
            return "runai"
        if "scheduler" in category or "placement" in category:
            return "kubernetes-karpenter"
        return "ticketing"

    def _connector(self, connector_id: str) -> Connector:
        connector = self.registry.get(connector_id)
        if connector is None:
            raise KeyError(f"unknown action connector: {connector_id}")
        return connector

    def _assert_allowed(self, connector_id: str, action: dict[str, Any], context: dict[str, Any]) -> None:
        tenant_id = str(context.get("tenantId") or action.get("tenantId") or "")
        tenant_policy = (self.policy.get("tenants") or {}).get(tenant_id, {}) if tenant_id else {}
        allow_connectors = tenant_policy.get("allowedConnectors") or self.policy.get("allowedConnectors")
        if allow_connectors and connector_id not in set(allow_connectors):
            raise PermissionError(f"connector {connector_id} is not allowed for tenant {tenant_id or '*'}")
        allow_actions = tenant_policy.get("allowedActions") or self.policy.get("allowedActions")
        if allow_actions and _action_id(action) not in set(allow_actions):
            raise PermissionError(f"action {_action_id(action)} is not allowed for tenant {tenant_id or '*'}")

    def _audit(self, event: str, payload: dict[str, Any]) -> None:
        self.audit_log.append({"event": event, "at": _utc_iso(), "payload": _json_safe(payload)})


def _plan(
    *,
    connector_id: str,
    action: dict[str, Any],
    context: dict[str, Any],
    risk: str,
    reversible: bool,
    changes: list[dict[str, Any]],
    revert: list[dict[str, Any]],
) -> dict[str, Any]:
    action_id = _action_id(action)
    plan = {
        "id": "",
        "connectorId": connector_id,
        "actionId": action_id,
        "actionTitle": str(action.get("title") or action.get("name") or action_id),
        "tenantId": str(context.get("tenantId") or action.get("tenantId") or ""),
        "scope": context.get("scope") or action.get("scope") or {},
        "changes": changes,
        "revert": revert,
        "reversible": reversible,
        "risk": risk,
        "dryRun": True,
        "createdAt": _utc_iso(),
    }
    plan["id"] = f"plan-{_stable_hash(plan)[:16]}"
    return plan


def _execution(plan: dict[str, Any], approval: dict[str, Any], *, external_ref: str) -> dict[str, Any]:
    return {
        "id": f"exec-{_stable_hash({'plan': plan, 'approval': approval})[:16]}",
        "planId": plan.get("id"),
        "connectorId": plan.get("connectorId"),
        "actionId": plan.get("actionId"),
        "status": "applied",
        "externalRef": external_ref,
        "approvedBy": _approved_by(approval),
        "approval": _json_safe(approval),
        "appliedAt": _utc_iso(),
        "revert": plan.get("revert") or [],
        "reversible": bool(plan.get("reversible")),
    }


def _reverted(execution: dict[str, Any]) -> dict[str, Any]:
    if not execution.get("reversible"):
        raise PermissionError("execution has no runnable revert")
    return {
        **execution,
        "status": "reverted",
        "revertedAt": _utc_iso(),
    }


def _approved_by(approval: dict[str, Any]) -> str:
    return str(approval.get("approvedBy") or approval.get("approver") or approval.get("subject") or "")


def _action_id(action: dict[str, Any]) -> str:
    return str(action.get("id") or action.get("actionId") or action.get("title") or "action")


def _stable_hash(value: dict[str, Any]) -> str:
    body = json.dumps(_json_safe(value), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _json_safe(value: Any) -> Any:
    try:
        json.dumps(value, default=str)
        return json.loads(json.dumps(value, default=str))
    except TypeError:
        return str(value)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
