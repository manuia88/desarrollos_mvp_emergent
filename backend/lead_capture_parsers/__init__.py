"""W5.ASR.5 Parte 1 — Lead Capture Parsers.

Exporta:
    parse_email(raw_email: dict) → tuple[str, dict | None]
        Intenta cada parser en orden; si ninguno hace match exacto, usa extracción genérica.
        Retorna (parser_name, extracted_lead_dict | None).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional, Tuple

from .inmuebles24 import Inmuebles24Parser
from .lamudi import LamudiParser

log = logging.getLogger("dmx.lead_capture_parsers")

_PARSERS = [Inmuebles24Parser(), LamudiParser()]


def parse_email(raw_email: dict) -> Tuple[str, Optional[Dict[str, Any]]]:
    """Itera parsers en orden. Primer match exitoso gana.
    Fallback: extracción genérica básica (puede retornar None si no hay datos útiles).
    """
    for parser in _PARSERS:
        try:
            if parser.match(raw_email):
                extracted = parser.extract(raw_email)
                if extracted:
                    return parser.parser_name, extracted
        except Exception as exc:  # noqa: BLE001
            log.warning(f"[parse_email] parser={parser.parser_name} error: {exc}")

    # Fallback genérico — extrae datos mínimos del remitente
    return "generic_alias", _generic_extract(raw_email)


def _generic_extract(raw_email: dict) -> Optional[Dict[str, Any]]:
    """Extracción conservadora desde email genérico (sin parser especializado)."""
    from_header = raw_email.get("from", "") or raw_email.get("sender", "") or ""
    subject = raw_email.get("subject", "") or ""
    body = raw_email.get("text", "") or raw_email.get("html", "") or ""

    # Intentar extraer email del remitente
    EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
    sender_email: Optional[str] = None
    m = EMAIL_RE.search(from_header)
    if m:
        sender_email = m.group(0).lower()

    sender_name: Optional[str] = None
    name_m = re.match(r'^"?([^"<@]+)"?\s*<', from_header)
    if name_m:
        sender_name = name_m.group(1).strip()[:100] or None

    phone: Optional[str] = None
    phone_m = re.search(r"\b(\+?52\s?[1-9]\d{9})\b|\b([1-9]\d{9})\b", body)
    if phone_m:
        raw_p = phone_m.group(1) or phone_m.group(2)
        phone = re.sub(r"\s+", "", raw_p)[:20]

    message = (body[:500] if body else subject[:200]) or None

    # No hay datos suficientes si falta email Y teléfono
    if not sender_email and not phone:
        return None

    return {
        "name": sender_name,
        "email": sender_email,
        "phone": phone,
        "message": message,
        "listing_id": None,
        "listing_url": None,
    }
