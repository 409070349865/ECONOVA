def validate_series(records):
    errors=[]
    seen=set()
    for row in records:
        key=(row.get("country_code"),row.get("indicator_code"),row.get("period"),row.get("source_id"))
        if key in seen: errors.append({"key":key,"issue":"duplicate natural key"})
        seen.add(key)
        try: float(row.get("value"))
        except (TypeError,ValueError): errors.append({"key":key,"issue":"value is not numeric"})
    return {"valid":not errors,"records":len(records),"errors":errors}
