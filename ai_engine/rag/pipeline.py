from ai_engine.retrieval.ranking import retrieve

def build_context(question, passages, top_k=5):
    selected=retrieve(question,passages,top_k)
    return {"passages":selected,"context":"\n\n".join(x["text"] for x in selected),"evidence_available":bool(selected)}
