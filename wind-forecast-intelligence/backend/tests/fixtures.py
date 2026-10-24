"""FIXTURE / TEST DATA ONLY. Synthetic rows shaped like Elexon responses. Never real measurements."""
from __future__ import annotations


def fc(start, publish, gen):
    return {"startTime": start, "publishTime": publish, "generation": gen}


def act(start, gen, fuel="WIND", publish="2026-01-01T01:00:00Z"):
    return {"startTime": start, "publishTime": publish, "settlementDate": start[:10],
            "settlementPeriod": 1, "fuelType": fuel, "generation": gen}
