import datetime as dt

import pandas as pd

from app.services.data_normalizer import normalize_forecasts
from app.services.revision_analysis import build_revisions
from tests.fixtures import fc

WS, WE = pd.Timestamp("2026-01-01T00:00Z"), pd.Timestamp("2026-02-01T00:00Z")
D = "2026-01-02T12:00:00Z"
T = pd.Timestamp(D)


def _rev(rows, sel=None, actual=None):
    df, _ = normalize_forecasts(rows, WS, WE)
    return build_revisions(df, T, "Europe/London", dt.time(9, 20), 1, sel, actual)


def test_chronological_order_classification_and_revisions():
    r = _rev([fc(D, "2026-01-01T16:30:00Z", 150), fc(D, "2025-12-31T23:30:00Z", 100), fc(D, "2026-01-01T08:30:00Z", 130),
              fc(D, "2026-01-01T09:20:00Z", 120)],
             sel=pd.Timestamp("2026-01-01T09:20:00Z"), actual=140.0)
    v = r["vintages"]
    assert [x["forecast_mw"] for x in v] == [100, 130, 120, 150]            # chronological by publish time
    assert [x["before_cutoff"] for x in v] == [True, True, True, False]     # 09:20 exactly is before/at cutoff
    assert [x["revision_mw"] for x in v] == [None, 30, -10, 30]
    assert [x["selected"] for x in v] == [False, False, True, False]
    assert r["summary"]["vintages_before_cutoff"] == 3 and r["summary"]["vintages_after_cutoff"] == 1
    assert r["summary"]["revision_after_cutoff_mw"] == 30 and r["summary"]["net_revision_before_cutoff_mw"] == 20
    assert str(r["decision_cutoff"]) == "2026-01-01 09:20:00+00:00" and r["actual_mw"] == 140.0


def test_empty_state_has_explanation():
    r = _rev([])
    assert r["vintages"] == [] and "No WINDFOR publications" in r["availability_note"]


def test_only_post_cutoff_note():
    r = _rev([fc(D, "2026-01-01T10:30:00Z", 5)])
    assert "no decision-time forecast" in r["availability_note"]
