"""
Unit tests for Cryptographic Licensing and Hardware ID Binding.
"""

import base64
import json
import pytest
from datetime import datetime, timezone, timedelta

from app.services.license_service import LicenseService, get_machine_hwid
from scripts.generate_license import generate_license_key, get_private_key


def test_hwid_generation():
    """Verify hardware ID formatting and stability."""
    hwid = get_machine_hwid()
    assert hwid.startswith("OSSI-")
    parts = hwid.split("-")
    assert len(parts) == 5
    # Second call should be deterministic on the same system
    assert get_machine_hwid() == hwid


def test_valid_license_generation_and_verification():
    """Test generating a valid license and verifying its cryptographic signature."""
    svc = LicenseService()
    current_hwid = get_machine_hwid()

    key = generate_license_key(
        customer_name="Dr. John Doe",
        organization="Apex Orthopedics",
        email="john@apex.com",
        hwid=current_hwid,
        tier="CLINICAL_PRO",
        valid_days=30,
    )

    payload = svc.verify_license_key(key)
    assert payload["customer"] == "Dr. John Doe"
    assert payload["organization"] == "Apex Orthopedics"
    assert payload["tier"] == "CLINICAL_PRO"
    assert payload["hwid"] == current_hwid
    assert "autoseg_totalseg" in payload["features"]


def test_wildcard_license_verification():
    """Test that a wildcard '*' HWID license activates on any machine."""
    svc = LicenseService()

    key = generate_license_key(
        customer_name="Hospital Site License",
        hwid="*",
        tier="ENTERPRISE",
        valid_days=365,
    )

    payload = svc.verify_license_key(key)
    assert payload["tier"] == "ENTERPRISE"
    assert payload["hwid"] == "*"


def test_hwid_mismatch_rejection():
    """Verify that a license locked to another machine is rejected."""
    svc = LicenseService()
    foreign_hwid = "OSSI-AAAA-BBBB-CCCC-DDDD"

    key = generate_license_key(
        customer_name="Locked User",
        hwid=foreign_hwid,
        tier="CLINICAL_PRO",
        valid_days=30,
    )

    with pytest.raises(ValueError, match="locked to a different machine"):
        svc.verify_license_key(key)


def test_signature_tampering_rejection():
    """Verify that modifying the payload breaks the cryptographic signature."""
    svc = LicenseService()
    current_hwid = get_machine_hwid()

    key = generate_license_key(
        customer_name="Dr. Alice",
        hwid=current_hwid,
        tier="TRIAL",
        valid_days=7,
    )

    payload_b64, sig_b64 = key.split(".")
    # Tamper with the payload (e.g. modify tier to UNLIMITED)
    pad = len(payload_b64) % 4
    padded_b64 = payload_b64 + ("=" * (4 - pad) if pad else "")
    raw_payload = json.loads(base64.urlsafe_b64decode(padded_b64.encode("ascii")).decode("utf-8"))
    raw_payload["tier"] = "UNLIMITED"
    tampered_bytes = json.dumps(raw_payload, sort_keys=True).encode("utf-8")
    tampered_b64 = base64.urlsafe_b64encode(tampered_bytes).decode("ascii").rstrip("=")


    tampered_key = f"{tampered_b64}.{sig_b64}"

    with pytest.raises(ValueError, match="Cryptographic verification failed"):
        svc.verify_license_key(tampered_key)


def test_expired_license_rejection():
    """Verify that an expired license is rejected."""
    svc = LicenseService()
    current_hwid = get_machine_hwid()

    # Generate key with negative validity days (expired in the past)
    key = generate_license_key(
        customer_name="Expired User",
        hwid=current_hwid,
        tier="CLINICAL_PRO",
        valid_days=-10,
    )

    with pytest.raises(ValueError, match="License expired"):
        svc.verify_license_key(key)


def test_trial_provisioning(tmp_path):
    """Verify 14-day local trial activation."""
    svc = LicenseService()
    svc.license_dir = tmp_path
    svc.license_path = tmp_path / "ossilith.license"

    status = svc.start_trial(customer_name="Trial Tester")
    assert status["is_valid"] is True
    assert status["is_trial"] is True
    assert status["tier"] == "TRIAL"
    assert status["days_remaining"] >= 13
