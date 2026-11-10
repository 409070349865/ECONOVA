import httpx
from backend.app.core.config import settings

async def generate(prompt):
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    endpoint=f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"
    async with httpx.AsyncClient(timeout=30) as client:
        response=await client.post(endpoint,json={"contents":[{"parts":[{"text":prompt}]}]})
        response.raise_for_status()
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]
