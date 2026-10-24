"""Align hourly forecasts with half-hourly actuals by normalized UTC timestamps (never by position).

Interval semantics (assumptions, tested):
  * FUELHH generation = average MW over the 30 minutes starting at startTime.
  * convention "start": a forecast stamped t covers the hour [t, t+60min) => actual slots t and t+30.
  * convention "end":   a forecast stamped t covers the hour ending at t   => slots t-60 and t-30.
  * Hourly actual = arithmetic mean of the two half-hour averages (valid for equal-length slots).
  * If only one of the two slots exists, the hourly actual is NOT computed (status partial_actual);
    nothing is interpolated or duplicated.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

SLOTS_PER_HOUR = 2


def hour_label(start: pd.Series, convention: str) -> pd.Series:
    if convention == "start":
        return start.dt.floor("h")
    if convention == "end":
        return (start + pd.Timedelta(minutes=30)).dt.ceil("h")
    raise ValueError(f"unknown hour convention: {convention}")


def aggregate_actuals_hourly(actuals: pd.DataFrame, convention: str) -> pd.DataFrame:
    """Returns start_time (hour label, UTC), actual_mw (NaN unless both slots present), actual_slots."""
    if actuals.empty:
        return pd.DataFrame({"start_time": pd.Series(dtype="datetime64[ns, UTC]"),
                             "actual_mw": pd.Series(dtype=float), "actual_slots": pd.Series(dtype=int)})
    a = actuals[["start_time", "generation_mw"]].copy()
    a["hour"] = hour_label(a["start_time"], convention)
    g = a.groupby("hour")["generation_mw"].agg(["mean", "count"]).reset_index()
    g = g.rename(columns={"hour": "start_time", "mean": "actual_mw", "count": "actual_slots"})
    g.loc[g["actual_slots"] < SLOTS_PER_HOUR, "actual_mw"] = np.nan
    return g


def build_hourly_table(expected_hours: pd.DatetimeIndex, selected: pd.DataFrame,
                       hourly_actual: pd.DataFrame) -> pd.DataFrame:
    """One row per expected hourly delivery period; missing sides stay NaN (never zero-filled)."""
    base = pd.DataFrame({"start_time": pd.to_datetime(expected_hours, utc=True)})
    t = base.merge(selected, on="start_time", how="left").merge(hourly_actual, on="start_time", how="left")
    t["actual_slots"] = t["actual_slots"].fillna(0).astype(int)
    t["eligible_vintages"] = t["eligible_vintages"].fillna(0).astype(int)
    t["error_mw"] = t["forecast_mw"] - t["actual_mw"]          # forecast - actual (+ = overforecast)
    t["abs_error_mw"] = t["error_mw"].abs()
    has_f, has_a = t["forecast_mw"].notna(), t["actual_mw"].notna()
    t["status"] = np.select(
        [has_f & has_a, has_f & ~has_a & (t["actual_slots"] > 0), has_f & ~has_a,
         ~has_f & has_a],
        ["matched", "partial_actual", "missing_actual", "missing_forecast"],
        default="missing_both",
    )
    # partial actual with no forecast is still just "missing_both" at the status level; slots keep detail
    return t
