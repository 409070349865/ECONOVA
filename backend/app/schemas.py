from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ScenarioInput(BaseModel):
    name: str = Field(default="Untitled scenario", min_length=1, max_length=160)
    variable: str = Field(default="GDP growth", min_length=1, max_length=80)
    baseline_value: float = Field(allow_inf_nan=False)
    shock_percent: float = Field(ge=-100, le=500, allow_inf_nan=False)
    assumptions: str = Field(default="Conditional sensitivity assumption", max_length=2000)

class ResearchUploadReference(BaseModel):
    id: str = Field(min_length=36, max_length=36)
    token: str = Field(min_length=32, max_length=128)

class ResearchMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=6000)

class ResearchQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    country: str = Field(default="JPN", min_length=3, max_length=3, pattern="^[A-Za-z]{3}$")
    uploads: list[ResearchUploadReference] = Field(default_factory=list, max_length=5)
    history: list[ResearchMessage] = Field(default_factory=list, max_length=12)

class ForecastInput(BaseModel):
    country: str = Field(default="IND", min_length=3, max_length=3, pattern="^[A-Za-z]{3}$")
    indicator: str = Field(default="NY.GDP.MKTP.KD.ZG", min_length=1, max_length=80, pattern="^[A-Za-z0-9._]+$")
    horizon: int = Field(default=5, ge=1, le=15)
    model: str = Field(default="auto", pattern="^(auto|naive|arima)$")

class RoleUpdate(BaseModel):
    role: str = Field(pattern="^(researcher|analyst|SUPER_ADMIN)$")
