"""
FastAPI Router for Cryptographic License Key Management & Machine ID binding.
"""

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, Depends

from app.services.license_service import license_service, get_machine_hwid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/license", tags=["License"])


class LicenseStatusResponse(BaseModel):
    is_active: bool
    is_valid: bool
    status: str
    tier: str
    customer: str
    organization: str
    hwid: str
    licensed_hwid: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    days_remaining: Optional[int] = None
    features: List[str] = []
    is_trial: bool = False


class ActivateLicenseRequest(BaseModel):
    license_key: str


class StartTrialRequest(BaseModel):
    customer_name: Optional[str] = "Clinical Evaluation User"


@router.get("/status", response_model=LicenseStatusResponse)
async def get_license_status():
    """Retrieve current license validation status and machine hardware fingerprint."""
    status = license_service.get_license_status()
    return LicenseStatusResponse(**status)


@router.get("/hwid")
async def get_hardware_id():
    """Get the current machine's Hardware Fingerprint (HWID) to provide to the vendor."""
    return {"hwid": get_machine_hwid()}


@router.post("/activate", response_model=LicenseStatusResponse)
async def activate_license_key(body: ActivateLicenseRequest):
    """
    Activate a digitally-signed license key.
    Verifies Ed25519 signature and hardware fingerprint offline.
    """
    try:
        updated_status = license_service.activate_license(body.license_key)
        return LicenseStatusResponse(**updated_status)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.exception(f"License activation error: {e}")
        raise HTTPException(status_code=500, detail=f"Activation failed: {str(e)}")


@router.post("/trial", response_model=LicenseStatusResponse)
async def start_evaluation_trial(body: StartTrialRequest = StartTrialRequest()):
    """Start a 14-day evaluation trial locked to this machine."""
    try:
        trial_status = license_service.start_trial(body.customer_name or "Clinical Evaluation User")
        return LicenseStatusResponse(**trial_status)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start evaluation trial: {str(e)}")
