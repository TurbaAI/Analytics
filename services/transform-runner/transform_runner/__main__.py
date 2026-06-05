from __future__ import annotations

import argparse
import json

from .runner import TransformRunner
from .validation import validate_transform_runtime


def main() -> int:
    parser = argparse.ArgumentParser(description="Materialize turbalance virtual sensor tables.")
    parser.add_argument("--lake-root", required=True)
    parser.add_argument("--tenant-id", default=None)
    parser.add_argument("--validate", action="store_true", help="Validate SQLMesh/dbt/DuckDB virtual sensor runtime.")
    args = parser.parse_args()

    if args.validate:
        result = validate_transform_runtime(args.lake_root, tenant_id=args.tenant_id)
    else:
        result = TransformRunner(args.lake_root).materialize(tenant_id=args.tenant_id)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("status") in ("materialized", "ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
