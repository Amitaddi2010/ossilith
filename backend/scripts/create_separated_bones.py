"""Create two distinct bone masks from the CT volume using connected components."""
import asyncio
import uuid
from pathlib import Path

import numpy as np
import SimpleITK as sitk
from scipy.ndimage import binary_opening, label

from app.database import async_session_factory
from app.models import SegmentationLayer, Series, LayerStatus
from sqlalchemy import select, delete


async def create_separated_bones():
    async with async_session_factory() as db:
        case_id = uuid.UUID("b599762d-12a5-4fbc-9399-41f92f6ec4d8")
        s_res = await db.execute(select(Series).where(Series.case_id == case_id))
        series = s_res.scalars().first()
        if not series:
            print("Series not found")
            return

        img = sitk.ReadImage(series.volume_path)
        arr = sitk.GetArrayFromImage(img)  # [Z, Y, X]
        spacing = img.GetSpacing()  # (sx, sy, sz) in (X, Y, Z)
        print(f"Volume shape: {arr.shape}, spacing: {spacing}")

        # Bone threshold and morphological clean-up
        bone_mask = (arr > 300).astype(np.uint8)
        bone_mask = binary_opening(bone_mask, structure=np.ones((2, 2, 2))).astype(
            np.uint8
        )
        labeled, num_features = label(bone_mask)

        # Connected components sorted by size
        sizes = [
            (i, int(np.sum(labeled == i))) for i in range(1, num_features + 1)
        ]
        sizes.sort(key=lambda x: x[1], reverse=True)
        print(f"Top 5 component sizes: {sizes[:5]}")

        if len(sizes) < 2:
            print("Need at least 2 bone components")
            return

        # Structure 1 & 2: two largest connected components
        m1 = (labeled == sizes[0][0]).astype(np.uint8)
        m2 = (labeled == sizes[1][0]).astype(np.uint8)

        for idx, m in enumerate([m1, m2], 1):
            nz = np.where(m > 0)
            cz, cy, cx = float(nz[0].mean()), float(nz[1].mean()), float(nz[2].mean())
            print(
                f"Component {idx}: voxels={int(np.sum(m > 0))}, "
                f"center_ZYX=({cz:.1f}, {cy:.1f}, {cx:.1f}), "
                f"center_mm_XYZ=({cx*spacing[0]:.1f}, {cy*spacing[1]:.1f}, {cz*spacing[2]:.1f})"
            )

        # Clean old layers
        await db.execute(
            delete(SegmentationLayer).where(SegmentationLayer.series_id == series.id)
        )
        await db.commit()

        case_dir = Path("data") / "cases" / str(case_id)
        case_dir.mkdir(parents=True, exist_ok=True)

        for idx, (mask_arr, name, color) in enumerate(
            [
                (m1, "Bone Structure 1", "#00FFAA"),
                (m2, "Bone Structure 2", "#38bdf8"),
            ],
            1,
        ):
            lid = uuid.uuid4()
            mask_path = case_dir / f"mask_{lid}.nrrd"
            mask_img = sitk.GetImageFromArray(mask_arr)
            mask_img.CopyInformation(img)
            sitk.WriteImage(mask_img, str(mask_path), useCompression=True)

            layer = SegmentationLayer(
                id=lid,
                series_id=series.id,
                name=name,
                color=color,
                status=LayerStatus.ACTIVE,
                mask_path=str(mask_path),
            )
            db.add(layer)
            print(f"Saved Layer {idx}: {lid} -> {mask_path}")

        await db.commit()
        print("Done! Two distinct bone layers created.")


if __name__ == "__main__":
    asyncio.run(create_separated_bones())
