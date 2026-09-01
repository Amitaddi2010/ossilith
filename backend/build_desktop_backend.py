"""
PyInstaller Bundling Script for Ossilith Desktop Backend.
Compiles FastAPI, SimpleITK, trimesh, and AI segmentation models into a standalone binary.
"""

import os
import sys
import subprocess
from pathlib import Path

def build_backend():
    backend_dir = Path(__file__).parent.resolve()
    os.chdir(backend_dir)
    print(f"Building Ossilith Standalone Backend from {backend_dir}...")

    dist_dir = backend_dir / "dist"
    build_dir = backend_dir / "build"

    # PyInstaller arguments
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name=ossilith-backend",
        "--onedir",
        "--noconfirm",
        "--clean",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=aiosqlite",
        "--hidden-import=scipy.special.cython_special",
        "--hidden-import=skimage.segmentation",
        "--hidden-import=cryptography",
        "--collect-all=SimpleITK",
        "--collect-all=trimesh",
        "--collect-all=pydicom",
        f"--distpath={dist_dir}",
        f"--workpath={build_dir}",
        "app/main.py",
    ]

    print("Running command:", " ".join(cmd))
    subprocess.check_call(cmd)
    print(f"Backend binary successfully compiled to {dist_dir / 'ossilith-backend'}")

if __name__ == "__main__":
    build_backend()
