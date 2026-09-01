"""Unit tests for 3D Split Mask feature (Islands and Plane Cut)."""

import pytest
import numpy as np
import SimpleITK as sitk
from pathlib import Path
import tempfile

from app.services.nninteractive_proxy import NNInteractiveManager


@pytest.mark.asyncio
async def test_split_mask_islands_and_plane():
    manager = NNInteractiveManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a synthetic 3D volume (20 x 40 x 40)
        vol_path = Path(tmpdir) / "test_split_volume.nrrd"
        vol_arr = np.full((20, 40, 40), -1000, dtype=np.int16)
        img = sitk.GetImageFromArray(vol_arr)
        img.SetSpacing((1.0, 1.0, 1.0))
        sitk.WriteImage(img, str(vol_path))

        layer_id = "test-split-layer"
        await manager.init_session(layer_id, str(vol_path))

        mask = manager.get_mask(layer_id)
        assert mask is not None

        # Create two distinct disconnected bone islands in the mask
        # Island 1 (size ~ 4*6*6 = 144 voxels)
        mask[2:6, 5:11, 5:11] = 1
        # Island 2 (size ~ 6*8*8 = 384 voxels)
        mask[10:16, 20:28, 20:28] = 1

        # 1. Test Split Mask in Islands mode
        split_res = await manager.split_mask(
            layer_id=layer_id,
            mode="islands",
            min_size_voxels=50,
            max_components=10,
        )

        assert split_res["status"] == "success"
        assert split_res["mode"] == "islands"
        assert split_res["components_count"] == 2
        assert len(split_res["components"]) == 2

        # First component should be the larger one (Island 2)
        comp1 = split_res["components"][0]
        comp2 = split_res["components"][1]
        assert comp1["voxel_count"] == 384
        assert comp2["voxel_count"] == 144
        assert comp1["volume_cm3"] > 0
        assert comp2["volume_cm3"] > 0

        # Verify component masks are disjoint and sum to total
        total_split_voxels = np.sum(comp1["mask_arr"] > 0) + np.sum(comp2["mask_arr"] > 0)
        assert total_split_voxels == np.sum(mask > 0)

        # 2. Test Split Mask in Plane Cut mode
        plane_res = await manager.split_mask(
            layer_id=layer_id,
            mode="plane",
            axis="axial",
            slice_index=8,
        )

        assert plane_res["status"] == "success"
        assert plane_res["mode"] == "plane"
        assert plane_res["components_count"] == 2
        p_a = plane_res["components"][0]
        p_b = plane_res["components"][1]
        assert p_a["voxel_count"] == 144  # Island 1 is at Z 2..5 (<= 8)
        assert p_b["voxel_count"] == 384  # Island 2 is at Z 10..15 (> 8)
