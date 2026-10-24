"""Environment-based configuration. No secrets are needed (the Elexon Insights API is keyless)."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, time
from pathlib import Path

import pandas as pd


def _parse_time(value: str) -> time:
    hh, mm = value.strip().split(":")[:2]
    return time(int(hh), int(mm))


@dataclass(frozen=True)
class Settings:
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
    connect_timeout_s: float = 10.0
    read_timeout_s: float = 60.0
    max_retries: int = 4
    backoff_base_s: float = 1.5

    # Delivery window (inclusive local dates, Europe/London).
    delivery_start: date = date(2026, 1, 1)
    delivery_end: date = date(2026, 1, 31)

    # Decision cutoff: PROVISIONAL assumption (EPEX GB day-ahead gate closure), not a confirmed
    # utility-specific deadline. cutoff = (delivery local date - days_before) at cutoff_time local.
    cutoff_time: time = time(9, 20)
    cutoff_days_before: int = 1
    timezone: str = "Europe/London"

    # Which actual half-hours an hourly forecast timestamp t covers:
    #   "start": [t, t+30min]  (hour beginning at t)   <- default assumption
    #   "end":   [t-60, t-30]  (hour ending at t)
    hour_convention: str = "start"

    # Publication windows (WINDFOR is filtered by publishTime, not delivery time).
    publish_lead_in_days: int = 3
    publish_lead_out_days: int = 1
    forecast_chunk_days: int = 3
    actual_chunk_days: int = 10

    min_hour_of_day_samples: int = 10
    error_bin_width_mw: float = 500.0

    data_dir: Path = Path("./data")
    cors_origins: tuple = ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174")
    auto_ingest_on_start: bool = False

    def __post_init__(self):
        if self.hour_convention not in ("start", "end"):
            raise ValueError("HOUR_CONVENTION must be 'start' or 'end'")
        if self.delivery_end < self.delivery_start:
            raise ValueError("DELIVERY_END must be >= DELIVERY_START")

    @property
    def window_start_utc(self) -> pd.Timestamp:
        return pd.Timestamp(self.delivery_start).tz_localize(self.timezone).tz_convert("UTC")

    @property
    def window_end_utc(self) -> pd.Timestamp:
        """Exclusive end: local midnight after the final delivery date (full final day included)."""
        nxt = pd.Timestamp(self.delivery_end) + pd.Timedelta(days=1)
        return nxt.tz_localize(self.timezone).tz_convert("UTC")

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.getenv
        d = cls()
        return cls(
            elexon_base_url=e("ELEXON_BASE_URL", d.elexon_base_url).rstrip("/"),
            connect_timeout_s=float(e("HTTP_CONNECT_TIMEOUT_S", d.connect_timeout_s)),
            read_timeout_s=float(e("HTTP_READ_TIMEOUT_S", d.read_timeout_s)),
            max_retries=int(e("HTTP_MAX_RETRIES", d.max_retries)),
            backoff_base_s=float(e("HTTP_BACKOFF_BASE_S", d.backoff_base_s)),
            delivery_start=date.fromisoformat(e("DELIVERY_START", d.delivery_start.isoformat())),
            delivery_end=date.fromisoformat(e("DELIVERY_END", d.delivery_end.isoformat())),
            cutoff_time=_parse_time(e("CUTOFF_TIME", "09:20")),
            cutoff_days_before=int(e("CUTOFF_DAYS_BEFORE", d.cutoff_days_before)),
            timezone=e("TIMEZONE", d.timezone),
            hour_convention=e("HOUR_CONVENTION", d.hour_convention),
            publish_lead_in_days=int(e("PUBLISH_LEAD_IN_DAYS", d.publish_lead_in_days)),
            publish_lead_out_days=int(e("PUBLISH_LEAD_OUT_DAYS", d.publish_lead_out_days)),
            forecast_chunk_days=int(e("FORECAST_CHUNK_DAYS", d.forecast_chunk_days)),
            actual_chunk_days=int(e("ACTUAL_CHUNK_DAYS", d.actual_chunk_days)),
            min_hour_of_day_samples=int(e("MIN_HOUR_OF_DAY_SAMPLES", d.min_hour_of_day_samples)),
            error_bin_width_mw=float(e("ERROR_BIN_WIDTH_MW", d.error_bin_width_mw)),
            data_dir=Path(e("DATA_DIR", str(d.data_dir))),
            cors_origins=tuple(o.strip() for o in e("CORS_ORIGINS", ",".join(d.cors_origins)).split(",") if o.strip()),
            auto_ingest_on_start=e("AUTO_INGEST_ON_START", "false").lower() in ("1", "true", "yes"),
        )


def configure_logging(level: str | None = None) -> None:
    logging.basicConfig(
        level=getattr(logging, (level or os.getenv("LOG_LEVEL", "INFO")).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
