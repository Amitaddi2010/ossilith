"""Regression unit test for nnInteractive segmentation and undo/redo state preservation."""

import pytest
import numpy as np
import SimpleITK as sitk
from pathlib import Path
import tempfile

from app.services.nninteractive_proxy import NNInteractiveManager


@pytest.mark.asyncio
async def test_segmentation_edit_and_undo_regression():
    """Verify that editing a segmentation mask and calling undo restores the exact pre-edit state."""
    manager = NNInteractiveManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a synthetic 3D CT volume (10 x 30 x 30)
        vol_path = Path(tmpdir) / "test_volume.nrrd"
        vol_arr = np.full((10, 30, 30), -1000, dtype=np.int16)
        # Put a high-density bone sphere in the center (HU = 600)
        vol_arr[3:7, 10:20, 10:20] = 600

        img = sitk.GetImageFromArray(vol_arr)
        img.SetSpacing((1.0, 1.0, 1.5))
        sitk.WriteImage(img, str(vol_path))

        layer_id = "test-layer-001"

        # 1. Initialize session
        session = await manager.init_session(layer_id, str(vol_path))
        assert session["shape"] == (10, 30, 30)
        assert session["is_simulated"] is True

        initial_mask = manager.get_mask(layer_id)
        assert initial_mask is not None
        assert np.all(initial_mask == 0)
        pre_edit_snapshot = initial_mask.copy()

        # 2. Add an edit prompt (point prompt at bone center)
        result = await manager.add_prompt(
            layer_id=layer_id,
            prompt_type="point",
            axis="axial",
            slice_index=5,
            positive=True,
            point=[0.5, 0.5],
        )

        assert result["status"] == "success"
        post_edit_mask = manager.get_mask(layer_id)
        assert post_edit_mask is not None
        edited_voxel_count = np.sum(post_edit_mask > 0)
        assert edited_voxel_count > 0, "Prompt must add segmented voxels"

        # 3. Call undo
        undo_res = await manager.undo(layer_id)
        assert undo_res["status"] == "undone"

        undone_mask = manager.get_mask(layer_id)
        assert undone_mask is not None
        # Assert the restored mask exactly matches pre-edit state byte-for-byte
        assert np.array_equal(undone_mask, pre_edit_snapshot), "Undone mask must match pre-edit state exactly"
        assert np.sum(undone_mask > 0) == 0

        # 4. Call redo
        redo_res = await manager.redo(layer_id)
        assert redo_res["status"] == "redone"
        redone_mask = manager.get_mask(layer_id)
        assert redone_mask is not None
        assert np.array_equal(redone_mask, post_edit_mask), "Redone mask must match edited state exactly"
        assert np.sum(redone_mask > 0) == edited_voxel_count
