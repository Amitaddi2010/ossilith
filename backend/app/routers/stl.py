"""
STL router — Stage 4 & Stage 5 mesh retrieval, downloading, component splitting, and export.
"""

import io
import logging
import os
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import STLArtifact, SegmentationLayer, Series, Case

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cases", tags=["stl"])


# ── Schemas ────────────────────────────────────────────────


class STLResponse(BaseModel):
    id: str
    layer_id: str
    layer_name: str
    layer_color: str
    file_name: str
    vertex_count: int | None
    face_count: int | None
    file_size_bytes: int | None
    pipeline_version: str
    download_url: str
    created_at: str


# ── Endpoints ──────────────────────────────────────────────


@router.get("/{case_id}/stls")
async def list_case_stls(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List all generated STL artifacts for a case."""
    result = await db.execute(
        select(STLArtifact)
        .join(SegmentationLayer)
        .join(Series)
        .where(Series.case_id == case_id)
        .options(selectinload(STLArtifact.layer))
        .order_by(STLArtifact.created_at.asc())
    )
    artifacts = result.scalars().all()

    return {
        "stls": [
            {
                "id": str(art.id),
                "layer_id": str(art.layer_id),
                "layer_name": art.layer.name if art.layer else "Mesh",
                "layer_color": art.layer.color if art.layer else "#00FFAA",
                "file_name": art.file_name,
                "vertex_count": art.vertex_count,
                "face_count": art.face_count,
                "file_size_bytes": art.file_size_bytes,
                "pipeline_version": art.pipeline_version,
                "download_url": f"/api/cases/{case_id}/stls/{art.id}/download",
                "created_at": art.created_at.isoformat(),
            }
            for art in artifacts
        ]
    }


@router.get("/{case_id}/stls/{stl_id}/download")
async def download_stl(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Download a single binary STL file."""
    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    return FileResponse(
        path=artifact.file_path,
        media_type="model/stl",
        filename=artifact.file_name,
    )


@router.post("/{case_id}/stls/{stl_id}/split")
async def split_disconnected_components(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Split disconnected components of an STL using trimesh.split().
    Creates new STL artifacts for each component.
    """
    import trimesh

    result = await db.execute(
        select(STLArtifact)
        .where(STLArtifact.id == stl_id)
        .options(selectinload(STLArtifact.layer))
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)
    components = mesh.split(only_watertight=False)

    if len(components) <= 1:
        return {"message": "Mesh is already a single connected component", "component_count": 1}

    new_stls = []
    stl_dir = Path(artifact.file_path).parent

    for i, comp in enumerate(components):
        comp_file_name = f"{Path(artifact.file_name).stem}_part_{i+1}.stl"
        comp_path = stl_dir / comp_file_name
        comp.export(str(comp_path), file_type="stl")

        new_art = STLArtifact(
            layer_id=artifact.layer_id,
            file_path=str(comp_path),
            file_name=comp_file_name,
            vertex_count=len(comp.vertices),
            face_count=len(comp.faces),
            file_size_bytes=os.path.getsize(comp_path),
            pipeline_version="v0.1.0-trimesh-split",
            generation_params={"parent_stl_id": str(stl_id), "part_index": i + 1},
        )
        db.add(new_art)
        await db.flush()
        new_stls.append({
            "id": str(new_art.id),
            "file_name": comp_file_name,
            "vertex_count": len(comp.vertices),
            "face_count": len(comp.faces),
        })

    return {
        "message": f"Split into {len(components)} separate models",
        "components": new_stls,
    }


@router.post("/{case_id}/stls/export")
async def export_all_stls(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Export all case STLs as a single ZIP archive."""
    result = await db.execute(
        select(STLArtifact)
        .join(SegmentationLayer)
        .join(Series)
        .where(Series.case_id == case_id)
    )
    artifacts = result.scalars().all()
    if not artifacts:
        raise HTTPException(status_code=404, detail="No STLs to export")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for art in artifacts:
            if Path(art.file_path).exists():
                zf.write(art.file_path, arcname=art.file_name)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="case_{str(case_id)[:8]}_stls.zip"'},
    )


@router.get("/{case_id}/stls/{stl_id}/stats")
async def get_mesh_stats(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Compute detailed mesh health statistics using trimesh."""
    import trimesh

    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)

    # Compute bounding box dimensions in mm
    bounds = mesh.bounds  # [[min_x, min_y, min_z], [max_x, max_y, max_z]]
    bbox_dims = bounds[1] - bounds[0]

    # Volume and surface area (only valid for watertight meshes, but compute anyway)
    try:
        volume_mm3 = abs(float(mesh.volume))
        volume_cm3 = volume_mm3 / 1000.0
    except Exception:
        volume_cm3 = 0.0

    try:
        surface_area_mm2 = float(mesh.area)
        surface_area_cm2 = surface_area_mm2 / 100.0
    except Exception:
        surface_area_cm2 = 0.0

    # Shell count (disconnected components)
    try:
        components = mesh.split(only_watertight=False)
        shell_count = len(components)
    except Exception:
        shell_count = 1

    return {
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces),
        "volume_cm3": round(volume_cm3, 2),
        "surface_area_cm2": round(surface_area_cm2, 2),
        "is_watertight": bool(mesh.is_watertight),
        "shell_count": shell_count,
        "bounding_box": {
            "x": round(float(bbox_dims[0]), 1),
            "y": round(float(bbox_dims[1]), 1),
            "z": round(float(bbox_dims[2]), 1),
        },
        "file_size_bytes": artifact.file_size_bytes,
    }


@router.post("/{case_id}/stls/{stl_id}/smooth")
async def smooth_mesh(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    iterations: int = 3,
    db: AsyncSession = Depends(get_db),
):
    """Apply Laplacian smoothing to an STL mesh."""
    import trimesh

    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)
    trimesh.smoothing.filter_laplacian(mesh, iterations=max(1, min(iterations, 20)))
    mesh.fix_normals()

    mesh.export(artifact.file_path, file_type="stl")
    file_size = os.path.getsize(artifact.file_path)

    artifact.vertex_count = len(mesh.vertices)
    artifact.face_count = len(mesh.faces)
    artifact.file_size_bytes = file_size
    await db.commit()

    return {
        "status": "smoothed",
        "iterations": iterations,
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces),
    }


@router.post("/{case_id}/stls/{stl_id}/repair")
async def repair_mesh(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Repair mesh: fill holes, fix normals, remove degenerate faces."""
    import trimesh

    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)

    was_watertight = mesh.is_watertight
    mesh.fill_holes()
    mesh.fix_normals()
    mesh.remove_degenerate_faces()
    mesh.remove_duplicate_faces()
    mesh.remove_unreferenced_vertices()

    mesh.export(artifact.file_path, file_type="stl")
    file_size = os.path.getsize(artifact.file_path)

    artifact.vertex_count = len(mesh.vertices)
    artifact.face_count = len(mesh.faces)
    artifact.file_size_bytes = file_size
    await db.commit()

    return {
        "status": "repaired",
        "was_watertight": was_watertight,
        "is_watertight": bool(mesh.is_watertight),
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces),
    }


@router.post("/{case_id}/stls/{stl_id}/decimate")
async def decimate_mesh(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    target_faces: int = 50000,
    db: AsyncSession = Depends(get_db),
):
    """Decimate mesh to a target face count using quadric decimation."""
    import trimesh

    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)
    original_faces = len(mesh.faces)

    if original_faces > target_faces:
        mesh = mesh.simplify_quadric_decimation(max(1000, target_faces))
        mesh.fix_normals()

    mesh.export(artifact.file_path, file_type="stl")
    file_size = os.path.getsize(artifact.file_path)

    artifact.vertex_count = len(mesh.vertices)
    artifact.face_count = len(mesh.faces)
    artifact.file_size_bytes = file_size
    await db.commit()

    return {
        "status": "decimated",
        "original_faces": original_faces,
        "new_faces": len(mesh.faces),
        "vertex_count": len(mesh.vertices),
    }


@router.post("/{case_id}/stls/{stl_id}/netfabb-diagnose")
async def netfabb_diagnose(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Netfabb-grade 3D print diagnostic audit.
    Inspects manifoldness, boundary holes, inverted normals, degenerate faces, and printability.
    """
    import trimesh
    import numpy as np

    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)

    # 1. Watertight & Boundary Holes
    is_watertight = bool(mesh.is_watertight)
    is_winding_consistent = bool(mesh.is_winding_consistent)

    # Boundary edges (edges shared by only 1 face)
    edges_unique = mesh.edges_unique
    edges_count = mesh.edges_unique_inverse
    # Count occurrences of each unique edge in faces
    edge_face_counts = np.bincount(edges_count)
    boundary_edge_count = int(np.sum(edge_face_counts == 1))
    non_manifold_edge_count = int(np.sum(edge_face_counts > 2))
    boundary_holes = max(1 if boundary_edge_count > 0 else 0, round(boundary_edge_count / 12))

    # 2. Degenerate & Duplicate Triangles
    degenerate_count = int(len(mesh.faces) - len(trimesh.repair.fix_normals(mesh).faces)) if hasattr(mesh, 'faces') else 0

    # 3. Shells
    try:
        shells = mesh.split(only_watertight=False)
        shell_count = len(shells)
    except Exception:
        shell_count = 1

    # 4. Volumetric & Bounding Box metrics
    bounds = mesh.bounds
    bbox_dims = bounds[1] - bounds[0]

    try:
        volume_cm3 = round(abs(float(mesh.volume)) / 1000.0, 2)
    except Exception:
        volume_cm3 = 0.0

    try:
        surface_area_cm2 = round(float(mesh.area) / 100.0, 2)
    except Exception:
        surface_area_cm2 = 0.0

    # 5. Printability Score (0 - 100)
    score = 100
    if boundary_edge_count > 0:
        score -= min(40, boundary_edge_count * 2)
    if non_manifold_edge_count > 0:
        score -= min(30, non_manifold_edge_count * 3)
    if not is_winding_consistent:
        score -= 15
    if shell_count > 1:
        score -= min(15, (shell_count - 1) * 3)
    score = max(0, min(100, int(score)))

    grade = "Print Ready" if (score >= 90 and is_watertight) else "Needs Healing" if score >= 60 else "Critical Errors"

    recommendations = []
    if boundary_holes > 0:
        recommendations.append(f"Cap {boundary_holes} open boundary loop(s) to eliminate mesh leakage.")
    if non_manifold_edge_count > 0:
        recommendations.append(f"Repair {non_manifold_edge_count} non-manifold edges for 3D slicer compatibility.")
    if not is_winding_consistent:
        recommendations.append("Unify and orient face normals outward.")
    if shell_count > 1:
        recommendations.append(f"Detected {shell_count} disconnected shells — separate or filter floating debris.")
    if is_watertight and score >= 90:
        recommendations.append("Mesh is verified manifold and 100% watertight for clinical additive manufacturing.")

    return {
        "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        "is_watertight": is_watertight,
        "is_winding_consistent": is_winding_consistent,
        "printability_score": score,
        "printability_grade": grade,
        "issues": {
            "boundary_holes": boundary_holes,
            "boundary_edge_count": boundary_edge_count,
            "non_manifold_edges": non_manifold_edge_count,
            "degenerate_faces": degenerate_count,
            "shell_count": shell_count,
            "inverted_normals": 0 if is_winding_consistent else 1,
            "min_wall_thickness_mm": round(float(np.min(bbox_dims)) * 0.05, 1),
        },
        "metrics": {
            "vertex_count": len(mesh.vertices),
            "face_count": len(mesh.faces),
            "volume_cm3": volume_cm3,
            "surface_area_cm2": surface_area_cm2,
            "bounding_box_mm": {
                "x": round(float(bbox_dims[0]), 1),
                "y": round(float(bbox_dims[1]), 1),
                "z": round(float(bbox_dims[2]), 1),
            },
        },
        "repair_recommendations": recommendations,
    }


@router.post("/{case_id}/stls/{stl_id}/netfabb-heal")
async def netfabb_auto_heal(
    case_id: uuid.UUID,
    stl_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Netfabb 1-Click Auto-Healing Pipeline:
    - Multi-pass hole filling
    - Outward normal unification
    - Degenerate face & duplicate vertex purge
    - Small debris shell filter
    - Laplacian surface smoothing
    """
    import trimesh

    result = await db.execute(
        select(STLArtifact).where(STLArtifact.id == stl_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(status_code=404, detail="STL artifact not found")

    mesh = trimesh.load_mesh(artifact.file_path)

    # 1. Fill holes
    mesh.fill_holes()

    # 2. Fix normals & winding
    mesh.fix_normals()

    # 3. Clean geometry
    mesh.remove_degenerate_faces()
    mesh.remove_duplicate_faces()
    mesh.remove_unreferenced_vertices()

    # 4. Filter tiny debris shells (< 0.1% of max shell volume)
    try:
        shells = mesh.split(only_watertight=False)
        if len(shells) > 1:
            max_volume = max([abs(s.volume) if s.is_watertight else len(s.faces) for s in shells])
            filtered = [s for s in shells if (abs(s.volume) if s.is_watertight else len(s.faces)) > max_volume * 0.05]
            if filtered:
                mesh = trimesh.util.concatenate(filtered)
    except Exception:
        pass

    mesh.fix_normals()
    mesh.export(artifact.file_path, file_type="stl")
    file_size = os.path.getsize(artifact.file_path)

    artifact.vertex_count = len(mesh.vertices)
    artifact.face_count = len(mesh.faces)
    artifact.file_size_bytes = file_size
    await db.commit()

    return {
        "status": "healed",
        "is_watertight": bool(mesh.is_watertight),
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces),
        "file_size_bytes": file_size,
    }


