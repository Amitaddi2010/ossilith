"""SQLAlchemy async engine and session factory."""

import os
from pathlib import Path
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

db_url = settings.database_url

from sqlalchemy.pool import NullPool

# If sqlite, ensure directory exists and use NullPool for unlimited async connections
if "sqlite" in db_url:
    engine_kwargs = {
        "poolclass": NullPool,
        "connect_args": {"timeout": 30.0},
    }
    db_path = db_url.split("///")[-1]
    if db_path:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
else:
    engine_kwargs = {
        "pool_size": 50,
        "max_overflow": 100,
        "pool_timeout": 60,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }

try:
    engine = create_async_engine(db_url, echo=False, **engine_kwargs)
except Exception:
    # Fallback to local SQLite for workstation dev
    sqlite_path = Path("./data/ossilith.db").resolve()
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    fallback_url = f"sqlite+aiosqlite:///{sqlite_path}"
    engine = create_async_engine(fallback_url, echo=False, poolclass=NullPool, connect_args={"timeout": 30.0})



# Enable WAL mode and high-concurrency pragmas for SQLite
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in db_url or "sqlite" in str(engine.url):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()
        except Exception:
            pass


async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency — yields an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            if session.is_active:
                await session.commit()
        except Exception:
            if session.is_active:
                await session.rollback()
            raise
        finally:
            await session.close()

