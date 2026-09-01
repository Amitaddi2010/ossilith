"""
Unit tests for Centralized Admin License Management and Key Issuance.
"""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.license_service import LicenseService, get_machine_hwid


@pytest.mark.asyncio
async def test_admin_license_generation_and_activation():
    """Test issuing a license via admin endpoint and activating it."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hwid = get_machine_hwid()

        # 1. Generate a new license
        payload = {
            "customer": "Dr. Sarah Connor",
            "organization": "Cyberdyne Orthopedics",
            "email": "sarah@cyberdyne.org",
            "hwid": hwid,
            "tier": "CLINICAL_PRO",
            "days": 180,
            "notes": "Annual Clinical Contract",
        }
        res = await client.post("/api/admin/licenses/generate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["customer"] == "Dr. Sarah Connor"
        assert data["tier"] == "CLINICAL_PRO"
        assert data["status"] == "active"
        license_key = data["license_key"]
        license_id = data["license_id"]

        # 2. Verify it shows in registry
        res_list = await client.get("/api/admin/licenses")
        assert res_list.status_code == 200
        licenses = res_list.json()
        assert any(l["license_id"] == license_id for l in licenses)

        # 3. Test stats endpoint
        res_stats = await client.get("/api/admin/licenses/stats")
        assert res_stats.status_code == 200
        stats = res_stats.json()
        assert stats["total_issued"] >= 1
        assert stats["active_count"] >= 1

        # 4. Activate key on client service
        svc = LicenseService()
        verified_payload = svc.verify_license_key(license_key)
        assert verified_payload["customer"] == "Dr. Sarah Connor"
        assert verified_payload["hwid"] == hwid


@pytest.mark.asyncio
async def test_admin_license_revocation():
    """Test revoking a license in the administrative registry."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Generate license
        res = await client.post(
            "/api/admin/licenses/generate",
            json={
                "customer": "Revoke Test User",
                "organization": "Test Clinic",
                "email": "revoke@test.org",
                "hwid": "*",
                "tier": "STARTER",
                "days": 30,
            },
        )
        assert res.status_code == 200
        license_id = res.json()["license_id"]

        # Revoke
        res_revoke = await client.post(
            "/api/admin/licenses/revoke",
            json={"license_id": license_id, "reason": "Refund requested"},
        )
        assert res_revoke.status_code == 200

        # Check status in list
        res_list = await client.get("/api/admin/licenses")
        licenses = res_list.json()
        revoked_rec = next((l for l in licenses if l["license_id"] == license_id), None)
        assert revoked_rec is not None
        assert revoked_rec["is_revoked"] is True
        assert revoked_rec["status"] == "revoked"
