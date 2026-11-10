import asyncio
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Country, DataSource, Indicator, Observation, User
from app.security import hash_password


@pytest.fixture
def client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    test_sessions = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = test_sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, test_sessions
    app.dependency_overrides.clear()
    test_engine.dispose()


def register(client: TestClient, email: str) -> str:
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "researcher-password-123"})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_admin_routes_require_super_admin(client):
    test_client, _ = client
    token = register(test_client, "researcher@example.com")
    response = test_client.get("/api/v1/admin/summary", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_role_changes_are_audited(client):
    test_client, sessions = client
    db = sessions()
    admin = User(
        email="admin@example.com",
        password_hash=hash_password("very-long-admin-password-123"),
        role="SUPER_ADMIN",
        display_name="Atharav",
    )
    db.add(admin)
    db.commit()
    admin_id = admin.id
    db.close()
    token = test_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "very-long-admin-password-123"},
    ).json()["access_token"]
    user_token = register(test_client, "analyst@example.com")
    user_id = test_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"}).json()["id"]

    response = test_client.patch(
        f"/api/v1/admin/users/{user_id}/role",
        json={"role": "analyst"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "analyst"
    audit = test_client.get("/api/v1/admin/audit", headers={"Authorization": f"Bearer {token}"}).json()
    assert any(item["action"] == "admin.user.role_changed" and item["target"] == str(user_id) for item in audit)
    assert test_client.get("/api/v1/admin/summary", headers={"Authorization": f"Bearer {token}"}).json()["users"] == 2
    assert admin_id > 0


def test_scenarios_are_private_to_their_owner(client):
    test_client, _ = client
    first_token = register(test_client, "first@example.com")
    second_token = register(test_client, "second@example.com")
    created = test_client.post(
        "/api/v1/scenarios",
        json={
            "name": "Transparent sensitivity",
            "variable": "GDP growth",
            "baseline_value": 2.5,
            "shock_percent": 5,
            "assumptions": "Illustrative arithmetic only",
        },
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert created.status_code == 200
    assert test_client.get("/api/v1/scenarios", headers={"Authorization": f"Bearer {first_token}"}).json()
    assert test_client.get("/api/v1/scenarios", headers={"Authorization": f"Bearer {second_token}"}).json() == []


def test_invalid_world_bank_codes_are_rejected_before_network_access():
    from app.services.world_bank import fetch_series

    with pytest.raises(ValueError):
        asyncio.run(fetch_series("../IND", "NY.GDP.MKTP.KD.ZG"))
    with pytest.raises(ValueError):
        asyncio.run(fetch_series("IND", "invalid/code"))


def test_module_registry_exposes_all_twelve_capability_states(client):
    test_client, _ = client
    response = test_client.get("/api/v1/modules")
    assert response.status_code == 200
    modules = response.json()
    assert len(modules) == 12
    assert {item["status"] for item in modules} == {"available", "partial", "unavailable"}


def test_research_assistant_does_not_invent_claims_without_evidence():
    from app.services.research import answer_question

    response = asyncio.run(answer_question("What is the current inflation rate?"))
    assert response["mode"] == "evidence-unavailable"
    assert response["citations"] == []
    assert "No economic statistics" in response["limitations"][1]


def test_observation_metadata_forecast_and_pdf_report(client):
    test_client, sessions = client
    db = sessions()
    country = Country(iso3="IND", name="India", region="South Asia")
    indicator = Indicator(code="NY.GDP.MKTP.KD.ZG", name="GDP growth", unit="%", frequency="annual")
    source = DataSource(provider="World Bank", dataset_code="WDI", terms_url="https://data.worldbank.org/")
    db.add_all([country, indicator, source])
    db.flush()
    for index in range(20):
        db.add(
            Observation(
                country_id=country.id,
                indicator_id=indicator.id,
                source_id=source.id,
                period=str(2000 + index),
                value=2.0 + index * 0.1,
                unit="%",
                retrieved_at=datetime(2026, 1, 1),
            )
        )
    db.commit()
    db.close()

    observations = test_client.get("/api/v1/observations", params={"country": "IND", "indicator": "NY.GDP.MKTP.KD.ZG"})
    assert observations.status_code == 200
    assert observations.json()["source"] == "World Bank"
    assert observations.json()["source_url"] == "https://data.worldbank.org/"
    assert observations.json()["count"] == 20

    token = register(test_client, "reporter@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    forecast = test_client.post(
        "/api/v1/forecasts",
        json={"country": "IND", "indicator": "NY.GDP.MKTP.KD.ZG", "horizon": 2, "model": "naive"},
        headers=headers,
    )
    assert forecast.status_code == 200
    assert len(forecast.json()["forecast"]) == 2
    assert forecast.json()["model"] == "naive"
    assert forecast.json()["forecast"][0]["value"] == pytest.approx(3.9)
    assert "not probabilistic" in forecast.json()["warning"]
    pdf = test_client.get(
        "/api/v1/reports/observations.pdf",
        params={"country": "IND", "indicator": "NY.GDP.MKTP.KD.ZG", "start": 2000, "end": 2019},
        headers=headers,
    )
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
