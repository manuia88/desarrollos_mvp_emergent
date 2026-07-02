"""Developer portal routes (Phase 5 — LADO DEVELOPER).

All endpoints gated by role `developer_admin` or `superadmin`.
Built atop mocked developments in data_developments.py plus runtime state in MongoDB.
"""

import os
import uuid
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from data_developments import is_sold  # C2 · vocabulario ÚNICO de "vendido" (absorción/ingreso)


router = APIRouter(prefix="/api/desarrollador", tags=["desarrollador"])

DEV_ADMIN_ROLES = {"developer_admin", "superadmin"}


def _now():
    return datetime.now(timezone.utc)


def _uid(pfx):
    return f"{pfx}_{uuid.uuid4().hex[:10]}"


def get_db(request: Request):
    return request.app.state.db


async def require_dev_admin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in DEV_ADMIN_ROLES:
        raise HTTPException(403, "Acceso restringido al portal del desarrollador")
    return user


def _user_dev_ids(user) -> List[str]:
    """Desarrollos visibles para este usuario (multi-tenant · fuente única tenant_scope).
    Antes: fuga — devolvía TODOS a cualquier dev. Ahora scope-a al slice del tenant."""
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


# ─── Dashboard ────────────────────────────────────────────────────────────────
async def _effective_units(db, dev_ids):
    """Unidades de los dev_ids con las ediciones manuales del dev (developer_unit_overrides) YA fusionadas → conteos/
    absorción/revenue coherentes con lo que el dev administra (igual que /inventario y la ficha pública). El dashboard,
    portfolio y reporte deben usar esto y NO ALL_UNITS crudo; si no, el dev ve dos absorciones distintas en la misma sesión."""
    from data_developments import ALL_UNITS
    dev_ids = set(dev_ids or [])
    units = [u for u in ALL_UNITS if u["development_id"] in dev_ids]
    if not units:
        return units
    overrides = {}
    try:
        async for ov in db.developer_unit_overrides.find({"dev_id": {"$in": list(dev_ids)}}, {"_id": 0}):
            overrides[ov.get("unit_id")] = ov
    except Exception:
        return units
    if not overrides:
        return units
    _flds = ("status", "bodega", "parking_type", "parking_spots", "vista", "m2_privative", "m2_balcony",
             "m2_terrace", "m2_roof_garden", "m2_total", "bedrooms", "bathrooms", "price", "prototype", "level")
    out = []
    for u in units:
        ov = overrides.get(u["id"])
        m = {**u}
        if ov:
            for f in _flds:
                if ov.get(f) is not None:
                    m[f] = ov[f]
        out.append(m)
    return out


def _elasticidad_label(cedio: str) -> str:
    """Convierte el código de lo que el comprador cedió en texto legible para el dev."""
    c = (cedio or "").strip()
    if ":" in c:
        _kind, val = c.split(":", 1)
        return val.replace("_", " ").strip().capitalize()
    M = {"baths": "Un baño menos", "beds": "Una recámara menos", "m2": "Menos m²", "m2_min": "Menos m²",
         "precio": "Subir presupuesto", "precio_max": "Subir presupuesto", "zona": "Cambiar de zona",
         "colonia": "Cambiar de colonia", "parking": "Menos cajones", "estacionamiento": "Menos cajones",
         "amenidades": "Menos amenidades", "stage": "Otra etapa de obra"}
    return M.get(c, c.replace("_", " ").capitalize())


@router.get("/elasticidad")
async def dev_elasticidad(request: Request):
    """En qué TRANSIGE el comprador cuando no encuentra todo (lo que más relaja). Dato de oro para producto/precio del dev,
    que antes solo veía el superadmin. Tendencia de mercado (CDMX) — `buyer_elasticidad` no guarda colonia. Fail-open."""
    await require_dev_admin(request)
    db = get_db(request)
    rows = []
    try:
        cur = db.buyer_elasticidad.aggregate([
            {"$group": {"_id": "$cedio", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}}, {"$limit": 12},
        ])
        async for r in cur:
            if r.get("_id"):
                rows.append({"cedio": r["_id"], "label": _elasticidad_label(r["_id"]), "n": r["n"]})
    except Exception:
        pass
    return {"concesiones": rows, "total": sum(r["n"] for r in rows), "alcance": "mercado_cdmx"}


@router.get("/dashboard")
async def dashboard(request: Request):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids]
    my_units = await _effective_units(get_db(request), dev_ids)   # con ediciones del dev (no seed crudo)

    available = sum(1 for u in my_units if u["status"] == "disponible")
    reserved  = sum(1 for u in my_units if u["status"] == "reservado")
    sold      = sum(1 for u in my_units if is_sold(u.get("status")))
    total     = len(my_units)
    absorption = round(100 * sold / total, 1) if total else 0

    revenue_booked = sum(u["price"] for u in my_units if is_sold(u.get("status")))
    revenue_pipeline = sum(u["price"] for u in my_units if u["status"] == "reservado")

    db = get_db(request)
    # Contadores SCOPED al dueño (antes contaban global → un dev veía el total de todos).
    _own = {"owner_id": user.user_id}
    pricing_alerts = await db.developer_pricing_suggestions.count_documents({"status": "pending", **_own})
    competitor_alerts = await db.developer_competitor_alerts.count_documents({"acked": {"$ne": True}, "user_id": user.user_id})

    return {
        "developments_count": len(my_devs),
        "units_total": total,
        "units_available": available,
        "units_reserved": reserved,
        "units_sold": sold,
        "absorption_pct": absorption,
        "revenue_booked": revenue_booked,
        "revenue_pipeline": revenue_pipeline,
        "pricing_alerts": pricing_alerts,
        "competitor_alerts": competitor_alerts,
        "developments": [{
            "id": d["id"], "name": d["name"], "colonia": d["colonia"], "stage": d["stage"],
            "units_total": d["units_total"], "units_available": d["units_available"],
            "delivery_estimate": d["delivery_estimate"], "price_from": d["price_from"],
        } for d in my_devs],
    }


# ─── La Lectura del Portafolio (Inicio · upgrade: cada número con su lectura + ──────
#     salud explicada + Live Pulse accionable). El asistente INTERPRETA los números del
#     cockpit en lenguaje normal con veredicto + acción. Reusa dashboard data + db.leads
#     + live_pulse_engine (fail-open). IA-first, cero deuda.
def _mmx(n):
    n = n or 0
    if n >= 1e9:
        return f"${n/1e9:.2f}B"
    if n >= 1e6:
        return f"${n/1e6:.1f}M"
    if n >= 1e3:
        return f"${n/1e3:.0f}K"
    return f"${round(n)}"


def _slug(s):
    return (s or "").lower().replace(" ", "-").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")


@router.get("/portfolio-reading")
async def portfolio_reading(request: Request):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids]
    my_units = await _effective_units(get_db(request), dev_ids)   # con ediciones del dev (no seed crudo)

    total = len(my_units)
    sold = sum(1 for u in my_units if is_sold(u.get("status")))
    avail = sum(1 for u in my_units if u["status"] == "disponible")
    resv = sum(1 for u in my_units if u["status"] == "reservado")
    absor = round(100 * sold / total) if total else 0
    por_cobrar = sum(u.get("price", 0) for u in my_units if u["status"] == "disponible")
    valor = sum(u.get("price", 0) for u in my_units)

    # Leads (universo real db.leads del portafolio)
    leads_by_dev = {}
    leads_total = 0
    leads_closed = 0
    try:
        async for l in db.leads.find({"development_id": {"$in": dev_ids}}, {"_id": 0, "development_id": 1, "status_v2": 1, "status": 1}):
            did = l.get("development_id")
            leads_by_dev[did] = leads_by_dev.get(did, 0) + 1
            leads_total += 1
            if (l.get("status_v2") or l.get("status") or "").lower() in ("vendido", "won", "ganado", "cerrado", "cerrado_ganado"):
                leads_closed += 1
    except Exception:
        pass
    conv = round(leads_closed / leads_total * 100) if leads_total else 0
    leads_x_unit = round(leads_total / avail, 1) if avail else 0
    # Demanda ANÓNIMA (top-of-funnel): vistas/me-gusta/guardados de la ficha ANTES de registrarse. Sin esto, un desarrollo
    # con mucho tráfico anónimo y pocos leads se leía como "demanda fría" — lo contrario de la realidad.
    senales_anon = 0
    try:
        senales_anon = await db.buyer_signals.count_documents({
            "entity_id": {"$in": list(dev_ids)},
            "type": {"$in": ["ficha_view", "view", "like", "save", "unit_view", "unit_save"]},
            "active": {"$ne": False}})
    except Exception:
        pass

    # ── Lecturas (cada número con su lectura + veredicto) ──
    lecturas = []
    lecturas.append({
        "metrica": "Dinero por cobrar", "valor": _mmx(por_cobrar),
        "veredicto": "ojo" if (avail and por_cobrar > valor * 0.5) else "bien",
        "lectura": f"Tienes {_mmx(por_cobrar)} sin cobrar en {avail} unidades. " +
                   ("Es buena parte de tu portafolio parado — moverlas libera capital." if (avail and por_cobrar > valor * 0.5) else "Vas colocando a buen ritmo."),
    })
    lecturas.append({
        "metrica": "Absorción", "valor": f"{absor}%",
        "veredicto": "bien" if absor >= 40 else "ojo" if absor >= 20 else "mal",
        "lectura": (f"Has colocado {absor}% del inventario ({sold} de {total}). " +
                    ("Ritmo sano para preventa." if absor >= 40 else "Vas lento para tu etapa — revisa precio o marketing." if absor < 20 else "Vas en camino, no te confíes.")),
    })
    _hot = leads_x_unit >= 2 or (avail and senales_anon >= avail * 12) or senales_anon >= 80
    _warm = leads_x_unit >= 1 or senales_anon >= (avail * 4 if avail else 20)
    lecturas.append({
        "metrica": "Demanda",
        "valor": f"{leads_total} leads" + (f" · {senales_anon} vistas/♥" if senales_anon else "") + f" · {leads_x_unit}/unidad",
        "veredicto": "bien" if _hot else "ojo" if _warm else "mal",
        "lectura": (f"{leads_total} registrados" + (f" + {senales_anon} interacciones anónimas (vistas/me-gusta)" if senales_anon else "") +
                    f" para {avail} unidades disponibles. " +
                    ("Demanda caliente — tienes espacio para subir precio." if _hot else "Demanda tibia — alimenta el embudo." if _warm else "Demanda fría — empuja marketing y captación.")),
    })
    if conv:
        lecturas.append({
            "metrica": "Conversión", "valor": f"{conv}%",
            "veredicto": "bien" if conv >= 15 else "ojo",
            "lectura": f"{conv}% de tus leads terminan en venta. " + ("Sano." if conv >= 15 else "Hay fuga — revisa seguimiento y tiempos de respuesta."),
        })

    # ── Salud explicada (qué la arrastra) ──
    drag = []
    for d in my_devs:
        a_av = d.get("units_available") or 0
        a_so = (d.get("units_sold") or 0) + (d.get("units_reserved") or 0)
        a_to = d.get("units_total") or 0
        st = round(100 * a_so / a_to) if a_to else 0
        ld = leads_by_dev.get(d["id"], 0)
        if a_av >= 6 and (st < 35 or ld == 0):
            motivo = "lleva mucho inventario y casi nadie pregunta" if ld == 0 else f"solo {st}% colocado y {a_av} unidades libres"
            drag.append({"proyecto": d.get("name"), "por_que": motivo,
                         "link": f"/desarrollador/proyectos/{d['id']}", "_stuck": a_av})
    drag.sort(key=lambda x: -x["_stuck"])
    for x in drag:
        x.pop("_stuck", None)
    if absor >= 40 and not drag:
        salud_verdict, salud_color = "Sana", "bien"
    elif drag or absor < 20:
        salud_verdict, salud_color = "Necesita atención", "mal"
    else:
        salud_verdict, salud_color = "Estable", "ojo"
    salud = {"veredicto": salud_verdict, "color": salud_color, "drivers": drag[:3],
             "resumen": (f"{len(drag)} proyecto(s) frenan el portafolio." if drag else "Ningún proyecto te está frenando.")}

    # ── Live Pulse accionable (señal viva de tu zona principal) ──
    pulso = {"fuente": "espera", "texto": "El pulso del mercado se enciende con el tráfico real de tus zonas.", "accion": None, "link": None, "zona": None}
    try:
        import live_pulse_engine as lpe
        top_zona = None
        zmoney = {}
        for d in my_devs:
            zmoney[d.get("colonia")] = zmoney.get(d.get("colonia"), 0) + (d.get("units_available") or 0) * (d.get("price_from") or 0)
        if zmoney:
            top_zona = max(zmoney.items(), key=lambda x: x[1])[0]
        if top_zona:
            p = await lpe.compute_pulse(db, _slug(top_zona))
            sigs = p.get("signals") or {}
            real = [(k, v) for k, v in sigs.items() if (v or {}).get("source") not in ("unavailable", None) and abs((v or {}).get("delta_pct") or 0) > 0]
            if real:
                k, v = max(real, key=lambda kv: abs(kv[1].get("delta_pct") or 0))
                dpct = round(v.get("delta_pct") or 0)
                up = dpct > 0
                nombre = {"search_velocity": "las búsquedas", "view_volume": "las visitas", "trend_velocity": "el interés online",
                          "lead_intent_velocity": "la intención de compra", "price_movement": "los precios", "accuracy_drift": "el modelo"}.get(k, "la actividad")
                pulso = {"fuente": "real", "zona": top_zona, "score": p.get("score"), "bucket": p.get("bucket"),
                         "texto": f"En {top_zona}, {nombre} {'subió' if up else 'bajó'} {abs(dpct)}% esta semana.",
                         "accion": ("Buen momento para subir precio o empujar ese proyecto." if up else "Refuerza marketing en esa zona antes de que enfríe."),
                         "link": "/desarrollador/mercado"}
            else:
                pulso["zona"] = top_zona
    except Exception as e:
        import logging
        logging.getLogger("dmx.dev").info("portfolio pulso: %s", e)

    # ── Resumen (una frase) ──
    partes = [f"Tu portafolio vale {_mmx(valor)} con {_mmx(por_cobrar)} por cobrar."]
    if leads_x_unit >= 2:
        partes.append("La demanda está caliente.")
    elif leads_x_unit < 1 and leads_total:
        partes.append("La demanda está fría.")
    if salud_color == "mal":
        partes.append(f"{len(drag)} proyecto(s) necesitan que muevas inventario.")
    resumen = " ".join(partes)

    return {
        "resumen": resumen,
        "lecturas": lecturas,
        "salud": salud,
        "pulso": pulso,
        "kpis": {"valor": valor, "por_cobrar": por_cobrar, "absorcion": absor, "leads": leads_total, "leads_x_unit": leads_x_unit, "conversion": conv},
    }


# ─── CRM & Leads · Cockpit de Leads (Bloque 1.2) — Lista IA-first: cada lead con su ──
#     temperatura + próxima mejor acción + clic a la Ficha. Reusa heat real si existe; si no,
#     proxy de los campos del lead. Built-for-endstate (heat IA con llave), cero deuda.
def _parse_dt_dev(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


def _days_since(v):
    d = _parse_dt_dev(v)
    if not d:
        return 999
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return max(0, (_now() - d).days)


_STAGE_LABEL_DEV = {"lead_nuevo": "Nuevo", "nuevo": "Nuevo", "contactado": "Contactado",
                    "negociacion": "En negociación", "calificado": "Calificado",
                    "cita_agendada": "Cita agendada", "vendido": "Ganado", "perdido": "Perdido"}


def _lead_temp_score(lead):
    """(temperatura, score 0-100). Usa heat real si está; si no, proxy de recencia+etapa+toques."""
    if lead.get("heat_tag"):
        return lead["heat_tag"], lead.get("heat_score") or 0
    st = (lead.get("status_v2") or lead.get("status") or "").lower()
    if st in ("vendido", "won", "ganado"):
        return "ganado", 100
    if st in ("perdido", "lost"):
        return "perdido", 0
    inter = lead.get("interactions") or 0
    dlast = _days_since(lead.get("last_activity_at"))
    score = 0
    score += {"negociacion": 50, "calificado": 40, "contactado": 30, "lead_nuevo": 18, "nuevo": 18}.get(st, 15)
    score += min(inter * 4, 20)
    score += 25 if dlast <= 3 else (12 if dlast <= 10 else 0)
    score = min(score, 99)
    temp = "caliente" if score >= 55 else "tibio" if score >= 30 else "frio"
    return temp, score


def _next_action_dev(lead):
    st = (lead.get("status_v2") or lead.get("status") or "").lower()
    dcreated = _days_since(lead.get("created_at"))
    dlast = _days_since(lead.get("last_activity_at"))
    if st in ("vendido", "won", "ganado"):
        return "Ganado — activa post-venta (reseña + referidos)."
    if st in ("perdido", "lost"):
        return "Perdido — reactívalo en ~30 días con novedades del proyecto."
    if st in ("lead_nuevo", "nuevo"):
        return "Contáctalo ya — lleva " + (f"{dcreated} días sin tocar." if dcreated else "recién entró, contesta en <2h.")
    if st == "negociacion":
        return "Empuja el cierre — agenda cita u oferta formal."
    if st in ("contactado", "calificado") and dlast > 5:
        return f"Dar seguimiento — lleva {dlast} días sin avanzar."
    return "Dar seguimiento y agendar siguiente paso."


@router.get("/leads-cockpit")
async def leads_cockpit(request: Request):
    from data_developments import DEVELOPMENTS_BY_ID
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    rows = []
    heat_real = False
    buyer_real = False
    try:
        lead_docs = [l async for l in db.leads.find({"development_id": {"$in": dev_ids}}, {"_id": 0})]
        # Rompe el silo (doctrina "4 portales no en silos"): anexa el buyer_score REAL
        # — el MISMO motor que usa el portal Asesor — en UNA query batch. Fail-open.
        try:
            from services.buyer_identity import attach_buyer_scores
            await attach_buyer_scores(db, lead_docs)
        except Exception:
            pass
        _TIER_TEMP = {"hot": "caliente", "warm": "tibio", "cold": "frio"}
        for l in lead_docs:
            if l.get("heat_tag"):
                heat_real = True
            temp, score = _lead_temp_score(l)
            # Si el comprador detrás del lead tiene buyer_score real, prevalece sobre la heurística.
            bs = l.get("buyer_score")
            _row_real = isinstance(bs, dict) and bs.get("value") is not None
            if _row_real:
                buyer_real = True
                score = int(bs.get("value") or 0)
                temp = _TIER_TEMP.get((bs.get("tier") or "").lower(), temp)
            dv = DEVELOPMENTS_BY_ID.get(l.get("development_id"))
            st = (l.get("status_v2") or l.get("status") or "").lower()
            rows.append({
                "id": l.get("id"), "nombre": l.get("name") or l.get("nombre") or "—",
                "proyecto": (dv.get("name") if dv else l.get("development_id")) or "—",
                "etapa": _STAGE_LABEL_DEV.get(st, st or "—"), "etapa_key": st,
                "fuente": l.get("source") or l.get("channel") or "—",
                "canal": l.get("channel") or "inhouse",
                "asesor": l.get("assignee_name") or ("Directo" if not l.get("assignee_id") else l.get("assignee_id")),
                "temperatura": temp, "score": score, "score_real": _row_real,
                "siguiente_accion": _next_action_dev(l),
                "dias_sin_actividad": _days_since(l.get("last_activity_at")),
                "presupuesto": l.get("budget_mxn"),
            })
    except Exception as e:
        import logging
        logging.getLogger("dmx.dev").warning("leads_cockpit: %s", e)
    order = {"caliente": 0, "tibio": 1, "frio": 2, "ganado": 3, "perdido": 4}
    rows.sort(key=lambda r: (order.get(r["temperatura"], 5), -r["score"]))
    abiertos = [r for r in rows if r["temperatura"] in ("caliente", "tibio", "frio")]
    resumen = {
        "total": len(rows), "abiertos": len(abiertos),
        "calientes": sum(1 for r in rows if r["temperatura"] == "caliente"),
        "tibios": sum(1 for r in rows if r["temperatura"] == "tibio"),
        "frios": sum(1 for r in rows if r["temperatura"] == "frio"),
        "sin_contactar": sum(1 for r in rows if r["etapa_key"] in ("lead_nuevo", "nuevo")),
        "fuente_heat": "buyer_score" if buyer_real else ("ia" if heat_real else "estimado"),
    }
    _nota = ("Score real del comprador (buyer_score, mismo motor que el portal Asesor) cuando el lead "
             "tiene perfil; en su defecto, estimado de la actividad."
             if buyer_real else
             "La temperatura es estimada de la actividad del lead; usa el buyer_score real cuando el comprador tiene perfil.")
    return {"leads": rows, "resumen": resumen, "nota": _nota}


# ─── Inteligencia · Qué Frena Tus Ventas (Bloque 1.3) — baja el lente "Comportamiento" ──
#     del Dev-Master, scope-ado a los leads de ESTE desarrollador. Reusa el MISMO motor
#     (_comportamiento) → objeciones + velocidad-respuesta-vs-cierre + embudo + DISC. Cero deuda.
@router.get("/comportamiento")
async def dev_comportamiento(request: Request):
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    from routes.superadmin_devmaster import _comportamiento
    return await _comportamiento(db, dev_ids=dev_ids)


# ─── Pricing · Precio Inteligente (Bloque 1.4) — capa ESTRATÉGICA por proyecto: dónde ──
#     tienes espacio para subir precio y dónde estás caro para tu demanda. Reusa el MISMO
#     motor de Stock/Sold-Out del Dev-Master, scope-ado al dev. Cierra el ciclo con las
#     sugerencias por unidad. Cero deuda.
@router.get("/pricing-inteligente")
async def dev_pricing_inteligente(request: Request):
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    from routes.superadmin_devmaster import _stock_soldout
    ss = await _stock_soldout(db, dev_ids=dev_ids)
    proyectos = []
    for p in (ss.get("proyectos") or []):
        color = p["espacio_precio_color"]
        meses = p["meses_para_agotar"]
        # Recomendación de pricing clara y accionable (usa ritmo de venta + posición vs zona)
        if color == "verde":
            reco, reco_color, mover = "Sube el precio — se agota rápido y la demanda aguanta.", "verde", "subir"
        elif color == "rojo":
            reco, reco_color, mover = "Estás caro para tu demanda — baja o justifica con valor.", "rojo", "bajar"
        elif meses is not None and meses > 30:
            reco, reco_color, mover = "Ritmo lento — un precio más agresivo o una promoción puede mover el inventario.", "ambar", "promo"
        else:
            reco, reco_color, mover = "Precio en línea con tu ritmo — sostén.", "neutro", "sostener"
        proyectos.append({
            "project_id": p["project_id"], "nombre": p["nombre"], "zona": p["zona"],
            "precio": p["precio"], "vs_mediana_zona": p["vs_mediana_zona"],
            "recomendacion": reco, "color": reco_color, "mover": mover,
            "meses_para_agotar": meses, "estado": p["estado"],
            "apreciacion_pct": p.get("apreciacion_pct"), "disponibles": p["disponibles"],
        })
    order = {"verde": 0, "rojo": 1, "ambar": 2, "neutro": 3}
    proyectos.sort(key=lambda x: order.get(x["color"], 4))
    suben = [p for p in proyectos if p["color"] == "verde"]
    caros = [p for p in proyectos if p["color"] == "rojo"]
    lentos = [p for p in proyectos if p["color"] == "ambar"]
    partes = []
    if suben:
        partes.append(f"{len(suben)} proyecto(s) con espacio para subir precio (se agotan rápido).")
    if caros:
        partes.append(f"{len(caros)} caros para su demanda — considera ajustar.")
    if lentos:
        partes.append(f"{len(lentos)} con ritmo lento — un precio más agresivo o promoción los movería.")
    resumen = " ".join(partes) or "Tus precios están en línea con tu ritmo de venta."
    return {
        "resumen": resumen,
        "proyectos": proyectos,
        "elasticidad": ss.get("elasticidad"),
        "nota": "Basado en tu ritmo de venta y la mediana de precio de cada zona. Aplica los cambios unidad por unidad en Sugerencias.",
    }


# ─── Red Comercial · Salud de tu Red (Bloque 1.5) — capa IA-first sobre el directorio: ──
#     quién vende, quién no cierra, concentración (¿dependes de uno?), in-house vs broker, con
#     acciones (diversifica / reasigna). Mismo patrón que "Red de Asesores" del Dev-Master, sobre
#     los leads del dev. Cierra el ciclo con el directorio + reasignación. Cero deuda.
@router.get("/red-salud")
async def dev_red_salud(request: Request):
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    WON = ("vendido", "won", "ganado", "cerrado", "cerrado_ganado")
    amap = {}
    canal = {"inhouse": 0, "broker": 0}
    try:
        async for l in db.leads.find({"development_id": {"$in": dev_ids}},
                                     {"_id": 0, "assignee_name": 1, "channel": 1, "status_v2": 1, "status": 1, "development_id": 1}):
            ch = "broker" if (l.get("channel") == "broker") else "inhouse"
            canal[ch] += 1
            name = l.get("assignee_name")
            if not name:
                continue
            a = amap.setdefault(name, {"asesor": name, "canal": ch, "leads": 0, "won": 0, "proyectos": set()})
            a["leads"] += 1
            if (l.get("status_v2") or l.get("status") or "").lower() in WON:
                a["won"] += 1
            if l.get("development_id"):
                a["proyectos"].add(l["development_id"])
    except Exception as e:
        import logging
        logging.getLogger("dmx.dev").warning("red_salud: %s", e)

    red = sorted([
        {"asesor": a["asesor"], "canal": a["canal"], "leads": a["leads"], "won": a["won"],
         "conversion": round(a["won"] / a["leads"] * 100) if a["leads"] else 0, "n_proyectos": len(a["proyectos"])}
        for a in amap.values()], key=lambda x: -x["leads"])
    total_asig = sum(a["leads"] for a in red) or 1
    top = red[0] if red else None
    concentracion = round(top["leads"] / total_asig * 100) if top else 0
    # quién no cierra (≥4 leads, 0% conversión)
    sin_cierre = [a for a in red if a["leads"] >= 4 and a["conversion"] == 0]
    estrella = max(red, key=lambda x: (x["conversion"], x["leads"]), default=None) if red else None

    partes = []
    if top:
        partes.append(f"{top['asesor']} maneja {concentracion}% de tus leads.")
    if estrella and estrella["conversion"] > 0:
        partes.append(f"Tu mejor cierre es {estrella['asesor']} ({estrella['conversion']}%).")
    if sin_cierre:
        partes.append(f"{len(sin_cierre)} con leads pero 0% de cierre.")
    resumen = " ".join(partes) or "Aún no hay actividad suficiente para leer tu red."

    acciones = []
    if concentracion >= 35 and top:
        acciones.append({"tipo": "concentracion", "texto": f"Dependes mucho de {top['asesor']} ({concentracion}% de los leads). Si se va, te duele — reparte y suma más canales."})
    if sin_cierre:
        s0 = sin_cierre[0]
        acciones.append({"tipo": "reasignar", "texto": f"{s0['asesor']} tiene {s0['leads']} leads y 0 cierres — dale coaching o reasigna esos leads."})
    if canal["broker"] == 0 and canal["inhouse"] > 0:
        acciones.append({"tipo": "canal", "texto": "Todo tu pipeline es in-house. Sumar brokers/inmobiliarias aliadas amplía tu alcance."})

    return {
        "resumen": resumen,
        "red": red[:12],
        "concentracion_top": concentracion,
        "canal_split": canal,
        "estrella": estrella,
        "acciones": acciones[:3],
        "nota": "Sobre los leads de tus proyectos (in-house + brokers).",
    }


# ─── Marketing · Qué Promocionar Hoy (Bloque 1.6) — conecta la salud del portafolio ──
#     (estancados · baja demanda · interés caliente) con la acción de crear contenido (Studio).
#     Reusa el motor de Stock/Sold-Out + leads, scope-ado al dev. Cierra el ciclo señal→contenido. Cero deuda.
@router.get("/marketing-jugadas")
async def dev_marketing_jugadas(request: Request):
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    from routes.superadmin_devmaster import _stock_soldout
    ss = await _stock_soldout(db, dev_ids=dev_ids)

    leads_by_dev = {}
    try:
        async for l in db.leads.find({"development_id": {"$in": dev_ids}}, {"_id": 0, "development_id": 1}):
            k = l.get("development_id")
            if k:
                leads_by_dev[k] = leads_by_dev.get(k, 0) + 1
    except Exception:
        pass

    jugadas = []
    for p in (ss.get("proyectos") or []):
        pid = p["project_id"]
        avail = p["disponibles"] or 0
        leads = leads_by_dev.get(pid, 0)
        lxu = leads / (avail + 1)
        meses = p["meses_para_agotar"]
        slow = (p["estado"] == "Se está estancando") or (meses is not None and meses > 30)
        if slow and lxu < 1:
            if leads >= 10:
                motivo = f"Tienes demanda ({leads} leads) pero mucho inventario por mover ({avail} libres). Una landing + campaña acelera el cierre."
            else:
                motivo = f"Lleva mucho inventario ({avail} libres) y poca demanda. Una landing + campaña le mete leads."
            prio, tipo = 0, "landing"
            accion, contenido = "Crea una landing de captación", "Landing"
        elif lxu < 0.8 and avail >= 5:
            prio, tipo, motivo = 1, "carrusel", f"Demanda tibia ({leads} leads para {avail} unidades). Carruseles en redes amplían el alcance."
            accion, contenido = "Genera carruseles para redes", "Carruseles"
        elif lxu >= 2:
            prio, tipo, motivo = 2, "video", f"Hay interés caliente ({leads} leads). Un video/tour aprovecha el momento y acelera el cierre."
            accion, contenido = "Crea un video o tour", "Video"
        else:
            prio, tipo, motivo = 3, "auto", "Va a buen ritmo. Mantén presencia con contenido automático."
            accion, contenido = "Programa contenido automático", "Auto-Content"
        jugadas.append({
            "project_id": pid, "nombre": p["nombre"], "zona": p["zona"],
            "disponibles": avail, "leads": leads, "_prio": prio,
            "motivo": motivo, "accion": accion, "contenido": contenido,
            "link_studio": {"landing": "/portal/studio/landings", "carrusel": "/portal/studio/carruseles",
                            "video": "/portal/studio/video", "auto": "/portal/studio/auto-content"}.get(tipo, "/portal/studio/brand-kit"),
            "link_proyecto": f"/desarrollador/proyectos/{pid}",
        })
    jugadas.sort(key=lambda x: x["_prio"])
    for j in jugadas:
        j.pop("_prio", None)

    urgentes = [j for j in jugadas if "landing" in (j["link_studio"] or "")]
    resumen = (f"{len(urgentes)} proyecto(s) necesitan empuje de marketing ya." if urgentes
               else "Tu portafolio va con buena tracción — mantén presencia.")
    return {"resumen": resumen, "jugadas": jugadas[:6],
            "nota": "Conecta tu ritmo de venta y demanda con el contenido que conviene crear. Lo armas en el Studio en un clic."}


# ─── Reportes · Resumen Ejecutivo del Mes (Bloque 1.7) — junta TODO en un reporte ───
#     compartible: dinero + ventas/sold-out + demanda + red + las 3 prioridades. Síntesis
#     cross-feature que amarra los upgrades (reusa los motores scope-ados). Cierra Paso C. Cero deuda.
_MESES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


@router.get("/reporte-ejecutivo")
async def dev_reporte_ejecutivo(request: Request):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    now = _now()
    periodo = f"{_MESES_ES[now.month]} {now.year}"

    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids]
    my_units = await _effective_units(get_db(request), dev_ids)   # con ediciones del dev (no seed crudo)
    total = len(my_units)
    sold = sum(1 for u in my_units if is_sold(u.get("status")))
    avail = sum(1 for u in my_units if u["status"] == "disponible")
    absor = round(100 * sold / total) if total else 0
    valor = sum(u.get("price", 0) for u in my_units)
    por_cobrar = sum(u.get("price", 0) for u in my_units if u["status"] == "disponible")
    cobrado = sum(u.get("price", 0) for u in my_units if is_sold(u.get("status")))

    # Reusa los motores (scope-ados al dev)
    from routes.superadmin_devmaster import _stock_soldout, _comportamiento
    ss = await _stock_soldout(db, dev_ids=dev_ids)
    comp = await _comportamiento(db, dev_ids=dev_ids)
    estancados = ss.get("estancados") or []
    rapidos = [p for p in (ss.get("proyectos") or []) if p["color"] == "verde"]
    top_obj = (comp.get("objeciones") or [{}])[0]
    rvc = comp.get("maduracion", {}).get("respuesta_vs_cierre") or []
    leads_total = comp.get("fuente", {}).get("leads", 0)

    secciones = [
        {"titulo": "Dinero", "kpis": [
            {"label": "Valor del portafolio", "valor": _mmx(valor)},
            {"label": "Cobrado", "valor": _mmx(cobrado)},
            {"label": "Por cobrar", "valor": _mmx(por_cobrar)},
        ], "lectura": f"Has cobrado {_mmx(cobrado)} y te quedan {_mmx(por_cobrar)} por mover en {avail} unidades."},
        {"titulo": "Ventas y Sold-Out", "kpis": [
            {"label": "Absorción", "valor": f"{absor}%"},
            {"label": "Se venden bien", "valor": str(len(rapidos))},
            {"label": "Estancados", "valor": str(len(estancados))},
        ], "lectura": (f"{len(rapidos)} proyecto(s) se agotan rápido; {len(estancados)} se están estancando." if (rapidos or estancados) else "Tu inventario va a ritmo parejo.")},
        {"titulo": "Demanda y Conversión", "kpis": [
            {"label": "Leads", "valor": str(leads_total)},
            {"label": "Cierre si <2h", "valor": (f"{rvc[0]['win_rate']}%" if rvc else "—")},
            {"label": "Objeción #1", "valor": (top_obj.get("label") or "—")},
        ], "lectura": (f"Lo que más frena: {top_obj.get('label','—').lower()}. " + (f"Contestar en <2h cierra {rvc[0]['win_rate']}% vs {rvc[-1]['win_rate']}% si tardas." if rvc else "")) if top_obj else "Aún sin señal de demanda."},
    ]

    # Red comercial (concentración + estrella) — cálculo lean
    amap = {}
    try:
        async for l in db.leads.find({"development_id": {"$in": dev_ids}}, {"_id": 0, "assignee_name": 1, "status_v2": 1, "status": 1}):
            name = l.get("assignee_name")
            if not name:
                continue
            a = amap.setdefault(name, {"leads": 0, "won": 0})
            a["leads"] += 1
            if (l.get("status_v2") or l.get("status") or "").lower() in ("vendido", "won", "ganado", "cerrado", "cerrado_ganado"):
                a["won"] += 1
    except Exception:
        pass
    if amap:
        tot = sum(a["leads"] for a in amap.values()) or 1
        top_name = max(amap.items(), key=lambda kv: kv[1]["leads"])
        concentr = round(top_name[1]["leads"] / tot * 100)
        estrella = max(amap.items(), key=lambda kv: (kv[1]["won"] / kv[1]["leads"] if kv[1]["leads"] else 0, kv[1]["leads"]))
        secciones.append({"titulo": "Red Comercial", "kpis": [
            {"label": "Asesores activos", "valor": str(len(amap))},
            {"label": "Concentración top", "valor": f"{concentr}%"},
            {"label": "Mejor cierre", "valor": estrella[0]},
        ], "lectura": f"{top_name[0]} maneja {concentr}% de tus leads; tu mejor cierre es {estrella[0]}."})

    # Las 3 prioridades del mes (lo de mayor palanca, de cada lente)
    prioridades = []
    if estancados:
        e0 = estancados[0]
        prioridades.append({"texto": f"Mueve el inventario estancado: {e0['nombre']} tiene {e0['disponibles']} unidades sin colocar.", "link": f"/desarrollador/proyectos/{e0['project_id']}"})
    if rvc and rvc[0].get("win_rate", 0) > (rvc[-1].get("win_rate", 0) if rvc else 0):
        prioridades.append({"texto": f"Pon a tu equipo a contestar en <2h — ahí cierras {rvc[0]['win_rate']}% vs {rvc[-1]['win_rate']}%.", "link": "/desarrollador/crm"})
    if top_obj and top_obj.get("rebuttal"):
        prioridades.append({"texto": f"Frente a '{top_obj.get('label','').lower()}': {top_obj['rebuttal']}", "link": "/desarrollador/mercado"})
    if not prioridades:
        prioridades.append({"texto": "Mantén el ritmo: tu portafolio va sano. Sostén marketing y seguimiento.", "link": "/desarrollador"})

    headline = (f"En {periodo}, tu portafolio vale {_mmx(valor)} con {absor}% colocado y {leads_total} leads. "
                + (prioridades[0]["texto"] if prioridades else ""))

    return {
        "titulo": f"Resumen Ejecutivo · {periodo.capitalize()}",
        "periodo": periodo, "headline": headline,
        "secciones": secciones, "prioridades": prioridades[:3],
        "nota": "Compilado de tu dinero, ventas, demanda y red. Listo para compartir con socios o inversionistas.",
    }


# ─── Inteligencia · Ciclo y Renta de tus Zonas (Bloque 2.2 · B05+D05+D07) ───────────
#     En qué fase del ciclo está cada zona donde tienes proyectos + qué tan rápido gentrifica
#     + ROI de renta corta (Airbnb) vs larga. Motor reusable (dev/comprador). Cierra el ciclo
#     con pricing/timing. Renta estimada se afina con AirROI. Cero deuda.
@router.get("/ciclo-renta")
async def dev_ciclo_renta(request: Request):
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    db = get_db(request)
    import zone_cycle_engine as zce

    # zonas donde el dev tiene proyectos
    mis_zonas = []
    for d in DEVELOPMENTS:
        if d["id"] in dev_ids and d.get("colonia") and d["colonia"] not in mis_zonas:
            mis_zonas.append(d["colonia"])
    col_by_name = {c["name"]: c for c in COLONIAS}
    # Banda de gentrificación por percentil real de su ciudad (lazy · idempotente).
    zce.ensure_cycle_distributions(COLONIAS)

    zonas = []
    acciones = []
    for zn in mis_zonas:
        c = col_by_name.get(zn)
        if not c:
            continue
        z = zce.compute_zone_cycle(c)
        z["recomendacion"] = zce.zone_recommendation(z)
        zonas.append(z)
        acciones.append({"texto": z["recomendacion"]})

    # orden: expansión primero (donde mover), luego recuperación
    order = {"expansion": 0, "recuperacion": 1, "maduro": 2, "contraccion": 3}
    zonas.sort(key=lambda x: order.get(x["ciclo"]["fase_key"], 4))

    expansion = [z for z in zonas if z["ciclo"]["fase_key"] == "expansion"]
    resumen = (f"{len(expansion)} de tus zonas están en expansión — buen momento para subir precio o vender con plusvalía."
               if expansion else "Tus zonas van a ritmo estable.")
    return {
        "resumen": resumen, "zonas": zonas, "acciones": acciones[:3],
        "senal_leyenda": zce.signal_leyenda(zonas[0]["city"]) if zonas else None,
        "nota": "El ciclo y la gentrificación se muestran como señal comparada con el resto de la ciudad (no un número exacto). El ROI de renta es estimado; se afina con el conector de rentas (AirROI/AirDNA).",
    }


@router.get("/indices")
async def dev_indices(request: Request):
    """Los 5 Índices DMX (IPV/IAB/IDS/IRE/ICO) + maestro IDM, por zona del dev.

    Reusa dmx_indices_engine. La absorción (IAB) entra REAL desde las unidades del
    dev en cada zona; el resto se compone sobre el dato de la colonia. Cierra ciclo:
    cada zona trae una jugada accionable. Mismo motor que alimenta el comprador y el
    producto licenciable del superadmin (I04).
    """
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    import dmx_indices_engine as ix

    # Absorción real del dev por zona (vendido / total de SUS unidades en la colonia)
    abs_por_zona: dict = {}
    mis_zonas: List[str] = []
    for d in DEVELOPMENTS:
        if d["id"] not in dev_ids or not d.get("colonia"):
            continue
        zn = d["colonia"]
        if zn not in mis_zonas:
            mis_zonas.append(zn)
        agg = abs_por_zona.setdefault(zn, {"sold": 0, "total": 0})
        units = d.get("units") or []
        if units:
            agg["sold"] += sum(1 for u in units if is_sold(u.get("status")))
            agg["total"] += len(units)
        else:
            agg["sold"] += int(d.get("units_sold") or 0)
            agg["total"] += int(d.get("units_total") or 0)

    # Banda por percentil real: la distribución se construye sobre TODA la ciudad (no
    # solo las zonas del dev), para que "Alta" signifique alta frente a la ciudad.
    city_abs: dict = {}
    for d in DEVELOPMENTS:
        zn = d.get("colonia")
        if not zn:
            continue
        agg = city_abs.setdefault(zn, {"sold": 0, "total": 0})
        units = d.get("units") or []
        if units:
            agg["sold"] += sum(1 for u in units if is_sold(u.get("status")))
            agg["total"] += len(units)
        else:
            agg["sold"] += int(d.get("units_sold") or 0)
            agg["total"] += int(d.get("units_total") or 0)

    def _city_ctx(c):
        a = city_abs.get(c.get("name")) or {}
        return {"absorcion_pct": round(a["sold"] / a["total"] * 100, 1)} if a.get("total") else {}

    ix.ensure_index_distributions(COLONIAS, ctx_fn=_city_ctx)

    col_by_name = {c["name"]: c for c in COLONIAS}
    zonas = []
    for zn in mis_zonas:
        c = col_by_name.get(zn)
        if not c:
            continue
        a = abs_por_zona.get(zn) or {}
        ctx = {}
        if a.get("total"):
            ctx["absorcion_pct"] = round(a["sold"] / a["total"] * 100, 1)
        r = ix.compute_indices(c, ctx)
        r["jugada"] = ix.indices_play(r)
        zonas.append(r)

    zonas.sort(key=lambda x: -x["idm"]["valor"])
    mejor = zonas[0] if zonas else None
    resumen = (f"{mejor['zona']} es tu zona más fuerte: su Índice DMX está {mejor['idm']['etiqueta']} "
               "frente al resto de la ciudad. Cada índice te dice dónde apretar: "
               "plusvalía, absorción, demanda, renta y calidad."
               if mejor else "Aún no hay zonas con proyectos para calcular índices.")
    return {
        "resumen": resumen, "zonas": zonas,
        "leyenda": [{"key": k, **v} for k, v in ix.INDICES_META.items()],
        "senal_leyenda": ix.signal_leyenda(),
        "nota": "Cada señal compara la zona contra el resto de la ciudad (no es un número exacto). "
                "La absorción usa tus ventas reales; la renta y la demanda son estimadas y se afinan "
                "al conectar las fuentes (cero deuda). El DRPI de precios va aparte.",
    }


# ─── D1: Inventory ────────────────────────────────────────────────────────────
@router.get("/inventario")
async def list_inventory(request: Request, dev_id: Optional[str] = None):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)
    devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids and (not dev_id or d["id"] == dev_id)]

    # Merge any runtime overrides (status changes made in this portal)
    db = get_db(request)
    overrides = {}
    async for ov in db.developer_unit_overrides.find({"dev_id": {"$in": [d["id"] for d in devs]}}, {"_id": 0}):
        overrides[ov["unit_id"]] = ov

    result = []
    for d in devs:
        units = []
        for u in d.get("units", []):
            ov = overrides.get(u["id"])
            merged = {**u}
            if ov:
                # status (legacy) + campos granulares editables desde el portal
                for fld in ("status", "bodega", "parking_type", "parking_spots", "vista",
                            "m2_privative", "m2_balcony", "m2_terrace", "m2_roof_garden",
                            "m2_total", "bedrooms", "bathrooms", "price", "prototype", "level"):
                    if ov.get(fld) is not None:
                        merged[fld] = ov[fld]
            merged["overridden"] = bool(ov)
            units.append(merged)
        result.append({
            "id": d["id"], "name": d["name"], "colonia": d["colonia"], "stage": d["stage"],
            "delivery_estimate": d["delivery_estimate"], "construction_progress": d.get("construction_progress", 0),
            "price_from": d["price_from"], "price_to": d.get("price_to"),
            "amenities": d.get("amenities", []),
            "units_total": len(units),
            "units_by_status": {
                "disponible": sum(1 for u in units if u["status"] == "disponible"),
                "apartado":   sum(1 for u in units if u["status"] == "apartado"),
                "reservado":  sum(1 for u in units if u["status"] == "reservado"),
                "vendido":    sum(1 for u in units if is_sold(u.get("status"))),  # P1.7 · incluye sinónimos/femenino
                "bloqueado":  sum(1 for u in units if u["status"] == "bloqueado"),
            },
            "units": units,
        })
    return result


class UnitStatusPatch(BaseModel):
    dev_id: str
    unit_id: str
    status: str  # disponible|apartado|reservado|vendido|bloqueado
    reason: Optional[str] = None


async def _assert_unit_in_dev(db, dev_id: str, unit_id: str):
    """403 si la unidad NO pertenece a ese desarrollo. Cierra el IDOR de escritura cross-tenant:
    `guard_project` valida que el dev_id es del usuario, PERO el unit_id podía ser de OTRO dev
    (el override filtraba solo por unit_id) → A sobrescribía el inventario de B. Esto lo impide."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(dev_id) or {}
    for u in dev.get("units", []):
        if u.get("id") == unit_id or u.get("unit_number") == unit_id:
            return
    # Dev real (no seed) o unidad en db.units → confirmar pertenencia por dev/project.
    doc = await db.units.find_one(
        {"$and": [{"$or": [{"id": unit_id}, {"unit_number": unit_id}]},
                  {"$or": [{"dev_id": dev_id}, {"development_id": dev_id}, {"project_id": dev_id}]}]},
        {"_id": 0, "id": 1})
    if doc:
        return
    # Si ya existe un override de ESTA unidad atado a OTRO dev → bloquear (anti-secuestro de dev_id).
    ov = await db.developer_unit_overrides.find_one({"unit_id": unit_id}, {"_id": 0, "dev_id": 1})
    if ov and ov.get("dev_id") and ov.get("dev_id") != dev_id:
        raise HTTPException(403, "Esta unidad pertenece a otra desarrolladora")
    if ov and ov.get("dev_id") == dev_id:
        return
    raise HTTPException(404, "Unidad no encontrada en este desarrollo")


@router.patch("/inventario/unit-status")
async def patch_unit_status(payload: UnitStatusPatch, request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    # Candado de pertenencia (cierra el IDOR: no editas unidades de otra desarrolladora) + bitácora.
    from dev_guard import guard_project
    await guard_project(db, user, payload.dev_id, "inventario/unit-status")
    await _assert_unit_in_dev(db, payload.dev_id, payload.unit_id)   # la unidad debe ser de ESTE dev
    if payload.status not in ("disponible", "apartado", "reservado", "vendido", "bloqueado"):
        raise HTTPException(400, "status inválido")
    # Capture old status for history before upsert
    prev = await db.developer_unit_overrides.find_one({"unit_id": payload.unit_id}, {"_id": 0, "status": 1})
    old_status = (prev or {}).get("status")
    if old_status is None:
        # Fallback to seed status
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(payload.dev_id) or {}
        for u in dev.get("units", []):
            if u.get("id") == payload.unit_id:
                old_status = u.get("status")
                break
    _set_doc = {
        "unit_id": payload.unit_id, "dev_id": payload.dev_id,
        "status": payload.status, "reason": payload.reason or "",
        "updated_by": user.user_id, "updated_at": _now(),
    }
    if prev:
        # CAS: solo si el estado no cambió desde que lo leímos (evita doble-venta/sobre-escritura en carrera).
        _r = await db.developer_unit_overrides.update_one(
            {"unit_id": payload.unit_id, "status": prev.get("status")}, {"$set": _set_doc})
        if _r.modified_count != 1:
            raise HTTPException(409, "La unidad ya cambió de estado · recarga e intenta de nuevo")
    else:
        # Primer override (desde el seed). CAS atómico: el filtro exige que NO exista aún un doc
        # en el estado destino; con el índice único en unit_id, dos inserts concurrentes → uno gana
        # y el otro lanza DuplicateKeyError → 409 (evita doble-venta en la PRIMERA venta).
        from pymongo.errors import DuplicateKeyError
        try:
            _r = await db.developer_unit_overrides.update_one(
                {"unit_id": payload.unit_id, "status": {"$ne": payload.status}},
                {"$set": _set_doc}, upsert=True)
            if _r.matched_count == 0 and _r.upserted_id is None:
                raise HTTPException(409, "La unidad ya está en ese estado · recarga e intenta de nuevo")
        except DuplicateKeyError:
            raise HTTPException(409, "La unidad ya cambió de estado · recarga e intenta de nuevo")
    # Audit log
    await db.developer_audit.insert_one({
        "id": _uid("audit"), "dev_id": payload.dev_id, "unit_id": payload.unit_id,
        "user_id": user.user_id, "action": "unit_status_change",
        "payload": payload.model_dump(), "ts": _now(),
    })
    # CROSS-PORTAL: registra TAMBIÉN en el audit_log CENTRAL → el superadmin VE el cambio de estado de unidad del dev en
    # su auditoría unificada (antes solo quedaba en developer_audit, invisible para el superadmin). Fail-open.
    try:
        from audit_log import log_mutation
        await log_mutation(db, {"user_id": user.user_id, "role": "developer", "name": getattr(user, "name", None)},
                           "update", "unit", entity_id=payload.unit_id,
                           before={"status": old_status},
                           after={"status": payload.status, "dev": payload.dev_id, "reason": payload.reason or ""})
    except Exception as _e:
        logging.getLogger("dmx.audit").warning("[audit] log_mutation perdido (unit status_change unit_id=%s): %s", payload.unit_id, _e)
    # Phase 7.9 — units_history trigger
    try:
        from units_history import record_unit_change
        await record_unit_change(
            db, unit_id=payload.unit_id, development_id=payload.dev_id,
            field_changed="status", old_value=old_status, new_value=payload.status,
            changed_by_user_id=user.user_id, source="manual_edit",
            extra={"reason": payload.reason or ""},
        )
    except Exception as e:
        logging.getLogger("dmx").warning(f"units_history record failed: {e}")  # [AUD-006] el import local hacía a 'logging' local en TODA la función → UnboundLocalError en el handler de arriba
    # F0.1 — Audit log (critical mutation + ML emit)
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(db, user, "update", "unit", payload.unit_id,
                           before={"status": old_status, "dev_id": payload.dev_id},
                           after={"status": payload.status, "dev_id": payload.dev_id, "reason": payload.reason},
                           request=request)
        await emit_ml_event(db, "mutation_logged", user.user_id, getattr(user, "tenant_id", None), user.role,
                            context={"entity_type": "unit", "action": "update"}, ai_decision={}, user_action={})
    except Exception as _ae:
        import logging as _lg
        _lg.getLogger("dmx.developer").warning(f"[unit-status] audit/ml log falló (no bloquea): {_ae}")
    return {"ok": True, "status": payload.status}


# ─── Campos granulares de la unidad (bodega · ubicación · tipo de cajón) ──────
PARKING_TYPES = {"individual", "bateria_propia", "bateria_vecino", "eleva_autos"}
VISTAS = {"interior", "exterior"}
UNIT_STATUSES = {"disponible", "apartado", "reservado", "vendido", "bloqueado"}
_INT_FIELDS = ("parking_spots", "bedrooms", "bathrooms")
_FLOAT_FIELDS = ("m2_privative", "m2_balcony", "m2_terrace", "m2_roof_garden", "m2_total")


class UnitEditableFields(BaseModel):
    """Todos los campos editables de una unidad (inline o masivo)."""
    bodega: Optional[bool] = None
    parking_type: Optional[str] = None
    parking_spots: Optional[int] = None
    vista: Optional[str] = None
    m2_privative: Optional[float] = None
    m2_balcony: Optional[float] = None
    m2_terrace: Optional[float] = None
    m2_roof_garden: Optional[float] = None
    m2_total: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    price: Optional[float] = None
    status: Optional[str] = None
    prototype: Optional[str] = None
    level: Optional[int] = None


class UnitFieldsPatch(UnitEditableFields):
    dev_id: str
    unit_id: str


class UnitFieldsBulk(UnitEditableFields):
    dev_id: str
    unit_ids: List[str]


def _build_unit_fields(p: UnitEditableFields) -> dict:
    """Valida y arma el dict de campos a setear (solo los provistos)."""
    fields = {}
    if p.parking_type is not None:
        if p.parking_type not in PARKING_TYPES:
            raise HTTPException(400, "tipo de cajón inválido")
        fields["parking_type"] = p.parking_type
    if p.vista is not None:
        if p.vista not in VISTAS:
            raise HTTPException(400, "ubicación inválida — usa 'interior' o 'exterior'")
        fields["vista"] = p.vista
    if p.status is not None:
        if p.status not in UNIT_STATUSES:
            raise HTTPException(400, "estado inválido")
        fields["status"] = p.status
    if p.bodega is not None:
        fields["bodega"] = bool(p.bodega)
    if p.price is not None:
        fields["price"] = max(0, int(round(p.price)))
    if p.prototype is not None:
        fields["prototype"] = str(p.prototype).strip()[:40]
    if p.level is not None:
        fields["level"] = int(p.level)
    for f in _INT_FIELDS:
        v = getattr(p, f, None)
        if v is not None:
            fields[f] = max(0, int(v))
    for f in _FLOAT_FIELDS:
        v = getattr(p, f, None)
        if v is not None:
            fields[f] = max(0.0, float(v))
    return fields


@router.patch("/inventario/unit-fields")
async def patch_unit_fields(payload: UnitFieldsPatch, request: Request):
    """Edita campos de una unidad y los persiste como override (se mezclan en list_inventory)."""
    user = await require_dev_admin(request)
    db = get_db(request)
    from dev_guard import guard_project
    await guard_project(db, user, payload.dev_id, "inventario/unit-fields")
    await _assert_unit_in_dev(db, payload.dev_id, payload.unit_id)   # la unidad debe ser de ESTE dev
    fields = _build_unit_fields(payload)
    if not fields:
        raise HTTPException(400, "Nada que actualizar")
    set_doc = {"unit_id": payload.unit_id, "dev_id": payload.dev_id,
               "updated_by": user.user_id, "updated_at": _now(), **fields}
    await db.developer_unit_overrides.update_one(
        {"unit_id": payload.unit_id}, {"$set": set_doc}, upsert=True,
    )
    await db.developer_audit.insert_one({
        "id": _uid("audit"), "dev_id": payload.dev_id, "unit_id": payload.unit_id,
        "user_id": user.user_id, "action": "unit_fields_change",
        "payload": fields, "ts": _now(),
    })
    # CROSS-PORTAL: el superadmin VE la edición de campos (precio/m²/…) del dev en el audit_log central. Fail-open.
    try:
        from audit_log import log_mutation
        await log_mutation(db, {"user_id": user.user_id, "role": "developer", "name": getattr(user, "name", None)},
                           "update", "unit", entity_id=payload.unit_id, after={"campos": fields, "dev": payload.dev_id})
    except Exception as _e:
        logging.getLogger("dmx.audit").warning("[audit] log_mutation perdido (unit fields_change unit_id=%s): %s", payload.unit_id, _e)
    return {"ok": True, "unit_id": payload.unit_id, **fields}


@router.patch("/inventario/unit-fields-bulk")
async def patch_unit_fields_bulk(payload: UnitFieldsBulk, request: Request):
    """Llenado masivo: aplica campos a muchas unidades de un solo click."""
    user = await require_dev_admin(request)
    db = get_db(request)
    from dev_guard import guard_project
    await guard_project(db, user, payload.dev_id, "inventario/unit-fields-bulk")
    if not payload.unit_ids:
        raise HTTPException(400, "Sin unidades seleccionadas")
    for _uid_chk in payload.unit_ids:        # cada unidad debe ser de ESTE dev (anti cross-tenant)
        await _assert_unit_in_dev(db, payload.dev_id, _uid_chk)
    fields = _build_unit_fields(payload)
    if not fields:
        raise HTTPException(400, "Nada que actualizar")

    from pymongo import UpdateOne
    ops = [
        UpdateOne(
            {"unit_id": uid},
            {"$set": {"unit_id": uid, "dev_id": payload.dev_id,
                      "updated_by": user.user_id, "updated_at": _now(), **fields}},
            upsert=True,
        )
        for uid in payload.unit_ids
    ]
    if ops:
        await db.developer_unit_overrides.bulk_write(ops, ordered=False)
    await db.developer_audit.insert_one({
        "id": _uid("audit"), "dev_id": payload.dev_id,
        "user_id": user.user_id, "action": "unit_fields_bulk",
        "payload": {"count": len(payload.unit_ids), "fields": fields}, "ts": _now(),
    })
    return {"ok": True, "count": len(payload.unit_ids), "fields": fields}


# ─── D6: Demand Heatmap ───────────────────────────────────────────────────────
@router.get("/demanda")
async def demand_heatmap(request: Request):
    """M3 · E5 — índice de demanda REAL (búsquedas de asesores + oferta + funnel real).
    Reemplazó el heatmap sintético (random.seed). Se llena solo conforme entran búsquedas."""
    user = await require_dev_admin(request)
    db = get_db(request)
    from services.demand_engine import compute_demand
    return await compute_demand(db)


# ─── D9: Monthly AI Report ────────────────────────────────────────────────────
@router.post("/reportes/generar")
async def generate_report(request: Request, month: Optional[str] = None):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    db = get_db(request)

    month_key = month or (_now() - timedelta(days=30)).strftime("%Y-%m")
    dev_ids = _user_dev_ids(user)
    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids]
    my_units = await _effective_units(get_db(request), dev_ids)   # con ediciones del dev (no seed crudo)

    from data_developments import SOLD_STATUSES
    total_units = len(my_units)
    sold = sum(1 for u in my_units if (u.get("status") or "").lower() in SOLD_STATUSES)
    absorbed = round(100 * sold / total_units, 1) if total_units else 0
    avg_price = int(sum(u["price"] for u in my_units) / total_units) if total_units else 0

    # Cache check
    cached = await db.developer_reports.find_one({"owner_id": user.user_id, "month": month_key}, {"_id": 0})
    if cached:
        return cached

    # Rate-limit: el param `month` permite forzar cache-miss; tope a ~1 reporte/min por usuario
    # para no disparar el costo de la IA. (No bloquea el cache hit de arriba.)
    recent = await db.developer_reports.find_one(
        {"owner_id": user.user_id}, {"_id": 0, "generated_at": 1}, sort=[("generated_at", -1)])
    if recent and recent.get("generated_at"):
        try:
            _last = datetime.fromisoformat(recent["generated_at"])
            if _last.tzinfo is None:
                _last = _last.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - _last).total_seconds() < 60:
                raise HTTPException(429, "Espera un momento antes de generar otro reporte.")
        except HTTPException:
            raise
        except Exception:
            pass

    summary_text = None
    try:
        from llm_client import LlmChat, UserMessage
        prompt = f"""Eres un analista senior de real estate. Escribe un resumen ejecutivo (1 párrafo, 4-6 oraciones, es-MX) del desempeño del portafolio en el mes {month_key}:
- {len(my_devs)} desarrollos activos ({', '.join(d['name'] for d in my_devs[:5])})
- Absorción: {absorbed}% ({sold} unidades vendidas de {total_units})
- Ticket promedio: ${avg_price:,} MXN
- Amenidades top: {', '.join(sum([d.get('amenities', [])[:2] for d in my_devs[:3]], []))}

Tono: analítico, basado en datos, sin marketing vacío. Cierra con el insight accionable #1 del mes."""
        chat = LlmChat(api_key=os.environ.get("ANTHROPIC_API_KEY"),
                       session_id=f"report-{user.user_id}-{month_key}",
                       system_message="Eres un analista senior de real estate LATAM.")
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        summary_text = await chat.send_message(UserMessage(text=prompt))
    except Exception:
        summary_text = (f"Durante {month_key} el portafolio cerró {sold} unidades ({absorbed}% absorción) con ticket promedio "
                        f"de ${avg_price:,} MXN. La demanda se concentró en preventa y entrega inmediata. "
                        f"Insight accionable: consolidar descuentos por pronto pago en la etapa con más días sin cierre.")

    wins = [
        "Absorción superó benchmark de mercado en +2.4pts",
        "Ticket promedio incrementó 3.1% mes a mes",
        "3 leads enterprise cerraron en la semana final del mes",
    ]
    alerts = [
        "2 unidades >90 días sin cierre — candidatas a ajuste de precio",
        "Demanda Roma Norte creció 28% — considerar reasignar inventario",
        "Competidor lanzó proyecto a 800m del tuyo a 12% menos/m²",
    ]
    recommendations = [
        "Lanzar esquema descuento 3% pronto pago para etapa entrega 2026-Q4",
        "Activar ads hiper-segmentados en Polanco + Condesa",
        "Programar visita VIP para top 10 leads calientes del mes",
    ]
    metrics = {
        "absorption_pct": absorbed,
        "avg_price": avg_price,
        "units_sold": sold,
        "units_total": total_units,
        "revenue": sum(u["price"] for u in my_units if is_sold(u.get("status"))),
    }

    report = {
        "id": _uid("rep"),
        "owner_id": user.user_id,
        "month": month_key,
        "summary": summary_text,
        "wins": wins,
        "alerts": alerts,
        "recommendations": recommendations,
        "metrics": metrics,
        "generated_at": _now().isoformat(),
    }
    await db.developer_reports.insert_one(dict(report))
    report.pop("_id", None)
    return report


@router.get("/reportes")
async def list_reports(request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    # Excluye los estudios de mercado versionados (type=estudio · F3.2) — tienen su propio historial.
    items = await db.developer_reports.find(
        {"owner_id": user.user_id, "type": {"$ne": "estudio"}}, {"_id": 0}).sort("month", -1).to_list(24)
    return items


@router.get("/bancabilidad")
async def dev_bancabilidad(request: Request):
    """F5.1 · Score de Bancabilidad de los proyectos del dev (qué tan financiables son)."""
    user = await require_dev_admin(request)
    from bancabilidad_engine import portfolio_bancabilidad
    return await portfolio_bancabilidad(get_db(request), _user_dev_ids(user))


# ─── D4: Dynamic Pricing AI ───────────────────────────────────────────────────
@router.get("/pricing/suggestions")
async def list_pricing_suggestions(request: Request):
    from data_developments import DEVELOPMENTS, ALL_UNITS
    user = await require_dev_admin(request)
    db = get_db(request)
    dev_ids = _user_dev_ids(user)

    # UPGRADE C.1→Dev: ancla las sugerencias a la VALUACIÓN REAL de la zona (4-fuentes con
    # CIERRES reales · resale_data.colonia_valuation), no a la mediana de precios de LISTA (que
    # puede venir inflada). Si la zona tiene ventas reales, comparamos contra lo que de verdad se
    # pagó. Movimiento medido (cap ±8%), razón real + confianza. Regenera una vez (anchor=valuacion).
    existing_v2 = await db.developer_pricing_suggestions.count_documents(
        {"owner_id": user.user_id, "anchor": "valuacion"})
    # P3-CSRF-02: este GET puede disparar una RECONSTRUCCIÓN cara (delete_many + recálculo de
    # valuación 4-fuentes por zona). Un GET cross-site (<img>/navegación con cookies) podría
    # quemar CPU/DB en ráfaga. Rate-limit por usuario en la ruta cara (fail-soft: si el limiter
    # no está, no bloquea; si se excede, NO regenera y sirve lo que ya hay en caché).
    _regen_ok = True
    try:
        from services.csrf_guard import gen_allowed
        _regen_ok = gen_allowed(user, "dev_pricing_regen", 3, 600)
    except Exception:
        _regen_ok = True
    if existing_v2 == 0 and _regen_ok:
        await db.developer_pricing_suggestions.delete_many(
            {"owner_id": user.user_id, "anchor": {"$ne": "valuacion"}, "status": "pending"})
        from resale_data import colonia_valuation, obra_nueva_pm2_map
        from data_seed import COLONIAS, COLONIAS_BY_ID
        colonia_name = {c["id"]: c["name"] for c in COLONIAS}
        dev_colonia = {d["id"]: d.get("colonia_id", d.get("colonia", "")) for d in DEVELOPMENTS}
        obra = obra_nueva_pm2_map()
        candidate_units = [u for u in ALL_UNITS if u.get("development_id") in dev_ids and u.get("status") == "disponible"][:60]
        # Valuación REAL una vez por zona (no por unidad)
        zonas = {dev_colonia.get(u.get("development_id")) for u in candidate_units} - {None, ""}
        zone_val = {}
        for z in zonas:
            base = (COLONIAS_BY_ID.get(z) or {}).get("price_m2_num")
            zone_val[z] = await colonia_valuation(db, z, obra_pm2=obra.get(z), base_pm2=base)
        suggestions = []
        for u in candidate_units:
            m2 = u.get("m2_privative") or u.get("m2_total")
            price = u.get("price")
            zid = dev_colonia.get(u.get("development_id"))
            val = zone_val.get(zid) or {}
            market_pm2 = val.get("pm2")
            if not m2 or not price or m2 <= 0 or not market_pm2:
                continue
            current_pm2 = price / m2
            pct = round((market_pm2 - current_pm2) / current_pm2 * 100, 1)  # >0 = debajo del valor
            if abs(pct) < 2:   # dentro del valor → mantener
                continue
            direction = "up" if pct > 0 else "down"
            move = round(max(-8.0, min(8.0, pct)), 1)
            new_price = int(price * (1 + move / 100))
            zname = colonia_name.get(zid, str(zid or "").replace("_", " ").title())
            anclado_cierres = val.get("anclado") == "cierres"
            ancla_txt = "el valor real de la zona (ventas reales)" if anclado_cierres else f"el valor de {zname}"
            if direction == "up":
                reasons = [
                    f"Tu ${current_pm2:,.0f}/m² está debajo de {ancla_txt} (${market_pm2:,.0f}/m²).",
                    f"Hay espacio para subir ~{abs(move)}% sin salir de valor.",
                ]
            else:
                reasons = [
                    f"Tu ${current_pm2:,.0f}/m² está arriba de {ancla_txt} (${market_pm2:,.0f}/m²).",
                    f"Bajar ~{abs(move)}% acelera la venta manteniéndote en valor.",
                ]
            suggestions.append({
                "id": _uid("pricesug"),
                "owner_id": user.user_id,
                "dev_id": u["development_id"],
                "unit_id": u["id"],
                "unit_number": u.get("unit_number", "—"),
                "prototype": u.get("prototype", "—"),
                "current_price": price,
                "suggested_price": new_price,
                "delta_pct": move,
                "direction": direction,
                "current_pm2": round(current_pm2),
                "market_pm2": round(market_pm2),
                "reasons": reasons,
                "anchor": "valuacion",
                "confianza": val.get("confianza"),
                "anclado_cierres": anclado_cierres,
                "source": "valor real de la zona (ventas + reventa + obra)",
                "status": "pending",  # pending|approved|rejected|applied
                "created_at": _now(),
            })
        if suggestions:
            await db.developer_pricing_suggestions.insert_many(suggestions)

    items = await db.developer_pricing_suggestions.find({"owner_id": user.user_id}, {"_id": 0}).sort([("status", 1), ("created_at", -1)]).to_list(200)
    return items


class PricingAction(BaseModel):
    status: str  # approved|rejected|applied
    note: Optional[str] = None


@router.patch("/pricing/suggestions/{sid}")
async def act_on_suggestion(sid: str, payload: PricingAction, request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    if payload.status not in ("approved", "rejected", "applied"):
        raise HTTPException(400, "status inválido")

    # GC-X4 — block apply if cross-check critical active on the dev
    if payload.status == "applied":
        sug = await db.developer_pricing_suggestions.find_one({"id": sid, "owner_id": user.user_id})
        if sug and sug.get("dev_id"):
            from cross_check_engine import has_critical
            if await has_critical(db, sug["dev_id"]):
                raise HTTPException(409, {
                    "error": "cross_check_critical_pending",
                    "message": "Bloqueado: cross-check critical pendiente, resuelve docs primero.",
                    "dev_id": sug["dev_id"],
                })

    r = await db.developer_pricing_suggestions.update_one(
        {"id": sid, "owner_id": user.user_id},
        {"$set": {"status": payload.status, "note": payload.note or "", "actioned_at": _now()}},
    )
    if not r.matched_count: raise HTTPException(404, "No encontrada")
    await db.developer_audit.insert_one({
        "id": _uid("audit"), "user_id": user.user_id, "action": f"pricing_{payload.status}",
        "ref": sid, "ts": _now(),
    })
    return {"ok": True, "status": payload.status}


# GC-X4 helper endpoint — surface dev-level cross-check warnings to /desarrollador/pricing UI
@router.get("/pricing/cross-check-warnings")
async def pricing_cross_check_warnings(request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    dev_ids = _user_dev_ids(user)
    pipe = [
        {"$match": {"development_id": {"$in": dev_ids}, "severity": "critical", "result": "fail"}},
        {"$group": {"_id": "$development_id", "rules": {"$push": "$rule_id"}, "count": {"$sum": 1}}},
    ]
    rows = [r async for r in db.di_cross_checks.aggregate(pipe)]
    from data_developments import DEVELOPMENTS_BY_ID
    return {
        "blocked_count": len(rows),
        "blocked": [
            {
                "dev_id": r["_id"],
                "dev_name": (DEVELOPMENTS_BY_ID.get(r["_id"], {}) or {}).get("name", r["_id"]),
                "rules": r["rules"],
                "count": int(r["count"]),
            }
            for r in rows
        ],
    }


# ─── D3: Competitor Radar ─────────────────────────────────────────────────────
@router.get("/competidores")
async def competitor_radar(request: Request, dev_id: Optional[str] = None, radius_km: float = 2.0):
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS
    user = await require_dev_admin(request)
    dev_ids = _user_dev_ids(user)

    my_devs = [d for d in DEVELOPMENTS if d["id"] in dev_ids and (not dev_id or d["id"] == dev_id)]
    if not my_devs:
        return {"my_project": None, "competitors": [], "alerts": []}

    from data_developments import dev_price_m2
    mine = my_devs[0] if dev_id else my_devs[0]
    my_lat, my_lon = mine["center"]
    my_m2 = (mine["m2_range"][0] + mine["m2_range"][1]) / 2
    # $/m² CANÓNICO del proyecto (mismo que ve el comprador) · cae al precio de entrada si no hay unidades.
    my_price_sqm = dev_price_m2(mine) or (mine["price_from"] / mine["m2_range"][0])

    # Find competitor developments in same/adjacent colonias (approximation of radius filter)
    competitors_raw = [d for d in DEVELOPMENTS if d["id"] != mine["id"] and d["alcaldia"] == mine["alcaldia"]][:8]

    competitors = []
    for c in competitors_raw:
        c_lat, c_lon = c["center"]
        # Rough distance in km (haversine approximation)
        dist_km = ((my_lat - c_lat) ** 2 + (my_lon - c_lon) ** 2) ** 0.5 * 111
        if dist_km > radius_km * 3: continue  # wider tolerance for mock
        c_price_sqm = dev_price_m2(c) or (c["price_from"] / c["m2_range"][0])
        delta = round(100 * (c_price_sqm - my_price_sqm) / my_price_sqm, 1)
        # Absorción REAL del competidor (inventario vendido/total · antes era random).
        from data_developments import inventory_stats
        _inv = inventory_stats(c)
        absorption = _inv["absorption_pct"]
        competitors.append({
            "id": c["id"], "name": c["name"], "developer_id": c["developer_id"],
            "colonia": c["colonia"], "stage": c["stage"],
            "price_sqm_mxn": int(c_price_sqm),
            "delta_vs_mine_pct": delta,
            "absorption_pct": absorption,
            "units_total": c["units_total"],
            "units_available": c["units_available"],
            "amenities": c.get("amenities", []),
            "delivery_estimate": c["delivery_estimate"],
            "distance_km": round(dist_km, 2),
        })
    competitors.sort(key=lambda x: x["distance_km"])

    # Alerts: competitors with -5% pricing or -10% absorption advantage
    alerts = []
    for c in competitors:
        if c["delta_vs_mine_pct"] < -5:
            alerts.append({"kind": "pricing_below", "competitor": c["name"], "delta": c["delta_vs_mine_pct"],
                           "msg": f"{c['name']} está precio/m² {-c['delta_vs_mine_pct']}% por debajo del tuyo."})
        if c["absorption_pct"] > 65:
            alerts.append({"kind": "high_absorption", "competitor": c["name"], "absorption": c["absorption_pct"],
                           "msg": f"{c['name']} tiene absorción de {c['absorption_pct']}% — revisar mix de amenidades."})

    return {
        "my_project": {
            "id": mine["id"], "name": mine["name"], "center": mine["center"],
            "price_sqm_mxn": int(my_price_sqm), "absorption_pct": round(100 * (mine["units_total"] - mine["units_available"]) / mine["units_total"], 1),
            "units_available": mine["units_available"], "units_total": mine["units_total"],
            "amenities": mine.get("amenities", []),
        },
        "competitors": competitors[:8],
        "alerts": alerts[:5],
    }


class AlertAck(BaseModel):
    competitor_id: Optional[str] = Field(None, max_length=120)


@router.post("/competidores/alert-ack")
async def ack_alert(payload: AlertAck, request: Request):
    user = await require_dev_admin(request)
    db = get_db(request)
    await db.developer_competitor_alerts.insert_one({
        "id": _uid("ackalr"), "user_id": user.user_id,
        "competitor_id": payload.competitor_id,
        "acked": True, "ts": _now(),
    })
    return {"ok": True}


# ─── Audit log ────────────────────────────────────────────────────────────────
@router.get("/audit")
async def audit_log(request: Request, limit: int = 100):
    user = await require_dev_admin(request)
    db = get_db(request)
    items = await db.developer_audit.find({"user_id": user.user_id}, {"_id": 0}).sort("ts", -1).limit(limit).to_list(limit)
    return items


# ─── Seguridad de tus datos (aislamiento entre cuentas · lenguaje de persona) ──
@router.get("/security/summary")
async def security_summary(request: Request):
    """Confirma al dev que sus datos están aislados + cuántos intentos de otras cuentas se
    bloquearon. Cierra el ciclo: el candado registra, aquí se ve."""
    user = await require_dev_admin(request)
    db = get_db(request)
    from dev_guard import dev_security_summary
    return await dev_security_summary(db, user)
