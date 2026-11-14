from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.staticfiles import StaticFiles
from app.core.config import settings
from app.database import ensure_schema, engine
from app import models
from app.api.v1 import router

ensure_schema()
app = FastAPI(title=settings.app_name, version="1.0.0", description="Economic intelligence, forecasting and scenario analysis API")
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
allowed_origins = list(dict.fromkeys([settings.frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173"]))
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=False, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Authorization", "Content-Type"])
app.include_router(router)

@app.get("/")
def root():
    index = frontend_dist / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"name": "ECONOVA", "version": "1.0.0", "docs": "/docs"}

@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database health check failed")
    return {"status": "healthy", "service": "econova-api", "database": "available"}


if frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="frontend-assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend_routes(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        requested_file = (frontend_dist / path).resolve()
        if requested_file.is_relative_to(frontend_dist.resolve()) and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(frontend_dist / "index.html")
