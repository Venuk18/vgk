"""Fetch + cache January 2026 data from Elexon, then print a coverage report.

  python -m scripts.ingest                # fetch from Elexon, write data/*.json, rebuild
  python -m scripts.ingest --rebuild-only # rebuild from cached raw rows (no network)

Exit code 0 only if ingestion was complete (no failed windows). A non-zero exit means the data
must NOT be described as complete.
"""
from __future__ import annotations

import argparse
import json
import sys

from app.config import Settings, configure_logging
from app.services.accuracy_metrics import compute_metrics
from app.services.repository import DataRepository, DataUnavailable


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild-only", action="store_true")
    args = ap.parse_args()
    configure_logging()
    s = Settings.from_env()
    repo = DataRepository(s)
    try:
        ds = repo.rebuild_from_cache() if args.rebuild_only else repo.ingest()
    except DataUnavailable as exc:
        print(f"FAILED: {exc}")
        return 2
    m = compute_metrics(ds.hourly)
    print(json.dumps({"ingest": ds.ingest_meta, "data_quality": ds.quality, "metrics": m}, indent=2, default=str))
    complete = ds.ingest_meta.get("complete", False) and m["forecast_coverage_pct"] == 100.0 and m["matched_coverage_pct"] == 100.0
    print("\nRESULT:", "COMPLETE: all expected hourly periods matched" if complete else
          "INCOMPLETE: see failed_windows and data_quality above; do not claim full January coverage")
    return 0 if complete else 1


if __name__ == "__main__":
    sys.exit(main())
