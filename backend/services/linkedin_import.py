"""Phase 4 Batch 32 · services — LinkedIn Profile Import (manual stub).

Esquema:
  db.asesor_linkedin_profiles: {
    asesor_id (PK), linkedin_url, profile_data: {
      full_name, headline, photo_url, years_experience,
      certifications: [str], education: [str], current_company
    }, last_synced_at
  }

LinkedIn API requiere partnership. Modo manual: el asesor pega URL +
completa campos. Cuando LINKEDIN_OAUTH_CLIENT_ID esté en env, se activará
import real (defer Phase 8).
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.linkedin_import")

LINKEDIN_OAUTH_CLIENT_ID = os.environ.get("LINKEDIN_OAUTH_CLIENT_ID", "")

LINKEDIN_URL_RE = re.compile(
    r"^https?://([a-z]{2,3}\.)?linkedin\.com/(in|pub)/[A-Za-z0-9\-_%]+/?$",
    re.IGNORECASE,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _validate_url(url: str) -> bool:
    return bool(LINKEDIN_URL_RE.match((url or "").strip()))


def _normalize_list(v: Any, max_items: int = 12) -> List[str]:
    if not v:
        return []
    if isinstance(v, str):
        items = [s.strip() for s in v.split("\n") if s.strip()]
    elif isinstance(v, list):
        items = [str(s).strip() for s in v if str(s).strip()]
    else:
        items = []
    return items[:max_items]


async def import_from_url(
    db,
    asesor_id: str,
    linkedin_url: str,
    profile_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Modo manual: valida URL + guarda profile_data manual.
    Si LINKEDIN_OAUTH_CLIENT_ID está configurado, en futuro hará scrape real.
    """
    url = (linkedin_url or "").strip()
    if not _validate_url(url):
        raise ValueError("URL de LinkedIn no válida (debe ser /in/usuario)")

    pdata: Dict[str, Any] = profile_data or {}
    cleaned = {
        "full_name": str(pdata.get("full_name") or "").strip()[:120],
        "headline": str(pdata.get("headline") or "").strip()[:240],
        "photo_url": str(pdata.get("photo_url") or "").strip()[:500],
        "years_experience": int(pdata.get("years_experience") or 0),
        "certifications": _normalize_list(pdata.get("certifications")),
        "education": _normalize_list(pdata.get("education")),
        "current_company": str(pdata.get("current_company") or "").strip()[:160],
    }

    if cleaned["years_experience"] < 0 or cleaned["years_experience"] > 60:
        cleaned["years_experience"] = 0

    doc = {
        "asesor_id": asesor_id,
        "linkedin_url": url,
        "profile_data": cleaned,
        "import_method": "manual",
        "oauth_available": bool(LINKEDIN_OAUTH_CLIENT_ID),
        "last_synced_at": _now(),
    }

    await db.asesor_linkedin_profiles.update_one(
        {"asesor_id": asesor_id},
        {"$set": doc},
        upsert=True,
    )

    # log_activity
    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, actor_id=asesor_id, actor_type="asesor",
            action="linkedin_imported", entity_id=asesor_id,
            entity_type="asesor_linkedin_profile",
            metadata={"years_experience": cleaned["years_experience"]},
        )
    except Exception:
        pass

    # Re-compute trust score (experience + certs cambian)
    try:
        from services.trust_score import invalidate_trust_score
        await invalidate_trust_score(db, asesor_id)
    except Exception:
        pass

    out = dict(doc)
    out["last_synced_at"] = _iso(doc["last_synced_at"])
    return out


async def get_profile(db, asesor_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.asesor_linkedin_profiles.find_one(
        {"asesor_id": asesor_id}, {"_id": 0},
    )
    if not doc:
        return None
    if isinstance(doc.get("last_synced_at"), datetime):
        doc["last_synced_at"] = _iso(doc["last_synced_at"])
    return doc


async def revoke_profile(db, asesor_id: str) -> bool:
    r = await db.asesor_linkedin_profiles.delete_one({"asesor_id": asesor_id})
    if r.deleted_count > 0:
        try:
            from services.trust_score import invalidate_trust_score
            await invalidate_trust_score(db, asesor_id)
        except Exception:
            pass
        return True
    return False


async def ensure_linkedin_indexes(db) -> None:
    await db.asesor_linkedin_profiles.create_index("asesor_id", unique=True)
    log.info("[linkedin_import] indexes ensured")
