"""Celery task: reconstruct 3D volume from DICOM series using SimpleITK."""

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import SimpleITK as sitk
from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from app.celery_app import celery
from app.config import settings
from app.models import Job, JobStatus, Series, Case, CaseStatus
from app.services.dicom_service import parse_and_group_series, get_sorted_file_list

logger = logging.getLogger(__name__)


def _to_uuid(val: Any) -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))


def _update_job_progress(job_id: str, progress: int, message: str, status: str = "running"):
    """Update job progress in DB (synchronous — runs inside Celery worker or thread)."""
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


def _update_job_error(job_id: str, error: str):
    """Mark job as failed."""
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        session.execute(
            update(Job)
            .where(Job.id == _to_uuid(job_id))
            .values(
                status=JobStatus.FAILED,
                error=error,
                completed_at=datetime.now(timezone.utc),
            )
        )
        session.commit()
    engine.dispose()


def _update_series_volume_path(series_id: str, volume_path: str):
    """Set the volume_path on the Series record."""
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        session.execute(
            update(Series)
            .where(Series.id == _to_uuid(series_id))
            .values(volume_path=volume_path)
        )
        session.commit()
    engine.dispose()


def _update_case_status(case_id: str, status_str: str):
    """Update the case status."""
    status_map = {
        "ready": CaseStatus.READY,
        "error": CaseStatus.ERROR,
    }
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        session.execute(
            update(Case)
            .where(Case.id == _to_uuid(case_id))
            .values(
                status=status_map.get(status_str, CaseStatus.ERROR),
                updated_at=datetime.now(timezone.utc),
            )
        )
        session.commit()
    engine.dispose()


@celery.task(bind=True, name="reconstruct_volume", max_retries=0)
def reconstruct_volume(self, case_id: str, series_id: str, job_id: str, dicom_dir: str):
    """
    Build a 3D volume from a DICOM series:
    1. Read DICOM series with SimpleITK
    2. Sort slices by ImagePositionPatient
    3. Resample to isotropic spacing
    4. Save as NRRD
    """
    try:
        _update_job_progress(job_id, 5, "Locating DICOM series files...")

        dicom_path = Path(dicom_dir)
        if not dicom_path.exists():
            raise FileNotFoundError(f"DICOM directory not found: {dicom_dir}")

        # Get sorted file list via pydicom grouping
        series_map, _ = parse_and_group_series(dicom_path)
        dicom_files = []

        if series_map:
            for uid, info in series_map.items():
                if info.files:
                    dicom_files = get_sorted_file_list(info)
                    break

        if not dicom_files:
            reader = sitk.ImageSeriesReader()
            series_ids = reader.GetGDCMSeriesIDs(str(dicom_path))
            if series_ids:
                dicom_files = list(reader.GetGDCMSeriesFileNames(str(dicom_path), series_ids[0]))
            else:
                dicom_files = [str(p) for p in dicom_path.rglob("*") if p.is_file() and not p.name.startswith(".")]

        if not dicom_files:
            raise ValueError(f"No DICOM slices found in {dicom_dir}")

        _update_job_progress(job_id, 20, f"Loading {len(dicom_files)} DICOM slices with SimpleITK...")

        reader = sitk.ImageSeriesReader()
        reader.SetFileNames(dicom_files)
        reader.MetaDataDictionaryArrayUpdateOn()
        reader.LoadPrivateTagsOn()

        try:
            image = reader.Execute()
        except Exception as sitk_err:
            logger.warning(f"ImageSeriesReader failed ({sitk_err}). Attempting slice-by-slice stack...")
            slice_images = []
            for f in dicom_files:
                try:
                    slice_images.append(sitk.ReadImage(f))
                except Exception:
                    pass
            if not slice_images:
                raise ValueError(f"Failed to read DICOM files: {sitk_err}")
            image = sitk.JoinSeries(slice_images)

        _update_job_progress(job_id, 45, "DICOM volume assembled. Analyzing voxel spacing...")

        original_spacing = image.GetSpacing()
        original_size = image.GetSize()
        logger.info(
            f"Original volume: size={original_size}, spacing={original_spacing}"
        )

        _update_job_progress(
            job_id,
            55,
            f"Volume dimensions: {original_size[0]}×{original_size[1]}×{original_size[2]} "
            f"@ {original_spacing[0]:.2f}×{original_spacing[1]:.2f}×{original_spacing[2]:.2f} mm",
        )

        # ── Step 3: Resample to isotropic spacing ──────────
        iso_spacing = min(original_spacing)
        iso_spacing = max(iso_spacing, 0.4)

        new_spacing = [iso_spacing, iso_spacing, iso_spacing]

        _update_job_progress(job_id, 70, f"Resampling to isotropic spacing ({iso_spacing:.2f}mm)...")

        new_size = [
            int(round(osz * ospc / iso_spacing))
            for osz, ospc in zip(original_size, original_spacing)
        ]

        # For very large CT volumes (>500MB), downsample max dimension to 512 for smooth LAN/workstation performance
        max_dim = max(new_size)
        if max_dim > 512:
            scale_down = 512.0 / max_dim
            iso_spacing = iso_spacing / scale_down
            new_spacing = [iso_spacing, iso_spacing, iso_spacing]
            new_size = [int(round(s * scale_down)) for s in new_size]
            logger.info(f"Scaled volume to {new_size} for optimal GPU performance")

        resampler = sitk.ResampleImageFilter()
        resampler.SetOutputSpacing(new_spacing)
        resampler.SetSize(new_size)
        resampler.SetOutputDirection(image.GetDirection())
        resampler.SetOutputOrigin(image.GetOrigin())
        resampler.SetTransform(sitk.Transform())
        resampler.SetDefaultPixelValue(int(sitk.GetArrayViewFromImage(image).min()))
        resampler.SetInterpolator(sitk.sitkLinear)

        resampled = resampler.Execute(image)

        _update_job_progress(
            job_id,
            85,
            f"Resampled volume: {new_size[0]}×{new_size[1]}×{new_size[2]} voxels",
        )

        # ── Step 4: Save as NRRD ───────────────────────────
        output_dir = Path(settings.data_dir) / case_id
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "volume.nrrd"

        _update_job_progress(job_id, 92, "Persisting volume to disk (.nrrd)...")

        sitk.WriteImage(resampled, str(output_path), useCompression=True)

        # ── Step 5: Update DB ──────────────────────────────
        _update_series_volume_path(series_id, str(output_path))
        _update_case_status(case_id, "ready")
        _update_job_progress(
            job_id,
            100,
            f"Volume ready: {new_size[0]}×{new_size[1]}×{new_size[2]} @ {iso_spacing:.2f}mm isotropic",
            status="completed",
        )

        logger.info(f"Volume reconstruction complete for case {case_id}: {output_path}")

        return {
            "volume_path": str(output_path),
            "size": new_size,
            "spacing": new_spacing,
        }

    except Exception as e:
        logger.exception(f"Volume reconstruction failed for case {case_id}")
        _update_job_error(job_id, str(e))
        _update_case_status(case_id, "error")
        raise
