from statsmodels.tsa.statespace.sarimax import SARIMAX

def run(values, horizon=5, seasonal_period=12):
    if len(values) < max(12, seasonal_period*2):
        raise ValueError("Insufficient history for seasonal SARIMA")
    fitted=SARIMAX(values, order=(1,1,1), seasonal_order=(1,1,1,seasonal_period), enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
    result=fitted.get_forecast(horizon)
    return {"values":result.predicted_mean.tolist(),"intervals":result.conf_int().tolist()}
