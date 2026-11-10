from sklearn.linear_model import LinearRegression

def run(values, horizon=5):
    if len(values)<5: raise ValueError("At least five observations required")
    x=list(range(len(values)))
    model=LinearRegression().fit([[i] for i in x],values)
    return model.predict([[i] for i in range(len(values),len(values)+horizon)]).tolist()
