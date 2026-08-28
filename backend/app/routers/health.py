"""Health check router — verifies DB, Redis, and nnInteractive connectivity."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Check connectivity to all backing services."""
    services = {}

    # PostgreSQL
    try:
        await db.execute(text("SELECT 1"))
        services["postgres"] = {"status": "ok"}
    except Exception as e:
        services["postgres"] = {"status": "error", "detail": str(e)}

    # Redis
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        services["redis"] = {"status": "ok"}
    except Exception as e:
        services["redis"] = {"status": "error", "detail": str(e)}

    # nnInteractive server (optional — may not be running in dev)
    try:
        import httpx

        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.nninteractive_url}/healthz")
            if resp.status_code == 200:
                services["nninteractive"] = {"status": "ok"}
            else:
                services["nninteractive"] = {
                    "status": "degraded",
                    "detail": f"HTTP {resp.status_code}",
                }
    except Exception:
        services["nninteractive"] = {
            "status": "unavailable",
            "detail": "Server not reachable (may be expected in dev)",
        }

    overall = "ok" if all(
        s.get("status") == "ok"
        for key, s in services.items()
        if key != "nninteractive"  # nnInteractive is optional
    ) else "degraded"

    return {"status": overall, "services": services}
