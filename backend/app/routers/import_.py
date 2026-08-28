"""DICOM import router — Stage 1: upload, validate, group, select series."""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Case, CaseStatus, Series, Job, JobType, JobStatus
from app.services.dicom_service import extract_upload, parse_and_group_series

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cases", tags=["import"])


# ── Schemas ────────────────────────────────────────────────


class SeriesResponse(BaseModel):
    id: str
    series_instance_uid: str
    modality: str
    slice_count: int
    pixel_spacing_x: float | None
    pixel_spacing_y: float | None
    slice_thickness: float | None
    rows: int
    columns: int
    is_valid: bool
    validation_errors: list[dict]
    study_description: str
    series_description: str


class UploadResponse(BaseModel):
    case_id: str
    file_count: int
    series: list[SeriesResponse]
    global_errors: list[dict]


class SelectSeriesResponse(BaseModel):
    job_id: str
    message: str


# ── Endpoints ──────────────────────────────────────────────


@router.post("/{case_id}/upload", response_model=UploadResponse)
async def upload_dicom(
    case_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload DICOM files (ZIP or individual .dcm). Validates and groups by series."""
    # Verify case exists
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Create case data directory
    case_dir = settings.data_dir / str(case_id)
    case_dir.mkdir(parents=True, exist_ok=True)

    # Read uploaded files into memory
    file_data: list[tuple[str, bytes]] = []
    try:
        for f in files:
            content = await f.read()
            if len(content) > 0:
                file_data.append((f.filename or "unknown.dcm", content))
    except Exception as read_err:
        logger.exception(f"Failed to read upload stream for case {case_id}: {read_err}")
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded files: {str(read_err)}")

    if not file_data:
        raise HTTPException(status_code=400, detail="No files received in upload payload")

    # Extract and parse
    try:
        dicom_dir = extract_upload(case_dir, file_data)
        series_map, global_errors = parse_and_group_series(dicom_dir)
    except Exception as parse_err:
        logger.exception(f"DICOM parsing error for case {case_id}: {parse_err}")
        raise HTTPException(status_code=422, detail=f"DICOM parsing or ZIP extraction error: {str(parse_err)}")

    if not series_map:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No valid DICOM series found in upload",
                "errors": [e.to_dict() for e in global_errors],
            },
        )

    # Persist series to DB
    series_responses = []
    for uid, info in series_map.items():
        series_dict = info.to_dict()

        series_record = Series(
            case_id=case_id,
            series_instance_uid=info.series_instance_uid,
            modality=info.modality,
            slice_count=info.slice_count,
            pixel_spacing_x=info.pixel_spacing[0] if info.pixel_spacing else None,
            pixel_spacing_y=info.pixel_spacing[1] if info.pixel_spacing else None,
            slice_thickness=info.slice_thickness,
            dicom_dir=str(dicom_dir),
        )
        db.add(series_record)
        await db.flush()

        series_responses.append(
            SeriesResponse(
                id=str(series_record.id),
                series_instance_uid=info.series_instance_uid,
                modality=info.modality,
                slice_count=info.slice_count,
                pixel_spacing_x=series_dict["pixel_spacing_x"],
                pixel_spacing_y=series_dict["pixel_spacing_y"],
                slice_thickness=series_dict["slice_thickness"],
                rows=info.rows,
                columns=info.columns,
                is_valid=series_dict["is_valid"],
                validation_errors=series_dict["validation_errors"],
                study_description=info.study_description,
                series_description=info.series_description,
            )
        )

    # Update case status
    case.status = CaseStatus.IMPORTED

    return UploadResponse(
        case_id=str(case_id),
        file_count=sum(info.slice_count for info in series_map.values()),
        series=series_responses,
        global_errors=[e.to_dict() for e in global_errors],
    )


@router.get("/{case_id}/series")
async def list_series(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List all parsed series for a case."""
    result = await db.execute(
        select(Series).where(Series.case_id == case_id)
    )
    series_list = result.scalars().all()
    return {
        "series": [
            {
                "id": str(s.id),
                "series_instance_uid": s.series_instance_uid,
                "modality": s.modality,
                "slice_count": s.slice_count,
                "pixel_spacing_x": s.pixel_spacing_x,
                "pixel_spacing_y": s.pixel_spacing_y,
                "slice_thickness": s.slice_thickness,
                "is_selected": s.is_selected,
            }
            for s in series_list
        ]
    }


@router.post("/{case_id}/series/{series_id}/select", response_model=SelectSeriesResponse)
async def select_series(
    case_id: uuid.UUID,
    series_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Select a series for volume reconstruction. Queues a Celery job."""
    result = await db.execute(
        select(Series).where(Series.id == series_id, Series.case_id == case_id)
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    # Mark selected
    series.is_selected = True

    # Create job record
    job = Job(
        case_id=case_id,
        type=JobType.VOLUME_RECONSTRUCTION,
        status=JobStatus.PENDING,
        progress=0,
        message="Queued for volume reconstruction",
    )
    db.add(job)
    await db.flush()

    # Update case status
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if case:
        case.status = CaseStatus.RECONSTRUCTING

    # Commit transaction to release SQLite lock before worker thread starts
    await db.commit()

    # Queue Celery task or thread fallback
    from app.tasks.volume_tasks import reconstruct_volume
    from app.services.task_runner import run_async_task

    task_id = run_async_task(
        reconstruct_volume,
        str(case_id),
        str(series_id),
        str(job.id),
        series.dicom_dir,
    )

    return SelectSeriesResponse(
        job_id=str(job.id),
        message="Volume reconstruction started",
    )


@router.get("/{case_id}/series/{series_id}/slice/{slice_index}")
async def get_series_slice(
    case_id: uuid.UUID,
    series_id: uuid.UUID,
    slice_index: int,
    db: AsyncSession = Depends(get_db),
):
    """Serve a 2D preview PNG of a specific slice in a DICOM series."""
    import io
    import numpy as np
    import pydicom
    from PIL import Image
    from fastapi.responses import StreamingResponse
    from app.services.dicom_service import parse_and_group_series, get_sorted_file_list

    result = await db.execute(
        select(Series).where(Series.id == series_id, Series.case_id == case_id)
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    dicom_path = Path(series.dicom_dir)
    if not dicom_path.exists():
        raise HTTPException(status_code=404, detail="DICOM directory not found")

    series_map, _ = parse_and_group_series(dicom_path)
    info = series_map.get(series.series_instance_uid)
    if not info or not info.files:
        raise HTTPException(status_code=404, detail="Series files not found")

    sorted_files = get_sorted_file_list(info)
    if slice_index < 0 or slice_index >= len(sorted_files):
        raise HTTPException(status_code=400, detail=f"Slice index out of bounds [0, {len(sorted_files)})")

    target_file = sorted_files[slice_index]
    try:
        ds = pydicom.dcmread(target_file)
        pixel_array = ds.pixel_array.astype(np.float32)

        # Apply RescaleSlope / RescaleIntercept if present
        slope = getattr(ds, "RescaleSlope", 1)
        intercept = getattr(ds, "RescaleIntercept", 0)
        hu = pixel_array * float(slope) + float(intercept)

        # Windowing for CT bone/tissue
        vmin, vmax = np.percentile(hu, [1, 99])
        if vmax > vmin:
            norm = np.clip((hu - vmin) / (vmax - vmin) * 255.0, 0, 255).astype(np.uint8)
        else:
            norm = np.zeros_like(hu, dtype=np.uint8)

        img = Image.fromarray(norm, mode="L")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")
    except Exception as e:
        logger.exception(f"Failed to render DICOM slice {target_file}")
        raise HTTPException(status_code=500, detail=f"Error rendering slice: {e}")

