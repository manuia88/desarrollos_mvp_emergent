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
_STATUS_ES = {
    "available": "disponible", "disponible": "disponible",
    "reserved": "reservado", "reservado": "reservado", "apartado": "reservado",
    "sold": "vendido", "vendido": "vendido",
}


def _parking_int(u: Dict[str, Any]) -> int:
    """cajones como entero: usa parking_spots si existe; si no, extrae dígitos del string 'parking' ('2 cajones' → 2)."""
    if u.get("parking_spots") is not None:
        try:
            return int(u.get("parking_spots") or 0)
        except (TypeError, ValueError):
            return 0
    raw = u.get("parking")
    if raw is None:
        return 0
    digits = re.sub(r"[^\d]", "", str(raw))
    if digits:
        return int(digits)
    # 'parking' es texto sin número (ej. 'incluido') → cuenta como 1 cajón
    return 1 if str(raw).strip() else 0


def normalize_unit(u: Dict[str, Any]) -> Dict[str, Any]:
    """Devuelve la unidad con el vocabulario CANÓNICO (tolerante a nombres legacy de la ingesta). Conserva todo lo demás."""
    out = dict(u)
    price = u.get("price") if u.get("price") is not None else u.get("price_mxn")
    m2_total = u.get("m2_total") or u.get("size_m2_total") or u.get("size_m2")
    m2_priv = u.get("m2_privative") or u.get("size_m2")
    st = _STATUS_ES.get(str(u.get("status") or "").lower().strip(), None)
    if st is None:
        # sin status legible → asumimos disponible (una lista de precios sin marca suele ser oferta viva)
        st = "disponible"
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
    """Unidades REALES del proyecto desde db.units (ingesta usa development_id, wizard usa project_id), normalizadas."""
    if not dev_id:
        return []
    units: List[Dict[str, Any]] = []
    try:
        async for u in db.units.find(
                {"$or": [{"development_id": dev_id}, {"project_id": dev_id}]}, {"_id": 0}):
            units.append(normalize_unit(u))
    except Exception:
        pass
    return units


def _property_type_from_units(units: List[Dict[str, Any]]) -> str:
    """Tipo de propiedad dominante para la tarjeta (departamento por defecto)."""
    for u in units:
        t = str(u.get("type") or u.get("prototype") or "").lower()
        if "casa" in t:
            return "casa"
        if "terreno" in t:
            return "terreno"
    return "departamento"


def apply_unit_aggregates(card: Dict[str, Any], units: List[Dict[str, Any]]) -> None:
    """Recalcula precio 'desde/hasta', conteos por estado y rangos a partir de las unidades vivas (in-place)."""
    if not units:
        return
    prices = [u.get("price") for u in units if u.get("price")]
    beds = [u.get("bedrooms") for u in units if u.get("bedrooms") is not None]
    baths = [u.get("bathrooms") for u in units if u.get("bathrooms") is not None]
    park = [u.get("parking_spots") for u in units if u.get("parking_spots") is not None]
    m2 = [u.get("m2_total") or u.get("m2_privative") for u in units if (u.get("m2_total") or u.get("m2_privative"))]
    if prices:
        card["price_from"] = min(prices)
        card["price_to"] = max(prices)
    card["units_total"] = len(units)
    card["units_available"] = sum(1 for u in units if u.get("status") == "disponible")
    card["units_sold"] = sum(1 for u in units if u.get("status") == "vendido")
    card["units_reserved"] = sum(1 for u in units if u.get("status") == "reservado")
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
                    {"_id": 0, "drive_file_id": 1}).limit(limit):
                if a.get("drive_file_id"):
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
                {"_id": 0, "drive_file_id": 1, "filename": 1}).limit(300):
            fn = a.get("filename") or ""
            if a.get("drive_file_id") and _PLANO_NAME_RE.search(fn):
                planos.append({"fid": a["drive_file_id"], "fn": fn, "norm": _norm_token(fn),
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
                u["plano_url"] = f"/api/developments/{dev_id}/archivo/{hit['fid']}"
                u["plano_mime"] = "application/pdf"
                n += 1
        return n
    except Exception:
        return 0


async def sobre_mercado_pct(db, colonia_id: Optional[str], units: List[Dict[str, Any]]) -> int:
    """'Sobre mercado +X%' POR UNIDAD (spec founder): $/m² de la unidad vs $/m² de mercado de su colonia
    (colonia_valoracion.market_m2 — AVM con muestra real). Escribe sobre_mercado_pct en cada unidad (in-place).
    Devuelve cuántas unidades se calcularon. Fail-open (sin colonia o sin AVM → no escribe nada)."""
    if not colonia_id or not units:
        return 0
    try:
        cv = await db.colonia_valoracion.find_one({"colonia_id": colonia_id}, {"_id": 0, "market_m2": 1})
        ref = ((cv or {}).get("market_m2") or {}).get("valor")
        if not ref or ref <= 0:
            return 0
        n = 0
        for u in units:
            price = u.get("price")
            m2 = u.get("m2_total") or u.get("m2_privative")
            if price and m2 and float(m2) > 0:
                ppm2 = float(price) / float(m2)
                u["price_per_m2"] = round(ppm2)
                u["sobre_mercado_pct"] = round((ppm2 / float(ref) - 1) * 100, 1)
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
        doc["units"] = await units_for_dev(db, dev_id)
    return doc


async def ingested_dev_cards(db, published_only: bool = True) -> List[Dict[str, Any]]:
    """Tarjetas de proyectos INGERIDOS listas para el marketplace: gate marketplace_published != False/'pending'
    (ya aprobados por el superadmin) + units reales de db.units. Fail-open (nunca rompe el listado)."""
    out: List[Dict[str, Any]] = []
    try:
        q: Dict[str, Any] = {"source": "bulk_ingest"}
        if published_only:
            q["marketplace_published"] = {"$nin": [False, "pending"]}
        async for d in db.developments.find(q, {"_id": 0}).limit(500):
            card = dev_doc_to_card(d)
            if not card:
                continue
            units = await units_for_dev(db, d.get("id"))
            card["units"] = units
            apply_unit_aggregates(card, units)
            # fotos de la TARJETA del marketplace = renders clasificados (antes salía el placeholder oscuro)
            if not card.get("photos"):
                card["photos"] = await public_photos(db, d.get("id"), limit=6)
            out.append(card)
    except Exception:
        pass
    return out
