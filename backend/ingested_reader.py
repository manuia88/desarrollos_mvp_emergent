"""Lector unificado de proyectos INGERIDOS (db.developments source='bulk_ingest') + sus unidades (db.units).

PROBLEMA QUE RESUELVE (auditoría 2026-07): la ingesta masiva ESCRIBE en db.developments + db.units, pero las
LISTAS del marketplace / asesor / dev y la APROBACIÓN leían solo la semilla + db.projects → el proyecto ingerido
quedaba INVISIBLE en todos los portales. Este módulo es la fuente ÚNICA para convertir un doc ingerido en la
tarjeta del marketplace y para cargar/normalizar sus unidades, de modo que todos los consumidores lean igual.

NORMALIZACIÓN (clave): la ingesta guardó las unidades con nombres legacy (size_m2 / size_m2_total / storage /
parking / price_mxn / status en inglés). La semilla + los filtros del marketplace + el front esperan el vocabulario
CANÓNICO (m2_total / m2_privative / parking_spots(int) / bodega(bool) / price / status en español). `normalize_unit`
lee AMBOS (tolerante) y devuelve el canónico → una unidad ingerida se filtra, cotiza y renderiza como cualquier otra.

Además db.units usa DOS llaves foráneas: `project_id` (wizard) y `development_id` (ingesta) → `units_for_dev`
consulta las dos para no perder unidades según el origen.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# status: inglés (lo que escribió la ingesta) → español canónico (lo que filtran/renderizan seed + front)
# 07-17: le faltaban 'bloqueado' y los femeninos — y el default mandaba TODO lo desconocido a
# 'disponible', así que una unidad bloqueada se publicaba como si estuviera a la venta.
_STATUS_ES = {
    "available": "disponible", "disponible": "disponible",
    "reserved": "reservado", "reservado": "reservado",
    "apartado": "reservado", "apartada": "reservado",
    "sold": "vendido", "vendido": "vendido", "vendida": "vendido",
    "bloqueado": "bloqueado", "bloqueada": "bloqueado", "blocked": "bloqueado",
    "no_disponible": "no_disponible", "no disponible": "no_disponible",
}


def _parking_count_txt(raw) -> int:
    """'28 y 29'→2 · '34 down'→1 · '2'→2 · '07'→1 (identificador) · vacío→0."""
    s = str(raw or "").strip()
    if not s:
        return 0
    toks = re.findall(r"\d+", s)
    if not toks:
        return 1
    if len(toks) > 1:
        return len(toks)
    t = toks[0]
    return int(t) if (len(t) == 1 and int(t) <= 6) else 1


def _parking_int(u: Dict[str, Any]) -> int:
    """cajones como entero: usa parking_spots si existe; si no, extrae dígitos del string 'parking' ('2 cajones' → 2)."""
    if u.get("parking_spots") is not None:
        try:
            return int(u.get("parking_spots") or 0)
        except (TypeError, ValueError):
            return 0
    return _parking_count_txt(u.get("parking"))


def normalize_unit(u: Dict[str, Any]) -> Dict[str, Any]:
    """Devuelve la unidad con el vocabulario CANÓNICO (tolerante a nombres legacy de la ingesta). Conserva todo lo demás."""
    out = dict(u)
    price = u.get("price") if u.get("price") is not None else u.get("price_mxn")
    m2_total = u.get("m2_total") or u.get("size_m2_total") or u.get("size_m2")
    m2_priv = u.get("m2_privative") or u.get("size_m2")
    crudo = str(u.get("status") or "").lower().strip()
    st = _STATUS_ES.get(crudo)
    if st is None:
        # VACÍO → disponible (una lista de precios sin marca suele ser oferta viva).
        # Un status DESCONOCIDO no se traduce a 'disponible': se conserva tal cual
        # (fail-visible — que se note en la ficha, no que se venda un fantasma).
        st = "disponible" if not crudo else crudo
    out["price"] = price
    if not out.get("price_display") and price:
        try:
            out["price_display"] = f"${int(price):,}"
        except (TypeError, ValueError):
            pass
    out["m2_total"] = m2_total
    out["m2_privative"] = m2_priv
    out["parking_spots"] = _parking_int(u)
    out["bodega"] = bool(u.get("bodega")) if u.get("bodega") is not None else bool(u.get("storage"))
    out["prototype"] = u.get("prototype") or u.get("type")
    out["status"] = st
    return out


async def units_for_dev(db, dev_id: str) -> List[Dict[str, Any]]:
    """Unidades REALES del proyecto desde db.units (ingesta usa development_id, wizard usa project_id), normalizadas.
    DEDUP por número de unidad (auditoría 07-08: NUEVE22 tenía 504/604 duplicadas — un registro bueno + un stub
    fantasma price=None): se conserva la fila MÁS RICA (con precio y prototipo completo)."""
    if not dev_id:
        return []
    raw: List[Dict[str, Any]] = []
    try:
        async for u in db.units.find(
                {"$or": [{"development_id": dev_id}, {"project_id": dev_id}]}, {"_id": 0}):
            raw.append(u)
    except Exception:
        return []

    def _rank(u: Dict[str, Any]) -> tuple:
        price = 1 if (u.get("price_mxn") or u.get("price")) else 0
        proto = str(u.get("prototype") or "")
        proto_rico = 1 if (proto and not proto.isdigit()) else 0   # 'Tipo 04' gana a '04'
        llenos = sum(1 for v in u.values() if v not in (None, "", []))
        return (price, proto_rico, llenos)

    # DEDUP POR TORRE + NÚMERO (auditoría A–Z 07-24). Antes la llave era SOLO el número de
    # departamento, así que en un conjunto multi-torre el 101 de la torre A mataba al 101 de la
    # torre C y al de la torre D: **281 departamentos reales quedaban invisibles** en el
    # marketplace, con sus precios y sus metros. Río Churubusco perdía 145 y Camarones 136.
    # La llave correcta es (torre, número): dos unidades distintas dejan de pisarse, y el
    # duplicado de verdad —mismo número Y misma torre— sigue colapsando como debe.
    mejor: Dict[tuple, Dict[str, Any]] = {}
    colisiones: Dict[tuple, int] = {}
    for u in raw:
        torre = str(u.get("tower") or u.get("torre") or "").strip().upper()
        num = str(u.get("unit_number") or u.get("id") or id(u)).strip().upper()
        k = (torre, num)
        if k in mejor:
            # Choque REAL: dos filas con el mismo número en la MISMA torre. Casi siempre es un
            # error de la lista del desarrollador, no dos departamentos. Se conserva la fila más
            # completa (nunca se pierde el dato) pero se marca para que un humano lo resuelva:
            # elegir en silencio es justo lo que produjo los errores que venimos arreglando.
            colisiones[k] = colisiones.get(k, 1) + 1
            if _rank(u) > _rank(mejor[k]):
                mejor[k] = u
            mejor[k] = {**mejor[k], "pelea_duplicado": True,
                        "pelea_nota": f"la lista trae {colisiones[k]} filas con el número {num}"
                                      f"{' en la torre ' + torre if torre else ''} — revisar con el desarrollador"}
        else:
            mejor[k] = u
    return [normalize_unit(u) for u in mejor.values()]


def _property_type_from_units(units: List[Dict[str, Any]]) -> str:
    """Tipo de propiedad dominante para la tarjeta (departamento por defecto)."""
    for u in units:
        t = str(u.get("type") or u.get("prototype") or "").lower()
        if "casa" in t:
            return "casa"
        if "terreno" in t:
            return "terreno"
    return "departamento"


_TIPOS_NO_DEPTO = {"roof_garden", "roof", "local", "bodega", "estacionamiento", "cajon"}


def _es_depto(u: Dict[str, Any]) -> bool:
    """Un roof garden / local / bodega NO es el 'desde' del edificio (07-17: Coahuila
    mostraba 'desde $550,000' = un roof, no un departamento)."""
    return str(u.get("type") or u.get("tipo") or "depto").lower() not in _TIPOS_NO_DEPTO


def apply_unit_aggregates(card: Dict[str, Any], units: List[Dict[str, Any]]) -> None:
    """Recalcula precio 'desde/hasta', conteos por estado y rangos a partir de las unidades vivas (in-place).
    El precio y las especificaciones representan DEPARTAMENTOS; roofs/locales/bodegas se excluyen del 'desde'."""
    if not units:
        return
    deptos = [u for u in units if _es_depto(u)] or units
    prices = [u.get("price") for u in deptos if u.get("price")]
    beds = [u.get("bedrooms") for u in deptos if u.get("bedrooms") is not None]
    baths = [u.get("bathrooms") for u in deptos if u.get("bathrooms") is not None]
    park = [u.get("parking_spots") for u in deptos if u.get("parking_spots") is not None]
    m2 = [u.get("m2_total") or u.get("m2_privative") for u in deptos if (u.get("m2_total") or u.get("m2_privative"))]
    if prices:
        card["price_from"] = min(prices)
        card["price_to"] = max(prices)
    # el TOTAL del edificio manda el brochure (card ya trae total_units); si es mayor que
    # las unidades cargadas, las que faltan son vendidas no detalladas (07-17: Chilpancingo
    # 48 deptos con 1 disponible mostraba 'total 1'). units_available/reserved sí son reales.
    cargadas = len(deptos)
    total_edif = max(card.get("units_total") or 0, cargadas)   # brochure manda el total
    disp = sum(1 for u in deptos if u.get("status") == "disponible")
    resv = sum(1 for u in deptos if u.get("status") == "reservado")
    vend_vis = sum(1 for u in deptos if u.get("status") == "vendido")
    card["units_total"] = total_edif
    card["units_available"] = disp
    card["units_reserved"] = resv
    card["units_sold"] = max(vend_vis, total_edif - disp - resv)   # incluye vendidas ocultas
    if beds:
        card["bedrooms_range"] = [min(beds), max(beds)]
    if baths:
        card["bathrooms_range"] = [min(baths), max(baths)]
    if park:
        card["parking_range"] = [min(park), max(park)]
    if m2:
        card["m2_range"] = [min(m2), max(m2)]
    card["property_type"] = _property_type_from_units(units)


def dev_doc_to_card(d: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convierte un doc INGERIDO (db.developments source='bulk_ingest') en la tarjeta del marketplace.
    Trae TODOS los campos que tocan el listado y los filtros (defaults seguros → nunca KeyError). Marca source='ingesta'."""
    pid = d.get("id") or d.get("slug")
    if not pid:
        return None
    lat, lng = d.get("lat"), d.get("lng")
    pf = d.get("price_from") or d.get("price_min_mxn") or 0
    pt = d.get("price_max_mxn") or d.get("price_to") or pf
    ut = d.get("total_units") or d.get("units_total") or 0
    return {
        "id": pid, "slug": d.get("slug") or pid, "name": d.get("name") or "Desarrollo",
        "colonia_id": d.get("colonia_id") or "", "colonia": d.get("colonia") or "",
        "alcaldia": d.get("alcaldia") or d.get("municipio") or "", "city": d.get("city") or "CDMX",
        "stage": d.get("stage") or "preventa", "property_type": "departamento",
        "price_from": pf, "price_to": pt, "price_from_display": None, "price_to_display": None,
        "units": [], "units_total": ut, "units_available": ut, "units_sold": 0, "units_reserved": 0,
        "amenities": d.get("amenities") or [], "unit_features": [], "servicios": {}, "creditos_aceptados": [],
        "photos": d.get("photos") or [], "center": ({"lat": lat, "lng": lng} if lat and lng else None),
        "address_full": d.get("address") or d.get("address_full") or "", "street": d.get("address") or "",
        "postal_code": d.get("postal_code") or d.get("cp") or "",
        "delivery_estimate": d.get("delivery_estimate") or "", "fecha_lanzamiento": d.get("created_at") or "",
        "description": d.get("description") or "", "developer_id": d.get("developer_id") or d.get("dev_org_id"),
        "contact_phone": "", "m2_range": d.get("m2_range") or "", "bedrooms_range": "", "bathrooms_range": "",
        "parking_range": "", "orientations": [], "max_level": None, "construction_progress": None,
        "memoria_acabados": None, "tecnica": None, "tour360_url": None, "video_url": None,
        "featured": False, "verified": False, "source": "ingesta", "price_history": [],
    }


async def public_photos(db, dev_id: str, limit: int = 12) -> List[str]:
    """Fotos PÚBLICAS del proyecto ingerido: RENDERS primero; si el Drive no trae renders, fotos de OBRA
    (reales, honestas — mejor que placeholder). Depto MUESTRA jamás sale (regla founder). Rutas relativas
    /api/... que sirve el endpoint público gated; el front las prefija con su API base."""
    out: List[str] = []
    try:
        for kind in ("render", "obra"):
            async for a in db.project_assets.find(
                    {"development_id": dev_id, "image_kind": kind},
                    {"_id": 0, "drive_file_id": 1, "local_file": 1}).limit(limit):
                # MATERIALIZADO local primero (07-16): servir /archivo/ iba a Google Drive
                # EN VIVO en cada click del carrusel — segundos por foto.
                if a.get("local_file"):
                    out.append(f"/api/assets-static/{a['local_file']}")
                elif a.get("drive_file_id"):
                    out.append(f"/api/developments/{dev_id}/archivo/{a['drive_file_id']}")
            if out:
                break
    except Exception:
        pass
    return out


_PLANO_NAME_RE = re.compile(r"(?i)plano|planta|prototipo|tipo[ _-]|dep[-_ ]?\d")


def _norm_token(s: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


async def attach_planos(db, dev_id: str, units: List[Dict[str, Any]]) -> int:
    """Liga el PLANO del Drive a cada unidad (por número de depto o por prototipo — founder: 'depa 102 usa el
    plano del Tipo 02'). Escribe plano_url (+plano_mime) in-place. Fail-open; devuelve # unidades ligadas."""
    if not units:
        return 0
    try:
        planos = []
        async for a in db.project_assets.find(
                {"development_id": dev_id, "mime": "application/pdf"},
                {"_id": 0, "drive_file_id": 1, "filename": 1, "local_file": 1}).limit(300):
            fn = a.get("filename") or ""
            if a.get("drive_file_id") and _PLANO_NAME_RE.search(fn):
                planos.append({"fid": a["drive_file_id"], "fn": fn, "norm": _norm_token(fn),
                               "local": a.get("local_file"),
                               "toks": set((re.findall(r"\d+[A-Za-z]*", re.sub(r"[^A-Za-z0-9 ]", "", fn))))})
        if not planos:
            return 0
        n = 0
        for u in units:
            un = str(u.get("unit_number") or "")
            un_tok = re.sub(r"[^A-Za-z0-9]", "", un).upper()
            proto = _norm_token(u.get("prototype") if u.get("prototype") not in (None, "depto", "casa") else "")
            hit = None
            # 1º por número de depto exacto en el nombre del plano
            for p in planos:
                if un_tok and any(t.upper() == un_tok for t in p["toks"]):
                    hit = p
                    break
            # 2º por prototipo ('tipo 02' / '02' en el nombre)
            if not hit and proto:
                for p in planos:
                    if proto in p["norm"]:
                        hit = p
                        break
            if hit:
                u["plano_url"] = (f"/api/assets-static/{hit['local']}" if hit.get("local")
                                  else f"/api/developments/{dev_id}/archivo/{hit['fid']}")
                u["plano_mime"] = "application/pdf"
                n += 1
        return n
    except Exception:
        return 0


async def sanar_colonia_desde_nombre(db) -> Dict[str, int]:
    """Self-healer (07-21): resuelve `colonia_id` desde el NOMBRE de colonia vía db.colonias para devs
    (y sus units) que traen la colonia por nombre pero sin id. Cierra el hueco Edomex de forma GENERAL
    y DURABLE — una re-ingesta de QC borraría el colonia_id, esto lo vuelve a poner. Solo amarra cuando
    el nombre mapea a UNA sola colonia del catálogo (evita 'El Mirador' ambiguo). Nunca pisa un id ya
    puesto. Idempotente."""
    cat: Dict[str, str] = {}
    ambig: set = set()
    async for c in db.colonias.find({}, {"_id": 0, "id": 1, "name": 1}):
        nm = str(c.get("name") or "").strip().lower()
        if nm and c.get("id"):
            if nm in cat and cat[nm] != c["id"]:
                ambig.add(nm)
            cat.setdefault(nm, c["id"])
    res = {"devs": 0, "units": 0}
    async for d in db.developments.find(
            {"colonia": {"$nin": [None, ""]},
             "$or": [{"colonia_id": None}, {"colonia_id": {"$exists": False}}]},
            {"_id": 0, "id": 1, "colonia": 1}):
        nm = str(d.get("colonia")).strip().lower()
        cid = cat.get(nm)
        if not cid or nm in ambig:
            continue
        await db.developments.update_one({"id": d["id"]}, {"$set": {"colonia_id": cid}})
        ru = await db.units.update_many(
            {"development_id": d["id"],
             "$or": [{"colonia_id": None}, {"colonia_id": {"$exists": False}}]},
            {"$set": {"colonia_id": cid}})
        res["devs"] += 1
        res["units"] += ru.modified_count
    return res


async def _resolver_cv(db, colonia_id, colonia_name=None, alcaldia=None):
    """Resuelve el doc colonia_valoracion probando varias formas de llave: el colonia_id tal cual,
    la llave '{colonia}-{alcaldia}' (formato real de la colección) y match por nombre. Cierra el mismatch
    que dejaba la alerta de valor CIEGA (dev.colonia_id='polanco' vs cv.colonia_id='condesa-cuauhtemoc')."""
    from data_developments import colonia_slug
    tries = []
    if colonia_id:
        tries.append(colonia_id)
    if colonia_name and alcaldia:
        tries.append(f"{colonia_slug(colonia_name)}-{colonia_slug(alcaldia)}")
    for k in tries:
        d = await db.colonia_valoracion.find_one({"colonia_id": k}, {"_id": 0, "market_m2": 1, "colonia_id": 1})
        if d:
            return d
    if colonia_name:
        d = await db.colonia_valoracion.find_one({"name": {"$regex": f"^{colonia_name}$", "$options": "i"}},
                                                 {"_id": 0, "market_m2": 1, "colonia_id": 1})
        if d:
            return d
    return None


async def sobre_mercado_pct(db, colonia_id: Optional[str], units: List[Dict[str, Any]],
                            colonia_name: Optional[str] = None, alcaldia: Optional[str] = None) -> int:
    """'Sobre mercado +X%' POR UNIDAD (spec founder): $/m² de la unidad vs $/m² de mercado de su colonia
    (colonia_valoracion.market_m2 — AVM con muestra real). Escribe sobre_mercado_pct en cada unidad (in-place).
    Devuelve cuántas unidades se calcularon. Fail-open (sin colonia o sin AVM → no escribe nada)."""
    if (not colonia_id and not colonia_name) or not units:
        return 0
    try:
        cv = await _resolver_cv(db, colonia_id, colonia_name, alcaldia)
        ref = ((cv or {}).get("market_m2") or {}).get("valor")
        colonia_id = (cv or {}).get("colonia_id") or colonia_id   # para el fallback de comparables
        _fuente = "avm"
        # AUDITORÍA 07-08: 36% de las colonias no tienen AVM cargado → sobre_mercado salía CIEGO (0 unidades).
        # FALLBACK: usar el $/m² mediano de los COMPARABLES de la colonia (dev_competitor_price_snapshots,
        # incluye los cierres retro DECA). Da una referencia real de mercado aunque falte el AVM.
        if not ref or ref <= 0:
            comps = [c async for c in db.dev_competitor_price_snapshots.find(
                {"$or": [{"colonia_id": colonia_id}, {"zone_id": colonia_id}]}, {"_id": 0, "price_m2_median": 1})]
            m2s = sorted(float(c["price_m2_median"]) for c in comps if c.get("price_m2_median"))
            if m2s:
                ref = m2s[len(m2s) // 2]
                _fuente = "comparables"
        if not ref or ref <= 0:
            return 0
        n = 0
        for u in units:
            price = u.get("price")
            m2 = u.get("m2_total") or u.get("m2_privative")
            if price and m2 and float(m2) > 0:
                pct = round((float(price) / float(m2) / float(ref) - 1) * 100, 1)
                # Cordura: un |sobre-mercado| > 60% casi siempre es referencia mala (colonia mal cruzada o
                # comparables ruidosos), no una señal real. Preferimos NO mostrar alerta a mostrar una engañosa.
                if abs(pct) > 60:
                    continue
                u["price_per_m2"] = round(float(price) / float(m2))
                u["sobre_mercado_pct"] = pct
                u["sobre_mercado_fuente"] = _fuente   # 'avm' o 'comparables' (transparencia de la referencia)
                n += 1
        return n
    except Exception:
        return 0


async def resolve_dev_doc(db, dev_id: str, with_units: bool = True) -> Optional[Dict[str, Any]]:
    """Devuelve el proyecto por id desde CUALQUIER origen: semilla → db.developments (ingesta/espejo) → db.projects
    (wizard). Carga units de db.units si no vienen embebidas. Fuente ÚNICA para 'dame el proyecto X sin importar de
    dónde salió' → reemplaza los DEVELOPMENTS_BY_ID.get() que daban 404 sobre inventario ingerido (auditoría 07-07)."""
    if not dev_id:
        return None
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        d = DEVELOPMENTS_BY_ID.get(dev_id)
        if d:
            return dict(d)  # la semilla ya trae units embebidas
    except Exception:
        pass
    doc = None
    try:
        doc = await db.developments.find_one({"id": dev_id}, {"_id": 0})
    except Exception:
        pass
    if not doc:
        try:
            doc = await db.projects.find_one({"id": dev_id}, {"_id": 0})
        except Exception:
            pass
    if not doc:
        return None
    doc = dict(doc)
    if with_units and not doc.get("units"):
        # `oculto_ficha`: unidades marcadas para NO mostrarse en la ficha pública (p.ej. reservadas
        # SIN m²/rec/baños que crean tarjetas malformadas). Los motores (absorción/demanda/score)
        # siguen viendo TODO vía units_for_dev directo — este filtro es SOLO para lo público. (07-22)
        doc["units"] = [u for u in await units_for_dev(db, dev_id) if not u.get("oculto_ficha")]
    return doc


async def ingested_dev_cards(db, published_only: bool = True) -> List[Dict[str, Any]]:
    """Tarjetas de proyectos INGERIDOS listas para el marketplace: gate marketplace_published != False/'pending'
    (ya aprobados por el superadmin) + units reales de db.units. Fail-open (nunca rompe el listado)."""
    out: List[Dict[str, Any]] = []
    try:
        # TODA la familia de ingesta (07-16: el masivo carga con source='masivo_gdc'/'masivo_class'
        # y el filtro solo dejaba pasar 'bulk_ingest' → 49 proyectos publicados invisibles en el listado)
        q: Dict[str, Any] = {"source": {"$in": ["bulk_ingest", "masivo_gdc", "masivo_class",
                                                "prueba_2proyectos", "ingesta_en_sesion"]}}
        if published_only:
            # MISMA puerta que la ficha (marketplace_contract): si CUALQUIER interruptor dice que
            # no, no se publica. Antes esto miraba solo `marketplace_published` y dejaba pasar
            # desarrollos marcados `published: False` — apagados en la pantalla, vivos al público.
            from marketplace_contract import PUERTA_PUBLICA
            q.update(PUERTA_PUBLICA)
        async for d in db.developments.find(q, {"_id": 0}).limit(500):
            card = dev_doc_to_card(d)
            if not card:
                continue
            units = [u for u in await units_for_dev(db, d.get("id")) if not u.get("oculto_ficha")]
            card["units"] = units
            apply_unit_aggregates(card, units)
            # fotos de la TARJETA del marketplace = renders clasificados (antes salía el placeholder oscuro)
            if not card.get("photos"):
                card["photos"] = await public_photos(db, d.get("id"), limit=6)
            if not card.get("photos"):
                # familia masivo (CLASS/GDC): sus fotos viven en dev_assets, no en project_assets
                # (07-16: 20 tarjetas CLASS salían sin foto aunque la FICHA sí las mostraba)
                try:
                    from dev_assets import public_photos_for_dev
                    fotos = await public_photos_for_dev(db, d.get("id"))
                    card["photos"] = [p["url"] for p in fotos if p.get("url")
                                      and p["url"].lower().endswith((".jpg", ".jpeg", ".png", ".webp"))][:6]
                except Exception:  # noqa: BLE001
                    pass
            out.append(card)
    except Exception:
        pass
    return out
