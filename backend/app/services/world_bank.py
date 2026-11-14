import asyncio
import csv
import io
import math
import re
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session
from app.models import Country, Indicator, DataSource, Observation, utcnow_naive
from app.core.config import settings

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
    "OECD.EO.NLGQ": ("General government fiscal balance (% of GDP)", "% of GDP", "OECD Economic Outlook general-government net lending (+) / borrowing (-); latest completed-year values may be estimates, and ECONOVA excludes forecast years"),
    "GC.DOD.TOTL.GD.ZS": ("Central government debt (% of GDP)", "% of GDP", "Central government debt as a share of GDP"),
    "NV.IND.MANF.ZS": ("Manufacturing, value added (% of GDP)", "% of GDP", "Manufacturing value added share"),
    "SP.POP.GROW": ("Population growth (annual %)", "%", "Annual population growth"),
    "SP.DYN.LE00.IN": ("Life expectancy at birth, total (years)", "years", "Life expectancy at birth"),
    "SE.ADT.LITR.ZS": ("Adult literacy rate (% ages 15+)", "%", "Adult literacy rate"),
    "SI.POV.NAHC": ("Poverty headcount ratio at national poverty lines (%)", "%", "National poverty headcount ratio"),
    "SI.POV.GINI": ("Gini index", "index", "Income inequality index"),
    "SL.TLF.CACT.ZS": ("Labor force participation rate, total (%)", "%", "Labor force participation rate")
}

PROVIDER_TIMEOUT_SECONDS = 12
PROVIDER_ATTEMPTS = 2


def _provider_client(timeout: float, headers: dict[str, str] | None = None):
    # Some Windows and container DNS setups prefer an unreachable IPv6 route for
    # the World Bank host. Bind to an explicit local address (IPv4 by default)
    # so provider requests use the working route; IPv6-only deployments can set
    # PROVIDER_HTTP_LOCAL_ADDRESS=::.
    transport = httpx.AsyncHTTPTransport(local_address=settings.provider_http_local_address)
    return httpx.AsyncClient(timeout=timeout, headers=headers, transport=transport)

async def fetch_json(url: str, params: dict[str, str]):
    async with _provider_client(timeout=PROVIDER_TIMEOUT_SECONDS) as client:
        for attempt in range(PROVIDER_ATTEMPTS):
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as error:
                if error.response.status_code < 500 or attempt == 2:
                    raise
            except httpx.RequestError:
                if attempt == 2:
                    raise
            await asyncio.sleep(0.5 * (attempt + 1))

async def fetch_oecd_series(country: str, start: int, end: int):
    url = f"https://sdmx.oecd.org/public/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO,1.5/{country}.NLGQ.A"
    params = {
        "startPeriod": str(start),
        "endPeriod": str(end),
        "dimensionAtObservation": "AllDimensions",
        "format": "csvfile",
    }
    async with _provider_client(timeout=PROVIDER_TIMEOUT_SECONDS, headers={"Accept": "text/csv"}) as client:
        for attempt in range(PROVIDER_ATTEMPTS):
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                rows = csv.DictReader(io.StringIO(response.text))
                values = []
                for row in rows:
                    period = row.get("TIME_PERIOD")
                    raw_value = row.get("OBS_VALUE")
                    if not period or not raw_value:
                        continue
                    try:
                        value = float(raw_value)
                    except ValueError:
                        continue
                    if math.isfinite(value):
                        values.append({"period": period, "value": value})
                return values
            except httpx.HTTPStatusError as error:
                if error.response.status_code < 500 or attempt == 2:
                    raise
            except (httpx.RequestError, KeyError, ValueError, csv.Error):
                if attempt == 2:
                    raise
            await asyncio.sleep(0.5 * (attempt + 1))

async def fetch_series(country: str, indicator: str, start: int = 2000, end: int = 2025):
    country = country.upper()
    if not re.fullmatch(r"[A-Z]{3}", country):
        raise ValueError("Country must be a three-letter ISO code")
    if not re.fullmatch(r"[A-Z0-9._]+", indicator):
        raise ValueError("Invalid World Bank indicator code")
    if indicator == "OECD.EO.NLGQ":
        current_year = datetime.now(timezone.utc).year
        if start < 1960 or end > current_year + 1 or start > end:
            raise ValueError("Requested OECD observation range is invalid")
        latest_completed_year = current_year - 1
        end = min(end, latest_completed_year)
        if start > end:
            return []
        return await fetch_oecd_series(country, start, end)
    if start < 1960 or end > datetime.now(timezone.utc).year + 1 or start > end:
        raise ValueError("Requested observation range is invalid")
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
    payload = await fetch_json(url, {"date": f"{start}:{end}", "format": "json", "per_page": 1000})
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
    is_oecd = indicator_code == "OECD.EO.NLGQ"
    provider = "OECD (Economic Outlook)" if is_oecd else "World Bank"
    dataset_code = "EO119" if is_oecd else "WDI"
    terms_url = "https://data-explorer.oecd.org/" if is_oecd else "https://data.worldbank.org/"
    source = db.query(DataSource).filter_by(provider=provider).first()
    if not source:
        source = DataSource(provider=provider, dataset_code=dataset_code, terms_url=terms_url)
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
    return {"inserted": inserted, "revised": revised, "fetched": len(values), "provider": provider, "country": country_code, "indicator": indicator_code}
