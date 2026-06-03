"""
DMX · Fase 2.3 — SELF-IMPROVING LOOP (cada cierre real recalibra el cubo) + VISIÓN
═══════════════════════════════════════════════════════════════════════════════
El moat "Tesla FSD del real estate": cada transacción mejora el modelo.
Cablea el cubo al loop de aprendizaje del Cerebro (cerebro/coach.py · E4):
  · record_unit_predictions() — registra la predicción del cubo (precio estimado +
    prob. de venta) para una unidad, con ref=unit_id.
  · on_unit_closed() — llega la REALIDAD (precio de cierre): escribe el cierre en el
    átomo, RESUELVE las predicciones (predicho vs real → hit/error), RE-AJUSTA el
    hedónico (que ya prefiere precio_cierre → más preciso) y devuelve calibración.
  · enrich_atom_from_photos() — auto-tag de fotos (DL visión · photo_tagger) → llena
    amenidades/acabados del átomo. CONECTADO PERO DORMIDO: sin modelo de visión/fotos
    devuelve dormant; se activa con fotos reales.

Todo fail-open (no rompe el flujo que lo dispara). Multi-tenant vía el user.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS
from cerebro import coach
import dmx_demand
import dmx_hedonic_atom

UNITS = COLLECTIONS["units"]


async def record_unit_predictions(db, user, unit_id: str) -> Dict[str, Any]:
    """Registra la predicción del cubo para una unidad (precio estimado + prob. de venta)."""
    a = await db[UNITS].find_one({"unit_id": unit_id}, {"_id": 0})
    if not a:
        return {"ok": False, "reason": "unidad no existe"}
    areas = a.get("areas") or {}
    m2 = areas.get("m2_privativo") or areas.get("m2_construido")
    z = (a.get("geo") or {}).get("colonia_id")
    prob = (a.get("demand") or {}).get("prob_venta")
    logged = []
    # precio estimado por el cubo = mediana de zona × m²
    medians = await dmx_demand._colonia_median_pm2(db)
    if m2 and z and medians.get(z):
        pred_price = round(medians[z] * m2)
        r = await coach.log_prediction(db, user, kind="price", predicted=pred_price,
                                       ref=unit_id, meta={"basis": "cube_zone_median", "m2": m2})
        if r.get("ok"):
            logged.append({"kind": "price", "predicted": pred_price})
    if prob is not None:
        r = await coach.log_prediction(db, user, kind="close_prob", predicted=prob, ref=unit_id,
                                       meta={"basis": "heuristic_v1"})
        if r.get("ok"):
            logged.append({"kind": "close_prob", "predicted": prob})
    return {"ok": True, "unit_id": unit_id, "logged": logged}


async def on_unit_closed(db, user, unit_id: str, precio_cierre_mxn: float,
                         dias_en_mercado: Optional[int] = None) -> Dict[str, Any]:
    """Llega un CIERRE real → escribe en el átomo, resuelve predicciones, re-ajusta hedónico."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    # 1) escribir el cierre en el átomo (precio_cierre → el hedónico lo prefiere)
    a = await db[UNITS].find_one({"unit_id": unit_id}, {"_id": 0, "areas": 1, "geo": 1})
    set_fields = {"commercial.precio_cierre_mxn": float(precio_cierre_mxn),
                  "commercial.status": "vendido", "commercial.fecha_cierre": now,
                  "demand.prob_venta": 1.0, "updated_at": now}
    if a:
        areas = a.get("areas") or {}
        m2 = areas.get("m2_privativo") or areas.get("m2_construido")
        if m2 and m2 > 0:
            set_fields["commercial.precio_m2_cierre_mxn"] = round(float(precio_cierre_mxn) / m2, 2)
    if dias_en_mercado is not None:
        set_fields["commercial.dias_en_mercado"] = int(dias_en_mercado)
    await db[UNITS].update_one({"unit_id": unit_id}, {"$set": set_fields})

    # 2) RESOLVER las predicciones del cubo vs la realidad
    actuals: Dict[str, Any] = {"price": float(precio_cierre_mxn), "close_prob": True}
    if dias_en_mercado is not None:
        actuals["days_on_market"] = int(dias_en_mercado)
    resolved = await coach.resolve_predictions(db, user, unit_id, actuals)

    # 3) RE-AJUSTAR el hedónico (ahora con precio de cierre real → mejor).
    #    Invalida el caché TTL y fuerza un ajuste fresco (self-improving).
    dmx_hedonic_atom.invalidate_cache()
    refit = await dmx_hedonic_atom.fit_and_rank(db, None, persist=True, fresh=True)

    # 4) marcador honesto
    calib = await coach.calibration(db, user)

    return {"ok": True, "unit_id": unit_id, "resolved_predictions": resolved,
            "hedonic_refit": {"sample_size": refit.get("sample_size"), "r_squared": refit.get("r_squared")},
            "calibration": calib}


# ─── DL VISIÓN — auto-tag de fotos → átomo (conectado pero dormido) ───────────
async def enrich_atom_from_photos(db, development_id: str,
                                  photos: Optional[List[str]] = None) -> Dict[str, Any]:
    """Detecta cuarto/amenidad/acabado por foto (photo_tagger.tag_with_vision) y llena
    el átomo. Dormant-safe: sin modelo de visión / sin fotos → {dormant:True}."""
    urls = photos or []
    if not urls:
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(development_id) or {}
            urls = [p.get("url") if isinstance(p, dict) else p for p in (dev.get("photos") or [])]
            urls = [u for u in urls if u][:8]
        except Exception:
            urls = []
    if not urls:
        return {"dormant": True, "reason": "sin fotos", "development_id": development_id, "tagged": 0}
    try:
        import photo_tagger
        feats: List[str] = []
        rooms: List[str] = []
        for u in urls:
            t = await photo_tagger.tag_with_vision(u)
            if isinstance(t, dict):
                rooms.append(t.get("room") or t.get("room_label") or "")
                feats.extend(t.get("features") or [])
        feats = sorted({f for f in feats if f})
        if not feats and not any(rooms):
            return {"dormant": True, "reason": "visión sin salida (sin key/modelo)",
                    "development_id": development_id, "tagged": 0}
        # mapear features detectadas → amenity_keys del átomo (fill-only)
        await db[UNITS].update_many(
            {"development_id": development_id, "amenity_keys": {"$in": [None, []]}},
            {"$set": {"amenity_keys": feats, "sources._vision": "photo_tagger"}})
        return {"dormant": False, "development_id": development_id, "features": feats,
                "rooms": sorted({r for r in rooms if r})}
    except Exception as e:
        return {"dormant": True, "reason": str(e)[:140], "development_id": development_id, "tagged": 0}
