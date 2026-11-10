from datetime import datetime, timezone

def provenance(provider, dataset, source_url, retrieved_at=None, vintage=None):
    return {"provider":provider,"dataset":dataset,"source_url":source_url,"retrieved_at":retrieved_at or datetime.now(timezone.utc).isoformat(),"vintage":vintage}
