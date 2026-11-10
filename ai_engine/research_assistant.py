from ai_engine.rag.pipeline import build_context
from ai_engine.gemini_client import generate

async def answer(question, passages):
    context=build_context(question,passages)
    if not context["evidence_available"]:
        return {"answer":"No relevant evidence was retrieved. Add approved source documents before asking for a sourced explanation.","citations":[]}
    prompt=f"Use only this evidence and cite its source labels.\n{context['context']}\nQuestion: {question}"
    return {"answer":await generate(prompt),"citations":[{"title":p.get("title"),"source_url":p.get("source_url")} for p in context["passages"]]}
