"""W5.x F11 · Fit Engine — compatibility score 0-100 entre lead específico y propiedad.

6 dimensiones ponderadas:
  presupuesto   0.30
  audience      0.25
  busquedas     0.15
  comportamiento 0.15
  ubicacion     0.10
  especificas   0.05

Cache 30min en collection `fit_cache` por sha256(lead_id+property_id).
Confidence baja si <5 interacciones del lead.
NO usa LLM · scoring puro heurístico · fail-soft por fuente.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.fit")

COLLECTION = "fit_cache"
CACHE_TTL_SECONDS = 30 * 60  # 30 min

# ── W5 Cleanup · Cross-batch fail-soft imports ───────────────────────────────
try:
    from buyer_score_engine import compute_user_score as _bs_compute_user_score
    BUYER_SCORE_AVAILABLE = True
except Exception:
    BUYER_SCORE_AVAILABLE = False
    _bs_compute_user_score = None  # type: ignore

try:
    from zone_score_engine import get_zone_with_subscores as _zs_get_zone_with_subscores
    ZONE_SUBSCORES_AVAILABLE = True
except Exception:
    ZONE_SUBSCORES_AVAILABLE = False
    _zs_get_zone_with_subscores = None  # type: ignore

VALID_AUDIENCES = {"family", "investor", "first_home", "luxury", "boutique", "neutral"}

# Audience match matrix · matriz simétrica · diagonal 100 · vecinos lógicos altos
_AUDIENCE_MATCH = {
    ("family", "family"): 100,
    ("family", "first_home"): 70,
    ("family", "boutique"): 50,
    ("family", "luxury"): 30,
    ("family", "investor"): 20,
    ("first_home", "first_home"): 100,
    ("first_home", "family"): 70,
    ("first_home", "boutique"): 60,
    ("first_home", "luxury"): 20,
    ("first_home", "investor"): 30,
    ("luxury", "luxury"): 100,
    ("luxury", "boutique"): 70,
    ("luxury", "investor"): 50,
    ("luxury", "family"): 30,
    ("luxury", "first_home"): 20,
    ("boutique", "boutique"): 100,
    ("boutique", "luxury"): 70,
    ("boutique", "family"): 50,
    ("boutique", "first_home"): 60,
    ("boutique", "investor"): 40,
    ("investor", "investor"): 100,
    ("investor", "luxury"): 50,
    ("investor", "family"): 20,
    ("investor", "first_home"): 30,
    ("investor", "boutique"): 40,
}

_WEIGHTS = {
    "presupuesto": 0.30,
    "audience": 0.25,
    "busquedas": 0.15,
    "comportamiento": 0.15,
    "ubicacion": 0.10,
    "especificas": 0.05,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fit_key(lead_id: str, property_id: str) -> str:
    return hashlib.sha256(f"{lead_id}|{property_id}".encode()).hexdigest()


# ─── Aggregate lead signals ──────────────────────────────────────────────────

async def _aggregate_lead_signals(db, lead_id: str) -> Dict[str, Any]:
    """Junta señales del lead de 4 sources · FAIL-SOFT por source.

    Retorna dict con:
      audience · budget_max · prices_searched · colonias_searched · audiences_inferred
      recamaras_searched · properties_viewed · properties_compared
      scroll_max · time_total · exit_intent_count · interactions_count
      visitor_session_id · property_id_interest
    """
    out: Dict[str, Any] = {
        "audience": None,
        "budget_max": None,
        "prices_searched": [],
        "colonias_searched": [],
        "audiences_inferred": [],
        "recamaras_searched": [],
        "properties_viewed": [],
        "properties_compared": [],
        "scroll_max": 0,
        "time_total": 0,
        "exit_intent_count": 0,
        "interactions_count": 0,
        "visitor_session_id": None,
        "property_id_interest": None,
    }
    if db is None or not lead_id:
        return out

    # 1) lead_captures
    visitor_sid: Optional[str] = None
    try:
        lc = await db.lead_captures.find_one({"lead_id": lead_id}, {"_id": 0})
        if lc:
            out["audience"] = (lc.get("audience") or "").lower() or None
            out["visitor_session_id"] = lc.get("visitor_session_id")
            visitor_sid = out["visitor_session_id"]
            out["property_id_interest"] = lc.get("property_id")
            out["interactions_count"] += 1
    except Exception as e:
        log.debug(f"[fit] lead_captures fail: {e}")

    # 2) reverse_search_cache · scopear best-effort por audiences/parsed prices
    #    NO tiene session_id directo · leemos eventos del session_id para inferir
    try:
        if visitor_sid:
            # lead_capture_events del session traen suggested_audience histórico
            async for ev in db.lead_capture_events.find(
                {"visitor_session_id": visitor_sid},
                {"_id": 0},
            ):
                sa = (ev.get("suggested_audience") or "").lower()
                if sa and sa != "neutral":
                    out["audiences_inferred"].append(sa)
                out["scroll_max"] = max(int(out["scroll_max"]),
                                          int(ev.get("scroll_depth_pct") or 0))
                out["time_total"] += int(ev.get("time_on_page_sec") or 0)
                if ev.get("exit_intent_triggered"):
                    out["exit_intent_count"] += 1
                out["interactions_count"] += 1
    except Exception as e:
        log.debug(f"[fit] lead_capture_events fail: {e}")

    # 3) behavioral_events · property views (page_view con metadata.property_id)
    try:
        if visitor_sid:
            async for ev in db.behavioral_events.find(
                {"session_id": visitor_sid},
                {"_id": 0},
            ):
                meta = ev.get("metadata") or {}
                pid = meta.get("property_id") or meta.get("entity_id")
                if pid and ev.get("event_type") == "page_view":
                    out["properties_viewed"].append(pid)
                    out["interactions_count"] += 1
    except Exception as e:
        log.debug(f"[fit] behavioral_events fail: {e}")

    # 4) reverse_search_cache · prices_searched, colonias, recamaras (cache global ·
    #    intersectar con audience del lead como proxy débil)
    try:
        if out["audience"]:
            async for rs in db.reverse_search_cache.find(
                {"audience": out["audience"]},
                {"_id": 0, "parsed": 1},
            ):
                parsed = rs.get("parsed") or {}
                hf = parsed.get("hard_filters") or {}
                pmax = hf.get("price_max")
                if isinstance(pmax, (int, float)) and pmax > 0:
                    out["prices_searched"].append(float(pmax))
                col = hf.get("colonia") or hf.get("zone") or hf.get("colonia_slug")
                if isinstance(col, str) and col.strip():
                    out["colonias_searched"].append(col.lower().strip())
                rec = hf.get("recamaras") or hf.get("bedrooms")
                if isinstance(rec, (int, float)):
                    out["recamaras_searched"].append(int(rec))
                out["interactions_count"] += 1
    except Exception as e:
        log.debug(f"[fit] reverse_search_cache fail: {e}")

    # 5) comparison_cache · properties_compared del lead/session
    try:
        if visitor_sid:
            async for cmp in db.comparison_cache.find(
                {},
                {"_id": 0, "entity_ids": 1, "audience": 1},
            ):
                ids = cmp.get("entity_ids") or []
                if out.get("property_id_interest") and out["property_id_interest"] in ids:
                    out["properties_compared"].extend(ids)
                    out["interactions_count"] += 1
    except Exception as e:
        log.debug(f"[fit] comparison_cache fail: {e}")

    # Compute budget_max
    if out["prices_searched"]:
        out["budget_max"] = max(out["prices_searched"])

    return out


# ─── Property meta ───────────────────────────────────────────────────────────

def _infer_property_audience(prop: Dict[str, Any]) -> str:
    """Heurística simple para inferir audience_target de un desarrollo."""
    name = (prop.get("name") or "").lower()
    colonia = (prop.get("colonia") or prop.get("colonia_id") or "").lower()
    desc = (prop.get("description") or "").lower()
    price_from = float(prop.get("price_from") or 0)
    bedrooms_range = prop.get("bedrooms_range") or [0, 0]
    max_beds = max(bedrooms_range) if isinstance(bedrooms_range, list) and bedrooms_range else 0

    luxury_zones = {"polanco", "lomas-chapultepec", "pedregal", "lomas", "santa-fe"}
    boutique_kw = {"boutique", "brutalist", "loft", "estudio", "atelier"}
    if price_from >= 15_000_000 or colonia in luxury_zones or "luxury" in name:
        return "luxury"
    if any(k in name or k in desc for k in boutique_kw):
        return "boutique"
    if max_beds >= 3 and price_from < 8_000_000:
        return "family"
    if price_from < 5_000_000:
        return "first_home"
    if max_beds <= 2 and price_from < 9_000_000:
        return "investor"
    return "neutral"


async def _fetch_property_meta(db, property_id: str) -> Optional[Dict[str, Any]]:
    """Retorna dict {price_from, price_max, recamaras, m2, colonia, alcaldia, audience_target, name}
    o None si no existe."""
    if not property_id:
        return None
    dev: Optional[Dict[str, Any]] = None
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(property_id)
    except Exception:
        dev = None
    if dev is None and db is not None:
        try:
            dev = await db.developments.find_one(
                {"$or": [{"id": property_id}, {"_id": property_id}, {"slug": property_id}]},
                {"_id": 0},
            )
        except Exception as e:
            log.debug(f"[fit] developments find fail: {e}")
    if not dev:
        return None

    beds_range = dev.get("bedrooms_range") or [0, 0]
    m2_range = dev.get("m2_range") or [0, 0]
    return {
        "id": dev.get("id") or dev.get("slug"),
        "name": dev.get("name") or dev.get("slug"),
        "price_from": float(dev.get("price_from") or 0),
        "price_max": float(dev.get("price_to") or dev.get("price_from") or 0),
        "recamaras_min": int(min(beds_range) if isinstance(beds_range, list) and beds_range else 0),
        "recamaras_max": int(max(beds_range) if isinstance(beds_range, list) and beds_range else 0),
        "m2_min": float(min(m2_range) if isinstance(m2_range, list) and m2_range else 0),
        "m2_max": float(max(m2_range) if isinstance(m2_range, list) and m2_range else 0),
        "colonia": (dev.get("colonia") or dev.get("colonia_id") or "").lower(),
        "colonia_id": (dev.get("colonia_id") or "").lower(),
        "alcaldia": (dev.get("alcaldia") or "").lower(),
        "audience_target": _infer_property_audience(dev),
        "photo_url": (dev.get("photos") or [None])[0] if isinstance(dev.get("photos"), list) else None,
    }


# ─── Scoring por dimensión ───────────────────────────────────────────────────

def _score_presupuesto(lead_signals: Dict[str, Any], prop: Dict[str, Any]) -> int:
    budget = lead_signals.get("budget_max")
    price_from = prop.get("price_from") or 0
    if not budget or price_from <= 0:
        return 50  # neutral
    if price_from <= budget:
        return 100
    if price_from <= budget * 1.2:
        # escala 100 → 60 linear sobre rango [budget, budget*1.2]
        ratio = (price_from - budget) / (budget * 0.2)
        return int(max(60, 100 - 40 * ratio))
    if price_from <= budget * 1.5:
        # 60 → 20 sobre [budget*1.2, budget*1.5]
        ratio = (price_from - budget * 1.2) / (budget * 0.3)
        return int(max(20, 60 - 40 * ratio))
    return 20


def _score_audience(lead_signals: Dict[str, Any], prop: Dict[str, Any]) -> int:
    lead_aud = lead_signals.get("audience")
    if not lead_aud:
        # fallback: most common from audiences_inferred
        inf = lead_signals.get("audiences_inferred") or []
        if inf:
            from collections import Counter
            lead_aud = Counter(inf).most_common(1)[0][0]
    lead_aud = (lead_aud or "neutral").lower()
    if lead_aud not in VALID_AUDIENCES:
        lead_aud = "neutral"
    prop_aud = (prop.get("audience_target") or "neutral").lower()
    if prop_aud not in VALID_AUDIENCES:
        prop_aud = "neutral"

    if lead_aud == "neutral" and prop_aud == "neutral":
        return 70
    if lead_aud == "neutral" or prop_aud == "neutral":
        # match contra audience definido: parcial
        return 80 if (lead_aud == prop_aud) else 60
    return int(_AUDIENCE_MATCH.get((lead_aud, prop_aud), 40))


def _score_busquedas(lead_signals: Dict[str, Any], prop: Dict[str, Any]) -> int:
    colonias = [c for c in (lead_signals.get("colonias_searched") or []) if c]
    recamaras = lead_signals.get("recamaras_searched") or []
    prices = lead_signals.get("prices_searched") or []
    if not (colonias or recamaras or prices):
        return 40
    score = 0
    prop_col = (prop.get("colonia_id") or prop.get("colonia") or "").lower()
    if prop_col and any(prop_col == c or prop_col in c or c in prop_col for c in colonias):
        score += 50
    rmin = prop.get("recamaras_min") or 0
    rmax = prop.get("recamaras_max") or 0
    if recamaras:
        for r in recamaras:
            if rmin - 1 <= r <= rmax + 1:
                score += 30
                break
    pf = prop.get("price_from") or 0
    if prices and pf > 0:
        for p in prices:
            if 0.85 * p <= pf <= 1.15 * p:
                score += 20
                break
    return min(100, score)


def _score_comportamiento(lead_signals: Dict[str, Any], prop: Dict[str, Any]) -> int:
    pid = prop.get("id")
    if not pid:
        return 30
    score = 0
    viewed = lead_signals.get("properties_viewed") or []
    compared = lead_signals.get("properties_compared") or []
    if pid in viewed:
        score = max(score, 100)
    if pid in compared:
        score = max(score, 90)
    if int(lead_signals.get("scroll_max") or 0) > 70:
        score = max(score, 80)
    if int(lead_signals.get("time_total") or 0) > 300:
        score = min(100, score + 20)
    return score if score > 0 else 30


def _score_ubicacion(lead_signals: Dict[str, Any], prop: Dict[str, Any]) -> int:
    prop_col = (prop.get("colonia_id") or prop.get("colonia") or "").lower()
    prop_alc = (prop.get("alcaldia") or "").lower()
    viewed = lead_signals.get("properties_viewed") or []
    if not prop_col:
        return 50
    # Si lead navegó propiedades en property.colonia >2 veces · 100
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        same_col_views = 0
        for v_pid in viewed:
            v = DEVELOPMENTS_BY_ID.get(v_pid)
            if not v:
                continue
            if (v.get("colonia_id") or "").lower() == prop_col:
                same_col_views += 1
        if same_col_views >= 2:
            return 100
        # alcaldía similar
        if prop_alc:
            for v_pid in viewed:
                v = DEVELOPMENTS_BY_ID.get(v_pid)
                if v and (v.get("alcaldia") or "").lower() == prop_alc:
                    return 70
    except Exception:
        pass
    return 50


def _score_especificas(lead_signals: Dict[str, Any], prop: Dict[str, Any]) -> int:
    recamaras = lead_signals.get("recamaras_searched") or []
    if not recamaras:
        return 50
    rmin = prop.get("recamaras_min") or 0
    rmax = prop.get("recamaras_max") or 0
    best_match = max((1 if rmin <= r <= rmax else (0 if abs(r - rmin) > 1 and abs(r - rmax) > 1 else 0.5)
                       for r in recamaras), default=0)
    if best_match == 1:
        return 100
    if best_match == 0.5:
        return 70
    return 50


def _compute_overall(scores: Dict[str, int]) -> int:
    total = 0.0
    for k, w in _WEIGHTS.items():
        total += float(scores.get(k, 0)) * w
    return int(min(100, max(0, round(total))))


def _determine_confidence(interactions_count: int) -> str:
    n = int(interactions_count or 0)
    if n < 5:
        return "tentativa"
    if n < 10:
        return "baja"
    if n < 20:
        return "media"
    return "alta"


_DIM_PHRASES = {
    "presupuesto": {
        100: "Encaja perfecto en su presupuesto",
        70: "Está dentro de su rango de presupuesto",
        40: "Apenas dentro de su presupuesto",
        20: "Por encima de su presupuesto declarado",
    },
    "audience": {
        100: "Coincide con su perfil de comprador",
        70: "Perfil parcialmente compatible",
        40: "Perfil de comprador distinto",
        20: "Perfil de comprador opuesto",
    },
    "busquedas": {
        100: "Ha buscado activamente esta zona y características",
        70: "Sus búsquedas coinciden en zona o recámaras",
        40: "Búsquedas con poca coincidencia",
        20: "No ha buscado nada similar",
    },
    "comportamiento": {
        100: "Vio esta propiedad varias veces",
        90: "Comparó esta propiedad con otras",
        80: "Mostró alta atención (scroll/tiempo)",
        40: "Engagement bajo en navegación",
    },
    "ubicacion": {
        100: "Ha explorado esta colonia repetidamente",
        70: "Ha visto otras propiedades en la misma alcaldía",
        50: "Sin patrón claro de ubicación",
    },
    "especificas": {
        100: "Recámaras match exacto",
        70: "Recámaras cercanas a lo buscado",
        50: "Sin datos de recámaras buscadas",
    },
}


def _phrase_for(dim: str, score: int) -> str:
    table = _DIM_PHRASES.get(dim) or {}
    # pick closest tier <= score
    best = None
    for tier in sorted(table.keys(), reverse=True):
        if score >= tier:
            best = tier
            break
    if best is None and table:
        best = min(table.keys())
    return table.get(best, dim) if best is not None else dim


def _build_explanation_and_reasons(
    scores: Dict[str, int],
    overall: int,
    prop: Dict[str, Any],
) -> Tuple[str, List[str]]:
    name = prop.get("name") or prop.get("id") or "esta propiedad"
    if overall >= 70:
        qual = "bien"
    elif overall >= 45:
        qual = "regular"
    else:
        qual = "poco"
    # Top dimension
    sorted_dims = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_dim, top_score = sorted_dims[0] if sorted_dims else ("audience", 0)
    explanation = f"Este lead encaja {qual} con {name} por {top_dim}"[:140]

    reasons: List[str] = []
    for dim, sc in sorted_dims[:3]:
        reasons.append(_phrase_for(dim, sc))

    # bottom dimension si <40
    bottom_dim, bottom_score = sorted_dims[-1] if sorted_dims else ("", 100)
    if bottom_score < 40 and bottom_dim:
        reasons.append(f"Pero falta {bottom_dim}")

    return explanation, reasons


# ─── Public API ──────────────────────────────────────────────────────────────

async def compute_fit_score(
    db,
    lead_id: str,
    property_id: str,
    force_refresh: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Calcula fit_score (0-100) entre lead y propiedad. Cache 30min."""
    if not lead_id or not property_id:
        return {"ok": False, "reason": "missing_params"}

    fit_key = _fit_key(lead_id, property_id)
    now = _now()

    # Cache check
    if db is not None and not force_refresh:
        try:
            cached = await db[COLLECTION].find_one({"fit_key": fit_key}, {"_id": 0})
            if cached and cached.get("ttl_until"):
                ttl = cached.get("ttl_until")
                if isinstance(ttl, datetime) and ttl > now:
                    cached["cached"] = True
                    return {"ok": True, **cached}
        except Exception as e:
            log.debug(f"[fit] cache read fail: {e}")

    # Property meta
    prop = await _fetch_property_meta(db, property_id)
    if prop is None:
        return {"ok": False, "reason": "property_not_found"}

    # Lead signals
    lead_signals = await _aggregate_lead_signals(db, lead_id)

    # ── W5 Cleanup · Cross-batch enrichment (fail-soft) ──────────────────────
    buyer_tier: Optional[str] = None
    buyer_score_value: Optional[float] = None
    buyer_score_adjustment = 0
    if BUYER_SCORE_AVAILABLE and lead_id:
        try:
            # Prefer persisted; else compute
            persisted = None
            if db is not None:
                try:
                    persisted = await db.buyer_scores.find_one(
                        {"$or": [{"user_id": lead_id}, {"lead_id": lead_id}]},
                        {"_id": 0, "score": 1, "tier": 1},
                    )
                except Exception:
                    persisted = None
            if persisted and persisted.get("tier"):
                buyer_tier = persisted.get("tier")
                buyer_score_value = persisted.get("score")
            else:
                bs = await _bs_compute_user_score(db, lead_id)  # type: ignore
                if isinstance(bs, dict):
                    buyer_tier = bs.get("tier")
                    buyer_score_value = bs.get("score")
            if buyer_tier == "hot":
                buyer_score_adjustment = 10
            elif buyer_tier == "cold":
                buyer_score_adjustment = -10
        except Exception as exc:
            log.debug(f"[fit] buyer_score enrichment failed: {exc}")

    zone_subscores: Dict[str, float] = {}
    subscores_boost = 0
    if ZONE_SUBSCORES_AVAILABLE:
        try:
            zone_slug = (prop.get("colonia_id") or prop.get("colonia") or "").lower()
            if zone_slug:
                zs = await _zs_get_zone_with_subscores(db, zone_slug)  # type: ignore
                if isinstance(zs, dict):
                    raw_subs = zs.get("subscores") or {}
                    for k, v in raw_subs.items():
                        try:
                            val = v.get("value") if isinstance(v, dict) else v
                            if val is not None:
                                zone_subscores[k] = float(val)
                        except (TypeError, ValueError):
                            pass
            # High subscore bonus
            high_dims = ("walkability", "safety", "dining", "lifestyle", "seguridad", "amenidades")
            for dim in high_dims:
                if zone_subscores.get(dim, 0) >= 80:
                    subscores_boost = max(subscores_boost, 8)
                    break

            # Audience weighting hints
            lead_aud = (lead_signals.get("audience") or "").lower()
            if lead_aud == "family":
                family_dims = ("schools", "safety", "seguridad", "family_friendly")
                if any(zone_subscores.get(d, 0) >= 75 for d in family_dims):
                    subscores_boost = min(10, subscores_boost + 3)
            elif lead_aud == "investor":
                investor_dims = ("vibrant", "dining", "lifestyle", "precio")
                if any(zone_subscores.get(d, 0) >= 75 for d in investor_dims):
                    subscores_boost = min(10, subscores_boost + 3)
        except Exception as exc:
            log.debug(f"[fit] zone_subscores enrichment failed: {exc}")

    scores = {
        "presupuesto": _score_presupuesto(lead_signals, prop),
        "audience": _score_audience(lead_signals, prop),
        "busquedas": _score_busquedas(lead_signals, prop),
        "comportamiento": _score_comportamiento(lead_signals, prop),
        "ubicacion": _score_ubicacion(lead_signals, prop),
        "especificas": _score_especificas(lead_signals, prop),
    }

    # Si lead_signals vacío → score 0 confidence tentativa
    scores_breakdown_aux: Dict[str, Any] = {
        "buyer_score_adjustment": buyer_score_adjustment,
        "buyer_tier": buyer_tier,
        "buyer_score_value": buyer_score_value,
        "subscores_boost": subscores_boost,
        "zone_subscores_used": bool(zone_subscores),
    }
    if (lead_signals.get("interactions_count") or 0) == 0:
        overall = 0
        confidence = "tentativa"
        explanation = f"Aún sin actividad suficiente para evaluar la compatibilidad con {prop.get('name')}"
        reasons: List[str] = ["Aún no hay actividad registrada"]
    else:
        overall_base = _compute_overall(scores)
        # Apply cross-batch adjustments with clamp
        overall = max(0, min(100, overall_base + buyer_score_adjustment + subscores_boost))
        confidence = _determine_confidence(lead_signals.get("interactions_count") or 0)
        explanation, reasons = _build_explanation_and_reasons(scores, overall, prop)

        # Enrich reasons with cross-batch signals
        if buyer_tier:
            reasons.append(f"Buyer score lead: {buyer_tier}")
        if zone_subscores:
            top_zone = max(zone_subscores.items(), key=lambda kv: kv[1])
            if top_zone[1] >= 80:
                reasons.append(f"Zona destaca en {top_zone[0]} {int(top_zone[1])}/100")

    import metric_normalizer as _mn
    fit_b = _mn.fit_band(overall)   # B.2 · banda honesta (palabra, no "/100")
    out = {
        "fit_key": fit_key,
        "lead_id": lead_id,
        "property_id": property_id,
        "property_title": prop.get("name"),
        "photo_url": prop.get("photo_url"),
        "score": int(overall),
        "nivel": fit_b["nivel"], "etiqueta": fit_b["etiqueta"], "color": fit_b["color"],
        "confidence": confidence,
        "breakdown": scores,
        "cross_batch_aux": scores_breakdown_aux,
        "explanation_short": explanation,
        "reasons_top_3": reasons[:3],
        "generated_at": now,
        "ttl_until": now + timedelta(seconds=CACHE_TTL_SECONDS),
        "cached": False,
    }

    # Cache
    if db is not None:
        try:
            await db[COLLECTION].update_one(
                {"fit_key": fit_key},
                {"$set": out},
                upsert=True,
            )
        except Exception as e:
            log.debug(f"[fit] cache write fail: {e}")

    # Audit (fail-soft)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "system", "role": "system"},
            action="fit_computed",
            entity_type="fit_score",
            entity_id=fit_key,
            before=None,
            after={"lead_id": lead_id, "property_id": property_id,
                   "score": int(overall), "confidence": confidence},
        )
    except Exception as e:
        log.debug(f"[fit] audit fail: {e}")

    return {"ok": True, **out}


async def top_properties_for_lead(
    db,
    lead_id: str,
    limit: int = 5,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Top N propiedades para un lead · sort desc por fit score · usa cache."""
    limit = max(1, min(int(limit or 5), 20))
    results: List[Dict[str, Any]] = []
    # Source de propiedades: DEVELOPMENTS_BY_ID in-memory (~15) + db.developments (best-effort)
    prop_ids: List[str] = []
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS[:100]:
            pid = d.get("id") or d.get("slug")
            if pid:
                prop_ids.append(pid)
    except Exception:
        pass
    if db is not None:
        try:
            async for d in db.developments.find({}, {"_id": 0, "id": 1, "slug": 1}).limit(100):
                pid = d.get("id") or d.get("slug")
                if pid and pid not in prop_ids:
                    prop_ids.append(pid)
        except Exception:
            pass

    for pid in prop_ids:
        try:
            r = await compute_fit_score(db, lead_id, pid, user_id=user_id)
            if not r.get("ok"):
                continue
            results.append({
                "property_id": pid,
                "property_title": r.get("property_title"),
                "photo_url": r.get("photo_url"),
                "score": r.get("score"),
                "confidence": r.get("confidence"),
                "top_reason": (r.get("reasons_top_3") or [""])[0],
            })
        except Exception as e:
            log.debug(f"[fit] top_properties pid={pid} fail: {e}")
    results.sort(key=lambda x: int(x.get("score") or 0), reverse=True)
    return {"lead_id": lead_id, "properties": results[:limit]}


async def top_leads_for_property(
    db,
    property_id: str,
    limit: int = 5,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Top N leads para una propiedad · status new|contacted últimos 60d · sort desc."""
    limit = max(1, min(int(limit or 5), 20))
    results: List[Dict[str, Any]] = []
    if db is None:
        return {"property_id": property_id, "leads": []}

    cutoff = _now() - timedelta(days=60)
    leads_meta: Dict[str, Dict[str, Any]] = {}
    try:
        async for lc in db.lead_captures.find(
            {"created_at": {"$gte": cutoff},
             "status": {"$in": ["new", "contacted"]}},
            {"_id": 0, "lead_id": 1, "name": 1, "whatsapp": 1},
        ).limit(200):
            lid = lc.get("lead_id")
            if lid:
                leads_meta[lid] = lc
    except Exception as e:
        log.warning(f"[fit] top_leads scan fail: {e}")

    for lid in leads_meta:
        try:
            r = await compute_fit_score(db, lid, property_id, user_id=user_id)
            if not r.get("ok"):
                continue
            lm = leads_meta[lid]
            results.append({
                "lead_id": lid,
                "lead_name": lm.get("name"),
                "lead_whatsapp": lm.get("whatsapp"),
                "score": r.get("score"),
                "confidence": r.get("confidence"),
                "top_reason": (r.get("reasons_top_3") or [""])[0],
            })
        except Exception as e:
            log.debug(f"[fit] top_leads lid={lid} fail: {e}")
    results.sort(key=lambda x: int(x.get("score") or 0), reverse=True)
    return {"property_id": property_id, "leads": results[:limit]}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Indexes idempotentes para fit_cache."""
    if db is None:
        return
    try:
        await db[COLLECTION].create_index("fit_key", unique=True, name="fit_key_uniq")
        await db[COLLECTION].create_index(
            "ttl_until", expireAfterSeconds=0, name="fit_ttl"
        )
        await db[COLLECTION].create_index("lead_id", sparse=True, name="fit_lead")
        await db[COLLECTION].create_index("property_id", sparse=True, name="fit_property")
        log.info("[fit] indexes OK")
    except Exception as e:
        log.warning(f"[fit] ensure_indexes failed: {e}")
