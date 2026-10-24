"""Pure pipeline: raw rows -> normalized -> selected -> aligned -> metrics-ready Dataset."""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from app.config import Settings
from app.services.alignment import aggregate_actuals_hourly, build_hourly_table
from app.services.accuracy_metrics import compute_metrics
from app.services.data_normalizer import normalize_actuals, normalize_forecasts
from app.services.forecast_selector import select_decision_time_forecasts


@dataclass
class Dataset:
    settings: Settings
    actuals_half_hourly: pd.DataFrame      # retained original resolution
    forecasts_all: pd.DataFrame            # every deduplicated vintage (for revisions)
    selected: pd.DataFrame                 # decision-time forecasts only
    hourly: pd.DataFrame                   # expected hourly grid with forecast/actual/error/status
    quality: dict = field(default_factory=dict)
    ingest_meta: dict = field(default_factory=dict)


_EXCLUDED_KEYS = ("invalid_timestamp_rows", "null_or_non_numeric_generation_rows", "negative_generation_rows",
                  "off_hourly_grid_rows", "off_half_hour_grid_rows", "non_wind_rows_dropped")


def _excluded(rep: dict) -> int:
    return sum(rep.get(k, 0) for k in _EXCLUDED_KEYS)


def build_dataset(actual_rows: list[dict], forecast_rows: list[dict], settings: Settings,
                  ingest_meta: dict | None = None) -> Dataset:
    ws, we = settings.window_start_utc, settings.window_end_utc
    actuals, a_rep = normalize_actuals(actual_rows, ws, we)
    forecasts, f_rep = normalize_forecasts(forecast_rows, ws, we)
    selected = select_decision_time_forecasts(forecasts, settings.timezone, settings.cutoff_time,
                                              settings.cutoff_days_before)
    hourly_actual = aggregate_actuals_hourly(actuals, settings.hour_convention)
    expected = pd.date_range(ws, we, freq="h", inclusive="left", tz="UTC")
    hourly = build_hourly_table(expected, selected, hourly_actual)

    m = compute_metrics(hourly)
    has_f, has_a = hourly["forecast_mw"].notna(), hourly["actual_mw"].notna()
    expected_half = int((we - ws) / pd.Timedelta(minutes=30))
    quality = {
        "expected_hourly_periods": m["expected_periods"],
        "expected_half_hourly_actual_periods": expected_half,
        "actual_half_hourly_present": len(actuals),
        "actual_half_hourly_missing": expected_half - len(actuals),
        "matched_periods": m["matched_count"],
        "missing_forecast_periods": m["missing_forecast"],
        "missing_actual_periods": m["missing_actual"],
        "partial_actual_periods": m["partial_actual_periods"],
        "unmatched_periods": int((has_f ^ has_a).sum()),   # present on exactly one side
        "periods_with_vintages_but_none_eligible": int(
            forecasts["start_time"].nunique() - selected["start_time"].nunique()) if len(forecasts) else 0,
        "forecast_vintages_stored": len(forecasts),
        "duplicate_or_invalid_records": {
            "actuals": a_rep, "forecasts": f_rep,
            "total_duplicates_removed": a_rep["duplicate_rows_removed"] + f_rep["duplicate_rows_removed"],
            "total_invalid_or_excluded": _excluded(a_rep) + _excluded(f_rep),
        },
    }
    return Dataset(settings, actuals, forecasts, selected, hourly, quality, ingest_meta or {})
