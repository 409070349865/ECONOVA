"""Country development and human-capital indicators from World Bank WDI."""

import asyncio
import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from app.core.config import settings


COUNTRIES = {
    "IND": ("India", "IN"), "CHN": ("China", "CN"), "USA": ("United States", "US"),
    "DEU": ("Germany", "DE"), "JPN": ("Japan", "JP"),
}

INDICATORS = [
    {"code": "SI.POV.NAHC", "name": "National poverty rate", "unit": "% of population",
     "definition": "Share of people living below the poverty line defined by the country. The estimate is survey-based and may have long gaps between observation years.",
     "economic_relevance": "Tracks whether economic gains reach households and informs the design and targeting of social protection."},
    {"code": "SL.TLF.CACT.ZS", "name": "Labor force participation", "unit": "% of population ages 15+",
     "definition": "Share of people ages 15 and older who are working or actively seeking work; modeled ILO estimate.",
     "economic_relevance": "Shows how much of the working-age population is available to produce goods and services."},
    {"code": "SP.POP.1564.TO", "name": "Working-age population", "unit": "people ages 15–64",
     "definition": "Population ages 15 through 64; an age-band measure, not a count of employed or job-ready workers.",
     "economic_relevance": "Indicates the potential scale of the labor pool; participation, skills, health, and available jobs determine how much of it can contribute."},
    {"code": "SL.UEM.TOTL.ZS", "name": "Unemployment rate", "unit": "% of labor force",
     "definition": "Modeled ILO estimate of people in the labor force without work who are available and seeking employment.",
     "economic_relevance": "Helps assess unused labor capacity alongside participation; it does not measure underemployment or job quality."},
    {"code": "SE.ADT.LITR.ZS", "name": "Adult literacy", "unit": "% ages 15+",
     "definition": "Share of people ages 15 and older who can read and write a short, simple statement about everyday life.",
     "economic_relevance": "Basic literacy supports access to training, information, and a wider range of work."},
    {"code": "SE.TER.ENRR", "name": "Tertiary enrollment", "unit": "% gross enrollment ratio",
     "definition": "Tertiary enrollment as a percentage of the population in the five-year age group following secondary school; gross ratios can exceed 100%.",
     "economic_relevance": "Provides a broad signal of participation in post-secondary education, not a direct measure of skills or graduate employment."},
    {"code": "SP.DYN.LE00.IN", "name": "Life expectancy", "unit": "years at birth",
     "definition": "Expected years of life for a newborn if current age-specific mortality rates persist.",
     "economic_relevance": "Health and longevity affect the time people can learn, work, and contribute to household and national income."},
    {"code": "SL.AGR.EMPL.ZS", "name": "Employment in agriculture", "unit": "% of employment",
     "definition": "Share of total employment in agriculture, based on modeled ILO estimates.",
     "economic_relevance": "Tracks labor reallocation across sectors; a change alone does not establish productivity or job quality."},
    {"code": "SL.IND.EMPL.ZS", "name": "Employment in industry", "unit": "% of employment",
     "definition": "Share of total employment in industry, based on modeled ILO estimates.",
     "economic_relevance": "Shows the share of workers in industrial activities such as manufacturing, construction, mining, and utilities."},
    {"code": "SL.SRV.EMPL.ZS", "name": "Employment in services", "unit": "% of employment",
     "definition": "Share of total employment in services, based on modeled ILO estimates.",
     "economic_relevance": "Tracks the service-sector share of jobs, including wide differences in pay, productivity, and formality."},
]

_CACHE: dict[tuple[str, int, int], tuple[float, dict]] = {}
_LOCKS: dict[str, asyncio.Lock] = {}
_CACHE_TTL_SECONDS = 900


async def get_development_overview(country: str, start: int, end: int, force_refresh: bool = False) -> dict:
    country = country.upper()
    country_info = COUNTRIES.get(country)
    if not country_info:
        raise HTTPException(422, "Choose India, China, United States, Germany, or Japan.")
    if start < 1960 or end > datetime.now(timezone.utc).year + 1 or start > end:
        raise HTTPException(422, "Choose a valid observation range between 1960 and next year.")
    cache_key = (country, start, end)
    cached = _CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS and not force_refresh:
        return cached[1]

    lock = _LOCKS.setdefault(country, asyncio.Lock())
    async with lock:
        cached = _CACHE.get(cache_key)
        if cached and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS and not force_refresh:
            return cached[1]
        # Fetch in parallel so one slow/unsupported series does not hold up every
        # card; put a per-series ceiling around the provider's retrying client.
        semaphore = asyncio.Semaphore(len(INDICATORS))

        async def load_indicator(metadata, client):
            async with semaphore:
                try:
                    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{metadata['code']}"
                    response = await asyncio.wait_for(client.get(url, params={
                        "date": f"{start}:{end}", "format": "json", "per_page": 1000,
                    }), timeout=16)
                    response.raise_for_status()
                    payload = response.json()
                    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
                        values = []
                    else:
                        values = [
                            {"period": row["date"], "value": row["value"]}
                            for row in payload[1]
                            if row.get("date") and row.get("value") is not None
                        ]
                    records = sorted(
                        ({"period": str(row["period"]), "value": float(row["value"])} for row in values),
                        key=lambda row: row["period"],
                    )
                    return metadata["code"], records, None
                except Exception:
                    return metadata["code"], [], "This indicator could not be reached from the World Bank provider."

        transport = httpx.AsyncHTTPTransport(local_address=settings.provider_http_local_address)
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(16, connect=6), transport=transport,
                headers={"User-Agent": "ECONOVA/1.0 (development indicators)", "Accept": "application/json"},
            ) as client:
                results = await asyncio.gather(*(load_indicator(item, client) for item in INDICATORS))
        except httpx.HTTPError as exc:
            raise HTTPException(503, "The World Bank data provider could not be reached. Please try again shortly.") from exc
        by_code = {code: (records, error) for code, records, error in results}
        available_count = sum(bool(records) for records, _ in by_code.values())
        failure_count = sum(error is not None for _, error in by_code.values())
        if failure_count == len(INDICATORS):
            raise HTTPException(503, "The World Bank data provider could not be reached. Please try again shortly.")

        country_name, iso2 = country_info
        series = []
        for metadata in INDICATORS:
            records, error = by_code[metadata["code"]]
            series.append({
                **metadata,
                "provider": "World Bank",
                "source_url": f"https://data.worldbank.org/indicator/{metadata['code']}?locations={iso2}",
                "provider_status": "available" if records else ("unavailable" if error else "no_observations"),
                "error": error,
                "latest": records[-1] if records else None,
                "items": records,
            })

        result = {
            "country": country,
            "country_name": country_name,
            "period_range": {"start": start, "end": end},
            "provider": "World Bank · World Development Indicators",
            "provider_url": "https://data.worldbank.org/",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "available_indicators": available_count,
            "unavailable_indicators": failure_count,
            "series": series,
            "note": "Indicators are published at different intervals and can use household surveys or modeled estimates. The latest year varies by series. Missing observations are left blank; ECONOVA does not interpolate or replace them with sample values.",
        }
        _CACHE[cache_key] = (time.monotonic(), result)
        if len(_CACHE) > 30:
            oldest = sorted(_CACHE, key=lambda key: _CACHE[key][0])[:10]
            for key in oldest:
                _CACHE.pop(key, None)
        return result


def development_indicator_catalog():
    return {"countries": [{"code": code, "name": name} for code, (name, _) in COUNTRIES.items()], "indicators": INDICATORS}
