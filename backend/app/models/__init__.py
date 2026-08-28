"""SQLAlchemy ORM models for the Ossilith case-based data model."""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid as UUID,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


# ── Enums ──────────────────────────────────────────────────


class CaseStatus(str, PyEnum):
    CREATED = "created"
    IMPORTING = "importing"
    IMPORTED = "imported"
    RECONSTRUCTING = "reconstructing"
    READY = "ready"
    SEGMENTING = "segmenting"
    GENERATING_STL = "generating_stl"
    COMPLETE = "complete"
    ERROR = "error"


class JobType(str, PyEnum):
    VOLUME_RECONSTRUCTION = "volume_reconstruction"
    STL_GENERATION = "stl_generation"


class JobStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class LayerStatus(str, PyEnum):
    ACTIVE = "active"
    ACCEPTED = "accepted"


# ── Models ─────────────────────────────────────────────────


class Case(Base):
    """Top-level entity: one case = one patient series + downstream artifacts."""

    __tablename__ = "cases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CaseStatus] = mapped_column(
        Enum(CaseStatus), default=CaseStatus.CREATED, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    series: Mapped[list["Series"]] = relationship(back_populates="case", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="case", cascade="all, delete-orphan")
    edit_history: Mapped[list["EditHistory"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )


class Series(Base):
    """A DICOM series within a case, plus the reconstructed volume path."""

    __tablename__ = "series"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    series_instance_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    modality: Mapped[str] = mapped_column(String(16), nullable=False)
    slice_count: Mapped[int] = mapped_column(Integer, nullable=False)
    pixel_spacing_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    pixel_spacing_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    slice_thickness: Mapped[float | None] = mapped_column(Float, nullable=True)
    dicom_dir: Mapped[str] = mapped_column(Text, nullable=False)
    volume_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_selected: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    case: Mapped["Case"] = relationship(back_populates="series")
    layers: Mapped[list["SegmentationLayer"]] = relationship(
        back_populates="series", cascade="all, delete-orphan"
    )


class SegmentationLayer(Base):
    """A named segmentation layer — one nnInteractive session per layer."""

    __tablename__ = "segmentation_layers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    series_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("series.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#00FFAA")  # Hex color
    status: Mapped[LayerStatus] = mapped_column(
        Enum(LayerStatus), default=LayerStatus.ACTIVE, nullable=False
    )
    mask_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    nninteractive_session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    series: Mapped["Series"] = relationship(back_populates="layers")
    stl_artifacts: Mapped[list["STLArtifact"]] = relationship(
        back_populates="layer", cascade="all, delete-orphan"
    )


class STLArtifact(Base):
    """Generated STL file with provenance metadata."""

    __tablename__ = "stl_artifacts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    layer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("segmentation_layers.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vertex_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    face_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pipeline_version: Mapped[str] = mapped_column(String(64), default="v0.1.0")
    generation_params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    layer: Mapped["SegmentationLayer"] = relationship(back_populates="stl_artifacts")


class Job(Base):
    """Async job tracking — Celery task metadata + progress."""

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[JobType] = mapped_column(Enum(JobType), nullable=False)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), default=JobStatus.PENDING, nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)  # 0–100
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    case: Mapped["Case"] = relationship(back_populates="jobs")


class EditHistory(Base):
    """Persistent edit history for undo/redo across sessions."""

    __tablename__ = "edit_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    operation_type: Mapped[str] = mapped_column(String(64), nullable=False)
    operation_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    stl_snapshot_paths: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    case: Mapped["Case"] = relationship(back_populates="edit_history")
