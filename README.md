<div align="center">

# 🦴 OSSILITH
### Clinical-Grade 3D Orthopedic & Surgical Planning Platform
**AI-Powered DICOM Multi-Planar Reconstruction · Neural Interactive Segmentation · Watertight Mesh Topology · Surgical CAD Studio · Slicer Handoff**

<br />

[![Next.js 14](https://img.shields.io/badge/Frontend-Next.js_14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Three.js](https://img.shields.io/badge/3D_Engine-Three.js_/_WebGL-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![PyTorch](https://img.shields.io/badge/AI_Engine-PyTorch_/_CUDA-EE4C2C?style=for-the-badge&logo=pytorch)](https://pytorch.org/)
[![Docker](https://img.shields.io/badge/Deploy-Docker_Compose_v2-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Proprietary_/_Clinical-red?style=for-the-badge)]()

<br />

[Features](#-key-features) • [Architecture](#-architecture) • [5-Stage Clinical Pipeline](#-5-stage-clinical-pipeline) • [Quick Start](#-quick-start) • [GPU Docker Deployment](#-gpu-docker-deployment) • [Documentation](#-api--development)

</div>

---

## 🌟 Overview

**Ossilith** is an end-to-end medical imaging and orthopedic CAD planning platform designed for surgeons, biomedical engineers, and 3D printing laboratories. It converts volumetric DICOM CT/MRI scans into watertight, surgically planned 3D patient-specific anatomies and ready-to-print surgical guides with zero cloud telemetry for complete hospital LAN isolation.

```
                                      [ Patient DICOM Series ]
                                                 │
                                                 ▼
                       ┌──────────────────────────────────────────────────┐
                       │  Stage 1: Ingestion & Geometric Validation       │
                       └─────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
                       ┌──────────────────────────────────────────────────┐
                       │  Stage 2: High-Speed 2D MPR (Axial/Coronal/Sag)  │
                       └─────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
                       ┌──────────────────────────────────────────────────┐
                       │  Stage 3: nnInteractive Neural Click-Segmenter   │
                       └─────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
                       ┌──────────────────────────────────────────────────┐
                       │  Stage 4: Marching Cubes & Netfabb ASTM F3001 QC │
                       └─────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
                       ┌──────────────────────────────────────────────────┐
                       │  Stage 5: 3D CAD Studio & 1-Click Slicer Handoff │
                       └──────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 🎛️ 1. Office/CAD-Style Ribbon Navigation
- Modern, docked ribbon bar organizing clinical tools into logical groups: **Home / View**, **Transform**, **Edit & Mesh**, and **Planning Modules**.
- Full keyboard shortcut parity (`G` Translate, `R` Rotate, `S` Uniform Scale, `Alt+S` Non-Uniform Scale, `Alt+R` Reset, `C` Plane Cut, `X` Split Mesh, `N` Connector, `Ctrl+Z` Undo).

### ✂️ 2. Zero-Drift Spatial Osteotomy & Mesh Splitting
- **Plane Cut**: Interactive CSG plane osteotomy with real-time normal indicator and cap triangulation.
- **Topological Component Split**: BFS graph traversal that partitions discrete bone fragments while retaining **100% exact spatial world coordinates** (0.00mm registration drift).

### 📍 3. Interactive Two-Point Multi-Shape Connectors
- Place parametric bridging geometry directly between anatomical landmarks via 2-point 3D surface picking.
- **Shapes**: Cylinder (struts/pins), Cuboid (fixation plates), Torus (rings), Sphere (joints), Cone.
- **Boolean Engines**: Boolean **Join (Union)**, **Subtract (Hole Creation)**, and **Intersection**.

### 🛡️ 4. Cortical Breach Detector & Netfabb Print QC
- **Real-Time Cortical Breach Detection**: Continuous raycasted penetration analysis flagging hardware intrusion or cortical wall breach with 3D warning markers and depth readouts.
- **Netfabb ASTM F3001 Audit**: Automated manifold validation, crack welding, normal alignment, and 1-click auto-healing.

### 🖨️ 5. 1-Click "Send to 3D Print" Slicer Handoff
- Direct export and protocol URI handoffs with optimized orthopedic slicing presets:
  - **Bambu Studio** (`bambustudio://` / `.3mf`)
  - **OrcaSlicer** (`orcaslicer://` / `.3mf`)
  - **FlashPrint** (Flashforge `.stl`)
  - **Creality Print** (`crealityprint://` / `.stl`)
  - **Ultimaker Cura** (`cura://` / `.stl` / `.3mf`)

---

## 🔬 5-Stage Clinical Pipeline

| Stage | Module | Capabilities |
| :---: | :--- | :--- |
| **1** | **DICOM Ingestion** | Full folder batch ingestion, patient anonymization, slice spacing validation, Hounsfield windowing presets (Bone, Soft Tissue, Lung). |
| **2** | **2D MPR Slicing** | Synchronized Axial, Coronal, and Sagittal cross-hair viewports with zoom, pan, window level adjustment, and calibrated 2D distance measurements. |
| **3** | **nnInteractive AI** | 1-click positive/negative foreground/background prompt click segmentation powered by PyTorch & CUDA nnU-Net architectures. |
| **4** | **Surface Meshing** | High-fidelity Marching Cubes isosurface extraction, Laplacian smoothing, polygon decimation (50K/100K caps), and ASTM F3001 printability diagnostics. |
| **5** | **3D Surgical CAD** | Unified Transform gizmo (snapping 0.5–10mm), titanium hardware library (plates, screws, cages), osteotomy cuts, 2-point connectors, and slicer export. |

---

## 💻 Tech Stack

### Frontend
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, React 18, TypeScript)
- **3D Graphics & CAD**: [Three.js](https://threejs.org/) via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) & [@react-three/drei](https://github.com/pmndrs/drei)
- **CSG & Geometry**: [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg), WebGL Shaders, Spatial Adjacency BFS
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) with full Undo/Redo historical stack
- **Styling**: Vanilla CSS Design Tokens (Keylime & Forest Clinical Theme) + Lucide Icons

### Backend & Infrastructure
- **API Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11, AsyncIO, Pydantic v2)
- **Database**: Async [SQLAlchemy](https://www.sqlalchemy.org/) + [aiosqlite](https://github.com/omnilib/aiosqlite) (SQLite) / asyncpg (PostgreSQL)
- **Task Queue**: [Celery](https://docs.celeryq.dev/) + [Redis 7](https://redis.io/)
- **Medical Imaging**: [SimpleITK](https://simpleitk.org/), [pydicom](https://pydicom.github.io/), [trimesh](https://trimesh.org/), [scipy](https://scipy.org/), [numpy](https://numpy.org/)
- **AI / Deep Learning**: [PyTorch](https://pytorch.org/), [nnInteractive](https://github.com/MIC-DKFZ/nnInteractive), CUDA 12.x

---

## ⚡ Quick Start

### Local Development Setup

#### 1. Clone the Repository
```bash
git clone https://github.com/Amitaddi2010/ossilith.git
cd ossilith
```

#### 2. Start the Backend API & Redis
```bash
# Setup Python virtual environment
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .

# Start Redis (via Docker or local service)
docker run -d -p 6379:6379 redis:7-alpine

# Launch FastAPI Backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. Start the Next.js Frontend
```bash
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 GPU Docker Deployment (Production)

For technical users with NVIDIA GPUs, Ossilith is fully containerized with automated GPU verification and container passthrough.

### Prerequisites
- **NVIDIA Driver**: Version `>= 525.60.13`
- **Docker Engine**: Version `>= 24.0.0`
- **NVIDIA Container Toolkit**: [Installation Guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

### 1-Click Setup & Launch
```bash
# 1. Run automated environment checker & SECRET_KEY generator
chmod +x setup.sh
./setup.sh

# 2. Start all services in the background
docker compose up -d
```

### 3. Verify Container Statuses
```bash
docker compose ps
docker compose logs -f
```

---

## 🏥 Air-Gapped Hospital LAN Isolation

Ossilith is engineered for strict **HIPAA & GDPR clinical compliance**:
- **100% Local Inference**: All DICOM image processing, neural segmentation, and surgical planning run entirely on the host GPU/CPU.
- **Zero Telemetry**: No external API calls, cloud analytics, or external data transmission.
- **Network Isolation**: Operates seamlessly in air-gapped hospital subnets and isolated surgical theater workstations.

---

## 📜 License & Acknowledgments

- **License**: Proprietary / Clinical Evaluation.
- **AI Architecture**: Built in collaboration with state-of-the-art interactive medical segmentation models (nnU-Net / nnInteractive by MIC-DKFZ).

---

<div align="center">
<b>Ossilith Surgical Systems</b> · Empowering Precision Orthopedic Care
</div>
