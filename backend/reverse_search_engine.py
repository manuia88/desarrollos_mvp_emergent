"""W5.x F5 · Reverse Search engine.

Convierte queries en lenguaje natural ("depto familia 3 recámaras Polanco
máximo 8M con escuelas, no avenida") en resultados rankeados del catálogo
DEVELOPMENTS via:
  1. LLM parser (Claude Sonnet) → hard_filters + soft_criteria + negative_criteria + buyer_intent
  2. In-memory filter sobre data_developments.DEVELOPMENTS aplicando hard_filters
  3. Buyer intent bonuses (family → bonus zona IE alta · investor → DRPI · luxury/first_home → price band)
  4. Re-rank semántico via RAG context (fail-soft si no disponible)
  5. Explicación por match con sources
  6. Cache 30min Mongo (key=sha256(text+audience+language+limit))

Fail-soft total: si LLM falla → parser retorna empty filters; si rerank falla
→ usa match_score base; si cache falla → recompute. Nunca lanza.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.reverse_search")

COLLECTION = "reverse_search_cache"
CACHE_TTL_SECONDS = 30 * 60  # 30 minutos
LLM_MODEL = "claude-sonnet-4-5-20250929"
DEFAULT_LIMIT = 10
HARD_FILTER_KEYS = {
    "precio_max", "precio_min", "recamaras_min", "banos_min",
    "m2_min", "m2_max", "colonia", "alcaldia",
    # Genoma A4 — dimensiones que antes se perdían (GENOMA_DEMANDA_BLUEPRINT.md)
    "estacionamientos_min", "estacionamiento_independiente", "piso_min",
    "mensualidad_max", "enganche_max_pct", "meses_entrega_max",
    "tipo_credito", "descuento_min_pct", "max_unidades_edificio",
}
VALID_INTENTS = {"family", "investor", "first_home", "luxury", "boutique", "neutral"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _query_hash(text: str, audience: Optional[str], language: str, limit: int) -> str:
    raw = f"{(text or '').strip().lower()}|{audience or ''}|{language}|{limit}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ─── Parser LLM ───────────────────────────────────────────────────────────────

_PARSER_SYSTEM = (
    "Eres un parser de búsquedas inmobiliarias CDMX. Recibes un query en "
    "lenguaje natural y devuelves SOLO un JSON válido (sin texto extra, sin "
    "markdown) con exactamente 4 keys:\n"
    "1. hard_filters: dict con keys opcionales precio_max (int MXN), precio_min "
    "(int MXN), recamaras_min (int), banos_min (int), m2_min (int), m2_max (int), "
    "colonia (str lowercase), alcaldia (str lowercase), "
    "estacionamientos_min (int), estacionamiento_independiente (bool, true si pide cajones "
    "independientes/no tándem), piso_min (int, nivel del depto), mensualidad_max (int MXN/mes), "
    "enganche_max_pct (int, %), meses_entrega_max (int, si pide entrega en <N meses), "
    "tipo_credito (str: bancario|infonavit|fovissste|cofinavit|contado), "
    "descuento_min_pct (int, % de descuento que espera), "
    "max_unidades_edificio (int, si pide edificio chico/boutique de máximo N deptos). "
    "Omite keys no mencionadas.\n"
    "2. soft_criteria: list[str] de descriptors textuales cortos (ej. \"escuelas cerca\", "
    "\"zona tranquila\", \"cerca metro\", \"vista\", \"amenidades premium\").\n"
    "3. negative_criteria: list[str] de exclusiones (ej. \"no avenida ruidosa\", "
    "\"sin alberca\", \"no planta baja\").\n"
    "4. buyer_intent: uno de [family, investor, first_home, luxury, boutique, neutral].\n"
    "Convierte montos textuales como \"8M\" → 8000000, \"500k\" → 500000. "
    "Para colonia/alcaldia normaliza a lowercase sin acentos. "
    "Si el query es ambiguo, devuelve filters vacíos y buyer_intent=neutral."
)


async def parse_query(text: str, language: str = "es-MX") -> Dict[str, Any]:
    """Llama Claude Sonnet via emergentintegrations.LlmChat · fail-soft."""
    fallback = {
        "hard_filters": {}, "soft_criteria": [], "negative_criteria": [],
        "buyer_intent": "neutral",
    }
    if not text or not text.strip():
        return fallback

    try:
        from llm_client import LlmChat, UserMessage as LlmUserMsg
    except Exception as e:  # noqa: BLE001
        log.warning(f"[reverse_search] emergentintegrations import failed: {e}")
        return fallback

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return fallback

    session_id = f"reverse_search_{uuid.uuid4().hex[:12]}"
    try:
        from llm_safety import sanitize_user_input  # SEGURIDAD: cap + anti prompt-injection en el 2º LLM
        safe_text = sanitize_user_input((text or "").strip(), max_len=500)
    except Exception:  # noqa: BLE001
        safe_text = (text or "").strip()[:500]
    user_prompt = f"Query ({language}):\n{safe_text}\n\nDevuelve solo el JSON."

    try:
        chat = (
            LlmChat(api_key=api_key, session_id=session_id, system_message=_PARSER_SYSTEM)
            .with_model("anthropic", LLM_MODEL)
            .with_max_tokens(800)
        )
        resp = await chat.send_message(LlmUserMsg(text=user_prompt))
        raw = str(resp) if not isinstance(resp, str) else resp
    except Exception as e:  # noqa: BLE001
        log.warning(f"[reverse_search] LLM parse_query failed: {e}")
        return fallback

    # Extraer JSON (puede venir con prefijos/sufijos)
    parsed: Optional[Dict[str, Any]] = None
    try:
        parsed = json.loads(raw)
    except Exception:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception as e:  # noqa: BLE001
                log.warning(f"[reverse_search] could not parse JSON from LLM: {e}")

    if not isinstance(parsed, dict):
        return fallback

    out = dict(fallback)
    hf = parsed.get("hard_filters") or {}
    if isinstance(hf, dict):
        clean: Dict[str, Any] = {}
        for k, v in hf.items():
            if k in HARD_FILTER_KEYS and v not in (None, "", []):
                clean[k] = v
        out["hard_filters"] = clean
    sc = parsed.get("soft_criteria") or []
    if isinstance(sc, list):
        out["soft_criteria"] = [str(x)[:80] for x in sc if str(x).strip()][:8]
    nc = parsed.get("negative_criteria") or []
    if isinstance(nc, list):
        out["negative_criteria"] = [str(x)[:80] for x in nc if str(x).strip()][:6]
    bi = (parsed.get("buyer_intent") or "neutral").lower().strip()
    out["buyer_intent"] = bi if bi in VALID_INTENTS else "neutral"
    out["_tokens_in"] = len(user_prompt) // 4
    out["_tokens_out"] = len(raw) // 4
    return out


# ─── Filter + score sobre DEVELOPMENTS ────────────────────────────────────────

def _norm(s: Optional[str]) -> str:
    if not s:
        return ""
    return str(s).strip().lower()


def _matches_hard_filters(dev: Dict[str, Any], hf: Dict[str, Any]) -> Tuple[bool, int, int]:
    """Retorna (cumple_todos, num_cumplidos, num_aplicables) · usa rangos del dev."""
    applicable = 0
    matched = 0
    pf = dev.get("price_from") or 0
    pt = dev.get("price_to") or pf
    beds_rng = dev.get("bedrooms_range") or [0, 0]
    baths_rng = dev.get("bathrooms_range") or [0, 0]
    m2_rng = dev.get("m2_range") or [0, 0]
    col = _norm(dev.get("colonia_id")) or _norm(dev.get("colonia"))
    alc = _norm(dev.get("alcaldia"))

    if "precio_max" in hf:
        applicable += 1
        try:
            if pf <= float(hf["precio_max"]):
                matched += 1
        except Exception:
            applicable -= 1
    if "precio_min" in hf:
        applicable += 1
        try:
            if pt >= float(hf["precio_min"]):
                matched += 1
        except Exception:
            applicable -= 1
    if "recamaras_min" in hf:
        applicable += 1
        try:
            if (beds_rng[1] if len(beds_rng) == 2 else 0) >= int(hf["recamaras_min"]):
                matched += 1
        except Exception:
            applicable -= 1
    if "banos_min" in hf:
        applicable += 1
        try:
            if (baths_rng[1] if len(baths_rng) == 2 else 0) >= int(hf["banos_min"]):
                matched += 1
        except Exception:
            applicable -= 1
    if "m2_min" in hf:
        applicable += 1
        try:
            if (m2_rng[1] if len(m2_rng) == 2 else 0) >= float(hf["m2_min"]):
                matched += 1
        except Exception:
            applicable -= 1
    if "m2_max" in hf:
        applicable += 1
        try:
            if (m2_rng[0] if len(m2_rng) == 2 else 0) <= float(hf["m2_max"]):
                matched += 1
        except Exception:
            applicable -= 1
    if "colonia" in hf:
        applicable += 1
        target = _norm(hf["colonia"]) if isinstance(hf["colonia"], str) else ""
        if target and (target in col or target in _norm(dev.get("colonia"))):
            matched += 1
    if "alcaldia" in hf:
        applicable += 1
        target = _norm(hf["alcaldia"]) if isinstance(hf["alcaldia"], str) else ""
        if target and target in alc:
            matched += 1

    return (matched == applicable and applicable > 0, matched, applicable)


async def _zone_ie_score(db, zone_slug: str) -> Optional[float]:
    """Promedio simple de ie_scores del zone (None si no hay)."""
    if not zone_slug or db is None:
        return None
    try:
        cur = db.ie_scores.find(
            {"zone_id": zone_slug},
            {"_id": 0, "value": 1},
        ).limit(20)
        vals: List[float] = []
        async for row in cur:
            v = row.get("value")
            if isinstance(v, (int, float)):
                vals.append(float(v))
        if not vals:
            return None
        return sum(vals) / len(vals)
    except Exception as e:  # noqa: BLE001
        log.debug(f"[reverse_search] zone_ie_score fail {zone_slug}: {e}")
        return None


def _apply_intent_bonus(score: float, intent: str, dev: Dict[str, Any], zone_score: Optional[float]) -> Tuple[float, List[str]]:
    """Aplica bonuses/penalties según buyer_intent. Retorna (nuevo_score, reasons)."""
    reasons: List[str] = []
    if intent == "family" and zone_score is not None and zone_score >= 70:
        score += 8
        reasons.append(f"zona IE {zone_score:.0f}/100 favorable para familia")
    if intent == "luxury":
        pf = dev.get("price_from") or 0
        if pf >= 15_000_000:
            score += 6
            reasons.append("rango premium ≥ $15M")
    if intent == "first_home":
        pf = dev.get("price_from") or 0
        if pf <= 5_000_000:
            score += 6
            reasons.append("rango asequible ≤ $5M")
    if intent == "investor":
        # heurística: stage preventa/en construcción suele tener DRPI más alto
        stage = _norm(dev.get("stage"))
        if "preventa" in stage or "construc" in stage:
            score += 4
            reasons.append("stage preventa con upside")
    return score, reasons


def _soft_negative_score(dev: Dict[str, Any], soft: List[str], neg: List[str]) -> Tuple[float, List[str], List[str]]:
    """Match soft (+) / negative (-) sobre name + description + amenidades."""
    blob = " ".join([
        _norm(dev.get("name")), _norm(dev.get("description")),
        _norm(dev.get("colonia")), _norm(dev.get("alcaldia")),
        " ".join(_norm(a) for a in (dev.get("amenities") or [])),
    ])
    soft_hits: List[str] = []
    neg_hits: List[str] = []
    bonus = 0.0
    for s in soft:
        keys = [t for t in re.findall(r"\w+", _norm(s)) if len(t) >= 4]
        if any(k in blob for k in keys):
            bonus += 4
            soft_hits.append(s)
    for n in neg:
        keys = [t for t in re.findall(r"\w+", _norm(n)) if len(t) >= 4]
        if any(k in blob for k in keys):
            bonus -= 12
            neg_hits.append(n)
    return bonus, soft_hits, neg_hits


async def search(
    db,
    parsed: Dict[str, Any],
    limit: int = DEFAULT_LIMIT,
    original_text: str = "",
    language: str = "es-MX",
) -> List[Dict[str, Any]]:
    """Filtra DEVELOPMENTS aplicando parsed.hard_filters + bonuses + soft/neg."""
    try:
        from data_developments import DEVELOPMENTS
    except Exception as e:  # noqa: BLE001
        log.warning(f"[reverse_search] DEVELOPMENTS import failed: {e}")
        return []

    hf = parsed.get("hard_filters") or {}
    soft = parsed.get("soft_criteria") or []
    neg = parsed.get("negative_criteria") or []
    intent = parsed.get("buyer_intent") or "neutral"

    # Pre-fetch zone IE scores únicos (cache local del request)
    zone_cache: Dict[str, Optional[float]] = {}

    scored: List[Tuple[float, Dict[str, Any]]] = []
    over_fetch = max(limit * 3, 30)

    for dev in DEVELOPMENTS:
        _, matched, applicable = _matches_hard_filters(dev, hf)
        # Si hay hard filters definidos y NO se cumplió ninguno → descartar
        if applicable > 0 and matched == 0:
            continue

        # Score base: % de hard filters cumplidos (50 puntos) + 50 floor neutral
        base = 50.0 + (50.0 * matched / max(applicable, 1)) if applicable > 0 else 60.0

        # Bonus intent (necesita zone_score si family)
        zone_slug = dev.get("colonia_id") or ""
        if intent == "family" and zone_slug and zone_slug not in zone_cache:
            zone_cache[zone_slug] = await _zone_ie_score(db, zone_slug)
        zone_score = zone_cache.get(zone_slug)
        base, intent_reasons = _apply_intent_bonus(base, intent, dev, zone_score)

        # Bonus soft / penalty negative
        sn_delta, soft_hits, neg_hits = _soft_negative_score(dev, soft, neg)
        base += sn_delta

        # Cap 0-100
        match_score = max(0.0, min(100.0, base))

        scored.append((match_score, {
            "dev": dev,
            "matched": matched,
            "applicable": applicable,
            "intent_reasons": intent_reasons,
            "soft_hits": soft_hits,
            "neg_hits": neg_hits,
            "zone_score": zone_score,
        }))

        if len(scored) >= over_fetch * 2:  # cap exploración
            break

    if not scored:
        return []

    # Re-rank semántico (RAG) si disponible · top over_fetch
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:over_fetch]
    top = await _rerank_semantic(db, top, original_text)

    # Tomar limit final y construir response
    final = top[:limit]
    items: List[Dict[str, Any]] = []
    for score, payload in final:
        dev = payload["dev"]
        explanation = _explain_match(dev, hf, payload, parsed, score)
        items.append({
            "entity_id": dev.get("id"),
            "scope": "development",
            "title": dev.get("name") or dev.get("id"),
            "colonia": dev.get("colonia"),
            "alcaldia": dev.get("alcaldia"),
            "price_from": dev.get("price_from"),
            "price_to": dev.get("price_to"),
            "bedrooms_range": dev.get("bedrooms_range"),
            "match_score": round(score, 1),
            "explanation": explanation["text"],
            "sources": explanation["sources"],
        })
    return items


async def _rerank_semantic(db, top: List[Tuple[float, Dict[str, Any]]], original_text: str) -> List[Tuple[float, Dict[str, Any]]]:
    """Mezcla score actual con similitud semántica (60/40). Fail-soft a entrada."""
    if not original_text or not top or db is None:
        return top
    try:
        pass  # presence-check only
    except Exception:
        return top
    try:
        from rag_engine import semantic_search
    except Exception:
        return top
    try:
        res = await semantic_search(db, original_text, top_k=20, scopes_in=["development"])
        results = (res or {}).get("results") or []
        if not results:
            return top
        # Mapa entity_id → similarity (0-1 aprox)
        sim_map: Dict[str, float] = {}
        for r in results:
            ent = r.get("entity_id")
            sim = r.get("score") or r.get("similarity") or 0
            if ent:
                try:
                    sim_map[str(ent)] = float(sim)
                except Exception:
                    pass
        if not sim_map:
            return top
        rescored: List[Tuple[float, Dict[str, Any]]] = []
        for score, payload in top:
            ent_id = str(payload["dev"].get("id") or "")
            sim = sim_map.get(ent_id, 0.0)
            new = 0.6 * score + 0.4 * (sim * 100.0)
            rescored.append((new, payload))
        rescored.sort(key=lambda x: x[0], reverse=True)
        return rescored
    except Exception as e:  # noqa: BLE001
        log.debug(f"[reverse_search] semantic rerank silent fail: {e}")
        return top


def _explain_match(dev: Dict[str, Any], hf: Dict[str, Any], payload: Dict[str, Any], parsed: Dict[str, Any], score: float) -> Dict[str, Any]:
    """Construye explicación 1-2 líneas + sources."""
    matched = payload.get("matched", 0)
    applicable = payload.get("applicable", 0)
    soft_hits = payload.get("soft_hits") or []
    neg_hits = payload.get("neg_hits") or []
    intent_reasons = payload.get("intent_reasons") or []
    zone_score = payload.get("zone_score")

    parts: List[str] = []
    title = dev.get("name") or dev.get("id")
    if applicable > 0:
        parts.append(f"{title} cumple {matched}/{applicable} criterios duros")
    else:
        parts.append(f"{title} sin filtros estrictos · match libre")

    if intent_reasons:
        parts.append("· ".join(intent_reasons))
    if soft_hits:
        parts.append("encaja en: " + ", ".join(soft_hits[:3]))
    if neg_hits:
        parts.append("(⚠ menciona: " + ", ".join(neg_hits[:2]) + ")")

    # Missing hard filters
    missing: List[str] = []
    if "precio_max" in hf and (dev.get("price_from") or 0) > float(hf["precio_max"]):
        missing.append("precio")
    if "recamaras_min" in hf:
        rng = dev.get("bedrooms_range") or [0, 0]
        if len(rng) == 2 and rng[1] < int(hf["recamaras_min"]):
            missing.append("recámaras")
    if missing:
        parts.append("le falta: " + ", ".join(missing))

    sources: List[Dict[str, Any]] = [{"label": "data_developments", "tier": "seed"}]
    if zone_score is not None:
        sources.append({"label": "ie_scores", "zone_score": round(zone_score, 1), "tier": "internal"})

    return {"text": " · ".join(parts), "sources": sources}


# ─── Cache ────────────────────────────────────────────────────────────────────

async def _cache_get(db, query_hash: str) -> Optional[Dict[str, Any]]:
    if db is None:
        return None
    try:
        doc = await db[COLLECTION].find_one({"query_hash": query_hash}, {"_id": 0})
        if not doc:
            return None
        ttl = doc.get("ttl_until")
        if isinstance(ttl, datetime) and ttl < _now():
            return None
        return doc
    except Exception as e:  # noqa: BLE001
        log.debug(f"[reverse_search] cache_get fail: {e}")
        return None


async def _cache_put(db, query_hash: str, query_text: str, audience: Optional[str], language: str, limit: int, parsed: Dict[str, Any], results: List[Dict[str, Any]]) -> None:
    if db is None:
        return
    try:
        now = _now()
        doc = {
            "query_hash": query_hash,
            "query_text": query_text,
            "audience": audience,
            "language": language,
            "limit": limit,
            "parsed": {k: v for k, v in parsed.items() if not k.startswith("_")},
            "results": results,
            "generated_at": now,
            "ttl_until": now + timedelta(seconds=CACHE_TTL_SECONDS),
        }
        await db[COLLECTION].update_one(
            {"query_hash": query_hash}, {"$set": doc}, upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        log.debug(f"[reverse_search] cache_put fail: {e}")


async def ensure_indexes(db) -> None:
    """Indexes para reverse_search_cache · query_hash unique + TTL + generated_at."""
    if db is None:
        return
    try:
        await db[COLLECTION].create_index("query_hash", unique=True, name="rs_query_hash_uniq")
        await db[COLLECTION].create_index("generated_at", name="rs_generated_at")
        # TTL nativo sobre ttl_until · expira docs cuando ttl_until pasa
        await db[COLLECTION].create_index(
            "ttl_until", name="rs_ttl", expireAfterSeconds=0,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[reverse_search] ensure_indexes failed: {e}")


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def generate(
    db,
    text: str,
    audience: Optional[str] = None,
    language: str = "es-MX",
    limit: int = DEFAULT_LIMIT,
    force_refresh: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Pipeline completo · cache → parse → search → rerank (en search) → cache → audit/budget."""
    started = time.time()
    text = (text or "").strip()
    if not text:
        return {
            "parsed": {"hard_filters": {}, "soft_criteria": [], "negative_criteria": [], "buyer_intent": "neutral"},
            "results": [],
            "cached": False,
            "generated_at": _now().isoformat(),
            "ms_elapsed": 0,
            "ok": False,
            "reason": "empty_text",
        }

    limit = max(1, min(int(limit or DEFAULT_LIMIT), 20))
    qhash = _query_hash(text, audience, language, limit)

    if not force_refresh:
        hit = await _cache_get(db, qhash)
        if hit:
            return {
                "parsed": hit.get("parsed", {}),
                "results": hit.get("results", []),
                "cached": True,
                "generated_at": hit["generated_at"].isoformat() if isinstance(hit.get("generated_at"), datetime) else hit.get("generated_at"),
                "ms_elapsed": int((time.time() - started) * 1000),
                "ok": True,
            }

    # Si audience override viene del caller, sobreescribe buyer_intent del parser
    parsed = await parse_query(text, language=language)
    if audience and audience in VALID_INTENTS:
        parsed["buyer_intent"] = audience

    results = await search(db, parsed, limit=limit, original_text=text, language=language)
    await _cache_put(db, qhash, text, audience, language, limit, parsed, results)

    # Audit (fail-soft)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "anon", "role": "public"},
            action="reverse_search_executed",
            entity_type="reverse_search",
            entity_id=qhash[:16],
            before=None,
            after={"text": text[:200], "results_count": len(results), "audience": audience},
        )
    except Exception:
        pass

    # Budget tracking si hubo LLM call (tokens estimados en parsed)
    try:
        t_in = int(parsed.get("_tokens_in") or 0)
        t_out = int(parsed.get("_tokens_out") or 0)
        if t_in or t_out:
            from ai_budget import track_ai_call
            await track_ai_call(
                db,
                dev_org_id=user_id or "public_anon",
                model=LLM_MODEL,
                tokens=t_in + t_out,
                call_type="reverse_search",
                tokens_in=t_in,
                tokens_out=t_out,
                feature_key="reverse_search",
            )
    except Exception:
        pass

    clean_parsed = {k: v for k, v in parsed.items() if not k.startswith("_")}
    return {
        "parsed": clean_parsed,
        "results": results,
        "cached": False,
        "generated_at": _now().isoformat(),
        "ms_elapsed": int((time.time() - started) * 1000),
        "ok": True,
    }
