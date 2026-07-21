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


async def record_status_event(db, dev_id: str, unit: Dict[str, Any], old_status: Optional[str],
                              new_status: str, *, source: str,
                              dev: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Append al ledger `unit_status_events`. Idempotente por (unit_id, new_status, día).
    Fail-open (jamás rompe al llamador)."""
    try:
        if not new_status or old_status == new_status:
            return None
        uid = unit.get("id")
        if not uid:
            return None
        now = datetime.now(timezone.utc)
        dia = now.isoformat()[:10]
        # idempotencia: mismo estado, misma unidad, mismo día = no-op (evita doble 'vendido')
        ya = await db.unit_status_events.find_one(
            {"unit_id": uid, "new_status": new_status, "changed_at": {"$gte": dia}},
            {"_id": 1})
        if ya:
            return None
        ev: Dict[str, Any] = {
            "id": f"use_{secrets.token_urlsafe(10)}",
            "unit_id": uid, "dev_id": dev_id, "development_id": dev_id,
            "org_id": (dev or {}).get("developer_id"),
            "colonia_id": (dev or {}).get("colonia_id"),
            "alcaldia": (dev or {}).get("alcaldia"),
            "unit_number": unit.get("unit_number"),
            "old_status": old_status, "new_status": new_status,
            "price": unit.get("price") or unit.get("price_mxn"),
            "changed_at": now.isoformat(), "source": source,
        }
        if new_status == "vendido":
            ev["sold_at"] = now.isoformat()
            listed = unit.get("listed_at") or unit.get("created_at")
            try:
                base = datetime.fromisoformat(str(listed).replace("Z", "+00:00"))
                if base.tzinfo is None:
                    base = base.replace(tzinfo=timezone.utc)
                ev["days_to_sell"] = max(0, (now - base).days)
                ev["days_from"] = "listed_at" if unit.get("listed_at") else "created_at"
            except (ValueError, TypeError):
                ev["days_to_sell"] = None
        await db.unit_status_events.insert_one(ev)
        return ev["id"]
    except Exception as e:  # noqa: BLE001 — fail-open
        log.warning(f"[ledger] status_event {unit.get('id')}: {e}")
        return None
