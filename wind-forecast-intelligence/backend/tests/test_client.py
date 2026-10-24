import datetime as dt

import requests

from app.config import Settings
from app.services.elexon_client import ElexonClient, ElexonError, datetime_chunks


class Resp:
    def __init__(self, code=200, payload=None, headers=None, bad_json=False):
        self.status_code, self._p, self.headers, self._bad = code, payload, headers or {}, bad_json

    def json(self):
        if self._bad:
            raise ValueError("bad json")
        return self._p


class FakeSession:
    def __init__(self, script):
        self.script, self.calls = list(script), []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, dict(params or {}), timeout))
        item = self.script.pop(0) if self.script else Resp(200, [])
        if isinstance(item, Exception):
            raise item
        return item


S = Settings(max_retries=2, backoff_base_s=0.0)


def _client(script):
    sleeps = []
    return ElexonClient(S, FakeSession(script), sleep=sleeps.append), sleeps


def test_retries_on_429_then_succeeds_and_honours_retry_after():
    c, sleeps = _client([Resp(429, headers={"Retry-After": "3"}), Resp(200, [{"a": 1}])])
    res = c.fetch_actual_wind(dt.date(2026, 1, 1), dt.date(2026, 1, 1))
    assert res.rows == [{"a": 1}] and res.complete and sleeps == [3.0]


def test_retries_network_error_and_5xx():
    c, _ = _client([requests.ConnectionError("x"), Resp(503), Resp(200, [{"ok": 1}])])
    assert c.fetch_actual_wind(dt.date(2026, 1, 1), dt.date(2026, 1, 1)).rows == [{"ok": 1}]


def test_4xx_is_not_retried_and_recorded_as_failed_window():
    c, _ = _client([Resp(400)])
    res = c.fetch_actual_wind(dt.date(2026, 1, 1), dt.date(2026, 1, 1))
    assert not res.complete and len(c.session.calls) == 1 and res.failed_windows[0]["dataset"] == "FUELHH"


def test_malformed_json_and_wrong_shape_recorded():
    c, _ = _client([Resp(bad_json=True)] * 3 + [Resp(200, {"oops": 1})] * 3)
    r1 = c.fetch_actual_wind(dt.date(2026, 1, 1), dt.date(2026, 1, 1))
    r2 = c.fetch_actual_wind(dt.date(2026, 1, 1), dt.date(2026, 1, 1))
    assert not r1.complete and not r2.complete and "shape" in r2.failed_windows[0]["error"]


def test_partial_failure_keeps_other_windows():
    # 3-day chunks over 6 days => 2 requests; first fails permanently, second succeeds
    c, _ = _client([Resp(500)] * 3 + [Resp(200, [{"startTime": "x"}])])
    res = c.fetch_forecasts(dt.datetime(2025, 12, 29, tzinfo=dt.timezone.utc), dt.datetime(2026, 1, 4, tzinfo=dt.timezone.utc))
    assert res.requests_made == 2 and len(res.failed_windows) == 1 and len(res.rows) == 1


def test_params_wind_filter_timeouts_and_non_overlapping_publish_windows():
    c, _ = _client([])
    c.fetch_actual_wind(dt.date(2026, 1, 1), dt.date(2026, 1, 25))   # 10-day chunks -> 3
    assert [p["settlementDateFrom"] for _, p, _ in c.session.calls] == ["2026-01-01", "2026-01-11", "2026-01-21"]
    assert all(p["fuelType"] == "WIND" for _, p, _ in c.session.calls)
    assert c.session.calls[0][2] == (S.connect_timeout_s, S.read_timeout_s)
    c2, _ = _client([])
    c2.fetch_forecasts(dt.datetime(2025, 12, 29, tzinfo=dt.timezone.utc), dt.datetime(2026, 1, 4, tzinfo=dt.timezone.utc))
    p = [x[1] for x in c2.session.calls]
    assert p[0] == {"publishDateTimeFrom": "2025-12-29T00:00:00Z", "publishDateTimeTo": "2025-12-31T23:59:59Z"}
    assert p[1]["publishDateTimeFrom"] == "2026-01-01T00:00:00Z"   # no gap, no overlap


def test_chunks_cover_range_exactly():
    a, b = dt.datetime(2025, 12, 29), dt.datetime(2026, 2, 2)
    ch = datetime_chunks(a, b, 3)
    assert ch[0][0] == a and ch[-1][1] == b and all(ch[i][1] == ch[i + 1][0] for i in range(len(ch) - 1))
