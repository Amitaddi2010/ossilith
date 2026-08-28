"""Volume generation router — Stage 2: job status, SSE streaming, slice serving, 3D volume mesh."""

import asyncio
import io
import logging
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
from PIL import Image
import numpy as np
import SimpleITK as sitk

from app.database import get_db, async_session_factory
from app.models import Job, JobStatus, Series

logger = logging.getLogger(__name__)
router = APIRouter(tags=["volume"])

# In-memory cached volume arrays for instant (<1ms) multi-planar slice rendering
_volume_cache: dict[str, dict[str, Any]] = {}

# LRU PNG render cache — avoids re-rendering identical slice images
_SLICE_CACHE_MAX = 512
_slice_png_cache: OrderedDict[str, bytes] = OrderedDict()


def _cache_slice_png(key: str, png_bytes: bytes) -> None:
    """Insert a rendered PNG into the LRU cache."""
    if key in _slice_png_cache:
        _slice_png_cache.move_to_end(key)
        return
    _slice_png_cache[key] = png_bytes
    while len(_slice_png_cache) > _SLICE_CACHE_MAX:
        _slice_png_cache.popitem(last=False)


def _get_cached_volume(volume_path: str) -> dict[str, Any]:
    """Cache loaded volume numpy array in memory."""
    if volume_path not in _volume_cache:
        vol_p = Path(volume_path)
        if not vol_p.exists():
            raise FileNotFoundError(f"Volume file not found at {volume_path}")
        img = sitk.ReadImage(str(vol_p))
        arr = sitk.GetArrayFromImage(img)  # [Z, Y, X]
        size = img.GetSize()  # (X, Y, Z)
        spacing = img.GetSpacing()
        origin = img.GetOrigin()
        direction = img.GetDirection()

        # Compute percentile windowing for standard CT tissue/bone
        vmin, vmax = np.percentile(arr, [1, 99.5])
        if vmax <= vmin:
            vmax = vmin + 1.0

        _volume_cache[volume_path] = {
            "arr": arr,
            "dimensions": list(size),
            "spacing": list(spacing),
            "origin": list(origin),
            "direction": list(direction),
            "vmin": float(vmin),
            "vmax": float(vmax),
        }
        logger.info(f"Loaded volume {volume_path} into RAM cache: shape={arr.shape}")

    return _volume_cache[volume_path]


# ── Schemas ────────────────────────────────────────────────


class JobStatusResponse(BaseModel):
    id: str
    type: str
    status: str
    progress: int
    message: str | None
    error: str | None
    created_at: str
    completed_at: str | None


# ── Endpoints ──────────────────────────────────────────────


@router.get("/api/jobs/{job_id}/status", response_model=JobStatusResponse)
async def get_job_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Poll job status."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        id=str(job.id),
        type=job.type.value,
        status=job.status.value,
        progress=job.progress,
        message=job.message,
        error=job.error,
        created_at=job.created_at.isoformat(),
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


@router.get("/api/jobs/{job_id}/stream")
async def stream_job_status(job_id: uuid.UUID):
    """SSE endpoint — streams job progress updates in real time."""

    async def event_generator():
        while True:
            async with async_session_factory() as session:
                result = await session.execute(
                    select(Job).where(Job.id == job_id)
                )
                job = result.scalar_one_or_none()

                if not job:
                    yield {
                        "event": "error",
                        "data": '{"error": "Job not found"}',
                    }
                    return

                import json

                data = json.dumps(
                    {
                        "id": str(job.id),
                        "status": job.status.value,
                        "progress": job.progress,
                        "message": job.message,
                        "error": job.error,
                    }
                )
                yield {"data": data}

                # Stop streaming if terminal state
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                    return

            # Poll interval
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@router.get("/api/cases/{case_id}/volume/metadata")
async def get_volume_metadata(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get metadata of the reconstructed volume."""
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(status_code=404, detail="Volume not ready")

    try:
        cached = _get_cached_volume(series.volume_path)
        return {
            "dimensions": cached["dimensions"],
            "spacing": cached["spacing"],
            "origin": cached["origin"],
            "direction": cached["direction"],
            "volume_path": str(series.volume_path),
        }
    except Exception as e:
        logger.exception(f"Error reading volume metadata: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cases/{case_id}/volume/slice/{axis}/{index}")
async def get_volume_slice(
    case_id: uuid.UUID,
    axis: str,
    index: int,
    ww: Optional[float] = Query(None, description="Window Width (HU)"),
    wl: Optional[float] = Query(None, description="Window Level / Center (HU)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Serve a 2D slice from the reconstructed volume as PNG with correct anatomical orientation.
    Supports optional CT windowing via ?ww=&wl= query params.
    Presets: Bone (WW=2000, WL=400), Soft Tissue (WW=400, WL=50), Lung (WW=1500, WL=-600)
    """
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(status_code=404, detail="Volume not ready")

    try:
        cached = _get_cached_volume(series.volume_path)
        arr = cached["arr"]  # [Z, Y, X]

        axis_lower = axis.lower()

        # Build cache key
        cache_key = f"{series.volume_path}|{axis_lower}|{index}|{ww}|{wl}"
        if cache_key in _slice_png_cache:
            _slice_png_cache.move_to_end(cache_key)
            return Response(
                content=_slice_png_cache[cache_key],
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=60"},
            )

        if axis_lower == "axial":
            idx = max(0, min(int(index), arr.shape[0] - 1))
            slice_data = arr[idx, :, :]
        elif axis_lower == "coronal":
            idx = max(0, min(int(index), arr.shape[1] - 1))
            slice_data = np.flipud(arr[:, idx, :])
        elif axis_lower == "sagittal":
            idx = max(0, min(int(index), arr.shape[2] - 1))
            slice_data = np.flipud(arr[:, :, idx])
        else:
            raise HTTPException(status_code=400, detail="Axis must be axial, coronal, or sagittal")

        # Apply windowing
        if ww is not None and wl is not None and ww > 0:
            low = wl - ww / 2.0
            high = wl + ww / 2.0
            norm = np.clip((slice_data.astype(np.float32) - low) / (high - low) * 255.0, 0, 255).astype(np.uint8)
        else:
            vmin = cached["vmin"]
            vmax = cached["vmax"]
            norm = np.clip((slice_data.astype(np.float32) - vmin) / (vmax - vmin) * 255.0, 0, 255).astype(np.uint8)

        pil_img = Image.fromarray(norm, mode="L")
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG", optimize=True)
        png_bytes = buf.getvalue()

        _cache_slice_png(cache_key, png_bytes)

        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=60"},
        )
    except Exception as e:
        logger.exception(f"Error serving volume slice {axis}/{index}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cases/{case_id}/volume/mesh")
async def get_volume_3d_preview(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and return a clean, anatomical 3D bone isosurface STL for direct 3D viewport rendering.
    Filters scanner bed artifacts and centers the model.
    """
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(status_code=404, detail="Volume not ready")

    preview_stl_path = Path(series.volume_path).parent / "preview_bone.stl"

    # Always regenerate if corrupt or recreate cleanly
    try:
        cached = _get_cached_volume(series.volume_path)
        arr = cached["arr"]  # [Z, Y, X]
        spacing = cached["spacing"]

        from skimage.measure import marching_cubes
        from scipy.ndimage import gaussian_filter
        import trimesh

        # Absolute Hounsfield Unit threshold for bone (≥300 HU)
        bone_threshold = 300.0

        # Gentler downsampling — keep more anatomical detail
        step = max(1, max(arr.shape) // 220)
        sub_arr = arr[::step, ::step, ::step].astype(np.float32)
        sub_spacing = (spacing[2] * step, spacing[1] * step, spacing[0] * step)

        # Apply Gaussian smoothing to reduce staircase/streak artifacts
        sub_arr = gaussian_filter(sub_arr, sigma=0.8)

        verts, faces, _, _ = marching_cubes(sub_arr, level=bone_threshold, spacing=sub_spacing)
        # Convert (Z, Y, X) to (X, Y, Z)
        verts = verts[:, [2, 1, 0]]

        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)

        # Remove scanner bed / stray noise by filtering small disconnected bodies
        components = mesh.split(only_watertight=False)
        if len(components) > 1:
            largest_count = max(len(c.faces) for c in components)
            significant = [c for c in components if len(c.faces) >= max(500, largest_count * 0.05)]
            if significant:
                mesh = trimesh.util.concatenate(significant)

        # Laplacian smoothing for clinical-quality surface
        try:
            trimesh.smoothing.filter_laplacian(mesh, iterations=3)
        except Exception:
            pass

        mesh.fix_normals()
        # Center geometry at origin for consistent viewport framing
        mesh.vertices -= mesh.centroid

        # Export binary STL
        mesh.export(str(preview_stl_path), file_type="stl")
        logger.info(f"Generated clean 3D bone preview mesh with {len(mesh.vertices):,} vertices: {preview_stl_path}")
    except Exception as e:
        logger.exception(f"Failed to generate 3D preview mesh: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return FileResponse(
        path=str(preview_stl_path),
        media_type="model/stl",
        filename="preview_bone.stl",
    )
