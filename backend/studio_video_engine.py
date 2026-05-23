"""W5.16-A · Studio Video · Auto-script generator.

Convierte property + duration + tone + audience en script estructurado
(hook · body · cta) usando F4 narrative_layer como base.

Collections:
    db.studio_video_scripts  — cache 90d con script estructurado
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_video_engine")

SUPPORTED_DURATIONS: List[int] = [30, 60, 90]
SUPPORTED_TONES: List[str] = ["brunson", "hormozi", "vogue", "neutral"]
DEFAULT_TONE = "neutral"
SUPPORTED_AUDIENCES = (
    "neutral", "investor", "family", "first_home",
    "luxury", "boutique", "urgent",
)

SCRIPT_TEMPLATES: Dict[int, Dict[str, int]] = {
    30: {"hook_sec": 5, "body_sec": 20, "cta_sec": 5},
    60: {"hook_sec": 8, "body_sec": 42, "cta_sec": 10},
    90: {"hook_sec": 10, "body_sec": 65, "cta_sec": 15},
}

CHARS_PER_SEC = 12.0  # ES neutro
CACHE_TTL_DAYS = 90


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _script_id(property_id: str, duration_sec: int, tone: str, audience: str) -> str:
    payload = f"{property_id}|{duration_sec}|{tone}|{audience}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _split_into_sentences(text: str) -> List[str]:
    if not text:
        return []
    # Naive sentence split honoring spanish punctuation
    parts = re.split(r"(?<=[\.\!\?])\s+", text.strip())
    return [p.strip() for p in parts if p and p.strip()]


def _build_custom_facts(dev: Dict[str, Any]) -> Dict[str, Any]:
    amenities = dev.get("amenities") or []
    if not isinstance(amenities, list):
        amenities = []
    amenities_top_3 = [str(a) for a in amenities[:3] if a]
    return {
        "price": dev.get("price_from") or dev.get("price"),
        "name": dev.get("name") or dev.get("title") or dev.get("id"),
        "colonia": dev.get("colonia") or dev.get("zone") or dev.get("delegacion"),
        "recamaras": dev.get("recamaras") or dev.get("bedrooms"),
        "m2": dev.get("m2") or dev.get("area_m2"),
        "amenities_top_3": amenities_top_3,
        "stage": dev.get("stage"),
        "developer_name": dev.get("developer_name") or dev.get("developer"),
    }


def _split_script(narrative_long: str, duration_sec: int) -> Dict[str, str]:
    """Reparte narrative_long en hook · body · cta segun pesos de duration.

    Heuristica: split por sentencias · primer ~15% chars = hook · ultimo ~15% = cta · resto body.
    Si narrative es corto, distribuye proporcionalmente preservando al menos 1 sentencia por seccion.
    """
    sentences = _split_into_sentences(narrative_long)
    if not sentences:
        return {"hook": "", "body": "", "cta": ""}

    # Explicit marker detection (caso F4 estructurado)
    cta_marker_re = re.compile(r"^(cierre|conclusion|llamado|cta|accion)\s*:", re.IGNORECASE)
    hook_marker_re = re.compile(r"^(hook|apertura|inicio)\s*:", re.IGNORECASE)

    hook_idx = None
    cta_idx = None
    for i, s in enumerate(sentences):
        if hook_idx is None and hook_marker_re.match(s):
            hook_idx = i
        if cta_marker_re.match(s):
            cta_idx = i

    if cta_idx is not None and (hook_idx is None or cta_idx > hook_idx):
        hook = " ".join(sentences[: max(1, (hook_idx + 1) if hook_idx is not None else 1)])
        cta = " ".join(sentences[cta_idx:])
        body = " ".join(sentences[((hook_idx + 1) if hook_idx is not None else 1): cta_idx])
        if not body:
            body = hook
        return {"hook": hook, "body": body, "cta": cta}

    # Heuristic split por proporcion (~15% / ~70% / ~15%)
    weights = SCRIPT_TEMPLATES.get(duration_sec, SCRIPT_TEMPLATES[60])
    total_sec = max(1, weights["hook_sec"] + weights["body_sec"] + weights["cta_sec"])
    n = len(sentences)
    hook_n = max(1, round(n * weights["hook_sec"] / total_sec))
    cta_n = max(1, round(n * weights["cta_sec"] / total_sec))
    if hook_n + cta_n >= n:
        # Garantiza al menos 1 sentencia para body
        hook_n = max(1, n // 4)
        cta_n = max(1, n // 4)
        if hook_n + cta_n >= n:
            hook_n = 1
            cta_n = 1 if n > 2 else 0

    hook = " ".join(sentences[:hook_n])
    cta = " ".join(sentences[-cta_n:]) if cta_n > 0 else ""
    body = " ".join(sentences[hook_n: (n - cta_n) if cta_n > 0 else n])
    if not body:
        body = " ".join(sentences[hook_n:])

    return {"hook": hook, "body": body, "cta": cta}


def _template_fallback_script(facts: Dict[str, Any], duration_sec: int, tone: str) -> Dict[str, str]:
    name = facts.get("name") or "este desarrollo"
    colonia = facts.get("colonia") or "la zona"
    rec = facts.get("recamaras")
    m2 = facts.get("m2")
    price = facts.get("price")
    rec_part = f"{rec} recamaras · " if rec else ""
    m2_part = f"{m2} m2 · " if m2 else ""
    price_part = f"desde ${price:,} MXN" if isinstance(price, (int, float)) else ""
    hook = f"Conoce {name} en {colonia}."
    body = f"{rec_part}{m2_part}{price_part}. Diseno contemporaneo y ubicacion estrategica."
    cta_map = {
        "brunson": "Reserva hoy · acceso preferente esta semana.",
        "hormozi": "Si quieres entrar al precio actual · agenda tu visita ya.",
        "vogue": "Solicita una visita curada por nuestro equipo.",
        "neutral": "Contactanos para mas informacion.",
    }
    return {"hook": hook, "body": body.strip(), "cta": cta_map.get(tone, cta_map["neutral"])}


async def generate_script_from_property(
    db,
    property_id: str,
    duration_sec: int = 60,
    tone: str = DEFAULT_TONE,
    audience: str = "neutral",
    user_id: Optional[str] = None,
    dev_org_id: Optional[str] = None,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Genera script de video estructurado (hook/body/cta) para una propiedad."""
    if duration_sec not in SUPPORTED_DURATIONS:
        raise ValueError(f"duration_sec invalido · soportadas {SUPPORTED_DURATIONS}")
    if tone not in SUPPORTED_TONES:
        raise ValueError(f"tone invalido · soportados {SUPPORTED_TONES}")
    audience_norm = audience if audience in SUPPORTED_AUDIENCES else "neutral"

    if not property_id:
        return {"ok": False, "reason": "property_id_empty"}

    script_id = _script_id(property_id, duration_sec, tone, audience_norm)

    # Cache lookup
    if not force_refresh:
        try:
            hit = await db.studio_video_scripts.find_one({"script_id": script_id}, {"_id": 0})
        except Exception as exc:
            log.warning(f"[studio_video] script cache lookup failed: {exc}")
            hit = None
        if hit:
            out = dict(hit)
            out["cached"] = True
            return out

    # Property lookup
    try:
        dev = await db.developments.find_one({"id": property_id}, {"_id": 0})
    except Exception as exc:
        log.warning(f"[studio_video] developments lookup failed: {exc}")
        dev = None
    if not dev:
        return {"ok": False, "reason": "property_not_found"}

    facts = _build_custom_facts(dev)

    # Llamar narrative_layer
    fallback_used = False
    narrative_long = ""
    model_used = "fallback_template"
    try:
        from narrative_layer_engine import generate as narrative_generate
        narr = await narrative_generate(
            db,
            scope="video_script",
            entity_id=f"vid_{property_id}_{duration_sec}_{tone}_{audience_norm}",
            audience=audience_norm,
            custom_facts=facts,
            custom_tax_block={},
            user_id=user_id,
            force_refresh=False,
        )
        narrative_long = (narr.get("narrative_long") or "").strip() if isinstance(narr, dict) else ""
        if narr and narr.get("model_used"):
            model_used = narr["model_used"]
        if not narrative_long:
            fallback_used = True
    except Exception as exc:
        log.warning(f"[studio_video] narrative_layer failed · fallback template: {exc}")
        fallback_used = True

    if fallback_used or not narrative_long:
        sections = _template_fallback_script(facts, duration_sec, tone)
        model_used = "fallback_template"
    else:
        sections = _split_script(narrative_long, duration_sec)

    hook = sections["hook"]
    body = sections["body"]
    cta = sections["cta"]
    script_text = "\n\n".join([s for s in (hook, body, cta) if s])
    estimated_chars = len(script_text)
    estimated_audio_sec = round(max(1.0, estimated_chars / CHARS_PER_SEC), 2)

    now = _now()
    ttl_until = now + timedelta(days=CACHE_TTL_DAYS)
    doc = {
        "script_id": script_id,
        "property_id": property_id,
        "duration_sec": duration_sec,
        "tone": tone,
        "audience": audience_norm,
        "script_text": script_text,
        "hook": hook,
        "body": body,
        "cta": cta,
        "estimated_chars": estimated_chars,
        "estimated_audio_sec": estimated_audio_sec,
        "model_used": model_used,
        "fallback": fallback_used,
        "user_id": user_id,
        "dev_org_id": dev_org_id,
        "generated_at": now,
        "ttl_until": ttl_until,
    }
    try:
        await db.studio_video_scripts.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[studio_video] script cache insert failed: {exc}")

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "anon", "role": "system"},
            action="studio_video_script_generated",
            entity_type="studio_video_script",
            entity_id=script_id,
            after={
                "property_id": property_id, "duration_sec": duration_sec,
                "tone": tone, "audience": audience_norm,
                "model_used": model_used, "fallback": fallback_used,
            },
        )
    except Exception as exc:
        log.debug(f"[studio_video] audit skipped: {exc}")

    out = dict(doc)
    out["ok"] = True
    out["cached"] = False
    out["generated_at"] = now.isoformat()
    out.pop("ttl_until", None)
    return out


async def get_script_cached(db, script_id: str) -> Optional[Dict[str, Any]]:
    try:
        doc = await db.studio_video_scripts.find_one({"script_id": script_id}, {"_id": 0})
        return doc
    except Exception as exc:
        log.warning(f"[studio_video] get_script_cached failed: {exc}")
        return None


async def ensure_indexes(db) -> None:
    try:
        await db.studio_video_scripts.create_index("script_id", unique=True, background=True)
        await db.studio_video_scripts.create_index(
            "ttl_until", expireAfterSeconds=0, background=True,
        )
        await db.studio_video_scripts.create_index(
            [("dev_org_id", 1), ("generated_at", -1)], background=True,
        )
        await db.studio_video_scripts.create_index(
            [("property_id", 1), ("duration_sec", 1)], background=True,
        )
    except Exception as exc:
        log.warning(f"[studio_video] ensure_indexes failed: {exc}")
    try:
        from adapters.tts.elevenlabs import ensure_audio_indexes
        await ensure_audio_indexes(db)
    except Exception as exc:
        log.warning(f"[studio_video] audio indexes failed: {exc}")
