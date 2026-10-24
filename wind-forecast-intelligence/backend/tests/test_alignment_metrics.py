import math

import pandas as pd

from app.services.accuracy_metrics import compute_metrics, daily_breakdown, error_distribution, hour_of_day_breakdown
from app.services.alignment import aggregate_actuals_hourly, build_hourly_table
from app.services.data_normalizer import normalize_actuals
from tests.fixtures import act

WS, WE = pd.Timestamp("2026-01-01T00:00Z"), pd.Timestamp("2026-02-01T00:00Z")


def _hourly(actual_pairs, conv="start"):
    df, _ = normalize_actuals([act(t, g) for t, g in actual_pairs], WS, WE)
    return aggregate_actuals_hourly(df, conv)


def test_hourly_mean_of_two_half_hours_by_timestamp_not_position():
    # deliberately out of order to prove no index-based joining
    h = _hourly([("2026-01-01T00:30:00Z", 200), ("2026-01-01T00:00:00Z", 100), ("2026-01-01T01:00:00Z", 300), ("2026-01-01T01:30:00Z", 500)])
    assert dict(zip(h["start_time"].astype(str), h["actual_mw"])) == {
        "2026-01-01 00:00:00+00:00": 150.0, "2026-01-01 01:00:00+00:00": 400.0}


def test_partial_hour_is_not_interpolated():
    h = _hourly([("2026-01-01T00:00:00Z", 100)])
    assert math.isnan(h["actual_mw"].iloc[0]) and h["actual_slots"].iloc[0] == 1


def test_end_convention_maps_hour_ending_at_t():
    # forecast stamped 02:00 covers slots 01:00 and 01:30
    h = _hourly([("2026-01-01T01:00:00Z", 100), ("2026-01-01T01:30:00Z", 300)], conv="end")
    assert str(h["start_time"].iloc[0]) == "2026-01-01 02:00:00+00:00" and h["actual_mw"].iloc[0] == 200


def _table(forecast, actual):
    n = len(forecast)
    exp = pd.date_range("2026-01-01T00:00Z", periods=n, freq="h")
    sel = pd.DataFrame({"start_time": exp, "cutoff_time": exp, "forecast_publish_time": exp,
                        "forecast_mw": forecast, "eligible_vintages": 1})
    ha = pd.DataFrame({"start_time": exp, "actual_mw": actual, "actual_slots": 2})
    return build_hourly_table(exp, sel.dropna(subset=["forecast_mw"]), ha.dropna(subset=["actual_mw"]))


def test_mae_rmse_bias_hand_calculated():
    # errors (f-a) = -10, +20, -30 ; MAE=20 ; RMSE=sqrt((100+400+900)/3) ; bias=-20/3
    m = compute_metrics(_table([100, 200, 300], [110, 180, 330]))
    assert math.isclose(m["mae_mw"], 20.0)
    assert math.isclose(m["rmse_mw"], math.sqrt(1400 / 3))
    assert math.isclose(m["bias_mw"], -20 / 3)
    assert m["overforecast_periods"] == 1 and m["underforecast_periods"] == 2


def test_missing_excluded_from_metrics_but_counted_and_zero_is_valid():
    t = _table([100, None, 50, 40], [100, 10, None, 0])
    m = compute_metrics(t)
    assert m["matched_count"] == 2 and m["expected_periods"] == 4
    assert m["missing_forecast"] == 1 and m["missing_actual"] == 1
    assert math.isclose(m["mae_mw"], 20.0)           # |100-100|=0 and |40-0|=40 -> 20 ; zero actual used
    assert math.isclose(m["forecast_coverage_pct"], 75.0)
    assert math.isclose(m["matched_coverage_pct"], 50.0)
    assert t["status"].tolist() == ["matched", "missing_forecast", "missing_actual", "matched"]


def test_zero_actual_is_not_missing():
    t = _table([30], [0])
    assert t["status"].iloc[0] == "matched" and t["error_mw"].iloc[0] == 30


def test_empty_and_all_missing_are_safe():
    m = compute_metrics(_table([None, None], [None, None]))
    assert m["matched_count"] == 0 and m["mae_mw"] is None and m["rmse_mw"] is None and m["bias_mw"] is None
    assert m["forecast_coverage_pct"] == 0.0
    m = compute_metrics(_table([], [])) if False else compute_metrics(pd.DataFrame(columns=["forecast_mw", "actual_mw", "actual_slots"]))
    assert m["expected_periods"] == 0 and m["forecast_coverage_pct"] is None and m["mae_mw"] is None


def test_breakdowns_and_distribution():
    t = _table([100, 200, 300, 400], [90, 210, 300, 450])
    assert daily_breakdown(t, "Europe/London")[0]["matched_count"] == 4
    hod = hour_of_day_breakdown(t, "Europe/London", min_samples=2)
    assert [h["hour"] for h in hod] == [0, 1, 2, 3] and not any(h["sufficient_sample"] for h in hod)
    dist = error_distribution(t, 500.0)
    assert sum(b["count"] for b in dist["bins"]) == 4
