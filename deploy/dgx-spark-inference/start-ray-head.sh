#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_ray

"$(ray_bin)" stop --force >/dev/null 2>&1 || true
"$(ray_bin)" start \
  --head \
  --node-ip-address="${DGX_HEAD_IP}" \
  --port="${RAY_PORT}" \
  --dashboard-host=0.0.0.0 \
  --dashboard-port="${RAY_DASHBOARD_PORT}" \
  --ray-client-server-port="${RAY_CLIENT_PORT}" \
  --temp-dir="${RAY_TEMP_DIR}" \
  --num-gpus="${RAY_NUM_GPUS}" \
  --disable-usage-stats

"$(ray_bin)" status --address="${DGX_HEAD_IP}:${RAY_PORT}"
