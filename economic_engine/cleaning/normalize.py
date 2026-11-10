def normalize_observation(country_code, indicator_code, period, value, unit, source_id):
    if not country_code or len(country_code) != 3:
        raise ValueError("country_code must be a three-character ISO3 code")
    if not indicator_code or not period or not unit or not source_id:
        raise ValueError("Indicator, period, unit and source are required")
    numeric = float(value)
    return {"country_code": country_code.upper(), "indicator_code": indicator_code, "period": str(period), "value": numeric, "unit": unit, "source_id": source_id}
