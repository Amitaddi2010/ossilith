"""Celery application factory."""

from celery import Celery

from app.config import settings

celery = Celery(
    "ossilith",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Auto-discover tasks in app.tasks package
    imports=["app.tasks.volume_tasks", "app.tasks.stl_tasks"],
)
