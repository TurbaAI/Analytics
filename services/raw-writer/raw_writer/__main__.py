from __future__ import annotations

import argparse
import json

from .operations import compact_raw_partition, reconcile_lake
from .retention import apply_retention
from .writer import write_batch_file, write_source_bundle_file


def main() -> int:
    parser = argparse.ArgumentParser(description="Write turbalance telemetry batches to a Parquet lake.")
    parser.add_argument("--input", help="Telemetry batch JSON or source bundle JSON.")
    parser.add_argument("--lake-root", required=True, help="Output lake root.")
    parser.add_argument(
        "--source-bundle",
        action="store_true",
        help="Treat --input as a turbalance source bundle and adapt it to telemetry batches.",
    )
    parser.add_argument("--tenant-id", default="demo-tenant")
    parser.add_argument("--host-id", default="source-bundle")
    parser.add_argument("--agent-id", default="source-bundle-adapter")
    parser.add_argument("--retention-days", type=int, default=None, help="Apply lake retention instead of writing input.")
    parser.add_argument("--dry-run", action="store_true", help="Preview retention deletion.")
    parser.add_argument("--reconcile", action="store_true", help="Reconcile raw writer manifests against lake files.")
    parser.add_argument("--compact-table", help="Compact a raw table partition instead of writing input.")
    parser.add_argument("--compact-date", help="Partition date for --compact-table, formatted YYYY-MM-DD.")
    parser.add_argument("--compact-hour", help="Optional partition hour for --compact-table, formatted HH.")
    parser.add_argument("--delete-compacted-inputs", action="store_true", help="Delete source fragments after compaction.")
    args = parser.parse_args()

    if args.reconcile:
        result = reconcile_lake(args.lake_root)
    elif args.compact_table:
        if not args.compact_date:
            parser.error("--compact-date is required with --compact-table")
        result = compact_raw_partition(
            args.lake_root,
            table_name=args.compact_table,
            tenant_id=args.tenant_id,
            dt=args.compact_date,
            hour=args.compact_hour,
            delete_inputs=args.delete_compacted_inputs,
        )
    elif args.retention_days is not None:
        result = apply_retention(args.lake_root, retention_days=args.retention_days, dry_run=args.dry_run).as_dict()
    elif args.source_bundle:
        if not args.input:
            parser.error("--input is required when writing a source bundle")
        result = write_source_bundle_file(
            args.input,
            args.lake_root,
            tenant_id=args.tenant_id,
            host_id=args.host_id,
            agent_id=args.agent_id,
        )
    else:
        if not args.input:
            parser.error("--input is required when writing a telemetry batch")
        result = write_batch_file(args.input, args.lake_root)

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("status") in ("written", "compacted", "skipped", "ok", None) else 2


if __name__ == "__main__":
    raise SystemExit(main())
