# WindSight frontend

React + TypeScript dashboard for the existing FastAPI service. It displays forecasts versus actuals, MAE/RMSE/bias/coverage, hourly records, publication revisions, and source data-quality indicators.

## Local development (Windows PowerShell)

Start the backend first; see `../backend/README.md`. Then:

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\windsight\wind-forecast-intelligence\frontend"
npm install
npm run dev
```

Open `http://localhost:5173`. By default, the browser requests `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` in `frontend/.env` only when the API is hosted elsewhere, then restart Vite. No Elexon API key is needed.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite development server |
| `npm run build` | TypeScript check and production bundle |
| `npm run lint` | Oxlint |
| `npm run preview` | Preview the production bundle |

No separate frontend test runner is configured. API data and metrics are never hardcoded in the UI.
