"""C3 Privacidad · Registro de consentimiento (LFPDPPP) reusable en 4 portales.

LFPDPPP (Art. 8/10): el consentimiento debe ser informado y quedar registrado.
Para datos NO sensibles capturados por un formulario web con el Aviso de
Privacidad a la vista, el consentimiento del propósito principal puede ser
TÁCITO (al enviar). El opt-in de marketing/publicidad es SEPARADO y EXPRESO.

Este helper construye un bloque `consent` uniforme para guardar junto al lead:
- qué versión del aviso se mostró,
- cuándo se aceptó,
- si aceptó marketing (opt-in expreso),
- evidencia mínima (IP/origen) para la traza.

No bloquea la captura del propósito principal (sería peor perder el lead); marca
`marketing_opt_in` solo si vino expreso. Devuelve algo siempre.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Versión del Aviso de Privacidad vigente. Subir cuando cambie el texto legal.
PRIVACY_POLICY_VERSION = "2026-06"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client_ip(request) -> str:
    try:
        ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if not ip and request.client:
            ip = request.client.host
        return ip or "unknown"
    except Exception:
        return "unknown"


def build_consent_record(
    *,
    consents: Optional[Dict[str, Any]] = None,
    request=None,
    purpose: str = "lead_capture",
    channel: str = "web_form",
) -> Dict[str, Any]:
    """Construye el bloque de consentimiento a guardar en el documento del lead.

    `consents` (opcional, del payload) puede traer:
      - privacy_policy: bool   (aceptación expresa del aviso; si no viene, se
                                asume TÁCITA al enviar el formulario)
      - marketing: bool        (opt-in EXPRESO de marketing; default False)
    """
    consents = consents or {}
    privacy_express = bool(consents.get("privacy_policy"))
    marketing_optin = bool(consents.get("marketing"))
    return {
        "privacy_notice_shown": True,
        "privacy_policy_version": PRIVACY_POLICY_VERSION,
        # tácito (al enviar) salvo que el form mande la casilla expresa
        "privacy_consent_type": "express" if privacy_express else "implied_on_submit",
        "accepted_at": _now_iso(),
        "marketing_opt_in": marketing_optin,
        "marketing_opt_in_at": _now_iso() if marketing_optin else None,
        "purpose": purpose,
        "channel": channel,
        "evidence": {"ip": _client_ip(request), "source": channel},
    }
