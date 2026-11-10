from app.services.scenarios import run_scenario
from app.services.forecasting import forecast_series

def test_scenario_math():
    result = run_scenario(100, 10)
    assert result["scenario"] == 110
    assert result["delta"] == 10

def test_forecast_contract():
    points = [{"period": str(2000+i), "value": 2+i*0.2} for i in range(20)]
    result = forecast_series(points, 3)
    assert len(result["forecast"]) == 3
    assert "rmse" in result["metrics"]
