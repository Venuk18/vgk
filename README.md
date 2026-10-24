# WindSight — Wind Forecast Intelligence

**An analytics dashboard for evaluating wind power forecasts against actual generation in Great Britain.**

WindSight is a full-stack data analytics project that helps users explore wind power generation, compare forecast values with actual generation, and understand forecast errors through measurable performance metrics and visualizations.

The project combines a Python FastAPI backend, a React and TypeScript frontend, and energy-generation data to demonstrate data processing, API development, analytics, testing, and cloud deployment.

## Project Overview

Wind power forecasts are important for electricity system planning. Comparing forecasts with observed generation helps reveal where predictions are accurate and where they differ from actual output.

WindSight provides a dashboard for exploring forecast performance over a selected evaluation period.

### Key Features

- **Forecast performance analytics:** Evaluate forecast values against observed generation.
- **Error metrics:** Report Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), and forecast bias.
- **Historical analysis:** Explore the available wind generation and forecast data.
- **Metrics API:** Retrieve aggregated performance results for a selected date range.
- **Forecast and revision endpoints:** Access forecast data and available forecast revisions.
- **Interactive dashboard:** Present analytical results through a React-based web interface.
- **Health monitoring:** Check backend availability and data-loading status.
- **Automated testing:** Validate backend functionality with pytest.
- **Cloud deployment:** Deploy the frontend and backend as separate Vercel projects.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Data processing | Pandas, NumPy |
| API communication | REST, JSON, Fetch API |
| Testing | pytest, HTTPX |
| Version control | Git, GitHub |
| Deployment | Vercel |
| AI-assisted development | ChatGPT, Antigravity |

## Architecture

```text
                 User
                  |
                  v
       React + TypeScript Frontend
                  |
             REST / JSON
                  |
                  v
          FastAPI Backend
                  |
                  v
       Data Processing & Analytics
                  |
                  v
       Forecast and Actual Data
                  |
                  v
        MAE, RMSE and Bias Metrics
                  |
                  v
         Results returned to UI
```

The frontend is responsible for presenting the analytics and requesting data from the backend. FastAPI exposes API endpoints, while the backend processes the available data and provides the results as JSON.

The frontend and backend are deployed separately. Production API requests must use the correct backend URL and be configured to handle routing and cross-origin access appropriately.

## Evaluation Metrics

WindSight uses standard error metrics to evaluate forecast performance.

### 1. Mean Absolute Error (MAE)

MAE measures the average absolute difference between forecast and actual generation.

\[
\mathrm{MAE}=\frac{1}{n}\sum_{i=1}^{n}|F_i-A_i|
\]

### 2. Root Mean Squared Error (RMSE)

RMSE penalizes larger forecast errors more strongly.

\[
\mathrm{RMSE}=\sqrt{\frac{1}{n}\sum_{i=1}^{n}(F_i-A_i)^2}
\]

### 3. Forecast Bias

Bias measures the average signed difference between forecast and actual generation.

\[
\mathrm{Bias}=\frac{1}{n}\sum_{i=1}^{n}(F_i-A_i)
\]

Where:

- \(F_i\) is the forecast generation.
- \(A_i\) is the observed actual generation.
- \(n\) is the number of evaluated observations.

Under this convention, positive bias indicates that forecasts are higher than actual generation on average; negative bias indicates that forecasts are lower.

All metrics depend on the dataset, evaluation period, time alignment, and aggregation methodology.

## Project Structure

```text
wind-forecast-intelligence/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── config.py
│   ├── api/
│   │   └── index.py
│   ├── data/
│   ├── tests/
│   │   └── test_api.py
│   ├── requirements.txt
│   └── vercel.json
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── Dockerfile.backend
├── docker-compose.yml
└── README.md
```

*The tree shows the main project components; additional files may exist in the repository.*

## Getting Started

### Prerequisites

Install the following:

- Python 3.11 or a compatible version supported by the project's dependencies.
- Node.js and npm.
- Git.

### 1. Clone the repository

```bash
git clone https://github.com/Venuk18/vgk.git
cd vgk/wind-forecast-intelligence
```

### 2. Set up the backend

Open a terminal in the project directory.

**Windows PowerShell:**

```powershell
cd backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt
```

Start the FastAPI server:

```powershell
uvicorn app.main:app --reload
```

The local backend should be available at:

- API: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

If PowerShell blocks virtual environment activation, use the Python executable directly from `.venv\Scripts\python.exe` to install dependencies and run the server.

### 3. Set up the frontend

Open another terminal:

```powershell
cd frontend

npm install
```

Create a local environment file named `.env.local` if required by your setup:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

Start the development server:

```powershell
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

**Note:** The API base URL must match the URL construction logic in the frontend API client. Ensure requests resolve to the intended `/api/health`, `/api/summary`, and other API endpoints without duplicating or stripping the `/api` prefix.

## API Endpoints

The backend exposes the following endpoint groups.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Check service health and data-loading status |
| `GET /api/summary` | Retrieve summary analytics |
| `GET /api/metrics` | Retrieve forecast evaluation metrics |
| `GET /api/forecasts` | Retrieve forecast information |
| `GET /api/revisions` | Retrieve available forecast revisions |

Query parameters and response schemas are defined by the backend implementation. Use the interactive Swagger documentation at `/docs` to inspect the current API contract.

## Testing and Build

### Backend tests

From the backend directory:

```powershell
python -m pytest -q
```

During development, the reported test suite reached **47 passing tests**. Run the tests again against the current commit to confirm the latest result.

### Frontend production build

From the frontend directory:

```powershell
npm run build
```

This runs the project's TypeScript and Vite build process.

## Deployment

WindSight uses separate Vercel projects for the frontend and backend.

### Frontend

Configure the frontend project to use the frontend directory as its Root Directory relative to the repository root.

Set the public environment variable:

```dotenv
VITE_API_BASE_URL=https://YOUR-BACKEND-DOMAIN/api
```

Replace the placeholder with the actual deployed backend URL.

### Backend

Configure the backend project to use the backend directory as its Root Directory relative to the repository root. Ensure its Python entrypoint, dependencies, data files, and routing configuration are included in the deployment.

Configure CORS for the intended frontend origin. Avoid exposing credentials or secrets in frontend environment variables.

**Deployment note:** Vercel project settings, environment variables, routing, and deployment protection must agree with the chosen public API architecture. Verify both deployments independently after changing configuration.

## Data and Limitations

WindSight evaluates the forecast and actual generation data available in the repository. The development dataset includes a January 2026 evaluation snapshot.

Important considerations:

- The available evaluation period is limited and should not be interpreted as a complete annual assessment.
- Forecast and actual observations must be aligned correctly by delivery time before comparing them.
- Different time resolutions and aggregation methods can affect the reported metrics.
- National metered wind generation may not represent every source of wind generation, including embedded generation.
- Results depend on data quality, units, and the evaluation methodology.
- Forecast error metrics alone do not establish financial impact or prove that a forecasting system is suitable for operational decisions.

The dashboard is an analytical demonstration, not an operational electricity-market control system.

## AI Tools and Responsible AI Use

AI-assisted development tools were used as productivity aids during the development of WindSight.

### Tools and their roles

**ChatGPT**
- Assisted with debugging and interpreting deployment errors.
- Helped reason about API URL construction, CORS, and frontend/backend integration.
- Supported README drafting and technical documentation.

**Antigravity**
- Assisted with diagnosing deployment and routing issues.
- Proposed fixes for frontend URL construction, backend entrypoints, CORS configuration, and Vercel deployment protection.

**Developer responsibilities**

AI-generated suggestions were treated as proposals rather than automatically trusted solutions. Code, configuration, API behavior, and deployment results should be checked through local builds, automated tests, and production endpoint verification.

AI assistance does not replace understanding of the system, data validation, security review, or developer responsibility for the final implementation.

This section is intended to provide transparent disclosure of AI-assisted development.

## Future Improvements

Potential future enhancements include:

- Expanding evaluation to additional months and historical periods.
- Adding forecast accuracy comparisons across multiple horizons.
- Improving visualizations for error distributions and forecast revisions.
- Adding automated data-quality and time-alignment checks.
- Introducing continuous integration for tests and builds.
- Adding monitoring and more detailed API error reporting.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add tests where appropriate.
4. Run the backend tests and frontend production build.
5. Submit a pull request describing the changes.

## License

No license has been specified in this README. Add a `LICENSE` file and name the selected license here before explicitly permitting reuse or redistribution.

---

**WindSight** — a full-stack wind forecast analytics project combining data engineering, API development, frontend visualization, testing, cloud deployment, and responsible AI-assisted development.
