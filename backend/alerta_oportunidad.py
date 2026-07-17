"""Alerta de Oportunidad — un CAMBIO DE OFERTA le llega a QUIEN la busca (cierre de cableado).

Caso real: Avalia B-204 bajó -3.4% y volvió a 'disponible' — y nadie que la buscaba se enteró.
Este módulo cierra ese ciclo REUSANDO los perfiles de comprador que la plataforma YA guarda
(no inventa colecciones nuevas; si una fuente no existe o está vacía, se salta):

  fuente                      colección              cómo matchea
  ─ favorito directo          buyer_favoritos        ♥ a ese desarrollo (visitor/lead)
  ─ unidad vigilada           buyer_signals          type=unit_save sobre ese dev (radar de unidad)
  ─ búsqueda guardada         marketplace_searches   perfil colonias/precio_max/recamaras_min (alert=true)
  ─ alerta por email          saved_searches         filters confirmados (colonia/max_price/beds)
  ─ lead con preferencias     asesor_busquedas       perfil que capturó el asesor (owner = asesor)
  ─ radar (dev vigilado)      buyer_signals          type like/save sobre ese dev

Prioridad de canal (si el mismo comprador aparece por varias vías, gana la más directa):
  favorito_directo > busqueda_guardada > lead_preferencias > radar

REGLA DURA: NUNCA se avisa al comprador final directo. El canal es el ASESOR:
notificación (notifications_engine) al asesor asignado del lead si lo hay, y SIEMPRE
registro en db.oportunidades_detectadas {unit, cambio, comprador, canal, ts, atendida:false}
para la bandeja del asesor (GET /api/advisor/oportunidades-mercado).
"""
from __future__ import annotations

import logging
import re
import secrets
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request

log = logging.getLogger("dmx.alerta_oportunidad")

router = APIRouter(tags=["alerta_oportunidad"])

# prioridad del canal por el que llegó el match (menor = más directo, gana en dedup)
_VIA_PRIORITY = {"favorito_directo": 0, "busqueda_guardada": 1, "lead_preferencias": 2, "radar": 3}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(value: Any) -> str:
    """Slug local sin dependencias ('Juárez' → 'juarez'). Para comparar colonias tolerante a acentos."""
    s = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ─── 1) Matcher PURO cambio × perfil ─────────────────────────────────────────

def match_perfil(cambio: Dict[str, Any], perfil: Dict[str, Any]) -> bool:
    """¿Este cambio de oferta le cuadra a este perfil de comprador? PURA (sin db, sin red).

    cambio: {dev_id, colonia, precio, recamaras, m2}
    perfil: {presupuesto_max, recamaras_min, colonias[] | zonas[]}

    Reglas:
      • precio ≤ presupuesto_max × 1.05 (5% de holgura — una baja lo puede meter en rango)
      • recamaras ≥ recamaras_min
      • colonia del cambio en su lista (colonias|zonas) SI el perfil tiene lista
      • perfil sin NINGÚN criterio → False (nada que cuadrar; no se spamea a todos)
      • dato faltante en el CAMBIO: precio/recámaras desconocidos no descartan (las listas de
        precios a veces no traen recámaras); colonia desconocida SÍ descarta si el perfil
        restringe zona (mejor callar que avisar de la zona equivocada).
    """
    if not isinstance(cambio, dict) or not isinstance(perfil, dict):
        return False

    presupuesto = perfil.get("presupuesto_max")
    rec_min = perfil.get("recamaras_min")
    colonias = [c for c in list(perfil.get("colonias") or []) + list(perfil.get("zonas") or []) if c]
    if not presupuesto and not rec_min and not colonias:
        return False  # perfil vacío

    # Presupuesto (con 5% de holgura)
    precio = cambio.get("precio")
    if presupuesto and precio is not None:
        try:
            if float(precio) > float(presupuesto) * 1.05:
                return False
        except (TypeError, ValueError):
            pass  # dato ilegible → no descarta

    # Recámaras mínimas
    rec = cambio.get("recamaras")
    if rec_min and rec is not None:
        try:
            if int(rec) < int(rec_min):
                return False
        except (TypeError, ValueError):
            pass

    # Colonia en su lista (si la tiene)
    if colonias:
        col = _slug(cambio.get("colonia"))
        wanted = {_slug(c) for c in colonias}
        # alias canónicos del catálogo fail-soft ('Lomas de Chapultepec' → 'lomas-chapultepec')
        try:
            from data_developments import colonia_slug
            col_canon = colonia_slug(cambio.get("colonia"))
            wanted |= {colonia_slug(c) for c in colonias}
        except Exception:  # noqa: BLE001 — el matcher no depende del catálogo
            col_canon = col
        if not col or (col not in wanted and col_canon not in wanted):
            return False

    return True


# ─── 2) Compradores reales que buscan esto ───────────────────────────────────

async def compradores_para(db, cambio: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Junta los perfiles REALES de comprador que cuadran con el cambio, con su identidad
    (visitor_id / lead_id / contacto_id / email) y CÓMO llegó el match (via + fuente).
    Dedup por identidad: si alguien aparece por favorito Y por radar, gana el favorito.
    Fail-open por fuente: una colección ausente/vacía/con error simplemente se salta."""
    cambio = cambio or {}
    dev_id = cambio.get("dev_id")
    unit_number = str(cambio.get("unit_number") or "").strip().upper()
    found: Dict[str, Dict[str, Any]] = {}

    def _identity(m: Dict[str, Any]) -> Optional[str]:
        return m.get("visitor_id") or m.get("lead_id") or m.get("contacto_id") or m.get("email") or m.get("user_id")

    def _add(m: Dict[str, Any]) -> None:
        k = _identity(m)
        if not k:
            return
        prev = found.get(k)
        if prev is None or _VIA_PRIORITY[m["via"]] < _VIA_PRIORITY[prev["via"]]:
            found[k] = m

    # 1) FAVORITO DIRECTO — ♥ al desarrollo (buyer_favoritos)
    if dev_id:
        try:
            async for f in db.buyer_favoritos.find(
                    {"dev_id": dev_id, "status": {"$ne": "descartado"}},
                    {"_id": 0, "visitor_id": 1, "lead_id": 1}):
                _add({"visitor_id": f.get("visitor_id"), "lead_id": f.get("lead_id"),
                      "via": "favorito_directo", "fuente": "buyer_favoritos"})
        except Exception as e:  # noqa: BLE001
            log.debug(f"[alerta_oportunidad] buyer_favoritos skip: {e}")

        # 1b) UNIDAD VIGILADA (radar de unidad → favorito directo; unidad exacta se marca)
        try:
            async for s in db.buyer_signals.find(
                    {"entity_id": dev_id, "type": "unit_save", "active": True},
                    {"_id": 0, "visitor_id": 1, "lead_id": 1, "unit_number": 1}):
                m = {"visitor_id": s.get("visitor_id"), "lead_id": s.get("lead_id"),
                     "via": "favorito_directo", "fuente": "buyer_signals:unit_save"}
                if unit_number and str(s.get("unit_number") or "").strip().upper() == unit_number:
                    m["unidad_exacta"] = True
                _add(m)
        except Exception as e:  # noqa: BLE001
            log.debug(f"[alerta_oportunidad] buyer_signals unit_save skip: {e}")

    # 2) BÚSQUEDAS GUARDADAS del marketplace (mismo filtro que la casamentera)
    try:
        async for s in db.marketplace_searches.find(
                {"alert": True, "satisfecha": {"$ne": True}},
                {"_id": 0, "visitor_id": 1, "lead_id": 1, "colonias": 1,
                 "precio_max": 1, "recamaras_min": 1}):
            perfil = {"presupuesto_max": s.get("precio_max"),
                      "recamaras_min": s.get("recamaras_min"),
                      "colonias": s.get("colonias") or []}
            if match_perfil(cambio, perfil):
                _add({"visitor_id": s.get("visitor_id"), "lead_id": s.get("lead_id"),
                      "via": "busqueda_guardada", "fuente": "marketplace_searches", "perfil": perfil})
    except Exception as e:  # noqa: BLE001
        log.debug(f"[alerta_oportunidad] marketplace_searches skip: {e}")

    # 2b) ALERTAS POR EMAIL confirmadas (saved_searches.filters — vocabulario propio)
    try:
        async for s in db.saved_searches.find(
                {"confirmed": True}, {"_id": 0, "email": 1, "user_id": 1, "filters": 1}):
            f = s.get("filters") or {}
            cols = f.get("colonias") or f.get("colonia") or []
            if isinstance(cols, str):
                cols = [cols]
            perfil = {"presupuesto_max": f.get("price_max") or f.get("max_price"),
                      "recamaras_min": f.get("recamaras_min") or f.get("beds"),
                      "colonias": cols,
                      "zonas": [f["zona"]] if f.get("zona") else []}
            if match_perfil(cambio, perfil):
                _add({"email": s.get("email"), "user_id": s.get("user_id"),
                      "via": "busqueda_guardada", "fuente": "saved_searches", "perfil": perfil})
    except Exception as e:  # noqa: BLE001
        log.debug(f"[alerta_oportunidad] saved_searches skip: {e}")

    # 3) LEADS CON PREFERENCIAS — perfil de búsqueda que capturó el asesor (owner = asesor directo)
    try:
        async for bq in db.asesor_busquedas.find(
                {"stage": {"$nin": ["ganada", "perdida"]}},
                {"_id": 0, "contacto_id": 1, "owner_id": 1, "colonias": 1,
                 "precio_max": 1, "recamaras_min": 1}):
            perfil = {"presupuesto_max": bq.get("precio_max"),
                      "recamaras_min": bq.get("recamaras_min"),
                      "colonias": bq.get("colonias") or []}
            if match_perfil(cambio, perfil):
                _add({"contacto_id": bq.get("contacto_id"), "asesor_id": bq.get("owner_id"),
                      "via": "lead_preferencias", "fuente": "asesor_busquedas", "perfil": perfil})
    except Exception as e:  # noqa: BLE001
        log.debug(f"[alerta_oportunidad] asesor_busquedas skip: {e}")

    # 4) RADAR — desarrollo vigilado (like/save del marketplace)
    if dev_id:
        try:
            async for s in db.buyer_signals.find(
                    {"entity_id": dev_id, "type": {"$in": ["like", "save"]}, "active": True},
                    {"_id": 0, "visitor_id": 1, "lead_id": 1}):
                _add({"visitor_id": s.get("visitor_id"), "lead_id": s.get("lead_id"),
                      "via": "radar", "fuente": "buyer_signals"})
        except Exception as e:  # noqa: BLE001
            log.debug(f"[alerta_oportunidad] buyer_signals radar skip: {e}")

    return sorted(found.values(), key=lambda m: _VIA_PRIORITY[m["via"]])


# ─── 3) Orquestador: cambio real → matches → asesor ──────────────────────────

async def _asesor_del_lead(db, lead_id: Optional[str]) -> Optional[str]:
    """Asesor asignado del lead — producción escribe el dueño en CUALQUIERA de 4 campos
    (assigned_to / asesor_id / owner_id / assignee_id — mismo hallazgo que asesor_market)."""
    if not lead_id:
        return None
    try:
        lead = await db.leads.find_one(
            {"id": lead_id},
            {"_id": 0, "assigned_to": 1, "asesor_id": 1, "owner_id": 1, "assignee_id": 1}) or {}
        return lead.get("assigned_to") or lead.get("asesor_id") or lead.get("owner_id") or lead.get("assignee_id")
    except Exception:  # noqa: BLE001
        return None


def _pct(antes: Any, ahora: Any) -> Optional[float]:
    try:
        a, b = float(antes), float(ahora)
        if a > 0:
            return round((b - a) / a * 100, 1)
    except (TypeError, ValueError):
        pass
    return None


async def alertar_oportunidad(db, unit_id: str, tipo_cambio: str, antes: Any, ahora: Any) -> Dict[str, Any]:
    """Arma el cambio desde la UNIDAD REAL (db.units), busca a quién le interesa y lo pone
    en el canal del ASESOR: notificación si el lead tiene asesor asignado + registro SIEMPRE
    en db.oportunidades_detectadas (bandeja, atendida:false). Nunca contacta al comprador final.

    tipo_cambio: 'bajo_precio' | 'volvio_disponible' (u otro cambio de oferta).
    antes/ahora: valores del cambio (precios, o status 'reservado'→'disponible').
    """
    from ingested_reader import normalize_unit

    u = None
    try:
        u = await db.units.find_one({"id": unit_id}, {"_id": 0})
        if not u:
            u = await db.units.find_one({"unit_number": unit_id}, {"_id": 0})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[alerta_oportunidad] units lookup failed: {e}")
    if not u:
        return {"ok": False, "razon": "unidad_no_encontrada", "unit_id": unit_id,
                "compradores": 0, "notificados": 0, "registrados": 0}
    u = normalize_unit(u)
    dev_id = u.get("development_id") or u.get("project_id")

    # Desarrollo real (ingesta) con fallback al catálogo semilla
    dev: Dict[str, Any] = {}
    try:
        dev = await db.developments.find_one(
            {"id": dev_id}, {"_id": 0, "name": 1, "colonia": 1, "colonia_id": 1}) or {}
    except Exception:  # noqa: BLE001
        dev = {}
    if not dev:
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            dev = DEVELOPMENTS_BY_ID.get(dev_id) or {}
        except Exception:  # noqa: BLE001
            dev = {}

    es_precio = "precio" in str(tipo_cambio or "")
    precio_match = ahora if (es_precio and isinstance(ahora, (int, float))) else u.get("price")
    cambio = {
        "unit_id": u.get("id") or unit_id,
        "unit_number": u.get("unit_number"),
        "dev_id": dev_id,
        "dev_name": dev.get("name") or dev_id,
        "colonia": dev.get("colonia") or dev.get("colonia_id") or u.get("colonia_id"),
        "precio": precio_match,
        "recamaras": u.get("bedrooms"),
        "m2": u.get("m2_total") or u.get("m2_privative"),
        "tipo_cambio": tipo_cambio,
        "antes": antes,
        "ahora": ahora,
        "pct": _pct(antes, ahora),
    }

    compradores = await compradores_para(db, cambio)
    ts = _now_iso()
    notificados = registrados = 0

    for m in compradores:
        asesor_id = m.get("asesor_id") or await _asesor_del_lead(db, m.get("lead_id"))

        notificado = False
        if asesor_id:
            try:
                from notifications_engine import emit_notification
                if es_precio or tipo_cambio == "bajo_precio":
                    titulo = f"Bajó de precio: {cambio['dev_name']} #{cambio['unit_number']}"
                    detalle = (f"de ${int(antes):,} a ${int(ahora):,} ({cambio['pct']}%)"
                               if cambio.get("pct") is not None else "bajó de precio")
                else:
                    titulo = f"Volvió a estar disponible: {cambio['dev_name']} #{cambio['unit_number']}"
                    detalle = "estaba apartada y se liberó"
                via_txt = {"favorito_directo": "la tiene en favoritos",
                           "busqueda_guardada": "su búsqueda guardada cuadra",
                           "lead_preferencias": "su perfil de búsqueda cuadra",
                           "radar": "vigila este desarrollo"}.get(m["via"], m["via"])
                nid = await emit_notification(
                    db,
                    user_id=asesor_id,
                    type="comparable_price_drop" if (es_precio or tipo_cambio == "bajo_precio") else "generic",
                    severity="high",
                    title=titulo,
                    body=f"Tu cliente {via_txt} — {detalle}. Avísale antes de que se aparte.",
                    payload={"unit_id": cambio["unit_id"], "dev_id": dev_id,
                             "tipo_cambio": tipo_cambio, "via": m["via"],
                             "lead_id": m.get("lead_id"), "contacto_id": m.get("contacto_id")},
                    action_url=f"/desarrollo/{dev_id}",
                )
                notificado = nid is not None
            except Exception as e:  # noqa: BLE001
                log.warning(f"[alerta_oportunidad] emit_notification failed: {e}")

        comprador = {k: m[k] for k in ("visitor_id", "lead_id", "contacto_id", "email", "user_id") if m.get(k)}
        comprador["via"] = m["via"]
        comprador["fuente"] = m.get("fuente")
        if m.get("unidad_exacta"):
            comprador["unidad_exacta"] = True

        identidad = (m.get("visitor_id") or m.get("lead_id") or m.get("contacto_id")
                     or m.get("email") or m.get("user_id"))
        dedup = f"{cambio['unit_id']}|{tipo_cambio}|{ahora}|{identidad}"
        doc = {
            "dedup": dedup,
            "id": f"oport_{secrets.token_urlsafe(8)}",
            "unit": {"unit_id": cambio["unit_id"], "unit_number": cambio["unit_number"],
                     "dev_id": dev_id, "dev_name": cambio["dev_name"], "colonia": cambio["colonia"],
                     "precio": cambio["precio"], "recamaras": cambio["recamaras"], "m2": cambio["m2"]},
            "cambio": {"tipo": tipo_cambio, "antes": antes, "ahora": ahora, "pct": cambio["pct"]},
            "comprador": comprador,
            "canal": "notificacion_asesor" if notificado else "bandeja_asesor",
            "asesor_id": asesor_id,
            "ts": ts,
            "atendida": False,
        }
        try:
            res = await db.oportunidades_detectadas.update_one(
                {"dedup": dedup}, {"$setOnInsert": doc}, upsert=True)
            if res.upserted_id is not None:
                registrados += 1
                if notificado:
                    notificados += 1
        except Exception as e:  # noqa: BLE001
            log.warning(f"[alerta_oportunidad] registro failed: {e}")

    return {"ok": True, "unit_id": cambio["unit_id"], "dev_id": dev_id, "tipo_cambio": tipo_cambio,
            "compradores": len(compradores), "notificados": notificados, "registrados": registrados}


# ─── 4) Bandeja del asesor ───────────────────────────────────────────────────

@router.get("/api/advisor/oportunidades-mercado")
async def oportunidades_mercado(request: Request, solo_pendientes: bool = False, limit: int = 50):
    """Oportunidades detectadas en el scope del asesor (las suyas + las sin asesor asignado,
    para que alguien las atienda), más recientes primero. Superadmin ve todas."""
    from routes.advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db

    q: Dict[str, Any] = {}
    if user.role != "superadmin":
        q["$or"] = [{"asesor_id": user.user_id}, {"asesor_id": None}]
    if solo_pendientes:
        q["atendida"] = False
    try:
        limit = max(1, min(int(limit or 50), 200))
    except (TypeError, ValueError):
        limit = 50

    out: List[Dict[str, Any]] = []
    try:
        async for d in db.oportunidades_detectadas.find(q, {"_id": 0, "dedup": 0}).sort("ts", -1).limit(limit):
            out.append(d)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[alerta_oportunidad] bandeja read failed: {e}")

    return {"oportunidades": out, "total": len(out),
            "pendientes": sum(1 for d in out if not d.get("atendida"))}
