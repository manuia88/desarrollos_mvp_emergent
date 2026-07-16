"""Dev Project Full — capa de lectura ÚNICA (B0.1). Fusiona seed/developments + las
colecciones por-tab (amenidades, comercialización, pagos, construcción, precio, contenido)
en un payload canónico. Fin del silo: una sola fuente que dev/asesor/marketplace/superadmin
pueden consumir (B0.3/B2/B3 reusan project_full()).

Upgrade que cierra el ciclo: project_readiness() = "qué tan lista está la ficha para publicar"
(% + qué falta + a qué tab ir), consumido HOY por el Inicio de la ficha (no standalone).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.project_full")
router = APIRouter(prefix="/api/dev", tags=["project_full"])


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _user_dev_ids(user) -> List[str]:
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


async def _owns_project(db, user, pid: str) -> bool:
    """Acceso del dev a un proyecto. Además del seed (user_dev_ids), permite proyectos creados
    por el wizard verificando pertenencia por org en Mongo — cierra el ciclo crear→abrir ficha
    sin tocar tenant_scope (sync). Scoped: nunca cruza de tenant."""
    from tenant_scope import tenant_of
    if getattr(user, "role", None) == "superadmin":
        return True
    if pid in _user_dev_ids(user):
        return True
    tenant = tenant_of(user)
    try:
        doc = (await db.projects.find_one({"id": pid}, {"_id": 0, "dev_org_id": 1})
               or await db.developments.find_one({"id": pid}, {"_id": 0, "dev_org_id": 1}))
    except Exception as e:
        # C5 · fail-CLOSED (niega acceso) pero lo registra (no se queda mudo si la DB falla).
        import logging
        logging.getLogger("dmx.dev_project_full").warning(f"[_owns_project] consulta falló, niega acceso: {e}")
        doc = None
    return bool(doc and doc.get("dev_org_id") and doc.get("dev_org_id") == tenant)


async def project_full(db, pid: str) -> Optional[Dict[str, Any]]:
    """Payload canónico del proyecto (seed/developments/projects + colecciones por-tab).
    Fuente única reusable por todos los portales. Fail-open por bloque."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(pid)
    if not dev:
        dev = (await db.developments.find_one({"id": pid}, {"_id": 0})
               or await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0}))
    if not dev:
        return None

    async def _find(col, q):
        try:
            return await db[col].find_one(q, {"_id": 0})
        except Exception:
            return None

    am = await _find("project_amenities", {"project_id": pid}) or {}
    comm = await _find("project_commercialization", {"project_id": pid})
    psd = await _find("dev_payment_schemes", {"project_id": pid}) or {}
    con = await _find("project_construction_progress", {"project_id": pid}) or {}

    # DERIVAR de las unidades (la fuente de verdad) lo que el masivo guardó AHÍ y no en
    # el doc del dev — así el expediente refleja lo que la lista de precios trae, sin
    # depender de una materialización aparte que se desincroniza (incidente 07-16):
    #   · price_from/price_to = min/max de precios de unidad
    #   · forma de pago = el desglose crédito/enganche por unidad ES la forma de pago
    precios, con_desglose = [], 0
    try:
        async for u in db.units.find({"development_id": pid},
                                     {"_id": 0, "price_mxn": 1, "price": 1,
                                      "credito_mxn": 1, "enganche_mxn": 1}):
            p = u.get("price_mxn") or u.get("price")
            if p:
                precios.append(float(p))
            if u.get("credito_mxn") and u.get("enganche_mxn"):
                con_desglose += 1
    except Exception:  # noqa: BLE001
        pass
    price_from = dev.get("price_from") or (min(precios) if precios else None)
    price_to = dev.get("price_to") or (max(precios) if precios else None)
    schemes = psd.get("schemes") or []
    if not schemes and con_desglose:
        schemes = [{"nombre": "Según lista de precios",
                    "origen": "desglose por unidad (crédito/enganche/reservación)",
                    "unidades_con_desglose": con_desglose}]

    try:
        n_assets = await db.dev_assets.count_documents({"development_id": pid})
    except Exception:
        n_assets = 0
    # Documentos legales (di_documents) — el pipeline IA los procesa (OCR→extracción→cross-check)
    try:
        n_legal = await db.di_documents.count_documents({"development_id": pid})
        n_legal_ok = await db.di_documents.count_documents({"development_id": pid, "status": "extracted"})
    except Exception:
        n_legal, n_legal_ok = 0, 0
    legal_status = dev.get("legal_status") or "sin_contrato"
    photos = dev.get("photos") if isinstance(dev.get("photos"), list) else []

    ph = dev.get("price_history") or []
    since = None
    if len(ph) >= 2 and ph[0].get("price"):
        since = round((ph[-1]["price"] / ph[0]["price"] - 1) * 100, 1)

    # center canónico [lng, lat]; los proyectos del wizard guardan lat/lng planos → reconstruir
    center = dev.get("center")
    if not center and dev.get("lat") is not None and dev.get("lng") is not None:
        center = [dev.get("lng"), dev.get("lat")]
    center = center or [None, None]
    return {
        "project_id": pid, "nombre": dev.get("name"), "stage": dev.get("stage"),
        "price_from": price_from, "price_to": price_to,
        "units_total": len(dev.get("units") or []) or dev.get("units_total"),
        "delivery_estimate": dev.get("delivery_estimate"),
        "ubicacion": {
            "lat": center[1] if len(center) > 1 else None, "lng": center[0] if center else None,
            "colonia": dev.get("colonia"), "colonia_id": dev.get("colonia_id"), "alcaldia": dev.get("alcaldia"),
        },
        "amenidades": {
            "amenities": am.get("amenities") or dev.get("amenities") or [],
            "confirmado_ninguna": bool(am.get("amenities_confirmado_ninguna")),
            "servicios": am.get("servicios") or {}, "amenity_scope": am.get("amenity_scope") or {},
        },
        "comercializacion": {
            "configured": bool(comm),
            "works_with_brokers": (comm or {}).get("works_with_brokers", False),
            "in_house_only": (comm or {}).get("in_house_only", True),
            "default_commission_pct": (comm or {}).get("default_commission_pct", 3.0),
            "broker_policy": (comm or {}).get("broker_policy") or {},
            "sales_policy": (comm or {}).get("sales_policy") or {},
        },
        "pagos": {"schemes": schemes, "fecha_inicio": psd.get("fecha_inicio"), "fecha_entrega": psd.get("fecha_entrega")},
        "construccion": {
            # entrega inmediata = el edificio YA está terminado → avance 100% (dato del
            # Maestro/estatus; antes se marcaba FALTA aunque la fuente lo dijera, 07-16)
            "overall_percent": (con.get("overall_percent")
                                if con.get("overall_percent") is not None
                                else (100 if "inmediata" in str(
                                    dev.get("stage") or dev.get("etapa_comercial") or "").lower()
                                    else None)),
            "current_stage": con.get("current_stage")
            or ("Entregado" if "inmediata" in str(
                dev.get("stage") or dev.get("etapa_comercial") or "").lower() else None),
            "sistema_constructivo": con.get("sistema_constructivo") or {},
        },
        "contenido": {"photos": len(photos), "assets": n_assets, "video": bool(dev.get("video_url")), "tour": bool(dev.get("tour360_url"))},
        "legal": {"estado": legal_status, "docs": n_legal, "verificados": n_legal_ok},
        "plusvalia_desde_lanzamiento_pct": since,
        "source": "seed" if DEVELOPMENTS_BY_ID.get(pid) else "db",
    }


def project_readiness(full: Dict[str, Any]) -> Dict[str, Any]:
    """Qué tan lista está la ficha para publicar a los portales (% + qué falta + a qué tab ir)."""
    a = full.get("amenidades") or {}
    pay = full.get("pagos") or {}
    con = full.get("construccion") or {}
    loc = full.get("ubicacion") or {}
    cont = full.get("contenido") or {}
    comm = full.get("comercializacion") or {}
    leg = full.get("legal") or {}
    checks = [
        ("Datos básicos", bool(full.get("nombre") and full.get("price_from")), "inicio"),
        ("Ubicación en el mapa", bool(loc.get("lat") and loc.get("colonia")), "ubicacion"),
        # amenidades del Maestro (autoritativo): tener su lista —aunque sean pocas— o
        # confirmar "sin amenidades" ES estar completo (FALTA≠CERO, founder 07-16)
        ("Amenidades", len(a.get("amenities") or []) >= 1 or a.get("confirmado_ninguna"), "amenidades"),
        ("Servicios del desarrollo", len(a.get("servicios") or {}) >= 1, "amenidades"),
        ("Sistema constructivo", bool((con.get("sistema_constructivo") or {}).get("cimentacion")), "avance"),
        ("Formas de pago", len(pay.get("schemes") or []) >= 1, "comercializacion"),
        ("Política comercial", bool(comm.get("configured")), "comercializacion"),
        ("Fotos del proyecto", ((cont.get("photos") or 0) + (cont.get("assets") or 0)) >= 3, "contenido"),
        ("Documentos legales", (leg.get("docs") or 0) >= 1 or leg.get("estado") in ("aprobado", "en_revision"), "legal"),
        ("Avance de obra", (con.get("overall_percent") or 0) > 0, "avance"),
    ]
    passed = sum(1 for _, ok, _ in checks if ok)
    pct = round(passed / len(checks) * 100)
    return {
        "pct": pct, "passed": passed, "total": len(checks),
        "missing": [{"label": l, "tab": t} for l, ok, t in checks if not ok],
        "publishable": pct >= 80,
    }


async def publish_to_developments(db, pid: str, *, user_id: Optional[str] = None,
                                  source: str = "publish") -> Optional[Dict[str, Any]]:
    """Espeja el payload canónico a db.developments (la tienda que leen superadmin/marketplace).
    Guarda campos dev-compat (planos, para queries existentes) + bloque `config` rico para B0.3/B2."""
    full = await project_full(db, pid)
    if not full:
        return None
    from data_developments import DEVELOPMENTS_BY_ID
    seed = DEVELOPMENTS_BY_ID.get(pid) or await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0}) or {}
    loc = full["ubicacion"]
    # Coords: los proyectos del wizard las guardan planas en db.projects → resolver y persistir
    _lat = loc.get("lat") if loc.get("lat") is not None else seed.get("lat")
    _lng = loc.get("lng") if loc.get("lng") is not None else seed.get("lng")
    now_iso = datetime.now(timezone.utc).isoformat()
    rd = project_readiness(full)
    doc = {
        "id": pid, "slug": pid, "name": full["nombre"],
        "colonia": loc.get("colonia"), "colonia_id": loc.get("colonia_id"), "alcaldia": loc.get("alcaldia"),
        "city": seed.get("city"), "lat": _lat, "lng": _lng,
        "center": ([_lng, _lat] if _lat is not None and _lng is not None else seed.get("center")),
        "price_from": full.get("price_from"), "price_to": full.get("price_to"),
        "m2_range": seed.get("m2_range"), "units_total": full.get("units_total"),
        "units": seed.get("units", []), "units_sold": seed.get("units_sold"),
        "units_available": seed.get("units_available"), "units_reserved": seed.get("units_reserved"),
        "stage": full.get("stage"), "delivery_estimate": full.get("delivery_estimate"),
        "amenities": full["amenidades"]["amenities"], "photos": seed.get("photos", []),
        "description": seed.get("description"), "address_full": seed.get("address_full"),
        "developer_id": seed.get("developer_id"), "dev_org_id": seed.get("dev_org_id"),
        "featured": seed.get("featured", False), "verified": True,
        "legal_status": seed.get("legal_status") or "sin_contrato",  # B1.3 · estado legal del dev
        # Bloque rico (la unificación de verdad — lo que B0.3/B2 consumirán):
        "config": {
            "servicios": full["amenidades"]["servicios"], "amenity_scope": full["amenidades"]["amenity_scope"],
            "sistema_constructivo": full["construccion"]["sistema_constructivo"],
            "payment_schemes": full["pagos"]["schemes"],
            "broker_policy": full["comercializacion"]["broker_policy"],
            "sales_policy": full["comercializacion"]["sales_policy"],
            "in_house_only": full["comercializacion"]["in_house_only"],
            "plusvalia_desde_lanzamiento_pct": full.get("plusvalia_desde_lanzamiento_pct"),
        },
        "readiness_pct": rd["pct"],
        # Propaga el estado de publicación al espejo (antes se omitía → campo muerto: get_development no podía
        # respetar un "despublicado" y list nunca sabía el estado real). Conserva el valor real de la fuente.
        "marketplace_published": seed.get("marketplace_published"),
        "published_at": now_iso, "published_by": user_id, "published_source": source,
    }
    try:
        await db.developments.update_one({"id": pid}, {"$set": doc}, upsert=True)
    except Exception as e:  # noqa
        log.warning(f"[publish] {pid}: {e}")
        return None
    return {"ok": True, "published_at": now_iso, "readiness_pct": rd["pct"]}


# ─── B0.3 · Adaptadores de overlay (portales leen la capa única, fail-open) ───────

def _payment_public(schemes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Proyección segura al comprador de las formas de pago (sin datos internos)."""
    out = []
    for s in schemes or []:
        out.append({
            "nombre": s.get("nombre"), "firma_pct": s.get("firma_pct"),
            "mensualidades_pct": s.get("mensualidades_pct"), "escritura_pct": s.get("escritura_pct"),
            "descuento_pct": s.get("descuento_pct") or 0, "apartado_mxn": s.get("apartado_mxn"),
        })
    return out


_LEGAL_TIER = {
    "aprobado": ("green", "Documentación aprobada"),
    "en_revision": ("amber", "Verificación legal en proceso"),
    "docs_pendientes": ("amber", "Documentos en integración"),
    "rechazado": ("red", "Documentación con observaciones"),
    "sin_contrato": ("gray", "Documentación pendiente"),
}


def legal_seal(estado: Optional[str], n_docs: int = 0, n_extracted: int = 0) -> Dict[str, Any]:
    """Traduce el estado legal + documentos a una señal de confianza para el comprador.
    Honesto: 'el asistente los está revisando' (corre OCR+extracción) → 'verificados' cuando termina."""
    tier, titulo = _LEGAL_TIER.get(estado or "sin_contrato", ("gray", "Documentación pendiente"))
    if n_extracted >= 1:
        desc = f"{n_extracted} documento(s) revisados por el asistente legal."
    elif n_docs >= 1:
        desc = f"{n_docs} documento(s) cargados · el asistente los está revisando."
    else:
        desc = "Aún no se cargan documentos legales."
    return {"configured": bool(n_docs) or estado in ("aprobado", "en_revision"),
            "tier": tier, "titulo": titulo, "descripcion": desc, "docs": n_docs, "verificados": n_extracted}


async def project_public_overlay(db, pid: str) -> Dict[str, Any]:
    """Capa que el portal PÚBLICO superpone sobre el seed (fail-open). SOLO datos seguros para el
    comprador (amenidades, servicios, formas de pago, sistema constructivo, plusvalía). Reusa
    project_full (fusión única). Devuelve {} si el dev no configuró nada → la ficha queda intacta."""
    try:
        full = await project_full(db, pid)
    except Exception:
        full = None
    if not full:
        return {}
    am = full.get("amenidades") or {}
    pagos = full.get("pagos") or {}
    sis = (full.get("construccion") or {}).get("sistema_constructivo") or {}
    leg = full.get("legal") or {}
    sello_leg = legal_seal(leg.get("estado"), leg.get("docs") or 0, leg.get("verificados") or 0)
    has_any = bool(am.get("servicios") or am.get("amenity_scope") or pagos.get("schemes") or sis or sello_leg["configured"])
    if not has_any:
        return {}
    # Sello de confianza en lenguaje del comprador (fuente única en dev_batch2)
    try:
        from routes.dev_batch2 import construction_seal
        sello = construction_seal(sis)
    except Exception:
        sello = {"configured": False}
    return {
        "amenidades": am.get("amenities") or [], "servicios": am.get("servicios") or {},
        "amenity_scope": am.get("amenity_scope") or {},
        "formas_pago": _payment_public(pagos.get("schemes")),
        "fecha_inicio": pagos.get("fecha_inicio"),
        # Fallback a la entrega del proyecto si el dev no puso fecha en el módulo de pagos → el plan no muestra "$0/mes".
        "fecha_entrega": pagos.get("fecha_entrega") or full.get("delivery_estimate"),
        "sistema_constructivo": sis, "sello_constructivo": sello,
        "sello_legal": sello_leg,
        "plusvalia_desde_lanzamiento_pct": full.get("plusvalia_desde_lanzamiento_pct"),
        "fuente": "dev_configurado",
    }


async def portal_preview(db, pid: str) -> Dict[str, Any]:
    """Vista de "cómo te ven los portales" para el DEV (cierra el ciclo de B0.2/B0.3).
    Tres lentes sobre la MISMA fuente unificada: comprador (marketplace), asesor, corporativo."""
    full = await project_full(db, pid) or {}
    comm = full.get("comercializacion") or {}
    ov = await project_public_overlay(db, pid)
    rd = project_readiness(full) if full else {"pct": 0, "missing": []}
    pub = await db.developments.find_one({"id": pid}, {"_id": 0, "published_at": 1})
    published = bool((pub or {}).get("published_at"))

    n_serv = len((ov.get("servicios") or {}))
    n_amen = len((ov.get("amenidades") or []))
    n_pago = len((ov.get("formas_pago") or []))
    tiene_sistema = bool(ov.get("sistema_constructivo"))
    cont = full.get("contenido") or {}
    n_fotos = (cont.get("photos") or 0) + (cont.get("assets") or 0)
    leg = full.get("legal") or {}
    sello_leg = legal_seal(leg.get("estado"), leg.get("docs") or 0, leg.get("verificados") or 0)
    comprador_items = []
    if n_fotos:
        comprador_items.append(f"{n_fotos} fotos del proyecto")
    if n_amen:
        comprador_items.append(f"{n_amen} amenidades")
    if n_serv:
        comprador_items.append(f"{n_serv} servicios (gas, agua, luz…)")
    if n_pago:
        comprador_items.append(f"{n_pago} formas de pago")
    if tiene_sistema:
        comprador_items.append("Sistema constructivo (sello de confianza)")
    if sello_leg["configured"]:
        comprador_items.append(f"Sello legal: {sello_leg['titulo'].lower()}")
    if ov.get("plusvalia_desde_lanzamiento_pct") is not None:
        comprador_items.append(f"Plusvalía +{ov['plusvalia_desde_lanzamiento_pct']}% desde lanzamiento")

    pol_ok = bool(comm.get("configured"))
    asesor_items = []
    if pol_ok:
        asesor_items.append(f"Comisión {comm.get('default_commission_pct', 3.0)}%")
        asesor_items.append("Brokers externos" if comm.get("works_with_brokers") else "Solo venta interna")
    if n_pago:
        asesor_items.append(f"{n_pago} formas de pago para cotizar")

    return {
        "project_id": pid, "published": published, "readiness_pct": rd.get("pct", 0),
        "lentes": [
            {
                "key": "comprador", "titulo": "Así te ve el comprador", "sub": "Marketplace público",
                "estado": "activo" if comprador_items else "vacio",
                "items": comprador_items or ["Aún no configuras datos visibles al comprador"],
                "nota": "Tu ficha pública ya entrega estos datos." if comprador_items else "Configura amenidades, servicios o formas de pago.",
            },
            {
                "key": "asesor", "titulo": "Así te vende el asesor", "sub": "Portal del asesor",
                "estado": "activo" if asesor_items else "pendiente",
                "items": asesor_items or ["Falta tu política comercial (comisión y reglas)"],
                "nota": "Tu política y pagos alimentan su guion de venta." if asesor_items else "Configura tu política comercial.",
            },
            {
                "key": "corporativo", "titulo": "Así te ve el corporativo", "sub": "Terminal superadmin",
                "estado": "activo" if published else "pendiente",
                "items": (([f"Ficha {rd.get('pct', 0)}% completa", "Cuentas en la terminal global"]
                           + ([f"{leg.get('docs')} documentos legales (riesgo verificable)"] if (leg.get("docs") or 0) else []))
                          if published else ["Publica para aparecer en la terminal global"]),
                "nota": "Apareces en métricas y rankings del corporativo." if published else "Publica a portales para entrar.",
            },
        ],
    }


@router.get("/projects/{project_id}/portal-preview")
async def get_portal_preview(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if not await _owns_project(db, user, project_id):
        raise HTTPException(403, "Proyecto no accesible")
    return await portal_preview(db, project_id)


@router.get("/projects/{project_id}/full")
async def get_project_full(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if not await _owns_project(db, user, project_id):
        raise HTTPException(403, "Proyecto no accesible")
    full = await project_full(db, project_id)
    if not full:
        raise HTTPException(404, "Proyecto no encontrado")
    full["readiness"] = project_readiness(full)
    pub = await db.developments.find_one({"id": project_id}, {"_id": 0, "published_at": 1})
    full["published"] = {"at": (pub or {}).get("published_at")}
    return full


@router.post("/projects/{project_id}/publish")
async def publish_project(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if not await _owns_project(db, user, project_id):
        raise HTTPException(403, "Proyecto no accesible")
    res = await publish_to_developments(db, project_id, user_id=getattr(user, "user_id", None), source="manual")
    if not res:
        raise HTTPException(404, "Proyecto no encontrado")
    return res


async def ensure_project_full_indexes(db):
    """Índices de las sub-colecciones de la ficha del proyecto (antes vacío →
    full-scan en cada apertura de ficha). FAIL-OPEN por índice."""
    specs = {
        "project_amenities": [[("project_id", 1)]],
        "project_commercialization": [[("project_id", 1)]],
        "project_construction_progress": [[("project_id", 1)]],
        "project_legal": [[("project_id", 1)]],
        "project_payment_schemes": [[("project_id", 1)]],
    }
    for coll, idxs in specs.items():
        for keys in idxs:
            try:
                await db[coll].create_index(keys, background=True)
            except Exception:
                pass
    return None
