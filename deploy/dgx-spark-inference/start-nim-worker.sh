#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker
require_env NIM_IMAGE
require_env NGC_API_KEY
require_env NIM_PRIMARY_NODE

docker rm -f "${NIM_CONTAINER_NAME}-worker" >/dev/null 2>&1 || true

docker run -d \
  --name "${NIM_CONTAINER_NAME}-worker" \
  --restart unless-stopped \
  --shm-size=32g \
  --network host \
  $(docker_gpu_args) \
  $(docker_infiniband_args) \
  -e "NGC_API_KEY=${NGC_API_KEY}" \
  -e "NIM_PRIMARY_NODE=${NIM_PRIMARY_NODE}" \
  -e "NIM_NODE_MANAGER_PORT=${NIM_NODE_MANAGER_PORT}" \
  -e "NIM_SERVER_PORT=${NIM_SERVER_PORT}" \
  ${NIM_EXTRA_ENV} \
  ${NIM_DOCKER_ARGS} \
  "${NIM_IMAGE}" \
  ${NIM_EXTRA_ARGS}

docker logs --tail=80 "${NIM_CONTAINER_NAME}-worker"
