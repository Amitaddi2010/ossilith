"""DICOM validation and series grouping service using pydicom."""

import logging
import os
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pydicom
from pydicom.errors import InvalidDicomError

logger = logging.getLogger(__name__)


# ── Validation result types ────────────────────────────────

class DicomValidationError:
    """A single validation issue."""

    def __init__(self, file_path: str, severity: str, message: str):
        self.file_path = file_path
        self.severity = severity  # "error" | "warning"
        self.message = message

    def to_dict(self) -> dict:
        return {
            "file_path": os.path.basename(self.file_path),
            "severity": self.severity,
            "message": self.message,
        }


class SeriesInfo:
    """Parsed metadata for a single DICOM series."""

    def __init__(self):
        self.series_instance_uid: str = ""
        self.modality: str = ""
        self.patient_id: str = ""
        self.patient_name: str = ""
        self.study_description: str = ""
        self.series_description: str = ""
        self.slice_count: int = 0
        self.pixel_spacing: tuple[float, float] | None = None
        self.slice_thickness: float | None = None
        self.image_orientation: list[float] | None = None
        self.files: list[str] = []
        self.slice_locations: list[float] = []
        self.rows: int = 0
        self.columns: int = 0
        self.validation_errors: list[DicomValidationError] = []
        self.thumbnail_file: str | None = None

    def to_dict(self) -> dict:
        return {
            "series_instance_uid": self.series_instance_uid,
            "modality": self.modality,
            "patient_id": self.patient_id,
            "patient_name": self.patient_name,
            "study_description": self.study_description,
            "series_description": self.series_description,
            "slice_count": self.slice_count,
            "pixel_spacing_x": self.pixel_spacing[0] if self.pixel_spacing else None,
            "pixel_spacing_y": self.pixel_spacing[1] if self.pixel_spacing else None,
            "slice_thickness": self.slice_thickness,
            "rows": self.rows,
            "columns": self.columns,
            "file_count": len(self.files),
            "validation_errors": [e.to_dict() for e in self.validation_errors],
            "is_valid": all(e.severity != "error" for e in self.validation_errors),
        }


# ── Core functions ─────────────────────────────────────────


def extract_upload(upload_dir: Path, files: list[tuple[str, bytes]]) -> Path:
    """Save uploaded files, extracting ZIPs if present. Returns the dicom dir."""
    dicom_dir = upload_dir / "dicom"
    dicom_dir.mkdir(parents=True, exist_ok=True)

    for filename, content in files:
        file_path = dicom_dir / filename

        if filename.lower().endswith(".zip"):
            # Save zip then extract
            zip_path = upload_dir / filename
            zip_path.write_bytes(content)
            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    for member in zf.namelist():
                        # Skip directories and hidden files
                        if member.endswith("/") or os.path.basename(member).startswith("."):
                            continue
                        # Flatten into dicom dir (avoid nested paths)
                        target = dicom_dir / os.path.basename(member)
                        # Handle name collisions
                        if target.exists():
                            stem = target.stem
                            suffix = target.suffix
                            i = 1
                            while target.exists():
                                target = dicom_dir / f"{stem}_{i}{suffix}"
                                i += 1
                        target.write_bytes(zf.read(member))
            finally:
                zip_path.unlink(missing_ok=True)
        else:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(content)

    return dicom_dir


def parse_and_group_series(dicom_dir: Path) -> tuple[dict[str, SeriesInfo], list[DicomValidationError]]:
    """
    Scan all files in dicom_dir, parse with pydicom, group by SeriesInstanceUID.
    Returns (series_map, global_errors).
    """
    series_map: dict[str, SeriesInfo] = {}
    global_errors: list[DicomValidationError] = []

    dicom_files = []
    for root, _dirs, filenames in os.walk(dicom_dir):
        for fname in filenames:
            fpath = os.path.join(root, fname)
            dicom_files.append(fpath)

    if not dicom_files:
        global_errors.append(
            DicomValidationError("", "error", "No files found in upload")
        )
        return series_map, global_errors

    logger.info(f"Scanning {len(dicom_files)} files for DICOM data")

    parsed_count = 0
    for fpath in dicom_files:
        try:
            ds = pydicom.dcmread(fpath, stop_before_pixels=True, force=True)
        except (InvalidDicomError, Exception) as e:
            global_errors.append(
                DicomValidationError(fpath, "warning", f"Not a valid DICOM file: {e}")
            )
            continue

        # Must have SeriesInstanceUID
        series_uid = getattr(ds, "SeriesInstanceUID", None)
        if not series_uid:
            global_errors.append(
                DicomValidationError(fpath, "warning", "Missing SeriesInstanceUID — skipped")
            )
            continue

        series_uid = str(series_uid)

        # Get or create series info
        if series_uid not in series_map:
            info = SeriesInfo()
            info.series_instance_uid = series_uid
            info.modality = str(getattr(ds, "Modality", "Unknown"))
            info.patient_id = str(getattr(ds, "PatientID", ""))
            info.patient_name = str(getattr(ds, "PatientName", ""))
            info.study_description = str(getattr(ds, "StudyDescription", ""))
            info.series_description = str(getattr(ds, "SeriesDescription", ""))
            info.rows = int(getattr(ds, "Rows", 0))
            info.columns = int(getattr(ds, "Columns", 0))

            # Pixel spacing with fallback to ImagerPixelSpacing
            ps = getattr(ds, "PixelSpacing", None)
            if not ps:
                ps = getattr(ds, "ImagerPixelSpacing", None)
            if not ps:
                ps = getattr(ds, "NominalScannedPixelSpacing", None)
            if ps and len(ps) >= 2:
                info.pixel_spacing = (float(ps[0]), float(ps[1]))
            else:
                # Default to 1.0mm if completely missing
                info.pixel_spacing = (1.0, 1.0)

            # Slice thickness
            st = getattr(ds, "SliceThickness", None)
            if st is not None:
                info.slice_thickness = float(st)
            else:
                info.slice_thickness = 1.0

            # Image orientation
            iop = getattr(ds, "ImageOrientationPatient", None)
            if iop:
                info.image_orientation = [float(x) for x in iop]

            series_map[series_uid] = info

        info = series_map[series_uid]
        info.files.append(fpath)

        # Slice location for sorting
        slice_loc = getattr(ds, "SliceLocation", None)
        if slice_loc is not None:
            info.slice_locations.append(float(slice_loc))
        else:
            # Fallback: compute from ImagePositionPatient
            ipp = getattr(ds, "ImagePositionPatient", None)
            if ipp and len(ipp) >= 3:
                info.slice_locations.append(float(ipp[2]))

        parsed_count += 1

    # Post-processing per series
    for uid, info in series_map.items():
        info.slice_count = len(info.files)

        # Set thumbnail as the middle slice
        if info.files:
            mid = len(info.files) // 2
            info.thumbnail_file = info.files[mid]

        # Validate series
        _validate_series(info)

    logger.info(
        f"Parsed {parsed_count} DICOM files into {len(series_map)} series"
    )

    return series_map, global_errors


def _validate_series(info: SeriesInfo) -> None:
    """Run validation checks on a parsed series."""

    # Spacing verification
    if info.pixel_spacing is None:
        info.validation_errors.append(
            DicomValidationError(
                info.series_instance_uid,
                "warning",
                "PixelSpacing missing in headers — defaulted to 1.0mm",
            )
        )

    # Thickness check
    if info.slice_thickness is None and len(info.slice_locations) < 2:
        info.validation_errors.append(
            DicomValidationError(
                info.series_instance_uid,
                "warning",
                "SliceThickness missing — defaulted to 1.0mm",
            )
        )

    # Minimum slice count warning
    if info.slice_count < 3:
        info.validation_errors.append(
            DicomValidationError(
                info.series_instance_uid,
                "warning",
                f"Series has {info.slice_count} slice(s) — stacked for 3D reconstruction",
            )
        )

    # Check for slice location gaps
    if len(info.slice_locations) >= 2:
        sorted_locs = sorted(info.slice_locations)
        spacings = [sorted_locs[i + 1] - sorted_locs[i] for i in range(len(sorted_locs) - 1)]
        if spacings:
            median_spacing = float(np.median(spacings))
            if median_spacing > 0:
                for i, sp in enumerate(spacings):
                    ratio = sp / median_spacing
                    if ratio > 1.5 or ratio < 0.5:
                        info.validation_errors.append(
                            DicomValidationError(
                                info.series_instance_uid,
                                "warning",
                                f"Inconsistent slice spacing at position {i}: {sp:.2f}mm vs median {median_spacing:.2f}mm",
                            )
                        )
                        break  # One warning is enough


def get_sorted_file_list(info: SeriesInfo) -> list[str]:
    """Return files sorted by slice location for volume reconstruction."""
    if len(info.slice_locations) == len(info.files):
        # Sort files by their slice locations
        paired = list(zip(info.slice_locations, info.files))
        paired.sort(key=lambda x: x[0])
        return [f for _, f in paired]
    else:
        # Fallback: sort by filename
        return sorted(info.files)
