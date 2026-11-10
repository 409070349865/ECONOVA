import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

def evaluate(actual, predicted):
    if len(actual)!=len(predicted) or not actual: raise ValueError("Actual and predicted arrays must have equal non-zero length")
    return {"mae":float(mean_absolute_error(actual,predicted)),"rmse":float(np.sqrt(mean_squared_error(actual,predicted))),"bias":float(np.mean(np.asarray(predicted)-np.asarray(actual)))}
