"""
Asynchronous task dispatcher with zero-delay fallback.
If Celery / Redis is running, delegates to Celery.
Otherwise, executes in a background daemon thread instantly.
"""

import logging
import threading
import uuid
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_redis_available: bool | None = None


def check_redis_available() -> bool:
    """Quickly check if Redis broker is reachable (cached)."""
    global _redis_available
    if _redis_available is not None:
        return _redis_available
    try:
        import redis
        r = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=0.1, socket_timeout=0.1)
        r.ping()
        _redis_available = True
    except Exception:
        _redis_available = False
    return _redis_available


def run_async_task(celery_task: Any, *args, **kwargs) -> str:
    """
    Run task via Celery if available, otherwise launch background thread.
    Returns the task ID.
    """
    if check_redis_available():
        try:
            res = celery_task.delay(*args, **kwargs)
            return res.id
        except Exception as e:
            logger.warning(f"Celery queueing failed ({e}). Falling back to thread.")

    task_id = f"thread-{uuid.uuid4().hex[:8]}"

    def _worker():
        try:
            # Calling celery_task directly handles bind=True automatically
            celery_task(*args, **kwargs)
            logger.info(f"Background thread task {task_id} completed successfully")
        except Exception as e:
            logger.exception(f"Background thread task {task_id} failed: {e}")

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    logger.info(f"Launched background task in worker thread {task_id}")
    return task_id
