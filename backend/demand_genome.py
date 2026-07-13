"""
demand_genome.py — EL GENOMA DE DEMANDA (Ola A del blueprint · GENOMA_DEMANDA_BLUEPRINT.md).

La tesis del moat: cada búsqueda del marketplace se explota en ÁTOMOS DE DEMANDA — un hecho por
(visitante × colonia × dimensión × valor × fuente × tiempo) — para que demanda y oferta hablen el
mismo idioma de dimensiones y TODO se vuelva calculable (escasez, precio sombra, corredores,
liquidez, contraste vs 4S...). Misma filosofía que los átomos 4S, pero de la señal VIVA.

Piezas:
  · TAXONOMÍA canónica de features — el texto libre ("roof garden", "pet friendly") se normaliza
    a slugs contables. Sin taxonomía, la demanda por feature es texto muerto.
  · atomos_de_busqueda(doc) — explota un doc de marketplace_searches en átomos (puro, testeable).
  · explotar_busquedas(db) — backfill + re-proceso idempotente (clave natural, upsert).
  · resumen_genoma(db) — el KPI del moat auditable: átomos, dimensiones con señal, cobertura.

FAIL-OPEN total. Superadmin-only en superficie; los átomos alimentan motores como agregados.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.demand_genome")

GENOMA_V = 1

# ── Taxonomía canónica de features (texto libre → slug contable) ─────────────
# Cada slug es una dimensión analizable. Sinónimos en minúsculas sin acentos.
TAXONOMIA_FEATURES: Dict[str, List[str]] = {
    "balcon": ["balcon", "balcón", "balcones"],
    "terraza": ["terraza", "terrazas"],
    "roof_garden": ["roof garden", "roofgarden", "roof", "azotea verde"],
    "vista": ["vista", "vista exterior", "vista panoramica", "exterior"],
    "jardin": ["jardin", "jardín", "areas verdes", "área verde", "area verde"],
    "alberca": ["alberca", "piscina", "pool"],
    "gimnasio": ["gimnasio", "gym"],
    "ludoteca": ["ludoteca", "area infantil", "área infantil", "juegos infantiles", "kids"],
    "pet_friendly": ["pet friendly", "petfriendly", "mascotas", "area de mascotas", "pet"],
    "asadores": ["asador", "asadores", "grill", "bbq"],
    "cowork": ["cowork", "coworking", "co-work", "business center"],
    "home_office": ["home office", "estudio", "despacho", "oficina en casa", "flex"],
    "cuarto_servicio": ["cuarto de servicio", "cuarto de lavado", "lavado"],
    "bodega": ["bodega", "storage"],
    "elevador": ["elevador", "ascensor"],
    "seguridad": ["seguridad", "vigilancia", "acceso controlado", "caseta"],
    "salon_usos_multiples": ["salon de usos multiples", "salón de usos múltiples", "sum", "salon de eventos"],
    "cine": ["cine", "sala de cine", "screening"],
    "padel": ["padel", "pádel", "cancha de padel"],
    "canchas": ["cancha", "canchas", "deportivas"],
    "yoga": ["yoga", "meditacion", "meditación", "wellness"],
    "spa": ["spa", "sauna", "vapor"],
    "sky_bar": ["sky bar", "skybar", "bar"],
    "carril_nado": ["carril de nado", "alberca de nado"],
    "doble_altura": ["doble altura"],
    "penthouse": ["penthouse", "ph"],
    "amueblado": ["amueblado", "equipado", "llave en mano"],
    "estacionamiento_visitas": ["estacionamiento de visitas", "visitas"],
    "cajon_independiente": ["independiente", "no tandem", "no tándem", "cajones independientes"],
    "cajon_tandem": ["tandem", "tándem"],
    "cargador_electrico": ["cargador electrico", "cargador eléctrico", "auto electrico", "ev"],
    "elevautos": ["elevauto", "elevautos", "eleva autos"],
}

_SINONIMO_A_SLUG: Dict[str, str] = {}
for _slug, _sins in TAXONOMIA_FEATURES.items():
    for _s in _sins:
        _SINONIMO_A_SLUG[_s] = _slug


def _norm_txt(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode("ascii")
    return s.strip().lower()


def normalizar_feature(texto: str, extra: Optional[Dict[str, str]] = None) -> Optional[str]:
    """Texto libre → slug canónico (o None si no está en la taxonomía — se reporta, no se pierde).
    `extra` = taxonomía promovida en runtime (db.taxonomia_extra): el radar léxico cierra su ciclo
    sin tocar código — universalidad."""
    t = _norm_txt(texto)
    if not t:
        return None
    if extra and t in extra:
        return extra[t]
    if t in _SINONIMO_A_SLUG:
        return _SINONIMO_A_SLUG[t]
    # contención: "depa con roof garden hermoso" → roof_garden (extra primero: lo promovido manda)
    for sin, slug in list((extra or {}).items()) + list(_SINONIMO_A_SLUG.items()):
        if len(sin) >= 4 and sin in t:
            return slug
    return None


def normalizar_features(textos: List[str],
                        extra: Optional[Dict[str, str]] = None) -> Dict[str, List[str]]:
    """Lista de textos → {reconocidos: [slugs], desconocidos: [textos]} (lo desconocido es el
    radar léxico: features emergentes que aún no están en la taxonomía)."""
    slugs, desconocidos = [], []
    for t in textos or []:
        s = normalizar_feature(t, extra)
        if s and s not in slugs:
            slugs.append(s)
        elif not s and _norm_txt(t):
            desconocidos.append(_norm_txt(t))
    return {"reconocidos": slugs, "desconocidos": desconocidos}


async def cargar_taxonomia_extra(db) -> Dict[str, str]:
    """Sinónimos promovidos en runtime (radar léxico → botón/endpoint promover). FAIL-OPEN."""
    out: Dict[str, str] = {}
    try:
        async for t in db.taxonomia_extra.find({}, {"_id": 0}):
            if t.get("sinonimo") and t.get("slug"):
                out[_norm_txt(t["sinonimo"])] = str(t["slug"]).strip().lower()
    except Exception as e:
        log.warning("[genoma] taxonomia_extra fail-open: %s", e)
    return out


async def promover_termino(db, termino: str, slug: Optional[str] = None) -> Dict[str, Any]:
    """Cierra el ciclo del radar léxico: un término emergente se vuelve feature contable YA
    (y las próximas explosiones lo reconocen). slug default = el término slugificado."""
    t = _norm_txt(termino)
    if not t:
        return {"ok": False, "error": "término vacío"}
    s = _norm_txt(slug or t).replace(" ", "_")
    await db.taxonomia_extra.update_one({"sinonimo": t}, {"$set": {"sinonimo": t, "slug": s}}, upsert=True)
    return {"ok": True, "sinonimo": t, "slug": s,
            "lectura": f"'{t}' promovido a la taxonomía como '{s}' — re-corre el explotador para re-clasificar."}


# ── Bandas (para que los átomos sean agregables sin exponer el dato exacto) ──
def banda_precio_mdp(v: float) -> str:
    lo = int(float(v) / 200000) * 0.2
    return f"{lo:.1f}-{lo + 0.2:.1f}"


def banda_m2(v: float) -> str:
    lo = int(float(v) / 10) * 10
    return f"{lo}-{lo + 10}"


# ── El átomo de demanda ───────────────────────────────────────────────────────
# Metadata del doc de búsqueda (NO son demanda — se excluyen del átomo universal)
_CAMPOS_META = {
    "id", "saved_search_id", "dedup_key", "crit_key", "visitor_id", "source",
    "created_at", "created_at_dt", "email", "colonias", "colonia_id", "query",
    "alert", "results_count", "ip_hash", "name", "ps", "hay_alertas", "parse_miss",
    "banda", "lead_id", "genoma_v", "isr_renta_efectivo_pct",
}
# Campos ya curados arriba con semántica propia (bandas/taxonomía) — no se duplican en el genérico
_CAMPOS_CURADOS = {
    "recamaras_min", "banos_min", "estacionamientos_min", "m2_min", "m2_max",
    "piso_min", "precio_max", "precio_min", "enganche_max", "mensualidad_max",
    "meses_entrega_max", "tipo_credito", "descuento_min_pct", "max_unidades_edificio",
    "estacionamiento_independiente", "stages", "plazo", "stage_pedido", "tipo_pedido",
    "features_pedidos", "amenidades_pedidas", "soft_criteria", "negative_criteria",
}
# PESO por intensidad (hardening): buscar explícito pesa 1.0; ver/like/dwell son deseo más débil.
# La tensión usa VISITANTES ÚNICOS; el peso mide intensidad agregada de la señal.
PESO_SENAL = {"search": 1.0, "intent": 0.8, "like": 0.6, "save": 0.6, "unit_save": 0.6,
              "compare": 0.5, "ficha_view": 0.3, "unit_view": 0.3,
              "photo_dwell": 0.2, "photo_zoom": 0.2}


def _atomo(doc_id: str, colonia: str, dimension: str, valor: Any, *,
           visitor: Optional[str], fuente: str, ts, peso: float = 1.0) -> Dict[str, Any]:
    return {
        "genoma_v": GENOMA_V,
        "search_id": doc_id, "colonia": colonia,
        "dimension": dimension, "valor": str(valor),
        "visitor_id": visitor, "fuente": fuente, "ts": ts, "peso": peso,
    }


def atomos_de_busqueda(doc: Dict[str, Any],
                       taxonomia_extra: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """Explota UN doc de marketplace_searches en átomos de demanda (puro, sin DB).
    Un átomo por (colonia × dimensión con valor). Fail-open: campos ausentes se omiten."""
    from market_4s_bridge import norm_colonia
    doc_id = doc.get("id") or doc.get("saved_search_id") or doc.get("dedup_key") or doc.get("crit_key") or ""
    visitor = doc.get("visitor_id")
    fuente = doc.get("source") or "desconocida"
    ts = doc.get("created_at_dt") or doc.get("created_at")
    colonias = [norm_colonia(str(c)) for c in (doc.get("colonias") or []) if c] or ["_sin_colonia"]

    dims: List[tuple] = []
    if doc.get("recamaras_min") is not None:
        dims.append(("producto.recamaras", int(doc["recamaras_min"])))
    if doc.get("banos_min") is not None:
        dims.append(("producto.banos", doc["banos_min"]))
    if doc.get("estacionamientos_min") is not None:
        dims.append(("producto.estacionamientos", int(doc["estacionamientos_min"])))
    if doc.get("m2_min") is not None:
        dims.append(("producto.m2_banda", banda_m2(doc["m2_min"])))
    if doc.get("piso_min") is not None:
        dims.append(("producto.nivel_min", int(doc["piso_min"])))
    if doc.get("precio_max") is not None:
        dims.append(("finanzas.presupuesto_banda_mdp", banda_precio_mdp(doc["precio_max"])))
    if doc.get("enganche_max") is not None:
        dims.append(("finanzas.enganche_max", doc["enganche_max"]))
    if doc.get("mensualidad_max") is not None:
        dims.append(("finanzas.mensualidad_max", int(doc["mensualidad_max"])))
    for st in doc.get("stages") or ([doc["stage_pedido"]] if doc.get("stage_pedido") else []):
        dims.append(("intencion.etapa_obra", _norm_txt(st)))
    if doc.get("plazo") and doc["plazo"] != "cualquiera":
        dims.append(("intencion.plazo_entrega", _norm_txt(doc["plazo"])))
    if doc.get("tipo_pedido"):
        dims.append(("intencion.tipo", _norm_txt(doc["tipo_pedido"])))

    # A4 · dimensiones antes perdidas (tándem, meses-a-entrega, crédito, promos, edificio chico)
    if doc.get("m2_max") is not None:
        dims.append(("producto.m2_max_banda", banda_m2(doc["m2_max"])))
    if doc.get("estacionamiento_independiente"):
        dims.append(("producto.feature", "cajon_independiente"))
    if doc.get("meses_entrega_max") is not None:
        dims.append(("intencion.meses_entrega_max", int(doc["meses_entrega_max"])))
    if doc.get("tipo_credito"):
        dims.append(("finanzas.tipo_credito", _norm_txt(doc["tipo_credito"])))
    if doc.get("descuento_min_pct") is not None:
        dims.append(("finanzas.descuento_esperado_pct", int(doc["descuento_min_pct"])))
    if doc.get("max_unidades_edificio") is not None:
        dims.append(("producto.max_unidades_edificio", int(doc["max_unidades_edificio"])))

    # features + amenidades → taxonomía (lo no reconocido = radar léxico, también se guarda)
    textos_feat = (doc.get("features_pedidos") or []) + (doc.get("amenidades_pedidas") or []) \
        + (doc.get("soft_criteria") or [])   # A5: los criterios suaves del buscador IA dejan de ser texto muerto
    feats = normalizar_features(textos_feat, taxonomia_extra)
    for slug in feats["reconocidos"]:
        dims.append(("producto.feature", slug))
    for raw in feats["desconocidos"]:
        dims.append(("lexico.termino_emergente", raw[:60]))

    # A5 · minado del TEXTO del picker: "depa con balcón y roof en condesa" → features contables
    # (antes el picker solo aportaba texto muerto — ahora cada palabra reconocida es un átomo)
    if doc.get("query"):
        q = _norm_txt(doc["query"])
        ya = {v for d, v in dims if d == "producto.feature"}
        for sin, slug in list((taxonomia_extra or {}).items()) + list(_SINONIMO_A_SLUG.items()):
            if len(sin) >= 4 and sin in q and slug not in ya:
                dims.append(("producto.feature", slug))
                ya.add(slug)

    # Data NEGATIVA: las exclusiones también son demanda ("no avenida", "sin alberca")
    for neg in doc.get("negative_criteria") or []:
        s = normalizar_feature(neg, taxonomia_extra)
        dims.append(("exclusion.feature" if s else "exclusion.texto", s or _norm_txt(neg)[:60]))

    if doc.get("precio_min") is not None:
        dims.append(("finanzas.presupuesto_min_banda_mdp", banda_precio_mdp(doc["precio_min"])))

    # ═══ GARANTÍA UNIVERSAL: NINGÚN campo se pierde ═══
    # Cualquier campo escalar del doc que NO esté curado arriba ni sea metadata se vuelve átomo
    # 'busqueda.<campo>' automáticamente. Si mañana una superficie guarda 'orientacion_pedida',
    # ya es analizable sin tocar este código (se cura después si necesita banda).
    for k, val in doc.items():
        if k in _CAMPOS_META or k in _CAMPOS_CURADOS or k.startswith("_"):
            continue
        if isinstance(val, bool):
            if val:
                dims.append((f"busqueda.{k}", "si"))
        elif isinstance(val, (int, float)):
            dims.append((f"busqueda.{k}", val))
        elif isinstance(val, str) and val.strip():
            dims.append((f"busqueda.{k}", _norm_txt(val)[:60]))

    out = []
    for col in colonias:
        for dim, val in dims:
            out.append(_atomo(doc_id, col, dim, val, visitor=visitor, fuente=fuente, ts=ts))
    return out


def _get(u: Dict[str, Any], *aliases, default=None):
    for a in aliases:
        v = u.get(a)
        if v is not None:
            return v
    return default


def _entero(v) -> Optional[int]:
    """Parse TOLERANTE de enteros del mundo real: 3, '3', 3.0, '10+1' (nivel 10 + roof) → 10.
    Un dato sucio pierde SU campo — nunca tira la unidad ni el inventario completo (bug real:
    un piso '10+1' en una lista ingerida tiraba TODAS las unidades del espejo, fail-open)."""
    try:
        return int(float(v))
    except (TypeError, ValueError):
        m = re.search(r"-?\d+", str(v))
        return int(m.group()) if m else None


def vector_unidad(unit: Dict[str, Any]) -> Dict[str, str]:
    """A6 · El vector GENOMA de una unidad del inventario — MISMAS dimensiones que la demanda.
    Con demanda y oferta en el mismo idioma, el match/escasez/precio-sombra es una resta.
    Reader fail-open sobre el esquema de unidad (dmx_unit_schema) y alias comunes. Puro."""
    v: Dict[str, str] = {}
    rec = _entero(_get(unit, "recamaras", "bedrooms"))
    if rec is not None:
        v["producto.recamaras"] = str(rec)
    ban = _get(unit, "banos_completos", "banos", "bathrooms")
    if ban is not None:
        v["producto.banos"] = str(ban)
    m2 = _get(unit, "m2_construido", "m2", "sqm", "superficie")
    if m2:
        v["producto.m2_banda"] = banda_m2(m2)
    piso = _entero(_get(unit, "piso", "nivel", "level", "floor"))
    if piso is not None:
        v["producto.nivel"] = str(piso)
    est = _entero(_get(unit, "estacionamientos", "cajones", "parking"))
    if est is not None:
        v["producto.estacionamientos"] = str(est)
    precio = _get(unit, "precio_lista", "precio", "price")
    if precio:
        v["finanzas.presupuesto_banda_mdp"] = banda_precio_mdp(precio)
    if _get(unit, "status"):
        v["oferta.status"] = _norm_txt(unit["status"])
    ori = _get(unit, "orientacion")
    if ori:
        v["producto.orientacion"] = _norm_txt(str(ori))
    vista = _get(unit, "vista")
    if vista:
        v["producto.feature.vista"] = _norm_txt(str(vista))

    # features físicas: m² > 0 = la unidad LA TIENE (mismo slug que la demanda)
    features = []
    if (_get(unit, "m2_balcon") or 0) > 0:
        features.append("balcon")
    if (_get(unit, "m2_terraza") or 0) > 0:
        features.append("terraza")
    if (_get(unit, "m2_roof_garden_privado") or 0) > 0:
        features.append("roof_garden")
    if (_get(unit, "m2_jardin_privado") or 0) > 0:
        features.append("jardin")
    # amenidades declaradas (lista de textos) → taxonomía
    feats = normalizar_features(_get(unit, "amenidades", "features", default=[]) or [])
    for s in feats["reconocidos"]:
        if s not in features:
            features.append(s)
    # GARANTÍA UNIVERSAL: cualquier flag 'tiene_*' del esquema de unidad se vuelve feature
    # automáticamente (tiene_roof, tiene_estacionamiento…) — campos nuevos entran solos.
    for k, val in unit.items():
        if k.startswith("tiene_") and val:
            s = normalizar_feature(k[6:]) or _norm_txt(k[6:])
            if s and s not in features:
                features.append(s)
    for s in features:
        v[f"producto.feature.{s}"] = "si"
    return v


async def explotar_busquedas(db, limite: int = 20000) -> Dict[str, Any]:
    """Backfill + re-proceso: TODAS las búsquedas → demand_atoms. Idempotente (clave natural)."""
    n_docs, n_atomos = 0, 0
    extra = await cargar_taxonomia_extra(db)
    try:
        async for doc in db.marketplace_searches.find({}, {"_id": 0}):
            n_docs += 1
            for a in atomos_de_busqueda(doc, taxonomia_extra=extra):
                key = {"search_id": a["search_id"], "colonia": a["colonia"],
                       "dimension": a["dimension"], "valor": a["valor"]}
                await db.demand_atoms.update_one(key, {"$set": a}, upsert=True)
                n_atomos += 1
            if n_docs >= limite:
                break
    except Exception as e:
        log.warning("[genoma] explotar fail-open: %s", e)
    try:
        await db.demand_atoms.create_index("colonia")
        await db.demand_atoms.create_index("dimension")
    except Exception:
        pass
    return {"busquedas_procesadas": n_docs, "atomos": n_atomos, "genoma_v": GENOMA_V}


async def resumen_genoma(db) -> Dict[str, Any]:
    """EL KPI DEL MOAT (auditable): cuántos átomos, qué dimensiones tienen señal, dónde.
    Este número debe CRECER cada semana — es la curva de aprendizaje de la plataforma."""
    atomos = []
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0}):
            atomos.append(a)
            if len(atomos) >= 50000:
                break
    except Exception as e:
        log.warning("[genoma] resumen fail-open: %s", e)

    por_dim: Dict[str, int] = {}
    por_colonia: Dict[str, int] = {}
    visitantes = set()
    emergentes: Dict[str, int] = {}
    for a in atomos:
        por_dim[a["dimension"]] = por_dim.get(a["dimension"], 0) + 1
        if a["colonia"] != "_sin_colonia":
            por_colonia[a["colonia"]] = por_colonia.get(a["colonia"], 0) + 1
        if a.get("visitor_id"):
            visitantes.add(a["visitor_id"])
        if a["dimension"] == "lexico.termino_emergente":
            emergentes[a["valor"]] = emergentes.get(a["valor"], 0) + 1

    dims_con_senal = sorted(por_dim)
    return {
        "n_atomos": len(atomos),
        "n_visitantes": len(visitantes),
        "dimensiones_con_senal": len(dims_con_senal),
        "por_dimension": dict(sorted(por_dim.items(), key=lambda x: -x[1])),
        "top_colonias": dict(sorted(por_colonia.items(), key=lambda x: -x[1])[:15]),
        "radar_lexico": dict(sorted(emergentes.items(), key=lambda x: -x[1])[:10]),
        "taxonomia_features": len(TAXONOMIA_FEATURES),
        "es_estimado": not bool(atomos),
        "lectura": (f"{len(atomos)} átomos de demanda · {len(dims_con_senal)} dimensiones con señal viva · "
                    f"{len(visitantes)} visitantes. Este número debe crecer cada semana — es el moat.")
                   if atomos else "Aún sin átomos — corre el explotador o espera señal del marketplace.",
    }


# ── HARDENING · señales de comportamiento → átomos con PESO ───────────────────
async def explotar_senales(db, limite: int = 20000) -> Dict[str, Any]:
    """buyer_signals (ver/like/comparar/dwell) → átomos de demanda con peso: el visitante que VE
    una unidad con balcón está expresando deseo por sus llaves (más débil que buscarlo — PESO_SENAL).
    Idempotente por (visitante × tipo × unidad × dimensión). FAIL-OPEN."""
    try:
        from demand_mirror import _oferta_vectores, _llaves_oferta
        unidades = {str(u["unit_id"]): u for u in await _oferta_vectores(db) if u.get("unit_id")}
    except Exception as e:
        log.warning("[genoma] señales oferta fail-open: %s", e)
        return {"senales_procesadas": 0, "atomos": 0, "error": "sin inventario"}

    n_sig, n_atomos = 0, 0
    try:
        async for s in db.buyer_signals.find({}, {"_id": 0, "type": 1, "visitor_id": 1,
                                                  "entity_id": 1, "created_at_dt": 1}):
            t = s.get("type")
            peso = PESO_SENAL.get(t)
            u = unidades.get(str(s.get("entity_id") or ""))
            if not peso or not u or not s.get("visitor_id"):
                continue
            n_sig += 1
            base_id = f"sig:{s['visitor_id']}:{t}:{s['entity_id']}"
            from demand_mirror import _llaves_oferta as _lo
            for dim, val in _lo(u["vector"]):
                a = _atomo(base_id, u["colonia"], dim, val, visitor=s["visitor_id"],
                           fuente=f"senal:{t}", ts=s.get("created_at_dt"), peso=peso)
                key = {"search_id": a["search_id"], "colonia": a["colonia"],
                       "dimension": a["dimension"], "valor": a["valor"]}
                await db.demand_atoms.update_one(key, {"$set": a}, upsert=True)
                n_atomos += 1
            if n_sig >= limite:
                break
    except Exception as e:
        log.warning("[genoma] señales fail-open: %s", e)
    return {"senales_procesadas": n_sig, "atomos": n_atomos}


# ── HARDENING · el KPI del moat con HISTORIA (la curva semanal para YC) ───────
async def snapshot_kpi(db) -> Dict[str, Any]:
    """Foto semanal del KPI (idempotente por semana ISO) → la curva 'crece solo' es demostrable."""
    from datetime import datetime, timezone
    r = await resumen_genoma(db)
    now = datetime.now(timezone.utc)
    iso = now.isocalendar()
    semana = f"{iso[0]}-W{iso[1]:02d}"
    doc = {"semana": semana, "fecha": now.isoformat()[:10],
           "n_atomos": r["n_atomos"], "n_visitantes": r["n_visitantes"],
           "dimensiones_con_senal": r["dimensiones_con_senal"]}
    await db.genoma_kpi_snapshots.update_one({"semana": semana}, {"$set": doc}, upsert=True)
    return {"ok": True, **doc}


async def historia_kpi(db, semanas: int = 26) -> List[Dict[str, Any]]:
    out = []
    try:
        async for s in db.genoma_kpi_snapshots.find({}, {"_id": 0}):
            out.append(s)
    except Exception as e:
        log.warning("[genoma] historia fail-open: %s", e)
    out.sort(key=lambda x: x.get("semana", ""))
    return out[-semanas:]
