from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.database import get_db
from app.models import User

pwd = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt"],
    deprecated="bcrypt",
    pbkdf2_sha256__default_rounds=600_000,
)
oauth = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def hash_password(value: str) -> str:
    return pwd.hash(value)

def verify_password(value: str, hashed: str) -> bool:
    return pwd.verify(value, hashed)

def create_token(user_id: int) -> str:
    expiry = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expiry}, settings.secret_key, algorithm="HS256")

def current_user(token: str = Depends(oauth), db: Session = Depends(get_db)):
    error = HTTPException(status_code=401, detail="Invalid or expired authentication token")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (JWTError, ValueError, KeyError):
        raise error
    if not user:
        raise error
    return user

def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Administrator access is required")
    return user
