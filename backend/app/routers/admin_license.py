"""
FastAPI Router for Centralized Administrative License & Customer Key Management.
Allows software vendors and system administrators to generate, track, and revoke customer keys.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, Depends

from app.config import settings
from app.services.license_service import license_service, get_machine_hwid
from scripts.generate_license import generate_license_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/licenses", tags=["Admin License Management"])

ADMIN_REGISTRY_FILE = "admin_license_registry.json"


def _get_registry_path() -> Path:
    data_dir = Path(settings.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / ADMIN_REGISTRY_FILE


def _load_registry() -> List[Dict[str, Any]]:
    path = _get_registry_path()
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"Failed to load admin license registry: {e}")
        return []


def _save_registry(registry: List[Dict[str, Any]]) -> None:
    path = _get_registry_path()
    path.write_text(json.dumps(registry, indent=2), encoding="utf-8")


# ── Schemas ────────────────────────────────────────────────

class GenerateLicenseRequest(BaseModel):
    customer: str = Field(..., description="Doctor or Clinical Lead Name")
    organization: str = Field("General Hospital", description="Hospital / Medical Facility")
    email: str = Field("surgeon@hospital.org", description="Licensee Email Address")
    hwid: str = Field("*", description="Target Machine HWID or '*' for universal multi-seat")
    tier: str = Field("CLINICAL_PRO", description="STARTER, CLINICAL_PRO, ENTERPRISE, UNLIMITED")
    days: int = Field(365, description="Validity period in days (0 for lifetime)")
    features: Optional[List[str]] = None
    max_cases: int = Field(9999, description="Maximum allowed patient cases")
    notes: Optional[str] = None


class LicenseRecord(BaseModel):
    license_id: str
    customer: str
    organization: str
    email: str
    hwid: str
    tier: str
    issued_date: str
    expiry_date: Optional[str] = None
    days_valid: int
    features: List[str]
    max_cases: int
    license_key: str
    is_revoked: bool = False
    notes: Optional[str] = None
    status: str


class AdminStatsResponse(BaseModel):
    total_issued: int
    active_count: int
    revoked_count: int
    expiring_soon_count: int
    tier_breakdown: Dict[str, int]


class RevokeRequest(BaseModel):
    license_id: str
    reason: Optional[str] = "Administrative revocation"


# ── Endpoints ──────────────────────────────────────────────

@router.get("", response_model=List[LicenseRecord])
async def list_issued_licenses():
    """List all issued customer licenses from the administrative registry."""
    raw_list = _load_registry()
    now = datetime.now(timezone.utc)
    records = []

    for item in raw_list:
        is_revoked = item.get("is_revoked", False)
        expiry_str = item.get("expiry_date")
        status = "active"

        if is_revoked:
            status = "revoked"
        elif expiry_str:
            try:
                exp = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                if now > exp:
                    status = "expired"
            except Exception:
                pass

        item["status"] = status
        records.append(LicenseRecord(**item))

    # Sort descending by issued date
    records.sort(key=lambda x: x.issued_date, reverse=True)
    return records


@router.post("/generate", response_model=LicenseRecord)
async def generate_new_license(body: GenerateLicenseRequest):
    """
    Generate and cryptographically sign an Ed25519 customer license key.
    Saves the key to the admin registry.
    """
    try:
        raw_key = generate_license_key(
            customer_name=body.customer.strip(),
            organization=body.organization.strip(),
            email=body.email.strip(),
            hwid=body.hwid.strip().upper(),
            tier=body.tier.strip().upper(),
            valid_days=body.days,
            features=body.features,
            max_cases=body.max_cases,
        )

        # Verify key to extract canonical metadata
        payload = license_service.verify_license_key(raw_key)

        record = {
            "license_id": payload.get("license_id"),
            "customer": payload.get("customer"),
            "organization": payload.get("organization"),
            "email": payload.get("email"),
            "hwid": payload.get("hwid"),
            "tier": payload.get("tier"),
            "issued_date": payload.get("issued_date"),
            "expiry_date": payload.get("expiry_date"),
            "days_valid": body.days,
            "features": payload.get("features", []),
            "max_cases": payload.get("max_cases", 9999),
            "license_key": raw_key,
            "is_revoked": False,
            "notes": body.notes,
            "status": "active",
        }

        registry = _load_registry()
        registry.append(record)
        _save_registry(registry)

        logger.info(f"Admin issued {body.tier} license for '{body.customer}' ({body.organization})")
        return LicenseRecord(**record)

    except Exception as e:
        logger.exception(f"Failed to generate admin license: {e}")
        raise HTTPException(status_code=500, detail=f"License generation failed: {str(e)}")


@router.post("/revoke")
async def revoke_license(body: RevokeRequest):
    """Revoke or blacklist an issued license by ID."""
    registry = _load_registry()
    found = False

    for item in registry:
        if item.get("license_id") == body.license_id:
            item["is_revoked"] = True
            item["revoked_at"] = datetime.now(timezone.utc).isoformat()
            item["revocation_reason"] = body.reason
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail="License ID not found in registry")

    _save_registry(registry)
    return {"message": "License successfully revoked", "license_id": body.license_id}


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_license_stats():
    """Get high-level commercial license metrics."""
    registry = _load_registry()
    now = datetime.now(timezone.utc)
    soon_threshold = now + timedelta(days=30)

    total_issued = len(registry)
    active_count = 0
    revoked_count = 0
    expiring_soon_count = 0
    tier_breakdown: Dict[str, int] = {}

    for item in registry:
        tier = item.get("tier", "UNKNOWN").upper()
        tier_breakdown[tier] = tier_breakdown.get(tier, 0) + 1

        if item.get("is_revoked", False):
            revoked_count += 1
            continue

        expiry_str = item.get("expiry_date")
        if expiry_str:
            try:
                exp = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                if exp < now:
                    continue  # expired
                elif exp <= soon_threshold:
                    expiring_soon_count += 1
            except Exception:
                pass

        active_count += 1

    return AdminStatsResponse(
        total_issued=total_issued,
        active_count=active_count,
        revoked_count=revoked_count,
        expiring_soon_count=expiring_soon_count,
        tier_breakdown=tier_breakdown,
    )
