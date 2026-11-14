"""Release-based partner trade charts and a walk-forward direction baseline."""

import asyncio
import time
from datetime import datetime, timezone

import httpx
import numpy as np
import plotly.graph_objects as go
from fastapi import HTTPException

from app.core.config import settings

COMTRADE = "https://comtradeapi.un.org/public/v1"
REPORTERS = {
    "IND": {"name": "India", "code": 699}, "USA": {"name": "United States", "code": 842},
    "CHN": {"name": "China", "code": 156}, "JPN": {"name": "Japan", "code": 392},
    "DEU": {"name": "Germany", "code": 276}, "GBR": {"name": "United Kingdom", "code": 826},
}
PARTNERS = {
    0: "World", 4: "Afghanistan", 8: "Albania", 12: "Algeria", 24: "Angola", 32: "Argentina",
    36: "Australia", 40: "Austria", 50: "Bangladesh", 56: "Belgium", 76: "Brazil", 124: "Canada",
    144: "Sri Lanka", 156: "China", 158: "Taiwan", 170: "Colombia", 196: "Cyprus", 203: "Czechia",
    208: "Denmark", 246: "Finland", 250: "France", 276: "Germany", 300: "Greece", 344: "Hong Kong",
    348: "Hungary", 360: "Indonesia", 364: "Iran", 368: "Iraq", 376: "Israel", 380: "Italy",
    392: "Japan", 398: "Kazakhstan", 410: "South Korea", 414: "Kuwait", 458: "Malaysia", 484: "Mexico",
    504: "Morocco", 528: "Netherlands", 554: "New Zealand", 566: "Nigeria", 578: "Norway", 586: "Pakistan",
    608: "Philippines", 616: "Poland", 620: "Portugal", 634: "Qatar", 643: "Russia", 682: "Saudi Arabia",
    702: "Singapore", 704: "Vietnam", 710: "South Africa", 724: "Spain", 752: "Sweden", 756: "Switzerland",
    764: "Thailand", 784: "United Arab Emirates", 788: "Tunisia", 792: "Türkiye", 804: "Ukraine",
    818: "Egypt", 826: "United Kingdom", 834: "Tanzania", 840: "United States", 842: "United States",
    860: "Uzbekistan", 901: "World (unspecified)", 925: "Other Asia, nes",
}
_CACHE: dict[str, tuple[float, dict]] = {}
_LOCKS: dict[str, asyncio.Lock] = {}
_TTL_SECONDS = 1800


class TradeDataError(Exception):
    """A safe provider error for the UI."""


def _label(code):
    code = int(code)
    return PARTNERS.get(code, f"Partner {code}")


async def _get_json(client, path, params=None):
    response = await client.get(f"{COMTRADE}/{path}", params=params)
    response.raise_for_status()
    body = response.json()
    if body.get("error"):
        raise TradeDataError("UN Comtrade returned an error for this selection. Please retry later.")
    return body


async def get_trade_overview(country: str, force_refresh: bool = False) -> dict:
    country = country.upper()
    reporter = REPORTERS.get(country)
    if not reporter:
        raise HTTPException(422, "Choose India, United States, China, Japan, Germany, or United Kingdom.")
    cached = _CACHE.get(country)
    now = time.monotonic()
    if cached and now - cached[0] < _TTL_SECONDS and not force_refresh:
        return cached[1]
    lock = _LOCKS.setdefault(country, asyncio.Lock())
    async with lock:
        cached = _CACHE.get(country)
        now = time.monotonic()
        if cached and now - cached[0] < _TTL_SECONDS and not force_refresh:
            return cached[1]
        transport = httpx.AsyncHTTPTransport(local_address=settings.provider_http_local_address)
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(35, connect=10), transport=transport,
                                         headers={"User-Agent": "ECONOVA/1.0 (trade statistics)", "Accept": "application/json"}) as client:
                availability = await _get_json(client, "getDA/C/M/HS", {"reporterCode": reporter["code"]})
                periods = [row for row in availability.get("data", []) if row.get("reporterCode") == reporter["code"] and row.get("period")]
                if not periods:
                    raise TradeDataError(f"No monthly goods-trade releases are available for {reporter['name']}.")
                latest = max(periods, key=lambda row: int(row["period"]))
                period = str(latest["period"])
                common = {"reporterCode": reporter["code"], "period": period, "cmdCode": "TOTAL"}
                exports, imports, monthly = await asyncio.gather(
                    _get_json(client, "preview/C/M/HS", {**common, "flowCode": "X"}),
                    _get_json(client, "preview/C/M/HS", {**common, "flowCode": "M"}),
                    _get_json(client, "getMBS", {"series_type": "T35.M.V.$", "country_code": reporter["code"], "period_type": "M", "table_type": "T35"}),
                )
        except TradeDataError:
            raise
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise TradeDataError("UN Comtrade could not be reached. Trade observations are not substituted with sample values.") from exc

        def partner_rows(response, flow):
            rows = []
            for item in response.get("data", []):
                value = item.get("primaryValue")
                code = item.get("partnerCode")
                if value is None or code is None or int(code) == 0 or not np.isfinite(float(value)) or float(value) <= 0:
                    continue
                rows.append({"code": int(code), "name": _label(code), "value_usd": float(value), "flow": flow})
            return sorted(rows, key=lambda row: row["value_usd"], reverse=True)

        partner_data = {"X": partner_rows(exports, "X"), "M": partner_rows(imports, "M")}
        totals = {}
        for flow, response in (("X", exports), ("M", imports)):
            world = next((row for row in response.get("data", []) if int(row.get("partnerCode", -1)) == 0), None)
            totals[flow] = float(world["primaryValue"]) if world and world.get("primaryValue") is not None else sum(x["value_usd"] for x in partner_data[flow])

        balance_by_period = {}
        for item in monthly.get("data", []):
            try:
                period_id = int(item.get("period", 0))
                flow = item.get("trade_Flow")
                value = float(item.get("value"))
                if flow in {"X", "M"} and np.isfinite(value):
                    balance_by_period.setdefault(period_id, {})[flow] = value
            except (TypeError, ValueError):
                continue
        balance_series = [{"period": p, "balance": values["X"] - values["M"]}
                          for p, values in sorted(balance_by_period.items()) if "X" in values and "M" in values]
        matrix = _direction_backtest(balance_series)
        result = {
            "country": reporter["name"], "country_code": country, "period": period,
            "release_date": latest.get("lastReleased"), "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "source": "UN Comtrade public preview / Monthly Bulletin of Statistics table T35",
            "source_url": "https://comtradeplus.un.org/en/api-docs", "currency": "USD",
            "exports_usd": totals["X"], "imports_usd": totals["M"], "partners": partner_data,
            "confusion_matrix": matrix, "monthly_series_periods": len(balance_series),
            "note": "Partner values are reported goods trade for the latest released month. The confusion matrix evaluates a one-month direction-persistence baseline against historical trade-balance changes; it is not a future price or trade forecast.",
        }
        _CACHE[country] = (time.monotonic(), result)
        return result


def _direction_backtest(series):
    # Walk forward: predict the next balance direction using only the last observed direction.
    directions = []
    for previous, current in zip(series, series[1:]):
        p, c = int(previous["period"]), int(current["period"])
        contiguous = (c // 100 == p // 100 and c % 100 == p % 100 + 1) or (c // 100 == p // 100 + 1 and p % 100 == 12 and c % 100 == 1)
        if contiguous:
            delta = current["balance"] - previous["balance"]
            directions.append(1 if delta >= 0 else 0)
    actual, predicted = [], []
    for index in range(1, len(directions)):
        actual.append(directions[index])
        predicted.append(directions[index - 1])
    labels = ["Balance fell", "Balance rose"]
    cells = [[0, 0], [0, 0]]
    for truth, guess in zip(actual, predicted):
        cells[truth][guess] += 1
    count = len(actual)
    return {"labels": labels, "values": cells, "observations": count,
            "accuracy_percent": (sum(cells[i][i] for i in range(2)) / count * 100) if count else None,
            "method": "Walk-forward persistence baseline; each prediction uses the previous month's observed trade-balance direction."}


def _embed(figure):
    html = figure.to_html(full_html=True, include_plotlyjs="cdn", config={"responsive": True, "displaylogo": False})
    css = "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111d30}.plotly-graph-div{width:100%!important;height:100%!important}</style>"
    return html.replace("</head>", f"{css}</head>", 1)


async def get_trade_chart_html(country: str, flow: str, chart: str) -> str:
    if flow not in {"X", "M"}:
        raise HTTPException(422, "Flow must be exports (X) or imports (M).")
    if chart not in {"bar", "pie", "box", "matrix"}:
        raise HTTPException(404, "Unknown trade chart.")
    data = await get_trade_overview(country)
    rows = data["partners"][flow]
    values_b = [row["value_usd"] / 1e9 for row in rows]
    names = [row["name"] for row in rows]
    flow_label = "Exports" if flow == "X" else "Imports"
    figure = go.Figure()
    colors = ["#25c6ae", "#68b8ef", "#a78bfa", "#f4b95d", "#f47b91", "#4fd1c5", "#9db4ca", "#d887d8", "#85c270", "#f28b54"]
    if chart == "bar":
        shown = rows[:12]
        figure.add_trace(go.Bar(x=[r["name"] for r in shown], y=[r["value_usd"] / 1e9 for r in shown],
                                customdata=[[r["value_usd"], r["code"]] for r in shown], marker_color=colors[:len(shown)],
                                hovertemplate="%{x} (partner code %{customdata[1]})<br>Reported value: $%{customdata[0]:,.0f}<br>Value in USD billions: %{y:.2f}<extra></extra>"))
        figure.update_layout(title=f"{flow_label} by partner · {data['period']}", yaxis_title="USD billions", xaxis_title="Partner country", xaxis_tickangle=-28)
    elif chart == "pie":
        top = rows[:8]
        rest = sum(row["value_usd"] for row in rows[8:])
        labels = [row["name"] for row in top] + (["Other returned partners"] if rest > 0 else [])
        vals = [row["value_usd"] for row in top] + ([rest] if rest > 0 else [])
        figure.add_trace(go.Pie(labels=labels, values=vals, hole=.35, sort=False, marker_colors=colors,
                                textinfo="label+percent", hovertemplate="%{label}<br>Trade value: $%{value:,.0f}<br>Share of returned partner records: %{percent}<extra></extra>"))
        figure.update_layout(title=f"{flow_label} share across returned partner records · {data['period']}", showlegend=True,
                             legend={"orientation": "h", "y": -0.04})
    elif chart == "box":
        figure.add_trace(go.Box(y=values_b, name=flow_label, boxpoints="outliers", marker_color="#35c9b1", line_color="#67b6ed",
                                customdata=[[name, row["value_usd"]] for name, row in zip(names, rows)],
                                hovertemplate="%{customdata[0]}<br>Reported value: $%{customdata[1]:,.0f}<extra></extra>"))
        figure.update_layout(title=f"Partner value distribution · {flow_label} · {data['period']}", yaxis_title="USD billions", xaxis_title="Reported trade partners")
    else:
        matrix = data["confusion_matrix"]
        figure.add_trace(go.Heatmap(z=matrix["values"], x=["Predicted fell", "Predicted rose"], y=["Actually fell", "Actually rose"],
                                    colorscale=[[0, "#132238"], [.5, "#286d7b"], [1, "#24c5a9"]], showscale=True,
                                    hovertemplate="%{y}<br>%{x}<br>Backtest observations: %{z}<extra></extra>", text=matrix["values"], texttemplate="%{text}", textfont={"size": 20, "color": "#f0f7fa"}))
        accuracy = "unavailable" if matrix["accuracy_percent"] is None else f"{matrix['accuracy_percent']:.1f}% baseline accuracy over {matrix['observations']} held-out months"
        figure.update_layout(title=f"Trade-balance direction backtest · {accuracy}", xaxis_title="Baseline prediction", yaxis_title="Observed direction")
    figure.update_layout(template="plotly_dark", paper_bgcolor="#111d30", plot_bgcolor="#0b1422", font={"color": "#dce7f1", "size": 11},
                         margin={"l": 58, "r": 24, "t": 68, "b": 58}, height=380, autosize=True, hoverlabel={"bgcolor": "#0c1828", "font": {"color": "#edf4f8"}})
    figure.update_xaxes(gridcolor="#24364d")
    figure.update_yaxes(gridcolor="#24364d")
    return _embed(figure)
