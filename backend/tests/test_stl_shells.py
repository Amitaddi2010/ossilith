"""Unit tests for STL multi-bone shell splitting and debris purging."""

import os
import uuid
import pytest
import trimesh
import numpy as np
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory, engine
from app.models import STLArtifact, Case, Base
from app.routers.stl import split_mesh_shells, purge_debris_shells, SplitShellsRequest, PurgeDebrisRequest


@pytest.mark.asyncio
async def test_split_and_purge_shells(tmp_path: Path):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db_session:
        # 1. Create a synthetic compound mesh with 3 disjoint bodies:
        # Body A: Large sphere (radius 10) -> primary bone (e.g. Femur)
        # Body B: Medium cylinder (radius 4, height 20) -> secondary bone (e.g. Tibia)
        # Body C: Tiny box (size 1) -> stray debris noise
        sphere = trimesh.creation.icosphere(subdivisions=2, radius=10.0)
        cylinder = trimesh.creation.cylinder(radius=4.0, height=20.0)
        cylinder.apply_translation([30, 0, 0])
        box = trimesh.creation.box(extents=[1, 1, 1])
        box.apply_translation([0, 40, 0])

        compound_mesh = trimesh.util.concatenate([sphere, cylinder, box])
        assert len(compound_mesh.split(only_watertight=False)) == 3

        case_id = uuid.uuid4()
        series_id = uuid.uuid4()
        layer_id = uuid.uuid4()
        stl_id = uuid.uuid4()
        stl_dir = tmp_path / str(case_id) / "stls"
        stl_dir.mkdir(parents=True, exist_ok=True)
        stl_path = stl_dir / "compound_skeleton.stl"
        compound_mesh.export(str(stl_path), file_type="stl")

        from app.models import Series, SegmentationLayer, LayerStatus

        case = Case(id=case_id, name="Test Orthopedic Multi-Bone Case")
        db_session.add(case)
        series = Series(
            id=series_id,
            case_id=case_id,
            series_instance_uid="1.2.3",
            modality="CT",
            slice_count=100,
            pixel_spacing_x=0.5,
            pixel_spacing_y=0.5,
            slice_thickness=1.0,
            dicom_dir=str(tmp_path),
        )
        db_session.add(series)


        layer = SegmentationLayer(id=layer_id, series_id=series_id, name="Complete Lower Limb", status=LayerStatus.ACTIVE)
        db_session.add(layer)
        await db_session.commit()

        artifact = STLArtifact(
            id=stl_id,
            layer_id=layer_id,
            file_name="compound_skeleton.stl",
            file_path=str(stl_path),
            file_size_bytes=os.path.getsize(str(stl_path)),
            vertex_count=len(compound_mesh.vertices),
            face_count=len(compound_mesh.faces),
        )
        db_session.add(artifact)
        await db_session.commit()


        # 2. Test Debris Purging (should purge the tiny box, keep sphere + cylinder)
        purge_res = await purge_debris_shells(
            case_id=case_id,
            stl_id=stl_id,
            body=PurgeDebrisRequest(min_faces=50),
            db=db_session,
        )
        assert purge_res["status"] == "debris_purged"
        assert purge_res["purged_count"] == 1
        assert purge_res["remaining_shells"] == 2

        # 3. Test Multi-Bone Split (should split into 2 distinct STL parts)
        split_res = await split_mesh_shells(
            case_id=case_id,
            stl_id=stl_id,
            body=SplitShellsRequest(min_faces=30),
            db=db_session,
        )
        assert split_res["status"] == "split_completed"
        assert split_res["split_count"] == 2
        assert len(split_res["parts"]) == 2
        assert "Bone Part 1" in split_res["parts"][0]["name"]
        assert "Bone Part 2" in split_res["parts"][1]["name"]

        # Verify files created
        for part in split_res["parts"]:
            part_file = stl_dir / part["filename"]
            assert part_file.exists()
            loaded = trimesh.load_mesh(str(part_file))
            assert len(loaded.faces) > 0

