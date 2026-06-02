#!/usr/bin/env sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: $0 -- <workload command>" >&2
  exit 2
fi

if ! command -v ncu >/dev/null 2>&1; then
  echo "Nsight Compute CLI (ncu) is not installed. Profiling is optional and not part of always-on telemetry." >&2
  exit 127
fi

out_dir="${GB100_PROFILE_OUT_DIR:-build/gb100-profiles}"
mkdir -p "$out_dir"

exec ncu \
  --set full \
  --target-processes all \
  --export "$out_dir/nsight-compute-%p" \
  "$@"
