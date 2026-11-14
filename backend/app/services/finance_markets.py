"""Daily market history and descriptive analytics for selected country indices.

Yahoo Finance's chart endpoint is used as a convenience source for daily OHLCV
history. It is not an exchange-grade real-time feed; provider availability and
market-data delay can vary by exchange and instrument.
"""

import asyncio
import io
import time
from datetime import datetime, timezone
from urllib.parse import quote as url_quote
from zoneinfo import ZoneInfo

import httpx
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from fastapi import HTTPException
from plotly.subplots import make_subplots

from app.core.config import settings


MARKET_RANGES = {
    "1d": "1 day",
    "5d": "5 days",
    "1mo": "1 month",
    "3mo": "3 months",
    "6mo": "6 months",
    "1y": "1 year",
    "5y": "5 years",
}

MARKET_INTERVALS = {"1d": "1m", "5d": "5m", "1mo": "1d", "3mo": "1d", "6mo": "1d", "1y": "1d", "5y": "1d"}

MARKET_UNIVERSE = [
    {"country_code": "IND", "country": "India", "assets": [
        {"id": "india-nifty-50", "name": "NIFTY 50", "symbol": "^NSEI", "exchange": "NSE", "currency": "INR"},
        {"id": "india-sensex", "name": "SENSEX", "symbol": "^BSESN", "exchange": "BSE", "currency": "INR"},
        {"id": "india-nifty-bank", "name": "NIFTY BANK", "symbol": "^NSEBANK", "exchange": "NSE", "currency": "INR"},
    ]},
    {"country_code": "USA", "country": "United States", "assets": [
        {"id": "usa-sp-500", "name": "S&P 500", "symbol": "^GSPC", "exchange": "SNP", "currency": "USD"},
        {"id": "usa-nasdaq", "name": "NASDAQ Composite", "symbol": "^IXIC", "exchange": "NASDAQ", "currency": "USD"},
        {"id": "usa-dow-jones", "name": "Dow Jones Industrial Average", "symbol": "^DJI", "exchange": "DJI", "currency": "USD"},
    ]},
    {"country_code": "JPN", "country": "Japan", "assets": [
        {"id": "japan-nikkei-225", "name": "Nikkei 225", "symbol": "^N225", "exchange": "NIKKEI", "currency": "JPY"},
    ]},
    {"country_code": "GBR", "country": "United Kingdom", "assets": [
        {"id": "uk-ftse-100", "name": "FTSE 100", "symbol": "^FTSE", "exchange": "LSE", "currency": "GBP"},
    ]},
    {"country_code": "DEU", "country": "Germany", "assets": [
        {"id": "germany-dax", "name": "DAX", "symbol": "^GDAXI", "exchange": "XETRA", "currency": "EUR"},
    ]},
    {"country_code": "CHN", "country": "China", "assets": [
        {"id": "china-sse-composite", "name": "SSE Composite", "symbol": "000001.SS", "exchange": "SSE", "currency": "CNY"},
    ]},
]

_ASSETS = {asset["id"]: {**asset, "country_code": country["country_code"], "country": country["country"]}
           for country in MARKET_UNIVERSE for asset in country["assets"]}
_CACHE_TTL_SECONDS = 300
_CACHE: dict[tuple[str, str], tuple[float, dict]] = {}
_CACHE_LOCK = asyncio.Lock()


class MarketDataError(Exception):
    """A safe, user-displayable market-data provider error."""


def market_catalog():
    return {"countries": MARKET_UNIVERSE, "provider": "Yahoo Finance chart history", "provider_url": "https://finance.yahoo.com/", "disclaimer": "Intraday bars refresh while selected but provider delay is unspecified; daily history is not an exchange-grade real-time feed."}


def _asset(asset_id: str):
    asset = _ASSETS.get(asset_id)
    if not asset:
        raise HTTPException(404, "Unknown market index. Choose an index from the market list.")
    return asset


def _finite(value):
    if value is None:
        return None
    number = float(value)
    return number if np.isfinite(number) else None


async def _fetch_market_history(asset: dict, range_key: str) -> dict:
    if range_key not in MARKET_RANGES:
        raise HTTPException(422, f"Range must be one of: {', '.join(MARKET_RANGES)}")

    cache_key = (asset["id"], range_key)
    cached = _CACHE.get(cache_key)
    now = time.monotonic()
    ttl = 20 if range_key in {"1d", "5d"} else _CACHE_TTL_SECONDS
    if cached and now - cached[0] < ttl:
        return cached[1]

    async with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        now = time.monotonic()
        if cached and now - cached[0] < ttl:
            return cached[1]
        url_symbol = url_quote(asset["symbol"], safe="")
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{url_symbol}"
        params = {"range": range_key, "interval": MARKET_INTERVALS[range_key], "events": "history"}
        transport = httpx.AsyncHTTPTransport(local_address=settings.provider_http_local_address)
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(20, connect=8),
                headers={"User-Agent": "ECONOVA/1.0 (historical market analytics)", "Accept": "application/json"},
                transport=transport,
            ) as client:
                response = await client.get(url, params=params)
            if response.status_code == 429:
                raise MarketDataError("The market-data source is rate-limiting requests. Wait a few minutes and retry.")
            response.raise_for_status()
            body = response.json()
        except MarketDataError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise MarketDataError("The market-data source could not be reached. Try again later; no sample prices are shown.") from exc

        chart = body.get("chart") or {}
        if chart.get("error"):
            raise MarketDataError("The market-data source did not return this index. Choose another index or try later.")
        result = (chart.get("result") or [None])[0]
        if not result:
            raise MarketDataError("No daily market history was returned for this index and date range.")
        timestamps = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        timezone_name = (result.get("meta") or {}).get("exchangeTimezoneName") or "UTC"
        try:
            market_timezone = ZoneInfo(timezone_name)
        except Exception:
            market_timezone = timezone.utc

        rows = []
        for index, timestamp in enumerate(timestamps):
            close = _finite((quote.get("close") or [None] * len(timestamps))[index])
            if close is None:
                continue
            market_time = datetime.fromtimestamp(timestamp, tz=timezone.utc).astimezone(market_timezone)
            day = market_time.strftime("%Y-%m-%d %H:%M" if range_key in {"1d", "5d"} else "%Y-%m-%d")
            rows.append({
                "date": day,
                "open": _finite((quote.get("open") or [None] * len(timestamps))[index]),
                "high": _finite((quote.get("high") or [None] * len(timestamps))[index]),
                "low": _finite((quote.get("low") or [None] * len(timestamps))[index]),
                "close": close,
                "volume": _finite((quote.get("volume") or [None] * len(timestamps))[index]),
            })
        rows.sort(key=lambda item: item["date"])
        if len(rows) < 10:
            granularity = "intraday bars" if range_key in {"1d", "5d"} else "daily observations"
            raise MarketDataError(f"The provider returned too few {granularity} for this selection. Try another range or refresh during market hours.")

        metadata = result.get("meta") or {}
        data = {
            "asset": asset,
            "provider": "Yahoo Finance",
            "source_url": f"https://finance.yahoo.com/quote/{url_symbol}/history/",
            "currency": metadata.get("currency") or asset["currency"],
            "exchange_timezone": timezone_name,
            "market_delay_seconds": metadata.get("exchangeDataDelayedBy"),
            "market_state": metadata.get("marketState"),
            "interval": MARKET_INTERVALS[range_key],
            "intraday": range_key in {"1d", "5d"},
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "items": rows,
        }
        _CACHE[cache_key] = (time.monotonic(), data)
        if len(_CACHE) > 48:
            oldest = sorted(_CACHE, key=lambda key: _CACHE[key][0])[:12]
            for old_key in oldest:
                _CACHE.pop(old_key, None)
        return data


def _technical_analysis(data: dict, horizon: int) -> dict:
    if horizon not in {5, 20, 60}:
        raise HTTPException(422, "Forecast horizon must be 5, 20, or 60 trading sessions.")
    frame = pd.DataFrame(data["items"])
    close = frame["close"].astype(float)
    high = frame["high"].astype(float)
    low = frame["low"].astype(float)
    frame["sma20"] = close.rolling(20, min_periods=20).mean()
    frame["sma50"] = close.rolling(50, min_periods=50).mean()
    frame["sma200"] = close.rolling(200, min_periods=200).mean()
    frame["return_pct"] = close.pct_change() * 100
    delta = close.diff()
    average_gain = delta.clip(lower=0).ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    average_loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    relative_strength = average_gain / average_loss.replace(0, np.nan)
    frame["rsi14"] = 100 - (100 / (1 + relative_strength))
    frame.loc[(average_loss == 0) & (average_gain > 0), "rsi14"] = 100
    frame.loc[(average_loss == 0) & (average_gain == 0), "rsi14"] = 50
    frame["ema12"] = close.ewm(span=12, adjust=False).mean()
    frame["ema26"] = close.ewm(span=26, adjust=False).mean()
    frame["macd"] = frame["ema12"] - frame["ema26"]
    frame["macd_signal"] = frame["macd"].ewm(span=9, adjust=False).mean()
    frame["band_mid"] = close.rolling(20, min_periods=20).mean()
    band_std = close.rolling(20, min_periods=20).std()
    frame["band_upper"] = frame["band_mid"] + 2 * band_std
    frame["band_lower"] = frame["band_mid"] - 2 * band_std

    latest = frame.iloc[-1]
    previous_close = float(close.iloc[-2])
    current_close = float(close.iloc[-1])
    change = current_close - previous_close
    change_pct = (change / previous_close) * 100 if previous_close else 0
    trend_flags = []
    if _finite(latest["sma20"]) is not None:
        trend_flags.append(current_close >= latest["sma20"])
    if _finite(latest["sma50"]) is not None:
        trend_flags.append(current_close >= latest["sma50"])
    if _finite(latest["sma200"]) is not None:
        trend_flags.append(current_close >= latest["sma200"])
    positive_flags = sum(trend_flags)
    if trend_flags and positive_flags == len(trend_flags):
        trend = "Price above tracked averages"
        trend_signal = "positive"
    elif trend_flags and positive_flags == 0:
        trend = "Price below tracked averages"
        trend_signal = "negative"
    else:
        trend = "Mixed moving-average setup"
        trend_signal = "neutral"

    rsi = _finite(latest["rsi14"])
    momentum = "Neutral range"
    momentum_signal = "neutral"
    if rsi is not None and rsi >= 70:
        momentum, momentum_signal = "RSI is in a high-momentum zone", "caution"
    elif rsi is not None and rsi <= 30:
        momentum, momentum_signal = "RSI is in a low-momentum zone", "caution"
    macd = _finite(latest["macd"])
    macd_signal = _finite(latest["macd_signal"])
    macd_reading = "MACD above signal line" if macd is not None and macd_signal is not None and macd > macd_signal else "MACD below signal line"
    tail_returns = np.log(close / close.shift(1)).dropna().tail(60).to_numpy(dtype=float)
    if len(tail_returns) < 10:
        raise MarketDataError("At least 10 daily returns are needed for this statistical summary.")
    daily_volatility = float(np.std(tail_returns, ddof=1))
    recent_volatility = float(np.std(tail_returns[-20:], ddof=1)) * (100 if data.get("intraday") else np.sqrt(252) * 100)
    drift = float(np.clip(np.mean(tail_returns), -0.03, 0.03))
    expected = current_close * float(np.exp(drift * horizon))
    z_value = 1.2815515655446004  # Central 80% range under the log-return approximation.
    half_width = z_value * daily_volatility * np.sqrt(horizon)
    lower = current_close * float(np.exp(drift * horizon - half_width))
    upper = current_close * float(np.exp(drift * horizon + half_width))
    recent = frame.tail(min(20, len(frame)))
    volume_values = frame["volume"].dropna()
    last_volume = _finite(frame["volume"].iloc[-1]) if len(frame["volume"]) else None
    average_volume = _finite(volume_values.tail(20).mean()) if len(volume_values) else None
    volume_ratio = last_volume / average_volume if last_volume is not None and average_volume else None

    enriched = []
    for row in frame.to_dict(orient="records"):
        enriched.append({
            **{key: row[key] for key in ("date", "open", "high", "low", "close", "volume")},
            "sma20": _finite(row.get("sma20")), "sma50": _finite(row.get("sma50")),
            "sma200": _finite(row.get("sma200")), "rsi14": _finite(row.get("rsi14")),
            "macd": _finite(row.get("macd")), "band_upper": _finite(row.get("band_upper")),
            "band_lower": _finite(row.get("band_lower")),
        })
    return {
        **data,
        "items": enriched,
        "summary": {
            "latest_close": current_close, "previous_close": previous_close,
            "change": change, "change_percent": change_pct,
            "latest_date": frame["date"].iloc[-1], "rsi14": rsi,
            "sma20": _finite(latest["sma20"]), "sma50": _finite(latest["sma50"]),
            "sma200": _finite(latest["sma200"]), "macd": macd, "macd_signal": macd_signal,
            "annualized_volatility_20d": recent_volatility,
            "volatility_label": "Recent 20-bar volatility" if data.get("intraday") else "Annualized 20-session volatility",
            "support_20d": float(recent["low"].min()), "resistance_20d": float(recent["high"].max()),
            "high_52w": float(high.tail(252).max()), "low_52w": float(low.tail(252).min()),
            "last_volume": last_volume, "average_volume_20d": average_volume, "volume_ratio_20d": volume_ratio,
        },
        "patterns": [
            {"name": "Trend", "reading": trend, "signal": trend_signal, "detail": f"Close compared with available 20-, 50-, and 200-{ 'bar' if data.get('intraday') else 'session' } moving averages."},
            {"name": "Momentum", "reading": momentum, "signal": momentum_signal, "detail": f"14-session RSI: {rsi:.1f}" if rsi is not None else "RSI is not yet available."},
            {"name": "MACD", "reading": macd_reading, "signal": "positive" if macd is not None and macd_signal is not None and macd > macd_signal else "negative", "detail": "12/26-session exponential averages with a 9-session signal line."},
            {"name": "20-session range", "reading": "Historical support/resistance zone", "signal": "neutral", "detail": "Recent low and high are descriptive levels, not guaranteed price floors or ceilings."},
        ],
        "forecast": {
            "horizon_sessions": horizon,
            "horizon_unit": "bars" if data.get("intraday") else "sessions",
            "central_estimate": expected,
            "range_low": lower,
            "range_high": upper,
            "range_confidence": "Approx. 80% range under a log-return assumption",
            "model": "Recent mean log return and realized volatility",
            "return_observations": len(tail_returns),
            "warning": "This is an approximate terminal closing-level range under a log-return assumption, not a forecast of the path's intraday high/low or a reliable price target. It is not calibrated to guarantee 80% coverage; markets can move beyond it. Intraday views measure bars, not full trading sessions. Not investment advice.",
        },
    }


async def get_market_analysis(asset_id: str, range_key: str = "1y", horizon: int = 20) -> dict:
    asset = _asset(asset_id)
    data = await _fetch_market_history(asset, range_key)
    return _technical_analysis(data, horizon)


async def get_plotly_market_html(asset_id: str, range_key: str = "1y") -> str:
    data = await get_market_analysis(asset_id, range_key, 20)
    frame = pd.DataFrame(data["items"])
    figure = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.08,
                           row_heights=[0.76, 0.24])
    figure.add_trace(go.Candlestick(x=frame["date"], open=frame["open"], high=frame["high"], low=frame["low"], close=frame["close"],
                                    name="OHLC", increasing_line_color="#20c997", decreasing_line_color="#fb7185"), row=1, col=1)
    for key, label, color in (("sma20", "SMA 20", "#57d9ca"), ("sma50", "SMA 50", "#a78bfa"),
                              ("sma200", "SMA 200", "#fbbf24"), ("band_upper", "Bollinger upper", "#7890aa"),
                              ("band_lower", "Bollinger lower", "#7890aa")):
        if frame[key].notna().any():
            figure.add_trace(go.Scatter(x=frame["date"], y=frame[key], mode="lines", name=label,
                                        line={"color": color, "width": 1, "dash": "dot" if "Bollinger" in label else "solid"}), row=1, col=1)
    figure.add_trace(go.Bar(x=frame["date"], y=frame["volume"].fillna(0), name="Volume", marker_color="#526981"), row=2, col=1)
    figure.update_layout(template="plotly_dark", paper_bgcolor="#111d30", plot_bgcolor="#0b1422", font={"color": "#dce7f1", "size": 11},
                         title={"text": f"{data['asset']['name']} · {'intraday' if data.get('intraday') else 'daily'} OHLC", "x": 0.02, "y": 0.99, "font": {"size": 15}},
                         margin={"l": 58, "r": 20, "t": 122, "b": 34}, height=540, autosize=True, xaxis_rangeslider_visible=False,
                         legend={"orientation": "h", "y": 1.10, "x": 0, "xanchor": "left", "yanchor": "bottom", "font": {"size": 10}}, hovermode="x unified")
    figure.update_yaxes(title_text=data["currency"], row=1, col=1, gridcolor="#24364d")
    figure.update_yaxes(title_text="Bar volume" if data.get("intraday") else "Daily volume", row=2, col=1, gridcolor="#24364d")
    figure.update_xaxes(gridcolor="#24364d")
    html = figure.to_html(full_html=True, include_plotlyjs="cdn", config={"responsive": True, "displaylogo": False, "scrollZoom": True})
    css = "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111d30}body{font-family:Arial,sans-serif}.plotly-graph-div{width:100%!important;height:100%!important}</style>"
    return html.replace("</head>", f"{css}</head>", 1)


async def get_market_diagnostics_png(asset_id: str, range_key: str = "1y") -> bytes:
    data = await get_market_analysis(asset_id, range_key, 20)
    return await asyncio.to_thread(_render_market_diagnostics_png, data)


def _render_market_diagnostics_png(data: dict) -> bytes:
    frame = pd.DataFrame(data["items"])
    frame["daily_return_pct"] = frame["close"].pct_change() * 100
    frame["rolling_volatility"] = frame["daily_return_pct"].rolling(20).std() * np.sqrt(252)

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns

    sns.set_theme(style="darkgrid", context="notebook")
    figure, axes = plt.subplots(1, 2, figsize=(12, 4.2), facecolor="#111d30")
    for axis in axes:
        axis.set_facecolor("#111d30")
        axis.tick_params(colors="#c2d0dd")
        axis.xaxis.label.set_color("#c2d0dd")
        axis.yaxis.label.set_color("#c2d0dd")
        axis.title.set_color("#eaf1f8")
    returns = frame["daily_return_pct"].dropna()
    sns.histplot(returns, bins=35, kde=True, color="#27c6b2", ax=axes[0])
    axes[0].set_title("Daily return distribution")
    axes[0].set_xlabel("Daily close-to-close return (%)")
    axes[0].set_ylabel("Sessions")
    sns.lineplot(data=frame, x="date", y=frame["rolling_volatility"] * 100, color="#a78bfa", ax=axes[1])
    axes[1].set_title("20-session rolling volatility")
    axes[1].set_xlabel("Trading date")
    axes[1].set_ylabel("Annualized volatility (%)")
    axes[1].tick_params(axis="x", rotation=30)
    figure.suptitle(f"{data['asset']['name']} · return and risk diagnostics", color="#eaf1f8", fontsize=12)
    figure.tight_layout()
    output = io.BytesIO()
    figure.savefig(output, format="png", dpi=135, bbox_inches="tight", facecolor=figure.get_facecolor())
    plt.close(figure)
    return output.getvalue()
