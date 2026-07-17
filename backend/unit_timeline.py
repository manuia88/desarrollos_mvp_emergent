"""unit_timeline.py — la BIOGRAFÍA de cada depto y las métricas de PELÍCULA.

Visión founder 07-17: "de foto a película". La materia prima YA se acumula sola
(oferta_timeline de market_timeline, vigia_eventos/vigia_listas_snapshot del vigía,
developer_audit, audit_log, units.created_at). Este motor NO escribe nada: LEE todas
esas fuentes y las teje en una sola línea de tiempo por unidad + métricas por desarrollo.

  · biografia(db, unit_id)            → todos los eventos de UN depto, ordenados, con fuente y quién
  · metricas_pelicula(db, dev_id)     → velocidad real de venta, tiempo en lista, frescura, estancadas
  · frescura_catalogo(db)             → por desarrollador: días desde su última lista (podrido→fresco)

HONESTIDAD (regla dura): donde no hay historia el resultado dice 'sin historia
suficiente' — jamás un número inventado. Lógica pura en funciones sin db (testeable);
Mongo solo en los async. Fail-open: una fuente caída no tumba la biografía. $0 de IA.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.unit_timeline")

DIAS_ESTANCADA = 120          # corte founder: sin cambio de precio en 120 días = estancada
DIAS_MES = 30.44              # mes promedio (365.25/12) para meses observados

SIN_HISTORIA = "sin historia suficiente"


# ─── tiempo (puro) ───────────────────────────────────────────────────────────

def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _fecha_iso(ts: Any) -> str:
    """Normaliza CUALQUIER ts de las fuentes a ISO ordenable como string.
    (oferta_timeline trae '2026-07-14 07:23:39', el vigía '2026-07-17T00:25:24+00:00' —
    sin normalizar, el espacio ordena antes que la 'T' y la película sale desordenada)."""
    return str(ts or "").replace(" ", "T")


def _parse_fecha(ts: Any) -> Optional[datetime]:
    s = _fecha_iso(ts).replace("Z", "+00:00")
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            dt = datetime.fromisoformat(s[:19])
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _dias_entre(a: Any, b: Any) -> Optional[int]:
    da, db_ = _parse_fecha(a), _parse_fecha(b)
    if da is None or db_ is None:
        return None
    return max(0, int((db_ - da).total_seconds() // 86400))


def _dias_desde(ts: Any) -> Optional[int]:
    return _dias_entre(ts, _ahora())


def _fmt_precio(v: Any) -> str:
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "$?"


def _evento(fecha: Any, tipo: str, detalle: str, fuente: str, quien: str) -> Dict[str, Any]:
    return {"fecha": _fecha_iso(fecha), "tipo": tipo, "detalle": detalle,
            "fuente": fuente, "quien": quien}


# ─── el nombre de la unidad en un archivo (puro) ─────────────────────────────

def _plano_menciona_unidad(nombre_archivo: str, unit_number: str) -> bool:
    """¿El nombre del archivo trae ESTA unidad? Con frontera de token para que
    'DEPARTAMENTOS 201 - 301' empate a la 201 pero '20' NO empate a la 202."""
    from lista_peek import norm_unidad          # reusar, nunca duplicar
    objetivo = norm_unidad(unit_number)
    if not objetivo:
        return False
    tokens = re.findall(r"[A-ZÁÉÍÓÚÑ0-9]+", str(nombre_archivo or "").upper())
    if objetivo in tokens:
        return True
    # unidades compuestas: 'A-107' → tokens ['A','107'] fusionados; 'BRETAÑA 45' igual
    fusiones = {tokens[i] + tokens[i + 1] for i in range(len(tokens) - 1)}
    return objetivo in fusiones


def _mismo_proyecto(nombre_desarrollo: Optional[str], proyecto_vigia: Optional[str]) -> bool:
    """'Cordobanes' ~ 'Cordobanes - ENTREGA INMEDIATA'. Sin nombre o carpeta raíz → no bloquea."""
    if not nombre_desarrollo or not proyecto_vigia or proyecto_vigia == "(raíz)":
        return True
    a, b = str(nombre_desarrollo).lower(), str(proyecto_vigia).lower()
    if a in b or b in a:
        return True
    ta = {t for t in re.findall(r"[a-záéíóúñ0-9]+", a) if len(t) >= 4}
    tb = {t for t in re.findall(r"[a-záéíóúñ0-9]+", b) if len(t) >= 4}
    return bool(ta & tb)


def _empata_org_carpeta(nombre_org: str, carpeta: str) -> bool:
    """'Class Bienes Raíces' ~ 'DESARROLLOS-CLASS' (fallback cuando no hay manifiesto)."""
    genericos = {"desarrollos", "bienes", "raices", "raíces", "grupo", "inmobiliaria",
                 "constructora", "clientes", "externos", "carpetas", "asesores"}
    ta = {t for t in re.findall(r"[a-záéíóúñ0-9]+", str(nombre_org or "").lower())
          if len(t) >= 3 and t not in genericos}
    tb = {t for t in re.findall(r"[a-záéíóúñ0-9]+", str(carpeta or "").lower())
          if len(t) >= 3 and t not in genericos}
    return bool(ta & tb)


# ─── constructores de eventos por fuente (puros) ─────────────────────────────

def eventos_de_alta(unidad: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not unidad.get("created_at"):
        return []
    return [_evento(unidad["created_at"], "alta",
                    f"Alta en el catálogo (origen: {unidad.get('source') or 'desconocido'})",
                    "units", unidad.get("source") or "sistema")]


def eventos_de_bitacora(evs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """oferta_timeline → cambios de precio/status y señales de venta, diffeando
    eventos consecutivos con el MISMO motor de market_timeline (reusar, no duplicar)."""
    from market_timeline import _diff_eventos
    out: List[Dict[str, Any]] = []
    evs = sorted(evs, key=lambda e: _fecha_iso(e.get("ts")))
    if not evs:
        return out
    e0 = evs[0]
    out.append(_evento(e0.get("ts"), "primera_observacion",
                       f"Primera foto en la bitácora: {_fmt_precio(e0.get('precio'))}, "
                       f"status «{e0.get('status') or '?'}»",
                       "oferta_timeline", str(e0.get("fuente") or "bitácora")))
    for a, b in zip(evs, evs[1:]):
        quien = str(b.get("fuente") or "bitácora")
        for t in _diff_eventos(a, b):
            if t["tipo"] == "salida":
                salida = t.get("tipo_salida") or "salida_de_disponibilidad"
                detalle = ("Vendida (confirmado en la lista)" if salida == "vendido_confirmado"
                           else "Desapareció de la lista (venta probable, no confirmada)"
                           if salida == "retirada_probable_venta"
                           else "Dejó de estar disponible")
                out.append(_evento(b.get("ts"), "senal_venta", detalle, "oferta_timeline", quien))
            elif t["tipo"] == "reaparicion":
                out.append(_evento(b.get("ts"), "reaparicion",
                                   "Volvió a la lista (venta caída o corrección)",
                                   "oferta_timeline", quien))
            elif t["tipo"] == "cambio" and t["campo"] == "precio":
                pct = f" ({t['delta_pct']:+.1f}%)" if t.get("delta_pct") is not None else ""
                out.append(_evento(b.get("ts"), "cambio_precio",
                                   f"{_fmt_precio(t.get('antes'))} → {_fmt_precio(t.get('despues'))}{pct}",
                                   "oferta_timeline", quien))
            elif t["tipo"] == "cambio" and t["campo"] == "status":
                out.append(_evento(b.get("ts"), "cambio_status",
                                   f"«{t.get('antes') or '?'}» → «{t.get('despues') or '?'}»",
                                   "oferta_timeline", quien))
    return out


def eventos_de_developer_audit(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """developer_audit: {action: unit_fields_change|unit_status_change, payload, user_id, ts}."""
    out = []
    for d in docs:
        payload = d.get("payload") or {}
        campos = {k: v for k, v in payload.items() if k not in ("dev_id", "unit_id")}
        if d.get("action") == "unit_status_change" or "status" in campos:
            tipo, detalle = "cambio_status", f"El desarrollador cambió el status: {campos or payload}"
        elif "price" in campos or "price_mxn" in campos:
            nuevo = campos.get("price", campos.get("price_mxn"))
            tipo, detalle = "cambio_precio", f"El desarrollador cambió el precio a {_fmt_precio(nuevo)}"
        else:
            tipo = "edicion_dev"
            detalle = "El desarrollador editó: " + (", ".join(
                f"{k}={v}" for k, v in sorted(campos.items())) or "campos de la unidad")
        out.append(_evento(d.get("ts"), tipo, detalle, "developer_audit",
                           str(d.get("user_id") or "desarrollador")))
    return out


def eventos_de_audit_log(docs: List[Dict[str, Any]], unit_id: str) -> List[Dict[str, Any]]:
    """audit_log (forma rica F0.1: actor/entity_id/diff_keys · forma scheduler: resource/payload).
    Solo mutaciones (create/update/delete/revert) que apuntan a ESTA unidad."""
    out = []
    for d in docs:
        if d.get("action") not in ("create", "update", "delete", "revert"):
            continue
        payload = d.get("payload") or {}
        apunta = (str(d.get("entity_id") or "") == str(unit_id)
                  or str(payload.get("unit_id") or "") == str(unit_id))
        if not apunta:
            continue
        actor = d.get("actor") or {}
        quien = str(actor.get("name") or actor.get("user_id") or payload.get("user_id") or "sistema")
        llaves = d.get("diff_keys") or sorted(k for k in payload if k != "unit_id")
        detalle = f"{d['action']} sobre la unidad" + (f" (campos: {', '.join(map(str, llaves))})" if llaves else "")
        out.append(_evento(d.get("ts"), "auditoria", detalle, "audit_log", quien))
    return out


def eventos_de_snapshots(snaps: List[Dict[str, Any]], unit_number: str) -> List[Dict[str, Any]]:
    """vigia_listas_snapshot: versiones del MISMO archivo (archivo_id) comparadas en orden —
    el diff perfecto lista-vs-lista, mirado solo por la rendija de ESTA unidad."""
    from lista_peek import norm_unidad
    clave = norm_unidad(unit_number)
    if not clave:
        return []
    out: List[Dict[str, Any]] = []
    por_archivo: Dict[str, List[Dict[str, Any]]] = {}
    for s in snaps:
        por_archivo.setdefault(str(s.get("archivo_id")), []).append(s)
    for versiones in por_archivo.values():
        versiones.sort(key=lambda s: _fecha_iso(s.get("ts")))
        for a, b in zip(versiones, versiones[1:]):
            ua = (a.get("unidades") or {}).get(clave)
            ub = (b.get("unidades") or {}).get(clave)
            nombre = b.get("nombre") or a.get("nombre") or "lista"
            if ua is None and ub is None:
                continue
            if ua is None:
                out.append(_evento(b.get("ts"), "aparece_en_lista",
                                   f"Apareció en «{nombre}» a {_fmt_precio(ub.get('precio'))}",
                                   "vigia_listas_snapshot", "vigía"))
                continue
            if ub is None:
                out.append(_evento(b.get("ts"), "senal_venta",
                                   f"Ya no viene en «{nombre}» (venta probable, no confirmada)",
                                   "vigia_listas_snapshot", "vigía"))
                continue
            pa, pb = ua.get("precio"), ub.get("precio")
            if pa is not None and pb is not None and abs(pa - pb) > 1:
                pct = f" ({(pb - pa) / pa * 100:+.1f}%)" if pa else ""
                out.append(_evento(b.get("ts"), "cambio_precio",
                                   f"{_fmt_precio(pa)} → {_fmt_precio(pb)}{pct} en «{nombre}»",
                                   "vigia_listas_snapshot", "vigía"))
            if (ua.get("status") or None) != (ub.get("status") or None):
                out.append(_evento(b.get("ts"), "cambio_status",
                                   f"«{ua.get('status') or 'disponible'}» → «{ub.get('status') or 'disponible'}» en «{nombre}»",
                                   "vigia_listas_snapshot", "vigía"))
    return out


def eventos_de_planos(vigia_evs: List[Dict[str, Any]], unit_number: str,
                      nombre_desarrollo: Optional[str]) -> List[Dict[str, Any]]:
    """vigia_eventos archivo_nuevo/eliminado/cambiado cuyo NOMBRE trae esta unidad
    (su plano apareció / desapareció / cambió en el Drive del desarrollador)."""
    etiqueta = {"archivo_nuevo": ("plano_aparece", "Apareció un archivo con su nombre"),
                "archivo_eliminado": ("plano_desaparece", "Se eliminó un archivo con su nombre"),
                "archivo_cambiado": ("plano_cambiado", "Cambió un archivo con su nombre")}
    out = []
    for ev in vigia_evs:
        if ev.get("tipo") not in etiqueta:
            continue
        a = ev.get("archivo") or {}
        if not _plano_menciona_unidad(a.get("nombre") or "", unit_number):
            continue
        if not _mismo_proyecto(nombre_desarrollo, ev.get("proyecto")):
            continue
        tipo, prefijo = etiqueta[ev["tipo"]]
        carpeta = f" [{a.get('carpeta')}]" if a.get("carpeta") else ""
        out.append(_evento(ev.get("ts"), tipo,
                           f"{prefijo}: «{a.get('nombre')}»{carpeta} en {ev.get('proyecto') or ev.get('dev')}",
                           "vigia_eventos", "vigía"))
    return out


def _dedup_eventos(eventos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """El mismo hecho contado por dos fuentes el mismo día NO se cuenta dos veces."""
    vistos, out = set(), []
    for e in sorted(eventos, key=lambda e: (e["fecha"], e["tipo"])):
        k = (e["fecha"][:10], e["tipo"], e["detalle"])
        if k in vistos:
            continue
        vistos.add(k)
        out.append(e)
    return out


def resumen_de_eventos(eventos: List[Dict[str, Any]],
                       precios: List[Tuple[str, float]]) -> Dict[str, Any]:
    """{dias_en_lista, n_cambios_precio, delta_precio_total} — solo con lo que se pueda PROBAR."""
    if not eventos:
        return {"dias_en_lista": None, "n_cambios_precio": 0, "delta_precio_total": None,
                "nota": SIN_HISTORIA}
    inicio = eventos[0]["fecha"]
    ventas = [e for e in eventos if e["tipo"] == "senal_venta"]
    fin = ventas[-1]["fecha"] if ventas and eventos[-1]["tipo"] == "senal_venta" else None
    dias = _dias_entre(inicio, fin) if fin else _dias_desde(inicio)
    n_cambios = sum(1 for e in eventos if e["tipo"] == "cambio_precio")
    delta = None
    serie = sorted(((f, p) for f, p in precios if p is not None), key=lambda x: _fecha_iso(x[0]))
    if len(serie) >= 2 and serie[0][1] != serie[-1][1]:
        delta = round(serie[-1][1] - serie[0][1], 2)
    elif len(serie) >= 2:
        delta = 0.0
    out = {"dias_en_lista": dias, "n_cambios_precio": n_cambios, "delta_precio_total": delta}
    if delta is None:
        out["nota_precio"] = f"{SIN_HISTORIA} de precio para calcular el delta"
    return out


# ─── 1 · BIOGRAFÍA de un depto ───────────────────────────────────────────────

async def biografia(db, unit_id: str) -> Dict[str, Any]:
    """La línea de tiempo COMPLETA de una unidad, juntando todas las fuentes que existan."""
    unit_id = str(unit_id)
    unidad = None
    try:
        unidad = await db.units.find_one({"id": unit_id}, {"_id": 0})
    except Exception as e:  # noqa: BLE001 — fail-open: sin catálogo la bitácora sigue
        log.warning("[biografia] units fail-open: %s", e)
    u = unidad or {}
    unit_number = str(u.get("unit_number") or "")
    nombre_desarrollo = None
    if u.get("development_id"):
        try:
            d = await db.developments.find_one({"id": u["development_id"]}, {"_id": 0, "name": 1})
            nombre_desarrollo = (d or {}).get("name")
        except Exception:  # noqa: BLE001
            pass

    eventos: List[Dict[str, Any]] = list(eventos_de_alta(u))
    precios: List[Tuple[str, float]] = []

    # bitácora event-sourced (market_timeline) — la fuente más rica
    try:
        evs = [e async for e in db.oferta_timeline.find({"unit_id": unit_id}, {"_id": 0})]
        eventos += eventos_de_bitacora(evs)
        precios += [(e.get("ts"), e.get("precio")) for e in evs if e.get("precio") is not None]
    except Exception as e:  # noqa: BLE001
        log.warning("[biografia] oferta_timeline fail-open: %s", e)

    # ediciones del desarrollador
    try:
        docs = [d async for d in db.developer_audit.find({"unit_id": unit_id}, {"_id": 0})]
        eventos += eventos_de_developer_audit(docs)
    except Exception as e:  # noqa: BLE001
        log.warning("[biografia] developer_audit fail-open: %s", e)

    # audit_log global (mutaciones que apuntan a esta unidad)
    try:
        docs = [d async for d in db.audit_log.find(
            {"$or": [{"entity_id": unit_id}, {"payload.unit_id": unit_id}]}, {"_id": 0})]
        eventos += eventos_de_audit_log(docs, unit_id)
    except Exception as e:  # noqa: BLE001
        log.warning("[biografia] audit_log fail-open: %s", e)

    # price_history si existe (hoy vacía — el riel queda tendido)
    try:
        async for p in db.price_history.find({"unit_id": unit_id}, {"_id": 0}):
            precio = p.get("price") or p.get("precio")
            eventos.append(_evento(p.get("ts") or p.get("fecha"), "cambio_precio",
                                   f"Precio registrado: {_fmt_precio(precio)}",
                                   "price_history", str(p.get("user_id") or "sistema")))
            if precio is not None:
                precios.append((p.get("ts") or p.get("fecha"), precio))
    except Exception as e:  # noqa: BLE001
        log.warning("[biografia] price_history fail-open: %s", e)

    # el vigía: versiones de la misma lista + archivos (planos) con su nombre
    if unit_number:
        try:
            snaps = [s async for s in db.vigia_listas_snapshot.find({}, {"_id": 0})]
            snaps = [s for s in snaps if _mismo_proyecto(nombre_desarrollo, s.get("proyecto"))]
            eventos += eventos_de_snapshots(snaps, unit_number)
        except Exception as e:  # noqa: BLE001
            log.warning("[biografia] snapshots fail-open: %s", e)
        try:
            vevs = [v async for v in db.vigia_eventos.find(
                {"tipo": {"$in": ["archivo_nuevo", "archivo_eliminado", "archivo_cambiado"]}},
                {"_id": 0})]
            eventos += eventos_de_planos(vevs, unit_number, nombre_desarrollo)
        except Exception as e:  # noqa: BLE001
            log.warning("[biografia] vigia_eventos fail-open: %s", e)

    eventos = _dedup_eventos(eventos)
    resumen = resumen_de_eventos(eventos, precios)
    return {
        "unidad": {"id": unit_id, "unit_number": unit_number or None,
                   "development_id": u.get("development_id"),
                   "desarrollo": nombre_desarrollo,
                   "status": u.get("status"), "precio": u.get("price"),
                   "en_catalogo": unidad is not None},
        "eventos": eventos,
        "resumen": resumen,
        "lectura": (f"{len(eventos)} eventos en su biografía." if eventos else
                    f"{SIN_HISTORIA.capitalize()} — la película de esta unidad empieza a "
                    f"grabarse con la próxima corrida del vigía y la bitácora."),
    }


# ─── 2 · MÉTRICAS DE PELÍCULA por desarrollo ─────────────────────────────────

def _ventas_y_ventana(evs_por_unidad: Dict[str, List[Dict[str, Any]]]) -> Tuple[List[str], Optional[str], Optional[str]]:
    """De la bitácora del desarrollo: fechas de salida (disponible→no) + ventana observada."""
    ventas: List[str] = []
    fechas: List[str] = []
    for evs in evs_por_unidad.values():
        evs = sorted(evs, key=lambda e: _fecha_iso(e.get("ts")))
        fechas += [_fecha_iso(e.get("ts")) for e in evs if e.get("ts")]
        for a, b in zip(evs, evs[1:]):
            if bool(a.get("disponible")) and not b.get("disponible"):
                ventas.append(_fecha_iso(b.get("ts")))
    if not fechas:
        return ventas, None, None
    return ventas, min(fechas), max(fechas)


def _ultimo_cambio_precio(evs: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    """(primera_observacion, último cambio REAL de precio o primera obs si nunca cambió)."""
    evs = sorted(evs, key=lambda e: _fecha_iso(e.get("ts")))
    if not evs:
        return None, None
    primera = _fecha_iso(evs[0].get("ts"))
    ultimo = primera
    for a, b in zip(evs, evs[1:]):
        pa, pb = a.get("precio"), b.get("precio")
        if pa is not None and pb is not None and abs(pa - pb) > 1:
            ultimo = _fecha_iso(b.get("ts"))
    return primera, ultimo


async def _frescura_de_carpetas(db, carpetas: List[str],
                                nombre_desarrollo: Optional[str] = None) -> Dict[str, Any]:
    """Última lista vista por el vigía para esas carpetas (prefiere el proyecto exacto)."""
    ultima_dev, ultima_proy = None, None
    try:
        async for ev in db.vigia_eventos.find(
                {"tipo": {"$in": ["lista_cambiada", "lista_nueva"]}}, {"_id": 0}):
            if carpetas and ev.get("dev") not in carpetas:
                continue
            ts = _fecha_iso(ev.get("ts"))
            if ultima_dev is None or ts > ultima_dev:
                ultima_dev = ts
            if nombre_desarrollo and _mismo_proyecto(nombre_desarrollo, ev.get("proyecto")) \
                    and ev.get("proyecto") not in (None, "(raíz)"):
                if ultima_proy is None or ts > ultima_proy:
                    ultima_proy = ts
    except Exception as e:  # noqa: BLE001
        log.warning("[frescura] vigia_eventos fail-open: %s", e)
    ultima = ultima_proy or ultima_dev
    if not ultima:
        return {"ultima_lista": None, "dias_sin_actualizar": None,
                "nota": "el vigía aún no ha visto una lista de este desarrollador"}
    return {"ultima_lista": ultima, "dias_sin_actualizar": _dias_desde(ultima),
            "alcance": "proyecto" if ultima_proy else "desarrollador"}


async def _carpetas_de_org(db, org_id: Optional[str]) -> List[str]:
    """dev_org → carpetas del Drive: 1º el manifiesto (canónico), 2º empate por nombre."""
    if not org_id:
        return []
    carpetas: List[str] = []
    try:
        async for m in db.vigia_manifiesto.find({"dev_org_id": org_id}, {"_id": 0, "dev_carpeta": 1}):
            if m.get("dev_carpeta"):
                carpetas.append(m["dev_carpeta"])
    except Exception as e:  # noqa: BLE001
        log.warning("[frescura] manifiesto fail-open: %s", e)
    if carpetas:
        return carpetas
    try:
        org = await db.dev_orgs.find_one({"tenant_id": org_id}, {"_id": 0, "name": 1, "display_name": 1})
        nombre = (org or {}).get("display_name") or (org or {}).get("name") or ""
        vistos = await db.vigia_eventos.distinct("dev")
        return [c for c in vistos if c and _empata_org_carpeta(nombre, c)]
    except Exception as e:  # noqa: BLE001
        log.warning("[frescura] empate fail-open: %s", e)
        return []


async def metricas_pelicula(db, development_id: str) -> Dict[str, Any]:
    """Las métricas que solo existen cuando hay PELÍCULA (nunca inventadas de la foto)."""
    development_id = str(development_id)
    desarrollo = None
    try:
        desarrollo = await db.developments.find_one({"id": development_id}, {"_id": 0})
    except Exception as e:  # noqa: BLE001
        log.warning("[pelicula] developments fail-open: %s", e)
    d = desarrollo or {}

    unidades: List[Dict[str, Any]] = []
    try:
        unidades = [u async for u in db.units.find(
            {"development_id": development_id},
            {"_id": 0, "id": 1, "unit_number": 1, "status": 1, "created_at": 1, "price": 1})]
    except Exception as e:  # noqa: BLE001
        log.warning("[pelicula] units fail-open: %s", e)

    # bitácora del desarrollo, agrupada por unidad
    evs_por_unidad: Dict[str, List[Dict[str, Any]]] = {}
    try:
        async for e in db.oferta_timeline.find({"dev_id": development_id}, {"_id": 0}):
            evs_por_unidad.setdefault(str(e.get("unit_id")), []).append(e)
    except Exception as e:  # noqa: BLE001
        log.warning("[pelicula] oferta_timeline fail-open: %s", e)
    ids_unidades = {str(u.get("id")) for u in unidades if u.get("id")}
    if ids_unidades:
        try:
            async for e in db.oferta_timeline.find(
                    {"unit_id": {"$in": sorted(ids_unidades)}}, {"_id": 0}):
                lst = evs_por_unidad.setdefault(str(e.get("unit_id")), [])
                if not any(x.get("hash") == e.get("hash") and x.get("ts") == e.get("ts") for x in lst):
                    lst.append(e)
        except Exception as e:  # noqa: BLE001
            log.warning("[pelicula] oferta_timeline por unidad fail-open: %s", e)

    # ── velocidad REAL (ventas detectadas / meses observados) — jamás inventada
    ventas, primera, ultima = _ventas_y_ventana(evs_por_unidad)
    # + ventas del developer_audit (status→vendido con fecha)
    try:
        async for a in db.developer_audit.find(
                {"dev_id": development_id, "action": "unit_status_change"}, {"_id": 0}):
            payload = a.get("payload") or {}
            if str(payload.get("status") or "").lower() == "vendido" and a.get("ts"):
                ventas.append(_fecha_iso(a["ts"]))
                ts = _fecha_iso(a["ts"])
                primera = min(primera, ts) if primera else ts
                ultima = max(ultima, ts) if ultima else ts
    except Exception as e:  # noqa: BLE001
        log.warning("[pelicula] developer_audit fail-open: %s", e)

    meses_observados = None
    dias_ventana = _dias_entre(primera, ultima) if (primera and ultima) else None
    if dias_ventana is not None:
        meses_observados = round(dias_ventana / DIAS_MES, 2)
    if meses_observados is not None and meses_observados >= 1.0:
        velocidad = {"velocidad_real_u_mes": round(len(set(ventas)) / meses_observados, 2),
                     "ventas_detectadas": len(set(ventas)),
                     "meses_observados": meses_observados}
    else:
        velocidad = {"velocidad_real_u_mes": None,
                     "ventas_detectadas": len(set(ventas)),
                     "meses_observados": meses_observados,
                     "nota": f"{SIN_HISTORIA}: se necesita ≥1 mes observado para medir velocidad"}

    # ── tiempo en lista promedio de las DISPONIBLES (desde su alta)
    dias_lista = [dd for u in unidades
                  if str(u.get("status") or "").lower() == "disponible" and u.get("created_at")
                  for dd in [_dias_desde(u["created_at"])] if dd is not None]
    tiempo_prom = round(sum(dias_lista) / len(dias_lista), 1) if dias_lista else None

    # ── frescura: última lista de ESTE desarrollo vista por el vigía
    carpetas = await _carpetas_de_org(db, d.get("developer_id"))
    frescura = await _frescura_de_carpetas(db, carpetas, d.get("name"))

    # ── estancadas: sin cambio de precio en ≥120 días, SOLO si la historia lo prueba
    estancadas: List[Dict[str, Any]] = []
    numeros = {str(u.get("id")): u.get("unit_number") for u in unidades}
    disponibles = {str(u.get("id")) for u in unidades
                   if str(u.get("status") or "").lower() == "disponible"}
    for uid, evs in evs_por_unidad.items():
        if uid in numeros:                      # está en catálogo: manda su status actual
            if uid not in disponibles:
                continue
        else:                                   # solo vive en la bitácora: manda su último evento
            ult = max(evs, key=lambda e: _fecha_iso(e.get("ts")), default=None)
            if not ult or not ult.get("disponible"):
                continue
        primera_obs, ult_cambio = _ultimo_cambio_precio(evs)
        if not primera_obs or not ult_cambio:
            continue
        obs = _dias_desde(primera_obs)
        sin_cambio = _dias_desde(ult_cambio)
        if obs is not None and sin_cambio is not None \
                and obs >= DIAS_ESTANCADA and sin_cambio >= DIAS_ESTANCADA:
            estancadas.append({"unidad": numeros.get(uid) or uid,
                               "unit_id": uid,
                               "dias_sin_cambio_precio": sin_cambio})
    estancadas.sort(key=lambda x: -x["dias_sin_cambio_precio"])

    return {
        "desarrollo": {"id": development_id, "nombre": d.get("name"),
                       "encontrado": desarrollo is not None,
                       "n_unidades": len(unidades)},
        **velocidad,
        "tiempo_en_lista_promedio_disponibles": tiempo_prom,
        **({} if tiempo_prom is not None else
           {"nota_tiempo_en_lista": f"{SIN_HISTORIA}: sin disponibles con fecha de alta"}),
        "frescura": frescura,
        "unidades_estancadas": estancadas,
        **({} if estancadas or (meses_observados or 0) * DIAS_MES >= DIAS_ESTANCADA else
           {"nota_estancadas": f"{SIN_HISTORIA}: aún no hay {DIAS_ESTANCADA} días de "
                               f"observación para probar estancamiento"}),
        "lectura": "Métricas medidas SOLO de historia real acumulada — donde falta película, "
                   "se dice, no se inventa.",
    }


# ─── 3 · FRESCURA del catálogo completo ──────────────────────────────────────

async def frescura_catalogo(db) -> Dict[str, Any]:
    """Por desarrollador (dev_orgs): días desde su última lista vista por el vigía,
    ordenado del más podrido al más fresco (nunca-visto = lo más podrido)."""
    orgs: List[Dict[str, Any]] = []
    try:
        orgs = [o async for o in db.dev_orgs.find(
            {}, {"_id": 0, "tenant_id": 1, "name": 1, "display_name": 1})]
    except Exception as e:  # noqa: BLE001
        log.warning("[frescura_catalogo] dev_orgs fail-open: %s", e)

    filas: List[Dict[str, Any]] = []
    for o in orgs:
        org_id = o.get("tenant_id")
        carpetas = await _carpetas_de_org(db, org_id)
        if carpetas:
            f = await _frescura_de_carpetas(db, carpetas)
        else:
            f = {"ultima_lista": None, "dias_sin_actualizar": None,
                 "nota": "sin carpeta del vigía mapeada a este desarrollador"}
        filas.append({"desarrollador": o.get("display_name") or o.get("name") or org_id,
                      "tenant_id": org_id, "carpetas_drive": carpetas,
                      "ultima_lista": f.get("ultima_lista"),
                      "dias_sin_lista": f.get("dias_sin_actualizar"),
                      **({"nota": f["nota"]} if f.get("nota") else {})})

    # podrido primero: nunca-visto (None) arriba, luego más días → menos días
    filas.sort(key=lambda r: (0 if r["dias_sin_lista"] is None else 1,
                              -(r["dias_sin_lista"] or 0)))
    con_lista = [r for r in filas if r["dias_sin_lista"] is not None]
    return {"n_desarrolladores": len(filas),
            "n_con_lista_vista": len(con_lista),
            "filas": filas,
            "lectura": (f"{len(con_lista)} de {len(filas)} desarrolladores tienen lista vista "
                        f"por el vigía." if filas else
                        "Sin desarrolladores dados de alta aún.")}
