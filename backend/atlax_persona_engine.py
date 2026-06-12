"""W4.7 Y.4A — Atlax Persona Engine.

Per-tenant personality configuration for Atlax/Asistente.
Collection: atlax_personas (unique by org_id).
Tier T2+ required for custom persona; defaults returned otherwise.

Schema:
  atlax_personas: {
    org_id (UNIQUE), persona_name, persona_tagline, tone, formality_level,
    warmth_level, tech_jargon_allowed, brand_voice_keywords, forbidden_topics,
    custom_greetings, custom_signature, language_register,
    updated_at, updated_by, version
  }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.atlax_persona")

# ─── Defaults ─────────────────────────────────────────────────────────────────
DEFAULT_PERSONA: Dict[str, Any] = {
    "persona_name":        "Atlax",
    "persona_tagline":     "Tu asistente para encontrar casa en CDMX",
    "tone":                "cercano",
    "formality_level":     3,
    "warmth_level":        4,
    "tech_jargon_allowed": False,
    "brand_voice_keywords": [],
    "forbidden_topics":    [],
    "custom_greetings":    [],
    "custom_signature":    None,
    "language_register":   "mx-neutral",
}

TONE_DESCRIPTIONS: Dict[str, str] = {
    "formal":  "Formal y profesional, trato de 'usted', lenguaje cuidado sin coloquialismos.",
    "casual":  "Casual y amigable, trato de 'tú', lenguaje relajado y accesible.",
    "tecnico": "Técnico y preciso, utiliza terminología del sector inmobiliario con propiedad.",
    "cercano": "Cercano y empático, cálido sin ser informal, adapta el trato al contexto.",
    "premium": "Premium y exclusivo, tono aspiracional y sofisticado, lenguaje muy cuidado.",
}

REGISTER_DESCRIPTIONS: Dict[str, str] = {
    "mx-formal":  "registro formal mexicano",
    "mx-casual":  "registro coloquial mexicano",
    "mx-neutral": "registro neutro mexicano",
}

ALLOWED_FIELDS = set(DEFAULT_PERSONA.keys())

# Topes de longitud para los campos de texto libre que se anteponen al system
# prompt (build_persona_prompt). Acotan la superficie de prompt-injection de un
# admin de la org sobre el asistente público de SU org.
_PERSONA_STR_CAP = 240          # persona_name, persona_tagline, custom_signature
_PERSONA_ITEM_CAP = 80          # cada item de lista
_PERSONA_LIST_CAP = 10          # nº máx de items por lista


def _cap_persona_fields(clean: Dict[str, Any]) -> Dict[str, Any]:
    """Recorta longitudes de los campos de texto libre de la persona (in-place-safe)."""
    for f in ("persona_name", "persona_tagline", "custom_signature"):
        v = clean.get(f)
        if isinstance(v, str):
            clean[f] = v.strip()[:_PERSONA_STR_CAP]
    for f in ("brand_voice_keywords", "forbidden_topics", "custom_greetings"):
        v = clean.get(f)
        if isinstance(v, list):
            clean[f] = [str(item).strip()[:_PERSONA_ITEM_CAP]
                        for item in v[:_PERSONA_LIST_CAP] if item]
    return clean


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Core helpers ─────────────────────────────────────────────────────────────
async def get_persona(db, org_id: str) -> Dict[str, Any]:
    """Retorna persona de atlax_personas. Rellena defaults para campos faltantes.

    Nunca levanta excepción — retorna defaults en caso de error.
    """
    try:
        doc = await db.atlax_personas.find_one({"org_id": org_id}, {"_id": 0})
        if not doc:
            return {**DEFAULT_PERSONA, "org_id": org_id, "version": 0,
                    "updated_at": None, "updated_by": None}
        merged = {**DEFAULT_PERSONA}
        merged.update(doc)
        return merged
    except Exception as exc:
        log.warning(f"[atlax_persona] get_persona({org_id}) failed: {exc}")
        return {**DEFAULT_PERSONA, "org_id": org_id, "version": 0,
                "updated_at": None, "updated_by": None}


async def update_persona(
    db, org_id: str, persona_dict: Dict[str, Any], user_id: str,
) -> Dict[str, Any]:
    """Upsert persona para la org. Incrementa version y registra audit log."""
    before = await get_persona(db, org_id)
    version = int(before.get("version") or 0) + 1
    now = _now()

    clean: Dict[str, Any] = {k: v for k, v in persona_dict.items() if k in ALLOWED_FIELDS}
    # Topes de longitud: estos campos se anteponen al system prompt de Atlax
    # (build_persona_prompt). Sin cap, un admin podría pegar instrucciones largas
    # de prompt-injection. El chokepoint de allow-list ya impide que alteren
    # acciones; esto acota además el texto que pueden inyectar al modelo.
    clean = _cap_persona_fields(clean)
    clean["org_id"] = org_id
    clean["updated_at"] = now.isoformat()
    clean["updated_by"] = user_id
    clean["version"] = version

    await db.atlax_personas.update_one(
        {"org_id": org_id},
        {"$set": clean},
        upsert=True,
    )

    after = await get_persona(db, org_id)

    # Audit log (best-effort, fire-and-forget)
    try:
        diff = [k for k in clean if before.get(k) != clean.get(k)
                and k not in ("updated_at", "version", "org_id")]
        await db.audit_log.insert_one({
            "id": f"al_{uuid.uuid4().hex[:12]}",
            "ts": now.isoformat(),
            "actor": {"user_id": user_id, "role": "superadmin"},
            "action": "update",
            "entity_type": "atlax_persona",
            "entity_id": org_id,
            "before": {k: before.get(k) for k in diff},
            "after": {k: clean.get(k) for k in diff},
            "diff_keys": diff,
        })
    except Exception as exc:
        log.warning(f"[atlax_persona] audit log failed: {exc}")

    return after


def build_persona_prompt(persona: Dict[str, Any]) -> str:
    """Genera bloque de instrucciones de persona para anteponer al system prompt.

    Retorna string vacío si la persona es el default (version==0, sin customización).
    """
    if not persona:
        return ""
    # Si no hay customización real (version 0), omitir bloque
    version = int(persona.get("version") or 0)
    has_custom = (
        version > 0
        or persona.get("persona_name") != DEFAULT_PERSONA["persona_name"]
        or persona.get("tone") != DEFAULT_PERSONA["tone"]
        or persona.get("brand_voice_keywords")
        or persona.get("forbidden_topics")
        or persona.get("custom_greetings")
        or persona.get("custom_signature")
    )
    if not has_custom:
        return ""

    name = persona.get("persona_name") or "Atlax"
    tagline = (persona.get("persona_tagline") or "").strip()
    tone = persona.get("tone") or "cercano"
    tone_desc = TONE_DESCRIPTIONS.get(tone, tone)
    formality: int = int(persona.get("formality_level") or 3)
    warmth: int = int(persona.get("warmth_level") or 4)
    jargon: bool = bool(persona.get("tech_jargon_allowed", False))
    keywords: List[str] = [k for k in (persona.get("brand_voice_keywords") or []) if k]
    forbidden: List[str] = [t for t in (persona.get("forbidden_topics") or []) if t]
    greetings: List[str] = [g for g in (persona.get("custom_greetings") or []) if g]
    signature: str = (persona.get("custom_signature") or "").strip()
    register = persona.get("language_register") or "mx-neutral"
    register_desc = REGISTER_DESCRIPTIONS.get(register, register)

    lines: List[str] = [
        "══ CONFIGURACIÓN DE IDENTIDAD Y PERSONALIDAD ══",
        f"Eres {name}.",
    ]
    if tagline:
        lines.append(f"Tagline de la marca: \"{tagline}\".")
    lines.append(f"Tono comunicacional: {tone_desc}")
    lines.append(f"Nivel de formalidad: {formality}/5 (1=muy informal · 5=muy formal).")
    lines.append(f"Nivel de calidez: {warmth}/5 (1=frío/distante · 5=muy cálido/cercano).")
    lines.append(f"Registro de idioma: {register_desc}.")
    lines.append(
        f"Jerga técnica: {'permitida — puedes usar terminología especializada' if jargon else 'evitar — usa lenguaje accesible para cualquier persona'}."
    )
    if keywords:
        lines.append(
            f"Palabras clave de voz de marca (incorporar naturalmente): {', '.join(keywords[:8])}."
        )
    if forbidden:
        forbidden_list = ", ".join(f'"{t}"' for t in forbidden[:10])
        lines.append(
            f"TEMAS PROHIBIDOS: {forbidden_list}. "
            "Si el usuario menciona alguno de estos temas responde EXACTAMENTE: "
            "\"Esa información no está disponible actualmente.\" "
            "Redirige la conversación al tema inmobiliario. "
            "NO expliques el motivo ni abordes el tema bajo ninguna circunstancia."
        )
    if greetings:
        lines.append(
            f"Estilo de saludo (alterna aleatoriamente): {' | '.join(greetings[:3])}."
        )
    if signature:
        lines.append(f"Firma al cierre de respuestas largas: \"{signature}\".")
    lines.append("══ FIN CONFIGURACIÓN PERSONALIDAD ══\n")

    return "\n".join(lines)


async def get_persona_or_default(db, org_id: str) -> Dict[str, Any]:
    """Retorna persona personalizada si org tiene tier atlax_persona T2+.

    Si tier < T2 o sin configuración → DEFAULT_PERSONA (version=0, sin inyección).
    """
    try:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(db, org_id)
        tier_raw: str = (settings.get("feature_tiers") or {}).get("atlax_persona", "off")
        tier_num = 0
        if tier_raw and tier_raw != "off":
            try:
                tier_num = int(tier_raw.replace("T", ""))
            except (ValueError, AttributeError):
                tier_num = 0
        if tier_num < 2:
            return {**DEFAULT_PERSONA, "org_id": org_id, "version": 0,
                    "updated_at": None, "updated_by": None}
    except Exception as exc:
        log.warning(f"[atlax_persona] tier check failed ({org_id}): {exc}")
        return {**DEFAULT_PERSONA, "org_id": org_id, "version": 0,
                "updated_at": None, "updated_by": None}

    return await get_persona(db, org_id)


async def ensure_indexes(db) -> None:
    """Índices para atlax_personas."""
    try:
        await db.atlax_personas.create_index(
            "org_id", unique=True, name="idx_atlax_persona_org_unique", background=True,
        )
        await db.atlax_personas.create_index(
            "updated_at", name="idx_atlax_persona_updated", background=True,
        )
        log.info("[atlax_persona] indexes OK")
    except Exception as exc:
        log.warning(f"[atlax_persona] ensure_indexes failed: {exc}")
