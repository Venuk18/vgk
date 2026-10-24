"""Diagnostic probe (kept as a tool, not part of the app). Prints raw facts about the live API:
publish schedule, delivery resolution, vintages before a provisional cutoff.

  python -m scripts.probe_api [YYYY-MM-DD]   # delivery date to probe, default 2026-01-01
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone

import requests

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def main() -> None:
    d = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date(2026, 1, 1)
    lo = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) - timedelta(days=2)
    hi = lo + timedelta(days=3)
    f = "%Y-%m-%dT%H:%M:%SZ"
    w = requests.get(f"{BASE}/WINDFOR/stream", timeout=60,
                     params={"publishDateTimeFrom": lo.strftime(f), "publishDateTimeTo": hi.strftime(f)})
    print("WINDFOR", w.status_code, "rows:", len(w.json()))
    rows = w.json()
    pubs = sorted({r["publishTime"] for r in rows})
    print("distinct publishTimes:", len(pubs)); print(*pubs, sep="\n")
    starts = sorted({r["startTime"] for r in rows})
    print("first startTimes:", starts[:4], "-> spacing check on first 3:", [starts[i + 1] for i in range(2)])
    a = requests.get(f"{BASE}/FUELHH/stream", timeout=60,
                     params={"settlementDateFrom": d.isoformat(), "settlementDateTo": d.isoformat(), "fuelType": "WIND"})
    ar = a.json()
    print("FUELHH", a.status_code, "rows:", len(ar), "sample:", ar[:1])


if __name__ == "__main__":
    main()
