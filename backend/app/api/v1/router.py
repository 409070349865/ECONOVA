from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import User, Country, Indicator, Observation, DataSource, Scenario, AuditEvent
from app.schemas import Credentials, Token, ScenarioInput, ResearchQuestion, ForecastInput, RoleUpdate
from app.security import hash_password, verify_password, create_token, current_user, require_admin
from app.services.world_bank import ingest, INDICATORS
from app.services.forecasting import forecast_series
from app.services.scenarios import run_scenario
from app.services.research import answer_question
from app.core.config import settings

router = APIRouter(prefix="/api/v1")

@router.post("/auth/register", response_model=Token)
def register(payload: Credentials, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "Email already registered")
    user = User(email=email, password_hash=hash_password(payload.password), display_name="Researcher")
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already registered")
    return {"access_token": create_token(user.id)}

@router.post("/auth/login", response_model=Token)
def login(payload: Credentials, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=str(payload.email).strip().lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": create_token(user.id)}

@router.get("/auth/me")
def me(user=Depends(current_user)):
    return {"id": user.id, "email": user.email, "role": user.role, "display_name": user.display_name or "Researcher"}

@router.get("/countries")
def countries(db: Session = Depends(get_db)):
    return [{"iso3": c.iso3, "name": c.name, "region": c.region} for c in db.query(Country).order_by(Country.name).all()]

@router.get("/indicators")
def indicators(db: Session = Depends(get_db)):
    stored = {item.code: item for item in db.query(Indicator).all()}
    return [
        {
            "code": code,
            "name": stored[code].name if code in stored else details[0],
            "unit": stored[code].unit if code in stored else details[1],
            "frequency": stored[code].frequency if code in stored else "annual",
            "definition": stored[code].definition if code in stored else details[2],
        }
        for code, details in sorted(INDICATORS.items())
    ]

@router.get("/modules")
def modules():
    return [
        {"id": "pulse", "name": "ECONOVA PULSE", "status": "partial", "available": ["World Bank indicator explorer"]},
        {"id": "global", "name": "ECONOVA GLOBAL", "status": "partial", "available": ["Country-level World Bank series"]},
        {"id": "forecast", "name": "ECONOVA FORECAST", "status": "available", "available": ["ARIMA candidate", "Naive baseline", "Holdout metrics", "Prediction intervals"]},
        {"id": "ai-economist", "name": "ECONOVA AI ECONOMIST", "status": "unavailable", "available": ["Evidence availability response only"]},
        {"id": "policylab", "name": "ECONOVA POLICYLAB", "status": "unavailable", "available": []},
        {"id": "simulator", "name": "ECONOVA SIMULATOR", "status": "available", "available": ["Account-scoped arithmetic sensitivity"]},
        {"id": "trade", "name": "ECONOVA TRADE", "status": "partial", "available": ["World Bank exports and imports indicators"]},
        {"id": "finance", "name": "ECONOVA FINANCE", "status": "partial", "available": ["Selected World Bank financial indicators"]},
        {"id": "research-lab", "name": "ECONOVA RESEARCH LAB", "status": "unavailable", "available": []},
        {"id": "data-explorer", "name": "ECONOVA DATA EXPLORER", "status": "available", "available": ["World Bank indicator catalogue", "Source observations", "CSV/JSON export"]},
        {"id": "development", "name": "ECONOVA DEVELOPMENT", "status": "partial", "available": ["Selected World Bank social indicators"]},
        {"id": "insights", "name": "ECONOVA INSIGHTS & REPORTS", "status": "partial", "available": ["Observation exports in CSV, JSON and PDF"]},
    ]

@router.get("/observations")
def observations(
    country: str = Query(default="IND", min_length=3, max_length=3, pattern="^[A-Za-z]{3}$"),
    indicator: str = Query(default="NY.GDP.MKTP.KD.ZG", min_length=1, max_length=80, pattern="^[A-Za-z0-9._]+$"),
    start: int = Query(default=2000, ge=1960, le=2100),
    end: int = Query(default=2026, ge=1960, le=2100),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    if start > end:
        raise HTTPException(422, "Start year must not be later than end year")
    query = db.query(Observation, Country, Indicator, DataSource).join(Country).join(Indicator).join(DataSource).filter(Country.iso3 == country, Indicator.code == indicator, Observation.period >= str(start), Observation.period <= str(end)).order_by(Observation.period)
    count = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {
        "country": country.upper(),
        "indicator": indicator,
        "unit": rows[0][0].unit if rows else None,
        "source": rows[0][3].provider if rows else None,
        "source_url": rows[0][3].terms_url if rows else None,
        "retrieved_at": max((row[0].retrieved_at for row in rows), default=None),
        "items": [{"period": row[0].period, "value": row[0].value} for row in rows],
        "count": count,
        "limit": limit,
        "offset": offset,
    }

@router.post("/ingestion/world-bank")
async def ingest_world_bank(country: str = "IND", indicator: str = "NY.GDP.MKTP.KD.ZG", start: int = 2000, end: int = 2025, db: Session = Depends(get_db), user=Depends(current_user)):
    try:
        result = await ingest(db, country.upper(), indicator, start, end)
        db.add(AuditEvent(actor_user_id=user.id, action="data.ingestion", target=f"{country.upper()}:{indicator}", details=f"World Bank records fetched: {result.get('fetched', 0)}"))
        db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception:
        db.rollback()
        raise HTTPException(502, "World Bank ingestion failed. Check provider availability and retry.")

@router.post("/forecasts")
def forecast(payload: ForecastInput, db: Session = Depends(get_db), user=Depends(current_user)):
    data = observations(payload.country, payload.indicator, 1960, 2100, 5000, 0, db)
    if not data["items"]:
        raise HTTPException(404, "No observations found. Run World Bank ingestion first.")
    try:
        return forecast_series(data["items"], payload.horizon, payload.model)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

@router.post("/scenarios")
def create_scenario(payload: ScenarioInput, db: Session = Depends(get_db), user=Depends(current_user)):
    result = run_scenario(payload.baseline_value, payload.shock_percent)
    row = Scenario(owner_id=user.id, name=payload.name, variable=payload.variable, shock_percent=payload.shock_percent, baseline_value=result["baseline"], scenario_value=result["scenario"], assumptions=payload.assumptions)
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id, **result, "name": row.name, "variable": row.variable, "assumptions": row.assumptions}

@router.get("/scenarios")
def list_scenarios(db: Session = Depends(get_db), user=Depends(current_user)):
    return [{"id": x.id, "name": x.name, "variable": x.variable, "baseline": x.baseline_value, "scenario": x.scenario_value, "shock_percent": x.shock_percent, "created_at": x.created_at} for x in db.query(Scenario).filter(Scenario.owner_id == user.id).order_by(Scenario.created_at.desc()).all()]

@router.post("/research/ask")
async def research(payload: ResearchQuestion, user=Depends(current_user)):
    try:
        return await answer_question(payload.question)
    except Exception:
        raise HTTPException(502, "Research provider request failed. No unsupported answer was returned.")

@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    return {"countries": db.query(func.count(Country.id)).scalar(), "indicators": db.query(func.count(Indicator.id)).scalar(), "observations": db.query(func.count(Observation.id)).scalar(), "scenarios": db.query(func.count(Scenario.id)).scalar(), "status": "operational"}

@router.get("/admin/summary")
def admin_summary(db: Session = Depends(get_db), admin=Depends(require_admin)):
    latest = db.query(func.max(Observation.retrieved_at)).scalar()
    return {
        "users": db.query(func.count(User.id)).scalar(),
        "countries": db.query(func.count(Country.id)).scalar(),
        "indicators": db.query(func.count(Indicator.id)).scalar(),
        "observations": db.query(func.count(Observation.id)).scalar(),
        "data_sources": db.query(func.count(DataSource.id)).scalar(),
        "latest_retrieval": latest,
        "ai_provider_configured": bool(settings.gemini_api_key),
    }

@router.get("/admin/users")
def admin_users(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [{"id": user.id, "email": user.email, "display_name": user.display_name or "Researcher", "role": user.role, "created_at": user.created_at} for user in users],
        "count": db.query(func.count(User.id)).scalar(),
        "limit": limit,
        "offset": offset,
    }

@router.patch("/admin/users/{user_id}/role")
def update_user_role(user_id: int, payload: RoleUpdate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    target_user = db.get(User, user_id)
    if target_user is None:
        raise HTTPException(404, "User not found")
    if target_user.id == admin.id and payload.role != "SUPER_ADMIN":
        raise HTTPException(400, "You cannot remove your own administrator access")
    if target_user.role == "SUPER_ADMIN" and payload.role != "SUPER_ADMIN":
        admin_count = db.query(func.count(User.id)).filter(User.role == "SUPER_ADMIN").scalar() or 0
        if admin_count <= 1:
            raise HTTPException(400, "Provision another administrator before changing the final SUPER_ADMIN role")
    target_user.role = payload.role
    db.add(AuditEvent(actor_user_id=admin.id, action="admin.user.role_changed", target=str(user_id), details=f"Assigned role {payload.role}"))
    db.commit()
    return {"id": target_user.id, "role": target_user.role}

@router.get("/admin/audit")
def admin_audit(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db), admin=Depends(require_admin)):
    return [
        {"id": item.id, "actor_user_id": item.actor_user_id, "action": item.action, "target": item.target, "details": item.details, "created_at": item.created_at}
        for item in db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit).all()
    ]

@router.get("/reports/observations.pdf")
def export_observations_pdf(
    country: str = Query(default="IND", min_length=3, max_length=3, pattern="^[A-Za-z]{3}$"),
    indicator: str = Query(default="NY.GDP.MKTP.KD.ZG", min_length=1, max_length=80, pattern="^[A-Za-z0-9._]+$"),
    start: int = Query(default=2000, ge=1960, le=2100),
    end: int = Query(default=2026, ge=1960, le=2100),
    db: Session = Depends(get_db),
    user=Depends(current_user),
):
    if start > end:
        raise HTTPException(422, "Start year must not be later than end year")
    result = observations(country, indicator, start, end, 5000, 0, db)
    if not result["items"]:
        raise HTTPException(404, "No observations are available for this report")
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        output = BytesIO()
        doc = SimpleDocTemplate(output, pagesize=A4)
        styles = getSampleStyleSheet()
        story = [
            Paragraph("ECONOVA | Economic Intelligence &amp; Research Platform", styles["Title"]),
            Spacer(1, 10),
            Paragraph(f"Research question: What does {indicator} show for {country.upper()} from {start} to {end}?", styles["BodyText"]),
            Paragraph(f"Source: {result['source'] or 'Unknown'} · {result['source_url'] or 'URL unavailable'} · Unit: {result['unit'] or 'Unknown'} · Retrieved: {result['retrieved_at'] or 'Unknown'}", styles["BodyText"]),
            Paragraph("Methodology: Descriptive export of stored provider observations; no causal inference or interpolation applied.", styles["BodyText"]),
            Spacer(1, 12),
        ]
        table = Table([["Period", "Value", "Unit"]] + [[item["period"], str(item["value"]), result["unit"] or ""] for item in result["items"]], repeatRows=1)
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#14263c")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.35, colors.grey), ("PADDING", (0, 0), (-1, -1), 5)]))
        story.append(table)
        story.extend([Spacer(1, 12), Paragraph("Limitations: Provider publication schedules vary; this is not a tick-level or real-time market feed. Verify definitions and revisions with the original source.", styles["BodyText"])])
        doc.build(story)
        output.seek(0)
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="econova-{country.lower()}-{indicator.replace(".", "-")}.pdf"'})
    except Exception:
        raise HTTPException(500, "Could not generate the report")
