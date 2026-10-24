"""Elexon Insights API client (keyless). Bounded requests, retries with backoff, shape validation.

Endpoints (base: https://data.elexon.co.uk/bmrs/api/v1/datasets):
  GET /FUELHH/stream  params: settlementDateFrom, settlementDateTo (yyyy-MM-dd), fuelType=WIND
  GET /WINDFOR/stream params: publishDateTimeFrom, publishDateTimeTo (ISO, UTC)

WINDFOR cannot be filtered by delivery time, so forecasts are fetched in contiguous, non-overlapping
publish-time windows. A failed window is recorded and the run continues (partial failure); callers
must surface `failed_windows` rather than treat the result as complete.
"""
from __future__ import annotations

import logging
import time as _time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

import requests

from app.config import Settings

log = logging.getLogger(__name__)

FUELHH_PATH = "/FUELHH/stream"
WINDFOR_PATH = "/WINDFOR/stream"


class ElexonError(Exception):
    """Unrecoverable problem talking to Elexon (after retries) or a malformed response."""


@dataclass
class FetchResult:
    rows: list[dict] = field(default_factory=list)
    requests_made: int = 0
    failed_windows: list[dict] = field(default_factory=list)

    @property
    def complete(self) -> bool:
        return not self.failed_windows


def date_chunks(start: date, end_inclusive: date, days: int) -> list[tuple[date, date]]:
    out, cur = [], start
    while cur <= end_inclusive:
        stop = min(cur + timedelta(days=days - 1), end_inclusive)
        out.append((cur, stop))
        cur = stop + timedelta(days=1)
    return out


def datetime_chunks(start: datetime, end_exclusive: datetime, days: int) -> list[tuple[datetime, datetime]]:
    """Half-open [from, to) windows covering [start, end_exclusive) with no overlap."""
    out, cur = [], start
    while cur < end_exclusive:
        stop = min(cur + timedelta(days=days), end_exclusive)
        out.append((cur, stop))
        cur = stop
    return out


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(self, settings: Settings, session: requests.Session | None = None,
                 sleep: Callable[[float], None] = _time.sleep):
        self.s = settings
        self.session = session or requests.Session()
        self._sleep = sleep

    # ---- low level -------------------------------------------------------------------------
    def _get_rows(self, path: str, params: dict[str, Any]) -> list[dict]:
        url = self.s.elexon_base_url + path
        last_err = "unknown"
        for attempt in range(self.s.max_retries + 1):
            wait = self.s.backoff_base_s * (2 ** attempt)
            try:
                resp = self.session.get(url, params=params,
                                        timeout=(self.s.connect_timeout_s, self.s.read_timeout_s))
            except requests.RequestException as exc:
                last_err = f"network error: {type(exc).__name__}"
            else:
                code = resp.status_code
                if code == 200:
                    try:
                        return self._validate_shape(resp.json())
                    except ValueError:
                        last_err = "response was not valid JSON"
                    except ElexonError as exc:
                        last_err = str(exc)
                elif code == 429:
                    last_err = "HTTP 429 rate limited"
                    retry_after = resp.headers.get("Retry-After") if getattr(resp, "headers", None) else None
                    if retry_after and str(retry_after).isdigit():
                        wait = max(wait, float(retry_after))
                elif 500 <= code < 600:
                    last_err = f"HTTP {code} server error"
                else:  # 4xx other than 429: our request is wrong, retrying cannot help
                    raise ElexonError(f"HTTP {code} for {path} params={params}")
            if attempt < self.s.max_retries:
                log.warning("Elexon %s attempt %d/%d failed (%s); retrying in %.1fs",
                            path, attempt + 1, self.s.max_retries + 1, last_err, wait)
                self._sleep(wait)
        raise ElexonError(f"{path} failed after {self.s.max_retries + 1} attempts: {last_err}")

    @staticmethod
    def _validate_shape(payload: Any) -> list[dict]:
        if isinstance(payload, dict) and isinstance(payload.get("data"), list):
            payload = payload["data"]  # non-stream envelope, tolerated
        if not isinstance(payload, list):
            raise ElexonError("unexpected response shape: expected a JSON array of records")
        if any(not isinstance(r, dict) for r in payload):
            raise ElexonError("unexpected response shape: array contains non-object records")
        return payload

    # ---- datasets --------------------------------------------------------------------------
    def fetch_actual_wind(self, start: date, end_inclusive: date) -> FetchResult:
        """FUELHH actuals for settlement dates [start, end]. fuelType=WIND is sent server-side and
        re-checked in the normalizer."""
        res = FetchResult()
        for a, b in date_chunks(start, end_inclusive, self.s.actual_chunk_days):
            params = {"settlementDateFrom": a.isoformat(), "settlementDateTo": b.isoformat(),
                      "fuelType": "WIND"}
            res.requests_made += 1
            try:
                rows = self._get_rows(FUELHH_PATH, params)
            except ElexonError as exc:
                log.error("FUELHH window %s..%s failed: %s", a, b, exc)
                res.failed_windows.append({"dataset": "FUELHH", "from": a.isoformat(),
                                           "to": b.isoformat(), "error": str(exc)})
                continue
            log.info("FUELHH %s..%s -> %d rows", a, b, len(rows))
            res.rows.extend(rows)
        return res

    def fetch_forecasts(self, publish_from: datetime, publish_to_exclusive: datetime) -> FetchResult:
        """WINDFOR publications with publishTime in [publish_from, publish_to_exclusive)."""
        res = FetchResult()
        for a, b in datetime_chunks(publish_from, publish_to_exclusive, self.s.forecast_chunk_days):
            # `to` is made exclusive by subtracting 1s so adjacent windows never overlap.
            params = {"publishDateTimeFrom": _iso(a), "publishDateTimeTo": _iso(b - timedelta(seconds=1))}
            res.requests_made += 1
            try:
                rows = self._get_rows(WINDFOR_PATH, params)
            except ElexonError as exc:
                log.error("WINDFOR window %s..%s failed: %s", params["publishDateTimeFrom"],
                          params["publishDateTimeTo"], exc)
                res.failed_windows.append({"dataset": "WINDFOR", "from": params["publishDateTimeFrom"],
                                           "to": params["publishDateTimeTo"], "error": str(exc)})
                continue
            log.info("WINDFOR %s..%s -> %d rows", params["publishDateTimeFrom"],
                     params["publishDateTimeTo"], len(rows))
            res.rows.extend(rows)
        return res
