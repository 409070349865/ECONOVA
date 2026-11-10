# ECONOVA

**Economic Intelligence & Research Platform**

ECONOVA is one local-first application with a shared React/FastAPI interface. It uses stored, source-attributed economic observations and explicitly distinguishes provider publication schedules from live market feeds. This repository supports an operational local application, not a fully implemented research-grade production platform.

## Run locally

Requirements: Python 3.11+, Node.js 20+, and npm. No paid service is required for the implemented functionality.

### Backend

PowerShell:

```powershell
Set-Location C:\Users\Atharaw\OneDrive\Desktop\ECONOVA\backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend uses SQLite by default, stored in the backend working directory. When `SECRET_KEY` is not set in single-process local SQLite mode, a random process-local signing key is generated; existing JWTs become invalid after a backend restart. Set a unique secret of at least 32 characters for any shared or multi-process deployment. OpenAPI documentation is at http://localhost:8000/docs.

Register a normal researcher through the sign-in page. Administrator setup is never performed during public registration. To provision or rotate the protected **Atharav | SUPER_ADMIN** account, open another backend terminal and run:

```powershell
$env:ADMIN_EMAIL = Read-Host "Administrator email"
py -m app.create_admin
Remove-Item Env:ADMIN_EMAIL
```

The CLI prompts for a password without echoing it and requires at least 14 characters. It stores only the password hash and records the provisioning event. No default administrator password or token exists in the source.

### Frontend

```powershell
Set-Location C:\Users\Atharaw\OneDrive\Desktop\ECONOVA\frontend
npm install
npm run dev
```

Open http://localhost:5173. Configure `VITE_API_URL` only when the API is hosted somewhere other than `http://localhost:8000/api/v1`.

### Docker Compose (optional)

Set operator-supplied values in the current PowerShell session; do not commit them:

```powershell
$env:POSTGRES_PASSWORD = py -3.13 -c "import secrets; print(secrets.token_urlsafe(32))"
$env:SECRET_KEY = py -3.13 -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose up --build
```

The API uses PostgreSQL in Compose. Provision its administrator separately using the protected CLI inside the running API container:

```powershell
$env:ADMIN_EMAIL = Read-Host "Administrator email"
docker compose exec -e "ADMIN_EMAIL=$env:ADMIN_EMAIL" api python -m app.create_admin
Remove-Item Env:ADMIN_EMAIL
```

The CLI prompts for the password without echoing it. Compose does not create cloud resources or enable paid billing.

## Modules and actual capability status

All modules use the same application shell, authentication system and shared backend routes. Module pages with partial functionality are explicitly limited; a route does not mean every requested feature is complete.

The Overview is a compact economic-intelligence dashboard: indicator cards, sourced trend chart, stored cross-country GDP comparison, evidence-availability notice, report shortcuts, provider sync and quick links to all twelve workspaces. Values are read from stored provider observations; unavailable series remain blank until synced.

| Module | Current state |
|---|---|
| Overview | Available: sourced indicator cards, trend chart, stored country comparison, workspace shortcuts and on-demand World Bank sync |
| Economic Pulse | Partial: World Bank indicator explorer; no complete live pulse suite |
| Global Economy | Partial: country/indicator series explorer; no interactive world map, rankings or multi-country comparison |
| Economic Forecast | Available: ARIMA candidate plus naive fallback, chronological holdout metrics, prediction interval table; annual history required |
| AI Economist | Evidence-unavailable mode; no ungrounded Gemini answers or invented citations are returned |
| PolicyLab | Unavailable: policy document acquisition, extraction and source-grounded analysis are not implemented |
| Scenario Simulator | Available: saved, account-scoped arithmetic percentage sensitivity only; not a calibrated or causal model |
| Trade Intelligence | Partial: World Bank imports/exports and related series; no commodity/partner breakdown workflow |
| Financial Intelligence | Partial: selected World Bank financial indicators; no complete RBI or market feed |
| Research Lab | Unavailable: PDF upload, page extraction, retrieval and literature review are not implemented |
| Data Explorer | Available: supported World Bank catalogue, country/indicator/year filters, observations, CSV/JSON export |
| Development & Human Progress | Partial: selected World Bank social indicators; no regional or complete SDG analytics |
| Insights & Reports | Available: source-attributed CSV/JSON and PDF exports from stored observations; no scheduled briefings or AI reports |

Administration provides backend-protected summary, user role management and an audit log. Data-source administration, system settings, ingestion queue controls, forecast model management and research-document administration are not yet implemented. Public registration creates researcher accounts only. Administrator API access requires the `SUPER_ADMIN` role.

## Data freshness and integrity

- The current external connector uses the free public World Bank Indicators API. Sync occurs only when an authenticated user requests it.
- Indicators are historical and generally annual; publication and revision schedules vary by provider. “Sync” means a provider request, not that a new period is available. The application does not provide tick-level prices, live market quotes or continuous streaming.
- Each stored observation includes its source, country, indicator, unit, reference period and ECONOVA retrieval time. When the provider revises an existing value, ECONOVA updates the stored value and retrieval timestamp; full revision history is not yet retained.
- Empty data remain empty. The UI does not fill economic cards with demo or fabricated statistics. The optional `scripts/seed_demo.py` fixture is synthetic and for demonstrations only.
- RBI, MOSPI, IMF, OECD and UN Comtrade connectors are not verified live integrations in this implementation.

## Security and operations

- Passwords use PBKDF2-SHA256 with 600,000 rounds (legacy bcrypt hashes remain verifiable).
- API operations that create user-specific scenarios, retrieve research responses or change administration data require a bearer token. Role changes and data syncs are audited.
- CORS is restricted to configured/local development origins. API errors avoid returning provider exception strings or credentials.
- Configure PostgreSQL, a private signing key, HTTPS termination, backups, schema migrations, rate limiting, structured monitoring and secret rotation before exposing a deployment to a network. The current SQLite additive migration covers local schema evolution but is not a substitute for Alembic.
- The frontend stores its bearer token in browser local storage. Deployments with stronger browser threat requirements should use an HTTPS, HttpOnly cookie session design and CSRF controls.
- Gemini is not used to generate unsupported economic facts. The document retrieval and page-citation workflow needed for grounded synthesis remains unavailable, even if a key is configured.

## Validation

From the repository root:

```powershell
Set-Location frontend
npm run build
Set-Location ..
$env:PYTHONPATH = "backend"
py -3.13 -m pytest backend/tests -q
```

## Project layout

`frontend/` contains the ECONOVA React/TypeScript application; `backend/app/` contains the FastAPI API, authentication, SQLAlchemy models and World Bank/forecast/sensitivity services. `economic_engine/`, `forecasting/`, `simulation/`, `ai_engine/` and `reports/` contain supporting components and extension points. See `docs/architecture.md`, `docs/api_documentation.md` and `docs/database_design.md` for design context.
