"""W4.4E.5 — Migration script: caya_sessions → asistente_sessions.

Idempotente. Run:
    python -m migrations.migrate_caya_to_asistente

Lo que hace:
  1. Lee `db.caya_sessions` con `migrated != True`
  2. Para cada legacy session, crea entry en `asistente_sessions` (channel="web_bubble")
  3. Persiste mapping legacy_id ↔ asistente_token en `caya_sessions_migration`
  4. Copia `caya_messages` → `asistente_messages` filtrando duplicados por (session_id, content, role, created_at)
  5. Marca caya_sessions.migrated=True
  6. Retorna stats {sessions_migrated, messages_migrated, errors, skipped_dup_messages}

NO destruye datos legacy. Las collections caya_sessions/caya_messages permanecen
intactas para back-compat del endpoint /api/caya/sessions/{id}/history.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Dict

# Allow running as module from /app/backend
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

log = logging.getLogger("dmx.migrate_caya")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def migrate(db) -> Dict[str, int]:
    stats: Dict[str, int] = {
        "sessions_seen": 0,
        "sessions_migrated": 0,
        "sessions_already_mapped": 0,
        "messages_migrated": 0,
        "skipped_dup_messages": 0,
        "errors": 0,
    }

    cursor = db.caya_sessions.find({"$or": [{"migrated": {"$ne": True}}, {"migrated": {"$exists": False}}]})
    async for sess in cursor:
        stats["sessions_seen"] += 1
        legacy_id = sess.get("session_id") or sess.get("_id")
        if not legacy_id:
            stats["errors"] += 1
            continue

        try:
            # Check existing mapping
            existing = await db.caya_sessions_migration.find_one(
                {"legacy_id": legacy_id}, {"_id": 0, "asistente_token": 1},
            )
            if existing and existing.get("asistente_token"):
                asistente_token = existing["asistente_token"]
                stats["sessions_already_mapped"] += 1
            else:
                asistente_token = f"asis_{uuid.uuid4().hex[:20]}"
                # Count actual messages for accurate message_count
                msg_count = await db.caya_messages.count_documents({"session_id": legacy_id})
                # Last activity
                last_msg = await db.caya_messages.find(
                    {"session_id": legacy_id},
                    {"_id": 0, "created_at": 1},
                ).sort("created_at", -1).limit(1).to_list(1)
                last_activity = (last_msg[0].get("created_at") if last_msg else None) or sess.get("created_at") or _now()

                await db.asistente_sessions.update_one(
                    {"_id": asistente_token},
                    {"$set": {
                        "_id": asistente_token,
                        "session_token": asistente_token,
                        "ip_hash": "_legacy_caya_",  # IP raw nunca persistida en caya
                        "user_agent_hash": "_legacy_caya_",
                        "created_at": sess.get("created_at") or _now(),
                        "last_message_at": last_activity,
                        "message_count": msg_count,
                        "captured_lead_id": None,
                        "status": "active",
                        "referral_source": "caya_bubble",
                        "channel": "web_bubble",
                        "legacy_caya_session_id": legacy_id,
                        "migrated_from_caya": True,
                    }},
                    upsert=True,
                )
                await db.caya_sessions_migration.update_one(
                    {"legacy_id": legacy_id},
                    {"$set": {
                        "legacy_id": legacy_id,
                        "asistente_token": asistente_token,
                        "created_at": _now(),
                    }},
                    upsert=True,
                )
                stats["sessions_migrated"] += 1

            # Migrate messages
            async for msg in db.caya_messages.find({"session_id": legacy_id}):
                # Dedupe by (session_token, role, content, created_at)
                role = msg.get("role")
                content = msg.get("content") or ""
                created_at = msg.get("created_at") or _now()
                if role not in ("user", "assistant"):
                    continue

                exists = await db.asistente_messages.find_one({
                    "session_token": asistente_token,
                    "role": role,
                    "content": content,
                    "created_at": created_at,
                }, {"_id": 1})
                if exists:
                    stats["skipped_dup_messages"] += 1
                    continue

                new_id = f"msg_{uuid.uuid4().hex[:12]}"
                await db.asistente_messages.insert_one({
                    "_id": new_id,
                    "session_token": asistente_token,
                    "role": role,
                    "content": content,
                    "tokens_in": 0,
                    "tokens_out": 0,
                    "cost_usd": float(msg.get("cost_usd") or 0),
                    "latency_ms": 0,
                    "tool_calls": msg.get("tool_calls"),
                    "intent_detected": None,
                    "simulated": bool(msg.get("simulated", False)),
                    "created_at": created_at,
                    "migrated_from_caya": True,
                    "legacy_message_id": msg.get("id"),
                })
                stats["messages_migrated"] += 1

            await db.caya_sessions.update_one(
                {"session_id": legacy_id},
                {"$set": {"migrated": True, "asistente_token": asistente_token, "migrated_at": _now()}},
            )
        except Exception as e:
            log.warning(f"[migrate] session {legacy_id} failed: {e}")
            stats["errors"] += 1
            continue

    log.info(f"[migrate] DONE stats={stats}")
    return stats


async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL/DB_NAME no configurados en .env")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    stats = await migrate(db)
    print("MIGRATION_STATS:", stats)
    return stats


if __name__ == "__main__":
    asyncio.run(main())
