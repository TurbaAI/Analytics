#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker
require_env VLLM_IMAGE

docker rm -f "${VLLM_RAY_WORKER_CONTAINER}" >/dev/null 2>&1 || true

docker run -d \
  --name "${VLLM_RAY_WORKER_CONTAINER}" \
  --restart unless-stopped \
  --network host \
  --ipc host \
  --shm-size="${VLLM_CONTAINER_SHM_SIZE}" \
  $(docker_gpu_args) \
  $(docker_infiniband_args) \
  $(docker_model_cache_args) \
  $(docker_multinode_env_args "${VLLM_MN_WORKER_IP}") \
  --entrypoint bash \
  "${VLLM_IMAGE}" \
  -lc "ray start --address=${VLLM_MN_HEAD_IP}:${RAY_PORT} --node-ip-address=${VLLM_MN_WORKER_IP} --disable-usage-stats --block"

docker logs --tail=80 "${VLLM_RAY_WORKER_CONTAINER}"
