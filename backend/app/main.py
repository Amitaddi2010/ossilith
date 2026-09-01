"""Ossilith FastAPI application."""

from contextlib import asynccontextmanager

import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

from app.config import settings
from app.database import engine
from app.models import Base
from app.routers import cases, health, import_, volume, segmentation, stl, autoseg


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Create tables if they don't exist (dev convenience — use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: dispose engine
    await engine.dispose()


app = FastAPI(
    title="Ossilith",
    description="CT DICOM to surgical planning STL pipeline",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        f"http://localhost:{settings.backend_port}",
        f"http://127.0.0.1:{settings.backend_port}",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return JSON error with CORS headers intact."""
    logger.exception(f"Unhandled server error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )

# ── Routers ────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(cases.router)
app.include_router(import_.router)
app.include_router(volume.router)
app.include_router(segmentation.router)
app.include_router(stl.router)
app.include_router(autoseg.router)


@app.get("/")
async def root():
    return {"app": "Ossilith", "version": "0.1.0", "docs": "/docs"}
