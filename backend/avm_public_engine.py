"""F0.1 Sub-B — AVM público + Colonia stats.

PRIMARY: hedonic_regression_engine (W3 ML model).
FALLBACK: heuristic (precio_per_m2 base × adjusts) when model not fit / not available.
Response shape kept identical for backward compat with UI Valores.js (W4.18.2B).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.avm_public_engine")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _colonia_record(slug: str) -> Optional[Dict[str, Any]]:
    from data_seed import COLONIAS_BY_ID
    return COLONIAS_BY_ID.get(slug)


def avm_quick(
    colonia_slug: str,
    m2: float,
    recamaras: int,
    banos: int,
    antiguedad_anos: int,
    attrs: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    col = _colonia_record(colonia_slug)
    if not col:
        return {"error": "colonia_not_found", "colonia_slug": colonia_slug}

    base_per_m2 = col.get("price_m2_num") or 50000
    # Ajustes heurísticos (fallback)
    rec_factor = 1.0 + (recamaras - 2) * 0.04  # base 2 rec
    ban_factor = 1.0 + (banos - 2) * 0.025     # base 2 baños
    age_factor = max(0.55, 1.0 - (antiguedad_anos * 0.012))
    adj_per_m2 = base_per_m2 * rec_factor * ban_factor * age_factor
    heuristic_estimate = adj_per_m2 * m2

    # Default to heuristic. AVM-CONF-01: el heurístico es un seed (no hay modelo
    # hedónico real ≥30 muestras) → NO vender "media". Confianza referencial.
    estimate = heuristic_estimate
    adj_pm2 = adj_per_m2
    range_low = round(estimate * 0.88)
    range_high = round(estimate * 1.12)
    confidence = "baja"
    pricing_model = "heuristic"
    r_squared: Optional[float] = None
    model_id: Optional[str] = None

    return _avm_response(
        colonia_slug, col, m2, recamaras, banos, antiguedad_anos,
        estimate, adj_pm2, range_low, range_high, confidence,
        pricing_model, r_squared, model_id, attrs,
    )


async def avm_quick_async(
    db,
    colonia_slug: str,
    m2: float,
    recamaras: int,
    banos: int,
    antiguedad_anos: int,
    *,
    skip_cache: bool = False,
    with_explain: bool = False,
    attrs: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Async path that prefers hedonic_regression_engine real model.
    Falls back to heuristic if the model is not available.

    W5.1 — added LRU cache + opt-in explainability breakdown.
    attrs (opcional): atributos finos (vista/estado/condición/amenidades/orientación/piso)
    para el AVM rico — ajustan el valor y explican qué lo mueve.
    """
    col = _colonia_record(colonia_slug)
    if not col:
        return {"error": "colonia_not_found", "colonia_slug": colonia_slug}

    if attrs:
        skip_cache = True  # el ajuste por atributos no entra en la llave de caché

    # ── Cache lookup (W5.1 Sub-E) ───────────────────────────────────────────
    if not skip_cache:
        try:
            import avm_cache
            cached = await avm_cache.get(colonia_slug, m2, recamaras, banos, antiguedad_anos)
            if cached is not None:
                out = dict(cached)
                out["cache_hit"] = True
                if with_explain and "explain" not in out:
                    try:
                        from avm_explain_engine import explain_for_avm_response
                        out["explain"] = await explain_for_avm_response(
                            db, out,
                            {"m2": m2, "recamaras": recamaras, "banos": banos, "antiguedad_anos": antiguedad_anos},
                            base_pm2=col.get("price_m2_num"),
                        )
                    except Exception:
                        pass
                return out
        except Exception:
            pass

    base_per_m2 = col.get("price_m2_num") or 50000
    rec_factor = 1.0 + (recamaras - 2) * 0.04
    ban_factor = 1.0 + (banos - 2) * 0.025
    age_factor = max(0.55, 1.0 - (antiguedad_anos * 0.012))
    adj_per_m2 = base_per_m2 * rec_factor * ban_factor * age_factor
    heuristic_estimate = adj_per_m2 * m2

    # Try hedonic regression real model
    pricing_model = "heuristic"
    r_squared: Optional[float] = None
    model_id: Optional[str] = None
    estimate = heuristic_estimate
    adj_pm2 = adj_per_m2
    range_low = round(estimate * 0.88)
    range_high = round(estimate * 1.12)
    # AVM-CONF-01: arranca referencial; solo sube a media/alta si entra el
    # modelo hedónico real (r² medido más abajo). Heurístico = seed, no certeza.
    confidence = "baja"

    try:
        from hedonic_regression_engine import predict_price
        latest_model = await db.hedonic_models.find_one(
            {"available": True}, {"_id": 0, "id": 1},
            sort=[("fit_at_dt", -1)],
        )
        if latest_model:
            # Colonia score proxy (best-effort)
            colonia_score = 60.0
            try:
                zs = await db.zone_scores.find_one(
                    {"$or": [{"zone_id": colonia_slug}, {"slug": colonia_slug}]},
                    {"_id": 0, "score_numeric": 1, "score_total": 1},
                )
                # El campo real es score_numeric (score_total era el alias inexistente → siempre 60).
                _sc = (zs or {}).get("score_numeric")
                if _sc is None:
                    _sc = (zs or {}).get("score_total")
                if _sc is not None:
                    colonia_score = float(_sc)
            except Exception:
                pass
            features = {
                "m2": float(m2),
                "recamaras": int(recamaras),
                "banos": int(banos),
                "antiguedad_anos": int(antiguedad_anos),
                "colonia_score": colonia_score,
            }
            pred = await predict_price(db, latest_model["id"], features)
            if pred.get("available") and pred.get("predicted_total"):
                pred_total = float(pred["predicted_total"])
                pred_r2 = pred.get("r_squared")
                # Sanity guard: skip if r² too low OR estimate diverges >3x from heuristic baseline
                r2_ok = (pred_r2 is None) or (float(pred_r2) >= 0.20)
                ratio_ok = (
                    heuristic_estimate > 0
                    and (pred_total / heuristic_estimate) >= 0.30
                    and (pred_total / heuristic_estimate) <= 3.0
                )
                if not (r2_ok and ratio_ok):
                    log.info(
                        f"[avm] hedonic rejected (low quality) · colonia={colonia_slug} "
                        f"r2={pred_r2} pred={pred_total:.0f} heur={heuristic_estimate:.0f} · fallback heuristic"
                    )
                else:
                    estimate = pred_total
                    adj_pm2 = float(pred.get("predicted_price_per_m2") or (estimate / m2 if m2 else 0))
                    low_pm2 = float(pred.get("ci95_low_per_m2") or 0)
                    high_pm2 = float(pred.get("ci95_high_per_m2") or 0)
                    if low_pm2 and high_pm2 and m2:
                        range_low = round(low_pm2 * m2)
                        range_high = round(high_pm2 * m2)
                    else:
                        range_low = round(estimate * 0.88)
                        range_high = round(estimate * 1.12)
                    r_squared = pred_r2
                    model_id = pred.get("model_id")
                    if r_squared is not None and r_squared >= 0.65:
                        confidence = "alta"
                    elif r_squared is not None and r_squared >= 0.40:
                        confidence = "media"
                    else:
                        confidence = "baja"
                    pricing_model = "hedonic_regression"
                    log.info(f"[avm] hedonic_predict used · colonia={colonia_slug} pm2={adj_pm2:.0f} r2={r_squared}")
            else:
                log.info(f"[avm] heuristic fallback · colonia={colonia_slug} reason=no_fit")
        else:
            log.info(f"[avm] heuristic fallback · colonia={colonia_slug} reason=no_model_available")
    except Exception as exc:
        log.warning(f"[avm] hedonic_predict error · fallback heuristic · {exc}")

    response = _avm_response(
        colonia_slug, col, m2, recamaras, banos, antiguedad_anos,
        estimate, adj_pm2, range_low, range_high, confidence,
        pricing_model, r_squared, model_id, attrs,
    )
    response["cache_hit"] = False

    # ── W5.15 P1 Sub-A/D — FSD compute + zone_weights short-circuit + persist ─
    try:
        prop_features = {
            "m2": float(m2),
            "recamaras": int(recamaras),
            "banos": int(banos),
            "antiguedad_anos": int(antiguedad_anos),
            "colonia_score": 60.0,
        }
        try:
            from weight_optimizer import predict_with_zone_weights
            zw_pred = await predict_with_zone_weights(db, colonia_slug, prop_features)
        except Exception:
            zw_pred = None
        # Si hay zone_weights con r2 mayor que el global y son recientes, sobreescribimos value
        if zw_pred and zw_pred.get("value") and (zw_pred.get("r2_score") or 0) > (r_squared or 0):
            response["zone_weights_value"] = zw_pred["value"]
            response["zone_weights_r2"] = zw_pred["r2_score"]
            response["pricing_model_used"] = "zone_weights"
            try:
                from audit_immutable_engine import log as audit_log
                await audit_log(
                    db,
                    actor={"user_id": "system", "role": "system"},
                    action="avm_pricing_model_decision",
                    entity_type="avm",
                    entity_id=colonia_slug,
                    before=None,
                    after={"selected": "zone_weights", "global_r2": r_squared, "zone_r2": zw_pred.get("r2_score")},
                )
            except Exception:
                pass
        else:
            response["pricing_model_used"] = pricing_model

        from fsd_engine import compute_fsd, persist_avm_prediction
        fsd = await compute_fsd(db, prop_features, colonia_slug, model_id=model_id)
        if fsd.get("available"):
            # FIX auditoría (honestidad): NO exponer un 2º precio que contradice el principal. El modelo FSD
            # aún sin calibrar da valores/bandas absurdas (ej. 28.7M con banda 5M–52M vs principal 10.7M).
            # Solo lo mostramos si su banda es creíble (±≤35%) y no se aleja >40% del estimado principal.
            # Tolerancias CERRADAS (auditoría A–Z 07-24): con ±40% se colaba una segunda valuación
            # 30.1% más alta que la principal, en la MISMA respuesta y etiquetada "confianza ALTA"
            # (Doctores 80 m²: $2,857,600 referencial vs $3,716,868 con banda 3.25M–4.18M). Dos
            # precios distintos del mismo departamento no es un rango: es una contradicción.
            _main = response.get("precio_estimado")
            _fsdv = fsd.get("value")
            _banda_ok = (fsd.get("fsd_pct") or 999) <= 20
            _cerca = bool(_main and _fsdv and abs(_fsdv / _main - 1) <= 0.10)
            if _banda_ok and _cerca:
                response["fsd_value"] = fsd["value"]
                response["low_estimate"] = fsd["low_estimate"]
                response["high_estimate"] = fsd["high_estimate"]
                response["fsd_pct"] = fsd["fsd_pct"]
                # Un modelo SIN calibrar (sin r²) o con coeficientes de colonia incompletos no puede
                # anunciar confianza ALTA: se degrada a media y se dice por qué.
                _sin_calibrar = fsd.get("r_squared") is None or bool(fsd.get("missing_data_flag"))
                response["confidence_lvl"] = "MEDIA" if _sin_calibrar else fsd["confidence_lvl"]
                if _sin_calibrar:
                    response["confidence_nota"] = ("El modelo aún no está calibrado para esta colonia: "
                                                   "tómalo como referencia, no como avalúo")
                response["feature_breakdown"] = fsd["feature_breakdown"]
            # Persistencia best-effort SIEMPRE (para entrenar/track), aunque no se muestre.
            property_id = f"{colonia_slug}_m2{int(m2)}_r{int(recamaras)}_b{int(banos)}_a{int(antiguedad_anos)}"
            try:
                await persist_avm_prediction(db, property_id, colonia_slug, fsd, prop_features)
            except Exception as exc:
                log.warning(f"[avm] fsd persist warn: {exc}")
    except Exception as exc:
        log.warning(f"[avm] fsd compute warn: {exc}")

    # ── Cache store (W5.1 Sub-E) ────────────────────────────────────────────
    try:
        import avm_cache
        await avm_cache.set(colonia_slug, m2, recamaras, banos, antiguedad_anos, response)
    except Exception:
        pass

    # ── Explainability (W5.1 Sub-D) opt-in ──────────────────────────────────
    if with_explain:
        try:
            from avm_explain_engine import explain_for_avm_response
            response["explain"] = await explain_for_avm_response(
                db, response,
                {"m2": m2, "recamaras": recamaras, "banos": banos, "antiguedad_anos": antiguedad_anos},
                base_pm2=col.get("price_m2_num"),
            )
        except Exception as exc:
            log.warning(f"[avm] explain failed: {exc}")

    return response


def _avm_response(
    colonia_slug, col, m2, recamaras, banos, antiguedad_anos,
    estimate, adj_per_m2, range_low, range_high, confidence,
    pricing_model, r_squared, model_id, attrs=None,
) -> Dict[str, Any]:
    # ── AVM rico: atributos finos (vista/estado/condición/amenidades/orientación/piso) ──
    # ajustan el valor + explican en lenguaje normal "qué mueve el precio". (rec/baños/edad
    # ya están en la base heurística → no se vuelven a contar.)
    drivers: List[Dict[str, Any]] = []
    drivers_resumen = None
    if attrs:
        try:
            import avm_feature_engine as afe
            # OJO: NO pasamos condición/antigüedad aquí — la base heurística ya aplica la edad
            # (evita doble conteo). Solo conservación + calidad/ubicación.
            rich = {k: attrs.get(k) for k in ("vista", "estado_conservacion",
                                              "n_amenidades", "orientacion", "nivel")}
            adj = afe.feature_adjustments(rich)
            fctr = adj["factor"]
            estimate = estimate * fctr
            adj_per_m2 = adj_per_m2 * fctr
            range_low = round(estimate * 0.88)
            range_high = round(estimate * 1.12)
            drivers = adj["drivers"]
            drivers_resumen = afe.drivers_headline(drivers)
        except Exception:
            pass

    # Comparables: top devs misma colonia
    from data_developments import DEVELOPMENTS
    comparables = []
    for d in DEVELOPMENTS:
        if d.get("colonia_id") != colonia_slug:
            continue
        d_m2 = (d.get("m2_range") or [60])[0]
        comparables.append({
            "dev_id": d["id"],
            "name": d["name"],
            "price_from": d.get("price_from"),
            "m2_min": d_m2,
            "price_per_m2": round((d.get("price_from", 0) / d_m2) if d_m2 else 0),
            "stage": d.get("stage"),
            "slug": d.get("slug"),
        })
    comparables = comparables[:3]

    # AVM-CONF-01: marcar honestamente la fuente. Si NO entró el modelo hedónico
    # real (sigue en "heuristic"), es un estimado de seed → es_estimado:true,
    # fuente="heuristico_seed", y etiqueta humana "referencial". No inventar certeza.
    es_heuristico = pricing_model == "heuristic"
    fuente = "heuristico_seed" if es_heuristico else pricing_model
    confidence_label = "referencial" if es_heuristico else confidence

    return {
        "colonia_slug": colonia_slug,
        "colonia_name": col["name"],
        "input": {
            "m2": m2, "recamaras": recamaras, "banos": banos, "antiguedad_anos": antiguedad_anos,
        },
        "precio_estimado": round(estimate),
        "precio_per_m2": round(adj_per_m2),
        "range_low": range_low,
        "range_high": range_high,
        "confidence": confidence,
        "confidence_label": confidence_label,
        "fuente": fuente,
        "es_estimado": es_heuristico,
        "comparables": comparables,
        "disclaimer": "Estimación referencial · no constituye avalúo profesional.",
        "pricing_model": pricing_model,
        "model_id": model_id,
        "r_squared": r_squared,
        "drivers": drivers,                    # qué mueve el precio (lenguaje normal)
        "drivers_resumen": drivers_resumen,
        "generated_at": _now().isoformat(),
    }


def colonia_stats(colonia_slug: str) -> Dict[str, Any]:
    col = _colonia_record(colonia_slug)
    if not col:
        return {"error": "colonia_not_found", "colonia_slug": colonia_slug}

    from data_developments import DEVELOPMENTS

    devs_in_col = [d for d in DEVELOPMENTS if d.get("colonia_id") == colonia_slug]
    devs_active = [d for d in devs_in_col if d.get("stage") in ("preventa", "en_construccion")]

    top_devs = sorted(devs_active, key=lambda d: d.get("price_from", 0), reverse=True)[:3]
    top_devs_lite = [{
        "dev_id": d["id"], "slug": d.get("slug"), "name": d.get("name"),
        "price_from": d.get("price_from"), "stage": d.get("stage"),
    } for d in top_devs]

    return {
        "slug": col["id"],
        "name": col["name"],
        "alcaldia": col.get("alcaldia"),
        "tier": col.get("tier"),
        "center": col.get("center"),
        "price_m2": col.get("price_m2_num"),
        "momentum": col.get("momentum"),
        "scores": col.get("scores"),
        "total_devs_active": len(devs_active),
        "total_listings_used": 0,  # placeholder hasta brokers ingest
        "demand_index": col.get("inventory", 50),
        "top_3_devs": top_devs_lite,
        "top_3_used_listings": [],
        "generated_at": _now().isoformat(),
    }


def list_top_colonias(limit: int = 30) -> List[Dict[str, str]]:
    """Top N colonias por price_m2 desc para sitemap dinámico."""
    from data_seed import COLONIAS
    sorted_cols = sorted(COLONIAS, key=lambda c: -(c.get("price_m2_num") or 0))
    return [{"slug": c["id"], "name": c["name"]} for c in sorted_cols[:limit]]
