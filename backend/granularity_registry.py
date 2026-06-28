"""REGISTRO ÚNICO DE GRANULARIDAD — la fuente de verdad de TODA la granularidad de los motores y dónde vive.

Responde la pregunta del founder: "¿se refleja toda la granularidad (118+ scores, 160+ features) en superadmin?".
Declara cada familia de scores/features: en qué colección vive, cómo se consulta por entidad, y si se PERSISTE o es
EFÍMERA (se calcula y se tira → invisible para analítica). Dos funciones:
  - coverage(db): el MAPA — por cada familia: docs, entidades, frescura → el superadmin ve qué granularidad fluye y
    cuál está APAGADA (0 docs) o es efímera.
  - inspect_entity(db, tipo, id): TODOS los scores/features de UNA entidad (unidad/zona/dev/lead/asesor/comprador) en
    un solo lugar — la "ficha de granularidad" que antes no existía.

Campos verificados contra la BD real (no inflados). Para sumar una nueva familia: agrega una fila aquí (cero-huérfanos).
"""
from typing import Any, Dict, List, Optional

# Cada familia PERSISTIDA: key, label, portal, entity_type, collection, id_field, filtro extra opcional.
REGISTRY: List[Dict[str, Any]] = [
    # ── ZONA (lo mejor poblado) ──
    {"key": "zone_score", "label": "Score de zona (A–F) + 6 componentes", "portal": "marketplace", "entity_type": "zona", "collection": "zone_scores", "id_field": "zone_id"},
    {"key": "ie_scores", "label": "Índices IE por receta (multi-receta)", "portal": "superadmin", "entity_type": "zona", "collection": "ie_scores", "id_field": "zone_id"},
    {"key": "risk_zone", "label": "Riesgo de zona (crimen/natural/título/percepción)", "portal": "marketplace", "entity_type": "zona", "collection": "risk_scores_zone", "id_field": "zone_id"},
    {"key": "zone_subscores", "label": "Subscores de zona (seguridad/transporte/educación/…)", "portal": "marketplace", "entity_type": "zona", "collection": "zone_subscores", "id_field": "zone_id"},
    {"key": "climate_zone", "label": "Migración climática + riesgo físico", "portal": "marketplace", "entity_type": "zona", "collection": "climate_migration_heatmap", "id_field": "zone_id"},
    # ── DESARROLLO / PROYECTO ──
    {"key": "health_project", "label": "Salud del proyecto (4 dims)", "portal": "dev", "entity_type": "desarrollo", "collection": "health_scores", "id_field": "entity_id", "filter": {"entity_type": "project"}},
    {"key": "inversion", "label": "Score de inversión (AAA–D)", "portal": "inversionista", "entity_type": "desarrollo", "collection": "score_inversion_cache", "id_field": "score_id"},
    # ── UNIDAD ──
    {"key": "avm", "label": "Valuación AVM + FSD (por propiedad)", "portal": "inversionista", "entity_type": "unidad", "collection": "avm_predictions", "id_field": "property_id"},
    {"key": "unit_atom", "label": "Átomo de unidad (taxonomía 14 grupos + completitud)", "portal": "dev", "entity_type": "unidad", "collection": "dmx_units", "id_field": "unit_id"},
    {"key": "cube_unit", "label": "Cubo OLAP (medidas por unidad/tier)", "portal": "superadmin", "entity_type": "unidad", "collection": "cube_aggregations", "id_field": "tier_id"},
    # ── COMPRADOR / LEAD ──
    {"key": "buyer_score", "label": "Buyer score (7 dims)", "portal": "comprador", "entity_type": "comprador", "collection": "buyer_scores", "id_field": "user_id"},
    {"key": "taste", "label": "Gusto del comprador (materializado)", "portal": "comprador", "entity_type": "comprador", "collection": "visitor_taste_materialized", "id_field": "visitor_id"},
    {"key": "fit", "label": "Fit lead↔dev (6 dims)", "portal": "asesor", "entity_type": "lead", "collection": "fit_cache", "id_field": "lead_id"},
    {"key": "lead_match", "label": "Lead match score", "portal": "asesor", "entity_type": "lead", "collection": "lead_match_scores", "id_field": "lead_id"},
    # ── ASESOR ──
    {"key": "asesor_trust", "label": "Trust score del asesor (6 componentes)", "portal": "asesor", "entity_type": "asesor", "collection": "asesor_trust_scores", "id_field": "user_id"},
    {"key": "asesor_metrics", "label": "Métricas diarias del asesor (pipeline/conversión/actividad)", "portal": "asesor", "entity_type": "asesor", "collection": "asesor_metrics_snapshots", "id_field": "asesor_id"},
]

# Familias EFÍMERAS: el motor las calcula y NO las persiste → invisibles para analítica. Declaradas para que el
# superadmin SEPA que existen (y sean candidatas a persistir si se quieren históricos/auditoría).
EPHEMERAL: List[Dict[str, str]] = [
    {"key": "dmx_project_score", "label": "Score de proyecto (1 número, 5 dims)", "entity_type": "desarrollo", "engine": "dmx_project_score.py"},
    {"key": "lead_score", "label": "Score de intención del lead", "entity_type": "lead", "engine": "atlax_engine"},
    {"key": "churn_risk", "label": "Riesgo de abandono del comprador", "entity_type": "comprador", "engine": "buyer_signals"},
    {"key": "hook_score", "label": "Hook score de copy (Studio, 4 dims)", "entity_type": "contenido", "engine": "studio"},
    {"key": "absorcion_ritmo", "label": "Absorción + ritmo de venta del dev", "entity_type": "desarrollo", "engine": "dev_market"},
]

_TS_FIELDS = ("updated_at", "computed_at", "generated_at", "created_at", "last_activity_at", "ts", "date")
_ENTITY_TYPES = sorted({r["entity_type"] for r in REGISTRY})


def _ts(doc: Dict[str, Any]) -> Optional[str]:
    for f in _TS_FIELDS:
        if doc.get(f):
            return str(doc[f])
    return None


async def coverage(db) -> Dict[str, Any]:
    """El MAPA de granularidad: por cada familia → docs, entidades distintas, frescura, estado (vivo/apagado/efímero)."""
    fams = []
    for r in REGISTRY:
        coll, idf, filt = r["collection"], r["id_field"], r.get("filter") or {}
        try:
            n = await db[coll].count_documents(filt)
            entidades = len(await db[coll].distinct(idf, filt)) if n else 0
            last = await db[coll].find_one(filt, sort=[("_id", -1)])
            last = {k: v for k, v in (last or {}).items() if k != "_id"}
            estado = "vivo" if n > 0 else "apagado"
        except Exception:
            n, entidades, last, estado = 0, 0, {}, "error"
        fams.append({**{k: r[k] for k in ("key", "label", "portal", "entity_type", "collection")},
                     "docs": n, "entidades": entidades, "ultima_actualizacion": _ts(last), "estado": estado})
    persisted_live = sum(1 for f in fams if f["estado"] == "vivo")
    return {
        "familias": fams,
        "efimeras": EPHEMERAL,
        "resumen": {
            "familias_persistidas": len(REGISTRY),
            "persistidas_vivas": persisted_live,
            "persistidas_apagadas": len(REGISTRY) - persisted_live,
            "familias_efimeras": len(EPHEMERAL),
            "entity_types": _ENTITY_TYPES,
        },
    }


async def inspect_entity(db, entity_type: str, entity_id: str) -> Dict[str, Any]:
    """TODOS los scores/features de UNA entidad, de todas las familias que aplican a su tipo. La ficha de granularidad."""
    found, missing = [], []
    for r in REGISTRY:
        if r["entity_type"] != entity_type:
            continue
        coll, idf, filt = r["collection"], r["id_field"], dict(r.get("filter") or {})
        q = {**filt, idf: entity_id}
        try:
            docs = [{k: v for k, v in d.items() if k != "_id"} async for d in db[coll].find(q).limit(50)]
        except Exception:
            docs = []
        if docs:
            found.append({"key": r["key"], "label": r["label"], "portal": r["portal"], "collection": coll,
                          "registros": len(docs), "datos": docs if len(docs) <= 10 else docs[:10]})
        else:
            missing.append({"key": r["key"], "label": r["label"], "collection": coll})
    return {"entity_type": entity_type, "entity_id": entity_id, "con_dato": found, "sin_dato": missing,
            "cobertura": f"{len(found)}/{len(found) + len(missing)}"}
