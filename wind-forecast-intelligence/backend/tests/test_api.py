"""API tests. Require fastapi + httpx (see requirements.txt); skipped automatically if unavailable.
Data is clearly-labelled FIXTURE data injected into the repository: no network, no Elexon."""
import dataclasses
import datetime as dt

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.pipeline import build_dataset  # noqa: E402
from app.services.repository import DataRepository  # noqa: E402
from tests.test_pipeline_integration import S as DAY_SETTINGS, _rows  # noqa: E402


def _client(tmp_path, with_data=True):
    s = dataclasses.replace(Settings(), data_dir=tmp_path, delivery_start=dt.date(2026, 1, 1), delivery_end=dt.date(2026, 1, 31))
    repo = DataRepository(s, client=None)
    if with_data:
        a, f = _rows(True)
        repo.set_dataset(build_dataset(a, f, s))
    return TestClient(create_app(s, repo))


def test_health_works_without_data(tmp_path):
    r = _client(tmp_path, with_data=False).get("/api/health")
    assert r.status_code == 200 and r.json()["data_loaded"] is False


def test_data_endpoints_return_503_with_clear_message_when_no_data(tmp_path):
    r = _client(tmp_path, with_data=False).get("/api/summary")
    assert r.status_code == 503 and r.json()["detail"]["code"] == "data_unavailable"


def test_summary_reports_assumptions_and_limitations(tmp_path):
    j = _client(tmp_path).get("/api/summary").json()
    assert j["assumptions"]["cutoff_local_time"] == "09:20" and j["metrics"]["units"] == "MW"
    assert any("provisional" in x for x in j["limitations"])


def test_forecasts_for_date(tmp_path):
    j = _client(tmp_path).get("/api/forecasts", params={"date": "2026-01-01"}).json()
    assert len(j["hourly"]) == 24 and len(j["actuals_half_hourly"]) == 48
    assert j["metrics"]["mae_mw"] == 20 and j["metrics"]["bias_mw"] == -20


def test_metrics_range_and_validation(tmp_path):
    c = _client(tmp_path)
    ok = c.get("/api/metrics", params={"start_date": "2026-01-01", "end_date": "2026-01-01"})
    assert ok.status_code == 200 and ok.json()["metrics"]["matched_count"] == 24
    assert c.get("/api/metrics", params={"start_date": "2026-01-05", "end_date": "2026-01-01"}).status_code == 422
    assert c.get("/api/metrics", params={"start_date": "2025-12-31", "end_date": "2026-01-01"}).status_code == 422
    assert c.get("/api/metrics", params={"start_date": "nope", "end_date": "2026-01-01"}).status_code == 422
    assert c.get("/api/metrics").status_code == 422


def test_forecasts_date_validation(tmp_path):
    c = _client(tmp_path)
    assert c.get("/api/forecasts", params={"date": "2026-02-01"}).status_code == 422
    assert c.get("/api/forecasts").status_code == 422


def test_revisions(tmp_path):
    c = _client(tmp_path)
    j = c.get("/api/revisions", params={"delivery_start": "2026-01-01T06:00:00Z"}).json()
    assert [v["before_cutoff"] for v in j["vintages"]] == [True, True, False]
    assert sum(v["selected"] for v in j["vintages"]) == 1 and j["decision_cutoff"] == "2025-12-31T09:20:00Z"
    assert c.get("/api/revisions", params={"delivery_start": "2026-01-01T06:30:00Z"}).status_code == 422
    assert c.get("/api/revisions", params={"delivery_start": "2026-03-01T06:00:00Z"}).status_code == 422
    empty = c.get("/api/revisions", params={"delivery_start": "2026-01-02T06:00:00Z"}).json()
    assert empty["vintages"] == [] and empty["availability_note"]


def test_cors_allows_local_react_dev_origin(tmp_path):
    r = _client(tmp_path).get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173")
