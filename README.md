# ECONOVA

### Economic Intelligence & Research Platform

Explore sourced economic indicators, compare countries, review research, run forecasts, and model transparent scenarios in one workspace.

**Live deployment:** [economy-ath.onrender.com](https://economy-ath.onrender.com/) | **API documentation:** [OpenAPI / Swagger](https://economy-ath.onrender.com/docs)

---

## Dashboard preview

<p align="center">
  <img src="assets/econova-dashboard-preview.png" alt="ECONOVA economic intelligence dashboard preview" width="100%">
</p>

<p align="center"><em>Interface preview. Values and timestamps shown in the image are illustrative; use the application and its cited sources for current observations.</em></p>

The dashboard brings together country and year filters, stored indicator series, module navigation, research tools, and export shortcuts. Missing observations are shown as unavailable rather than silently replaced with estimates.

---

## What ECONOVA includes

- **Economic indicators:** Browse World Bank indicators and inspect stored observations with their country, period, unit, source, and retrieval time.
- **Country comparisons:** Explore country-level series and compare the observations currently available in the workspace.
- **Forecasting:** Evaluate an ARIMA candidate against a naive baseline using a chronological holdout; review metrics, forecast values, and uncertainty intervals.
- **Scenario analysis:** Apply an explicit percentage shock to a baseline and review the resulting arithmetic sensitivity with its assumptions.
- **Research workspace:** Analyze supported document and data uploads. Gemini-backed economics responses are optional and require a backend API key.
- **Policy and research libraries:** Browse curated policy and research material with source links and stated limitations.
- **Trade and financial views:** Explore released partner-trade data and market-history charts. Provider availability, release timing, and market-data delays can vary.
- **Exports and administration:** Export observation data and PDFs; protected administrator routes provide user, audit, and data-freshness summaries.

The module catalogue reports current capability status from **GET /api/v1/modules**. Pulse, Global, and Insights & Reports are marked partial in the current API catalogue; other modules may still depend on provider availability or optional configuration.

---

## Architecture

### Application and data services

The browser downloads the React application from Vercel and calls the FastAPI service over HTTPS. The API reads and writes through SQLAlchemy. PostgreSQL is used for hosted deployments; SQLite is the local-development default.

~~~mermaid
flowchart LR
    User[Researcher] --> Browser[Web browser]
    Browser -->|Static application files| Vercel[Vercel<br/>React + TypeScript + Vite]
    Browser -->|HTTPS REST requests<br/>/api/v1| API[Render Web Service<br/>FastAPI]
    API --> ORM[SQLAlchemy models and services]
    ORM --> PG[(PostgreSQL<br/>hosted)]
    ORM -. local development .-> SQLite[(SQLite)]
    API --> WB[World Bank API]
    API --> OECD[OECD data]
    API --> UN[UN Comtrade]
    API --> Yahoo[Yahoo Finance chart data]
    API -. optional .-> Gemini[Gemini API]
~~~

### Observation ingestion flow

Observation requests first use stored data. If a requested series has no stored rows, the API attempts to fetch it from the configured provider, validates and stores the returned observations, then responds to the browser.

~~~mermaid
flowchart TD
    A[User selects country, indicator, and years] --> B[React client calls observations API]
    B --> C[FastAPI validates request]
    C --> D{Matching observations stored?}
    D -- Yes --> E[Read source-attributed records]
    D -- No --> F[Fetch series from data provider]
    F --> G[Normalize country, period, value, and unit]
    G --> H[Persist observations and provider metadata]
    H --> E
    E --> I[Return observations and retrieval details]
    I --> J[Render chart or table]
~~~

### Forecasting and scenario flow

Forecasting uses a time-ordered historical series. Scenario simulation is a separate, transparent arithmetic sensitivity calculation; it does not claim to predict a full economic system.

~~~mermaid
flowchart LR
    subgraph Forecast
        F1[Historical observations] --> F2[Chronological preparation and split]
        F2 --> F3[Naive baseline and ARIMA candidate]
        F3 --> F4[Holdout evaluation]
        F4 --> F5[Forecast, metrics, and intervals]
    end

    subgraph Scenario
        S1[Baseline value] --> S3[Apply explicit percentage shock]
        S2[Shock and assumptions] --> S3
        S3 --> S4[Scenario value and change]
        S4 --> S5[Return result; save for signed-in owner]
    end
~~~

### Hosted deployment

The repository supports a split deployment with the frontend on Vercel and the Docker-based API on Render. The Dockerfile also builds the frontend, so a single Docker service can serve the built UI and API together when desired.

~~~mermaid
flowchart LR
    GitHub[GitHub repository] -->|frontend directory| Vercel[Vercel deployment]
    GitHub -->|root Dockerfile| Render[Render API service]
    Vercel -->|VITE_API_URL| Browser[Visitor browser]
    Browser -->|API requests| Render
    Render --> Postgres[(Render PostgreSQL)]
    Render --> Providers[External data providers]
~~~

---

## Modules

| Module | Main capabilities | Catalogue status |
|---|---|---|
| **ECONOVA PULSE** | Macroeconomic indicator exploration | Partial |
| **ECONOVA GLOBAL** | Country-level series and comparisons | Partial |
| **ECONOVA FORECAST** | ARIMA candidate, naive baseline, holdout metrics, and intervals | Available |
| **ECONOVA AI ECONOMIST** | Economics questions, observation context, and document/data analysis | Available; Gemini key optional |
| **ECONOVA POLICYLAB** | Curated Indian policy and official-statistics content | Available |
| **ECONOVA SIMULATOR** | Arithmetic sensitivity scenarios and saved runs | Available |
| **ECONOVA TRADE** | Released trade data and partner charts | Available |
| **ECONOVA FINANCE** | Market history, technical summaries, and approximate ranges | Available |
| **ECONOVA RESEARCH LAB** | Source-linked studies, findings, and limitations | Available |
| **ECONOVA DATA EXPLORER** | Indicator catalogue, observations, and exports | Available |
| **ECONOVA DEVELOPMENT** | Poverty, labor, education, health, and related series | Available |
| **ECONOVA INSIGHTS & REPORTS** | Observation exports and PDF reports | Partial |

---

## Data and research notes

- World Bank indicators are periodic historical releases, not real-time market feeds.
- Financial charts use Yahoo Finance chart data for convenience; availability, quote delay, and exchange coverage can vary.
- Trade views use release-based UN Comtrade data, not streaming trade activity.
- Some indicators or countries may have no observations for the selected period. A missing value does not mean zero.
- Forecasts are conditional model outputs. Review their model, evaluation results, intervals, and assumptions.
- Scenario results apply the supplied shock arithmetically; they are not general-equilibrium estimates or policy advice.
- Gemini-assisted answers are enabled only when **GEMINI_API_KEY** is configured on the backend. Without it, file analysis and evidence-availability responses remain available, but provider-backed AI synthesis is not.
- Research files expire automatically. Do not upload sensitive personal or confidential material.

---

## Technology

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, Axios, Recharts, Lucide |
| API | Python 3.11, FastAPI, Pydantic Settings, SQLAlchemy |
| Data and analysis | Pandas, NumPy, Statsmodels, scikit-learn, Plotly, Matplotlib |
| Persistence | SQLite for local development; PostgreSQL for shared deployments |
| Hosting | Vercel for the frontend; Docker-compatible hosting such as Render for the API |
| External services | World Bank, OECD series, UN Comtrade, Yahoo Finance chart endpoint, optional Gemini |

---

## Repository layout

~~~text
ECONOVA/
├── backend/
│   └── app/
│       ├── api/v1/          # Versioned API routes
│       ├── core/            # Application settings
│       ├── services/        # Data providers, analysis, and research services
│       ├── database.py      # SQLAlchemy engine and schema setup
│       ├── models.py        # Database models
│       └── main.py          # FastAPI application and health endpoint
├── frontend/
│   ├── src/                 # React pages, components, API client, and styles
│   ├── public/              # Public static assets
│   └── vercel.json          # SPA route fallback for Vercel
├── ai_engine/               # AI-related package
├── economic_engine/         # Economic analysis package
├── forecasting/             # Forecasting helpers and evaluation
├── simulation/              # Scenario simulation helpers
├── reports/                 # Report and export utilities
├── assets/                  # Dashboard preview and project assets
├── docs/                    # Architecture, API, database, and diagrams
├── datasets/                # Project data files
├── scripts/                 # Utility scripts
├── Dockerfile               # Build frontend and package the API
├── docker-compose.yml       # Local API + PostgreSQL stack
└── .env.example             # Safe environment-variable template
~~~

---

## Run locally

### Prerequisites

- Git
- Node.js and npm
- Python 3.11
- Optional: Docker Desktop with Docker Compose

### 1. Clone and configure

~~~powershell
git clone https://github.com/409070349865/ECONOVA.git
cd ECONOVA
Copy-Item .env.example .env
~~~

The default backend database is SQLite, so a database server is not needed for a basic local run. Keep real secrets in your local environment and never commit **.env**.

### 2. Install and start the backend

In a PowerShell terminal at the repository root:

~~~powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
~~~

The API is available at **http://127.0.0.1:8000**. Interactive documentation is at **/docs**.

### 3. Install and start the frontend

In a second terminal:

~~~powershell
cd frontend
npm ci
npm run dev
~~~

Open **http://127.0.0.1:5173**. During development, Vite proxies **/api** requests to the backend on port 8000.

### Build a production frontend locally

From the frontend directory:

~~~powershell
npm ci
npm run build
~~~

The generated site is written to **frontend/dist**.

### Start the Docker Compose stack

Set a PostgreSQL password and a unique secret key in the shell or the root **.env** file, then run:

~~~powershell
docker compose up --build -d
~~~

The combined app is available at **http://localhost:8000**. Check **/health** for API and database health. Docker Compose keeps PostgreSQL data in a named volume.

---

## Configuration

The backend reads environment variables from the process environment and the repository's local **.env** file. Vite reads **VITE_API_URL** at build time; Vercel values should be configured in the Vercel project settings.

| Variable | Used by | Purpose |
|---|---|---|
| **DATABASE_URL** | Backend | SQLAlchemy database URL. Defaults to local SQLite. Use PostgreSQL for a multi-instance or hosted service. |
| **SECRET_KEY** | Backend | Signs authentication tokens. Set a unique value of at least 32 characters for shared deployments. |
| **FRONTEND_ORIGIN** | Backend | Trusted frontend origin for CORS, e.g. the deployed Vercel origin. |
| **GEMINI_API_KEY** | Backend | Optional key for Gemini-backed research responses. |
| **GEMINI_MODEL** | Backend | Gemini model identifier; defaults to the value in the settings module. |
| **PROVIDER_HTTP_LOCAL_ADDRESS** | Backend | Local address for outbound provider requests; defaults to IPv4. |
| **VITE_API_URL** | Frontend | API base URL. For split hosting, use the Render API URL followed by **/api/v1**. |
| **POSTGRES_PASSWORD** | Docker Compose | Local Compose database password. |

Any variable beginning with **VITE_** is included in the frontend build and must not contain secrets.

---

## API overview

The full endpoint list is in [docs/api_documentation.md](docs/api_documentation.md). Common endpoints include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | **/health** | Check API and database health |
| GET | **/api/v1/modules** | Report module capability status |
| GET | **/api/v1/overview** | Return stored-data summary counts |
| GET | **/api/v1/observations** | Query source-attributed observations |
| POST | **/api/v1/ingestion/indicators** | Fetch and persist a supported indicator series |
| POST | **/api/v1/forecasts** | Produce a forecast from an available series |
| POST | **/api/v1/scenarios** | Calculate a sensitivity scenario |
| POST | **/api/v1/research/ask** | Return an evidence-based research response |
| GET | **/api/v1/reports/observations.pdf** | Download a PDF report for observations |

Most API routes are prefixed with **/api/v1**. Protected routes use a bearer token from login. The interactive OpenAPI page is available at **/docs**.

---

## Deploy

### Frontend on Vercel

1. Push the project changes to GitHub and import the repository into Vercel.
2. Set **Root Directory** to **frontend** and use the Vite framework preset.
3. Use **npm run build** as the build command and **dist** as the output directory.
4. Add **VITE_API_URL** for the Production environment. Set it to **https://YOUR-RENDER-SERVICE.onrender.com/api/v1**.
5. Deploy. The included **frontend/vercel.json** sends client-side routes back to the SPA entry point.

### API on Render

1. Create a PostgreSQL database and a Docker Web Service from this repository in the same region.
2. Use the repository root as the service root and **./Dockerfile** as the Dockerfile.
3. Set **DATABASE_URL** to the database's internal connection string.
4. Set **SECRET_KEY** to a unique random value of at least 32 characters.
5. Set **FRONTEND_ORIGIN** to the exact Vercel site origin, with no path.
6. Optionally set **GEMINI_API_KEY** to enable Gemini-backed responses.
7. Set the health check path to **/health** and deploy.

After either platform environment variable changes, redeploy so the new value is used. Do not put database credentials or signing keys in Vercel variables or in Git.

---

## Security and administration

- Passwords are hashed; login returns a bearer token used by protected API routes.
- Administrator operations require the **SUPER_ADMIN** role. There is no default administrator account.
- The repository includes **backend/app/create_admin.py** for explicitly provisioning or rotating the administrator from a trusted backend environment. It requires an administrator email and a strong password.
- Keep **.env**, database URLs, signing keys, and provider keys private.
- Configure CORS to the exact frontend origin used by the deployment.

---

## Project documentation

- [Architecture notes](docs/architecture.md)
- [API documentation](docs/api_documentation.md)
- [Database design](docs/database_design.md)
- [Data ingestion diagram](docs/diagrams/data_pipeline.mmd)
- [Forecasting diagram](docs/diagrams/forecast_pipeline.mmd)
- [Scenario diagram](docs/diagrams/scenario_pipeline.mmd)

---

## License

See [LICENSE](LICENSE).
