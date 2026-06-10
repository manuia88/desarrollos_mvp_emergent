"""W5.x F4 Sub-C + Sub-D · Narrative Layer · multi-source data ingestion.

Todas las funciones son async y FAIL-SOFT (retornan {} si la fuente falla).
Cada value se envuelve como {"value": X, "source": "Fuente Tag"}.

Sub-D extiende con collect_tax_block que llama a tax_projector_engine (F6)
para generar el cierre fiscal de cada audiencia.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.narrative_collector")

_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_S = 300  # 5 minutos

# ── W5 Cleanup · Cross-batch fail-soft imports ───────────────────────────────
try:
    from forecast_engine import get_zone_forecast as _fc_get_zone_forecast
    FORECAST_AVAILABLE = True
except Exception:
    FORECAST_AVAILABLE = False
    _fc_get_zone_forecast = None  # type: ignore

try:
    from zone_score_engine import get_zone_with_subscores as _zs_get_zone_with_subscores
    ZONE_SUBSCORES_AVAILABLE = True
except Exception:
    ZONE_SUBSCORES_AVAILABLE = False
    _zs_get_zone_with_subscores = None  # type: ignore


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    item = _CACHE.get(key)
    if not item:
        return None
    if time.time() - item["_ts"] > _CACHE_TTL_S:
        _CACHE.pop(key, None)
        return None
    return item["data"]


def _cache_set(key: str, data: Dict[str, Any]) -> None:
    _CACHE[key] = {"_ts": time.time(), "data": data}


def _wrap(value: Any, source: str) -> Dict[str, Any]:
    return {"value": value, "source": source}


async def _safe_find(db, coll: str, query: Dict[str, Any], proj: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
    try:
        return await db[coll].find_one(query, proj or {"_id": 0})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[collector] find {coll} failed: {e}")
        return None


async def collect_for_unit(db, unit_id: str) -> Dict[str, Any]:
    """Hechos de una unit · combina developments_units, AVM cache, IE scores, DRPI, risk."""
    if not unit_id:
        return {}
    cache_key = f"unit:{unit_id}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit

    out: Dict[str, Any] = {}
    unit = await _safe_find(db, "developments_units", {"id": unit_id})
    if not unit:
        unit = await _safe_find(db, "units", {"id": unit_id})
    if not unit:
        _cache_set(cache_key, {})
        return {}

    price = unit.get("price_mxn") or unit.get("price")
    if price:
        out["price"] = _wrap(price, "Listing W3.2")

    # AVM estimate via avm_cache
    avm = await _safe_find(db, "avm_cache", {"unit_id": unit_id}) or await _safe_find(db, "avm_estimates", {"unit_id": unit_id})
    if avm and (avm.get("estimate") or avm.get("avm_estimate")):
        out["avm_estimate"] = _wrap(avm.get("estimate") or avm.get("avm_estimate"), "AVM W5.1")

    # IE score (por colonia o zona)
    colonia = unit.get("colonia") or unit.get("zone_id")
    if colonia:
        ie = await _safe_find(db, "ie_scores", {"$or": [{"colonia": colonia}, {"zone_id": colonia}]})
        if ie:
            score = ie.get("score_total") or ie.get("score") or ie.get("score_proy")
            if score is not None:
                out["score_ie"] = _wrap(round(float(score), 2), "IE Engine W3")

    # DRPI zona
    drpi = await _safe_find(db, "drpi_zones", {"$or": [{"colonia": colonia}, {"zone_id": colonia}]}) if colonia else None
    if drpi:
        val = drpi.get("drpi_12m") or drpi.get("drpi") or drpi.get("value")
        if val is not None:
            out["drpi_zone"] = _wrap(round(float(val), 2), "Atlas DRPI")

    # Comparables (5 mas cercanas)
    try:
        comps_cursor = db.developments_units.find(
            {"colonia": colonia, "id": {"$ne": unit_id}}, {"_id": 0, "id": 1, "price_mxn": 1, "area_m2": 1}
        ).limit(5)
        comps = await comps_cursor.to_list(5)
        if comps:
            out["comparables_5"] = _wrap(comps, "Transactions Network W3.2")
    except Exception:
        pass

    # Days on market
    dom = unit.get("days_on_market") or unit.get("dom")
    if dom is not None:
        out["days_on_market"] = _wrap(dom, "Listing W3.2")

    # Risk score (W3.4) · P1.15 · la data real vive en risk_scores_zone (keyed zone_id, campo
    # score_numeric); antes leía `risk_scores` con filtro unit_id/colonia y campo risk_score → vacío.
    risk = await _safe_find(db, "risk_scores_zone", {"zone_id": colonia}) if colonia else None
    if risk and (risk.get("score_numeric") is not None or risk.get("risk_score") is not None or risk.get("score") is not None):
        _rs = risk.get("score_numeric")
        if _rs is None:
            _rs = risk.get("risk_score") or risk.get("score")
        out["risk_score"] = _wrap(_rs, "Risk Layer W3.4")

    # Fees estimate aprox 5% precio (placeholder · F6 lo calcula real)
    if price:
        out["fees_estimate"] = _wrap(round(float(price) * 0.05, 2), "Tax Projector F6 · stub")

    # Metadata para tax block
    out["_meta"] = {
        "unit_id": unit_id,
        "colonia": colonia,
        "price_raw": price,
        "valor_catastral": unit.get("valor_catastral"),
        "fecha_alta": unit.get("created_at") or unit.get("fecha_alta"),
    }

    # W5 Cleanup · cross-batch additive (fail-soft inside helpers)
    if colonia:
        try:
            fc = await collect_forecast_block(db, colonia)
            if fc:
                out.update(fc)
        except Exception:
            pass
        try:
            zs = await collect_zone_subscores_block(db, colonia)
            if zs:
                out.update(zs)
        except Exception:
            pass

    _cache_set(cache_key, out)
    return out


async def collect_for_project(db, project_id: str) -> Dict[str, Any]:
    """Hechos a nivel desarrollo."""
    if not project_id:
        return {}
    cache_key = f"project:{project_id}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit

    out: Dict[str, Any] = {}
    proj = await _safe_find(db, "developments", {"id": project_id})
    if not proj:
        _cache_set(cache_key, {})
        return {}

    try:
        units_total = await db.developments_units.count_documents({"development_id": project_id})
        units_sold = await db.developments_units.count_documents({"development_id": project_id, "status": "sold"})
    except Exception:
        units_total = proj.get("units_total") or 0
        units_sold = proj.get("units_sold") or 0

    if units_total:
        out["units_total"] = _wrap(units_total, "Catalog W3")
    if units_sold:
        out["units_sold"] = _wrap(units_sold, "Catalog W3")

    if proj.get("dom_avg"):
        out["dom_avg"] = _wrap(proj["dom_avg"], "Listing W3.2")

    if proj.get("score_proy") is not None:
        out["score_proy"] = _wrap(proj["score_proy"], "IE Engine W3")

    colonia = proj.get("colonia")
    if colonia:
        ie = await _safe_find(db, "ie_scores", {"$or": [{"colonia": colonia}, {"zone_id": colonia}]})
        if ie:
            sc = ie.get("score_total") or ie.get("score")
            if sc is not None:
                out["score_zone"] = _wrap(round(float(sc), 2), "IE Engine W3")
        drpi = await _safe_find(db, "drpi_zones", {"$or": [{"colonia": colonia}, {"zone_id": colonia}]})
        if drpi:
            val = drpi.get("drpi_12m") or drpi.get("drpi")
            if val is not None:
                out["drpi_12m"] = _wrap(round(float(val), 2), "Atlas DRPI")

    amenities = proj.get("amenities") or []
    if amenities:
        out["top_amenities_3"] = _wrap(amenities[:3], "Catalog W3")

    out["_meta"] = {
        "project_id": project_id,
        "colonia": colonia,
        "price_from": proj.get("price_from_mxn"),
        "price_to": proj.get("price_to_mxn"),
        "delivery": proj.get("delivery_estimate"),
    }

    # W5 Cleanup · cross-batch additive (fail-soft)
    if colonia:
        try:
            fc = await collect_forecast_block(db, colonia)
            if fc:
                out.update(fc)
        except Exception:
            pass
        try:
            zs = await collect_zone_subscores_block(db, colonia)
            if zs:
                out.update(zs)
        except Exception:
            pass

    _cache_set(cache_key, out)
    return out


async def collect_for_colonia(db, colonia: str) -> Dict[str, Any]:
    if not colonia:
        return {}
    cache_key = f"colonia:{colonia}"
    hit = _cache_get(cache_key)
    if hit is not None:
        return hit

    out: Dict[str, Any] = {}
    drpi = await _safe_find(db, "drpi_zones", {"$or": [{"colonia": colonia}, {"zone_id": colonia}]})
    if drpi:
        val = drpi.get("drpi_12m") or drpi.get("drpi")
        if val is not None:
            out["drpi_12m"] = _wrap(round(float(val), 2), "Atlas DRPI")

    ie = await _safe_find(db, "ie_scores", {"$or": [{"colonia": colonia}, {"zone_id": colonia}]})
    if ie:
        sc = ie.get("score_total") or ie.get("score")
        if sc is not None:
            out["score_avg"] = _wrap(round(float(sc), 2), "IE Engine W3")
        top3 = ie.get("top_drivers") or ie.get("top_3") or []
        if top3:
            out["ie_top_3"] = _wrap(top3[:3], "IE Engine W3")

    try:
        active = await db.developments_units.count_documents({"colonia": colonia, "status": {"$ne": "sold"}})
        if active:
            out["properties_active"] = _wrap(active, "Catalog W3")
        avg_dom = None
        async for d in db.developments_units.aggregate([
            {"$match": {"colonia": colonia, "days_on_market": {"$exists": True}}},
            {"$group": {"_id": None, "avg": {"$avg": "$days_on_market"}}},
        ]):
            avg_dom = d.get("avg")
        if avg_dom:
            out["dom_avg"] = _wrap(round(float(avg_dom), 1), "Listing W3.2")
    except Exception:
        pass

    # W5 Cleanup · cross-batch additive (fail-soft)
    try:
        fc = await collect_forecast_block(db, colonia)
        if fc:
            out.update(fc)
    except Exception:
        pass
    try:
        zs = await collect_zone_subscores_block(db, colonia)
        if zs:
            out.update(zs)
    except Exception:
        pass

    _cache_set(cache_key, out)
    return out


async def collect_for_lead_property(db, lead_id: str, property_id: str) -> Dict[str, Any]:
    """Combina unit facts + perfil del lead."""
    if not lead_id or not property_id:
        return {}
    out = dict(await collect_for_unit(db, property_id))
    lead = await _safe_find(db, "leads", {"id": lead_id})
    if lead:
        if lead.get("disc_profile"):
            out["lead_disc"] = _wrap(lead["disc_profile"], "Lead Profile W4")
        if lead.get("buyer_intent"):
            out["lead_audience_inferred"] = _wrap(lead["buyer_intent"], "Lead Profile W4")
        budget = lead.get("budget_max")
        if budget and out.get("price"):
            price_val = out["price"].get("value") if isinstance(out["price"], dict) else out["price"]
            if price_val:
                try:
                    match_pct = round((min(float(budget), float(price_val)) / float(price_val)) * 100.0, 1)
                    out["lead_budget_match"] = _wrap(f"{match_pct}%", "Lead Profile W4")
                except Exception:
                    pass
    return out


# ─── W5 Cleanup · Forecast + Zone Subscores collectors (fail-soft) ──────────
async def collect_forecast_block(db, zone_id: str, horizon_months: int = 12) -> Dict[str, Any]:
    """Hechos forecast multi-horizonte para una zona. FAIL-SOFT retorna {} si falla."""
    if not zone_id or not FORECAST_AVAILABLE or _fc_get_zone_forecast is None:
        return {}
    try:
        doc = await _fc_get_zone_forecast(db, zone_id)
        if not doc:
            return {}
        horizons = doc.get("horizons") or {}
        # Pick best matching horizon
        key = f"{horizon_months}m"
        band = horizons.get(key)
        if not band:
            # fallback: first available
            for k, v in horizons.items():
                band = v
                key = k
                break
        if not band:
            return {}
        delta = band.get("delta_pct")
        out: Dict[str, Any] = {
            "forecast_horizon": _wrap(key, "Forecast Engine W5.3"),
        }
        if delta is not None:
            out["forecast_delta_pct"] = _wrap(round(float(delta), 2), "Forecast Engine W5.3")
        if band.get("value") is not None:
            out["forecast_value"] = _wrap(round(float(band["value"]), 2), "Forecast Engine W5.3")
        if doc.get("narrative"):
            out["forecast_narrative"] = _wrap(doc["narrative"], "Forecast Engine W5.3")
        return out
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[collector] collect_forecast_block failed: {exc}")
        return {}


async def collect_zone_subscores_block(db, colonia_slug: str) -> Dict[str, Any]:
    """Top 3 subscores de una colonia. FAIL-SOFT retorna {} si falla."""
    if not colonia_slug or not ZONE_SUBSCORES_AVAILABLE or _zs_get_zone_with_subscores is None:
        return {}
    try:
        result = await _zs_get_zone_with_subscores(db, colonia_slug)
        if not isinstance(result, dict):
            return {}
        raw = result.get("subscores") or {}
        flat: Dict[str, float] = {}
        for k, v in raw.items():
            try:
                val = v.get("value") if isinstance(v, dict) else v
                if val is not None:
                    flat[k] = float(val)
            except (TypeError, ValueError):
                pass
        if not flat:
            return {}
        sorted_dims = sorted(flat.items(), key=lambda kv: kv[1], reverse=True)
        out: Dict[str, Any] = {}
        for k, v in sorted_dims[:3]:
            out[f"zone_subscore_{k}"] = _wrap(round(float(v), 1), "Zone Subscores W5.2")
        return out
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[collector] collect_zone_subscores_block failed: {exc}")
        return {}


# ─── Sub-D · Tax block integration ──────────────────────────────────────────
async def collect_tax_block(db, scope: str, entity_id: str, audience: str) -> Dict[str, Any]:
    """Genera el bloque fiscal correspondiente segun audiencia.

    FAIL-SOFT: si tax_projector_engine falla, retorna {}.
    """
    try:
        from tax_projector_engine import (
            calculate_isr_vendedor,
            calculate_closing_cost_total,
            project_predial_10y,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[collector] tax_projector import failed: {e}")
        return {}

    # Resolver datos de la entidad para alimentar los calculos
    meta: Dict[str, Any] = {}
    if scope == "unit":
        facts = await collect_for_unit(db, entity_id)
        meta = facts.get("_meta") or {}
    elif scope == "project":
        facts = await collect_for_project(db, entity_id)
        meta = facts.get("_meta") or {}
    elif scope == "lead_property":
        try:
            lead_id, property_id = entity_id.split(":", 1)
        except ValueError:
            return {}
        facts = await collect_for_unit(db, property_id)
        meta = facts.get("_meta") or {}
    else:
        return {}

    precio_venta = meta.get("price_raw") or meta.get("price_from") or 0
    valor_catastral = meta.get("valor_catastral") or (float(precio_venta) * 0.46 if precio_venta else 0)
    if not precio_venta:
        return {}

    block: Dict[str, Any] = {"source": "Tax Projector F6"}

    # Investor + luxury: incluyen ISR vendedor
    if audience in ("investor", "luxury"):
        fecha_compra = "2018-01-01"
        precio_compra = float(precio_venta) * 0.55  # estimacion conservadora cuando no hay dato real
        fecha_venta = datetime.now().strftime("%Y-%m-%d")
        try:
            isr_res = calculate_isr_vendedor(precio_compra, fecha_compra, float(precio_venta), fecha_venta)
            if isr_res.get("ok"):
                block["isr_estimado"] = round(isr_res["isr_total"], 2)
                ganancia = isr_res.get("ganancia_gravable", 0)
                utilidad_neta = round(ganancia - isr_res["isr_total"], 2)
                block["utilidad_neta_post_tax"] = utilidad_neta
                if precio_compra > 0:
                    block["roi_neto_pct"] = round((utilidad_neta / precio_compra) * 100.0, 2)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[collector] isr_vendedor failed: {e}")

    # Family/first_home/boutique/luxury: closing total + predial
    if audience in ("family", "first_home", "boutique", "luxury"):
        try:
            closing = calculate_closing_cost_total(float(precio_venta), float(valor_catastral or 0))
            if closing.get("ok"):
                block["closing_total"] = round(closing["total"], 2)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[collector] closing failed: {e}")
        try:
            predial = project_predial_10y(float(valor_catastral or precio_venta))
            if predial.get("ok") and predial.get("items"):
                block["predial_y1"] = round(predial["items"][0]["predial_estimado"], 2)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[collector] predial failed: {e}")

    # Urgent/neutral: solo closing total
    if audience in ("urgent", "neutral") and "closing_total" not in block:
        try:
            closing = calculate_closing_cost_total(float(precio_venta), float(valor_catastral or 0))
            if closing.get("ok"):
                block["closing_total"] = round(closing["total"], 2)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[collector] closing (urgent/neutral) failed: {e}")

    # Si no se llenaron campos (solo source), retornar vacio
    if set(block.keys()) == {"source"}:
        return {}
    return block
