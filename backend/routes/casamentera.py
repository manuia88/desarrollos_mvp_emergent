"""
Casamentera proactiva — Etapa 4 del Copiloto (2026-06-18).

El sistema BUSCA por el comprador: cuando entra/cambia inventario que matchea una búsqueda GUARDADA (alert=true),
crea una alerta para el comprador Y para su asesor (si ya es lead). Vuelve los leads dormidos en citas sin que un
humano mueva un dedo. Reusa: marketplace_searches (alertas guardadas) + el match de perfil_recomendar + el lead_id
(enganchado en E3) → el asesor lo ve. Cierra el ciclo oferta-nueva → match → re-engagement.

Anónimo hasta que el comprador es lead (E3). db.buyer_alerts (dedup por búsqueda×dev).
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request

log = logging.getLogger("dmx.routes_casamentera")
router = APIRouter(tags=["casamentera"])


def _profile_from_search(s):
    from routes.perfil_recomendar import PerfilIn
    return PerfilIn(
        colonias=s.get("colonias") or [],
        presupuesto_max=s.get("precio_max"),
        recamaras_min=s.get("recamaras_min"),
        banos_min=s.get("banos_min"),
        estacionamientos_min=s.get("estacionamientos_min"),
        stages=s.get("stages") or [],
        plazo=s.get("plazo") or "cualquiera",
    )


def _matching_units(d, s):
    """Unidades DISPONIBLES del desarrollo que cumplen lo interno de la búsqueda guardada (alerta a nivel UNIDAD)."""
    feats = s.get("features_pedidos") or []
    out = []
    for u in (d.get("units") or []):
        if u.get("status") != "disponible":
            continue
        if s.get("recamaras_min") and (u.get("bedrooms") or 0) < s["recamaras_min"]:
            continue
        if s.get("banos_min") and (u.get("bathrooms") or 0) < s["banos_min"]:
            continue
        if s.get("estacionamientos_min") and (u.get("parking_spots") or 0) < s["estacionamientos_min"]:
            continue
        if s.get("precio_max") and (u.get("price") or 0) > s["precio_max"]:
            continue
        _sqm = u.get("m2_total") or u.get("m2_privative") or 0
        if s.get("m2_min") and _sqm < s["m2_min"]:
            continue
        if s.get("m2_max") and _sqm > s["m2_max"]:
            continue
        if feats and not all(u.get(f) for f in feats):
            continue
        if u.get("unit_number"):
            out.append(u.get("unit_number"))
    return out


async def correr_casamentera(db, dev_ids=None):
    """Escanea las búsquedas guardadas (alert=true) × inventario → crea alertas para matches nuevos.
    dev_ids = solo esos desarrollos (ej. uno que acaba de entrar/bajar precio); None = todo el catálogo."""
    from data_developments import DEVELOPMENTS
    from routes.perfil_recomendar import _passes_extra
    devs = [d for d in DEVELOPMENTS if (dev_ids is None or d.get("id") in dev_ids)]
    now = datetime.now(timezone.utc)
    created = 0
    async for s in db.marketplace_searches.find({"alert": True}):
      try:
        prof = _profile_from_search(s)
        for d in devs:
            if not _passes_extra(d, prof):
                continue
            # Alerta a nivel UNIDAD: qué unidades disponibles cumplen (si el dev tiene lista de precios).
            unidades = _matching_units(d, s)
            if (d.get("units") or []) and not unidades:
                continue  # tiene lista pero ninguna unidad disponible cumple → no alertes
            key = f"{s.get('visitor_id')}|{d.get('id')}"
            _razon = (f"Entró una unidad que cumple: #{unidades[0]}" if unidades
                      else f"Encaja con tu búsqueda en {(s.get('colonias') or ['tu zona'])[0]}")
            doc = {
                "dedup": key, "visitor_id": s.get("visitor_id"), "lead_id": s.get("lead_id"),
                "dev_id": d.get("id"), "dev_name": d.get("name"), "colonia": d.get("colonia"),
                "price_from_display": d.get("price_from_display"),
                "unidades": unidades,
                "razon": _razon,
                "created_at_dt": now, "visto": False,
            }
            res = await db.buyer_alerts.update_one({"dedup": key}, {"$setOnInsert": doc}, upsert=True)
            if res.upserted_id is not None:
                created += 1
                # Si ya es lead (E3), deja rastro en el CRM del asesor + AVISA por WhatsApp (E6) si dejó teléfono.
                if s.get("lead_id"):
                    try:
                        lead = await db.leads.find_one({"id": s["lead_id"]}, {"_id": 0, "contact": 1})
                        await db.leads.update_one({"id": s["lead_id"]}, {"$push": {"casamentera_matches": {"dev_id": d.get("id"), "dev_name": d.get("name"), "at": now.isoformat()}},
                                                                          "$set": {"last_activity_at": now.isoformat()}})
                        phone = ((lead or {}).get("contact") or {}).get("phone")
                        if phone:
                            from routes.whatsapp_copiloto import notify_buyer_wa
                            _u = f" (unidad #{unidades[0]})" if unidades else ""
                            await notify_buyer_wa(db, phone, f"🔔 ¡Encontramos algo para ti! {d.get('name')} en {d.get('colonia')}{_u} — cumple lo que buscas. Míralo aquí 👉 {__import__('os').environ.get('FRONTEND_URL','https://desarrollosmx.io')}/desarrollo/{d.get('id')}")
                    except Exception:
                        pass
      except Exception as _e:  # noqa: BLE001 — una búsqueda con dato malo no tira el scan entero
        log.warning(f"[casamentera] search skip: {_e}")
    return created


@router.post("/api/casamentera/correr")
async def correr(request: Request):
    """Dispara la casamentera (demo/cron). En prod se llamaría al entrar/bajar de precio un desarrollo."""
    try:
        db = request.app.state.db
        n = await correr_casamentera(db)
        return {"ok": True, "alertas_creadas": n}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[casamentera] fail: {e}")
        return {"ok": False}


@router.get("/api/buyer/alertas")
async def alertas(request: Request, visitor_id: str):
    """Las alertas del comprador (lo que la casamentera encontró para él). El comprador las ve al volver."""
    try:
        db = request.app.state.db
        out = []
        async for a in db.buyer_alerts.find({"visitor_id": visitor_id, "visto": False},
                                             {"_id": 0, "dev_id": 1, "dev_name": 1, "colonia": 1, "price_from_display": 1, "razon": 1, "unidades": 1}).limit(10):
            out.append(a)
        return {"ok": True, "alertas": out}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[casamentera] alertas fail: {e}")
        return {"ok": True, "alertas": []}
