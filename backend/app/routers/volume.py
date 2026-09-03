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
_mesh_stl_cache: OrderedDict[str, bytes] = OrderedDict()


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


@router.get("/api/cases/{case_id}/volume/histogram")
async def get_volume_histogram(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Compute and return the HU density histogram for interactive contrast tuning."""
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
        if "histogram" not in cached:
            arr = cached["arr"]
            # Downsample for fast computation if very large
            sample = arr[::2, ::2, ::2] if arr.size > 2_000_000 else arr
            min_bound = -1024.0
            max_bound = 3071.0
            bins = 256
            counts, bin_edges = np.histogram(sample, bins=bins, range=(min_bound, max_bound))
            bin_centers = 0.5 * (bin_edges[:-1] + bin_edges[1:])
            # Normalize counts for clean rendering (using square root scaling for visual clarity of bone peaks)
            scaled_counts = np.sqrt(counts.astype(np.float32))
            max_c = float(np.max(scaled_counts)) if np.max(scaled_counts) > 0 else 1.0
            normalized = (scaled_counts / max_c).tolist()

            cached["histogram"] = {
                "min_bound": min_bound,
                "max_bound": max_bound,
                "bins": [round(float(x) * 100, 1) for x in normalized],
                "counts": normalized,
                "bin_centers": [round(float(x), 1) for x in bin_centers],
                "raw_counts": counts.tolist(),
                "data_min": float(np.min(sample)),
                "data_max": float(np.max(sample)),
            }

        return cached["histogram"]

    except Exception as e:
        logger.exception(f"Error computing histogram for case {case_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


_case_volume_path_cache: dict[str, str] = {}


@router.get("/api/cases/{case_id}/volume/slice/{axis}/{index}")
async def get_volume_slice(
    case_id: uuid.UUID,
    axis: str,
    index: int,
    ww: Optional[float] = Query(None, description="Window Width (HU)"),
    wl: Optional[float] = Query(None, description="Window Level / Center (HU)"),
    min_hu: Optional[float] = Query(None, description="Grayscale Min HU"),
    max_hu: Optional[float] = Query(None, description="Grayscale Max HU"),
    db: AsyncSession = Depends(get_db),
):
    """
    Serve a 2D slice from the reconstructed volume as PNG with correct anatomical orientation.
    Supports optional CT windowing via ?ww=&wl= or ?min_hu=&max_hu= query params.
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
        cache_key = f"{volume_path}|{axis_lower}|{index}|{ww}|{wl}|{min_hu}|{max_hu}"
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

        # Apply windowing / Min-Max contrast
        if min_hu is not None and max_hu is not None and max_hu > min_hu:
            low = float(min_hu)
            high = float(max_hu)
            norm = np.clip((slice_data.astype(np.float32) - low) / (high - low) * 255.0, 0, 255).astype(np.uint8)
        elif ww is not None and wl is not None and ww > 0:
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
    layer_id: Optional[str] = Query(None, description="Optional layer ID, comma-separated IDs, or 'all'"),
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

    try:
        from skimage.measure import marching_cubes
        from scipy.ndimage import gaussian_filter
        import trimesh

        # 1. Check for available segmentation layer masks
        layers_query = select(SegmentationLayer).where(SegmentationLayer.series_id == series.id)
        is_single_layer = False
        if layer_id and layer_id.lower() != "all":
            requested_ids = [lid.strip() for lid in layer_id.split(",") if lid.strip()]
            if len(requested_ids) == 1:
                is_single_layer = True
                try:
                    layers_query = layers_query.where(SegmentationLayer.id == uuid.UUID(requested_ids[0]))
                except ValueError:
                    pass
            elif len(requested_ids) > 1:
                try:
                    parsed_uuids = [uuid.UUID(lid) for lid in requested_ids]
                    layers_query = layers_query.where(SegmentationLayer.id.in_(parsed_uuids))
                except ValueError:
                    pass
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

        # Fast path: If a specific single layer was requested but has 0 voxels, return empty STL immediately (<0.1ms)
        if is_single_layer and not has_segmentation:
            empty_mesh = trimesh.Trimesh()
            stl_bytes = empty_mesh.export(file_type="stl")
            if isinstance(stl_bytes, str):
                stl_bytes = stl_bytes.encode("utf-8")
            return Response(content=stl_bytes, media_type="model/stl", headers={"Cache-Control": "no-cache"})

        cached = _get_cached_volume(series.volume_path)
        arr = cached["arr"]  # [Z, Y, X]
        spacing = cached["spacing"]

        verts = None
        faces = None

        if has_segmentation and combined_mask is not None:
            # High-speed ROI bounded marching cubes (<50ms)
            nz_z, nz_y, nz_x = np.where(combined_mask > 0)
            step = 2
            z0, z1 = max(0, int(nz_z.min()) - 4), min(arr.shape[0], int(nz_z.max()) + 5)
            y0, y1 = max(0, int(nz_y.min()) - 4), min(arr.shape[1], int(nz_y.max()) + 5)
            x0, x1 = max(0, int(nz_x.min()) - 4), min(arr.shape[2], int(nz_x.max()) + 5)

            roi_mask = combined_mask[z0:z1:step, y0:y1:step, x0:x1:step].astype(np.float32)
            if all(s >= 2 for s in roi_mask.shape):
                roi_mask = gaussian_filter(roi_mask, sigma=0.5)
                sub_spacing = (spacing[2] * step, spacing[1] * step, spacing[0] * step)
                try:
                    verts, faces, _, _ = marching_cubes(roi_mask, level=0.5, spacing=sub_spacing)
                    # Shift vertices back to true spatial physical coordinate frame
                    verts += np.array([z0 * spacing[2], y0 * spacing[1], x0 * spacing[0]])
                except Exception as mc_err:
                    logger.warning(f"Fast ROI marching cubes failed: {mc_err}")
                    verts, faces = None, None

        if verts is None or faces is None or len(verts) == 0:
            # Fallback for full CT volume bone thresholding
            step_z = max(2, min(max(2, arr.shape[0] // 160), max(2, (arr.shape[0] - 1) // 2)))
            step_y = max(2, min(max(2, arr.shape[1] // 160), max(2, (arr.shape[1] - 1) // 2)))
            step_x = max(2, min(max(2, arr.shape[2] // 160), max(2, (arr.shape[2] - 1) // 2)))
            sub_spacing = (spacing[2] * step_z, spacing[1] * step_y, spacing[0] * step_x)
            sub_arr = arr[::step_z, ::step_y, ::step_x].astype(np.float32)
            sub_arr = gaussian_filter(sub_arr, sigma=0.7)
            bone_threshold = 280.0
            try:
                verts, faces, _, _ = marching_cubes(sub_arr, level=bone_threshold, spacing=sub_spacing)
            except Exception:
                box = trimesh.creation.box(extents=(50, 50, 50))
                verts = box.vertices
                faces = box.faces

        # Convert (Z, Y, X) to (X, Y, Z)
        verts = verts[:, [2, 1, 0]]
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)

        if len(mesh.faces) > 50000:
            try:
                mesh = mesh.simplify_quadric_decimation(face_count=50000)
            except Exception:
                pass

        mesh.fix_normals()
        # Reference to shared physical volume center (preserves exact relative anatomical placement)
        vol_center = np.array([arr.shape[2] * spacing[0], arr.shape[1] * spacing[1], arr.shape[0] * spacing[2]]) / 2.0
        mesh.vertices -= vol_center

        stl_bytes = mesh.export(file_type="stl")
        if isinstance(stl_bytes, str):
            stl_bytes = stl_bytes.encode("utf-8")

        return Response(
            content=stl_bytes,
            media_type="model/stl",
            headers={"Cache-Control": "public, max-age=60"},
        )
    except Exception as e:
        logger.exception(f"Failed to generate 3D preview mesh: {e}")
        raise HTTPException(status_code=500, detail=str(e))


