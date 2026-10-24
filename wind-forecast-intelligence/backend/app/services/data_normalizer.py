"""Raw Elexon rows -> clean, tz-aware UTC DataFrames, with an explicit report of everything dropped.

Units: FUELHH generation is average MW over the half-hour starting at startTime (Elexon OpenAPI
description). WINDFOR generation is treated as MW as well; the WINDFOR endpoint text does not state
its unit explicitly, so this is an assumption surfaced in the README and /api/summary.
Nothing is hidden: every exclusion has a counter in the returned report.
"""
from __future__ import annotations

import pandas as pd

FORECAST_COLS = ("startTime", "publishTime", "generation")
ACTUAL_COLS = ("startTime", "generation", "fuelType")


def _frame(rows: list[dict], cols: tuple[str, ...]) -> pd.DataFrame:
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=list(cols))
    for c in cols:
        if c not in df.columns:
            df[c] = None
    return df


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce", utc=True, format="ISO8601")


def normalize_forecasts(rows: list[dict], window_start: pd.Timestamp, window_end: pd.Timestamp):
    """Returns (df[start_time, publish_time, generation_mw], report). One row per (start, publish)."""
    raw = _frame(rows, FORECAST_COLS)
    df = pd.DataFrame({
        "start_time": _ts(raw["startTime"]),
        "publish_time": _ts(raw["publishTime"]),
        "generation_mw": pd.to_numeric(raw["generation"], errors="coerce"),
    })
    rep = {"rows_received": len(df)}

    bad_ts = df["start_time"].isna() | df["publish_time"].isna()
    rep["invalid_timestamp_rows"] = int(bad_ts.sum())
    df = df[~bad_ts]

    bad_gen = df["generation_mw"].isna()
    rep["null_or_non_numeric_generation_rows"] = int(bad_gen.sum())
    df = df[~bad_gen]

    neg = df["generation_mw"] < 0
    rep["negative_generation_rows"] = int(neg.sum())
    df = df[~neg]

    inside = (df["start_time"] >= window_start) & (df["start_time"] < window_end)
    rep["outside_delivery_window_rows"] = int((~inside).sum())
    df = df[inside]

    off = (df["start_time"].dt.minute != 0) | (df["start_time"].dt.second != 0)
    rep["off_hourly_grid_rows"] = int(off.sum())  # forecasts are expected hourly
    df = df[~off]

    key = ["start_time", "publish_time"]
    df = df.sort_values(key + ["generation_mw"], kind="mergesort")
    dup_all = df[df.duplicated(key, keep=False)]
    rep["duplicate_rows_removed"] = int(df.duplicated(key).sum())
    rep["conflicting_duplicate_keys"] = (
        int(dup_all.groupby(key)["generation_mw"].nunique().gt(1).sum()) if len(dup_all) else 0)
    # Deterministic rule: after sorting by generation ascending, keep the last => highest value.
    df = df.drop_duplicates(key, keep="last").reset_index(drop=True)
    rep["rows_kept"] = len(df)
    rep["distinct_publications"] = int(df["publish_time"].nunique()) if len(df) else 0
    return df, rep


def normalize_actuals(rows: list[dict], window_start: pd.Timestamp, window_end: pd.Timestamp):
    """Returns (df[start_time, generation_mw, publish_time, settlement_date, settlement_period], report).
    Only fuelType == WIND is kept; one row per half-hourly start_time."""
    raw = _frame(rows, ACTUAL_COLS)
    df = pd.DataFrame({
        "start_time": _ts(raw["startTime"]),
        "generation_mw": pd.to_numeric(raw["generation"], errors="coerce"),
        "publish_time": _ts(raw["publishTime"]) if "publishTime" in raw else pd.NaT,
        "settlement_date": raw["settlementDate"] if "settlementDate" in raw else None,
        "settlement_period": raw["settlementPeriod"] if "settlementPeriod" in raw else None,
    })
    rep = {"rows_received": len(df)}

    is_wind = raw["fuelType"].astype(str).str.strip().str.upper() == "WIND"
    rep["non_wind_rows_dropped"] = int((~is_wind).sum())
    df = df[is_wind]

    bad_ts = df["start_time"].isna()
    rep["invalid_timestamp_rows"] = int(bad_ts.sum())
    df = df[~bad_ts]

    bad_gen = df["generation_mw"].isna()
    rep["null_or_non_numeric_generation_rows"] = int(bad_gen.sum())
    df = df[~bad_gen]

    neg = df["generation_mw"] < 0
    rep["negative_generation_rows"] = int(neg.sum())
    df = df[~neg]

    inside = (df["start_time"] >= window_start) & (df["start_time"] < window_end)
    rep["outside_delivery_window_rows"] = int((~inside).sum())
    df = df[inside]

    off = ~df["start_time"].dt.minute.isin([0, 30]) | (df["start_time"].dt.second != 0)
    rep["off_half_hour_grid_rows"] = int(off.sum())
    df = df[~off]

    df = df.sort_values(["start_time", "publish_time", "generation_mw"], na_position="first", kind="mergesort")
    dup_all = df[df.duplicated("start_time", keep=False)]
    rep["duplicate_rows_removed"] = int(df.duplicated("start_time").sum())
    rep["conflicting_duplicate_keys"] = (
        int(dup_all.groupby("start_time")["generation_mw"].nunique().gt(1).sum()) if len(dup_all) else 0)
    # Deterministic rule: latest publishTime wins (missing publishTime sorts first), then highest value.
    df = df.drop_duplicates("start_time", keep="last").reset_index(drop=True)
    rep["rows_kept"] = len(df)
    return df, rep
