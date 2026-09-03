import asyncio
from app.database import async_session_factory
from app.models import Case, Series, SegmentationLayer
from sqlalchemy import select
from pathlib import Path
import SimpleITK as sitk
import numpy as np

async def inspect():
    async with async_session_factory() as db:
        c_res = await db.execute(select(Case))
        cases = c_res.scalars().all()
        for c in cases:
            print(f'Case: {c.id} ({c.name})')
            s_res = await db.execute(select(Series).where(Series.case_id == c.id))
            series = s_res.scalars().all()
            for s in series:
                print(f'  Series: {s.id}, volume_path: {s.volume_path}')
                l_res = await db.execute(select(SegmentationLayer).where(SegmentationLayer.series_id == s.id))
                layers = l_res.scalars().all()
                for l in layers:
                    vox = 0
                    min_coords, max_coords = None, None
                    m = nninteractive_manager.get_mask(str(l.id))
                    if m is not None and np.any(m > 0):
                        vox = int(np.sum(m > 0))
                        nz = np.where(m > 0)
                        min_coords = (int(nz[0].min()), int(nz[1].min()), int(nz[2].min()))
                        max_coords = (int(nz[0].max()), int(nz[1].max()), int(nz[2].max()))
                    elif l.mask_path and Path(l.mask_path).exists():
                        img = sitk.ReadImage(l.mask_path)
                        arr = sitk.GetArrayFromImage(img)
                        vox = int(np.sum(arr > 0))
                        if vox > 0:
                            nz = np.where(arr > 0)
                            min_coords = (int(nz[0].min()), int(nz[1].min()), int(nz[2].min()))
                            max_coords = (int(nz[0].max()), int(nz[1].max()), int(nz[2].max()))
                    print(f'    Layer {l.id}: name="{l.name}", color={l.color}, vox={vox}, ZYX_min={min_coords}, ZYX_max={max_coords}')

if __name__ == '__main__':
    asyncio.run(inspect())
