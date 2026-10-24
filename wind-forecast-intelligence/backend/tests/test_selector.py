import datetime as dt

import pandas as pd

from app.services.forecast_selector import select_decision_time_forecasts
from app.services.timeutils import cutoff_for_local_date
from tests.fixtures import fc
from app.services.data_normalizer import normalize_forecasts

WS, WE = pd.Timestamp("2026-01-01T00:00Z"), pd.Timestamp("2026-02-01T00:00Z")


def _select(rows):
    df, _ = normalize_forecasts(rows, WS, WE)
    return select_decision_time_forecasts(df, "Europe/London", dt.time(9, 20), 1)


def test_latest_eligible_vintage_selected_and_post_cutoff_excluded():
    d = "2026-01-02T12:00:00Z"   # cutoff = 2026-01-01 09:20Z
    sel = _select([fc(d, "2026-01-01T06:00:00Z", 100), fc(d, "2026-01-01T08:30:00Z", 200),
                   fc(d, "2026-01-01T10:30:00Z", 999), fc(d, "2026-01-01T16:30:00Z", 888)])
    assert len(sel) == 1
    assert sel["forecast_mw"].iloc[0] == 200
    assert str(sel["forecast_publish_time"].iloc[0]) == "2026-01-01 08:30:00+00:00"
    assert sel["eligible_vintages"].iloc[0] == 2


def test_publication_exactly_at_cutoff_is_eligible_one_second_later_is_not():
    d = "2026-01-02T12:00:00Z"
    assert _select([fc(d, "2026-01-01T09:20:00Z", 7)])["forecast_mw"].iloc[0] == 7
    assert _select([fc(d, "2026-01-01T09:20:01Z", 7)]).empty


def test_only_post_cutoff_vintages_means_missing_never_backfilled():
    sel = _select([fc("2026-01-02T12:00:00Z", "2026-01-01T10:30:00Z", 50)])
    assert sel.empty


def test_matching_is_per_delivery_start():
    sel = _select([fc("2026-01-02T00:00:00Z", "2026-01-01T08:30:00Z", 1), fc("2026-01-02T01:00:00Z", "2026-01-01T08:30:00Z", 2),
                   fc("2026-01-02T01:00:00Z", "2026-01-01T05:30:00Z", 3)])
    assert dict(zip(sel["start_time"].astype(str), sel["forecast_mw"])) == {
        "2026-01-02 00:00:00+00:00": 1, "2026-01-02 01:00:00+00:00": 2}


def test_cutoff_depends_on_local_delivery_date_not_utc_date():
    # Summer: delivery 2026-06-14T23:30Z is 00:30 BST on 15 June -> cutoff 14 June 09:20 BST = 08:20Z
    c = cutoff_for_local_date(pd.Timestamp("2026-06-14T23:30Z").tz_convert("Europe/London").date(),
                              "Europe/London", dt.time(9, 20), 1)
    assert str(c) == "2026-06-14 08:20:00+00:00"
    # Winter: BST/GMT same as UTC
    assert str(cutoff_for_local_date(dt.date(2026, 1, 2), "Europe/London", dt.time(9, 20), 1)) == "2026-01-01 09:20:00+00:00"


def test_dst_summer_selection_uses_bst_cutoff():
    wsum, wend = pd.Timestamp("2026-06-01T00:00Z"), pd.Timestamp("2026-07-01T00:00Z")
    d = "2026-06-15T12:00:00Z"
    df, _ = normalize_forecasts([fc(d, "2026-06-14T08:20:00Z", 1), fc(d, "2026-06-14T08:21:00Z", 2)], wsum, wend)
    sel = select_decision_time_forecasts(df, "Europe/London", dt.time(9, 20), 1)
    assert sel["forecast_mw"].tolist() == [1]


def test_configurable_cutoff():
    df, _ = normalize_forecasts([fc("2026-01-02T12:00:00Z", "2026-01-01T09:40:00Z", 5)], WS, WE)
    assert select_decision_time_forecasts(df, "Europe/London", dt.time(9, 20), 1).empty
    assert len(select_decision_time_forecasts(df, "Europe/London", dt.time(9, 50), 1)) == 1
