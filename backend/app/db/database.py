from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def _build_engine() -> Engine:
    """
    Create SQLAlchemy engine.

    - Prefer `DATABASE_URL` (PostgreSQL in production)
    - Fallback to local SQLite for development convenience.
    """

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        # Dev fallback (does not affect production usage).
        database_url = "sqlite:///./app.db"

    # Standard engine arguments
    kwargs: dict[str, any] = {"echo": False}
    
    # For SQLite, allow connections from different threads.
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}

    return create_engine(database_url, **kwargs)


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

