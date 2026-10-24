"""Integration test on clearly labelled FIXTURE data (synthetic, not real Elexon data)."""
import dataclasses
import datetime as dt
import math

from app.config import Settings
from app.services.pipeline import build_dataset
from app.services.accuracy_metrics import compute_metrics
from tests.fixtures import act, fc

S = dataclasses.replace(Settings(), delivery_start=dt.date(2026, 1, 1), delivery_end=dt.date(2026, 1, 1))


def _actual(h):
    return 1000 + 10 * h


def _rows(include_post_cutoff):
    actuals, forecasts = [], []
    for h in range(24):
        for m in (0, 30):
            actuals.append(act(f"2026-01-01T{h:02d}:{m:02d}:00Z", _actual(h)))
        t = f"2026-01-01T{h:02d}:00:00Z"
        forecasts += [fc(t, "2025-12-30T10:30:00Z", _actual(h) + 10),   # older vintage
                      fc(t, "2025-12-31T08:30:00Z", _actual(h) - 20)]   # latest eligible (cutoff 09:20)
        if include_post_cutoff:
            forecasts.append(fc(t, "2025-12-31T10:30:00Z", _actual(h) + 500))   # post-cutoff: must be ignored
    return actuals, forecasts


def test_full_pipeline_uses_latest_eligible_and_ignores_post_cutoff():
    a, f = _rows(False)
    base = build_dataset(a, f, S)
    m = compute_metrics(base.hourly)
    assert m["matched_count"] == 24 and m["forecast_coverage_pct"] == 100.0
    assert math.isclose(m["mae_mw"], 20) and math.isclose(m["rmse_mw"], 20) and math.isclose(m["bias_mw"], -20)

    a, f = _rows(True)
    with_leak = build_dataset(a, f, S)
    m2 = compute_metrics(with_leak.hourly)
    assert (m2["mae_mw"], m2["rmse_mw"], m2["bias_mw"]) == (m["mae_mw"], m["rmse_mw"], m["bias_mw"])
    assert with_leak.quality["forecast_vintages_stored"] == 72       # post-cutoff kept for revision analysis
    assert with_leak.actuals_half_hourly.shape[0] == 48              # original resolution retained
    assert with_leak.quality["unmatched_periods"] == 0


def test_missing_data_is_reported():
    a, f = _rows(False)
    a = [r for r in a if not r["startTime"].startswith("2026-01-01T05")]        # drop hour 05 actuals
    f = [r for r in f if r["startTime"] != "2026-01-01T07:00:00Z"]              # drop hour 07 forecast
    ds = build_dataset(a, f, S)
    q = ds.quality
    assert q["missing_actual_periods"] == 1 and q["missing_forecast_periods"] == 1
    assert q["matched_periods"] == 22 and q["unmatched_periods"] == 2
