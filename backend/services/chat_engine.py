"""Phase 4 Batch 29 · services — Chat Engine (Comprador ↔ Asesor).

Esquemas:
  db.chat_threads: {
    thread_id, buyer_id, asesor_id, project_id,
    status, last_message_at, last_read_buyer_at, last_read_asesor_at, created_at
  }
  db.chat_messages: {
    message_id, thread_id, sender_id, sender_role,
    text, attachments, sent_at, read_at
  }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.chat_engine")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _clean_thread(t: Dict[str, Any]) -> Dict[str, Any]:
    t.pop("_id", None)
    for k in ("last_message_at", "last_read_buyer_at", "last_read_asesor_at", "created_at"):
        t[k] = _iso(t.get(k))
    return t


def _clean_message(m: Dict[str, Any]) -> Dict[str, Any]:
    m.pop("_id", None)
    for k in ("sent_at", "read_at"):
        m[k] = _iso(m.get(k))
    return m


# ─── Thread operations ─────────────────────────────────────────────────────────

async def start_thread(
    db,
    buyer_id: str,
    asesor_id: str,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Crea un thread o reutiliza uno activo existente (idempotente).
    """
    q: Dict[str, Any] = {
        "buyer_id": buyer_id,
        "asesor_id": asesor_id,
        "status": "active",
    }
    if project_id:
        q["project_id"] = project_id

    existing = await db.chat_threads.find_one(q, {"_id": 0})
    if existing:
        return _clean_thread(existing)

    thread_id = uuid.uuid4().hex
    now = _now()
    doc = {
        "thread_id": thread_id,
        "buyer_id": buyer_id,
        "asesor_id": asesor_id,
        "project_id": project_id,
        "status": "active",
        "last_message_at": None,
        "last_read_buyer_at": None,
        "last_read_asesor_at": None,
        "created_at": now,
    }
    await db.chat_threads.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(now)
    doc["last_message_at"] = None
    doc["last_read_buyer_at"] = None
    doc["last_read_asesor_at"] = None
    return doc


# ─── Message operations ────────────────────────────────────────────────────────

async def send_message(
    db,
    thread_id: str,
    sender_id: str,
    sender_role: str,
    text: str,
) -> Dict[str, Any]:
    """
    Inserta un mensaje y actualiza el thread.
    Trigger notification al receptor (B14).
    """
    text = text.strip()
    if not text:
        raise ValueError("Mensaje vacío")
    if len(text) > 4000:
        raise ValueError("Mensaje demasiado largo (máx. 4000 caracteres)")

    thread = await db.chat_threads.find_one({"thread_id": thread_id}, {"_id": 0})
    if not thread:
        raise ValueError("Thread no encontrado")
    if thread.get("status") == "closed":
        raise ValueError("El thread está cerrado")

    message_id = uuid.uuid4().hex
    now = _now()
    msg_doc = {
        "message_id": message_id,
        "thread_id": thread_id,
        "sender_id": sender_id,
        "sender_role": sender_role,
        "text": text,
        "attachments": [],
        "sent_at": now,
        "read_at": None,
    }
    await db.chat_messages.insert_one(msg_doc)

    # Update thread last_message_at
    await db.chat_threads.update_one(
        {"thread_id": thread_id},
        {"$set": {"last_message_at": now}},
    )

    # log_activity
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db,
            actor_id=sender_id,
            actor_type=sender_role,
            action="chat_message_sent",
            entity_id=thread_id,
            entity_type="chat_thread",
            metadata={"thread_id": thread_id, "chars": len(text)},
        )
    except Exception as _e:
        log.warning("[audit] log_activity perdido (chat_message_sent chat_thread %s): %s",
                    thread_id, _e)

    # Notify receptor
    try:
        from routes.dev_batch14 import create_notification
        if sender_role == "buyer":
            recipient_id = thread.get("asesor_id", "")
            notif_title = "Nuevo mensaje de comprador"
        else:
            recipient_id = thread.get("buyer_id", "")
            notif_title = "Tu asesor te respondió"

        if recipient_id:
            await create_notification(
                db,
                user_id=recipient_id,
                notif_type="chat_message",
                title=notif_title,
                body=text[:80] + ("…" if len(text) > 80 else ""),
                action_url="/comprador/chat",
                priority="med",
            )
    except Exception as e:
        log.debug(f"[chat_engine] notif failed: {e}")

    msg_doc.pop("_id", None)
    msg_doc["sent_at"] = _iso(now)
    msg_doc["read_at"] = None
    return msg_doc


# ─── Read status ───────────────────────────────────────────────────────────────

async def mark_thread_read(db, thread_id: str, user_id: str) -> bool:
    """
    Actualiza last_read_*_at según el rol del usuario.
    """
    thread = await db.chat_threads.find_one({"thread_id": thread_id}, {"_id": 0})
    if not thread:
        return False

    now = _now()
    if thread.get("buyer_id") == user_id:
        await db.chat_threads.update_one(
            {"thread_id": thread_id},
            {"$set": {"last_read_buyer_at": now}},
        )
    elif thread.get("asesor_id") == user_id:
        await db.chat_threads.update_one(
            {"thread_id": thread_id},
            {"$set": {"last_read_asesor_at": now}},
        )
    else:
        return False

    return True


async def get_unread_count(db, user_id: str, role: str) -> int:
    """
    Cuenta mensajes no leídos en todos los threads del usuario.
    """
    try:
        role_key = "buyer_id" if role == "buyer" else "asesor_id"
        read_key = "last_read_buyer_at" if role == "buyer" else "last_read_asesor_at"
        opposite_role = "asesor" if role == "buyer" else "buyer"

        threads = await db.chat_threads.find(
            {role_key: user_id, "status": "active"},
            {"_id": 0, "thread_id": 1, read_key: 1},
        ).to_list(500)

        total = 0
        for t in threads:
            last_read = t.get(read_key)
            q: Dict[str, Any] = {
                "thread_id": t["thread_id"],
                "sender_role": opposite_role,
            }
            if last_read:
                q["sent_at"] = {"$gt": last_read}
            total += await db.chat_messages.count_documents(q)

        return total
    except Exception as e:
        log.debug(f"[chat_engine] unread_count error: {e}")
        return 0


async def get_thread_messages(
    db,
    thread_id: str,
    limit: int = 50,
    before: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Devuelve mensajes paginados del thread (más recientes primero → invertidos al frontend).
    """
    q: Dict[str, Any] = {"thread_id": thread_id}
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
            q["sent_at"] = {"$lt": before_dt}
        except Exception:
            pass

    msgs = await db.chat_messages.find(
        q, {"_id": 0}
    ).sort("sent_at", 1).limit(limit).to_list(limit)

    return [_clean_message(m) for m in msgs]


async def list_threads(db, user_id: str, role: str) -> List[Dict[str, Any]]:
    """
    Lista threads del usuario con preview del último mensaje + unread count.
    """
    role_key = "buyer_id" if role == "buyer" else "asesor_id"
    threads = await db.chat_threads.find(
        {role_key: user_id},
        {"_id": 0},
    ).sort("last_message_at", -1).limit(100).to_list(100)

    read_key = "last_read_buyer_at" if role == "buyer" else "last_read_asesor_at"
    opposite_role = "asesor" if role == "buyer" else "buyer"

    result = []
    for t in threads:
        t = _clean_thread(t)

        # Last message preview
        last_msg = await db.chat_messages.find_one(
            {"thread_id": t["thread_id"]},
            {"_id": 0, "text": 1, "sender_role": 1, "sent_at": 1},
            sort=[("sent_at", -1)],
        )
        t["last_message_preview"] = (last_msg.get("text", "")[:60] if last_msg else "")
        t["last_message_sender_role"] = (last_msg.get("sender_role") if last_msg else None)
        t["last_message_sent_at"] = (_iso(last_msg.get("sent_at")) if last_msg else None)

        # Unread count for this thread
        last_read = None
        # Parse the raw last_read from the original thread doc
        raw = await db.chat_threads.find_one(
            {"thread_id": t["thread_id"]},
            {"_id": 0, read_key: 1},
        )
        if raw:
            last_read = raw.get(read_key)

        unread_q: Dict[str, Any] = {
            "thread_id": t["thread_id"],
            "sender_role": opposite_role,
        }
        if last_read:
            unread_q["sent_at"] = {"$gt": last_read}
        t["unread_count"] = await db.chat_messages.count_documents(unread_q)

        # Enrich with counterpart user info
        counterpart_id = t.get("asesor_id") if role == "buyer" else t.get("buyer_id")
        if counterpart_id:
            counterpart = await db.users.find_one(
                {"user_id": counterpart_id},
                {"_id": 0, "name": 1, "email": 1, "picture": 1},
            )
            t["counterpart"] = counterpart or {"name": counterpart_id}
        else:
            t["counterpart"] = {"name": "Asesor DMX"}

        # Enrich project name if project_id present
        if t.get("project_id"):
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                d = DEVELOPMENTS_BY_ID.get(t["project_id"])
                t["project_name"] = d.get("name", t["project_id"]) if d else t["project_id"]
            except Exception:
                t["project_name"] = t.get("project_id", "")

        result.append(t)

    return result


# ─── Ensure indexes ────────────────────────────────────────────────────────────

async def ensure_chat_indexes(db) -> None:
    await db.chat_threads.create_index("thread_id", unique=True)
    await db.chat_threads.create_index("buyer_id")
    await db.chat_threads.create_index("asesor_id")
    await db.chat_threads.create_index([("buyer_id", 1), ("status", 1)])
    await db.chat_threads.create_index([("asesor_id", 1), ("status", 1)])
    await db.chat_threads.create_index([("buyer_id", 1), ("asesor_id", 1), ("project_id", 1)])
    await db.chat_messages.create_index("message_id", unique=True)
    await db.chat_messages.create_index("thread_id")
    await db.chat_messages.create_index([("thread_id", 1), ("sent_at", 1)])
