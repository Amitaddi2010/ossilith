"""SQLAlchemy async engine and session factory."""

import os
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

db_url = settings.database_url

# If sqlite, ensure directory exists
if "sqlite" in db_url:
    engine_kwargs = {}
    db_path = db_url.split("///")[-1]
    if db_path:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
else:
    engine_kwargs = {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
    }

try:
    engine = create_async_engine(db_url, echo=False, **engine_kwargs)
except Exception:
    # Fallback to local SQLite for workstation dev
    sqlite_path = Path("./data/ossilith.db").resolve()
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    fallback_url = f"sqlite+aiosqlite:///{sqlite_path}"
    engine = create_async_engine(fallback_url, echo=False)

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
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
