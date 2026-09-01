"""Unit test for TotalSegmentator and MONAI auto-segmentation execution."""

import uuid
import pytest
import numpy as np
import SimpleITK as sitk
from pathlib import Path

from app.database import async_session_factory, engine
from app.models import Case, Series, Base, SegmentationLayer, Job
from app.tasks.autoseg_tasks import run_totalsegmentator_task


@pytest.mark.asyncio
async def test_autoseg_execution_and_layers(tmp_path: Path):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 1. Create a synthetic 3D CT volume (10 x 30 x 30)
    vol_path = tmp_path / "test_ct_volume.nrrd"
    vol_arr = np.full((10, 30, 30), -1000, dtype=np.int16)
    # High-density bone structures
    vol_arr[2:8, 5:15, 5:15] = 550   # Femur
    vol_arr[2:8, 18:28, 18:28] = 480 # Tibia
    # Soft tissue
    vol_arr[4:7, 8:22, 8:22] = 50

    img = sitk.GetImageFromArray(vol_arr)
    img.SetSpacing((1.0, 1.0, 1.5))
    sitk.WriteImage(img, str(vol_path))

    case_id = uuid.uuid4()
    series_id = uuid.uuid4()
    job_id = uuid.uuid4()

    async with async_session_factory() as db:
        case = Case(id=case_id, name="Test AutoSeg Case")
        db.add(case)
        series = Series(
            id=series_id,
            case_id=case_id,
            series_instance_uid="1.2.3.4",
            modality="CT",
            slice_count=10,
            pixel_spacing_x=1.0,
            pixel_spacing_y=1.0,
            slice_thickness=1.5,
            volume_path=str(vol_path),
            dicom_dir=str(tmp_path),
        )
        db.add(series)
        job = Job(
            id=job_id,
            case_id=case_id,
            type="AUTO_SEGMENTATION",
            status="PENDING",
            progress=0,
            message="Queued",
        )
        db.add(job)
        await db.commit()

    # 2. Execute TotalSegmentator (unified bones preset)
    run_totalsegmentator_task(
        case_id=str(case_id),
        series_id=str(series_id),
        job_id=str(job_id),
        volume_path=str(vol_path),
        task_name="only_bones",
        fast=True,
        generate_stls=False,
        model_engine="totalsegmentator",
    )

    # Verify layers created in DB
    async with async_session_factory() as db:
        from sqlalchemy import select
        layers_res = await db.execute(
            select(SegmentationLayer).where(SegmentationLayer.series_id == series_id)
        )
        layers = layers_res.scalars().all()
        assert len(layers) > 0
        bone_layer = layers[0]
        assert Path(bone_layer.mask_path).exists()
        mask_img = sitk.ReadImage(bone_layer.mask_path)
        mask_arr = sitk.GetArrayFromImage(mask_img)
        assert np.any(mask_arr > 0)

    # 3. Execute MONAI pipeline for another job
    monai_job_id = uuid.uuid4()
    async with async_session_factory() as db:
        job2 = Job(
            id=monai_job_id,
            case_id=case_id,
            type="AUTO_SEGMENTATION",
            status="PENDING",
            progress=0,
            message="Queued",
        )
        db.add(job2)
        await db.commit()

    run_totalsegmentator_task(
        case_id=str(case_id),
        series_id=str(series_id),
        job_id=str(monai_job_id),
        volume_path=str(vol_path),
        task_name="monai_wholebody",
        fast=True,
        generate_stls=False,
        model_engine="monai",
    )

    async with async_session_factory() as db:
        layers_res = await db.execute(
            select(SegmentationLayer).where(SegmentationLayer.series_id == series_id)
        )
        all_layers = layers_res.scalars().all()
        assert len(all_layers) >= 2

        # 4. Verify that add_prompt works directly on autoseg-created layer without prior manual session init
        from app.routers.segmentation import add_prompt, PromptRequest
        autoseg_layer = all_layers[0]
        prompt_req = PromptRequest(
            prompt_type="point",
            axis="axial",
            slice_index=5,
            positive=True,
            point=[0.5, 0.5],
        )
        prompt_res = await add_prompt(
            case_id=case_id,
            layer_id=autoseg_layer.id,
            body=prompt_req,
            db=db,
        )
        assert prompt_res["status"] == "success"
        assert prompt_res["voxel_count"] > 0
