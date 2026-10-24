"""JSON-safe conversion: UTC ISO-8601 'Z' timestamps, NaN/NaT/inf -> null, numpy -> python."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd


def clean(v):
    if v is pd.NaT or v is None:
        return None
    if isinstance(v, pd.Timestamp):
        ts = v.tz_localize("UTC") if v.tzinfo is None else v.tz_convert("UTC")
        return ts.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(v, dict):
        return {str(k): clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x) for x in v]
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def records(df: pd.DataFrame) -> list[dict]:
    return [clean(r) for r in df.to_dict(orient="records")]
