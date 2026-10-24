"""Persistence + in-memory cache. Raw API rows are stored as JSON in DATA_DIR so the app can run from
cache without Elexon; the Dataset is rebuilt from raw rows (cheap) and held in memory."""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.services.elexon_client import ElexonClient
from app.services.pipeline import Dataset, build_dataset

log = logging.getLogger(__name__)


class DataUnavailable(Exception):
    pass


def publish_window(s: Settings):
    """Publication window: lead-in before the first delivery day (earlier vintages) through
    lead-out after the final delivery day (post-cutoff vintages for revision analysis)."""
    start = s.window_start_utc - timedelta(days=s.publish_lead_in_days)
    end = s.window_end_utc + timedelta(days=s.publish_lead_out_days)
    return start.to_pydatetime(), end.to_pydatetime()


class DataRepository:
    def __init__(self, settings: Settings, client: ElexonClient | None = None):
        self.s = settings
        self.client = client or ElexonClient(settings)
        self._lock = threading.Lock()
        self._dataset: Dataset | None = None
        self._paths = {n: settings.data_dir / f"{n}.json" for n in ("raw_actuals", "raw_forecasts", "ingest_meta")}

    @property
    def loaded(self) -> bool:
        return self._dataset is not None

    def set_dataset(self, ds: Dataset) -> None:
        """Inject a prebuilt dataset (used by tests)."""
        with self._lock:
            self._dataset = ds

    def has_cache(self) -> bool:
        return all(p.exists() for p in self._paths.values())

    def _write(self, name: str, obj) -> None:
        self.s.data_dir.mkdir(parents=True, exist_ok=True)
        tmp = self._paths[name].with_suffix(".tmp")
        tmp.write_text(json.dumps(obj), encoding="utf-8")
        os.replace(tmp, self._paths[name])  # atomic: readers never see a half-written file

    def _read(self, name: str):
        return json.loads(self._paths[name].read_text(encoding="utf-8"))

    def ingest(self) -> Dataset:
        """Fetch from Elexon, persist raw rows + metadata, rebuild. Raises DataUnavailable if nothing
        usable came back; partial failures are kept in ingest_meta['failed_windows']."""
        pf, pt = publish_window(self.s)
        a = self.client.fetch_actual_wind(self.s.delivery_start, self.s.delivery_end)
        f = self.client.fetch_forecasts(pf, pt)
        if not a.rows or not f.rows:
            raise DataUnavailable(
                f"Elexon returned no usable data (actual rows={len(a.rows)}, forecast rows={len(f.rows)}); "
                f"failed windows: {a.failed_windows + f.failed_windows}")
        meta = {
            "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "Elexon Insights API (FUELHH, WINDFOR)", "base_url": self.s.elexon_base_url,
            "actual_rows_fetched": len(a.rows), "forecast_rows_fetched": len(f.rows),
            "actual_requests": a.requests_made, "forecast_requests": f.requests_made,
            "forecast_publish_window": {"from": pf.isoformat(), "to_exclusive": pt.isoformat()},
            "failed_windows": a.failed_windows + f.failed_windows,
            "complete": a.complete and f.complete,
        }
        self._write("raw_actuals", a.rows)
        self._write("raw_forecasts", f.rows)
        self._write("ingest_meta", meta)
        with self._lock:
            self._dataset = build_dataset(a.rows, f.rows, self.s, meta)
        return self._dataset

    def rebuild_from_cache(self) -> Dataset:
        if not self.has_cache():
            raise DataUnavailable("No cached data. Run `python -m scripts.ingest` to fetch it.")
        ds = build_dataset(self._read("raw_actuals"), self._read("raw_forecasts"), self.s, self._read("ingest_meta"))
        with self._lock:
            self._dataset = ds
        return ds

    def get_dataset(self) -> Dataset:
        if self._dataset is not None:
            return self._dataset
        with self._lock:
            if self._dataset is not None:
                return self._dataset
        if self.has_cache():
            return self.rebuild_from_cache()
        if self.s.auto_ingest_on_start:
            log.info("No cache; auto-ingesting from Elexon")
            return self.ingest()
        raise DataUnavailable("No cached data. Run `python -m scripts.ingest` to fetch it.")
