from forecasting.evaluation.metrics import evaluate

def rolling_origin(values, min_train=8, horizon=1, predictor=None):
    if predictor is None: predictor=lambda train,h: [train[-1]]*h
    results=[]
    for end in range(min_train,len(values)-horizon+1):
        train=values[:end]; actual=values[end:end+horizon]; predicted=predictor(train,horizon)
        results.append({"origin":end,"metrics":evaluate(actual,predicted)})
    return results
