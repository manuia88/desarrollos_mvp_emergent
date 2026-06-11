"""
valor_residual_engine — F1.2 · Motor de Valor Residual del Terreno.
═══════════════════════════════════════════════════════════════════════════════
PREGUNTA QUE RESPONDE (para el dev): "¿Cuánto MÁXIMO puedo pagar por este terreno
sin perder dinero?"

MÉTODO (residual, el estándar mundial de land underwriting):
    Oferta máxima por el terreno = Ingreso por venta
                                   − Costo de obra
                                   − Costos blandos (gerencia, indirectos, comisión, etc.)
                                   − Utilidad que el dev exige

    donde:
      m²_construibles = terreno_m² × CUS            (CUS = cuánto te deja construir la norma)
      m²_vendibles    = m²_construibles × eficiencia (lo neto rentable, ~0.82)
      ingreso         = m²_vendibles × precio_venta_$/m² (AVM de la zona)

REUTILIZA (despierta features ya construidas, no inventa):
  · db.colonias          → CUS/COS reales (SIG · F1.0), precio de venta real, valor de suelo oficial
  · comercial_value_model→ estima precio comercial desde el suelo (flywheel, cuando haya ventas)
  · construction_cost_engine → costo de obra $/m² (BANXICO/INEGI · por categoría + zona)

DOCTRINA DE DATOS (cada número trae su ORIGEN — dato/estimado/supuesto/benchmark — y banda
honesta). Nunca presenta un supuesto como si fuera un dato. Calibrado contra el caso real
Puente Alvarado (margen ~18%, costo obra ~$13k/m² media).

CERO deuda: si falta un dato, baja la confianza y lo dice — no crashea, no inventa.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.valor_residual")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


# ─── Categorías de producto que el dev elige (lenguaje simple) ────────────────
# Cada una mapea a: tier de costo de obra + precio de venta de referencia ($/m²)
# usado SOLO como último recurso (supuesto) cuando la zona no tiene precio real.
CATEGORIAS: Dict[str, Dict[str, Any]] = {
    "economica":   {"label": "Económica / Interés medio", "tier": "entry",  "precio_ref": 32_000},
    "media":       {"label": "Media",                      "tier": "mid",   "precio_ref": 48_000},
    "residencial": {"label": "Residencial",                "tier": "mid",   "precio_ref": 68_000},
    "premium":     {"label": "Residencial Plus / Premium", "tier": "luxury", "precio_ref": 98_000},
}

# ─── Supuestos de negocio (benchmarks de las plantillas + caso Puente Alvarado) ─
# Todos editables por el dev en la pantalla; estos son los defaults honestos.
DEFAULTS = {
    "eficiencia": 0.82,        # m² vendible / m² construible (benchmark sector vertical CDMX)
    "margen_objetivo": 0.20,   # utilidad que el dev exige sobre el ingreso (supuesto editable)
    # costos blandos — % validados contra plantillas de proyecto reales:
    "pct_indirectos": 0.08,    # licencias, proyecto, supervisión, legal, fideicomiso (sobre obra)
    "pct_gerencia": 0.16,      # honorarios de desarrollo (developer fee 10% + gerencia 6%) · referencia metodología, editable
    "pct_imprevistos": 0.05,   # contingencia (sobre obra)
    "pct_comision": 0.02,      # comisión de comercialización (sobre ingreso) · estándar CDMX (editable)
    "pct_publicidad": 0.02,    # marketing / publicidad (sobre ingreso)
}


async def get_effective_defaults(db) -> Dict[str, Any]:
    """Defaults del motor con la calibración aplicada (F1.6) si existe. Fuente única: arranca de
    los DEFAULTS del código y los sobreescribe con lo guardado en db.calibracion_terreno
    (lo que la calibración contra Puente Alvarado dejó). Fail-open: si no hay, usa el código."""
    eff = dict(DEFAULTS)
    eff["_calibrado"] = False
    try:
        doc = await db.calibracion_terreno.find_one({"_id": "terreno"})
        if doc:
            for k in ("margen_objetivo", "pct_indirectos", "pct_gerencia", "pct_imprevistos",
                      "pct_comision", "pct_publicidad", "eficiencia"):
                if doc.get(k) is not None:
                    eff[k] = float(doc[k])
            eff["_calibrado"] = True
    except Exception as e:
        log.warning(f"[residual] calibracion_terreno: {e}")
    return eff


async def _resolver_colonia(db, colonia_id: Optional[str], city: str) -> Optional[Dict[str, Any]]:
    if not colonia_id:
        return None
    doc = await db.colonias.find_one(
        {"id": colonia_id, "city": city},
        {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "cos": 1, "cus": 1,
         "precio_pm2": 1, "vsuelo_pm2_catastral": 1, "zonif_niveles": 1, "zonif_uso": 1, "tier": 1},
    )
    return doc


async def _precio_venta_pm2(db, colonia: Optional[Dict[str, Any]], categoria: str,
                            city: str) -> Dict[str, Any]:
    """Resuelve el precio de venta $/m² con la mejor fuente disponible (Doctrina de Datos)."""
    cat = CATEGORIAS.get(categoria, CATEGORIAS["media"])
    # 1) Precio REAL de la zona (ventas/reventa · F1.0) — el mejor.
    if colonia and (colonia.get("precio_pm2") or 0) > 0:
        return {"pm2": float(colonia["precio_pm2"]), "origen": "dato",
                "fuente": "Ventas reales de la zona",
                "leyenda": "Precio de venta observado en la colonia."}
    # 2) Estimación del modelo suelo→comercial (flywheel · solo si es fiable).
    if colonia:
        try:
            from comercial_value_model import estimate_commercial_pm2
            est = await estimate_commercial_pm2(db, colonia["id"], city=city)
            if est and est.get("pm2"):
                return {"pm2": float(est["pm2"]), "origen": "estimado",
                        "fuente": f"Modelo del suelo al precio comercial ({est.get('confianza')})",
                        "leyenda": est.get("leyenda")}
        except Exception as e:
            log.warning(f"[residual] estimate_commercial_pm2: {e}")
    # 3) Referencia por categoría (supuesto · último recurso, marcado honestamente).
    return {"pm2": float(cat["precio_ref"]), "origen": "supuesto",
            "fuente": f"Referencia por categoría ({cat['label']})",
            "leyenda": "La zona aún no tiene precio propio — usamos una referencia general. "
                       "Ajusta este número con tu dato de mercado para afinar la oferta."}


async def _costo_obra_pm2(db, zone_id: str, tier: str) -> Dict[str, Any]:
    """Costo de obra $/m² (BANXICO/INEGI · construction_cost_engine). Honesto si es stub."""
    try:
        from construction_cost_engine import get_or_compute_cost
        r = await get_or_compute_cost(db, zone_id=zone_id, building_type="vertical", tier=tier)
        pm2 = float(r.get("cost_per_m2_mxn") or 0)
        if pm2 > 0:
            origen = "benchmark" if r.get("sources") else "supuesto"
            return {"pm2": pm2, "origen": origen,
                    "fuente": "Costo de edificación (BANXICO/INEGI)" if r.get("sources")
                              else "Costo de edificación (referencia histórica)",
                    "confianza": r.get("confidence_pct"),
                    "leyenda": r.get("stub_reason") or "Costo de obra por m² construido."}
    except Exception as e:
        log.warning(f"[residual] get_or_compute_cost: {e}")
    # Fallback duro por categoría (benchmark Puente Alvarado ~$13k/m² media).
    base = {"entry": 11_000, "mid": 14_000, "luxury": 24_000}.get(tier, 14_000)
    return {"pm2": float(base), "origen": "supuesto",
            "fuente": "Costo de edificación (referencia histórica)",
            "confianza": 55, "leyenda": "Sin conexión a índices de costo — referencia general."}


async def calcular_residual(
    db,
    terreno_m2: float,
    categoria: str = "media",
    colonia_id: Optional[str] = None,
    cus_manual: Optional[float] = None,
    precio_venta_pm2_manual: Optional[float] = None,
    costo_obra_pm2_manual: Optional[float] = None,
    margen_objetivo: Optional[float] = None,
    eficiencia: Optional[float] = None,
    comision_pct_manual: Optional[float] = None,
    honorarios_pct_manual: Optional[float] = None,
    city: str = "CDMX",
) -> Dict[str, Any]:
    """Calcula la oferta MÁXIMA por el terreno (método residual). Devuelve el número grande +
    el desglose completo con el origen de cada dato (Doctrina). Nunca crashea."""
    avisos = []
    cat_def = CATEGORIAS.get(categoria, CATEGORIAS["media"])
    eff = await get_effective_defaults(db)   # F1.6 · usa los valores calibrados si existen
    eficiencia = float(eficiencia) if eficiencia else eff["eficiencia"]
    margen_objetivo = float(margen_objetivo) if margen_objetivo is not None else eff["margen_objetivo"]
    # Comisión de ventas editable · default estándar CDMX (2%).
    pct_comision = float(comision_pct_manual) if comision_pct_manual is not None else eff["pct_comision"]
    # Honorarios de desarrollo editable · default referencia metodología (16%).
    pct_honorarios = float(honorarios_pct_manual) if honorarios_pct_manual is not None else eff["pct_gerencia"]

    colonia = await _resolver_colonia(db, colonia_id, city)
    zone_id = _slug(colonia["name"]) if colonia else _slug(categoria)

    # ── CUS (cuánto deja construir la norma) ──
    # P3.1 · si capturas CUS=0 (no se puede construir) → vale 0, NO el default 3.0 (antes daba ~$60M
    # en vez de ~$0). Distinguimos "0 capturado" de "no capturado" (None).
    if cus_manual is not None and cus_manual >= 0:
        cus = float(cus_manual)
        cus_src = {"origen": "supuesto", "fuente": "Capturado por ti"}
    elif colonia and (colonia.get("cus") or 0) > 0:
        cus = float(colonia["cus"])
        cus_src = {"origen": "dato", "fuente": "Norma de uso de suelo (SIG CDMX)"}
    else:
        cus = 3.0
        cus_src = {"origen": "supuesto", "fuente": "Referencia general (verifica la norma del predio)"}
        avisos.append("No tenemos el CUS oficial de esta zona — usamos una referencia. "
                      "Confírmalo con el Certificado de Uso de Suelo del predio.")

    # ── Precio de venta $/m² ──
    if precio_venta_pm2_manual and precio_venta_pm2_manual > 0:
        precio = {"pm2": float(precio_venta_pm2_manual), "origen": "supuesto",
                  "fuente": "Capturado por ti", "leyenda": "Precio de venta que tú esperas lograr."}
    else:
        precio = await _precio_venta_pm2(db, colonia, categoria, city)
    if precio["origen"] == "supuesto" and not precio_venta_pm2_manual:
        avisos.append("El precio de venta es una referencia general — ajústalo con tu estudio de mercado.")

    # ── Costo de obra $/m² ──
    if costo_obra_pm2_manual and costo_obra_pm2_manual > 0:
        costo = {"pm2": float(costo_obra_pm2_manual), "origen": "supuesto",
                 "fuente": "Capturado por ti", "leyenda": "Costo de obra que tú estimas."}
    else:
        costo = await _costo_obra_pm2(db, zone_id, cat_def["tier"])

    # ── Cálculo residual ──
    m2_construibles = terreno_m2 * cus
    m2_vendibles = m2_construibles * eficiencia
    ingreso = m2_vendibles * precio["pm2"]

    costo_obra = m2_construibles * costo["pm2"]
    indirectos = costo_obra * eff["pct_indirectos"]
    gerencia = costo_obra * pct_honorarios
    imprevistos = costo_obra * eff["pct_imprevistos"]
    comision = ingreso * pct_comision
    publicidad = ingreso * eff["pct_publicidad"]
    costos_blandos = indirectos + gerencia + imprevistos + comision + publicidad

    utilidad_requerida = ingreso * margen_objetivo
    costo_total_sin_terreno = costo_obra + costos_blandos + utilidad_requerida

    oferta_maxima = ingreso - costo_total_sin_terreno
    oferta_pm2 = oferta_maxima / terreno_m2 if terreno_m2 > 0 else 0.0

    # ── Sanity vs valor catastral oficial del suelo (piso) ──
    vsuelo = (colonia or {}).get("vsuelo_pm2_catastral") or 0
    semaforo, lectura = _semaforo(oferta_maxima, oferta_pm2, vsuelo)

    # ── Confianza global (cuántos de los 3 insumos clave son dato real) ──
    fuertes = sum(1 for o in (cus_src["origen"], precio["origen"], costo["origen"])
                  if o in ("dato", "benchmark"))
    confianza = {0: "baja", 1: "baja", 2: "media", 3: "alta"}[fuertes]

    return {
        "ok": True,
        "pregunta": "¿Cuánto máximo puedo pagar por este terreno?",
        "respuesta": {
            "oferta_maxima_terreno": round(oferta_maxima),
            "oferta_pm2_terreno": round(oferta_pm2),
            "moneda": "MXN",
            "semaforo": semaforo,
            "lectura": lectura,
        },
        "supuestos": {
            "terreno_m2": terreno_m2,
            "categoria": categoria,
            "categoria_label": cat_def["label"],
            "cus": round(cus, 2), "cus_origen": cus_src,
            "eficiencia": eficiencia,
            "margen_objetivo": margen_objetivo,
            "pct_comision": pct_comision,
            "pct_honorarios": pct_honorarios,
            "precio_venta_pm2": round(precio["pm2"]), "precio_origen": precio,
            "costo_obra_pm2": round(costo["pm2"]), "costo_origen": costo,
        },
        "desglose": {
            "m2_construibles": round(m2_construibles),
            "m2_vendibles": round(m2_vendibles),
            "ingreso_por_venta": round(ingreso),
            "costo_obra": round(costo_obra),
            "indirectos": round(indirectos),
            "gerencia_desarrollo": round(gerencia),
            "imprevistos": round(imprevistos),
            "comision_ventas": round(comision),
            "publicidad": round(publicidad),
            "costos_blandos_total": round(costos_blandos),
            "utilidad_requerida": round(utilidad_requerida),
            "costo_total_sin_terreno": round(costo_total_sin_terreno),
        },
        "referencias": {
            "valor_catastral_suelo_pm2": round(vsuelo) if vsuelo else None,
            "colonia": (colonia or {}).get("name"),
            "alcaldia": (colonia or {}).get("alcaldia"),
        },
        "confianza": confianza,
        "avisos": avisos,
        "metodo": "Valor residual — estándar de land underwriting. "
                  "Oferta = Ingreso por venta − Obra − Costos blandos − Tu utilidad.",
        "computed_at": _iso(),
    }


def _semaforo(oferta_maxima: float, oferta_pm2: float, vsuelo: float):
    """Lee el resultado en lenguaje simple comparando contra el piso catastral del suelo."""
    if oferta_maxima <= 0:
        return ("rojo", "Con estos números el proyecto NO deja tu utilidad: no podrías pagar nada "
                        "por el terreno. Revisa precio de venta, costo o tu margen.")
    if vsuelo and oferta_pm2 < vsuelo:
        return ("rojo", f"Tu oferta máxima (${round(oferta_pm2):,}/m²) queda por DEBAJO del valor "
                        f"catastral del suelo (${round(vsuelo):,}/m²): el terreno probablemente esté "
                        f"fuera de tu alcance para que el proyecto deje utilidad.")
    if vsuelo and oferta_pm2 < vsuelo * 1.5:
        return ("amarillo", f"Tu oferta máxima (${round(oferta_pm2):,}/m²) está cerca del valor "
                            f"catastral del suelo: margen ajustado, negocia bien el precio del terreno.")
    return ("verde", f"Puedes pagar hasta ${round(oferta_pm2):,}/m² de terreno y el proyecto sigue "
                     f"dejando tu utilidad. Si lo consigues por menos, ganas más.")
