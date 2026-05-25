"""W7.AS.3.C · Conversation auto lead-enrichment on contact detect (cycle-closer).

Módulo puro standalone, importable por conversation_engine.py.
Detecta email y/o teléfono MX en el mensaje del lead y, si el lead aún no fue
enriquecido, dispara lead_enrichment_engine (W7.AS.1 · shipped W6 R1).

Reglas:
    - Detectores regex: email + teléfono MX (+52 / 55 / lada nacional).
    - Idempotente: 1 dispatch por lead_id (marker en conversation_autoenrich).
    - Respeta LEAD_ENRICHMENT_DAILY_CAP_PER_TENANT (el engine aplica el cap;
      aquí surface el estado rate_limited sin reintentar).
    - FAIL-OPEN: si el engine falla, retorna shape neutro sin crash.

Collections:
    - conversation_autoenrich   (marker idempotente por lead_id)
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.conversation_lead_enrichment")

# Email RFC-ish (suficiente para detección conversacional)
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# Teléfono MX: +52 opcional, prefijo móvil 1 opcional, lada 2-3 dígitos, número 7-8 dígitos.
# Acepta separadores espacio / guion / punto y paréntesis en la lada.
MX_PHONE_RE = re.compile(
    r"(?<!\d)"
    r"(?:\+?52[\s.\-]?)?"            # país +52 opcional
    r"(?:1[\s.\-]?)?"               # móvil 1 opcional
    r"(?:\(?\d{2,3}\)?[\s.\-]?)"     # lada 2-3 dígitos (55, 33, 81, 999...)
    r"\d{3,4}[\s.\-]?\d{4}"          # número de abonado
    r"(?!\d)"
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _detect_email(text: str) -> Optional[str]:
    m = EMAIL_RE.search(text or "")
    return m.group(0).strip().lower() if m else None


def _normalize_mx_phone(raw: str) -> Optional[str]:
    """Normaliza a +52XXXXXXXXXX (10 dígitos nacionales). FAIL-OPEN → None."""
    digits = re.sub(r"\D", "", raw or "")
    # 52 + 1 + 10  (móvil con prefijo 1)
    if len(digits) == 13 and digits.startswith("521"):
        digits = digits[3:]
    # 52 + 10
    elif len(digits) == 12 and digits.startswith("52"):
        digits = digits[2:]
    # 1 + 10  (prefijo móvil sin país)
    elif len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return "+52" + digits
    return None


def _detect_phone(text: str) -> Optional[str]:
    for m in MX_PHONE_RE.finditer(text or ""):
        normalized = _normalize_mx_phone(m.group(0))
        if normalized:
            return normalized
    return None


def _neutral(reason: str, **extra: Any) -> Dict[str, Any]:
    out = {"status": "skipped", "detected": False, "dispatched": False, "reason": reason}
    out.update(extra)
    return out


async def auto_enrich_on_detect(
    message_text: str, lead_id: str, tenant_id: Optional[str], db
) -> Dict[str, Any]:
    """Detecta contacto en el mensaje y dispara enrichment si procede.

    Returns:
        {status, detected, dispatched, lead_id, email?, phone?, enrichment?, reason?}
    Idempotente (1 dispatch por lead_id) · FAIL-OPEN.
    """
    if not lead_id:
        return _neutral("missing_lead_id")

    body = message_text or ""
    email = _detect_email(body)
    phone = _detect_phone(body)

    if not email and not phone:
        return _neutral("no_contact_detected", detected=False, lead_id=lead_id)

    base = {
        "status": "detected",
        "detected": True,
        "dispatched": False,
        "lead_id": lead_id,
        "email": email,
        "phone": phone,
    }

    if db is None:
        return {**base, "status": "skipped", "reason": "no_db"}

    # Idempotency: 1 dispatch por lead_id
    marker_id = "caenr_" + hashlib.sha1(str(lead_id).encode("utf-8")).hexdigest()[:20]
    try:
        res = await db.conversation_autoenrich.update_one(
            {"marker_id": marker_id},
            {"$setOnInsert": {
                "marker_id": marker_id,
                "lead_id": lead_id,
                "tenant_id": tenant_id,
                "email": email,
                "phone": phone,
                "dispatched_at": _now(),
            }},
            upsert=True,
        )
        was_new = getattr(res, "upserted_id", None) is not None
        if not was_new:
            return {**base, "status": "skipped", "dispatched": False,
                    "idempotent": True, "reason": "already_dispatched"}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_enrich] marker failed: {exc}")
        return {**base, "status": "skipped", "reason": "marker_error", "error": str(exc)}

    # Dispatch al engine W7.AS.1 · import perezoso · FAIL-OPEN
    try:
        from lead_enrichment_engine import enrich_lead

        lead_data = {}
        if email:
            lead_data["email"] = email
        if phone:
            lead_data["phone"] = phone

        enrichment = await enrich_lead(
            db, lead_id, lead_data=lead_data, tenant_id=tenant_id,
            actor={"source": "conversation_auto_enrich"},
        )
        status = enrichment.get("status") if isinstance(enrichment, dict) else "unknown"
        if status == "rate_limited":
            # Respeta el cap del tenant · revierte marker para reintento futuro
            try:
                await db.conversation_autoenrich.delete_one({"marker_id": marker_id})
            except Exception:
                pass
            return {**base, "status": "rate_limited", "dispatched": False,
                    "reason": "daily_cap_exceeded", "enrichment": enrichment}
        return {**base, "status": "dispatched", "dispatched": True, "enrichment": enrichment}
    except Exception as exc:  # FAIL-OPEN
        # revierte marker para no perder el lead ante fallo transitorio del engine
        try:
            await db.conversation_autoenrich.delete_one({"marker_id": marker_id})
        except Exception:
            pass
        log.warning(f"[conversation_enrich] engine failed: {exc}")
        return {**base, "status": "skipped", "reason": "engine_error", "error": str(exc)}


async def ensure_indexes(db) -> None:
    try:
        await db.conversation_autoenrich.create_index("marker_id", unique=True)
        await db.conversation_autoenrich.create_index("lead_id", background=True)
    except Exception as exc:
        log.warning(f"[conversation_enrich] ensure_indexes failed: {exc}")
