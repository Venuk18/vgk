"""Forecast revision history for one delivery period (WINDFOR vintages), cutoff-aware."""
from __future__ import annotations

from datetime import time

import pandas as pd

from app.services.timeutils import cutoff_for_local_date


def build_revisions(forecasts: pd.DataFrame, delivery_start: pd.Timestamp, tz: str, cutoff_time: time,
                    days_before: int, selected_publish_time: pd.Timestamp | None,
                    actual_mw: float | None) -> dict:
    """forecasts: all deduplicated vintages. Output vintages are chronological; revision_mw is the
    change vs the immediately preceding publication (None for the first)."""
    local_date = delivery_start.tz_convert(tz).date()
    cutoff = cutoff_for_local_date(local_date, tz, cutoff_time, days_before)
    v = forecasts[forecasts["start_time"] == delivery_start].sort_values("publish_time", kind="mergesort")
    rows, prev = [], None
    for r in v.itertuples(index=False):
        rows.append({
            "publish_time": r.publish_time,
            "forecast_mw": float(r.generation_mw),
            "before_cutoff": bool(r.publish_time <= cutoff),
            "selected": bool(selected_publish_time is not None and r.publish_time == selected_publish_time),
            "revision_mw": None if prev is None else float(r.generation_mw) - prev,
        })
        prev = float(r.generation_mw)
    pre = [x for x in rows if x["before_cutoff"]]
    post = [x for x in rows if not x["before_cutoff"]]
    sel = next((x for x in rows if x["selected"]), None)
    summary = {
        "vintages_total": len(rows), "vintages_before_cutoff": len(pre), "vintages_after_cutoff": len(post),
        "net_revision_before_cutoff_mw": (pre[-1]["forecast_mw"] - pre[0]["forecast_mw"]) if len(pre) > 1 else None,
        "revision_after_cutoff_mw": (post[-1]["forecast_mw"] - sel["forecast_mw"]) if (post and sel) else None,
    }
    note = None
    if not rows:
        note = ("No WINDFOR publications are stored for this delivery period. Either it lies outside "
                "the ingested publication window or Elexon returned no vintages for it.")
    elif not pre:
        note = "No publication existed at or before the decision cutoff; no decision-time forecast exists."
    return {
        "delivery_start": delivery_start, "decision_cutoff": cutoff,
        "selected_publish_time": selected_publish_time, "actual_mw": actual_mw,
        "vintages": rows, "summary": summary, "availability_note": note,
    }
