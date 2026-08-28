"""
Segmentation router — Stage 3: layer management, nnInteractive sessions, prompts, mask overlays.
"""

import io
import logging
import uuid
from typing import Any
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image
import numpy as np

from app.config import settings
from app.database import get_db
from app.models import Case, Series, SegmentationLayer, LayerStatus, Job, JobType, JobStatus
from app.services.nninteractive_proxy import nninteractive_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cases", tags=["segmentation"])


# ── Schemas ────────────────────────────────────────────────


class LayerCreate(BaseModel):
    name: str
    color: str = "#00FFAA"


class LayerResponse(BaseModel):
    id: str
    name: str
    color: str
    status: str
    mask_path: str | None
    created_at: str


class PromptRequest(BaseModel):
    prompt_type: str | None = "point"
    type: str | None = None
    axis: str = "axial"
    slice_index: int = 0
    positive: bool = True
    include: bool | None = None
    point: list[float] | None = None
    bbox: list[list[float]] | None = None
    points: list[list[float]] | None = None
    data: dict[str, Any] | None = None


# ── Endpoints ──────────────────────────────────────────────


@router.post("/{case_id}/layers", response_model=LayerResponse)
async def create_layer(
    case_id: uuid.UUID,
    body: LayerCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new segmentation layer in the case."""
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series:
        raise HTTPException(status_code=400, detail="No volume found for this case")

    layer = SegmentationLayer(
        series_id=series.id,
        name=body.name,
        color=body.color,
        status=LayerStatus.ACTIVE,
    )
    db.add(layer)
    await db.flush()
    await db.refresh(layer)

    # Initialize nnInteractive session for this layer if volume exists
    if series.volume_path and Path(series.volume_path).exists():
        await nninteractive_manager.init_session(str(layer.id), series.volume_path)

    return LayerResponse(
        id=str(layer.id),
        name=layer.name,
        color=layer.color,
        status=layer.status.value,
        mask_path=layer.mask_path,
        created_at=layer.created_at.isoformat(),
    )


@router.get("/{case_id}/layers")
async def list_layers(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List all segmentation layers for the case."""
    result = await db.execute(
        select(SegmentationLayer)
        .join(Series)
        .where(Series.case_id == case_id)
        .order_by(SegmentationLayer.created_at.asc())
    )
    layers = result.scalars().all()
    return {
        "layers": [
            {
                "id": str(layer.id),
                "name": layer.name,
                "color": layer.color,
                "status": layer.status.value,
                "mask_path": layer.mask_path,
                "created_at": layer.created_at.isoformat(),
            }
            for layer in layers
        ]
    }


@router.post("/{case_id}/layers/{layer_id}/session/init")
async def init_layer_session(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Initialize a segmentation session for a layer."""
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(status_code=404, detail="Volume not found")

    session_info = await nninteractive_manager.init_session(
        str(layer_id), series.volume_path
    )
    return {
        "status": "ready",
        "layer_id": str(layer_id),
        "shape": session_info["shape"],
    }


@router.post("/{case_id}/layers/{layer_id}/prompt")
async def add_prompt(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: PromptRequest,
    db: AsyncSession = Depends(get_db),
):
    """Forward a user prompt (point, bbox, scribble, lasso) to nnInteractive."""
    # Ensure session is initialized
    mask = nninteractive_manager.get_mask(str(layer_id))
    if mask is None:
        result = await db.execute(
            select(Series)
            .where(Series.case_id == case_id)
            .where(Series.volume_path.isnot(None))
            .order_by(Series.is_selected.desc())
        )
        series = result.scalars().first()
        if not series or not series.volume_path:
            raise HTTPException(status_code=404, detail="Volume not found")
        await nninteractive_manager.init_session(str(layer_id), series.volume_path)

    prompt_kind = body.prompt_type or body.type or "point"
    is_pos = body.positive if body.include is None else body.include

    res = await nninteractive_manager.add_prompt(
        layer_id=str(layer_id),
        prompt_type=prompt_kind,
        axis=body.axis,
        slice_index=body.slice_index,
        positive=is_pos,
        point=body.point,
        bbox=body.bbox,
        points=body.points,
        data=body.data,
    )
    return res


@router.get("/{case_id}/layers/{layer_id}/mask/slice/{axis}/{index}")
async def get_mask_slice(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    axis: str,
    index: int,
    db: AsyncSession = Depends(get_db),
):
    """Serve a transparent PNG overlay of the segmentation mask slice."""
    mask = nninteractive_manager.get_mask(str(layer_id))
    if mask is None:
        result = await db.execute(select(SegmentationLayer).where(SegmentationLayer.id == layer_id))
        layer = result.scalar_one_or_none()
        if layer and layer.mask_path and Path(layer.mask_path).exists():
            import SimpleITK as sitk
            img = sitk.ReadImage(layer.mask_path)
            mask = sitk.GetArrayFromImage(img)
        else:
            # Try auto-initializing from series volume
            series_res = await db.execute(
                select(Series)
                .where(Series.case_id == case_id)
                .where(Series.volume_path.isnot(None))
                .order_by(Series.is_selected.desc())
            )
            series = series_res.scalars().first()
            if series and series.volume_path and Path(series.volume_path).exists():
                await nninteractive_manager.init_session(str(layer_id), series.volume_path)
                mask = nninteractive_manager.get_mask(str(layer_id))
            
            if mask is None:
                # Return transparent 1x1 PNG gracefully
                rgba = np.zeros((1, 1, 4), dtype=np.uint8)
                pil_img = Image.fromarray(rgba, mode="RGBA")
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                buf.seek(0)
                return StreamingResponse(buf, media_type="image/png")

    axis_lower = axis.lower()
    if axis_lower == "axial":
        idx = max(0, min(int(index), mask.shape[0] - 1))
        slice_2d = mask[idx, :, :]
    elif axis_lower == "coronal":
        idx = max(0, min(int(index), mask.shape[1] - 1))
        slice_2d = np.flipud(mask[:, idx, :])
    elif axis_lower == "sagittal":
        idx = max(0, min(int(index), mask.shape[2] - 1))
        slice_2d = np.flipud(mask[:, :, idx])
    else:
        raise HTTPException(status_code=400, detail="Axis must be axial, coronal, or sagittal")

    # Query layer for color (or fallback to vibrant clinical emerald green)
    result = await db.execute(select(SegmentationLayer).where(SegmentationLayer.id == layer_id))
    layer = result.scalar_one_or_none()
    hex_color = layer.color if layer and layer.color and layer.color.lower() not in ("#0f3e17", "#000000", "#111111") else "#00e575"

    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    else:
        r, g, b = 0, 229, 117

    rgba = np.zeros((*slice_2d.shape, 4), dtype=np.uint8)
    pos = slice_2d > 0
    rgba[pos, 0] = r
    rgba[pos, 1] = g
    rgba[pos, 2] = b
    rgba[pos, 3] = 185  # Vibrant clinical visibility

    pil_img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")


@router.post("/{case_id}/layers/{layer_id}/reset")
async def reset_layer(case_id: uuid.UUID, layer_id: uuid.UUID):
    """Reset the current segmentation layer mask."""
    return await nninteractive_manager.reset(str(layer_id))


@router.post("/{case_id}/layers/{layer_id}/undo")
async def undo_prompt(case_id: uuid.UUID, layer_id: uuid.UUID):
    """Undo the last segmentation prompt."""
    return await nninteractive_manager.undo(str(layer_id))


@router.post("/{case_id}/layers/{layer_id}/redo")
async def redo_prompt(case_id: uuid.UUID, layer_id: uuid.UUID):
    """Redo a previously undone segmentation prompt."""
    return await nninteractive_manager.redo(str(layer_id))


@router.post("/{case_id}/layers/{layer_id}/accept")
async def accept_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Lock the layer, save the final segmentation mask, and trigger Stage 4 STL generation."""
    result = await db.execute(
        select(SegmentationLayer)
        .where(SegmentationLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    series_result = await db.execute(
        select(Series)
        .where(Series.id == layer.series_id)
    )
    series = series_result.scalar_one_or_none()
    if not series or not series.volume_path:
        raise HTTPException(status_code=404, detail="Volume not found")

    # Save mask to NRRD (auto-synthesizes if mask buffer was empty)
    mask_file_path = settings.data_dir / str(case_id) / f"mask_{layer.id}.nrrd"
    await nninteractive_manager.save_mask_to_file(
        str(layer.id),
        str(mask_file_path),
        series.volume_path,
    )

    layer.mask_path = str(mask_file_path)
    layer.status = LayerStatus.ACCEPTED

    # Create Celery job for Stage 4 (STL generation)
    job = Job(
        case_id=case_id,
        type=JobType.STL_GENERATION,
        status=JobStatus.PENDING,
        progress=0,
        message=f"Queued STL generation for {layer.name}",
    )
    db.add(job)
    await db.commit()

    from app.tasks.stl_tasks import generate_stl_task
    from app.services.task_runner import run_async_task

    task_id = run_async_task(
        generate_stl_task,
        str(case_id),
        str(layer.id),
        str(job.id),
        str(mask_file_path),
        layer.name,
    )

    return {
        "status": "accepted",
        "job_id": str(job.id),
        "mask_path": str(mask_file_path),
    }
