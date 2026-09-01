"""
Ossilith Master License Key Generator (Admin / Vendor Utility).
Issues cryptographically-signed Ed25519 license keys locked to customer hardware (HWID).
"""

import argparse
import base64
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

# Master Vendor Private Key (Must be kept secure by vendor)
MASTER_PRIVATE_KEY_HEX = "3a8c170d7e4b9e115024d31d9a04f2bb7f551c6b12a83e0c01289139ab301648"


def get_private_key() -> ed25519.Ed25519PrivateKey:
    """Load the Ed25519 private key."""
    priv_bytes = bytes.fromhex(MASTER_PRIVATE_KEY_HEX)
    return ed25519.Ed25519PrivateKey.from_private_bytes(priv_bytes)


def generate_license_key(
    customer_name: str,
    organization: str = "Medical Center",
    email: str = "doctor@hospital.org",
    hwid: str = "*",
    tier: str = "CLINICAL_PRO",
    valid_days: int = 365,
    features: list[str] | None = None,
    max_cases: int = 9999,
) -> str:
    """
    Generate and sign an offline cryptographic license key.
    Format: <base64_payload>.<base64_signature>
    """
    priv_key = get_private_key()
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=valid_days) if valid_days != 0 else None


    if features is None:
        if tier.upper() == "TRIAL":
            features = ["dicom_import", "volume_reconstruction", "autoseg_totalseg", "multi_bone_split", "surgical_cad", "stl_export"]
        else:
            features = [
                "dicom_import",
                "volume_reconstruction",
                "autoseg_totalseg",
                "autoseg_monai",
                "multi_bone_split",
                "surgical_cad",
                "stl_export",
                "batch_export",
                "cloud_sync",
            ]

    payload = {
        "license_id": str(uuid.uuid4()),
        "customer": customer_name,
        "organization": organization,
        "email": email,
        "hwid": hwid.strip().upper(),
        "tier": tier.upper(),
        "issued_date": now.isoformat(),
        "expiry_date": expiry.isoformat() if expiry else None,
        "features": features,
        "max_cases": max_cases,
        "schema_version": "1.0",
    }

    # 1. Serialize payload to canonical JSON bytes
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")

    # 2. Digitally sign with Ed25519
    signature_bytes = priv_key.sign(payload_bytes)

    # 3. Base64 URL-safe encode
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("ascii").rstrip("=")
    sig_b64 = base64.urlsafe_b64encode(signature_bytes).decode("ascii").rstrip("=")

    license_key = f"{payload_b64}.{sig_b64}"
    return license_key


def main():
    parser = argparse.ArgumentParser(description="Ossilith Cryptographic License Key Generator")
    parser.add_argument("--customer", "-c", required=True, help="Customer / Surgeon Full Name")
    parser.add_argument("--org", "-o", default="General Hospital", help="Hospital / Organization")
    parser.add_argument("--email", "-e", default="surgeon@hospital.org", help="Licensee Email")
    parser.add_argument("--hwid", "-w", default="*", help="Machine Hardware ID (e.g. OSSI-XXXX-XXXX-XXXX, or '*' for any machine)")
    parser.add_argument("--tier", "-t", default="CLINICAL_PRO", choices=["TRIAL", "CLINICAL_PRO", "ENTERPRISE", "UNLIMITED"], help="License Tier")
    parser.add_argument("--days", "-d", type=int, default=365, help="Validity duration in days (0 for lifetime)")
    parser.add_argument("--output", help="Save to file")

    args = parser.parse_args()

    key = generate_license_key(
        customer_name=args.customer,
        organization=args.org,
        email=args.email,
        hwid=args.hwid,
        tier=args.tier,
        valid_days=args.days,
    )

    print("\n" + "=" * 70)
    print(f"  OSSILITH CRYPTOGRAPHIC LICENSE KEY GENERATED")
    print("=" * 70)
    print(f"Customer:     {args.customer}")
    print(f"Organization: {args.org}")
    print(f"Tier:         {args.tier}")
    print(f"Target HWID:  {args.hwid}")
    print(f"Validity:     {args.days} days")
    print("-" * 70)
    print(f"\nLICENSE KEY STRING:\n\n{key}\n")
    print("=" * 70)

    if args.output:
        Path(args.output).write_text(key, encoding="utf-8")
        print(f"Saved license key to {args.output}")


if __name__ == "__main__":
    main()
