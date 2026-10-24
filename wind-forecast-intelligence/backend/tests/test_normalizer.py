import pandas as pd

from app.services.data_normalizer import normalize_actuals, normalize_forecasts
from tests.fixtures import act, fc

WS = pd.Timestamp("2026-01-01T00:00Z")
WE = pd.Timestamp("2026-02-01T00:00Z")


def test_actuals_filtered_to_wind_only():
    rows = [act("2026-01-01T00:00:00Z", 100), act("2026-01-01T00:00:00Z", 999, fuel="NUCLEAR"),
            act("2026-01-01T00:30:00Z", 110, fuel="wind")]
    df, rep = normalize_actuals(rows, WS, WE)
    assert list(df["generation_mw"]) == [100, 110]
    assert rep["non_wind_rows_dropped"] == 1


def test_timestamp_normalization_to_utc():
    rows = [fc("2026-06-01T01:00:00+01:00", "2026-06-01T00:00:00Z", 5)]
    df, _ = normalize_forecasts(rows, pd.Timestamp("2026-05-31T23:00Z"), pd.Timestamp("2026-07-01T00:00Z"))
    assert str(df["start_time"].iloc[0]) == "2026-06-01 00:00:00+00:00"
    assert str(df["start_time"].dt.tz) == "UTC"


def test_mixed_timestamp_formats_parse():
    rows = [fc("2026-01-01T00:00:00Z", "2025-12-31T08:30:00Z", 1), fc("2026-01-01T01:00:00+00:00", "2025-12-31T08:30:00.000Z", 2)]
    df, rep = normalize_forecasts(rows, WS, WE)
    assert len(df) == 2 and rep["invalid_timestamp_rows"] == 0


def test_delivery_window_includes_full_final_day_and_excludes_neighbours():
    rows = [fc("2025-12-31T23:00:00Z", "2025-12-30T00:00:00Z", 1), fc("2026-01-31T23:00:00Z", "2026-01-30T08:30:00Z", 2),
            fc("2026-02-01T00:00:00Z", "2026-01-30T08:30:00Z", 3)]
    df, rep = normalize_forecasts(rows, WS, WE)
    assert list(df["generation_mw"]) == [2]
    assert rep["outside_delivery_window_rows"] == 2


def test_forecast_duplicates_are_deterministic_and_reported():
    rows = [fc("2026-01-01T00:00:00Z", "2025-12-31T08:30:00Z", 10), fc("2026-01-01T00:00:00Z", "2025-12-31T08:30:00Z", 10),
            fc("2026-01-01T01:00:00Z", "2025-12-31T08:30:00Z", 10), fc("2026-01-01T01:00:00Z", "2025-12-31T08:30:00Z", 12)]
    df, rep = normalize_forecasts(rows, WS, WE)
    assert rep["duplicate_rows_removed"] == 2 and rep["conflicting_duplicate_keys"] == 1
    assert list(df["generation_mw"]) == [10, 12]  # conflicting pair keeps the higher value
    df2, _ = normalize_forecasts(list(reversed(rows)), WS, WE)
    assert df.equals(df2)  # input order does not matter


def test_actual_duplicate_keeps_latest_publish():
    rows = [act("2026-01-01T00:00:00Z", 100, publish="2026-01-01T01:00:00Z"),
            act("2026-01-01T00:00:00Z", 105, publish="2026-01-02T01:00:00Z")]
    df, rep = normalize_actuals(rows, WS, WE)
    assert list(df["generation_mw"]) == [105] and rep["duplicate_rows_removed"] == 1


def test_invalid_rows_reported_not_hidden_and_zero_is_kept():
    rows = [fc("bad", "2025-12-31T08:30:00Z", 1), fc("2026-01-01T00:00:00Z", "2025-12-31T08:30:00Z", None),
            fc("2026-01-01T01:00:00Z", "2025-12-31T08:30:00Z", "x"), fc("2026-01-01T02:00:00Z", "2025-12-31T08:30:00Z", -5),
            fc("2026-01-01T03:30:00Z", "2025-12-31T08:30:00Z", 5), fc("2026-01-01T04:00:00Z", "2025-12-31T08:30:00Z", 0)]
    df, rep = normalize_forecasts(rows, WS, WE)
    assert rep["invalid_timestamp_rows"] == 1 and rep["null_or_non_numeric_generation_rows"] == 2
    assert rep["negative_generation_rows"] == 1 and rep["off_hourly_grid_rows"] == 1
    assert list(df["generation_mw"]) == [0]  # genuine zero generation survives


def test_empty_input():
    df, rep = normalize_forecasts([], WS, WE)
    assert df.empty and rep["rows_received"] == 0
    df, rep = normalize_actuals([], WS, WE)
    assert df.empty
