"""W5.x F4.2 · Comparator engine · multi-source aggregation + deltas + AI verdict.

Pone 2-3 propiedades lado a lado combinando todas las capas de inteligencia:
  - intake (AVM, IE, DRPI, risk, comparables)
  - tax (closing, predial, ISR)
  - AI verdict (narrative_layer_engine)

Cache en collection `comparison_cache` · TTL 30 min via ttl_until.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.comparator")

COLLECTION = "comparison_cache"
DEFAULT_TTL_MINUTES = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def make_comparison_key(scope: str, entity_ids: List[str], audience: str) -> str:
    ids_sorted = "|".join(sorted([str(x) for x in entity_ids if x]))
    h = hashlib.sha256(f"{scope}|{ids_sorted}|{audience}".encode()).hexdigest()[:32]
    return h


async def _safe_find(db, coll: str, query: Dict[str, Any], proj: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
    try:
        return await db[coll].find_one(query, proj or {"_id": 0})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[compare] find {coll} failed: {e}")
        return None


async def get_photo_url(db, entity_id: str, scope: str) -> Optional[str]:
    """Best-effort: foto principal de la entidad."""
    try:
        coll = "developments" if scope == "project" else "developments_units"
        doc = await db[coll].find_one({"id": entity_id}, {"_id": 0, "photos": 1, "media": 1, "cover_url": 1})
        if not doc:
            return None
        if doc.get("cover_url"):
            return doc["cover_url"]
        photos = doc.get("photos") or doc.get("media") or []
        if photos and isinstance(photos, list):
            first = photos[0]
            return first.get("url") if isinstance(first, dict) else first
        return None
    except Exception:
        return None


def _val(facts: Dict[str, Any], key: str) -> Any:
    v = facts.get(key)
    if isinstance(v, dict) and "value" in v:
        return v["value"]
    return v


async def _build_item(db, scope: str, entity_id: str, audience: str) -> Dict[str, Any]:
    """Construye un item completo · FAIL-SOFT por campo."""
    from narrative_collector import collect_for_unit, collect_for_project
    from tax_projector_engine import (
        calculate_isr_vendedor,
        calculate_closing_cost_total,
        project_predial_10y,
    )

    item: Dict[str, Any] = {"entity_id": entity_id, "scope": scope}

    try:
        facts = await (collect_for_unit(db, entity_id) if scope == "unit" else collect_for_project(db, entity_id))
    except Exception as e:  # noqa: BLE001
        log.warning(f"[compare] facts failed for {entity_id}: {e}")
        facts = {}

    if not facts:
        item["error"] = "entidad_no_encontrada"
        return item

    meta = facts.get("_meta") or {}

    # Title y photo
    coll = "developments" if scope == "project" else "developments_units"
    doc = await _safe_find(db, coll, {"id": entity_id}, {"_id": 0, "name": 1, "title": 1, "project_name": 1, "colonia": 1, "area_m2": 1, "bedrooms": 1, "bathrooms": 1, "parking": 1, "amenities": 1})
    item["title"] = (doc or {}).get("name") or (doc or {}).get("title") or (doc or {}).get("project_name") or entity_id
    item["photo_url"] = await get_photo_url(db, entity_id, scope)

    # Métricas planas
    item["price"] = _val(facts, "price") or meta.get("price_raw") or meta.get("price_from")
    item["avm_estimate"] = _val(facts, "avm_estimate")
    item["score_ie"] = _val(facts, "score_ie") or _val(facts, "score_proy")
    item["drpi_zone"] = _val(facts, "drpi_zone") or _val(facts, "drpi_12m")
    item["risk_score"] = _val(facts, "risk_score")
    item["days_on_market"] = _val(facts, "days_on_market") or _val(facts, "dom_avg")
    item["comparables_3"] = (_val(facts, "comparables_5") or [])[:3]
    item["colonia"] = meta.get("colonia") or (doc or {}).get("colonia")

    # Specs desde doc
    if doc:
        item["specs"] = {
            "area_m2": doc.get("area_m2"),
            "bedrooms": doc.get("bedrooms"),
            "bathrooms": doc.get("bathrooms"),
            "parking": doc.get("parking"),
        }
        amenities = doc.get("amenities") or []
        item["key_amenities_5"] = (amenities[:5] if isinstance(amenities, list) else [])

    # Tax block · cierre + predial siempre · ISR si investor/luxury
    precio_venta = float(item["price"] or item["avm_estimate"] or 0)
    valor_catastral = float(meta.get("valor_catastral") or (precio_venta * 0.46))
    if precio_venta > 0:
        try:
            closing = calculate_closing_cost_total(precio_venta, valor_catastral)
            if closing.get("ok"):
                item["closing_total"] = round(closing["total"], 2)
                item["isai"] = round(closing.get("isai", 0), 2)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[compare] closing failed: {e}")
            item["closing_total"] = {"error": str(e)}
        try:
            predial = project_predial_10y(valor_catastral or precio_venta)
            if predial.get("ok") and predial.get("items"):
                item["predial_y1"] = round(predial["items"][0]["predial_estimado"], 2)
                item["predial_10y_total"] = round(predial.get("total_10y", 0), 2)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[compare] predial failed: {e}")
            item["predial_y1"] = {"error": str(e)}

        if audience in ("investor", "luxury"):
            try:
                precio_compra = precio_venta * 0.55
                isr = calculate_isr_vendedor(precio_compra, "2018-01-01", precio_venta, _now().strftime("%Y-%m-%d"))
                if isr.get("ok"):
                    item["isr_estimado"] = round(isr["isr_total"], 2)
                    item["utilidad_neta"] = round(isr.get("ganancia_gravable", 0) - isr["isr_total"], 2)
                    if precio_compra > 0:
                        item["roi_neto_pct"] = round((item["utilidad_neta"] / precio_compra) * 100.0, 2)
            except Exception as e:  # noqa: BLE001
                log.warning(f"[compare] isr failed: {e}")

    return item


# ─── Sub-B · deltas + winner labels ─────────────────────────────────────────
def _safe_num(x: Any) -> Optional[float]:
    if x is None:
        return None
    if isinstance(x, dict):
        return None  # error markers
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


METRICS_LOWER_BETTER = ["price", "closing_total", "predial_y1", "risk_score", "isr_estimado", "days_on_market"]
METRICS_HIGHER_BETTER = ["score_ie", "drpi_zone", "roi_neto_pct", "avm_estimate"]
LABEL_MAP = {
    "price": "mejor_precio",
    "closing_total": "menor_cierre",
    "predial_y1": "menor_predial",
    "risk_score": "menor_riesgo",
    "isr_estimado": "menor_isr",
    "days_on_market": "mas_rapido",
    "score_ie": "mayor_ie",
    "drpi_zone": "mayor_drpi",
    "roi_neto_pct": "mejor_roi",
    "avm_estimate": "mayor_avm",
}


def compute_deltas(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calcula best/worst por métrica · etiqueta labels en cada item."""
    if not items or len(items) < 2:
        return {}
    for it in items:
        it.setdefault("labels", [])

    deltas: Dict[str, Any] = {}
    for metric in METRICS_LOWER_BETTER + METRICS_HIGHER_BETTER:
        values: List[Tuple[str, float]] = []
        for it in items:
            v = _safe_num(it.get(metric))
            if v is not None:
                values.append((it.get("entity_id"), v))
        if len(values) < 2:
            continue
        if metric in METRICS_LOWER_BETTER:
            best = min(values, key=lambda kv: kv[1])
            worst = max(values, key=lambda kv: kv[1])
        else:
            best = max(values, key=lambda kv: kv[1])
            worst = min(values, key=lambda kv: kv[1])
        if best[0] == worst[0]:
            continue
        rng = abs(worst[1] - best[1])
        pct = round((rng / worst[1] * 100.0), 2) if worst[1] not in (0, None) else 0.0
        deltas[metric] = {
            "best_entity_id": best[0],
            "worst_entity_id": worst[0],
            "range": round(rng, 2),
            "percent_diff_best_vs_worst": pct,
        }
        # winner label
        for it in items:
            if it.get("entity_id") == best[0]:
                label = LABEL_MAP.get(metric)
                if label and label not in it["labels"]:
                    it["labels"].append(label)
    return deltas


# ─── Sub-F · AI verdict ─────────────────────────────────────────────────────
def _templated_verdict(items: List[Dict[str, Any]], deltas: Dict[str, Any]) -> str:
    if not items:
        return ""
    if not deltas:
        return f"Solo se compara {items[0].get('title','propiedad 1')} · no hay deltas vs otras propiedades."
    parts = []
    for metric, d in list(deltas.items())[:3]:
        best = next((i for i in items if i.get("entity_id") == d["best_entity_id"]), None)
        title = best.get("title") if best else d["best_entity_id"]
        label_es = LABEL_MAP.get(metric, metric)
        parts.append(f"{title} destaca en [{label_es}] (+{d['percent_diff_best_vs_worst']}% vs peor)")
    body = " · ".join(parts)
    return f"{body}. Tu decision depende de que priorizas: precio, ubicacion (IE/DRPI), riesgo o yield neto."


def _audience_advice(audience: str) -> str:
    """Cierre del verdict adaptado a la audiencia."""
    return {
        "investor": "Para tu perfil de inversionista, prioriza yield neto post-ISR y volatilidad DRPI.",
        "family": "Para uso familiar, prioriza ubicacion, score IE de zona y predial anual.",
        "first_home": "Para primera vivienda, prioriza precio total de cierre y predial proyectado.",
        "luxury": "Para segmento luxury, prioriza exclusividad de zona, IE alto y comparables escasos.",
        "boutique": "Para boutique, prioriza caracter de la colonia y comparables de calidad similar.",
        "urgent": "Para decisiones rapidas, prioriza precio y dias en mercado bajos.",
    }.get(audience, "Tu decision depende de que priorizas: precio, ubicacion (IE/DRPI), riesgo o yield neto.")


async def generate_ai_verdict(db, items: List[Dict[str, Any]], deltas: Dict[str, Any], audience: str, comparison_key: str) -> str:
    """Verdict templated · cita top deltas y adapta cierre a audiencia.

    NOTA: La integracion LLM via narrative_layer requiere scope='comparison' nativo
    en narrative_layer_engine (TODO Sub-F). Hasta entonces, verdict templated profesional.
    """
    if not items or len(items) < 2 or not deltas:
        return _templated_verdict(items, deltas)
    parts = []
    for metric, d in list(deltas.items())[:3]:
        best = next((i for i in items if i.get("entity_id") == d["best_entity_id"]), None)
        title = best.get("title") if best else d["best_entity_id"]
        label_es = LABEL_MAP.get(metric, metric)
        parts.append(f"{title} destaca en [{label_es}] (+{d['percent_diff_best_vs_worst']}% vs peor opcion)")
    body = " · ".join(parts)
    closing = _audience_advice(audience)
    return f"{body}. {closing}"


# ─── Main entry ─────────────────────────────────────────────────────────────
async def compare(
    db,
    scope: str,
    entity_ids: List[str],
    audience: str = "neutral",
    language: str = "es-MX",
    force_refresh: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Compara 1-3 propiedades · retorna {items, deltas, ai_verdict, comparison_key, cached, generated_at}."""
    if scope not in ("unit", "project"):
        return {"ok": False, "reason": "scope invalido"}
    entity_ids = [str(x) for x in (entity_ids or []) if x]
    if not (1 <= len(entity_ids) <= 3):
        return {"ok": False, "reason": "entity_ids debe tener 1-3 elementos"}

    comparison_key = make_comparison_key(scope, entity_ids, audience)

    # Cache lookup
    if not force_refresh:
        try:
            cached = await db[COLLECTION].find_one({"comparison_key": comparison_key}, {"_id": 0})
            if cached:
                ttl_until = cached.get("ttl_until")
                if isinstance(ttl_until, str):
                    try:
                        ttl_dt = datetime.fromisoformat(ttl_until.replace("Z", "+00:00"))
                    except Exception:
                        ttl_dt = None
                else:
                    ttl_dt = ttl_until
                if not ttl_dt or ttl_dt >= _now():
                    cached["cached"] = True
                    return cached
        except Exception as e:  # noqa: BLE001
            log.warning(f"[compare] cache lookup failed: {e}")

    # Build items in parallel
    items: List[Dict[str, Any]] = list(await asyncio.gather(*[_build_item(db, scope, eid, audience) for eid in entity_ids]))

    # Deltas
    deltas = compute_deltas(items)

    # AI verdict
    ai_verdict = await generate_ai_verdict(db, items, deltas, audience, comparison_key)

    payload = {
        "id": uuid.uuid4().hex,
        "comparison_key": comparison_key,
        "scope": scope,
        "entity_ids": entity_ids,
        "audience": audience,
        "language": language,
        "items": items,
        "deltas": deltas,
        "ai_verdict": ai_verdict,
        "generated_at": _iso(_now()),
        "ttl_until": _iso(_now() + timedelta(minutes=DEFAULT_TTL_MINUTES)),
        "cached": False,
    }

    # Cache + audit
    try:
        await db[COLLECTION].update_one(
            {"comparison_key": comparison_key},
            {"$set": payload},
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[compare] cache set failed: {e}")
    try:
        from audit_immutable_engine import log as _audit_log
        await _audit_log(
            db,
            actor={"user_id": user_id or "system", "role": "system"},
            action="compare_generated",
            entity_type=f"comparison:{scope}",
            entity_id=comparison_key,
            after={"entity_ids": entity_ids, "audience": audience, "n_items": len(items)},
        )
    except Exception:
        pass
    return payload


async def ensure_indexes(db) -> None:
    try:
        await db[COLLECTION].create_index("comparison_key", unique=True, name="comparison_key_unique")
        await db[COLLECTION].create_index("generated_at")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[compare] ensure_indexes failed: {e}")
