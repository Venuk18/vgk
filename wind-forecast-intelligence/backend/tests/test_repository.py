import dataclasses
import tempfile
from pathlib import Path

from app.config import Settings
from app.services.elexon_client import FetchResult
from app.services.repository import DataRepository, DataUnavailable
from tests.fixtures import act, fc


class FakeClient:
    def __init__(self, a, f, failed=None):
        self.a, self.f, self.failed = a, f, failed or []

    def fetch_actual_wind(self, *_):
        return FetchResult(rows=self.a, requests_made=1)

    def fetch_forecasts(self, *_):
        return FetchResult(rows=self.f, requests_made=2, failed_windows=self.failed)


class ExplodingClient:
    def __getattr__(self, name):
        raise AssertionError("network must not be touched when cache exists")


def _settings():
    return dataclasses.replace(Settings(), data_dir=Path(tempfile.mkdtemp()))


A = [act("2026-01-01T00:00:00Z", 100), act("2026-01-01T00:30:00Z", 200)]
F = [fc("2026-01-01T00:00:00Z", "2025-12-31T08:30:00Z", 120)]


def test_ingest_persists_then_runs_from_cache_without_network():
    s = _settings()
    DataRepository(s, FakeClient(A, F)).ingest()
    fresh = DataRepository(s, ExplodingClient())
    assert fresh.has_cache()
    ds = fresh.get_dataset()
    assert ds.quality["matched_periods"] == 1
    assert ds.ingest_meta["complete"] is True


def test_partial_failure_is_recorded_not_hidden():
    s = _settings()
    repo = DataRepository(s, FakeClient(A, F, failed=[{"dataset": "WINDFOR", "error": "boom"}]))
    ds = repo.ingest()
    assert ds.ingest_meta["complete"] is False and len(ds.ingest_meta["failed_windows"]) == 1


def test_no_cache_and_no_auto_ingest_means_data_unavailable():
    repo = DataRepository(_settings(), ExplodingClient())
    try:
        repo.get_dataset()
        assert False, "expected DataUnavailable"
    except DataUnavailable as exc:
        assert "scripts.ingest" in str(exc)


def test_empty_fetch_raises_and_does_not_write_cache():
    s = _settings()
    repo = DataRepository(s, FakeClient([], []))
    try:
        repo.ingest()
        assert False
    except DataUnavailable:
        pass
    assert not repo.has_cache()
