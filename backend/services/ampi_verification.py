"""Phase 18 · Batch 35 — AMPI verification stub.

AMPI = Asociación Mexicana de Profesionales Inmobiliarios.

STUB behaviour (real integration deferred to H2):
  - Validates format only: 8-12 alphanumeric chars (case-insensitive).
  - If format OK -> returns valid=True with a deterministic mock holder/expiry.
  - Stores a flag `manual_review_required=True` so admin can later override.

Public surface:
  - validate_ampi_id(raw: str) -> dict
  - record_verification(db, inmobiliaria_id, raw_ampi_id, result) -> dict
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

log = logging.getLogger("dmx.ampi_verification")

_AMPI_FORMAT = re.compile(r"^[A-Za-z0-9]{8,12}$")


def validate_ampi_id(raw: str) -> Dict[str, Any]:
    """Format validation stub. Returns:
      {valid, ampi_id, expires_at?, holder_name?, reason?, manual_review_required}
    """
    if not raw or not isinstance(raw, str):
        return {
            "valid": False,
            "ampi_id": "",
            "reason": "AMPI ID requerido",
            "manual_review_required": False,
        }
    cleaned = raw.strip().upper()
    if not _AMPI_FORMAT.match(cleaned):
        return {
            "valid": False,
            "ampi_id": cleaned,
            "reason": "Formato inválido. AMPI ID debe ser 8-12 caracteres alfanuméricos.",
            "manual_review_required": False,
        }
    # Format OK — stub validation: assume valid + manual review later
    expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    return {
        "valid": True,
        "ampi_id": cleaned,
        "expires_at": expires_at,
        "holder_name": None,  # populated by AMPI API once integrated (H2)
        "manual_review_required": True,
        "reason": None,
    }


async def record_verification(
    db, inmobiliaria_id: str, raw_ampi_id: str, result: Dict[str, Any],
) -> Dict[str, Any]:
    """Persist verification attempt (audit trail)."""
    doc = {
        "inmobiliaria_id": inmobiliaria_id,
        "ampi_id": result.get("ampi_id", ""),
        "valid": bool(result.get("valid")),
        "manual_review_required": bool(result.get("manual_review_required")),
        "reason": result.get("reason"),
        "expires_at": result.get("expires_at"),
        "raw_input_hash": str(hash(raw_ampi_id or "")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.ampi_verifications.insert_one(doc)
    except Exception as ex:
        log.warning(f"[ampi] insert verification failed: {ex}")
    doc.pop("_id", None)
    return doc
