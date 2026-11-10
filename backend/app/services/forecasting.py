import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from sklearn.metrics import mean_absolute_error, mean_squared_error

def forecast_series(points, horizon=5, model="auto"):
    if model not in {"auto", "naive", "arima"}:
        raise ValueError("Model must be auto, naive, or arima")
    points = sorted(points, key=lambda x: x["period"])
    values = np.asarray([float(p["value"]) for p in points], dtype=float)
    if len(values) < 8:
        raise ValueError("At least 8 historical observations are required for forecasting")
    split = max(5, int(len(values) * 0.8))
    train, test = values[:split], values[split:]
    baseline = np.repeat(train[-1], len(test))
    baseline_mae = float(mean_absolute_error(test, baseline)) if len(test) else None
    fallback_warning = None
    if model == "naive":
        chosen = "naive"
        mae = baseline_mae
        rmse = float(np.sqrt(mean_squared_error(test, baseline))) if len(test) else None
        predictions = [float(values[-1])] * horizon
        bounds = [[float(values[-1]), float(values[-1])] for _ in range(horizon)]
        fallback_warning = "Naive forecasts carry the last observation forward; their equal lower/upper values are not probabilistic prediction intervals."
    else:
        chosen = "ARIMA(1,1,1)"
        try:
            fitted = ARIMA(train, order=(1, 1, 1)).fit()
            test_prediction = fitted.forecast(steps=max(1, len(test)))
            mae = float(mean_absolute_error(test, test_prediction[:len(test)])) if len(test) else None
            rmse = float(np.sqrt(mean_squared_error(test, test_prediction[:len(test)]))) if len(test) else None
            final_fit = ARIMA(values, order=(1, 1, 1)).fit()
            result = final_fit.get_forecast(steps=horizon)
            predictions = result.predicted_mean.tolist()
            bounds = result.conf_int().tolist()
        except Exception:
            chosen = "naive"
            mae = baseline_mae
            rmse = float(np.sqrt(mean_squared_error(test, baseline))) if len(test) else None
            predictions = [float(values[-1])] * horizon
            bounds = [[float(values[-1]), float(values[-1])] for _ in range(horizon)]
            fallback_warning = "ARIMA could not be fit reliably; a naive last-observation fallback was used, without probabilistic intervals."
    last = int(points[-1]["period"])
    warning = fallback_warning or "Forecasts are conditional estimates with model-based intervals; compare with the naive baseline and inspect data quality."
    return {"model": chosen, "horizon": horizon, "history": points, "forecast": [{"period": str(last+i+1), "value": float(predictions[i]), "lower": float(bounds[i][0]), "upper": float(bounds[i][1])} for i in range(horizon)], "metrics": {"mae": mae, "rmse": rmse, "naive_mae": baseline_mae}, "training_observations": len(values), "warning": warning}
