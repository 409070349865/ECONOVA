from io import BytesIO
from collections import defaultdict, deque
import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
import threading
import time
import uuid

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from app.database import get_db
from app.models import User, Country, Indicator, Observation, DataSource, Scenario, AuditEvent, ResearchUpload, utcnow_naive
from app.schemas import Credentials, Token, ScenarioInput, ResearchQuestion, ForecastInput, RoleUpdate
from app.security import hash_password, verify_password, create_token, current_user, optional_user, require_admin
from app.services.world_bank import ingest, INDICATORS
from app.services.forecasting import forecast_series
from app.services.finance_markets import (
    MarketDataError,
    get_market_analysis,
    get_market_diagnostics_png,
    get_plotly_market_html,
    market_catalog,
)
from app.services.trade_intelligence import TradeDataError, get_trade_chart_html, get_trade_overview
from app.services.development_human_progress import development_indicator_catalog, get_development_overview
from app.services.scenarios import run_scenario
from app.services.research import AIProviderError, answer_question
from app.services.research_uploads import MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS, UploadFormatError, analyze_upload
from app.core.config import settings

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)
_research_rate_limits = defaultdict(deque)
_research_rate_lock = threading.Lock()
_observation_load_locks: dict[tuple[str, str], asyncio.Lock] = {}
_observation_load_locks_guard = threading.Lock()


def _observation_load_lock(country: str, indicator: str) -> asyncio.Lock:
    key = (country, indicator)
    with _observation_load_locks_guard:
        return _observation_load_locks.setdefault(key, asyncio.Lock())


def enforce_research_limit(request: Request, action: str, limit: int, window_seconds: int):
    address = request.client.host if request.client else "unknown"
    key = hashlib.sha256(f"{settings.secret_key}:{address}:{action}".encode()).hexdigest()
    now = time.monotonic()
    with _research_rate_lock:
        events = _research_rate_limits[key]
        while events and now - events[0] >= window_seconds:
            events.popleft()
        if len(events) >= limit:
            raise HTTPException(429, "Too many requests. Wait briefly and try again.")
        events.append(now)
        if len(_research_rate_limits) > 5_000:
            for stale_key in list(_research_rate_limits):
                if not _research_rate_limits[stale_key] or now - _research_rate_limits[stale_key][-1] >= window_seconds:
                    _research_rate_limits.pop(stale_key, None)


def research_observation_context(db: Session, country_code: str):
    codes = ("NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG", "SL.UEM.TOTL.ZS", "OECD.EO.NLGQ")
    evidence = []
    for code in codes:
        row = (
            db.query(Observation, Indicator, DataSource)
            .join(Country, Observation.country_id == Country.id)
            .join(Indicator, Observation.indicator_id == Indicator.id)
            .join(DataSource, Observation.source_id == DataSource.id)
            .filter(Country.iso3 == country_code.upper(), Indicator.code == code)
            .order_by(Observation.period.desc())
            .first()
        )
        if not row:
            continue
        observation, indicator, source = row
        evidence.append({
            "source": f"{source.provider}: {indicator.name}",
            "url": source.terms_url,
            "text": f"{country_code.upper()}, {observation.period}: {indicator.name} = {observation.value:g} {observation.unit}. Retrieved {observation.retrieved_at.isoformat()} UTC. This is an annual observation, not a live value.",
        })
    return evidence

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
        {"id": "ai-economist", "name": "ECONOVA AI ECONOMIST", "status": "available", "available": ["Economics questions", "Country observation context", "Document and dataset analysis"]},
        {"id": "policylab", "name": "ECONOVA POLICYLAB", "status": "available", "available": ["India government policy tracker", "Latest official economic statistics", "Policy goals, measures and source links"]},
        {"id": "simulator", "name": "ECONOVA SIMULATOR", "status": "available", "available": ["Arithmetic sensitivity; saved runs are account-scoped"]},
        {"id": "trade", "name": "ECONOVA TRADE", "status": "available", "available": ["Latest released monthly goods trade by partner", "Interactive export/import bar, pie and box plots", "Walk-forward trade-balance direction confusion matrix"]},
        {"id": "finance", "name": "ECONOVA FINANCE", "status": "available", "available": ["Country stock-index daily and intraday OHLC history", "Technical trend, momentum and volatility patterns", "Approximate statistical forecast ranges", "Interactive Plotly candles and Matplotlib/Seaborn risk diagnostics"]},
        {"id": "research-lab", "name": "ECONOVA RESEARCH LAB", "status": "available", "available": ["Curated economics research library", "Source-linked findings and limitations", "Measurable growth, jobs and productivity goals"]},
        {"id": "data-explorer", "name": "ECONOVA DATA EXPLORER", "status": "available", "available": ["World Bank indicator catalogue", "Source observations", "CSV/JSON export"]},
        {"id": "development", "name": "ECONOVA DEVELOPMENT", "status": "available", "available": ["World Bank poverty, labor, education, health and sector-employment series", "Latest released country observations with provider and retrieval details", "Provider records and historical series"]},
        {"id": "insights", "name": "ECONOVA INSIGHTS & REPORTS", "status": "partial", "available": ["Observation exports in CSV, JSON and PDF"]},
    ]


@router.get("/finance/markets")
def finance_market_catalog():
    return market_catalog()


@router.get("/finance/markets/{asset_id}")
async def finance_market_series(
    asset_id: str,
    range: str = Query(default="1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|5y)$"),
    horizon: int = Query(default=20, ge=5, le=60),
):
    if horizon not in {5, 20, 60}:
        raise HTTPException(422, "Forecast horizon must be 5, 20, or 60 observations.")
    try:
        return await get_market_analysis(asset_id, range, horizon)
    except MarketDataError as exc:
        raise HTTPException(503, str(exc))


@router.get("/finance/markets/{asset_id}/plotly", response_class=HTMLResponse)
async def finance_market_plotly(
    asset_id: str,
    range: str = Query(default="1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|5y)$"),
):
    try:
        chart = await get_plotly_market_html(asset_id, range)
        return HTMLResponse(chart, headers={"Cache-Control": "no-store" if range in {"1d", "5d"} else "public, max-age=300"})
    except MarketDataError as exc:
        raise HTTPException(503, str(exc))


@router.get("/finance/markets/{asset_id}/diagnostics.png")
async def finance_market_diagnostics(
    asset_id: str,
    range: str = Query(default="1y", pattern="^(1mo|3mo|6mo|1y|5y)$"),
):
    try:
        image = await get_market_diagnostics_png(asset_id, range)
        return StreamingResponse(BytesIO(image), media_type="image/png", headers={"Cache-Control": "public, max-age=300"})
    except MarketDataError as exc:
        raise HTTPException(503, str(exc))


@router.get("/trade/overview")
async def trade_intelligence_overview(
    country: str = Query(default="IND", pattern="^[A-Za-z]{3}$"),
    force_refresh: bool = Query(default=False),
):
    try:
        return await get_trade_overview(country, force_refresh)
    except TradeDataError as exc:
        raise HTTPException(503, str(exc))


@router.get("/trade/charts/{chart}", response_class=HTMLResponse)
async def trade_intelligence_chart(
    chart: str,
    country: str = Query(default="IND", pattern="^[A-Za-z]{3}$"),
    flow: str = Query(default="X", pattern="^(X|M)$"),
):
    try:
        html = await get_trade_chart_html(country, flow, chart)
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})
    except TradeDataError as exc:
        raise HTTPException(503, str(exc))


@router.get("/development/catalog")
def development_catalog():
    return development_indicator_catalog()


@router.get("/development/overview")
async def development_overview(
    country: str = Query(default="IND", min_length=3, max_length=3, pattern="^[A-Za-z]{3}$"),
    start: int = Query(default=1990, ge=1960, le=2100),
    end: int = Query(default=2026, ge=1960, le=2100),
    force_refresh: bool = Query(default=False),
):
    return await get_development_overview(country, start, end, force_refresh)

def _observations_query(db: Session, country: str, indicator: str, start: int, end: int):
    return (
        db.query(Observation, Country, Indicator, DataSource)
        .join(Country).join(Indicator).join(DataSource)
        .filter(
            Country.iso3 == country,
            Indicator.code == indicator,
            Observation.period >= str(start),
            Observation.period <= str(end),
        )
        .order_by(Observation.period)
    )


async def _load_observations(db: Session, country: str, indicator: str, start: int, end: int, limit: int, offset: int):
    country = country.upper()
    query = _observations_query(db, country, indicator, start, end)
    count = query.count()
    if count == 0:
        # A fresh installation has an empty observations table. Fetch the selected
        # public series on demand so Forecast and Global Economy work without an
        # operator having to run a separate ingestion step first. The per-series
        # lock also prevents duplicate inserts when the browser retries or React
        # StrictMode issues overlapping development requests.
        async with _observation_load_lock(country, indicator):
            query = _observations_query(db, country, indicator, start, end)
            count = query.count()
            provider_end = min(end, datetime.now(timezone.utc).year + 1)
            if count == 0 and start <= provider_end:
                try:
                    await ingest(db, country, indicator, start, provider_end)
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from exc
                except Exception as exc:
                    db.rollback()
                    logger.exception("Automatic provider ingestion failed for %s:%s", country, indicator)
                    raise HTTPException(
                        502,
                        "The public data provider could not be reached. Retry in a moment; no sample values were substituted.",
                    ) from exc
                query = _observations_query(db, country, indicator, start, end)
                count = query.count()

    rows = query.offset(offset).limit(limit).all()
    retrieved_at = max((row[0].retrieved_at for row in rows), default=None)
    result = {
        "country": country,
        "indicator": indicator,
        "unit": rows[0][0].unit if rows else None,
        "source": rows[0][3].provider if rows else None,
        "source_url": rows[0][3].terms_url if rows else None,
        "retrieved_at": retrieved_at,
        "items": [{"period": row[0].period, "value": row[0].value} for row in rows],
        "count": count,
        "limit": limit,
        "offset": offset,
    }
    if not count:
        result["message"] = "The provider returned no observations for this country, indicator, and period. Try a wider year range or another indicator."
    return result


@router.get("/observations")
async def observations(
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
    return await _load_observations(db, country, indicator, start, end, limit, offset)

@router.post("/ingestion/indicators")
@router.post("/ingestion/world-bank", include_in_schema=False)
async def ingest_indicator(country: str = "IND", indicator: str = "NY.GDP.MKTP.KD.ZG", start: int = 2000, end: int = 2025, db: Session = Depends(get_db), user=Depends(optional_user)):
    try:
        result = await ingest(db, country.upper(), indicator, start, end)
        if user is not None:
            db.add(AuditEvent(actor_user_id=user.id, action="data.ingestion", target=f"{country.upper()}:{indicator}", details=f"{result.get('provider', 'Data provider')} records fetched: {result.get('fetched', 0)}"))
            db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception:
        db.rollback()
        raise HTTPException(502, "Indicator provider request failed. Check provider availability and retry.")

@router.post("/forecasts")
async def forecast(payload: ForecastInput, db: Session = Depends(get_db)):
    latest_provider_year = datetime.now(timezone.utc).year + 1
    data = await _load_observations(db, payload.country, payload.indicator, 1960, latest_provider_year, 5000, 0)
    if not data["items"]:
        raise HTTPException(404, data.get("message", "The public provider has no observations for this series."))
    try:
        return forecast_series(data["items"], payload.horizon, payload.model)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

@router.post("/scenarios")
def create_scenario(payload: ScenarioInput, db: Session = Depends(get_db), user=Depends(optional_user)):
    result = run_scenario(payload.baseline_value, payload.shock_percent)
    if user is None:
        return {"id": None, **result, "name": payload.name, "variable": payload.variable, "assumptions": payload.assumptions}
    row = Scenario(owner_id=user.id, name=payload.name, variable=payload.variable, shock_percent=payload.shock_percent, baseline_value=result["baseline"], scenario_value=result["scenario"], assumptions=payload.assumptions)
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id, **result, "name": row.name, "variable": row.variable, "assumptions": row.assumptions}

@router.get("/scenarios")
def list_scenarios(db: Session = Depends(get_db), user=Depends(optional_user)):
    if user is None:
        return []
    return [{"id": x.id, "name": x.name, "variable": x.variable, "baseline": x.baseline_value, "scenario": x.scenario_value, "shock_percent": x.shock_percent, "created_at": x.created_at} for x in db.query(Scenario).filter(Scenario.owner_id == user.id).order_by(Scenario.created_at.desc()).all()]

@router.get("/research/status")
def research_status():
    return {
        "provider": "Google Gemini",
        "provider_configured": bool(settings.gemini_api_key),
        "model": settings.gemini_model,
        "supported_file_types": sorted(SUPPORTED_EXTENSIONS),
        "max_file_size_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
        "upload_retention_hours": 24,
        "economics_only": True,
    }


@router.post("/research/uploads")
async def upload_research_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    enforce_research_limit(request, "upload", limit=10, window_seconds=3600)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Files must be 15 MB or smaller.")
    try:
        filename, file_type, analysis_text = await run_in_threadpool(analyze_upload, file.filename or "upload", content)
    except UploadFormatError as exc:
        raise HTTPException(400, str(exc))

    now = utcnow_naive()
    db.query(ResearchUpload).filter(ResearchUpload.expires_at <= now).delete(synchronize_session=False)
    upload_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(hours=24)
    row = ResearchUpload(
        id=upload_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        filename=filename,
        file_type=file_type,
        analysis_text=analysis_text,
        created_at=now,
        expires_at=expires_at,
    )
    db.add(row)
    db.commit()
    return {
        "id": upload_id,
        "token": token,
        "filename": filename,
        "file_type": file_type,
        "analysis_preview": analysis_text[:2_400],
        "analysis_characters": len(analysis_text),
        "expires_at": expires_at,
    }


@router.delete("/research/uploads/{upload_id}")
def delete_research_upload(
    upload_id: str,
    upload_token: str = Header(alias="X-Upload-Token", min_length=32, max_length=128),
    db: Session = Depends(get_db),
):
    row = db.get(ResearchUpload, upload_id)
    token_hash = hashlib.sha256(upload_token.encode()).hexdigest()
    if row is None or not secrets.compare_digest(row.token_hash, token_hash):
        raise HTTPException(404, "Upload was not found.")
    db.delete(row)
    db.commit()
    return {"deleted": True}


@router.post("/research/ask")
async def research(payload: ResearchQuestion, request: Request, db: Session = Depends(get_db)):
    enforce_research_limit(request, "ask", limit=20, window_seconds=60)
    upload_context = []
    now = utcnow_naive()
    for reference in payload.uploads:
        row = db.get(ResearchUpload, reference.id)
        expected_hash = hashlib.sha256(reference.token.encode()).hexdigest()
        if row is None or row.expires_at <= now or not secrets.compare_digest(row.token_hash, expected_hash):
            raise HTTPException(404, "An uploaded file was removed or expired. Upload it again to continue.")
        upload_context.append({"filename": row.filename, "file_type": row.file_type, "analysis_text": row.analysis_text})
    evidence = research_observation_context(db, payload.country)
    try:
        return await answer_question(
            payload.question,
            evidence=evidence,
            uploads=upload_context,
            history=[message.model_dump() for message in payload.history],
        )
    except AIProviderError as exc:
        raise HTTPException(503, str(exc))
    except Exception:
        logger.exception("AI Economist request failed")
        raise HTTPException(500, "The AI Economist could not complete this request. Please retry.")

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
