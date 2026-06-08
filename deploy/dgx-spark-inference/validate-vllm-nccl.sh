#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker

: "${DGX_SSH_USER:=user}"
: "${NCCL_VALIDATE_PROMPT:=Say NCCL ready in five words.}"
: "${NCCL_VALIDATE_MAX_TOKENS:=8}"
: "${NCCL_VALIDATE_TIMEOUT_SECONDS:=120}"

worker_target="${DGX_SSH_USER}@${DGX_WORKER_IP}"

container_nccl_check() {
  local container="$1"
  docker exec -i "${container}" python3 - <<'PY'
import json
import os
import torch
import torch.distributed as dist

def nccl_version():
    try:
        value = torch.cuda.nccl.version()
        if isinstance(value, tuple):
            return ".".join(str(part) for part in value)
        return str(value)
    except Exception as exc:
        return f"unavailable:{type(exc).__name__}:{exc}"

print(json.dumps({
    "torch": torch.__version__,
    "cuda": torch.version.cuda,
    "cudaAvailable": torch.cuda.is_available(),
    "deviceCount": torch.cuda.device_count(),
    "ncclAvailable": dist.is_nccl_available(),
    "ncclVersion": nccl_version(),
    "ncclSocketIfname": os.environ.get("NCCL_SOCKET_IFNAME"),
    "vllmHostIp": os.environ.get("VLLM_HOST_IP"),
}, sort_keys=True))
PY
}

printf '%s\n' "SPARK1 container NCCL:"
container_nccl_check "${VLLM_RAY_HEAD_CONTAINER}"

printf '%s\n' "SPARK2 container NCCL:"
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${worker_target}" \
  "cd $(printf '%q' "${SCRIPT_DIR}") && . ./common.sh && docker exec -i \"\$VLLM_RAY_WORKER_CONTAINER\" python3 - <<'PY'
import json
import os
import torch
import torch.distributed as dist

def nccl_version():
    try:
        value = torch.cuda.nccl.version()
        if isinstance(value, tuple):
            return '.'.join(str(part) for part in value)
        return str(value)
    except Exception as exc:
        return f'unavailable:{type(exc).__name__}:{exc}'

print(json.dumps({
    'torch': torch.__version__,
    'cuda': torch.version.cuda,
    'cudaAvailable': torch.cuda.is_available(),
    'deviceCount': torch.cuda.device_count(),
    'ncclAvailable': dist.is_nccl_available(),
    'ncclVersion': nccl_version(),
    'ncclSocketIfname': os.environ.get('NCCL_SOCKET_IFNAME'),
    'vllmHostIp': os.environ.get('VLLM_HOST_IP'),
}, sort_keys=True))
PY"

printf '%s\n' "Ray distributed resources:"
docker exec -i "${VLLM_RAY_HEAD_CONTAINER}" python3 - <<PY
import json
import ray

ray.init(address="${VLLM_MN_HEAD_IP}:${RAY_PORT}", ignore_reinit_error=True)
resources = ray.cluster_resources()
available = ray.available_resources()
placement_groups = {
    key: {
        "state": value.get("state"),
        "bundles": value.get("bundles"),
        "bundles_to_node_id": value.get("bundles_to_node_id"),
    }
    for key, value in ray.util.placement_group_table().items()
    if value.get("state") == "CREATED"
}
print(json.dumps({
    "gpus": resources.get("GPU", 0),
    "availableGpus": available.get("GPU", 0),
    "acceleratorTypeGb10": resources.get("accelerator_type:GB10", 0),
    "placementGroups": placement_groups,
}, sort_keys=True))
PY

printf '%s\n' "OpenAI-compatible vLLM model list:"
curl -m "${NCCL_VALIDATE_TIMEOUT_SECONDS}" -fsS \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  "http://127.0.0.1:${OPENAI_API_PORT}/v1/models"
printf '\n'

printf '%s\n' "OpenAI-compatible vLLM NCCL-backed generation:"
python3 - <<PY
import json
import urllib.request

payload = json.dumps({
    "model": "${VLLM_405B_SERVED_MODEL_NAME}",
    "messages": [{"role": "user", "content": "${NCCL_VALIDATE_PROMPT}"}],
    "max_tokens": int("${NCCL_VALIDATE_MAX_TOKENS}"),
    "temperature": 0,
}).encode()
request = urllib.request.Request(
    "http://127.0.0.1:${OPENAI_API_PORT}/v1/chat/completions",
    data=payload,
    headers={
        "Authorization": "Bearer ${OPENAI_API_KEY}",
        "Content-Type": "application/json",
    },
)
with urllib.request.urlopen(request, timeout=int("${NCCL_VALIDATE_TIMEOUT_SECONDS}")) as response:
    body = json.loads(response.read().decode())
print(json.dumps({
    "model": body.get("model"),
    "content": body.get("choices", [{}])[0].get("message", {}).get("content", ""),
    "finishReason": body.get("choices", [{}])[0].get("finish_reason"),
    "usage": body.get("usage", {}),
}, sort_keys=True))
PY
