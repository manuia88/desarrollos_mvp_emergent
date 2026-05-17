"""W5.ASR.2 — Pipeline Migration Script · idempotente · standalone.

Migra todos los leads de status V1 → status_v2 V2 sin tocar el campo `status` original.
NO se llama desde server.py startup — ejecutar manualmente o vía trigger superadmin.

Uso:
  python pipeline_migration_script.py --dry-run       # solo logging, no escribe
  python pipeline_migration_script.py                  # ejecuta migración real
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Asegurar que el path del backend esté disponible cuando se corra standalone
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from pipeline_engine import LEAD_STATUS_MAP_V1_TO_V2, map_v1_to_v2

log = logging.getLogger("dmx.pipeline_migration")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def migrate_all_leads(db, dry_run: bool = False) -> Dict[str, Any]:
    """Itera todos los leads sin status_v2 · aplica map_v1_to_v2 · upsert dual-write.

    Args:
        db: AsyncIOMotorDatabase
        dry_run: Si True → solo loggea · no escribe nada.

    Returns:
        {total, migrated, skipped, errors, duration_seconds}
    """
    t0 = time.monotonic()
    total = 0
    migrated = 0
    skipped = 0
    errors_count = 0

    mode = "[DRY-RUN]" if dry_run else "[REAL]"
    log.info(f"[migration] {mode} Iniciando migración pipeline V1→V2")

    # Iterar TODOS los leads (no filtrar por status_v2 null aquí;
    # verificar individualmente para idempotencia correcta)
    cursor = db.leads.find({}, {"_id": 0, "id": 1, "status": 1, "status_v2": 1,
                                 "visita_agendada": 1, "visit_outcome": 1})
    async for lead in cursor:
        total += 1
        lead_id = lead.get("id", "")

        # Ya migrado → skip
        if lead.get("status_v2"):
            skipped += 1
            continue

        old_status = lead.get("status") or "nuevo"
        new_v2 = map_v1_to_v2(old_status)

        # Flags adicionales según mapeo especial
        extra_fields: Dict[str, Any] = {}
        if old_status == "visita_agendada":
            extra_fields["visit_scheduled"] = True
        elif old_status == "visita_realizada":
            extra_fields["visit_completed"] = True

        log.info(
            f"[migration] {mode} lead={lead_id} status='{old_status}' "
            f"→ status_v2='{new_v2}' extra={extra_fields}"
        )

        if not dry_run:
            try:
                patch: Dict[str, Any] = {
                    "status_v2": new_v2,
                    "pipeline_version": 2,
                    **extra_fields,
                }
                await db.leads.update_one(
                    {"id": lead_id},
                    {"$set": patch},
                )
                migrated += 1
            except Exception as exc:
                errors_count += 1
                log.error(f"[migration] ERROR lead={lead_id}: {exc}")
        else:
            migrated += 1  # en dry-run contamos como "se migrarían"

    duration = round(time.monotonic() - t0, 2)
    summary = {
        "mode": "dry_run" if dry_run else "real",
        "total": total,
        "migrated": migrated,
        "skipped": skipped,
        "errors": errors_count,
        "duration_seconds": duration,
        "ran_at": _now().isoformat(),
    }

    log.info(
        f"[migration] {mode} DONE · total={total} migrated={migrated} "
        f"skipped={skipped} errors={errors_count} secs={duration}"
    )
    return summary


# ─── CLI standalone ───────────────────────────────────────────────────────────

async def _main_async(dry_run: bool) -> None:
    import motor.motor_asyncio

    mongo_url = os.environ.get("MONGO_URL")
    db_name   = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL y DB_NAME deben estar definidos en el entorno")

    client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result = await migrate_all_leads(db, dry_run=dry_run)
    log.info(f"[migration] Summary: {result}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline V1→V2 migration script")
    parser.add_argument("--dry-run", action="store_true", help="Solo loggear, no escribir")
    args = parser.parse_args()

    # Cargar .env si existe (cuando se corra desde CLI local)
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(_BACKEND_DIR, ".env"))
    except ImportError:
        pass

    asyncio.run(_main_async(dry_run=args.dry_run))
