"""
Segmentation router — Stage 3: layer management, nnInteractive sessions, prompts, mask overlays.
"""

import io
import logging
import uuid
from typing import Any, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
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

# In-memory caches to eliminate DB connection pool contention on high-frequency slice requests
_layer_color_cache: dict[str, str] = {}
_layer_mask_path_cache: dict[str, str] = {}



# ── Schemas ────────────────────────────────────────────────


class LayerCreate(BaseModel):
    name: str
    color: str = "#00FFAA"


class LayerUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    status: Optional[str] = None


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


class RegionGrowRequest(BaseModel):
    axis: str = "axial"
    slice_index: int = 0
    point: list[float]
    min_hu: float = 200.0
    max_hu: float = 3000.0
    search_radius_mm: float = 60.0
    fill_holes: bool = True
    positive: bool = True


class IslandFilterRequest(BaseModel):
    operation: str = "keep_largest"  # keep_largest, remove_small, split, keep_selected
    min_size_voxels: int = 500
    axis: str | None = None
    slice_index: int | None = None
    point: list[float] | None = None


class SplitMaskRequest(BaseModel):
    mode: str = "islands"  # islands, plane
    min_size_voxels: int = 200
    max_components: int = 12
    axis: str | None = None  # axial, coronal, sagittal (for plane mode)
    slice_index: int | None = None  # for plane mode
    delete_original: bool = False
    prefix: str | None = None


class ThresholdRequest(BaseModel):
    min_hu: float = 200.0
    max_hu: float = 3000.0
    fill_holes: bool = True
    mode: str = "replace"  # replace, union, intersect, subtract


class MorphologyRequest(BaseModel):
    operation: str = "smooth"  # smooth, fill_holes, dilate, erode
    radius: int = 1


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
    for layer in layers:
        _layer_color_cache[str(layer.id)] = layer.color
        if layer.mask_path:
            _layer_mask_path_cache[str(layer.id)] = layer.mask_path

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


@router.get("/{case_id}/layers/{layer_id}")
async def get_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get single layer by ID."""
    result = await db.execute(
        select(SegmentationLayer)
        .join(Series)
        .where(Series.case_id == case_id)
        .where(SegmentationLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")
    return {
        "id": str(layer.id),
        "name": layer.name,
        "color": layer.color,
        "status": layer.status.value,
        "mask_path": layer.mask_path,
        "created_at": layer.created_at.isoformat(),
    }


@router.patch("/{case_id}/layers/{layer_id}")
async def update_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: LayerUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update layer name, color, or status."""
    result = await db.execute(
        select(SegmentationLayer)
        .join(Series)
        .where(Series.case_id == case_id)
        .where(SegmentationLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    if body.name is not None:
        layer.name = body.name
    if body.color is not None:
        layer.color = body.color
        _layer_color_cache[str(layer.id)] = body.color
    if body.status is not None:
        try:
            layer.status = LayerStatus(body.status)
        except ValueError:
            pass

    await db.commit()
    await db.refresh(layer)
    return {
        "id": str(layer.id),
        "name": layer.name,
        "color": layer.color,
        "status": layer.status.value,
        "mask_path": layer.mask_path,
        "created_at": layer.created_at.isoformat(),
    }


@router.delete("/{case_id}/layers/{layer_id}")
async def delete_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete layer from database and cleanup mask buffers/files."""
    result = await db.execute(
        select(SegmentationLayer)
        .join(Series)
        .where(Series.case_id == case_id)
        .where(SegmentationLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    layer_id_str = str(layer_id)
    _layer_color_cache.pop(layer_id_str, None)
    _layer_mask_path_cache.pop(layer_id_str, None)

    # Clean in-memory masks
    if hasattr(nninteractive_manager, "_masks") and layer_id_str in nninteractive_manager._masks:
        nninteractive_manager._masks.pop(layer_id_str, None)
    if hasattr(nninteractive_manager, "_sessions") and layer_id_str in nninteractive_manager._sessions:
        nninteractive_manager._sessions.pop(layer_id_str, None)

    if layer.mask_path and Path(layer.mask_path).exists():
        try:
            Path(layer.mask_path).unlink()
        except Exception as e:
            logger.warning(f"Could not delete mask file {layer.mask_path}: {e}")

    await db.delete(layer)
    await db.commit()
    return {"status": "deleted", "id": layer_id_str}



async def _ensure_layer_session(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Ensure that the layer has an active session and allocated mask in nninteractive_manager."""
    layer_id_str = str(layer_id)
    if nninteractive_manager.has_session(layer_id_str):
        return nninteractive_manager._sessions[layer_id_str]

    # Fetch active series volume
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(status_code=404, detail="Volume not found for this case")

    # Fetch layer to check for existing mask on disk
    layer_res = await db.execute(select(SegmentationLayer).where(SegmentationLayer.id == layer_id))
    layer = layer_res.scalar_one_or_none()
    mask_path = layer.mask_path if layer else None

    return await nninteractive_manager.init_session(
        layer_id=layer_id_str,
        volume_path=series.volume_path,
        mask_path=mask_path,
    )


@router.post("/{case_id}/layers/{layer_id}/session/init")
async def init_layer_session(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Initialize a segmentation session for a layer."""
    session_info = await _ensure_layer_session(case_id, layer_id, db)
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
    await _ensure_layer_session(case_id, layer_id, db)

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


@router.post("/{case_id}/layers/{layer_id}/region-grow")
async def region_grow_prompt(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: RegionGrowRequest,
    db: AsyncSession = Depends(get_db),
):
    """3D Connected Threshold Region Growing from a seed point."""
    await _ensure_layer_session(case_id, layer_id, db)

    return await nninteractive_manager.region_grow(
        layer_id=str(layer_id),
        axis=body.axis,
        slice_index=body.slice_index,
        point=body.point,
        min_hu=body.min_hu,
        max_hu=body.max_hu,
        search_radius_mm=body.search_radius_mm,
        fill_holes=body.fill_holes,
        positive=body.positive,
    )


@router.post("/{case_id}/layers/{layer_id}/island-filter")
async def island_filter_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: IslandFilterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Apply 3D Slicer-grade Connected Component Island Filtering."""
    await _ensure_layer_session(case_id, layer_id, db)

    res = await nninteractive_manager.island_filter(
        layer_id=str(layer_id),
        operation=body.operation,
        min_size_voxels=body.min_size_voxels,
        axis=body.axis,
        slice_index=body.slice_index,
        point=body.point,
    )

    if body.operation == "split" and res.get("split_masks"):
        # Create separate database layers for each extracted island component
        result = await db.execute(
            select(Series)
            .where(Series.case_id == case_id)
            .where(Series.volume_path.isnot(None))
            .order_by(Series.is_selected.desc())
        )
        series = result.scalars().first()
        if series and series.volume_path:
            import SimpleITK as sitk
            ref_img = sitk.ReadImage(series.volume_path)
            case_dir = Path(settings.data_dir) / str(case_id)
            case_dir.mkdir(parents=True, exist_ok=True)

            created_split_layers = []
            palette = ["#38bdf8", "#00FFAA", "#fbbf24", "#f43f5e", "#a855f7", "#34d399", "#ec4899", "#84cc16"]

            for item in res["split_masks"]:
                new_lid = uuid.uuid4()
                c_mask = item["mask_arr"]
                c_img = sitk.GetImageFromArray(c_mask)
                c_img.CopyInformation(ref_img)
                c_path = case_dir / f"mask_{new_lid}.nrrd"
                sitk.WriteImage(c_img, str(c_path), useCompression=True)

                new_layer = SegmentationLayer(
                    id=new_lid,
                    series_id=series.id,
                    name=f"Island Component {item['rank']}",
                    color=palette[(item["rank"] - 1) % len(palette)],
                    status=LayerStatus.ACTIVE,
                    mask_path=str(c_path),
                )
                db.add(new_layer)
                nninteractive_manager.set_mask(str(new_lid), c_mask)
                created_split_layers.append({
                    "id": str(new_lid),
                    "name": new_layer.name,
                    "color": new_layer.color,
                    "voxel_count": item["voxel_count"],
                })

            await db.commit()
            res["created_layers"] = created_split_layers

    return res


@router.post("/{case_id}/layers/{layer_id}/split-mask")
async def split_layer_mask(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: SplitMaskRequest,
    db: AsyncSession = Depends(get_db),
):
    """Split a segmentation mask into independent layers via disconnected 3D islands or planar slice cut."""
    await _ensure_layer_session(case_id, layer_id, db)

    # Fetch original layer
    layer_res = await db.execute(select(SegmentationLayer).where(SegmentationLayer.id == layer_id))
    parent_layer = layer_res.scalar_one_or_none()
    if not parent_layer:
        raise HTTPException(status_code=404, detail="Source layer not found")

    res = await nninteractive_manager.split_mask(
        layer_id=str(layer_id),
        mode=body.mode,
        min_size_voxels=body.min_size_voxels,
        max_components=body.max_components,
        axis=body.axis,
        slice_index=body.slice_index,
    )

    if res.get("status") in ("empty_mask", "invalid_cut"):
        raise HTTPException(
            status_code=400,
            detail=res.get("message", "Cannot split empty or uncut mask"),
        )

    components = res.get("components", [])
    if not components:
        raise HTTPException(status_code=400, detail="No split components produced")

    # Fetch series reference for volume geometry
    result = await db.execute(
        select(Series)
        .where(Series.case_id == case_id)
        .where(Series.volume_path.isnot(None))
        .order_by(Series.is_selected.desc())
    )
    series = result.scalars().first()
    if not series or not series.volume_path:
        raise HTTPException(status_code=400, detail="Volume series not found for case")

    import SimpleITK as sitk
    ref_img = sitk.ReadImage(series.volume_path)
    case_dir = Path(settings.data_dir) / str(case_id)
    case_dir.mkdir(parents=True, exist_ok=True)

    # Distinct clinical orthopedic palette
    palette = [
        "#00e575", "#38bdf8", "#fbbf24", "#f43f5e",
        "#a855f7", "#34d399", "#ec4899", "#84cc16",
        "#06b6d4", "#f97316", "#6366f1", "#14b8a6"
    ]

    base_name = body.prefix or parent_layer.name
    created_layers = []

    for idx, item in enumerate(components):
        new_lid = uuid.uuid4()
        c_mask = item["mask_arr"]
        c_img = sitk.GetImageFromArray(c_mask)
        c_img.CopyInformation(ref_img)
        c_path = case_dir / f"mask_{new_lid}.nrrd"
        sitk.WriteImage(c_img, str(c_path), useCompression=True)

        chosen_color = palette[(idx + (1 if body.mode == "plane" else 0)) % len(palette)]
        layer_title = f"{base_name} ({item['suffix']})"

        new_layer = SegmentationLayer(
            id=new_lid,
            series_id=series.id,
            name=layer_title,
            color=chosen_color,
            status=LayerStatus.ACTIVE,
            mask_path=str(c_path),
        )
        db.add(new_layer)
        
        # Register in session cache & manager
        nninteractive_manager.set_mask(str(new_lid), c_mask)
        _layer_color_cache[str(new_lid)] = chosen_color
        _layer_mask_path_cache[str(new_lid)] = str(c_path)

        created_layers.append({
            "id": str(new_lid),
            "name": layer_title,
            "color": chosen_color,
            "voxel_count": item["voxel_count"],
            "volume_cm3": item.get("volume_cm3", 0.0),
            "mask_path": str(c_path),
            "status": "active",
        })

    if body.delete_original and len(created_layers) > 0:
        await db.delete(parent_layer)
        _layer_color_cache.pop(str(layer_id), None)
        _layer_mask_path_cache.pop(str(layer_id), None)

    await db.commit()

    return {
        "status": "success",
        "mode": body.mode,
        "parent_layer_id": str(layer_id),
        "components_count": len(created_layers),
        "created_layers": created_layers,
    }


@router.post("/{case_id}/layers/{layer_id}/threshold")
async def threshold_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: ThresholdRequest,
    db: AsyncSession = Depends(get_db),
):
    """Apply global or localized HU intensity threshold to active layer."""
    await _ensure_layer_session(case_id, layer_id, db)

    return await nninteractive_manager.apply_threshold(
        layer_id=str(layer_id),
        min_hu=body.min_hu,
        max_hu=body.max_hu,
        fill_holes=body.fill_holes,
        mode=body.mode,
    )


@router.post("/{case_id}/layers/{layer_id}/morphology")
async def morphology_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: MorphologyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Apply 3D mathematical morphology (smooth, fill_holes, dilate, erode)."""
    await _ensure_layer_session(case_id, layer_id, db)

    return await nninteractive_manager.apply_morphology(
        layer_id=str(layer_id),
        operation=body.operation,
        radius=body.radius,
    )


@router.get("/{case_id}/layers/{layer_id}/mask/slice/{axis}/{index}")
async def get_mask_slice(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    axis: str,
    index: int,
    db: AsyncSession = Depends(get_db),
):
    """Serve a transparent PNG overlay of the segmentation mask slice."""
    layer_id_str = str(layer_id)
    mask = nninteractive_manager.get_mask(layer_id_str)

    if mask is None:
        mask_path = _layer_mask_path_cache.get(layer_id_str)
        if mask_path and Path(mask_path).exists():
            try:
                import SimpleITK as sitk
                img = sitk.ReadImage(mask_path)
                mask = sitk.GetArrayFromImage(img)
                nninteractive_manager.set_mask(layer_id_str, mask)
            except Exception as read_err:
                logger.warning(f"Failed to read cached mask {mask_path}: {read_err}")
                mask = None

        if mask is None:
            result = await db.execute(select(SegmentationLayer).where(SegmentationLayer.id == layer_id))
            layer = result.scalar_one_or_none()
            if layer:
                if layer.color:
                    _layer_color_cache[layer_id_str] = layer.color
                if layer.mask_path:
                    _layer_mask_path_cache[layer_id_str] = layer.mask_path
                    if Path(layer.mask_path).exists():
                        try:
                            import SimpleITK as sitk
                            img = sitk.ReadImage(layer.mask_path)
                            mask = sitk.GetArrayFromImage(img)
                            nninteractive_manager.set_mask(layer_id_str, mask)
                        except Exception:
                            pass

            if mask is None:
                series_res = await db.execute(
                    select(Series)
                    .where(Series.case_id == case_id)
                    .where(Series.volume_path.isnot(None))
                    .order_by(Series.is_selected.desc())
                )
                series = series_res.scalars().first()
                if series and series.volume_path and Path(series.volume_path).exists():
                    await nninteractive_manager.init_session(layer_id_str, series.volume_path)
                    mask = nninteractive_manager.get_mask(layer_id_str)

            if mask is None:
                # Return transparent 1x1 PNG gracefully
                rgba = np.zeros((1, 1, 4), dtype=np.uint8)
                pil_img = Image.fromarray(rgba, mode="RGBA")
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                png_bytes = buf.getvalue()
                return Response(
                    content=png_bytes,
                    media_type="image/png",
                    headers={"Content-Length": str(len(png_bytes)), "Cache-Control": "public, max-age=10"},
                )

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

    # Fast color resolution from cache (no DB query needed)
    hex_color = _layer_color_cache.get(layer_id_str)
    if not hex_color:
        result = await db.execute(select(SegmentationLayer).where(SegmentationLayer.id == layer_id))
        layer = result.scalar_one_or_none()
        if layer and layer.color:
            hex_color = layer.color
            _layer_color_cache[layer_id_str] = hex_color

    if not hex_color or hex_color.lower() in ("#0f3e17", "#000000", "#111111"):
        hex_color = "#00e575"

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
    pil_img.save(buf, format="PNG", compress_level=1)
    png_bytes = buf.getvalue()


    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Length": str(len(png_bytes)),
            "Cache-Control": "public, max-age=10",
        },
    )



@router.post("/{case_id}/layers/{layer_id}/reset")
async def reset_layer(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Reset the current segmentation layer mask."""
    await _ensure_layer_session(case_id, layer_id, db)
    return await nninteractive_manager.reset(str(layer_id))


@router.post("/{case_id}/layers/{layer_id}/undo")
async def undo_prompt(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Undo the last segmentation prompt."""
    await _ensure_layer_session(case_id, layer_id, db)
    return await nninteractive_manager.undo(str(layer_id))


@router.post("/{case_id}/layers/{layer_id}/redo")
async def redo_prompt(
    case_id: uuid.UUID,
    layer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Redo a previously undone segmentation prompt."""
    await _ensure_layer_session(case_id, layer_id, db)
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
    _layer_mask_path_cache[str(layer.id)] = str(mask_file_path)

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
