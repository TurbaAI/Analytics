#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_docker
require_env NIM_IMAGE
require_env NGC_API_KEY

docker rm -f "${NIM_CONTAINER_NAME}-primary" >/dev/null 2>&1 || true

docker run -d \
  --name "${NIM_CONTAINER_NAME}-primary" \
  --restart unless-stopped \
  --shm-size=32g \
  --network host \
  $(docker_gpu_args) \
  $(docker_infiniband_args) \
  -e "NGC_API_KEY=${NGC_API_KEY}" \
  -e "NIM_SERVER_PORT=${NIM_SERVER_PORT}" \
  ${NIM_EXTRA_ENV} \
  ${NIM_DOCKER_ARGS} \
  "${NIM_IMAGE}" \
  ${NIM_EXTRA_ARGS}

docker logs --tail=80 "${NIM_CONTAINER_NAME}-primary"
