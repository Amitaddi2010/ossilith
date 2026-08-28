#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Ossilith — GPU Deployment Setup & Environment Initializer
# Checks prerequisites (Docker, NVIDIA GPU, Container Toolkit),
# generates secure SECRET_KEY, and sets up .env configuration.
# ─────────────────────────────────────────────────────────────

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║             OSSILITH SURGICAL PLANNING PLATFORM               ║"
echo "║          GPU Docker Deployment & Setup Initializer            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Check Docker Installation ─────────────────────────────
echo -e "${BLUE}[1/5] Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR] Docker is not installed on this system.${NC}"
    echo -e "Please install Docker (v24.0+) from https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}[ERROR] Docker daemon is not running or current user has no permissions.${NC}"
    echo -e "Try starting the Docker service: ${BOLD}sudo systemctl start docker${NC}"
    echo -e "Or add your user to the docker group: ${BOLD}sudo usermod -aG docker \$USER${NC}"
    exit 1
fi

DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
echo -e "${GREEN}✓ Docker is running (v${DOCKER_VERSION})${NC}"

# Check Docker Compose v2
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    COMPOSE_VERSION=$(docker compose version | awk '{print $4}')
    echo -e "${GREEN}✓ Docker Compose v2 is available (${COMPOSE_VERSION})${NC}"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    echo -e "${GREEN}✓ docker-compose legacy is available${NC}"
else
    echo -e "${RED}[ERROR] Docker Compose plugin is not installed.${NC}"
    echo -e "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# ── 2. Check NVIDIA GPU & Driver ─────────────────────────────
echo ""
echo -e "${BLUE}[2/5] Checking NVIDIA GPU and driver...${NC}"
if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${YELLOW}[WARNING] nvidia-smi not found. NVIDIA driver may not be installed.${NC}"
    echo -e "GPU acceleration for nnInteractive requires an NVIDIA driver (>= 525.60.13)."
else
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
    DRIVER_VER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n 1)
    CUDA_VER=$(nvidia-smi | grep -i "CUDA Version" | awk '{print $9}')
    echo -e "${GREEN}✓ NVIDIA GPU Detected: ${BOLD}${GPU_NAME}${NC}"
    echo -e "${GREEN}✓ Driver Version: ${DRIVER_VER} | CUDA Version: ${CUDA_VER}${NC}"
fi

# ── 3. Check NVIDIA Container Toolkit ─────────────────────────
echo ""
echo -e "${BLUE}[3/5] Checking NVIDIA Container Toolkit (Docker GPU Passthrough)...${NC}"
GPU_PASSTHROUGH_OK=false

# Test if Docker can access the GPU
if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓ NVIDIA Container Toolkit is operational (GPU passthrough confirmed)${NC}"
    GPU_PASSTHROUGH_OK=true
elif command -v nvidia-ctk &> /dev/null; then
    echo -e "${YELLOW}[WARN] nvidia-ctk found, but test container run failed.${NC}"
    echo -e "Configuring Docker runtime for NVIDIA..."
    sudo nvidia-ctk runtime configure --runtime=docker || true
    sudo systemctl restart docker || true
    if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✓ NVIDIA Container Toolkit configured successfully${NC}"
        GPU_PASSTHROUGH_OK=true
    fi
fi

if [ "$GPU_PASSTHROUGH_OK" = false ]; then
    echo -e "${RED}[WARNING] NVIDIA Container Toolkit is not configured for Docker.${NC}"
    echo -e "To enable local GPU inference for nnInteractive, run:"
    echo -e "${BOLD}  # Ubuntu/Debian installation commands:${NC}"
    echo -e "  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"
    echo -e "  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\"
    echo -e "    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\"
    echo -e "    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list"
    echo -e "  sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit"
    echo -e "  sudo nvidia-ctk runtime configure --runtime=docker"
    echo -e "  sudo systemctl restart docker"
    echo ""
    read -p "Continue setup anyway? (y/N): " CONTINUE_SETUP
    if [[ ! "$CONTINUE_SETUP" =~ ^[Yy]$ ]]; then
        echo "Exiting. Please install NVIDIA Container Toolkit and rerun setup.sh."
        exit 1
    fi
fi

# ── 4. Generate SECRET_KEY and Configure .env ────────────────
echo ""
echo -e "${BLUE}[4/5] Generating cryptographic SECRET_KEY and configuring environment...${NC}"

# Generate 64-char hex key (256 bits)
if command -v openssl &> /dev/null; then
    GENERATED_SECRET=$(openssl rand -hex 32)
elif command -v python3 &> /dev/null; then
    GENERATED_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
else
    GENERATED_SECRET=$(head -c 32 /dev/urandom | xxd -p | tr -d '\n')
fi

# Create .env if it does not exist
if [ ! -f .env ]; then
    echo -e "Creating fresh ${BOLD}.env${NC} configuration..."
    cat > .env <<EOF
# ─────────────────────────────────────────────────────────────
# Ossilith Deployment Environment Variables
# Generated automatically by setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ─────────────────────────────────────────────────────────────

# ── Application Security ─────────────────────────────────────
SECRET_KEY=${GENERATED_SECRET}

# ── Database (Async SQLite inside Docker volume) ─────────────
DATABASE_URL=sqlite+aiosqlite:////data/ossilith.db
DATA_DIR=/data/cases

# ── Redis Task Broker ────────────────────────────────────────
REDIS_URL=redis://redis:6379/0
REDIS_PORT=6379

# ── nnInteractive Local GPU Inference ────────────────────────
NNINTERACTIVE_MODE=remote
NNINTERACTIVE_URL=http://nninteractive:1527
NNINTERACTIVE_API_KEY=
NNINTERACTIVE_PORT=1527
NN_MAX_SESSIONS=4
CUDA_VISIBLE_DEVICES=0

# ── Exposed Ports ────────────────────────────────────────────
FRONTEND_PORT=3000
BACKEND_PORT=8000

# ── Worker Concurrency ───────────────────────────────────────
CELERY_CONCURRENCY=2
EOF
    echo -e "${GREEN}✓ Generated .env with secure SECRET_KEY${NC}"
else
    echo -e "${YELLOW}.env file already exists.${NC}"
    # Check if SECRET_KEY is default or empty
    if grep -q "change-me-in-production" .env || grep -q "^SECRET_KEY=$" .env; then
        echo -e "Updating default SECRET_KEY in existing .env with a secure random key..."
        # Portable in-place replacement
        sed -i.bak "s/^SECRET_KEY=.*/SECRET_KEY=${GENERATED_SECRET}/" .env && rm -f .env.bak
        echo -e "${GREEN}✓ SECRET_KEY updated in .env${NC}"
    else
        echo -e "${GREEN}✓ Existing SECRET_KEY preserved${NC}"
    fi
fi

# ── 5. Pull Docker Images ────────────────────────────────────
echo ""
echo -e "${BLUE}[5/5] Docker images from GitHub Container Registry (GHCR)...${NC}"
read -p "Pull latest pre-built container images now? (Y/n): " PULL_IMAGES
if [[ ! "$PULL_IMAGES" =~ ^[Nn]$ ]]; then
    echo -e "${CYAN}Pulling images via ${COMPOSE_CMD}...${NC}"
    $COMPOSE_CMD pull
    echo -e "${GREEN}✓ All images downloaded and ready${NC}"
fi

# ── Summary & Run Instructions ───────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}             OSSILITH SETUP COMPLETED SUCCESSFULLY!            ${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "To start the Ossilith stack in the background:"
echo -e "  ${CYAN}${BOLD}${COMPOSE_CMD} up -d${NC}"
echo ""
echo -e "To monitor logs in real time:"
echo -e "  ${CYAN}${BOLD}${COMPOSE_CMD} logs -f${NC}"
echo ""
echo -e "To stop the stack:"
echo -e "  ${CYAN}${BOLD}${COMPOSE_CMD} down${NC}"
echo ""
echo -e "Once started, access the application in your browser:"
echo -e "  • Web Interface:    ${BOLD}http://localhost:3000${NC}"
echo -e "  • Backend API Docs: ${BOLD}http://localhost:8000/docs${NC}"
echo -e "  • nnInteractive:    ${BOLD}http://localhost:1527/docs${NC}"
echo ""
