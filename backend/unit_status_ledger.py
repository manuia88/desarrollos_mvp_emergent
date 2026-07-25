"""Ledger canónico de estatus de unidad — el MOAT de velocidad de venta (Palanca 2, auditoría
07-20).

Antes: el vigía (`lista_apply`) aplicaba estados a `units` + `audit_log` pero NUNCA escribía en
`unit_status_events`, así los motores de absorción/velocidad solo veían las ingestas pesadas, no
el día a día. Y `days_to_sell` se calculaba desde `created_at` (fecha de INGESTA) → 68% de las
ventas salían "0 días". Este writer: (1) stampa org/colonia (antes solo dev_id), (2) usa
`listed_at` real (cuándo salió a la venta) para los días, (3) es idempotente (no duplica el mismo
estado el mismo día → mata el doble-conteo de ventas).
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("unit_status_ledger")


async def ensure_event_store_indexes(db) -> None:
    """Índices de los stores de eventos (Palanca 2/4): unit_status_events y vigia_senales_venta
    no tenían NINGUNO (full scan en cada lectura del moat). Idempotente."""
    try:
        await db.unit_status_events.create_index([("dev_id", 1), ("changed_at", -1)])
        await db.unit_status_events.create_index([("colonia_id", 1), ("sold_at", -1)])
        await db.unit_status_events.create_index([("unit_id", 1)])
        # Palanca 6: acelera la idempotencia del writer canónico (unit_id + estado + fecha)
        await db.unit_status_events.create_index([("unit_id", 1), ("new_status", 1), ("changed_at", -1)])
        await db.vigia_senales_venta.create_index([("development_id", 1), ("ts", -1)])
        await db.buyer_signals.create_index([("dev_id", 1), ("env", 1)])
    except Exception as e:  # noqa: BLE001
        log.warning(f"[ledger] índices: {e}")


async def sanear_eventos(db) -> Dict[str, int]:
    """Palanca 6 · saneo idempotente del ledger: (1) backfill `id` a los eventos viejos que no lo
    tienen, (2) dedup del doble-'vendido' (misma unidad+estado+día) conservando el más antiguo.
    Deja el store consistente con las garantías del writer canónico. Se puede correr N veces."""
    res = {"id_backfilled": 0, "dedup_borrados": 0}
    # 1) backfill id
    async for e in db.unit_status_events.find({"id": {"$exists": False}}, {"_id": 1}):
        await db.unit_status_events.update_one(
            {"_id": e["_id"]}, {"$set": {"id": f"use_{secrets.token_urlsafe(10)}"}})
        res["id_backfilled"] += 1
    # 2) dedup por (unit_id | dev_name+unit_number, new_status, día) — conserva el más antiguo
    vistos: set = set()
    async for e in db.unit_status_events.find(
            {}, {"_id": 1, "unit_id": 1, "dev_name": 1, "unit_number": 1,
                 "new_status": 1, "changed_at": 1}).sort("changed_at", 1):
        ancla = e.get("unit_id") or f"{e.get('dev_name')}|{e.get('unit_number')}"
        clave = (ancla, e.get("new_status"), str(e.get("changed_at"))[:10])
        if clave in vistos:
            await db.unit_status_events.delete_one({"_id": e["_id"]})
            res["dedup_borrados"] += 1
        else:
            vistos.add(clave)
    return res


async def record_status_event(db, dev_id: str, unit: Dict[str, Any], old_status: Optional[str],
                              new_status: str, *, source: str,
                              dev: Optional[Dict[str, Any]] = None,
                              changed_at: Optional[str] = None,
                              changed_by: Optional[str] = None,
                              extra: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """WRITER CANÓNICO del ledger `unit_status_events` (Palanca 6, auditoría 07-20). Único punto de
    escritura: live (vigía), reingesta, retro (por nombre) y edición superadmin pasan TODOS por aquí,
    con schema fijo, `id` propio y clave idempotente. Fail-open (jamás rompe al llamador).

    Idempotencia:
      · con `unit_id`  → (unit_id, new_status, día).
      · sin `unit_id`  → (dev_name, unit_number, new_status, changed_at, source)  [eventos retro por nombre].
    `changed_at` explícito ⇒ evento histórico (retro/carga); si se omite se stampa ahora.
    """
    try:
        if not new_status or old_status == new_status:
            return None
        uid = unit.get("id")
        _dev = dev or {}
        dev_name = unit.get("dev_name") or _dev.get("name") or _dev.get("nombre") or (extra or {}).get("dev_name")
        if not uid and not (dev_name and unit.get("unit_number")):
            return None  # sin ancla estable no se escribe (anti-huérfano)
        now = datetime.now(timezone.utc)
        ts = changed_at or now.isoformat()
        explicito = changed_at is not None
        # ── idempotencia (mata el doble 'vendido') ────────────────────────────
        if uid:
            if explicito:
                key = {"unit_id": uid, "new_status": new_status, "changed_at": ts, "source": source}
            else:
                key = {"unit_id": uid, "new_status": new_status, "changed_at": {"$gte": ts[:10]}}
        else:
            key = {"dev_name": dev_name, "unit_number": unit.get("unit_number"),
                   "new_status": new_status, "changed_at": ts, "source": source}
        if await db.unit_status_events.find_one(key, {"_id": 1}):
            return None
        ev: Dict[str, Any] = {
            "id": f"use_{secrets.token_urlsafe(10)}",
            "unit_id": uid, "dev_id": dev_id, "development_id": dev_id,
            "dev_name": dev_name,
            "org_id": _dev.get("developer_id"),
            "colonia_id": _dev.get("colonia_id") or (extra or {}).get("colonia_id"),
            "alcaldia": _dev.get("alcaldia"),
            "unit_number": unit.get("unit_number"),
            "old_status": old_status, "new_status": new_status,
            "price": unit.get("price") or unit.get("price_mxn"),
            "changed_at": ts, "source": source,
        }
        if changed_by:
            ev["changed_by"] = changed_by
        if new_status == "vendido":
            ev["sold_at"] = ts
            listed = unit.get("listed_at") or unit.get("created_at")
            try:
                base = datetime.fromisoformat(str(listed).replace("Z", "+00:00"))
                if base.tzinfo is None:
                    base = base.replace(tzinfo=timezone.utc)
                vendido = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                if vendido.tzinfo is None:
                    vendido = vendido.replace(tzinfo=timezone.utc)
                ev["days_to_sell"] = max(0, (vendido - base).days)
                ev["days_from"] = "listed_at" if unit.get("listed_at") else "created_at"
            except (ValueError, TypeError):
                ev["days_to_sell"] = None
        if extra:  # nota / campos finos del llamador (no pisan el schema fijo)
            for k, v in extra.items():
                ev.setdefault(k, v)
        await db.unit_status_events.insert_one(ev)

        # REVERSIÓN (auditoría A–Z 07-24): el ledger sólo agregaba, nunca marcaba lo que se
        # deshacía. Cuando una unidad "se vendía" y después volvía a estar disponible —una lista
        # incompleta, un renglón que faltó y reapareció— el evento de venta seguía contando: el
        # motor de absorción reportaba 14 ventas de Casa Condesa que NUNCA ocurrieron, varias con
        # "vendidas en 0 días". Al registrar el regreso a un estado anterior, se marca el evento
        # que queda sin efecto para que los motores dejen de leerlo como venta.
        if uid and old_status:
            try:
                await db.unit_status_events.update_many(
                    {"unit_id": uid, "new_status": old_status,
                     "id": {"$ne": ev["id"]}, "revertido": {"$ne": True}},
                    {"$set": {"revertido": True, "revertido_at": ts,
                              "revertido_por": ev["id"],
                              "revertido_nota": f"la unidad volvió a '{new_status}': este cambio quedó sin efecto"}})
            except Exception as exc:  # noqa: BLE001 — nunca romper el registro por esto
                log.warning(f"[ledger] marcar reversión de {uid}: {exc}")
        return ev["id"]
    except Exception as e:  # noqa: BLE001 — fail-open
        log.warning(f"[ledger] status_event {unit.get('id')}: {e}")
        return None
