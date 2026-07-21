"""LISTA APPLY — el upgrade #1 del founder (07-17): cuando el dev cambia su lista, los
cambios de PRECIO y ESTADO de unidades que YA existen se aplican SOLOS ($0, sin IA),
auditados, en vez de esperar el clic y servir dato viejo (caso Avalia B-204: bajó -3.4%
y la plataforma siguió cara y apartada hasta la aprobación).

Reglas de seguridad:
· Solo unidades EXISTENTES con match exacto de número — lo nuevo y lo desaparecido
  siguen pasando por la bandeja (nada se ingiere sin aprobar).
· El precio solo se pisa si el valor actual de la BD coincide con el "antes" del diff
  (si no coinciden, alguien más lo movió → pelea, no pisar).
· Todo queda en audit_log (actor vigia_auto) y en la tarjeta/parte: "ya lo apliqué".
· Una unidad que DESAPARECE de la lista = señal de venta (vigia_senales_venta) +
  inventario_pelea — el status NO se toca solo.
· Apagador: VIGIA_AUTO_APPLY=0 en el entorno lo detiene en seco.
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from lista_peek import norm_unidad

log = logging.getLogger("dmx.lista_apply")

_ACTOR = {"user_id": "vigia_auto", "role": "system", "name": "Vigía (lista del dev)"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def activo() -> bool:
    return (os.environ.get("VIGIA_AUTO_APPLY") or "1").strip() != "0"


async def _development_del_evento(db, fuente_id: str, ev: Dict[str, Any],
                                  unidades: list) -> Optional[str]:
    """¿A qué desarrollo de la plataforma pertenece esta lista? El del org mapeado cuyas
    unidades coinciden con ≥3 números de la lista (mismo candado que usa el peek)."""
    m = await db.vigia_manifiesto.find_one(
        {"fuente_id": fuente_id, "dev_carpeta": ev.get("dev")}, {"_id": 0, "dev_org_id": 1})
    org = (m or {}).get("dev_org_id")
    if not org or not unidades:
        return None
    llaves = {norm_unidad(u) for u in unidades}
    mejor, score = None, 0
    async for d in db.developments.find({"developer_id": org}, {"_id": 0, "id": 1}):
        n = 0
        async for u in db.units.find({"development_id": d["id"]},
                                     {"_id": 0, "unit_number": 1}):
            if norm_unidad(u.get("unit_number")) in llaves:
                n += 1
        if n > score:
            mejor, score = d["id"], n
    return mejor if score >= 3 else None


async def aplicar_cambios(db, fuente_id: str, ev: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Aplica el diff del peek a la plataforma. Devuelve el resumen de lo aplicado
    (o None si no aplica: apagado, sin diff, dev sin mapear, sin match de desarrollo)."""
    cambios = ev.get("cambios") or {}
    if not activo() or cambios.get("nota"):
        return None
    tocadas = ([c.get("unidad") for c in cambios.get("cambios_precio") or []]
               + [c.get("unidad") for c in cambios.get("cambios_status") or []]
               + list(cambios.get("ya_no_estan") or []))
    if not tocadas:
        return None
    # el match de desarrollo usa TODAS las unidades de la lista (snapshot del peek),
    # no solo las tocadas — un solo cambio también merece aplicarse
    llaves = list(tocadas)
    snap = await db.vigia_listas_snapshot.find_one(
        {"archivo_id": (ev.get("archivo") or {}).get("id")}, {"_id": 0, "unidades": 1},
        sort=[("ts", -1)])
    if snap and snap.get("unidades"):
        llaves += [u.get("unidad") or k for k, u in snap["unidades"].items()]
    dev_id = await _development_del_evento(db, fuente_id, ev, llaves)
    if not dev_id:
        return None

    from audit_log import log_mutation
    from unit_status_ledger import record_status_event      # Palanca 2: alimentar el ledger
    dev_doc = await db.developments.find_one({"id": dev_id}, {"_id": 0}) or {}
    archivo = (ev.get("archivo") or {}).get("nombre")
    res = {"development_id": dev_id, "precios": 0, "status": 0,
           "senales_venta": 0, "peleas": 0}

    async def _unidad(num):
        # match por número normalizado (la lista escribe 'B 204', la BD 'B-204')
        async for u in db.units.find({"development_id": dev_id},
                                     {"_id": 0, "id": 1, "unit_number": 1, "price": 1,
                                      "status": 1}):
            if norm_unidad(u["unit_number"]) == norm_unidad(num):
                return u
        return None

    for c in cambios.get("cambios_precio") or []:
        u = await _unidad(c.get("unidad"))
        if not u:
            continue
        if u.get("price") is not None and abs(float(u["price"]) - float(c["antes"])) > 1:
            # la BD no trae el "antes" de la lista → alguien más lo movió: pelea, no pisar
            await db.units.update_one({"id": u["id"]}, {"$set": {
                "precio_pelea": (f"lista {archivo} dice {c['antes']}→{c['ahora']} pero la "
                                 f"BD tenía {u['price']} — revisar")}})
            res["peleas"] += 1
            continue
        # el esquema de pago (crédito/enganche/…) se derivaba del precio VIEJO: al
        # cambiar el precio queda inconsistente (dinero_coherencia) → se limpia y se
        # marca para re-lectura (la próxima ingesta completa lo trae al peso)
        await db.units.update_one({"id": u["id"]}, {
            "$set": {"price": c["ahora"], "price_mxn": c["ahora"],
                     "price_display": f"${int(c['ahora']):,}",
                     "precio_verificado_lista": True,
                     "esquema_pago_pendiente": True,
                     "price_fuente": f"lista del dev ({archivo}) aplicada por el vigía"},
            "$unset": {"credito_mxn": "", "enganche_mxn": "", "reservacion_mxn": "",
                       "contrato_mxn": "", "a_diferir_mxn": ""}})
        await log_mutation(db, _ACTOR, "update", "unit", u["id"],
                           before={"price": u.get("price")},
                           after={"price": c["ahora"], "fuente": archivo}, by_ai=True)
        try:                                    # Palanca 2: el cambio de precio al ledger vivo
            from routes.dev_price_history import record_price_event
            await record_price_event(db, dev_id, u, u.get("price"), c["ahora"],
                                     dev=dev_doc, source="vigia_lista",
                                     label=archivo or "lista del dev")
        except Exception as e:  # noqa: BLE001
            log.warning(f"[lista_apply] price_event: {e}")
        res["precios"] += 1
        # el cierre del flywheel: ¿a quién del radar le cuadra esta baja? → asesor
        if float(c["ahora"]) < float(c["antes"]):
            try:
                from alerta_oportunidad import alertar_oportunidad
                await alertar_oportunidad(db, u["id"], "bajo_precio",
                                          c["antes"], c["ahora"])
            except Exception as e:  # noqa: BLE001
                log.warning(f"[lista_apply] alerta oportunidad: {e}")

    _MAPA_STATUS = {"disponible": "disponible", "no_disponible": "reservado"}
    for c in cambios.get("cambios_status") or []:
        u = await _unidad(c.get("unidad"))
        nuevo = _MAPA_STATUS.get(c.get("ahora"))
        if not u or not nuevo or u.get("status") in ("vendido", nuevo):
            continue                        # una vendida no revive sola: eso sí pide ojos
        await db.units.update_one({"id": u["id"]}, {"$set": {
            "status": nuevo,
            "status_nota": (f"aplicado por el vigía desde {archivo}: "
                            f"{c.get('antes')} → {c.get('ahora')}")}})
        await log_mutation(db, _ACTOR, "update", "unit", u["id"],
                           before={"status": u.get("status")},
                           after={"status": nuevo, "fuente": archivo}, by_ai=True)
        await record_status_event(db, dev_id, u, u.get("status"), nuevo,   # Palanca 2: al ledger
                                  source="vigia_lista", dev=dev_doc)
        res["status"] += 1
        if nuevo == "disponible":       # regresó al mercado → avisar a quien la busca
            try:
                from alerta_oportunidad import alertar_oportunidad
                await alertar_oportunidad(db, u["id"], "volvio_disponible",
                                          c.get("antes"), "disponible")
            except Exception as e:  # noqa: BLE001
                log.warning(f"[lista_apply] alerta oportunidad: {e}")

    for num in cambios.get("ya_no_estan") or []:
        u = await _unidad(num)
        if not u or u.get("status") == "vendido":
            continue
        await db.vigia_senales_venta.insert_one({
            "id": f"vsv_{secrets.token_urlsafe(8)}", "development_id": dev_id,
            "unit_id": u["id"], "unit_number": u["unit_number"],
            "tipo": "desaparecio_de_lista", "archivo": archivo, "ts": _now(),
            "precio_ultimo": u.get("price")})
        await db.units.update_one({"id": u["id"]}, {"$set": {
            "inventario_pelea": (f"la lista {archivo} ya no la ofrece — probable venta, "
                                 f"confirmar con el dev")}})
        # Palanca 2: la señal 'probable venta' al ledger — antes vigia_senales_venta era
        # solo-escritura (nadie la leía); ahora la absorción/velocidad la ven.
        await record_status_event(db, dev_id, u, u.get("status"), "vendido",
                                  source="vigia_probable_venta", dev=dev_doc)
        res["senales_venta"] += 1
        res["peleas"] += 1

    if any((res["precios"], res["status"], res["senales_venta"])):
        log.info(f"[lista_apply] {dev_id}: {res}")
        return res
    return None
