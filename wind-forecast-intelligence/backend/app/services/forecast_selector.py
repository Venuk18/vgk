"""Decision-time forecast selection (pure, reusable, no I/O).

For each delivery start: keep vintages with publish_time <= cutoff, pick the latest one.
Post-cutoff vintages are never eligible. The full vintage history is left untouched in the input
frame so revision analysis can show it separately.
"""
from __future__ import annotations

from datetime import time

import pandas as pd

from app.services.timeutils import cutoffs_for_starts

OUT_COLS = ["start_time", "cutoff_time", "forecast_publish_time", "forecast_mw", "eligible_vintages"]


def select_decision_time_forecasts(forecasts: pd.DataFrame, tz: str, cutoff_time: time,
                                   days_before: int) -> pd.DataFrame:
    """forecasts: columns start_time, publish_time, generation_mw (UTC, deduplicated).
    Returns one row per delivery start that has at least one eligible vintage. Delivery starts with
    vintages but none eligible are absent (=> reported as missing forecast, never back-filled)."""
    if forecasts.empty:
        return pd.DataFrame(columns=OUT_COLS)
    df = forecasts.copy()
    df["cutoff_time"] = cutoffs_for_starts(df["start_time"], tz, cutoff_time, days_before)
    eligible = df[df["publish_time"] <= df["cutoff_time"]]  # at-or-before: equality is eligible
    if eligible.empty:
        return pd.DataFrame(columns=OUT_COLS)
    counts = eligible.groupby("start_time").size().rename("eligible_vintages")
    latest = (eligible.sort_values(["start_time", "publish_time"], kind="mergesort")
              .groupby("start_time", as_index=False).tail(1))
    out = latest.rename(columns={"publish_time": "forecast_publish_time", "generation_mw": "forecast_mw"})
    out = out.merge(counts, left_on="start_time", right_index=True)
    return out[OUT_COLS].sort_values("start_time").reset_index(drop=True)
