"""
plusvalia_grid_engine — PLUSVALÍA HIPER-SEGMENTADA (colección `plusvalia_grid`).
═══════════════════════════════════════════════════════════════════════════════
Roadmap de métricas · patrón de grid_engine (un doc por celda métrica×dimensión, materializado
en su colección). Aquí la métrica es PLUSVALÍA (apreciación anual %) segmentada por:

    colonia  ×  atributo/amenidad  ×  tipo-desarrollo / price-tier

Cada celda combina DOS señales que YA existen (REUSA, no reinventa):

  1. BASE SHF  → `shf_engine.get_appreciation(db, alcaldia)` da la plusvalía anual OFICIAL de la
     ALCALDÍA de la colonia (5 alcaldías con índice propio, las demás heredan CDMX estatal). Es el
     único ancla de apreciación por zona que tenemos. `factor_shf` = ese % anual.  base="derivado_shf".

  2. AJUSTE HEDÓNICO  → `dmx_hedonic_atom.fit_and_rank(db, scope={geo.colonia_id})` da el impacto en
     precio/m² de cada atributo (roof/terraza/estacionamiento/…) controlando por colonia. Un atributo
     que carga prima durable sobre el precio/m² tiene una plusvalía esperada por encima de la base de
     la zona → `ajuste_hedonico` = ese % (impacto_pct_precio_m2). base="derivado_hedonico".

valor_pct = factor_shf × (1 + ajuste_hedonico/100)   (si hay hedónico para el atributo)
          = factor_shf                                (celda base de la colonia, atributo=None)

NO se inventa dato: cada celda trae fuente · base · es_estimado · confianza · n. La plusvalía por
colonia NO existe en ninguna fuente (SHF es por alcaldía) → es_estimado=True siempre que se derive
de la alcaldía. Si no hay hedónico suficiente (n<30) para el atributo, la celda cae a la base SHF y
marca ajuste_hedonico=None + confianza degradada (sin fingir granularidad que no tenemos).

Fuente única — el motor SOLO orquesta shf_engine + dmx_hedonic_atom (grep before build). El price-tier
segmenta el scope del hedónico (SHF no tiene tier granular → se marca).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.plusvalia_grid")

COLLECTION = "plusvalia_grid"

# Atributos principales que reporta el ranker hedónico (label del ranker → clave estable de la grid).
# El ranker (dmx_hedonic_atom._to_ranker) usa estos labels en español.
ATRIBUTO_LABELS: Dict[str, str] = {
    "roof": "Roof garden privado",
    "terraza": "Terraza",
    "balcon": "Balcón",
    "bodega": "Bodega",
    "estacionamiento": "2+ estacionamientos",
}
# Atributos principales a sembrar (además de la celda base sin atributo).
ATRIBUTOS_PRINCIPALES = ["roof", "terraza", "estacionamiento", "balcon", "bodega"]

# Price-tiers canónicos (REUSA los del cubo — mismas fronteras que cube_olap_engine).
try:
    from cube_olap_engine import PRICE_TIER_KEYS as _CUBE_TIER_KEYS
    PRICE_TIER_KEYS = tuple(_CUBE_TIER_KEYS)
except Exception:  # pragma: no cover — fail-soft si cambia el import
    PRICE_TIER_KEYS = ("entry", "mid", "luxury", "ultraluxury")

# tipo-desarrollo (property_type) canónico del cubo — units.property_type está vacío hoy, por eso
# el slice operativo de "tipo-desarrollo" que SÍ tiene dato es price-tier. Se deja el vocab para
# el día que se pueble property_type (build for endstate).
try:
    from cube_olap_engine import PROPERTY_TYPES as _CUBE_PROPERTY_TYPES
    PROPERTY_TYPES = tuple(_CUBE_PROPERTY_TYPES)
except Exception:  # pragma: no cover
    PROPERTY_TYPES = ("depto", "casa", "loft", "town", "ph")

# n mínimo del hedónico (mismo umbral que dmx_hedonic_atom.MIN_SAMPLE).
try:
    from dmx_hedonic_atom import MIN_SAMPLE as _HED_MIN
except Exception:  # pragma: no cover
    _HED_MIN = 30


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cell_id(colonia_id: str, atributo: Optional[str], tipo: Optional[str]) -> str:
    parts = [colonia_id, f"attr={atributo or '_base'}"]
    if tipo:
        parts.append(f"tipo={tipo}")
    return "|".join(parts)


def _confianza(base: str, es_propio: bool, n_hedonico: Optional[int], significativo: Optional[bool]) -> str:
    """Confianza honesta de la celda:
      · base SHF de una alcaldía con índice PROPIO → media (dato oficial de zona, no de colonia).
      · base SHF heredada del estatal CDMX → baja (ni siquiera es de la alcaldía).
      · ajuste hedónico con n≥umbral y coef significativo → puede subir a media/alta.
    Nunca 'alta' si la plusvalía se derivó de la alcaldía (es_estimado por definición)."""
    if base == "derivado_hedonico":
        if n_hedonico and n_hedonico >= (_HED_MIN * 3) and significativo:
            return "media"
        if n_hedonico and n_hedonico >= _HED_MIN and significativo:
            return "media"
        return "baja"
    # base pura SHF
    return "media" if es_propio else "baja"


def _titlecase_id(colonia_id: str) -> str:
    return " ".join(w.capitalize() for w in str(colonia_id).replace("_", "-").split("-"))


async def _colonia_meta(db, colonia_id: str) -> Dict[str, Any]:
    """Metadata de la colonia. Fuente 1: catálogo `colonias`. Fuente 2 (fallback honesto): el
    propio ÁTOMO `dmx_units` (geo.alcaldia) — muchas colonias con unidades no están en el catálogo,
    y la alcaldía del átomo es dato real, no inventado. name deriva del id si falta."""
    c = await db.colonias.find_one(
        {"id": colonia_id}, {"_id": 0, "id": 1, "name": 1, "alcaldia": 1})
    name = (c or {}).get("name")
    alcaldia = (c or {}).get("alcaldia")
    if not alcaldia or not name:
        try:
            from dmx_hedonic_atom import UNITS as _U
        except Exception:
            _U = "dmx_units"
        u = await db[_U].find_one({"geo.colonia_id": colonia_id}, {"_id": 0, "geo": 1})
        geo = (u or {}).get("geo") or {}
        alcaldia = alcaldia or geo.get("alcaldia")
    if not name:
        name = _titlecase_id(colonia_id)
    if not (c or alcaldia):
        return {}  # colonia realmente inexistente (ni catálogo ni átomo)
    return {"id": colonia_id, "name": name, "alcaldia": alcaldia}


async def _shf_base(db, alcaldia: Optional[str]) -> Dict[str, Any]:
    """Ancla de plusvalía anual (%) de la alcaldía. REUSA shf_engine.get_appreciation."""
    try:
        from shf_engine import get_appreciation
        a = await get_appreciation(db, alcaldia=alcaldia)
        return {
            "factor_shf": a.get("plusvalia_anual_pct"),
            "es_propio": bool(a.get("es_propio")),
            "alcaldia_indice": a.get("alcaldia") or a.get("zona"),
            "periodo": a.get("periodo"),
            "fuente_shf": a.get("fuente"),
        }
    except Exception as e:
        log.warning(f"[plusvalia_grid] shf {alcaldia}: {e}")
        return {"factor_shf": None, "es_propio": False, "alcaldia_indice": None,
                "periodo": None, "fuente_shf": None}


# Banda sana para el coeficiente hedónico (%): un premio de precio por-atributo fuera de esto es
# artefacto de una regresión inestable (colinealidad en un scope chico), NO señal real → se descarta.
_HED_SANE_ABS = 40.0
# Clamp final del ajuste que llega a la plusvalía (evita que un premio de precio distorsione el rate).
_ADJ_CLAMP = 25.0


def _rank_to_labels(r: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    por_label: Dict[str, Dict[str, Any]] = {}
    for item in (r.get("amenity_ranker") or []):
        por_label[item.get("atributo")] = {
            "impacto_pct": item.get("impacto_pct_precio_m2"),
            "significativo": bool(item.get("significativo")),
            "p_value": item.get("p_value"),
        }
    return por_label


async def _hedonic_ranker(db, colonia_id: str, price_tier: Optional[str]) -> Dict[str, Any]:
    """Prima hedónica por atributo (% durable sobre precio/m²). REUSA dmx_hedonic_atom.fit_and_rank.

    Fuente principal = modelo de CIUDAD (empty scope, n grande, controla por colonia one-hot →
    coeficientes ESTABLES; es el que ya consumen los otros portales). Se PREFIERE la ciudad porque
    la regresión por-colonia sobre una muestra chica produce coeficientes inestables (p.ej. −94% en un
    roof) que NO son señal real. Solo se usa el coeficiente de la colonia cuando cae en banda sana y
    es significativo (override marcado). price_tier segmenta el scope por precio del átomo.

    Devuelve {sample_size, por_label:{label:{impacto_pct, significativo, p_value, origen}}}."""
    try:
        import dmx_hedonic_atom as hed
    except Exception as e:
        log.warning(f"[plusvalia_grid] hedonic import {colonia_id}: {e}")
        return {"sample_size": 0, "por_label": {}, "available": False}

    # scope de colonia (× price-tier)
    scope: Dict[str, Any] = {"geo.colonia_id": colonia_id}
    if price_tier and price_tier != "all":
        lo, hi = _tier_bounds(price_tier)
        if lo is not None:
            rng: Dict[str, Any] = {"$gte": lo}
            if hi is not None:
                rng["$lt"] = hi
            scope["$or"] = [
                {"commercial.precio_lista_mxn": rng},
                {"commercial.precio_cierre_mxn": rng},
            ]

    try:
        r_city = await hed.fit_and_rank(db, None, persist=False)
    except Exception as e:
        log.warning(f"[plusvalia_grid] hedonic city: {e}")
        r_city = {}
    try:
        r_col = await hed.fit_and_rank(db, scope, persist=False)
    except Exception as e:
        log.warning(f"[plusvalia_grid] hedonic {colonia_id}/{price_tier}: {e}")
        r_col = {}

    city_labels = _rank_to_labels(r_city)
    col_labels = _rank_to_labels(r_col)

    por_label: Dict[str, Dict[str, Any]] = {}
    for label in set(city_labels) | set(col_labels):
        city = city_labels.get(label)
        col = col_labels.get(label)
        chosen, origen = None, None
        # Override con la colonia SOLO si es sana + significativa.
        if col and col.get("impacto_pct") is not None and col.get("significativo") \
                and abs(col["impacto_pct"]) <= _HED_SANE_ABS:
            chosen, origen = col, "colonia"
        elif city and city.get("impacto_pct") is not None and abs(city["impacto_pct"]) <= _HED_SANE_ABS:
            chosen, origen = city, "ciudad"
        if chosen:
            por_label[label] = {
                "impacto_pct": chosen["impacto_pct"],
                "significativo": chosen.get("significativo"),
                "p_value": chosen.get("p_value"),
                "origen": origen,
            }
    return {
        "sample_size": r_col.get("sample_size") or 0,
        "city_sample": r_city.get("sample_size") or 0,
        "available": bool(r_city.get("available") or r_col.get("available")),
        "por_label": por_label,
    }


def _tier_bounds(tier: str):
    """Fronteras MXN del price-tier (REUSA la tabla del cubo si disponible)."""
    try:
        from cube_olap_engine import PRICE_TIERS
        for key, lo, hi in PRICE_TIERS:
            if key == tier:
                return (lo, None if hi == float("inf") else hi)
    except Exception:
        pass
    fallback = {"entry": (0, 3_000_000), "mid": (3_000_000, 8_000_000),
                "luxury": (8_000_000, 20_000_000), "ultraluxury": (20_000_000, None)}
    return fallback.get(tier, (None, None))


def _round_pct(v):
    return round(v, 2) if isinstance(v, (int, float)) else None


async def compute_cell(db, colonia_id: str, atributo: Optional[str] = None,
                       tipo: Optional[str] = None) -> Dict[str, Any]:
    """Computa UNA celda de plusvalía con procedencia completa.

    colonia_id : colonia (de las que tienen hedónico).
    atributo   : clave estable (roof/terraza/estacionamiento/balcon/bodega) o None → celda BASE.
    tipo       : price-tier (entry/mid/luxury/ultraluxury) o property_type o None → sin segmentar.
    """
    meta = await _colonia_meta(db, colonia_id)
    if not meta.get("name"):
        return {"error": f"colonia desconocida: {colonia_id}"}
    alcaldia = meta.get("alcaldia")

    shf = await _shf_base(db, alcaldia)
    factor_shf = shf["factor_shf"]

    # ¿tipo es un price-tier? (segmenta el hedónico) — property_type se acepta pero hoy no filtra el átomo.
    price_tier = tipo if (tipo in PRICE_TIER_KEYS) else None

    base = "derivado_shf"
    ajuste_hedonico: Optional[float] = None       # % clamp que entra a la plusvalía
    prima_precio_pct: Optional[float] = None       # prima de precio/m² cruda del atributo (antes del clamp)
    origen_hedonico: Optional[str] = None          # 'ciudad' | 'colonia'
    n_hedonico = 0
    n_ciudad = 0
    significativo: Optional[bool] = None
    fuente: List[str] = []
    if shf.get("fuente_shf"):
        fuente.append(str(shf["fuente_shf"]))

    if atributo:
        label = ATRIBUTO_LABELS.get(atributo)
        hed = await _hedonic_ranker(db, colonia_id, price_tier)
        n_hedonico = hed.get("sample_size") or 0
        n_ciudad = hed.get("city_sample") or 0
        entry = (hed.get("por_label") or {}).get(label) if label else None
        if entry and entry.get("impacto_pct") is not None:
            prima_precio_pct = _round_pct(entry["impacto_pct"])
            # el ajuste que modula el rate de plusvalía = prima de precio recortada a banda defendible.
            ajuste_hedonico = _round_pct(max(-_ADJ_CLAMP, min(_ADJ_CLAMP, entry["impacto_pct"])))
            significativo = entry.get("significativo")
            origen_hedonico = entry.get("origen")
            base = "derivado_hedonico"
            src = "dmx_hedonic_atom (dmx_units · modelo ciudad)" if origen_hedonico == "ciudad" \
                else "dmx_hedonic_atom (dmx_units · modelo colonia)"
            fuente.append(src)
        # si no hay prima hedónica utilizable → la celda cae a la base SHF (ajuste=None), honesto.

    # valor_pct = plusvalía base de la zona × tilt del atributo (prima de precio recortada).
    if factor_shf is None:
        valor_pct = None
    elif ajuste_hedonico is not None:
        valor_pct = _round_pct(factor_shf * (1 + ajuste_hedonico / 100.0))
    else:
        valor_pct = _round_pct(factor_shf)

    # confianza: para la prima hedónica lo que importa es el n del modelo que se usó (ciudad o colonia).
    n_confianza = n_ciudad if origen_hedonico == "ciudad" else n_hedonico
    confianza = _confianza(base, shf.get("es_propio", False), n_confianza, significativo)

    notas = []
    if base == "derivado_shf" and atributo:
        notas.append("sin hedónico suficiente para el atributo → plusvalía base de la zona")
    if price_tier:
        notas.append(f"hedónico segmentado a price-tier '{price_tier}'; SHF no tiene tier granular (base de zona)")
    if not shf.get("es_propio"):
        notas.append("plusvalía heredada del factor estatal CDMX (alcaldía sin índice SHF propio)")

    return {
        "_id": _cell_id(colonia_id, atributo, tipo),
        "colonia_id": colonia_id,
        "colonia_name": meta.get("name"),
        "alcaldia": alcaldia,
        "atributo": atributo,                     # None = celda base
        "atributo_label": ATRIBUTO_LABELS.get(atributo) if atributo else None,
        "tipo": tipo,                             # price-tier / property_type / None
        "es_price_tier": bool(price_tier),
        "valor_pct": valor_pct,                   # plusvalía anual esperada (%)
        "base": base,                             # derivado_shf | derivado_hedonico
        "factor_shf": _round_pct(factor_shf),     # ancla de zona (alcaldía)
        "ajuste_hedonico": ajuste_hedonico,       # % (recortado) que modula el rate de plusvalía
        "prima_precio_pct": prima_precio_pct,     # prima de precio/m² cruda del atributo (pre-clamp)
        "origen_hedonico": origen_hedonico,       # 'ciudad' | 'colonia' | None
        "es_estimado": True,                      # SIEMPRE True: plusvalía por colonia no existe (derivada de alcaldía)
        "fuente": fuente or ["shf_engine"],
        "confianza": confianza,                   # alta | media | baja
        "n": n_hedonico,                          # muestra del hedónico (0 en celdas base puras)
        "alcaldia_indice": shf.get("alcaldia_indice"),
        "periodo": shf.get("periodo"),
        "notas": notas,
        "computed_at": _iso(),
    }


async def upsert_cell(db, colonia_id: str, atributo: Optional[str] = None,
                      tipo: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Computa y persiste UNA celda en `plusvalia_grid` (idempotente por _id)."""
    doc = await compute_cell(db, colonia_id, atributo, tipo)
    if doc.get("error"):
        return None
    await db[COLLECTION].update_one({"_id": doc["_id"]}, {"$set": doc}, upsert=True)
    return doc


async def get_cell(db, colonia_id: str, atributo: Optional[str] = None,
                   tipo: Optional[str] = None) -> Dict[str, Any]:
    """Lee la celda de `plusvalia_grid`; si no está materializada, la computa al vuelo (fail-soft)."""
    doc = await db[COLLECTION].find_one({"_id": _cell_id(colonia_id, atributo, tipo)}, {"_id": 0})
    if doc:
        return {**doc, "cache": "grid"}
    live = await compute_cell(db, colonia_id, atributo, tipo)
    return {**live, "cache": "live"}


async def get_colonia(db, colonia_id: str, tipo: Optional[str] = None) -> Dict[str, Any]:
    """Panel de plusvalía por atributo de una colonia: celda base + una celda por atributo principal.
    Lee de la grid lo materializado y completa al vuelo lo que falte (nunca inventa)."""
    base = await get_cell(db, colonia_id, None, tipo)
    if base.get("error"):
        return base
    por_atributo: List[Dict[str, Any]] = []
    for attr in ATRIBUTOS_PRINCIPALES:
        c = await get_cell(db, colonia_id, attr, tipo)
        if c.get("error"):
            continue
        por_atributo.append({
            "atributo": attr,
            "atributo_label": c.get("atributo_label"),
            "valor_pct": c.get("valor_pct"),
            "base": c.get("base"),
            "ajuste_hedonico": c.get("ajuste_hedonico"),
            "prima_precio_pct": c.get("prima_precio_pct"),
            "origen_hedonico": c.get("origen_hedonico"),
            "factor_shf": c.get("factor_shf"),
            "es_estimado": c.get("es_estimado"),
            "confianza": c.get("confianza"),
            "n": c.get("n"),
            "fuente": c.get("fuente"),
        })
    # ordena por plusvalía esperada desc (los atributos que más revalorizan arriba)
    por_atributo.sort(key=lambda x: (x["valor_pct"] if isinstance(x["valor_pct"], (int, float)) else -1), reverse=True)
    return {
        "colonia_id": colonia_id,
        "colonia_name": base.get("colonia_name"),
        "alcaldia": base.get("alcaldia"),
        "tipo": tipo,
        "plusvalia_base_pct": base.get("valor_pct"),      # plusvalía anual de la zona (SHF)
        "factor_shf": base.get("factor_shf"),
        "es_estimado": True,
        "confianza_base": base.get("confianza"),
        "periodo": base.get("periodo"),
        "por_atributo": por_atributo,
        "fuente": base.get("fuente"),
        "nota": "Plusvalía anual esperada: base SHF de la alcaldía × prima hedónica del atributo (dmx_units). "
                "es_estimado=True: la plusvalía por colonia se deriva de la alcaldía (SHF no la publica granular).",
        "computed_at": _iso(),
    }


async def colonias_con_hedonico(db, min_units: Optional[int] = None) -> List[Dict[str, Any]]:
    """Colonias que tienen átomo suficiente para el hedónico (n≥umbral) — el conjunto a sembrar.
    REUSA dmx_units (fuente del hedónico). Devuelve [{colonia_id, n, alcaldia, name}]."""
    thr = min_units if min_units is not None else _HED_MIN
    try:
        from dmx_hedonic_atom import UNITS
    except Exception:
        UNITS = "dmx_units"
    pipe = [
        {"$match": {"geo.colonia_id": {"$ne": None}}},
        {"$group": {"_id": "$geo.colonia_id", "n": {"$sum": 1}, "alc": {"$first": "$geo.alcaldia"}}},
        {"$match": {"n": {"$gte": thr}}},
        {"$sort": {"n": -1}},
    ]
    out: List[Dict[str, Any]] = []
    async for r in db[UNITS].aggregate(pipe):
        meta = await _colonia_meta(db, r["_id"])
        out.append({"colonia_id": r["_id"], "n": r["n"],
                    "alcaldia": meta.get("alcaldia") or r.get("alc"),
                    "name": meta.get("name")})
    return out


async def seed_grid(db, atributos: Optional[List[str]] = None,
                    tipos: Optional[List[Optional[str]]] = None,
                    min_units: Optional[int] = None) -> Dict[str, Any]:
    """Siembra la grid: por cada colonia con hedónico × (celda base + atributos principales) × tipos.
    Idempotente. Devuelve conteo de celdas materializadas + colonias tocadas."""
    atributos = atributos if atributos is not None else ATRIBUTOS_PRINCIPALES
    tipos = tipos if tipos is not None else [None]   # por defecto sin segmentar por tipo
    cols = await colonias_con_hedonico(db, min_units=min_units)
    sembradas = 0
    for c in cols:
        cid = c["colonia_id"]
        for tipo in tipos:
            # celda base (atributo=None) + una por atributo principal
            for attr in [None] + list(atributos):
                doc = await upsert_cell(db, cid, attr, tipo)
                if doc:
                    sembradas += 1
    return {
        "ok": True,
        "colonias": len(cols),
        "colonias_ids": [c["colonia_id"] for c in cols],
        "atributos": atributos,
        "tipos": tipos,
        "celdas_sembradas": sembradas,
        "coleccion": COLLECTION,
    }
