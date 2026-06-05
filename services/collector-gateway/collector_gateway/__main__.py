from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .replay import replay_spool


def main() -> int:
    parser = argparse.ArgumentParser(description="collector gateway utility commands")
    parser.add_argument("--replay-spool", action="store_true", help="Replay authenticated collector spool files.")
    parser.add_argument("--lake-root", default=os.environ.get("TURBALANCE_LAKE_ROOT", "build/lakehouse"))
    parser.add_argument("--spool-dir", default=os.environ.get("TURBALANCE_COLLECTOR_SPOOL_DIR", "build/collector/spool"))
    parser.add_argument("--processed-dir", default=os.environ.get("TURBALANCE_COLLECTOR_PROCESSED_DIR", "build/collector/processed"))
    parser.add_argument("--dead-letter-dir", default=os.environ.get("TURBALANCE_COLLECTOR_DEAD_LETTER_DIR", "build/collector/dead-letter"))
    parser.add_argument("--limit", type=int, default=int(os.environ.get("TURBALANCE_COLLECTOR_REPLAY_LIMIT", "100")))
    args = parser.parse_args()

    if not args.replay_spool:
        parser.error("choose --replay-spool")

    result = replay_spool(
        lake_root=args.lake_root,
        spool_dir=Path(args.spool_dir),
        processed_dir=Path(args.processed_dir),
        dead_letter_dir=Path(args.dead_letter_dir),
        limit=args.limit,
    ).as_dict()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("status") == "ok" else 2


if __name__ == "__main__":
    raise SystemExit(main())
