from statsmodels.tsa.api import VAR

def run(frame, horizon=5):
    if frame.shape[1] < 2 or len(frame) < 10:
        raise ValueError("VAR requires at least two series and ten aligned observations")
    model=VAR(frame).fit(maxlags=2)
    return model.forecast(frame.values[-model.k_ar:], steps=horizon).tolist()
