"""Accuracy metrics on matched hourly periods. Error = forecast - actual (MW).

Positive bias => wind was OVERforecast; negative => UNDERforecast.
MAPE is deliberately not provided (actual wind can be ~0 MW).
Coverage denominator = expected hourly delivery periods in the requested range.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

COVERAGE_DENOMINATOR = ("expected hourly delivery periods in the selected range "
                        "(24 per local day; 744 for January 2026)")


def _f(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)


def compute_metrics(table: pd.DataFrame) -> dict:
    expected = len(table)
    has_f = table["forecast_mw"].notna() if expected else pd.Series(dtype=bool)
    has_a = table["actual_mw"].notna() if expected else pd.Series(dtype=bool)
    matched = has_f & has_a
    e = (table.loc[matched, "forecast_mw"] - table.loc[matched, "actual_mw"]).to_numpy(dtype=float)
    n = int(e.size)
    return {
        "units": "MW",
        "expected_periods": expected,
        "forecast_available": int(has_f.sum()),
        "actual_available": int(has_a.sum()),
        "matched_count": n,
        "missing_forecast": int((~has_f).sum()),
        "missing_actual": int((~has_a).sum()),
        "partial_actual_periods": int(((table["actual_slots"] == 1) & ~has_a).sum()) if expected else 0,
        "mae_mw": _f(np.mean(np.abs(e))) if n else None,
        "rmse_mw": _f(np.sqrt(np.mean(e ** 2))) if n else None,
        "bias_mw": _f(np.mean(e)) if n else None,
        "overforecast_periods": int((e > 0).sum()),
        "underforecast_periods": int((e < 0).sum()),
        "exact_periods": int((e == 0).sum()),
        "forecast_coverage_pct": _f(100.0 * has_f.sum() / expected) if expected else None,
        "matched_coverage_pct": _f(100.0 * n / expected) if expected else None,
        "coverage_denominator": COVERAGE_DENOMINATOR,
        "bias_interpretation": "forecast - actual: positive = overforecast, negative = underforecast",
    }


def _local(table: pd.DataFrame, tz: str) -> pd.DataFrame:
    t = table.copy()
    loc = t["start_time"].dt.tz_convert(tz)
    t["local_date"] = loc.dt.date
    t["local_hour"] = loc.dt.hour
    return t


def daily_breakdown(table: pd.DataFrame, tz: str) -> list[dict]:
    if table.empty:
        return []
    t = _local(table, tz)
    out = []
    for d, sub in t.groupby("local_date", sort=True):
        m = compute_metrics(sub)
        out.append({"date": d.isoformat(), **{k: m[k] for k in (
            "expected_periods", "matched_count", "mae_mw", "rmse_mw", "bias_mw", "forecast_coverage_pct")}})
    return out


def hour_of_day_breakdown(table: pd.DataFrame, tz: str, min_samples: int) -> list[dict]:
    if table.empty:
        return []
    t = _local(table, tz)
    out = []
    for h, sub in t.groupby("local_hour", sort=True):
        m = compute_metrics(sub)
        out.append({"hour": int(h), "matched_count": m["matched_count"], "mae_mw": m["mae_mw"],
                    "rmse_mw": m["rmse_mw"], "bias_mw": m["bias_mw"],
                    "sufficient_sample": m["matched_count"] >= min_samples})
    return out


def error_distribution(table: pd.DataFrame, bin_width_mw: float) -> dict:
    m = table["forecast_mw"].notna() & table["actual_mw"].notna() if len(table) else pd.Series(dtype=bool)
    e = (table.loc[m, "forecast_mw"] - table.loc[m, "actual_mw"]).to_numpy(dtype=float)
    if e.size == 0:
        return {"bin_width_mw": bin_width_mw, "bins": []}
    lo = np.floor(e.min() / bin_width_mw) * bin_width_mw
    hi = (np.floor(e.max() / bin_width_mw) + 1) * bin_width_mw
    edges = np.arange(lo, hi + bin_width_mw, bin_width_mw)
    counts, edges = np.histogram(e, bins=edges)
    return {"bin_width_mw": bin_width_mw,
            "bins": [{"from_mw": float(edges[i]), "to_mw": float(edges[i + 1]), "count": int(c)}
                     for i, c in enumerate(counts)]}
