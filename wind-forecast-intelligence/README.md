# WindSight — UK Wind Forecast Intelligence

Decision-time comparison of the Elexon WINDFOR national wind forecast with FUELHH metered wind for UK delivery dates 1–31 January 2026. The dashboard reports MAE, RMSE, forecast bias, forecast and matched coverage, hourly records, forecast revisions, and data-quality counts from the existing FastAPI service.

## Project layout

- `backend/`: FastAPI API, ingestion pipeline, tests, and raw Elexon cache in `backend/data/`.
- `frontend/`: React + TypeScript + Vite dashboard.
- `docker-compose.yml`: local container deployment (frontend at port 8080, API at port 8000).

The checked-in cache metadata currently reports a complete ingest: 1,488 FUELHH half-hour rows, 20,440 WINDFOR rows, no failed request windows. This describes ingestion completeness only; dashboard accuracy values are computed from aligned eligible observations and should be interpreted with the assumptions and limitations displayed in the app.

## Run locally on Windows PowerShell

Use two terminals from the project root. Existing January data is already cached, so ingestion is not required to start the app.

**Terminal 1 — backend**

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\windsight\wind-forecast-intelligence\backend"
.\.venv\Scripts\Activate.ps1
python -m pytest
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If the virtual environment is missing, create it and install dependencies first:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

**Terminal 2 — frontend**

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\windsight\wind-forecast-intelligence\frontend"
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend calls the same-origin `/api` path. Vite proxies that path to FastAPI on `127.0.0.1:8000` during development, so it works on either port 5173 or 5174 without browser CORS configuration. In Docker, Nginx proxies `/api/` to FastAPI. Set `VITE_API_BASE_URL` only when using a different deployment route. The Elexon Insights API is keyless, so no API secret is required.

Frontend checks:

```powershell
npm run build
npm run lint
```

## Refresh or rebuild the cache

Run explicitly from `backend/`:

```powershell
python -m scripts.ingest
```

That command contacts Elexon and writes the raw cache files under `backend/data/`. `python -m scripts.ingest --rebuild-only` rebuilds the derived in-memory dataset from the current raw files without network access. Preserve `backend/data/raw_actuals.json`, `backend/data/raw_forecasts.json`, and `backend/data/ingest_meta.json` if you need the current snapshot. Do not set `AUTO_INGEST_ON_START=true` in routine deployment unless automatic network ingestion is intended.

## Docker

From the project root, with Docker Desktop running:

```powershell
docker compose up --build -d
docker compose ps
```

Open `http://localhost:8080`; the Nginx frontend proxies `/api/` to FastAPI. The backend remains available at `http://localhost:8000/docs`. Compose mounts `backend/data` into the API container so the current cache is used and persists across container recreation. Stop with `docker compose down` (this keeps the cache); `docker compose down -v` is not needed.

The frontend API URL is a build-time setting. For a deployment behind another domain or reverse proxy, build with an appropriate `VITE_API_BASE_URL` and configure the proxy/API CORS origins accordingly. Use HTTPS at the external ingress. Keep `.env` files and credentials out of images and version control; the current Elexon API needs no credential.

## API and analysis notes

The frontend reads `/api/health`, `/api/summary`, `/api/forecasts`, `/api/metrics`, and `/api/revisions`. The API owns metric calculations and returns missing values as `null`.

- Error is forecast minus actual; positive bias means overforecast.
- Forecast selection uses the latest publication at or before a provisional 09:20 Europe/London cutoff on the prior local day. This is not a confirmed buyer-specific deadline.
- Hourly forecasts are aligned with the mean of the corresponding two FUELHH half-hour averages using the configured hour convention.
- FUELHH represents national metered wind and excludes embedded wind.
- WINDFOR is treated as MW, although its endpoint description does not explicitly state the unit.

These constraints are included in the UI and backend documentation. No demand, price, procurement-cost, or unsupported accuracy claims are made.

## Tests

```powershell
# backend (from backend/)
python -m pytest

# frontend (from frontend/)
npm run build
npm run lint
```

Backend tests use synthetic fixtures and do not make network calls. Frontend currently has build/typecheck and lint scripts; no separate frontend test suite is configured.


