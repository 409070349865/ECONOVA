# ECONOVA API documentation

Interactive OpenAPI documentation is available at `/docs`.

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| GET | `/health` | Public | API and database health |
| POST | `/api/v1/auth/register` | Public | Create researcher account only |
| POST | `/api/v1/auth/login` | Public | Obtain bearer token |
| GET | `/api/v1/auth/me` | Bearer token | Current account and role |
| GET | `/api/v1/modules` | Public | Twelve module capability/status catalogue |
| GET | `/api/v1/countries` | Public | Countries currently in observation store |
| GET | `/api/v1/indicators` | Public | Supported World Bank indicator catalogue |
| GET | `/api/v1/observations` | Public | Paginated source-attributed historical observations |
| POST | `/api/v1/ingestion/world-bank` | Bearer token | Fetch and persist a public World Bank series |
| POST | `/api/v1/forecasts` | Bearer token | ARIMA forecast or explicit naive baseline |
| POST | `/api/v1/scenarios` | Bearer token | Run and save account-scoped arithmetic sensitivity |
| GET | `/api/v1/scenarios` | Bearer token | List only the caller's saved scenarios |
| POST | `/api/v1/research/ask` | Bearer token | Evidence availability response; no ungrounded AI answer |
| GET | `/api/v1/overview` | Public | Stored-data aggregate counts |
| GET | `/api/v1/reports/observations.pdf` | Bearer token | PDF export of stored observations |
| GET | `/api/v1/admin/summary` | `SUPER_ADMIN` | Platform and data freshness summary |
| GET | `/api/v1/admin/users` | `SUPER_ADMIN` | Paginated user and role list |
| PATCH | `/api/v1/admin/users/{user_id}/role` | `SUPER_ADMIN` | Assign supported non-admin roles; protect final administrator |
| GET | `/api/v1/admin/audit` | `SUPER_ADMIN` | Recent role-change and ingestion audit events |

Observation queries accept `country`, `indicator`, `start`, `end`, `limit` and `offset`. Provider retrieval timestamps are not publication dates. World Bank data are periodic historical indicators and are not real-time market feeds. Most specialized module APIs remain unimplemented; `/api/v1/modules` identifies their actual capability states.
