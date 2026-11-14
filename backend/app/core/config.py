import secrets
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    app_name: str = "ECONOVA"
    database_url: str = "sqlite:///./econova.db"
    secret_key: str = Field(default="", repr=False)
    access_token_minutes: int = 720
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    provider_http_local_address: str = "0.0.0.0"
    frontend_origin: str = "http://localhost:5173"
    # Resolve dotenv files from the repository instead of the process working
    # directory, which differs between local runs and deployment containers.
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"),
        extra="ignore",
    )

    @model_validator(mode="after")
    def configure_signing_key(self):
        if not self.secret_key:
            if not self.database_url.startswith("sqlite"):
                raise ValueError("Set SECRET_KEY to a long random value when using a shared database.")
            # Safe for a single-process local SQLite development instance only.
            self.secret_key = secrets.token_urlsafe(48)
        if len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must contain at least 32 characters.")
        return self

settings = Settings()
