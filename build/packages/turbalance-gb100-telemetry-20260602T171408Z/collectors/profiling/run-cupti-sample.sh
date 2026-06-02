#!/usr/bin/env sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: $0 -- <workload command>" >&2
  exit 2
fi

if [ -z "${CUPTI_LIBRARY_PATH:-}" ]; then
  echo "Set CUPTI_LIBRARY_PATH to the CUPTI library directory before sampling. CUPTI is optional and not required for always-on telemetry." >&2
  exit 2
fi

export LD_LIBRARY_PATH="${CUPTI_LIBRARY_PATH}:${LD_LIBRARY_PATH:-}"
exec "$@"
