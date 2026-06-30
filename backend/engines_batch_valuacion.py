"""ENGINES BATCH · VALUACIÓN (tanda 5) — registra los motores de PRECIO/VALOR del cubo en el engine hub.

Cada motor se expone como un runner `_r_<id>(db, ctx)` + un descriptor hiper-segmentado (Indicadores con
nombre humano · uso '¿para qué sirve?' · unidad). El hub (engines_hub.py) mergea REGISTRO y engine_present.py
mergea DESCRIPTORES. Nada se vuelca crudo: cada salida se convierte en Indicadores nombrados.

CONTEXTO que recibe cada runner (lo arma el hub): ctx['colonia_id'], ctx['dev_id'], ctx['_dev'] (dict del
desarrollo representativo de la zona) y ctx['_unit'] (dict de la primera unidad). Los motores que piden precio/m²
toman los valores de _dev/_unit o un default razonable (m2=90, rec=2, ban=2).

MOTORES (11):
  val_hedonico_atom      · dmx_hedonic_atom       · ¿cuánto suma al precio/m² un roof/terraza/2º cajón? (sobre el átomo)
  val_hedonico_zona      · hedonic_regression_engine · regresión hedónica por zona sobre transacciones (ajusta+predice)
  val_avm_explain        · avm_explain_engine     · desglose del AVM: qué feature suma/resta al valor
  val_avm_features       · avm_feature_engine      · homologación de atributos estilo perito (factor + drivers)
  val_cma                · cma_engine             · análisis comparativo de mercado (AVM + comparables + forecast)
  val_residual           · valor_residual_engine  · oferta MÁXIMA por el terreno (land underwriting)
  val_norma3             · norma3_engine          · oportunidades de fusión Norma 3 (uplift por mayor CUS)
  val_fsd                · fsd_engine             · valor puntual + intervalo 80% + confianza por feature
  val_accuracy           · accuracy_engine        · precisión rolling del AVM (MAPE vs cierres reales)
  val_model_validation   · model_validation_engine · validación de modelos del cubo (R²/RMSE/MAPE)
  val_golden_calibration · golden_calibration_engine · examen contra caso real (Puente Alvarado)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# ── helpers de contexto: sacar m2/rec/ban/precio del _dev/_unit o defaults razonables ──
def _unit_dims(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """m2/recamaras/banos/antiguedad/precio de la unidad representativa (o defaults: 90m² · 2 rec · 2 ban)."""
    u = ctx.get("_unit") or {}
    m2 = u.get("m2_priv") or u.get("m2_privative") or u.get("m2_total") or 90.0
    rec = u.get("bedrooms") or u.get("recamaras") or 2
    ban = u.get("bathrooms") or u.get("banos") or 2
    precio = u.get("price") or u.get("price_total") or 0
    return {"m2": float(m2 or 90.0), "rec": int(rec or 2), "ban": int(ban or 2),
            "antiguedad": 0, "precio": float(precio or 0)}


def _unit_attrs(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Atributos de homologación (perito) desde la unidad representativa."""
    u = ctx.get("_unit") or {}
    d = ctx.get("_dev") or {}
    n_amen = len(d.get("amenities") or [])
    return {
        "estado_conservacion": "bueno",
        "antiguedad_anos": 0,
        "condicion": "a_estrenar",
        "vista": u.get("vista") or "calle",
        "orientacion": u.get("orientation"),
        "nivel": u.get("level"),
        "n_amenidades": n_amen,
    }


# ── runners (1 por motor) ──
async def _r_val_hedonico_atom(db, ctx):
    """Amenity value ranker hedónico sobre el ÁTOMO (dmx_units): % de impacto de cada atributo en precio/m²."""
    import dmx_hedonic_atom as e
    return await e.fit_and_rank(db, scope=None, persist=False)


async def _r_val_hedonico_zona(db, ctx):
    """Hedónico por zona sobre transacciones: ajusta el modelo y predice un 2-rec 90m². Latente si no hay tx."""
    import hedonic_regression_engine as e
    zone = ctx.get("colonia_id")
    fit = await e.fit_hedonic_model(db, zone, tier="colonia")
    if not fit.get("available"):
        return {"available": False, "reason": fit.get("reason"), "sample_size": fit.get("sample_size"),
                "zone_id": zone}
    dims = _unit_dims(ctx)
    feats = {"m2": dims["m2"], "recamaras": dims["rec"], "baños": dims["ban"],
             "year_built": 2020, "floor": 5, "proximity_metro_m": 800,
             "denue_density": 0, "construction_cost_index": 0}
    pred = await e.predict_price(db, fit["id"], feats)
    return {**pred, "zone_id": zone, "sample_size": fit.get("sample_size"),
            "r_squared": fit.get("r_squared")}


async def _r_val_avm_explain(db, ctx):
    """Desglose del AVM (qué feature suma/resta al valor). Corre un AVM y lo explica (heurístico o hedónico)."""
    import avm_public_engine as a
    import avm_explain_engine as e
    dims = _unit_dims(ctx)
    avm = await a.avm_quick_async(db, ctx.get("colonia_id"), dims["m2"], dims["rec"], dims["ban"], dims["antiguedad"])
    if isinstance(avm, dict) and avm.get("error"):
        return {"available": False, "reason": avm.get("error")}
    inputs = {"m2": dims["m2"], "recamaras": dims["rec"], "banos": dims["ban"], "antiguedad_anos": dims["antiguedad"]}
    return await e.explain_for_avm_response(db, avm, inputs)


async def _r_val_avm_features(db, ctx):
    """Homologación de atributos estilo perito (NMX-459): factor acotado + drivers en lenguaje normal."""
    import avm_feature_engine as e
    return e.feature_adjustments(_unit_attrs(ctx))


async def _r_val_cma(db, ctx):
    """Análisis comparativo de mercado (CMA): AVM + comparables + subscores + forecast + narrativa."""
    import cma_engine as e
    dims = _unit_dims(ctx)
    subject = {"colonia_slug": ctx.get("colonia_id"), "m2": dims["m2"],
               "recamaras": dims["rec"], "banos": dims["ban"], "antiguedad": dims["antiguedad"]}
    return await e.generate_cma(db, asesor_id="engine_hub", subject=subject)


async def _r_val_residual(db, ctx):
    """Oferta MÁXIMA por el terreno (método residual · land underwriting). Default terreno 1000 m²."""
    import valor_residual_engine as e
    return await e.calcular_residual(db, terreno_m2=1000.0, categoria="media", colonia_id=ctx.get("colonia_id"))


async def _r_val_norma3(db, ctx):
    """Oportunidades de fusión (Norma General N°3): uplift del terreno si capturas el CUS de una zona vecina."""
    import norma3_engine as e
    return await e.detectar_fusiones(db, ctx.get("colonia_id"), terreno_m2=1000.0, categoria="media")


async def _r_val_fsd(db, ctx):
    """Valor puntual + intervalo de confianza 80% + confianza por feature. Usa el hedónico promovido de la zona."""
    import fsd_engine as e
    dims = _unit_dims(ctx)
    feats = {"m2": dims["m2"], "recamaras": dims["rec"], "baños": dims["ban"],
             "year_built": 2020, "floor": 5, "proximity_metro_m": 800,
             "denue_density": 0, "construction_cost_index": 0}
    return await e.compute_fsd(db, feats, ctx.get("colonia_id"))


async def _r_val_accuracy(db, ctx):
    """Precisión rolling del AVM: MAPE vs cierres reales (90 días). Latente hasta tener ≥20 cierres con predicción."""
    import accuracy_engine as e
    return await e.compute_mape_rolling(db, zone_slug=ctx.get("colonia_id"), days=90)


async def _r_val_model_validation(db, ctx):
    """Validación de los modelos del cubo (R²/RMSE/MAPE) vs observación viva. Corre todos los validadores V1."""
    import model_validation_engine as e
    return await e.run_all_validations(db)


async def _r_val_golden_calibration(db, ctx):
    """Examen contra un caso real conocido (Puente Alvarado): ¿las fórmulas reproducen lo que pasó?"""
    import golden_calibration_engine as e
    return await e.calibrar(db)


# ── REGISTRO (lo que mergea engines_hub.py) ──
REGISTRO: List[Dict[str, Any]] = [
    {"id": "val_hedonico_atom", "nombre": "Hedónico — ¿cuánto suma cada atributo?", "eje": "PRECIO", "tanda": 5,
     "produce": "% de impacto en precio/m² de roof/terraza/balcón/bodega/2º cajón (regresión sobre el átomo)",
     "input": [], "fn": _r_val_hedonico_atom, "fuente": "dmx_hedonic_atom"},
    {"id": "val_hedonico_zona", "nombre": "Hedónico por zona (transacciones)", "eje": "PRECIO", "tanda": 5,
     "produce": "precio/m² predicho de un 2-rec 90m² por regresión hedónica sobre cierres de la zona",
     "input": ["colonia_id"], "fn": _r_val_hedonico_zona, "fuente": "hedonic_regression_engine"},
    {"id": "val_avm_explain", "nombre": "AVM explicado (qué mueve el valor)", "eje": "PRECIO", "tanda": 5,
     "produce": "desglose del AVM: qué feature suma o resta al valor estimado (explainability)",
     "input": ["colonia_id"], "fn": _r_val_avm_explain, "fuente": "avm_explain_engine"},
    {"id": "val_avm_features", "nombre": "Homologación de atributos (perito)", "eje": "PRECIO", "tanda": 5,
     "produce": "factor de ajuste estilo avalúo (NMX-459) + drivers que suman/restan al valor",
     "input": [], "fn": _r_val_avm_features, "fuente": "avm_feature_engine"},
    {"id": "val_cma", "nombre": "CMA — análisis comparativo de mercado", "eje": "PRECIO", "tanda": 5,
     "produce": "valor estimado + comparables + forecast 12m + narrativa para un cliente",
     "input": ["colonia_id"], "fn": _r_val_cma, "fuente": "cma_engine"},
    {"id": "val_residual", "nombre": "Valor residual — oferta máxima por terreno", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "cuánto máximo puede pagar un dev por el terreno sin perder su utilidad (land underwriting)",
     "input": ["colonia_id"], "fn": _r_val_residual, "fuente": "valor_residual_engine"},
    {"id": "val_norma3", "nombre": "Norma 3 — fusión que sube el suelo", "eje": "INVERSIÓN", "tanda": 5,
     "produce": "zonas vecinas con mayor CUS y cuánto subiría el valor del terreno al fusionar",
     "input": ["colonia_id"], "fn": _r_val_norma3, "fuente": "norma3_engine"},
    {"id": "val_fsd", "nombre": "FSD — valor + intervalo de confianza", "eje": "PRECIO", "tanda": 5,
     "produce": "valor puntual + banda 80% + nivel de confianza (incertidumbre del AVM por unidad)",
     "input": ["colonia_id"], "fn": _r_val_fsd, "fuente": "fsd_engine"},
    {"id": "val_accuracy", "nombre": "Precisión del AVM (vs cierres)", "eje": "SEÑALES", "tanda": 5,
     "produce": "MAPE rolling del AVM contra precios de cierre reales (track-record del modelo)",
     "input": ["colonia_id"], "fn": _r_val_accuracy, "fuente": "accuracy_engine"},
    {"id": "val_model_validation", "nombre": "Validación de modelos del cubo", "eje": "SEÑALES", "tanda": 5,
     "produce": "R²/RMSE/MAPE de los modelos del cubo vs observación viva (salud del modelo)",
     "input": [], "fn": _r_val_model_validation, "fuente": "model_validation_engine"},
    {"id": "val_golden_calibration", "nombre": "Calibración contra caso real (Puente Alvarado)", "eje": "SEÑALES", "tanda": 5,
     "produce": "examen de las fórmulas de valuación contra un proyecto real conocido (¿reproducen la realidad?)",
     "input": [], "fn": _r_val_golden_calibration, "fuente": "golden_calibration_engine"},
]


# ── DESCRIPTORES (lo que mergea engine_present.py) — cada item: dot-path → nombre/uso/unidad ──
DESCRIPTORES: Dict[str, Dict[str, Any]] = {
    "val_hedonico_atom": {"items": [
        {"k": "available", "nombre": "Modelo disponible", "uso": "Si hay datos suficientes para estimar el impacto de cada atributo."},
        {"k": "r_squared", "nombre": "R² del hedónico", "uso": "Qué tan bien el modelo explica el precio/m² (cercano a 1 = muy bueno).", "unidad": "0-1"},
        {"k": "sample_size", "nombre": "Unidades en el modelo", "uso": "Tamaño de la muestra: a más unidades, más confiable el impacto estimado.", "unidad": "unidades"},
        {"k": "amenity_ranker.0.atributo", "nombre": "Atributo que más mueve el precio", "uso": "El atributo (roof/terraza/2º cajón…) con mayor impacto en precio/m²."},
        {"k": "amenity_ranker.0.impacto_pct_precio_m2", "nombre": "Impacto del top atributo", "uso": "Cuánto suma o resta ese atributo al precio/m²: decide qué incluir en el producto.", "unidad": "%"},
        {"k": "baseline_colonia", "nombre": "Colonia base del modelo", "uso": "La colonia de referencia contra la que se mide el resto (one-hot)."},
    ]},
    "val_hedonico_zona": {"items": [
        {"k": "available", "nombre": "Modelo de zona disponible", "uso": "Si la zona tiene transacciones suficientes para una regresión hedónica."},
        {"k": "predicted_price_per_m2", "nombre": "Precio/m² predicho (2-rec 90m²)", "uso": "Valor de mercado modelado de un depto típico: ¿está bien puesto el precio?", "unidad": "$/m²"},
        {"k": "ci95_low_per_m2", "nombre": "Banda baja (95%)", "uso": "Piso razonable del precio/m² según el modelo.", "unidad": "$/m²"},
        {"k": "ci95_high_per_m2", "nombre": "Banda alta (95%)", "uso": "Techo razonable del precio/m² según el modelo.", "unidad": "$/m²"},
        {"k": "predicted_total", "nombre": "Valor total predicho", "uso": "Precio estimado del depto típico completo.", "unidad": "MXN"},
        {"k": "r_squared", "nombre": "R² del modelo de zona", "uso": "Qué tan bien explica el modelo los cierres de la zona.", "unidad": "0-1"},
    ]},
    "val_avm_explain": {"items": [
        {"k": "available", "nombre": "Explicación disponible", "uso": "Si se pudo desglosar el valor en sus features."},
        {"k": "pricing_model", "nombre": "Modelo de precio usado", "uso": "Si el AVM corrió por hedónico (datos) o heurístico (reglas)."},
        {"k": "predicted_pm2", "nombre": "Precio/m² estimado", "uso": "El valor por m² que el desglose explica.", "unidad": "$/m²"},
        {"k": "contributions.0.label", "nombre": "Factor que más pesa", "uso": "El feature que más suma o resta al valor (lo que mueve el precio)."},
        {"k": "contributions.0.pct", "nombre": "Peso del factor principal", "uso": "Qué proporción del valor explica ese factor.", "unidad": "%"},
        {"k": "predicted_total", "nombre": "Valor total estimado", "uso": "Precio total que el desglose reconstruye.", "unidad": "MXN"},
    ]},
    "val_avm_features": {"items": [
        {"k": "factor", "nombre": "Factor de homologación", "uso": "Multiplicador estilo avalúo (1.0 = neutro): cuánto ajustan los atributos al valor base.", "unidad": "x"},
        {"k": "drivers.0.plain", "nombre": "Driver principal", "uso": "Lo que más mueve el valor en lenguaje normal (vista, estado, orientación…)."},
        {"k": "drivers.0.dir", "nombre": "Dirección del driver", "uso": "Si ese atributo suma (up) o resta (down) al valor."},
        {"k": "drivers.0.pct", "nombre": "Impacto del driver", "uso": "Cuánto pesa el driver principal sobre el valor.", "unidad": "%"},
    ]},
    "val_cma": {"items": [
        {"k": "estimated_value", "nombre": "Valor estimado (CMA)", "uso": "El número central del análisis comparativo: precio justo de la propiedad.", "unidad": "MXN"},
        {"k": "estimated_price_per_m2", "nombre": "Precio/m² estimado", "uso": "Referencia por m² del CMA.", "unidad": "$/m²"},
        {"k": "comparables_avg_price", "nombre": "Precio promedio de comparables", "uso": "Contra qué se está midiendo: el promedio de unidades similares.", "unidad": "MXN"},
        {"k": "confidence", "nombre": "Confianza del CMA", "uso": "Qué tan sólido es el estimado (depende de comparables y datos)."},
        {"k": "forecast_12m_pct", "nombre": "Proyección 12 meses", "uso": "Hacia dónde va el precio: clave para el timing de venta.", "unidad": "%"},
        {"k": "drpi_trend.label", "nombre": "Tendencia de plusvalía (DRPI)", "uso": "Si la zona va al alza, a la baja o estable."},
    ]},
    "val_residual": {"items": [
        {"k": "respuesta.oferta_maxima_terreno", "nombre": "Oferta máxima por el terreno", "uso": "Cuánto máximo pagar por el suelo sin perder la utilidad: el número clave del land underwriting.", "unidad": "MXN"},
        {"k": "respuesta.oferta_pm2_terreno", "nombre": "Oferta máxima por m² de terreno", "uso": "El tope por m² de suelo: para negociar el precio del terreno.", "unidad": "$/m²"},
        {"k": "respuesta.semaforo", "nombre": "Semáforo del terreno", "uso": "Verde/amarillo/rojo: si el predio entra en tu negocio."},
        {"k": "desglose.ingreso_por_venta", "nombre": "Ingreso por venta del proyecto", "uso": "Lo que generaría vender todo lo construible: el techo del negocio.", "unidad": "MXN"},
        {"k": "supuestos.precio_venta_pm2", "nombre": "Precio de venta supuesto", "uso": "El precio/m² con el que se calcula el ingreso (afina con tu mercado).", "unidad": "$/m²"},
        {"k": "confianza", "nombre": "Confianza del cálculo", "uso": "Cuántos insumos clave (CUS/precio/costo) son dato real vs supuesto."},
    ]},
    "val_norma3": {"items": [
        {"k": "disponible", "nombre": "Análisis disponible", "uso": "Si la colonia tiene CUS y ubicación para buscar fusiones."},
        {"k": "resumen", "nombre": "Resumen de oportunidad", "uso": "La mejor jugada de fusión en lenguaje normal."},
        {"k": "oportunidades.0.colonia_vecina", "nombre": "Mejor zona para fusionar", "uso": "La colonia vecina con mayor CUS que más sube el valor del suelo."},
        {"k": "oportunidades.0.uplift_mxn", "nombre": "Dinero en juego (uplift)", "uso": "Cuánto subiría el valor del terreno al capturar ese CUS.", "unidad": "MXN"},
        {"k": "oportunidades.0.uplift_pct", "nombre": "Uplift porcentual", "uso": "Qué tanto mejora el valor del terreno con la fusión.", "unidad": "%"},
        {"k": "oportunidades.0.cus_potencial", "nombre": "CUS potencial", "uso": "Cuánto más podrías construir tras la fusión.", "unidad": "x"},
    ]},
    "val_fsd": {"items": [
        {"k": "available", "nombre": "FSD disponible", "uso": "Si la zona tiene un modelo hedónico promovido para estimar el intervalo."},
        {"k": "value", "nombre": "Valor puntual", "uso": "El valor central estimado de la unidad.", "unidad": "MXN"},
        {"k": "low_estimate", "nombre": "Estimado bajo (80%)", "uso": "Piso del intervalo de confianza 80%.", "unidad": "MXN"},
        {"k": "high_estimate", "nombre": "Estimado alto (80%)", "uso": "Techo del intervalo de confianza 80%.", "unidad": "MXN"},
        {"k": "fsd_pct", "nombre": "Dispersión (FSD%)", "uso": "Qué tan ancha es la banda: a menor %, más certero el AVM.", "unidad": "%"},
        {"k": "confidence_lvl", "nombre": "Nivel de confianza", "uso": "ALTA/MEDIA/BAJA: el sello de confianza del estimado."},
    ]},
    "val_accuracy": {"items": [
        {"k": "available", "nombre": "Métrica disponible", "uso": "Si hay suficientes cierres (≥20) para medir la precisión del AVM."},
        {"k": "mape_pct", "nombre": "Error medio del AVM (MAPE)", "uso": "Qué tanto se equivoca el AVM vs precios reales de cierre: el track-record.", "unidad": "%"},
        {"k": "sample_size", "nombre": "Cierres medidos", "uso": "Cuántos cierres reales respaldan la métrica de precisión.", "unidad": "cierres"},
        {"k": "state", "nombre": "Estado de la métrica", "uso": "Si ya es confiable o aún 'muestra insuficiente'."},
    ]},
    "val_model_validation": {"items": [
        {"k": "models_validated", "nombre": "Modelos validados", "uso": "Cuántos modelos del cubo se examinaron en esta corrida.", "unidad": "modelos"},
        {"k": "results.cube_avg_price.r_squared", "nombre": "R² (precio promedio del cubo)", "uso": "Qué tan estable es la predicción de precio del cubo vs lo observado.", "unidad": "0-1"},
        {"k": "results.cube_avg_price.mape", "nombre": "MAPE (precio del cubo)", "uso": "Error medio del precio promedio del cubo.", "unidad": "%"},
        {"k": "results.cube_avg_price.sample_size", "nombre": "Muestra (precio del cubo)", "uso": "Cuántas colonias respaldan la validación.", "unidad": "colonias"},
        {"k": "results.metrics_cube_kpis.sample_size", "nombre": "Muestra (KPIs del cubo)", "uso": "Cuántas zonas respaldan la consistencia día a día.", "unidad": "zonas"},
    ]},
    "val_golden_calibration": {"items": [
        {"k": "estado", "nombre": "Veredicto de calibración", "uso": "Si las fórmulas reproducen el caso real (calibrado/casi/ajustar)."},
        {"k": "resumen", "nombre": "Resumen del examen", "uso": "Qué tan bien las fórmulas reproducen un proyecto real conocido."},
        {"k": "caso", "nombre": "Caso de referencia", "uso": "El proyecto real contra el que se calibra (golden case)."},
        {"k": "calibracion_aplicada", "nombre": "¿Calibración aplicada?", "uso": "Si ya se aplicaron los valores documentados al motor de valor residual."},
    ]},
}
