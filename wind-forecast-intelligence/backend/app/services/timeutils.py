"""Timezone helpers. All internal timestamps are tz-aware UTC; local time is used only to define
delivery dates and the purchasing cutoff, so DST is handled by zoneinfo, not by hand."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pandas as pd


def local_day_bounds_utc(d: date, tz: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of a local calendar day in UTC (23h/25h long on DST change days)."""
    start = pd.Timestamp(d).tz_localize(tz).tz_convert("UTC")
    end = (pd.Timestamp(d) + pd.Timedelta(days=1)).tz_localize(tz).tz_convert("UTC")
    return start, end


def cutoff_for_local_date(delivery_date: date, tz: str, cutoff_time: time, days_before: int) -> pd.Timestamp:
    """Decision deadline (UTC) for a delivery date: (date - days_before) at cutoff_time local.

    Edge cases for a general implementation: if the local wall time is ambiguous (clocks going back)
    the EARLIER occurrence is used (conservative: less information); if it does not exist (clocks
    going forward) it is shifted forward. 09:20 is neither in the UK, so this never bites by default.
    """
    d = delivery_date - timedelta(days=days_before)
    naive = pd.Timestamp(datetime.combine(d, cutoff_time))
    return naive.tz_localize(tz, ambiguous=True, nonexistent="shift_forward").tz_convert("UTC")


def cutoffs_for_starts(starts: pd.Series, tz: str, cutoff_time: time, days_before: int) -> pd.Series:
    """Vectorised cutoff (UTC) per delivery start timestamp (UTC)."""
    if starts.empty:
        return pd.Series(pd.DatetimeIndex([], tz="UTC"), index=starts.index)
    local_dates = starts.dt.tz_convert(tz).dt.date
    mapping = {d: cutoff_for_local_date(d, tz, cutoff_time, days_before) for d in local_dates.unique()}
    return pd.to_datetime(local_dates.map(mapping), utc=True)
