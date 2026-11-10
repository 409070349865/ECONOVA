from app.core.config import settings

async def answer_question(question: str, evidence: list[dict] | None = None):
    passages = [item for item in (evidence or []) if item.get("text") and item.get("source")]
    if not passages:
        return {
            "answer": "No answer was generated because ECONOVA has no retrieved, citable evidence for this question. Load and index source documents before requesting a data-backed response.",
            "citations": [],
            "mode": "evidence-unavailable",
            "limitations": ["No document retrieval corpus is configured", "No economic statistics or citations were generated"],
            "provider_configured": bool(settings.gemini_api_key),
        }
    # This function intentionally does not send arbitrary user text to the provider.
    # A document-ingestion/retrieval workflow with validated page citations is not yet available.
    return {
        "answer": "The retrieved passages are available for review, but grounded AI synthesis is not enabled until page-level citation validation is implemented.",
        "citations": [{"source": item["source"], "page": item.get("page")} for item in passages],
        "mode": "grounding-required",
        "limitations": ["AI synthesis is disabled to prevent unsupported statistics or citations"],
        "provider_configured": bool(settings.gemini_api_key),
    }
