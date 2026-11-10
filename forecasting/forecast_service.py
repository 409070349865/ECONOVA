from forecasting.preprocessing.series import clean_points
from backend.app.services.forecasting import forecast_series

def generate(points,horizon=5):
    return forecast_series(clean_points(points),horizon)
