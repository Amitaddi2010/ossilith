"""
Auto-segmentation router — TotalSegmentator integration for automated CT anatomy extraction.
"""

import logging
import uuid
from typing import Any, List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Case, Series, SegmentationLayer, Job, JobType, JobStatus, CaseStatus
from app.services.task_runner import run_async_task
from app.tasks.autoseg_tasks import run_totalsegmentator_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cases", tags=["autosegmentation"])


# ── Schemas ────────────────────────────────────────────────

class AutoSegPreset(BaseModel):
    id: str
    name: str
    description: str
    structures_count: int
    category: str
    recommended_for: str


class AutoSegRequest(BaseModel):
    task: str = Field(default="total", description="TotalSegmentator task name (e.g. 'total', 'body', 'bones', 'organs', 'tissue_types', 'appendicular_bones')")
    fast: bool = Field(default=False, description="Run in fast mode (lower resolution for faster inference)")
    generate_stls: bool = Field(default=False, description="Automatically queue 3D STL generation for all extracted structures")


class AutoSegResponse(BaseModel):
    job_id: str
    status: str
    message: str
    case_id: str
    series_id: str
    task: str
    fast: bool


# ── Presets Catalog ────────────────────────────────────────

AVAILABLE_TASKS: List[AutoSegPreset] = [
    AutoSegPreset(
        id="total",
        name="All 117+ Anatomical Structures (Total)",
        description="Comprehensive full-body AI segmentation of all major organs, skeletal framework, vascular structures, and key muscles.",
        structures_count=117,
        category="Comprehensive",
        recommended_for="Full CT scans & multi-system surgical planning",
    ),
    AutoSegPreset(
        id="bones",
        name="Skeletal Framework & Bones",
        description="Extracts cranial vault, spine (C/T/L/S vertebrae), ribs, pelvis, femurs, tibias, and shoulder girdle with zero-drift accuracy.",
        structures_count=42,
        category="Orthopedic",
        recommended_for="Osteotomies, joint arthroplasty, and trauma reconstruction",
    ),
    AutoSegPreset(
        id="appendicular_bones",
        name="Extremity & Appendicular Bones",
        description="Focused segmentation of upper and lower extremities (femur, tibia, fibula, patella, humerus, radius, ulna).",
        structures_count=16,
        category="Orthopedic",
        recommended_for="Limb deformity correction & limb-sparing surgery",
    ),
    AutoSegPreset(
        id="organs",
        name="Abdominal & Thoracic Viscera",
        description="Precision contours for liver, spleen, kidneys, pancreas, lungs, heart, stomach, gallbladder, and urinary bladder.",
        structures_count=24,
        category="Visceral",
        recommended_for="General surgery, tumor resection margins & organ volumetry",
    ),
    AutoSegPreset(
        id="tissue_types",
        name="Tissue Classes (Bone, Muscle, Fat, Air)",
        description="Automated multi-compartment body composition segmentation into cortical bone, cancellous bone, skeletal muscle, subcutaneous fat, and aerated parenchyma.",
        structures_count=6,
        category="Tissue Analysis",
        recommended_for="Density profiling, bone mineral assessment & soft tissue margins",
    ),
    AutoSegPreset(
        id="lung_vessels",
        name="Pulmonary Vasculature & Airways",
        description="Segmentation of trachea, main bronchi, pulmonary artery, and lobar vascular trees.",
        structures_count=8,
        category="Thoracic",
        recommended_for="Thoracic oncology & airway stent planning",
    ),
    AutoSegPreset(
        id="body",
        name="Full Body Outer Contour",
        description="Segment complete patient external surface envelope for 3D body reference.",
        structures_count=1,
        category="Surface",
        recommended_for="Reference alignment & patient positioning",
    ),
]


# ── Endpoints ──────────────────────────────────────────────

@router.get("/autoseg/tasks", response_model=List[AutoSegPreset])
async def list_autoseg_tasks():
    """List all supported TotalSegmentator task presets and descriptions."""
    return AVAILABLE_TASKS


@router.post("/{case_id}/autoseg", response_model=AutoSegResponse)
async def start_auto_segmentation(
    case_id: uuid.UUID,
    body: AutoSegRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger automated full-anatomy segmentation for the case using TotalSegmentator.
    """
    # 1. Fetch case and active reconstructed series
    case_res = await db.execute(select(Case).where(Case.id == case_id))
    case = case_res.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    series_res = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = series_res.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(
            status_code=400,
            detail="No reconstructed 3D volume found for this case. Please complete Stage 2 volume reconstruction first.",
        )

    if not Path(series.volume_path).exists():
        raise HTTPException(
            status_code=404,
            detail=f"Reconstructed volume file not found on disk at {series.volume_path}",
        )

    # 2. Check if an auto-segmentation job is already actively running for this case
    active_job_res = await db.execute(
        select(Job)
        .where(Job.case_id == case_id)
        .where(Job.type == JobType.AUTO_SEGMENTATION)
        .where(Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]))
    )
    active_job = active_job_res.scalars().first()
    if active_job:
        return AutoSegResponse(
            job_id=str(active_job.id),
            status=active_job.status.value,
            message="Auto-segmentation job is already in progress.",
            case_id=str(case_id),
            series_id=str(series.id),
            task=body.task,
            fast=body.fast,
        )

    # 3. Create a new Job record
    job = Job(
        case_id=case_id,
        type=JobType.AUTO_SEGMENTATION,
        status=JobStatus.PENDING,
        progress=0,
        message=f"Queued TotalSegmentator auto-segmentation (task: {body.task})",
    )
    db.add(job)
    case.status = CaseStatus.AUTO_SEGMENTING
    await db.commit()
    await db.refresh(job)

    # 4. Dispatch Celery task
    task_id = run_async_task(
        run_totalsegmentator_task,
        str(case_id),
        str(series.id),
        str(job.id),
        series.volume_path,
        body.task,
        body.fast,
        None,
        body.generate_stls,
    )

    return AutoSegResponse(
        job_id=str(job.id),
        status="pending",
        message="TotalSegmentator auto-segmentation job queued successfully.",
        case_id=str(case_id),
        series_id=str(series.id),
        task=body.task,
        fast=body.fast,
    )


@router.get("/{case_id}/autoseg/status")
async def get_autoseg_status(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Check the status of the most recent auto-segmentation job for a case."""
    job_res = await db.execute(
        select(Job)
        .where(Job.case_id == case_id)
        .where(Job.type == JobType.AUTO_SEGMENTATION)
        .order_by(Job.created_at.desc())
    )
    job = job_res.scalars().first()
    if not job:
        return {"has_job": False, "status": "none"}

    return {
        "has_job": True,
        "job_id": str(job.id),
        "status": job.status.value,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "result_data": job.result_data,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
