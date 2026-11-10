# Database design

Tables: users, countries, indicators, data_sources, observations, scenarios and audit_events. Observation records retain source, unit, reference period and ECONOVA retrieval time; the unique key is country/indicator/source/period. Scenario rows are scoped by owner. User rows store display name and role. Audit events record actor, action, target and details.

Local startup creates missing tables and applies a small additive migration for the existing users/scenarios tables. Provider revisions currently replace the latest stored value and refresh its retrieval time; historical revision snapshots are not retained. Production schema evolution should use reviewed Alembic migrations before deployment.
