from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def ensure_schema():
    """Create new tables and apply small additive migrations for existing local DBs."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as connection:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "display_name" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(120) NOT NULL DEFAULT ''"))
        scenario_columns = {column["name"] for column in inspector.get_columns("scenarios")}
        if "owner_id" not in scenario_columns:
            connection.execute(text("ALTER TABLE scenarios ADD COLUMN owner_id INTEGER"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
