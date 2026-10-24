"""WindSight API. Run: uvicorn app.main:app --reload   (from the backend/ directory)"""
from __future__ import annotations

import datetime as dt
import logging
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, configure_logging
from app.serialization import clean, records
from app.services.accuracy_metrics import (compute_metrics, daily_breakdown, error_distribution,
                                           hour_of_day_breakdown)
from app.services.repository import DataRepository, DataUnavailable
from app.services.revision_analysis import build_revisions
from app.services.timeutils import local_day_bounds_utc

log = logging.getLogger("windsight")
VERSION = "0.2.0"
HOURLY_COLS = ["start_time", "cutoff_time", "forecast_publish_time", "forecast_mw", "actual_mw",
               "error_mw", "abs_error_mw", "status", "eligible_vintages", "actual_slots"]


def _bad(status: int, code: str, message: str):
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def create_app(settings: Settings | None = None, repo: DataRepository | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    repo = repo or DataRepository(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:  # warm the in-memory cache from disk (or Elexon if AUTO_INGEST_ON_START=true)
            if repo.has_cache() or settings.auto_ingest_on_start:
                repo.get_dataset()
        except Exception as exc:  # never block startup; endpoints report 503 with a clear message
            log.error("Startup data load failed: %s", exc)
        yield

    app = FastAPI(title="WindSight API", version=VERSION, lifespan=lifespan,
                  description="Decision-time UK wind forecast accuracy (Elexon WINDFOR vs FUELHH).")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DataUnavailable)
    async def _unavailable(_: Request, exc: DataUnavailable):
        return JSONResponse(status_code=503, content={"detail": {"code": "data_unavailable", "message": str(exc)}})

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        log.exception("Unhandled error")  # details stay in logs, not in the response
        return JSONResponse(status_code=500, content={"detail": {"code": "internal_error",
                                                                 "message": "Unexpected server error."}})

    def in_window(d: dt.date, name: str) -> None:
        if not (settings.delivery_start <= d <= settings.delivery_end):
            raise _bad(422, "date_out_of_range",
                       f"{name}={d} is outside the supported delivery window "
                       f"{settings.delivery_start}..{settings.delivery_end}.")

    def slice_hourly(ds, start: dt.date, end: dt.date) -> pd.DataFrame:
        lo, _ = local_day_bounds_utc(start, settings.timezone)
        _, hi = local_day_bounds_utc(end, settings.timezone)
        h = ds.hourly
        return h[(h["start_time"] >= lo) & (h["start_time"] < hi)]

    @app.get("/health", include_in_schema=False)
    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": VERSION, "data_loaded": repo.loaded, "cache_present": repo.has_cache()}

    @app.get("/summary", include_in_schema=False)
    @app.get("/api/summary")
    def summary():
        ds = repo.get_dataset()
        m = compute_metrics(ds.hourly)
        meta = ds.ingest_meta
        limitations = [
            "Cutoff is a provisional assumption (EPEX GB day-ahead gate closure 09:20 Europe/London on D-1), "
            "not a confirmed utility-specific deadline.",
            "WINDFOR is hourly and FUELHH is half-hourly: hourly actual = mean of the two half-hour averages.",
            "FUELHH is national metered wind; embedded wind is not included.",
            "WINDFOR unit is not stated in the endpoint text and is treated as MW (same as FUELHH).",
        ]
        if meta and not meta.get("complete", True):
            limitations.append(f"Ingestion was PARTIAL: {len(meta.get('failed_windows', []))} request window(s) failed.")
        if m["forecast_coverage_pct"] is not None and m["forecast_coverage_pct"] < 100:
            limitations.append(f"Forecast coverage is {m['forecast_coverage_pct']:.1f}% of expected hourly periods.")
        return clean({
            "delivery_window": {"start": settings.delivery_start.isoformat(), "end": settings.delivery_end.isoformat(),
                                "timezone": settings.timezone},
            "assumptions": {"cutoff_local_time": settings.cutoff_time.strftime("%H:%M"),
                            "cutoff_days_before_delivery": settings.cutoff_days_before,
                            "hour_convention": settings.hour_convention, "units": "MW",
                            "resolution": "hourly (forecast-aligned)"},
            "metrics": m, "data_quality": ds.quality, "ingest": meta, "limitations": limitations,
        })

    @app.get("/api/forecasts")
    def forecasts(date: dt.date = Query(..., description="Local delivery date, e.g. 2026-01-15")):
        in_window(date, "date")
        ds = repo.get_dataset()
        day = slice_hourly(ds, date, date)
        lo, hi = local_day_bounds_utc(date, settings.timezone)
        a = ds.actuals_half_hourly
        a = a[(a["start_time"] >= lo) & (a["start_time"] < hi)]
        return clean({"date": date.isoformat(), "units": "MW", "bias_definition": "forecast - actual",
                      "hourly": records(day[HOURLY_COLS]),
                      "actuals_half_hourly": records(a[["start_time", "generation_mw"]]),
                      "metrics": compute_metrics(day)})

    @app.get("/api/metrics")
    def metrics(start_date: dt.date = Query(...), end_date: dt.date = Query(...)):
        in_window(start_date, "start_date")
        in_window(end_date, "end_date")
        if end_date < start_date:
            raise _bad(422, "invalid_range", "end_date must be on or after start_date.")
        ds = repo.get_dataset()
        sub = slice_hourly(ds, start_date, end_date)
        return clean({"start_date": start_date.isoformat(), "end_date": end_date.isoformat(),
                      "metrics": compute_metrics(sub),
                      "daily": daily_breakdown(sub, settings.timezone),
                      "hour_of_day": hour_of_day_breakdown(sub, settings.timezone, settings.min_hour_of_day_samples),
                      "error_distribution": error_distribution(sub, settings.error_bin_width_mw)})

    @app.get("/api/revisions")
    def revisions(delivery_start: dt.datetime = Query(..., description="Hourly delivery start, ISO-8601 (UTC if no offset)")):
        ts = pd.Timestamp(delivery_start)
        ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
        if ts.minute != 0 or ts.second != 0 or ts.microsecond != 0:
            raise _bad(422, "not_hourly", "delivery_start must fall on an hour boundary (forecasts are hourly).")
        if not (settings.window_start_utc <= ts < settings.window_end_utc):
            raise _bad(422, "date_out_of_range", "delivery_start is outside the supported delivery window.")
        ds = repo.get_dataset()
        row = ds.hourly[ds.hourly["start_time"] == ts]
        sel_pub = row["forecast_publish_time"].iloc[0] if len(row) and pd.notna(row["forecast_publish_time"].iloc[0]) else None
        actual = row["actual_mw"].iloc[0] if len(row) else None
        out = build_revisions(ds.forecasts_all, ts, settings.timezone, settings.cutoff_time,
                              settings.cutoff_days_before, sel_pub, None if actual is None or pd.isna(actual) else float(actual))
        out["units"] = "MW"
        return clean(out)

    return app


app = create_app()

