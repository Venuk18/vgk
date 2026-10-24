# WindSight FastAPI backend

This backend serves Elexon WINDFOR decision-time forecasts against FUELHH metered wind for 1–31 January 2026. The project root README contains Windows, Docker, and dashboard run instructions.

## Setup

From this directory in Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pytest
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The current raw cache is in `data/`; startup loads it without contacting Elexon. To refresh it intentionally, run `python -m scripts.ingest`. To rebuild from the current cache without network access, use `python -m scripts.ingest --rebuild-only`.

## API

- `/api/health`: liveness and cache state.
- `/api/summary`: window, assumptions, headline metrics, data-quality counts, ingest metadata, limitations.
- `/api/forecasts?date=2026-01-15`: hourly rows and original half-hour actuals for a local delivery date.
- `/api/metrics?start_date=2026-01-01&end_date=2026-01-31`: metrics and error breakdowns.
- `/api/revisions?delivery_start=2026-01-01T06:00:00Z`: publication history for one delivery hour.

## Interpretation

Error is forecast minus actual. Coverage uses the expected hourly grid. The 09:20 Europe/London D-1 cutoff is a provisional proxy, not a confirmed utility-specific deadline. Hourly actuals use the configured pair of FUELHH half-hours; embedded wind is excluded. WINDFOR is treated as MW though the endpoint description does not explicitly state its unit. The dashboard surfaces these limitations and makes no unsupported accuracy or commercial claims.
