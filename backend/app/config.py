"""Ossilith backend configuration — loaded from environment variables."""

import os
from enum import Enum
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class NNInteractiveMode(str, Enum):
    LOCAL = "local"
    REMOTE = "remote"


class Settings(BaseSettings):
    """Application settings, sourced from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env") if (BASE_DIR / ".env").exists() else ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ───────────────────────────────────────────
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'ossilith.db'}"

    # ── Redis / Celery ─────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Storage ────────────────────────────────────────────
    data_dir: Path = BASE_DIR / "data" / "cases"

    # ── nnInteractive ──────────────────────────────────────
    nninteractive_mode: NNInteractiveMode = NNInteractiveMode.REMOTE
    nninteractive_url: str = "http://localhost:1527"
    nninteractive_api_key: str = ""

    # ── Network ────────────────────────────────────────────
    bind_host: str = "0.0.0.0"
    backend_port: int = 8000

    # ── Security ───────────────────────────────────────────
    secret_key: str = "change-me-in-production"

    @property
    def sync_database_url(self) -> str:
        url = str(self.database_url)
        if "+asyncpg" in url:
            return url.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
        if "+aiosqlite" in url:
            return url.replace("+aiosqlite", "")
        return url

    @property
    def celery_broker_url(self) -> str:
        return self.redis_url

    @property
    def celery_result_backend(self) -> str:
        return self.redis_url


settings = Settings()
