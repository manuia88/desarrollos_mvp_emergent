"""W4.18.3 — Private Beta Engine.

Invite codes (DMX-BR-XXXXXX) + waitlist buyers + signup gate flag.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
import string
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.private_beta_engine")

CODE_PREFIX = "DMX-BR-"
CODE_BODY_LEN = 6
CODE_ALPHABET = string.ascii_uppercase + string.digits
# Salt SERVER-ONLY (no REACT_APP_*): el de REACT_APP_ se hornea en el bundle público
# y es recuperable → usarlo para hashing de cumplimiento haría los hashes reversibles.
LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT") or "dmx_lfpdppp_2026"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ip_hash(ip: str) -> str:
    if not ip:
        return ""
    h = hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()
    return h[:16]


def is_private_beta_mode() -> bool:
    return (os.environ.get("PRIVATE_BETA_MODE") or "false").lower() in ("1", "true", "yes")


def _expires_days_default() -> int:
    try:
        return int(os.environ.get("PRIVATE_BETA_INVITE_EXPIRES_DAYS") or "90")
    except ValueError:
        return 90


def _gen_code_str() -> str:
    # [AUD-030] secrets (CSPRNG) en vez de random.choices → invite-codes no predecibles.
    body = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_BODY_LEN))
    return f"{CODE_PREFIX}{body}"


# ─── Invite codes ─────────────────────────────────────────────────────────────
async def generate_codes(
    db,
    count: int,
    intended_role: str = "broker",
    expires_days: Optional[int] = None,
    notes: str = "",
    created_by: str = "",
) -> List[Dict[str, Any]]:
    count = max(1, min(int(count or 1), 100))
    days = int(expires_days or _expires_days_default())
    expires_at = _now() + timedelta(days=days)
    out: List[Dict[str, Any]] = []
    safety = 0
    while len(out) < count and safety < count * 10:
        safety += 1
        code = _gen_code_str()
        try:
            await db.invite_codes.insert_one({
                "code": code,
                "status": "active",
                "intended_role": intended_role,
                "created_by": created_by or "",
                "used_by": None,
                "used_at": None,
                "expires_at": expires_at,
                "notes": (notes or "")[:500],
                "created_at": _now(),
            })
            out.append({
                "code": code,
                "status": "active",
                "intended_role": intended_role,
                "expires_at": expires_at.isoformat(),
                "notes": notes,
            })
        except Exception:
            continue  # duplicate, retry
    return out


async def validate_code(db, code: str) -> Dict[str, Any]:
    if not code:
        return {"valid": False, "reason": "empty"}
    code = code.strip().upper()
    if not code.startswith(CODE_PREFIX):
        return {"valid": False, "reason": "format_invalid"}
    rec = await db.invite_codes.find_one({"code": code}, {"_id": 0})
    if not rec:
        return {"valid": False, "reason": "not_found"}
    if rec["status"] != "active":
        return {"valid": False, "reason": rec["status"]}
    exp = rec.get("expires_at")
    if exp:
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < _now():
            return {"valid": False, "reason": "expired"}
    return {"valid": True, "reason": "ok", "intended_role": rec.get("intended_role", "broker")}


async def consume_code(db, code: str, user_id: str) -> bool:
    code = (code or "").strip().upper()
    res = await db.invite_codes.update_one(
        {"code": code, "status": "active"},
        {"$set": {"status": "used", "used_by": user_id, "used_at": _now()}},
    )
    return res.modified_count > 0


async def revoke_code(db, code: str, by_user_id: str) -> bool:
    code = (code or "").strip().upper()
    res = await db.invite_codes.update_one(
        {"code": code, "status": "active"},
        {"$set": {"status": "revoked", "revoked_by": by_user_id, "revoked_at": _now()}},
    )
    return res.modified_count > 0


async def list_codes(
    db, status_filter: Optional[str] = None, page: int = 1, limit: int = 20,
) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 20), 100))
    q = {}
    if status_filter and status_filter in ("active", "used", "revoked"):
        q["status"] = status_filter
    total = await db.invite_codes.count_documents(q)
    skip = (page - 1) * limit
    cursor = db.invite_codes.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    rows = []
    async for r in cursor:
        for k in ("expires_at", "used_at", "created_at", "revoked_at"):
            if r.get(k) and isinstance(r[k], datetime):
                r[k] = r[k].isoformat()
        rows.append(r)
    return {"items": rows, "page": page, "limit": limit, "total": total}


# ─── Waitlist buyers ──────────────────────────────────────────────────────────
async def add_to_waitlist(
    db, email: str, utm: Dict[str, str], ip: str = "", locale: str = "es-MX",
) -> Dict[str, Any]:
    email = (email or "").lower().strip()
    if not email or "@" not in email:
        return {"ok": False, "reason": "invalid_email"}
    doc = {
        "email": email,
        "source": (utm or {}).get("source") or "landing",
        "utm_source":   (utm or {}).get("utm_source") or "",
        "utm_medium":   (utm or {}).get("utm_medium") or "",
        "utm_campaign": (utm or {}).get("utm_campaign") or "",
        "ip_hash": _ip_hash(ip),
        "locale": locale or "es-MX",
        "created_at": _now(),
    }
    # Idempotent upsert by email
    await db.waitlist_buyers.update_one(
        {"email": email},
        {"$setOnInsert": doc},
        upsert=True,
    )
    return {"ok": True, "email": email}


async def list_waitlist(db, page: int = 1, limit: int = 50) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 50), 200))
    total = await db.waitlist_buyers.count_documents({})
    skip = (page - 1) * limit
    cursor = db.waitlist_buyers.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    rows = []
    async for r in cursor:
        if r.get("created_at") and isinstance(r["created_at"], datetime):
            r["created_at"] = r["created_at"].isoformat()
        rows.append(r)
    # KPIs by utm_source
    pipeline = [
        {"$group": {"_id": "$utm_source", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
        {"$limit": 5},
    ]
    by_source = []
    async for x in db.waitlist_buyers.aggregate(pipeline):
        by_source.append({"utm_source": x["_id"] or "(none)", "count": x["n"]})
    return {"items": rows, "page": page, "limit": limit, "total": total, "by_utm_source": by_source}


async def ensure_private_beta_indexes(db) -> None:
    try:
        await db.invite_codes.create_index("code", unique=True)
        await db.invite_codes.create_index([("status", 1), ("created_at", -1)])
        await db.waitlist_buyers.create_index("email", unique=True)
    except Exception as exc:
        log.warning(f"[ensure_private_beta_indexes] {exc}")
