#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ROLE="${1:-}"
if [[ "${ROLE}" != "head" && "${ROLE}" != "worker" ]]; then
  die "usage: $0 head|worker"
fi

require_command ip

ADDRESS="${VLLM_MN_HEAD_IP}/24"
if [[ "${ROLE}" == "worker" ]]; then
  ADDRESS="${VLLM_MN_WORKER_IP}/24"
fi

if [[ "${EUID}" -ne 0 ]]; then
  die "run with sudo: sudo $0 ${ROLE}"
fi

ip link set "${VLLM_MN_IF_NAME}" up
ip addr replace "${ADDRESS}" dev "${VLLM_MN_IF_NAME}"
ip -br addr show "${VLLM_MN_IF_NAME}"
