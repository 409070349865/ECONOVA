def percentage_shock(baseline, percent):
    if percent < -100: raise ValueError("A percentage shock cannot reduce the baseline below -100 percent")
    return {"baseline":baseline,"scenario":baseline*(1+percent/100),"delta":baseline*percent/100}
