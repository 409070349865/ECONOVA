from backend.app.services.forecasting import forecast_series

def run(points, horizon=5):
    return forecast_series(points, horizon, "arima")
