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
from app.models import Job, JobStatus, Series, SegmentationLayer
from app.services.nninteractive_proxy import nninteractive_manager

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
    message: str | None = None
    error: str | None = None
    result_data: dict | None = None
    created_at: str
    completed_at: str | None = None


# ── Endpoints ──────────────────────────────────────────────


@router.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
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
        type=job.type.value if hasattr(job.type, "value") else str(job.type),
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        progress=job.progress,
        message=job.message,
        error=job.error,
        result_data=job.result_data,
        created_at=job.created_at.isoformat() if job.created_at else "",
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
                        "status": job.status.value if hasattr(job.status, "value") else str(job.status),
                        "progress": job.progress,
                        "message": job.message,
                        "error": job.error,
                        "result_data": job.result_data,
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


_case_volume_path_cache: dict[str, str] = {}


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
    case_id_str = str(case_id)
    volume_path = _case_volume_path_cache.get(case_id_str)
    if not volume_path:
        result = await db.execute(
            select(Series)
            .where(Series.case_id == case_id)
            .where(Series.volume_path.isnot(None))
            .order_by(Series.is_selected.desc())
        )
        series = result.scalars().first()
        if not series or not series.volume_path:
            raise HTTPException(status_code=404, detail="Volume not ready")
        volume_path = series.volume_path
        _case_volume_path_cache[case_id_str] = volume_path

    try:
        cached = _get_cached_volume(volume_path)
        arr = cached["arr"]  # [Z, Y, X]

        axis_lower = axis.lower()

        # Build cache key
        cache_key = f"{volume_path}|{axis_lower}|{index}|{ww}|{wl}"
        if cache_key in _slice_png_cache:
            _slice_png_cache.move_to_end(cache_key)
            png_bytes = _slice_png_cache[cache_key]
            return Response(
                content=png_bytes,
                media_type="image/png",
                headers={
                    "Content-Length": str(len(png_bytes)),
                    "Cache-Control": "public, max-age=60",
                },
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
        pil_img.save(buf, format="PNG", compress_level=1)
        png_bytes = buf.getvalue()


        _cache_slice_png(cache_key, png_bytes)

        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Content-Length": str(len(png_bytes)),
                "Cache-Control": "public, max-age=60",
            },
        )
    except Exception as e:
        logger.exception(f"Error serving volume slice {axis}/{index}: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/api/cases/{case_id}/volume/mesh")
async def get_volume_3d_preview(
    case_id: uuid.UUID,
    layer_id: Optional[uuid.UUID] = Query(None, description="Optional layer ID to preview specific segmented structure"),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and return a clean, anatomical 3D preview STL for direct 3D viewport rendering.
    Prioritizes segmented anatomical layers when available; otherwise falls back to bone CT thresholding.
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

    try:
        cached = _get_cached_volume(series.volume_path)
        arr = cached["arr"]  # [Z, Y, X]
        spacing = cached["spacing"]

        from skimage.measure import marching_cubes
        from scipy.ndimage import gaussian_filter
        import trimesh

        # 1. Check for available segmentation layer masks
        layers_query = select(SegmentationLayer).where(SegmentationLayer.series_id == series.id)
        if layer_id:
            layers_query = layers_query.where(SegmentationLayer.id == layer_id)
        layers_res = await db.execute(layers_query)
        layers = layers_res.scalars().all()

        combined_mask: Optional[np.ndarray] = None

        for layer in layers:
            # Check in-memory session first
            m = nninteractive_manager.get_mask(str(layer.id))
            if m is None and layer.mask_path and Path(layer.mask_path).exists():
                try:
                    m_img = sitk.ReadImage(layer.mask_path)
                    m = sitk.GetArrayFromImage(m_img)
                except Exception as read_err:
                    logger.warning(f"Could not read mask file {layer.mask_path}: {read_err}")
                    m = None

            if m is not None and np.any(m > 0):
                if combined_mask is None:
                    combined_mask = (m > 0).astype(np.uint8)
                else:
                    combined_mask = np.maximum(combined_mask, (m > 0).astype(np.uint8))

        has_segmentation = combined_mask is not None and np.any(combined_mask > 0)

        # Gentler downsampling — keep anatomical fidelity while ensuring min dimension >= 2
        step_z = max(1, min(max(1, arr.shape[0] // 220), max(1, (arr.shape[0] - 1) // 2)))
        step_y = max(1, min(max(1, arr.shape[1] // 220), max(1, (arr.shape[1] - 1) // 2)))
        step_x = max(1, min(max(1, arr.shape[2] // 220), max(1, (arr.shape[2] - 1) // 2)))
        sub_spacing = (spacing[2] * step_z, spacing[1] * step_y, spacing[0] * step_x)

        verts = None
        faces = None

        if has_segmentation and combined_mask is not None:
            logger.info(f"Generating 3D preview from {len(layers)} segmentation layer(s)")
            sub_mask = combined_mask[::step_z, ::step_y, ::step_x].astype(np.float32)
            if any(s < 2 for s in sub_mask.shape):
                pad_width = [(max(0, 2 - s), 0) for s in sub_mask.shape]
                sub_mask = np.pad(sub_mask, pad_width, mode='edge')
            if np.max(sub_mask) > 0.1:
                sub_mask = gaussian_filter(sub_mask, sigma=0.6)
                try:
                    verts, faces, _, _ = marching_cubes(sub_mask, level=0.5, spacing=sub_spacing)
                except Exception as mc_err:
                    logger.warning(f"Marching cubes on mask failed: {mc_err}, falling back to bone thresholding")
                    verts, faces = None, None

        if verts is None or faces is None or len(verts) == 0:
            logger.info("Generating 3D preview from CT volume bone thresholding")
            sub_arr = arr[::step_z, ::step_y, ::step_x].astype(np.float32)
            if any(s < 2 for s in sub_arr.shape):
                pad_width = [(max(0, 2 - s), 0) for s in sub_arr.shape]
                sub_arr = np.pad(sub_arr, pad_width, mode='edge')

            sub_arr = gaussian_filter(sub_arr, sigma=0.8)
            bone_threshold = 300.0
            if np.max(sub_arr) <= bone_threshold:
                p90 = float(np.percentile(sub_arr, 90))
                bone_threshold = max(float(np.min(sub_arr)) + 10.0, p90)

            try:
                verts, faces, _, _ = marching_cubes(sub_arr, level=bone_threshold, spacing=sub_spacing)
            except Exception as mc_err:
                logger.warning(f"Marching cubes on CT array failed: {mc_err}, generating placeholder mesh")
                box = trimesh.creation.box(extents=(50, 50, 50))
                verts = box.vertices
                faces = box.faces

        # Convert (Z, Y, X) to (X, Y, Z)
        verts = verts[:, [2, 1, 0]]
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)


        # Remove scanner bed / stray noise by filtering small disconnected bodies
        components = mesh.split(only_watertight=False)
        if len(components) > 1:
            largest_count = max(len(c.faces) for c in components)
            significant = [c for c in components if len(c.faces) >= max(300, largest_count * 0.03)]
            if significant:
                mesh = trimesh.util.concatenate(significant)

        # Laplacian smoothing for clinical-quality surface
        try:
            trimesh.smoothing.filter_laplacian(mesh, iterations=2)
        except Exception:
            pass

        # Fast quadric decimation for smooth 60fps WebGL rendering
        if len(mesh.faces) > 60000:
            try:
                mesh = mesh.simplify_quadric_decimation(face_count=60000)
            except Exception:
                pass


        mesh.fix_normals()
        # Center geometry at origin for consistent viewport framing
        mesh.vertices -= mesh.centroid


        # Export binary STL in-memory (eliminates file lock & Content-Length race conditions)
        stl_bytes = mesh.export(file_type="stl")
        if isinstance(stl_bytes, str):
            stl_bytes = stl_bytes.encode("utf-8")

        # Also write a background cache file if path is accessible
        try:
            with open(preview_stl_path, "wb") as f:
                f.write(stl_bytes)
        except Exception:
            pass

        logger.info(f"Generated clean 3D preview mesh with {len(mesh.vertices):,} vertices ({len(stl_bytes):,} bytes)")

        return Response(
            content=stl_bytes,
            media_type="model/stl",
            headers={
                "Content-Disposition": 'inline; filename="preview_bone.stl"',
                "Content-Length": str(len(stl_bytes)),
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        logger.exception(f"Failed to generate 3D preview mesh: {e}")
        raise HTTPException(status_code=500, detail=str(e))


