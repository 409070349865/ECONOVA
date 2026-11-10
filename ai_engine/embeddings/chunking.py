def chunk_text(text, size=900, overlap=120):
    if size<=overlap: raise ValueError("size must exceed overlap")
    chunks=[]; start=0
    while start<len(text):
        end=min(len(text),start+size); chunks.append(text[start:end]); start=end-overlap
    return chunks
