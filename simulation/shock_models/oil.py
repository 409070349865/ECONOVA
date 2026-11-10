def oil_price_shock(baseline_price, shock_percent):
    return {"baseline_price":baseline_price,"scenario_price":baseline_price*(1+shock_percent/100),"shock_percent":shock_percent,"note":"Oil price shock only; downstream macroeconomic transmission is not modelled."}
