import re
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session
from app.models import Country, Indicator, DataSource, Observation, utcnow_naive

INDICATORS = {
    "NY.GDP.MKTP.KD.ZG": ("GDP growth (annual %)", "%", "Annual real GDP growth"),
    "FP.CPI.TOTL.ZG": ("Inflation, consumer prices (annual %)", "%", "Annual consumer price inflation"),
    "SP.POP.TOTL": ("Population, total", "people", "Total population"),
    "SL.UEM.TOTL.ZS": ("Unemployment, total (% of labour force)", "%", "Modelled ILO estimate"),
    "NE.EXP.GNFS.CD": ("Exports of goods and services (current US$)", "USD", "Current US dollar exports"),
    "NE.IMP.GNFS.CD": ("Imports of goods and services (current US$)", "USD", "Current US dollar imports"),
    "NE.RSB.GNFS.CD": ("External balance on goods and services (current US$)", "USD", "Current US dollar external balance"),
    "NY.GDP.MKTP.CD": ("GDP (current US$)", "USD", "Gross domestic product in current US dollars"),
    "FR.INR.RINR": ("Real interest rate (%)", "%", "Real interest rate"),
    "FR.INR.LEND": ("Lending interest rate (%)", "%", "Lending interest rate"),
    "FI.RES.TOTL.CD": ("Total reserves (includes gold, current US$)", "USD", "Total international reserves"),
    "GC.BAL.CASH.GD.ZS": ("Cash surplus/deficit (% of GDP)", "% of GDP", "Cash surplus or deficit as a share of GDP"),
    "GC.DOD.TOTL.GD.ZS": ("Central government debt (% of GDP)", "% of GDP", "Central government debt as a share of GDP"),
    "NV.IND.MANF.ZS": ("Manufacturing, value added (% of GDP)", "% of GDP", "Manufacturing value added share"),
    "SP.POP.GROW": ("Population growth (annual %)", "%", "Annual population growth"),
    "SP.DYN.LE00.IN": ("Life expectancy at birth, total (years)", "years", "Life expectancy at birth"),
    "SE.ADT.LITR.ZS": ("Adult literacy rate (% ages 15+)", "%", "Adult literacy rate"),
    "SI.POV.NAHC": ("Poverty headcount ratio at national poverty lines (%)", "%", "National poverty headcount ratio"),
    "SI.POV.GINI": ("Gini index", "index", "Income inequality index"),
    "SL.TLF.CACT.ZS": ("Labor force participation rate, total (%)", "%", "Labor force participation rate")
}

async def fetch_series(country: str, indicator: str, start: int = 2000, end: int = 2025):
    country = country.upper()
    if not re.fullmatch(r"[A-Z]{3}", country):
        raise ValueError("Country must be a three-letter ISO code")
    if not re.fullmatch(r"[A-Z0-9._]+", indicator):
        raise ValueError("Invalid World Bank indicator code")
    if start < 1960 or end > datetime.now(timezone.utc).year + 1 or start > end:
        raise ValueError("Requested observation range is invalid")
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.get(url, params={"date": f"{start}:{end}", "format": "json", "per_page": 1000})
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        return []
    return [{"period": row["date"], "value": row["value"]} for row in payload[1] if row.get("value") is not None]

async def ingest(db: Session, country_code: str, indicator_code: str, start: int = 2000, end: int = 2025):
    country_code = country_code.upper()
    values = await fetch_series(country_code, indicator_code, start, end)
    if not values:
        return {"inserted": 0, "message": "Provider returned no observations"}
    country = db.query(Country).filter_by(iso3=country_code).first()
    if not country:
        country = Country(iso3=country_code, name=country_code, region="World Bank catalogue")
        db.add(country)
        db.flush()
    metadata = INDICATORS.get(indicator_code, (indicator_code, "unknown", "World Bank indicator"))
    indicator = db.query(Indicator).filter_by(code=indicator_code).first()
    if not indicator:
        indicator = Indicator(code=indicator_code, name=metadata[0], unit=metadata[1], definition=metadata[2])
        db.add(indicator)
        db.flush()
    source = db.query(DataSource).filter_by(provider="World Bank").first()
    if not source:
        source = DataSource(provider="World Bank", dataset_code="WDI", terms_url="https://data.worldbank.org/")
        db.add(source)
        db.flush()
    inserted = 0
    revised = 0
    retrieved_at = utcnow_naive()
    for item in values:
        existing = db.query(Observation).filter_by(country_id=country.id, indicator_id=indicator.id, source_id=source.id, period=item["period"]).first()
        if not existing:
            db.add(Observation(country_id=country.id, indicator_id=indicator.id, source_id=source.id, period=item["period"], value=float(item["value"]), unit=indicator.unit, retrieved_at=retrieved_at))
            inserted += 1
        else:
            if existing.value != float(item["value"]):
                # The current schema stores the latest provider value; it does not retain prior revisions.
                existing.value = float(item["value"])
                revised += 1
            existing.retrieved_at = retrieved_at
    db.commit()
    return {"inserted": inserted, "revised": revised, "fetched": len(values), "provider": "World Bank", "country": country_code, "indicator": indicator_code}
