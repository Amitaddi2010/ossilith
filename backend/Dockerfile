FROM python:3.11-slim AS base

# System deps for VTK, SimpleITK, Pillow, psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    fastapi "uvicorn[standard]" python-multipart httpx sse-starlette \
    "sqlalchemy[asyncio]" asyncpg alembic \
    "celery[redis]" redis \
    pydicom SimpleITK numpy \
    trimesh scipy \
    pydantic-settings python-dotenv blosc2 \
    Pillow psycopg2-binary

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /data/cases

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
