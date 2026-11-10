def align_series(series_a, series_b):
    a={str(x["period"]):x["value"] for x in series_a}
    b={str(x["period"]):x["value"] for x in series_b}
    periods=sorted(set(a)&set(b))
    return [{"period":p,"a":a[p],"b":b[p],"delta":a[p]-b[p]} for p in periods]
