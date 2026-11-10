from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def retrieve(query, documents, top_k=5):
    if not documents: return []
    corpus=[query]+[d["text"] for d in documents]
    matrix=TfidfVectorizer(stop_words="english").fit_transform(corpus)
    scores=cosine_similarity(matrix[0:1],matrix[1:]).ravel()
    order=scores.argsort()[::-1][:top_k]
    return [{**documents[i],"score":float(scores[i])} for i in order if scores[i]>0]
