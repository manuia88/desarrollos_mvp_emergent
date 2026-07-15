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
    {"key": "zone_subscores", "label": "Subscores de zona (seguridad/transporte/educación/…)", "portal": "marketplace", "entity_type": "zona", "collection": "zone_scores", "id_field": "zone_id", "filter": {"subscores_real": {"$exists": True, "$ne": {}}}, "note": "embebidos en zone_scores.subscores_real"},
    {"key": "climate_zone", "label": "Migración climática + riesgo físico", "portal": "marketplace", "entity_type": "zona", "collection": "climate_migration_heatmap", "id_field": "zone_id"},
    # ── DESARROLLO / PROYECTO ──
    {"key": "health_project", "label": "Salud del proyecto (4 dims)", "portal": "dev", "entity_type": "desarrollo", "collection": "health_scores", "id_field": "entity_id", "filter": {"entity_type": "project"}},
    {"key": "inversion", "label": "Score de inversión (AAA–D)", "portal": "inversionista", "entity_type": "desarrollo", "collection": "score_inversion_cache", "id_field": "score_id"},
    {"key": "project_score", "label": "Score del proyecto (1 número, 5 dims) — histórico", "portal": "dev", "entity_type": "desarrollo", "collection": "score_snapshots", "id_field": "entity_id", "filter": {"family": "dmx_project_score"}},
    # ── MOLDE (Catálogo de Moldes, 07-15) ──
    {"key": "molde_biografia", "label": "Catálogo de Moldes: biografía (nació/agotó/revivió) + planos anclados", "portal": "superadmin", "entity_type": "molde", "collection": "dmx_prototypes", "id_field": "prototype_id"},
    {"key": "molde_programa", "label": "Programa arquitectónico por molde (espacios del plano + planta tipo)", "portal": "superadmin", "entity_type": "molde", "collection": "molde_programa", "id_field": "prototype_id"},
    {"key": "cotejo_fuentes", "label": "Cotejo multi-fuente (lista ⨯ plano ⨯ brochure): verificados y contradicciones", "portal": "superadmin", "entity_type": "desarrollo", "collection": "cotejo_datos", "id_field": "development_id"},
    # ── UNIDAD ──
    {"key": "avm", "label": "Valuación AVM + FSD (por propiedad)", "portal": "inversionista", "entity_type": "unidad", "collection": "avm_predictions", "id_field": "property_id"},
    {"key": "unit_atom", "label": "Átomo de unidad (taxonomía 14 grupos + completitud)", "portal": "dev", "entity_type": "unidad", "collection": "dmx_units", "id_field": "unit_id"},
    {"key": "cube_unit", "label": "Cubo OLAP (medidas por unidad/tier)", "portal": "superadmin", "entity_type": "unidad", "collection": "cube_aggregations", "id_field": "tier_id"},
    # ── COMPRADOR / LEAD ──
    {"key": "buyer_score", "label": "Buyer score (7 dims)", "portal": "comprador", "entity_type": "comprador", "collection": "buyer_scores", "id_field": "user_id"},
    {"key": "taste", "label": "Gusto del comprador (materializado)", "portal": "comprador", "entity_type": "comprador", "collection": "visitor_taste_materialized", "id_field": "visitor_id"},
    {"key": "fit", "label": "Fit lead↔dev (6 dims) — cache 30 min on-demand", "portal": "asesor", "entity_type": "lead", "collection": "fit_cache", "id_field": "lead_id", "kind": "cache"},
    {"key": "lead_match", "label": "Lead match score", "portal": "asesor", "entity_type": "lead", "collection": "lead_match_scores", "id_field": "lead_id"},
    # ── ASESOR ──
    {"key": "asesor_trust", "label": "Trust score del asesor (6 componentes)", "portal": "asesor", "entity_type": "asesor", "collection": "asesor_trust_scores", "id_field": "user_id"},
    {"key": "asesor_metrics", "label": "Métricas diarias del asesor (pipeline/conversión/actividad)", "portal": "asesor", "entity_type": "asesor", "collection": "asesor_metrics_snapshots", "id_field": "asesor_id"},
]

# Familias EFÍMERAS: el motor las calcula y NO las persiste → invisibles para analítica. Declaradas para que el
# superadmin SEPA que existen (y sean candidatas a persistir si se quieren históricos/auditoría).
# dmx_project_score YA NO es efímero: el backfill lo persiste a score_snapshots (familia 'project_score' arriba).
# Estos quedan efímeros por DISEÑO (transitorios / heurística por-consulta) — declarados para que el superadmin sepa
# que existen. Persistirlos sería de bajo valor (no son scores de entidad estables).
EPHEMERAL: List[Dict[str, str]] = [
    {"key": "lead_score", "label": "Score de intención del lead (heurística por-consulta de Atlax)", "entity_type": "lead", "engine": "atlax_engine"},
    {"key": "churn_risk", "label": "Riesgo de abandono del comprador", "entity_type": "comprador", "engine": "buyer_signals"},
    {"key": "hook_score", "label": "Hook score de copy (Studio, 4 dims)", "entity_type": "contenido", "engine": "studio"},
    {"key": "absorcion_ritmo", "label": "Absorción + ritmo de venta (derivable de weekly_sales persistido)", "entity_type": "desarrollo", "engine": "dev_market"},
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
            estado = "vivo" if n > 0 else ("cache" if r.get("kind") == "cache" else "apagado")
        except Exception:
            n, entidades, last, estado = 0, 0, {}, "error"
        fams.append({**{k: r[k] for k in ("key", "label", "portal", "entity_type", "collection")},
                     "docs": n, "entidades": entidades, "ultima_actualizacion": _ts(last), "estado": estado,
                     "kind": r.get("kind"), "note": r.get("note")})
    persisted_live = sum(1 for f in fams if f["estado"] == "vivo")
    apagadas = sum(1 for f in fams if f["estado"] == "apagado")
    try:
        ie_recetas = len(await db.ie_scores.distinct("code"))
    except Exception:
        ie_recetas = 0
    return {
        "familias": fams,
        "efimeras": EPHEMERAL,
        "resumen": {
            "familias_persistidas": len(REGISTRY),
            "persistidas_vivas": persisted_live,
            "persistidas_apagadas": apagadas,
            "familias_cache": sum(1 for f in fams if f["estado"] == "cache"),
            "familias_efimeras": len(EPHEMERAL),
            "entity_types": _ENTITY_TYPES,
            # catálogo granular: el grueso de los "118 scores" son recetas IE; los "160 features" viven en el átomo.
            "ie_recetas": ie_recetas,
            "grupos_features_unidad": len(_UNIT_GROUPS),
        },
    }


_UNIT_GROUPS = ("position", "interior", "areas", "storage", "parking", "security", "finishes",
                "sustainability", "legal", "commercial", "demand", "investment", "geo", "amenity_keys")

# Diagnóstico de STUBS — qué fuente necesita cada receta y su estatus REAL (honesto, sin inventar).
SOURCE_STATUS = {
    "osm_overpass":       ("datos_escasos",   "Densidad de POIs (OSM + Google Places en ingesta masiva, varias colonias/mes para cubrir free tier). Stub = colonia aún sin cobertura — se llena con cada ingesta, no se fabrica."),
    "noaa":               ("token_gratis",    "Registrar token gratis NOAA CDO → env IE_NOAA_API_KEY."),
    "banxico":            ("token_gratis",    "Token gratis Banxico SIE → env IE_BANXICO_TOKEN."),
    "inegi":              ("token_gratis",    "Token gratis INEGI → env IE_INEGI_TOKEN."),
    "fgj_cdmx":           ("resource_id",     "resource_id CKAN datos.cdmx (FGJ carpetas) → env IE_FGJ_CDMX_RESOURCE_ID."),
    "locatel":            ("resource_id",     "resource_id CKAN (Locatel 0311) → env IE_LOCATEL_RESOURCE_ID."),
    "sacmex":             ("resource_id",     "resource_id CKAN (SACMEX cortes de agua) → env IE_SACMEX_RESOURCE_ID."),
    "datos_cdmx":         ("resource_id",     "resource_id CKAN (uso de suelo / fibra) → configurar en datos.cdmx."),
    "conagua_smn":        ("sin_fuente",      "CONAGUA SMN — conector aún stub, falta fuente real."),
    "cenapred":           ("sin_fuente",      "CENAPRED — falta fuente real (riesgo sísmico/inundación)."),
    "atlas_riesgos_cdmx": ("sin_fuente",      "Atlas de Riesgos CDMX — falta fuente real."),
    "gtfs_cdmx":          ("sin_fuente",      "GTFS CDMX — conector aún stub, falta feed real."),
    "airroi":             ("token_listo",     "AirROI — free tier, token YA en env.local (IE_AIRROI_API_KEY). Si hay stub: correr ingesta AirROI para las zonas."),
}
_STATUS_PRIORITY = ["pago", "sin_fuente", "token_gratis", "token_listo", "resource_id", "datos_escasos", "dato_interno"]


async def stub_diagnosis(db) -> Dict[str, Any]:
    """Por cada receta IE STUB: qué fuente necesita y su estatus accionable (token gratis / resource_id / dato escaso /
    sin fuente / pago / dato interno). Honesto: no fabrica. Es el mapa de 'qué falta para des-stubear'."""
    try:
        from score_engine import all_recipes
        recs = all_recipes()
    except Exception:
        recs = {}
    # Cuenta STUB (sin dato, gris) y PROXY (relleno etiquetado 'estimado' por falta de fuente).
    rows = await db.ie_scores.aggregate(
        [{"$match": {"$or": [{"is_stub": True}, {"is_proxy": True}]}},
         {"$group": {"_id": "$code",
                     "n_stub": {"$sum": {"$cond": [{"$eq": ["$is_stub", True]}, 1, 0]}},
                     "n_proxy": {"$sum": {"$cond": [{"$eq": ["$is_proxy", True]}, 1, 0]}}}},
         {"$sort": {"n_proxy": -1}}]
    ).to_list(300)
    items = []
    for r in rows:
        code, n_stub, n_proxy = r["_id"], r.get("n_stub", 0), r.get("n_proxy", 0)
        rec = recs.get(code)
        deps = list(getattr(rec, "dependencies", []) or []) if rec else []
        needs_denue = bool(getattr(rec, "needs_denue", False)) if rec else False
        if needs_denue and "osm_overpass" not in deps:
            deps = deps + ["osm_overpass"]
        if not deps:
            status, accion, fuentes = "dato_interno", "Computa de datos DMX internos — proxy = mediana de pares hasta capturar el dato real.", []
        else:
            cand = [(SOURCE_STATUS.get(d, ("sin_fuente", d))[0], SOURCE_STATUS.get(d, ("sin_fuente", d))[1], d) for d in deps]
            cand.sort(key=lambda c: _STATUS_PRIORITY.index(c[0]) if c[0] in _STATUS_PRIORITY else 99)
            status, accion = cand[0][0], cand[0][1]
            fuentes = deps
        items.append({"code": code, "zonas_stub": n_stub, "zonas_proxy": n_proxy, "fuentes": fuentes, "status": status, "accion": accion})
    resumen = {}
    for it in items:
        resumen.setdefault(it["status"], {"recetas": 0, "zonas_stub": 0, "zonas_proxy": 0})
        resumen[it["status"]]["recetas"] += 1
        resumen[it["status"]]["zonas_stub"] += it["zonas_stub"]
        resumen[it["status"]]["zonas_proxy"] += it["zonas_proxy"]
    return {"total_recetas_incompletas": len(items), "por_status": resumen, "detalle": items}


def _drill(key: str, docs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """CAPA 3 · drill por-score / por-feature: expande las familias gruesas en su detalle granular."""
    if key == "ie_scores":  # ~70 recetas IE por zona → score por receta
        recetas = sorted(({"receta": d.get("code"), "valor": d.get("value"), "confianza": d.get("confidence"),
                           "stub": bool(d.get("is_stub")), "proxy": bool(d.get("is_proxy"))} for d in docs if d.get("code")),
                         key=lambda x: x["receta"] or "")
        return {"tipo": "recetas", "total": len(recetas), "items": recetas}
    if key == "unit_atom":  # taxonomía de 14 grupos → cuántos features poblados por grupo
        u = docs[0]
        grupos = {g: (len(u[g]) if isinstance(u.get(g), (dict, list)) else (1 if u.get(g) not in (None, "", {}) else 0))
                  for g in _UNIT_GROUPS if g in u}
        meta = u.get("meta") or {}
        return {"tipo": "features", "completitud": meta.get("data_completeness") or u.get("data_completeness"),
                "grupos_poblados": grupos, "total_features": sum(grupos.values())}
    return None


async def inspect_entity(db, entity_type: str, entity_id: str) -> Dict[str, Any]:
    """TODOS los scores/features de UNA entidad, de todas las familias que aplican a su tipo. La ficha de granularidad.
    Con DRILL por-score (recetas IE) y por-feature (grupos de la unidad)."""
    found, missing = [], []
    for r in REGISTRY:
        if r["entity_type"] != entity_type:
            continue
        coll, idf, filt = r["collection"], r["id_field"], dict(r.get("filter") or {})
        q = {**filt, idf: entity_id}
        try:
            docs = [{k: v for k, v in d.items() if k != "_id"} async for d in db[coll].find(q).limit(100)]
        except Exception:
            docs = []
        if docs:
            entry = {"key": r["key"], "label": r["label"], "portal": r["portal"], "collection": coll,
                     "registros": len(docs)}
            drill = _drill(r["key"], docs)
            if drill:
                entry["drill"] = drill
                entry["datos"] = None if r["key"] == "ie_scores" else docs[:3]
            else:
                entry["datos"] = docs if len(docs) <= 10 else docs[:10]
            found.append(entry)
        else:
            missing.append({"key": r["key"], "label": r["label"], "collection": coll, "kind": r.get("kind")})
    return {"entity_type": entity_type, "entity_id": entity_id, "con_dato": found, "sin_dato": missing,
            "cobertura": f"{len(found)}/{len(found) + len(missing)}"}
