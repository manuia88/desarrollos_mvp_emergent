"""W7.AS.3.B — DISC adapter para el system prompt del broker IA.

Módulo puro importable por conversation_engine.py. NO endpoints · NO UI.

Provee:
  - adapt_system_prompt(base_prompt, buyer_score_tier) -> str
        Inyecta un modificador de tono según el perfil DISC del prospecto.
        D = directo + datos        (cierra rápido, ROI, números)
        I = cálido + emocional     (relación, entusiasmo, social proof)
        S = relacional + paciente  (seguridad, proceso, sin presión)
        C = técnico + pruebas       (especificaciones, fuentes, exactitud)

  - resolve_disc(db, user_id) -> str  (async, opcional)
        Lookup de DISC vía buyer_score_engine (W5.4) / heurística. FAIL-OPEN.

El parámetro `buyer_score_tier` acepta:
  - una letra DISC: "D" / "I" / "S" / "C" (case-insensitive)
  - un tier de buyer_score: "hot" / "warm" / "cold"  → se mapea a DISC
  - None / desconocido → prompt base sin modificar (FAIL-OPEN)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.conversation_disc")

# Modificadores de tono por dimensión DISC (es-MX, listos para concatenar).
_DISC_MODIFIERS: Dict[str, str] = {
    "D": (
        "PERFIL DEL PROSPECTO: Dominante (D). Es directo y orientado a "
        "resultados. Sé conciso, lidera con datos duros (precio, ROI, "
        "plusvalía, absorción) y propón el siguiente paso de cierre sin rodeos. "
        "Evita relleno emocional; respeta su tiempo."
    ),
    "I": (
        "PERFIL DEL PROSPECTO: Influyente (I). Es entusiasta y social. Usa un "
        "tono cálido y emocional, pinta el estilo de vida, apóyate en "
        "testimonios y prueba social. Genera conexión antes que números."
    ),
    "S": (
        "PERFIL DEL PROSPECTO: Estable (S). Valora seguridad y relación de "
        "largo plazo. Sé paciente y relacional, explica el proceso paso a paso, "
        "transmite confianza y garantías. No presiones al cierre; acompaña."
    ),
    "C": (
        "PERFIL DEL PROSPECTO: Concienzudo (C). Es analítico y exigente con la "
        "precisión. Sé técnico, cita fuentes y especificaciones exactas (m², "
        "tasas, metodología, comparables). Evita exageraciones; respalda todo "
        "con pruebas verificables."
    ),
}

# Mapeo tier buyer_score → DISC por defecto (heurística conservadora).
_TIER_TO_DISC: Dict[str, str] = {
    "hot": "D",    # caliente → quiere cerrar, datos directos
    "warm": "I",   # tibio → nutrir con conexión emocional
    "cold": "S",   # frío → paciencia y construcción de confianza
}


def _normalize_disc(buyer_score_tier: Optional[str]) -> Optional[str]:
    """Resuelve el input a una letra DISC válida, o None si no aplica."""
    if not buyer_score_tier:
        return None
    key = str(buyer_score_tier).strip().lower()
    if key in ("d", "i", "s", "c"):
        return key.upper()
    if key in _TIER_TO_DISC:
        return _TIER_TO_DISC[key]
    return None


def adapt_system_prompt(base_prompt: str, buyer_score_tier: Optional[str]) -> str:
    """Devuelve `base_prompt` con el modificador de tono DISC adjunto.

    FAIL-OPEN: si `buyer_score_tier` es None/desconocido, retorna el prompt
    base intacto. Si `base_prompt` es vacío, retorna solo el modificador.
    """
    try:
        disc = _normalize_disc(buyer_score_tier)
        if disc is None:
            return base_prompt or ""
        modifier = _DISC_MODIFIERS[disc]
        if not base_prompt:
            return modifier
        return f"{base_prompt}\n\n{modifier}"
    except Exception as exc:  # FAIL-OPEN
        log.debug(f"[conversation_disc] adapt fail-open: {exc}")
        return base_prompt or ""


async def resolve_disc(db: Any, user_id: str) -> str:
    """Lookup DISC del prospecto vía buyer_score_engine (W5.4).

    Best-effort: deriva DISC del tier del buyer_score. Retorna "" si no hay
    señal o ante cualquier error (FAIL-OPEN). Pensado para que el engine
    obtenga el `buyer_score_tier` que luego pasa a adapt_system_prompt.
    """
    if db is None or not user_id:
        return ""
    try:
        from buyer_score_engine import compute_user_score
        score_data: Dict[str, Any] = await compute_user_score(db, user_id)
        tier = (score_data or {}).get("tier")
        return _normalize_disc(tier) or ""
    except Exception as exc:  # FAIL-OPEN
        log.debug(f"[conversation_disc] resolve_disc fail-open: {exc}")
        return ""
