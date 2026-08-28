"""
Celery task: Stage 4 — STL generation via Marching Cubes and Trimesh mesh processing.
Extracts isosurface, applies smoothing, decimation, and exports watertight binary STL.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np

from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from app.celery_app import celery
from app.config import settings
from app.models import Job, JobStatus, STLArtifact

logger = logging.getLogger(__name__)


def _to_uuid(val: Any) -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))


def _update_job_progress(job_id: str, progress: int, message: str, status: str = "running"):
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        status_enum = {
            "running": JobStatus.RUNNING,
            "completed": JobStatus.COMPLETED,
            "failed": JobStatus.FAILED,
        }.get(status, JobStatus.RUNNING)

        update_dict = {
            "progress": progress,
            "message": message,
            "status": status_enum,
        }
        if status in ("completed", "failed"):
            update_dict["completed_at"] = datetime.now(timezone.utc)

        session.execute(
            update(Job).where(Job.id == _to_uuid(job_id)).values(**update_dict)
        )
        session.commit()
    engine.dispose()


def _save_stl_artifact(layer_id: str, file_path: str, file_name: str, vertex_count: int, face_count: int, file_size: int, params: dict):
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        artifact = STLArtifact(
            layer_id=_to_uuid(layer_id),
            file_path=file_path,
            file_name=file_name,
            vertex_count=vertex_count,
            face_count=face_count,
            file_size_bytes=file_size,
            pipeline_version="v0.1.0-mc-trimesh",
            generation_params=params,
        )
        session.add(artifact)
        session.commit()
    engine.dispose()


@celery.task(bind=True, name="generate_stl_task", max_retries=0)
def generate_stl_task(self, case_id: str, layer_id: str, job_id: str, mask_path: str, layer_name: str):
    """
    Marching Cubes → Trimesh smoothing & decimation → Binary STL export.
    """
    try:
        import SimpleITK as sitk
        import trimesh

        _update_job_progress(job_id, 10, "Loading segmentation mask...")

        mask_img = sitk.ReadImage(mask_path)
        mask_arr = sitk.GetArrayFromImage(mask_img)
        spacing = mask_img.GetSpacing()
        origin = mask_img.GetOrigin()

        if not np.any(mask_arr > 0):
            raise ValueError("Segmentation mask is empty — no voxels to mesh")

        _update_job_progress(job_id, 30, "Extracting isosurface via Marching Cubes...")

        try:
            from skimage.measure import marching_cubes
            verts, faces, normals, values = marching_cubes(
                mask_arr,
                level=0.5,
                spacing=(spacing[2], spacing[1], spacing[0]),
            )
            verts = verts[:, [2, 1, 0]]
            verts[:, 0] += origin[0]
            verts[:, 1] += origin[1]
            verts[:, 2] += origin[2]
        except Exception as e:
            logger.warning(f"skimage marching_cubes fallback: {e}")
            raise

        _update_job_progress(job_id, 60, f"Raw mesh extracted: {len(verts)} vertices, {len(faces)} faces. Smoothing...")

        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)

        try:
            trimesh.smoothing.filter_laplacian(mesh, iterations=2)
        except Exception as e:
            logger.warning(f"Mesh smoothing skipped: {e}")

        _update_job_progress(job_id, 75, "Optimizing mesh geometry & decimation...")
        target_faces = 150000
        if len(mesh.faces) > target_faces:
            try:
                mesh = mesh.simplify_quadric_decimation(target_faces)
            except Exception as e:
                logger.warning(f"Decimation skipped: {e}")

        mesh.fix_normals()

        _update_job_progress(job_id, 90, "Exporting binary STL artifact...")
        stl_dir = Path(settings.data_dir) / case_id / "stls"
        stl_dir.mkdir(parents=True, exist_ok=True)
        safe_name = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in layer_name)
        stl_file_name = f"{safe_name}_{layer_id[:8]}.stl"
        stl_path = stl_dir / stl_file_name

        mesh.export(str(stl_path), file_type="stl")
        file_size = os.path.getsize(stl_path)

        params = {
            "isovalue": 0.5,
            "smoothing": "laplacian_2",
            "spacing": list(spacing),
            "target_faces": target_faces,
        }
        _save_stl_artifact(
            layer_id=layer_id,
            file_path=str(stl_path),
            file_name=stl_file_name,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.faces),
            file_size=file_size,
            params=params,
        )

        _update_job_progress(
            job_id,
            100,
            f"STL ready: {len(mesh.vertices):,} vertices, {len(mesh.faces):,} faces ({file_size // 1024} KB)",
            status="completed",
        )

        logger.info(f"Generated STL {stl_path} for layer {layer_id}")
        return {
            "stl_path": str(stl_path),
            "file_name": stl_file_name,
            "vertex_count": len(mesh.vertices),
            "face_count": len(mesh.faces),
        }

    except Exception as e:
        logger.exception(f"STL generation failed for layer {layer_id}")
        _update_job_progress(job_id, 100, f"Failed: {e}", status="failed")
        raise
