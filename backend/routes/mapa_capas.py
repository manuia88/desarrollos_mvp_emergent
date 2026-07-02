"""
Capas del Mapa de Valores — surface HIPERGRANULAR de las métricas por colonia.

Un solo endpoint sirve CUALQUIER capa (valor, AVM, plusvalía, gentrificación, FAR, subutilizado,
edad del parque + los 8 índices IE con cobertura amplia: caminabilidad, seguridad-tendencia, agua,
escuelas, vida nocturna, senior, diversidad urbana, infraestructura). El frontend pinta el choropleth
por la capa elegida ("¿qué pinto?") reusando la MISMA geometría de colonias.

Honestidad: cada capa lleva fuente + es_estimado. NADA se inventa: si una colonia no tiene el dato,
simplemente no aparece pintada en esa capa (el frontend la deja en gris neutro).

Fuentes REALES (no duplicamos motores):
  · valor/avm/plusvalía/gentrificación → db.colonia_valoracion  (colonia_valoracion_engine + backfills)
  · far/subutilizado/edad             → db.colonia_catastro_byid (catastro_sig_engine)
  · IE_*                              → db.ie_scores (zone_id, code, value 0-100 · sistema IE, 70 códigos)
"""
from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any, List

router = APIRouter()

# ── Catálogo de capas IE (0-100) con cobertura amplia (≥760 colonias) — las surface-ables como choropleth.
# (code, label humano, categoría, emoji, ayuda). "higher_better": si más alto = mejor (para la rampa/legend).
_IE_LAYERS = [
    ("IE_COL_N08_WALKABILITY_MX",           "Caminabilidad",          "Estilo de vida", "🚶", "Qué tanto se resuelve la vida a pie."),
    ("IE_COL_N04_CRIME_TRAJECTORY",         "Seguridad · tendencia",  "Seguridad",      "🛡️", "Hacia dónde va el delito en la zona (mejora/empeora)."),
    ("IE_COL_N07_WATER_SECURITY",           "Agua · confiabilidad",   "Servicios",      "💧", "Qué tan segura es el agua en la colonia."),
    ("IE_COL_N06_SCHOOL_PREMIUM",           "Escuelas",               "Familia",        "🎓", "Densidad y calidad de escuelas cercanas."),
    ("IE_COL_N09_NIGHTLIFE_ECONOMY",        "Vida nocturna",          "Estilo de vida", "🌃", "Economía nocturna: bares, cafés, restaurantes."),
    ("IE_COL_N10_SENIOR_LIVABILITY",        "Vida senior",            "Familia",        "🌿", "Qué tan cómoda es la zona para adultos mayores."),
    ("IE_COL_N01_ECOSYSTEM_DIVERSITY",      "Diversidad urbana",      "Estilo de vida", "🏙️", "Mezcla de usos y servicios a la mano."),
    ("IE_COL_N05_INFRASTRUCTURE_RESILIENCE","Infraestructura",        "Servicios",      "🏗️", "Resiliencia de la infraestructura urbana."),
]

# ── Capas base (escala nativa). scale: cómo pinta el frontend. src: cómo leer el valor por colonia.
_BASE_LAYERS = [
    {"key": "valor",          "label": "Valor del suelo",       "cat": "Precio",      "emoji": "💰", "unit": "$/m²",  "scale": "price",   "higher_better": True,  "help": "Valor catastral oficial del suelo (SIGCDMX)."},
    {"key": "avm",            "label": "Precio de mercado",     "cat": "Precio",      "emoji": "🏷️", "unit": "$/m²",  "scale": "price_hi","higher_better": True,  "help": "Precio de mercado estimado (AVM DesarrollosMX)."},
    {"key": "plusvalia",      "label": "Plusvalía anual",       "cat": "Precio",      "emoji": "📈", "unit": "%/año", "scale": "pct",     "higher_better": True,  "help": "Apreciación anual reciente (índice SHF de la alcaldía)."},
    {"key": "gentrificacion", "label": "Gentrificación",        "cat": "Momento",     "emoji": "🔥", "unit": "0-100", "scale": "score",   "higher_better": True,  "help": "Presión de transformación de la zona."},
    {"key": "far",            "label": "Aprovechamiento (FAR)", "cat": "Urbanístico", "emoji": "🏢", "unit": "FAR",   "scale": "far",     "higher_better": True,  "help": "Construcción por m² de terreno (catastro)."},
    {"key": "subutilizado",   "label": "Suelo subutilizado",    "cat": "Urbanístico", "emoji": "🧩", "unit": "%",     "scale": "pct100",  "higher_better": True,  "help": "% de predios que construyen menos de lo permitido (oportunidad)."},
    {"key": "edad",           "label": "Edad del parque",       "cat": "Urbanístico", "emoji": "🏛️", "unit": "años",  "scale": "age",     "higher_better": False, "help": "Antigüedad media de las construcciones."},
]


def _ie_meta(code: str, label: str, cat: str, emoji: str, help_: str) -> Dict[str, Any]:
    return {"key": code, "label": label, "cat": cat, "emoji": emoji, "unit": "0-100",
            "scale": "score", "higher_better": True, "help": help_, "ie": True}


def _catalog() -> List[Dict[str, Any]]:
    layers = list(_BASE_LAYERS)
    for code, label, cat, emoji, help_ in _IE_LAYERS:
        layers.append(_ie_meta(code, label, cat, emoji, help_))
    return layers


_LAYER_BY_KEY = {l["key"]: l for l in _catalog()}


@router.get("/api/mapa/capas")
async def mapa_capas(request: Request):
    """Catálogo de capas disponibles para el choropleth (para el selector '¿qué pinto?')."""
    return {"capas": _catalog(), "n": len(_catalog())}


def _stats(vals: List[float]) -> Dict[str, Any]:
    if not vals:
        return {"min": None, "p50": None, "max": None, "n": 0}
    s = sorted(vals)
    n = len(s)
    return {"min": round(s[0], 2), "p50": round(s[n // 2], 2), "max": round(s[-1], 2), "n": n}


@router.get("/api/mapa/capa/{key}")
async def mapa_capa(key: str, request: Request):
    """Valores de UNA capa por colonia → {colonia_id: valor}. El frontend los inyecta al GeoJSON y repinta."""
    meta = _LAYER_BY_KEY.get(key)
    if not meta:
        raise HTTPException(404, f"Capa desconocida: {key}")
    db = request.app.state.db
    values: Dict[str, float] = {}
    fuente = None
    es_estimado = None

    if meta.get("ie"):
        # Índice IE (0-100) desde el sistema IE — zone_id == colonia_id (slug).
        async for d in db.ie_scores.find(
                {"code": key, "value": {"$ne": None}, "is_stub": {"$ne": True}},
                {"_id": 0, "zone_id": 1, "value": 1}):
            zid = d.get("zone_id")
            if zid and isinstance(d.get("value"), (int, float)):
                values[zid] = round(float(d["value"]), 1)
        fuente = "sistema_ie"
        es_estimado = True
    elif key in ("valor", "avm", "plusvalia", "gentrificacion"):
        async for d in db.colonia_valoracion.find({}, {"_id": 0, "colonia_id": 1, "valor_catastral_m2": 1,
                                                        "market_m2": 1, "plusvalia": 1, "gentrification": 1}):
            cid = d.get("colonia_id")
            if not cid:
                continue
            v = None
            if key == "valor":
                v = d.get("valor_catastral_m2")
            elif key == "avm":
                mm = d.get("market_m2") or {}
                v = mm.get("valor")
                if es_estimado is None:
                    es_estimado = mm.get("es_estimado")
            elif key == "plusvalia":
                pl = d.get("plusvalia") or {}
                ser = pl.get("series") or []
                # Promedio anual de apreciación (más diferenciado por alcaldía que el último año ya convergido).
                yoys = [s.get("yoy_pct") for s in ser if isinstance(s.get("yoy_pct"), (int, float))]
                if yoys:
                    v = sum(yoys) / len(yoys)
                    es_estimado = pl.get("es_estimado", True)
            elif key == "gentrificacion":
                g = d.get("gentrification") or {}
                v = g.get("score")
                es_estimado = g.get("es_estimado", True)
            if isinstance(v, (int, float)):
                values[cid] = round(float(v), 2)
        fuente = "colonia_valoracion"
    elif key in ("far", "subutilizado", "edad"):
        field = {"far": "far_medio", "subutilizado": "pct_subutilizado", "edad": "edad_media_parque"}[key]
        async for d in db.colonia_catastro_byid.find({field: {"$ne": None}},
                                                      {"_id": 0, "colonia_id": 1, field: 1, "far_es_estimado": 1}):
            cid = d.get("colonia_id")
            v = d.get(field)
            if cid and isinstance(v, (int, float)):
                values[cid] = round(float(v), 2)
                if es_estimado is None:
                    es_estimado = d.get("far_es_estimado", True)
        fuente = "colonia_catastro_byid"

    stats = _stats(list(values.values()))
    return {
        "key": key,
        "meta": {**meta, "fuente": fuente, "es_estimado": bool(es_estimado) if es_estimado is not None else None},
        "values": values,
        "stats": stats,
    }
