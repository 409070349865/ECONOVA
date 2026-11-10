def clean_points(points):
    valid=[{"period":str(x["period"]),"value":float(x["value"])} for x in points if x.get("value") is not None]
    valid.sort(key=lambda x:x["period"])
    return valid
