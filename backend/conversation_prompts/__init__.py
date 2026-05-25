"""W7.AS.3.B — Paquete de prompts del broker IA DMX.

Exporta el system prompt base y las 4 personas, más un helper para componer el
prompt final (base + persona). Importable por conversation_engine.py.

    from conversation_prompts import build_prompt, PERSONAS, SYSTEM_BASE
    prompt = build_prompt("luxury")
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .system_base import SYSTEM_BASE
from .persona_luxury import PERSONA_LUXURY
from .persona_family import PERSONA_FAMILY
from .persona_investor import PERSONA_INVESTOR
from .persona_first_home import PERSONA_FIRST_HOME

# Registro de personas por clave (alineado con buyer_intent W5.22 Z.8).
PERSONAS: Dict[str, str] = {
    "luxury": PERSONA_LUXURY,
    "family": PERSONA_FAMILY,
    "investor": PERSONA_INVESTOR,
    "first_home": PERSONA_FIRST_HOME,
}

__all__ = [
    "SYSTEM_BASE",
    "PERSONA_LUXURY",
    "PERSONA_FAMILY",
    "PERSONA_INVESTOR",
    "PERSONA_FIRST_HOME",
    "PERSONAS",
    "available_personas",
    "build_prompt",
]


def available_personas() -> List[str]:
    """Claves de persona disponibles."""
    return list(PERSONAS.keys())


def build_prompt(persona_key: Optional[str] = None) -> str:
    """Compone el system prompt final = SYSTEM_BASE [+ persona].

    Si `persona_key` es None o desconocida → retorna solo SYSTEM_BASE
    (FAIL-OPEN, sin error).
    """
    persona = PERSONAS.get((persona_key or "").strip().lower())
    if not persona:
        return SYSTEM_BASE
    return f"{SYSTEM_BASE}\n\n{persona}"
