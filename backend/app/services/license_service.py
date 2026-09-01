"""
Ossilith Cryptographic Licensing & Machine-Bound Protection Service.
Uses Ed25519 asymmetric cryptography and SHA-256 Hardware Fingerprinting (HWID).
Offline-capable, air-gapped hospital network compliant.
"""

import base64
import json
import logging
import os
import platform
import subprocess
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature

from app.config import settings

logger = logging.getLogger(__name__)

# Master Public Key embedded into the binary for offline signature verification
# (The private key is held securely by the vendor in scripts/generate_license.py)
EMBEDDED_PUBLIC_KEY_HEX = "375f01e42e3ba4eeb2304e91daced1f591923188bb6bbb3dcffac07bed1e6125"


LICENSE_FILE_NAME = "ossilith.license"


def get_machine_hwid() -> str:
    """
    Generate a stable, unique Hardware ID (HWID) based on Motherboard UUID & CPU Info.
    Works across Windows, Linux, and macOS.
    """
    system = platform.system()
    raw_id = ""

    try:
        if system == "Windows":
            # Query Windows System UUID via powershell / wmic
            try:
                cmd = "powershell -NoProfile -Command \"(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID\""
                out = subprocess.check_output(cmd, shell=True, timeout=2.0).decode().strip()
                if out and len(out) > 8:
                    raw_id += out
            except Exception:
                pass

            if not raw_id:
                try:
                    out = subprocess.check_output("wmic csproduct get uuid", shell=True, timeout=2.0).decode().strip()
                    lines = [l.strip() for l in out.splitlines() if l.strip() and "UUID" not in l]
                    if lines:
                        raw_id += lines[0]
                except Exception:
                    pass

        elif system == "Darwin":  # macOS
            try:
                out = subprocess.check_output(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"], timeout=2.0).decode()
                for line in out.splitlines():
                    if "IOPlatformUUID" in line:
                        raw_id += line.split("=")[-1].replace('"', '').strip()
                        break
            except Exception:
                pass

        elif system == "Linux":
            for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"]:
                p = Path(path)
                if p.exists():
                    raw_id += p.read_text().strip()
                    break
    except Exception as e:
        logger.warning(f"Error reading primary machine ID: {e}")

    # Fallback to network MAC + CPU info if system UUID was inaccessible
    if not raw_id or len(raw_id) < 6:
        mac_int = uuid.getnode()
        raw_id += f"{mac_int}-{platform.processor()}-{platform.machine()}"

    # Generate a formatted 16-character hardware identifier
    hashed = hashlib.sha256(raw_id.encode("utf-8")).hexdigest().upper()
    formatted_hwid = f"OSSI-{hashed[:4]}-{hashed[4:8]}-{hashed[8:12]}-{hashed[12:16]}"
    return formatted_hwid


def _b64_urlsafe_decode(s: str) -> bytes:
    pad = len(s) % 4
    if pad:
        s += "=" * (4 - pad)
    return base64.urlsafe_b64decode(s.encode("ascii"))


class LicenseService:
    def __init__(self):
        self.license_dir = Path(settings.data_dir)
        self.license_path = self.license_dir / LICENSE_FILE_NAME
        self.cached_status: Optional[Dict[str, Any]] = None

    def get_public_key(self) -> ed25519.Ed25519PublicKey:
        """Load the embedded Ed25519 public key."""
        pub_bytes = bytes.fromhex(EMBEDDED_PUBLIC_KEY_HEX)
        return ed25519.Ed25519PublicKey.from_public_bytes(pub_bytes)

    def verify_license_key(self, raw_license_str: str) -> Dict[str, Any]:
        """
        Cryptographically verify a license key string.
        Format: <base64_payload>.<base64_signature>
        """
        raw_license_str = raw_license_str.strip()
        if not raw_license_str or "." not in raw_license_str:
            raise ValueError("Invalid license format. Expected '<payload>.<signature>'")

        parts = raw_license_str.split(".")
        if len(parts) != 2:
            raise ValueError("Malformed license key token structure")

        payload_b64, sig_b64 = parts[0], parts[1]

        try:
            payload_bytes = _b64_urlsafe_decode(payload_b64)
            sig_bytes = _b64_urlsafe_decode(sig_b64)
        except Exception:
            raise ValueError("Corrupted base64 encoding in license key")


        # 1. Cryptographic Signature Verification (Ed25519)
        pub_key = self.get_public_key()
        try:
            pub_key.verify(sig_bytes, payload_bytes)
        except InvalidSignature:
            raise ValueError("Cryptographic verification failed: Tampered or invalid digital signature")

        # 2. Parse payload JSON
        try:
            payload = json.loads(payload_bytes.decode("utf-8"))
        except Exception:
            raise ValueError("Failed to parse license payload metadata")

        # 3. Verify Hardware ID lock (if not wildcard '*')
        target_hwid = payload.get("hwid", "*")
        current_hwid = get_machine_hwid()

        if target_hwid != "*" and target_hwid != current_hwid:
            raise ValueError(
                f"License is locked to a different machine (Licensed HWID: {target_hwid}, Current: {current_hwid})"
            )

        # 4. Expiration check
        expiry_str = payload.get("expiry_date")
        if expiry_str:
            try:
                expiry_dt = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                if now > expiry_dt:
                    raise ValueError(f"License expired on {expiry_dt.strftime('%Y-%m-%d')}")
            except Exception as e:
                if "License expired" in str(e):
                    raise
                logger.warning(f"Error parsing expiry date '{expiry_str}': {e}")

        return payload

    def activate_license(self, raw_license_str: str) -> Dict[str, Any]:
        """Verify and write the license to disk."""
        payload = self.verify_license_key(raw_license_str)

        self.license_dir.mkdir(parents=True, exist_ok=True)
        self.license_path.write_text(raw_license_str.strip(), encoding="utf-8")
        self.cached_status = None

        logger.info(f"Successfully activated {payload.get('tier', 'PRO')} license for '{payload.get('customer')}'")
        return self.get_license_status()

    def start_trial(self, customer_name: str = "Clinical Evaluation User") -> Dict[str, Any]:
        """
        Start an evaluation trial for this machine if not previously used.
        """
        hwid = get_machine_hwid()
        now = datetime.now(timezone.utc)
        trial_days = 14
        expiry = now + timedelta(days=trial_days)

        trial_payload = {
            "license_id": str(uuid.uuid4()),
            "customer": customer_name,
            "hwid": hwid,
            "tier": "TRIAL",
            "issued_date": now.isoformat(),
            "expiry_date": expiry.isoformat(),
            "features": [
                "dicom_import",
                "volume_reconstruction",
                "autoseg_totalseg",
                "autoseg_monai",
                "multi_bone_split",
                "surgical_cad",
                "stl_export",
            ],
            "max_cases": 10,
            "is_trial": True,
        }

        # Store locally
        trial_record = {
            "type": "TRIAL",
            "payload": trial_payload,
            "activated_at": now.isoformat(),
        }

        self.license_dir.mkdir(parents=True, exist_ok=True)
        trial_file = self.license_dir / "trial.json"
        if trial_file.exists():
            # Keep original start date to prevent clock tampering
            try:
                existing = json.loads(trial_file.read_text(encoding="utf-8"))
                return self.get_license_status()
            except Exception:
                pass

        trial_file.write_text(json.dumps(trial_record, indent=2), encoding="utf-8")
        self.cached_status = None
        return self.get_license_status()

    def get_license_status(self) -> Dict[str, Any]:
        """
        Get real-time license validation status.
        """
        current_hwid = get_machine_hwid()

        # 1. Check for installed full signed license file
        if self.license_path.exists():
            try:
                raw = self.license_path.read_text(encoding="utf-8").strip()
                payload = self.verify_license_key(raw)

                expiry_str = payload.get("expiry_date")
                days_left = None
                if expiry_str:
                    exp = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                    days_left = max(0, (exp - datetime.now(timezone.utc)).days)

                return {
                    "is_active": True,
                    "is_valid": True,
                    "status": "active",
                    "tier": payload.get("tier", "CLINICAL_PRO").upper(),
                    "customer": payload.get("customer", "Authorized User"),
                    "organization": payload.get("organization", "Surgical Center"),
                    "hwid": current_hwid,
                    "licensed_hwid": payload.get("hwid"),
                    "issued_date": payload.get("issued_date"),
                    "expiry_date": expiry_str,
                    "days_remaining": days_left,
                    "features": payload.get("features", ["all"]),
                    "is_trial": False,
                }
            except Exception as e:
                logger.warning(f"Installed license validation failed: {e}")

        # 2. Check for active evaluation trial
        trial_file = self.license_dir / "trial.json"
        if trial_file.exists():
            try:
                data = json.loads(trial_file.read_text(encoding="utf-8"))
                payload = data.get("payload", {})
                expiry_str = payload.get("expiry_date")
                exp = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                is_expired = now > exp
                days_left = max(0, (exp - now).days)

                return {
                    "is_active": not is_expired,
                    "is_valid": not is_expired,
                    "status": "trial_expired" if is_expired else "trial_active",
                    "tier": "TRIAL",
                    "customer": payload.get("customer", "Clinical Evaluation"),
                    "organization": "Evaluation License",
                    "hwid": current_hwid,
                    "licensed_hwid": payload.get("hwid"),
                    "issued_date": payload.get("issued_date"),
                    "expiry_date": expiry_str,
                    "days_remaining": days_left,
                    "features": payload.get("features", []),
                    "is_trial": True,
                }
            except Exception as e:
                logger.warning(f"Trial validation error: {e}")

        # 3. Unregistered default
        return {
            "is_active": False,
            "is_valid": False,
            "status": "unregistered",
            "tier": "UNREGISTERED",
            "customer": "Unregistered",
            "organization": "None",
            "hwid": current_hwid,
            "licensed_hwid": None,
            "issued_date": None,
            "expiry_date": None,
            "days_remaining": 0,
            "features": ["dicom_import", "volume_reconstruction"],
            "is_trial": False,
        }


# Singleton instance
license_service = LicenseService()
