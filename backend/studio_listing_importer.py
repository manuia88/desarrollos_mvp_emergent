"""W5.22 Z.1 Sub-B — Studio Listing Importer (self-data).

Parsers para 3 portales legales (founder confirmo en feedback_no_scraping_competitors):
    - EasyBroker        : data-* attrs + meta og:*
    - Propiedades.com   : JSON-LD via __NEXT_DATA__
    - Casas y Terrenos  : selectors fijos

NUNCA importar de Inmuebles24/Lamudi/Vivanuncios MX.

Rate-limit: 10 imports/hora/user (deque in-memory · 429 si excede).
User-Agent constante: STUDIO_IMPORTER_USER_AGENT env.
Respect robots.txt (try/except · NO bloquear si servidor cae · FAIL-SOFT).

Collection: db.listing_imports
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

log = logging.getLogger("dmx.studio_listing_importer")

ALLOWED_PORTALS = ("easybroker", "propiedades_com", "casas_terrenos")
BLOCKED_PORTALS_HOST = {
    "inmuebles24.com", "www.inmuebles24.com",
    "lamudi.com.mx", "www.lamudi.com.mx",
    "vivanuncios.com.mx", "www.vivanuncios.com.mx",
}

USER_AGENT = os.environ.get(
    "STUDIO_IMPORTER_USER_AGENT",
    "DMX-Studio-Importer/1.0 (+https://desarrollosmx.io/legal/importer)",
)

RATE_LIMIT_PER_HOUR = 10
_user_buckets: Dict[str, deque] = defaultdict(deque)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid() -> str:
    return "lim_" + uuid.uuid4().hex[:12]


# ─── Rate limit ──────────────────────────────────────────────────────────────
def check_rate_limit(user_id: str) -> bool:
    """True si user puede importar ahora. Side-effect: registra timestamp."""
    now = time.monotonic()
    bucket = _user_buckets[user_id]
    cutoff = now - 3600
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_PER_HOUR:
        return False
    bucket.append(now)
    return True


# ─── Portal detection + blocklist ────────────────────────────────────────────
def detect_portal(url: str) -> Optional[str]:
    """Devuelve key del portal o None si no soportado."""
    if not url:
        return None
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return None
    if host in BLOCKED_PORTALS_HOST:
        return "blocked"
    if "easybroker" in host:
        return "easybroker"
    if "propiedades.com" in host:
        return "propiedades_com"
    if "casasyterrenos" in host or "casas-y-terrenos" in host:
        return "casas_terrenos"
    return None


# ─── Robots.txt soft-check ───────────────────────────────────────────────────
async def check_robots_allows(url: str) -> bool:
    """True si robots.txt permite o no se puede determinar (FAIL-SOFT)."""
    try:
        import httpx
        from services.ai_safety import is_public_url_safe
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        if not is_public_url_safe(robots_url, label="studio_robots"):  # SEGURIDAD (3ª ola): mismo guard que fetch_html (el pre-fetch de robots no lo tenía)
            return True  # fail-soft; el fetch real de fetch_html bloquea el SSRF de todas formas
        async with httpx.AsyncClient(timeout=5.0, headers={"User-Agent": USER_AGENT}, follow_redirects=False) as client:
            r = await client.get(robots_url)
            if r.status_code != 200:
                return True
            body = r.text.lower()
            # Heuristica simple: si Disallow: / aplica a User-agent: * → bloquear
            if "user-agent: *" in body:
                seg = body.split("user-agent: *", 1)[1].split("user-agent:", 1)[0]
                if "disallow: /" in seg and "disallow: /\n" in (seg + "\n"):
                    return False
            return True
    except Exception as exc:
        log.warning(f"[importer] robots check soft-fail: {exc}")
        return True


# ─── Fetch ───────────────────────────────────────────────────────────────────
async def fetch_html(url: str) -> Optional[str]:
    try:
        import httpx
        from services.ai_safety import is_public_url_safe
        if not is_public_url_safe(url, label="studio_importer"):  # SEGURIDAD anti-SSRF (pentest 2026-06-27)
            return None
        async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": USER_AGENT},
                                     follow_redirects=False) as client:
            r = await client.get(url)
            if r.status_code >= 400:
                return None
            return r.text[:200000]  # cap 200KB
    except Exception as exc:
        log.warning(f"[importer] fetch failed {url}: {exc}")
        return None


# ─── Parsers ─────────────────────────────────────────────────────────────────
def _safe_int(s: Any) -> Optional[int]:
    if s is None:
        return None
    try:
        return int(re.sub(r"[^0-9-]", "", str(s)))
    except Exception:
        return None


def _safe_float(s: Any) -> Optional[float]:
    if s is None:
        return None
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(s)))
    except Exception:
        return None


def parse_easybroker(html: str) -> Dict[str, Any]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.find("meta", property="og:title") or {}).get("content") or \
            (soup.title.string if soup.title else "")
    desc = (soup.find("meta", property="og:description") or {}).get("content") or ""
    price_el = soup.find(attrs={"data-test": re.compile("price")}) or \
               soup.find(class_=re.compile("price"))
    price = _safe_float(price_el.get_text() if price_el else None)
    photos = [m.get("content") for m in soup.find_all("meta", property="og:image") if m.get("content")][:10]
    rooms_el = soup.find(attrs={"data-test": re.compile("bedrooms|rooms")})
    rooms = _safe_int(rooms_el.get_text() if rooms_el else None)
    baths_el = soup.find(attrs={"data-test": re.compile("bathrooms|baths")})
    baths = _safe_float(baths_el.get_text() if baths_el else None)
    area_el = soup.find(attrs={"data-test": re.compile("area|m2")})
    area = _safe_float(area_el.get_text() if area_el else None)
    addr_el = soup.find(attrs={"data-test": re.compile("address|location")}) or \
              soup.find(class_=re.compile("address|location"))
    address = addr_el.get_text(strip=True)[:200] if addr_el else ""
    return {
        "title": (title or "").strip()[:200],
        "description": (desc or "").strip()[:2000],
        "price": price, "area_m2": area, "rooms": rooms,
        "bathrooms": baths, "address": address,
        "photos": photos, "features": [],
    }


def parse_propiedades_com(html: str) -> Dict[str, Any]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    # __NEXT_DATA__ contiene JSON con la propiedad
    nd = soup.find("script", id="__NEXT_DATA__")
    if nd and nd.string:
        try:
            data = json.loads(nd.string)
            props = data.get("props", {}).get("pageProps", {})
            listing = props.get("propertyData") or props.get("property") or props.get("listing") or {}
            return {
                "title": str(listing.get("title") or listing.get("name") or "").strip()[:200],
                "description": str(listing.get("description") or "").strip()[:2000],
                "price": _safe_float(listing.get("price") or listing.get("priceAmount")),
                "area_m2": _safe_float(listing.get("totalArea") or listing.get("area")),
                "rooms": _safe_int(listing.get("bedrooms") or listing.get("rooms")),
                "bathrooms": _safe_float(listing.get("bathrooms") or listing.get("fullBaths")),
                "address": str(listing.get("address") or listing.get("location") or "")[:200],
                "photos": [p.get("url") for p in (listing.get("photos") or [])
                           if isinstance(p, dict) and p.get("url")][:10],
                "features": list((listing.get("features") or [])[:20]),
            }
        except Exception as exc:
            log.warning(f"[importer] propiedades NEXT_DATA parse failed: {exc}")
    # Fallback JSON-LD
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            j = json.loads(s.string or "{}")
            if isinstance(j, list):
                j = j[0] if j else {}
            if j.get("@type") in ("Product", "Residence", "Place", "Offer"):
                return {
                    "title": str(j.get("name") or "")[:200],
                    "description": str(j.get("description") or "")[:2000],
                    "price": _safe_float((j.get("offers") or {}).get("price")),
                    "area_m2": None, "rooms": None, "bathrooms": None,
                    "address": str((j.get("address") or {}).get("streetAddress") or "")[:200],
                    "photos": [j["image"]] if isinstance(j.get("image"), str) else (j.get("image") or [])[:10],
                    "features": [],
                }
        except Exception:
            continue
    return {"title": "", "description": "", "price": None, "area_m2": None,
            "rooms": None, "bathrooms": None, "address": "",
            "photos": [], "features": []}


def parse_casas_terrenos(html: str) -> Dict[str, Any]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.find("h1") or {}).get_text(strip=True)[:200] if soup.find("h1") else ""
    desc_el = soup.find(class_=re.compile("description|descripcion")) or \
              soup.find("meta", property="og:description")
    desc = (desc_el.get("content") if hasattr(desc_el, "get") and desc_el.get("content") else
            (desc_el.get_text(strip=True) if desc_el else ""))
    price_el = soup.find(class_=re.compile("price|precio"))
    price = _safe_float(price_el.get_text() if price_el else None)
    feats_root = soup.find(class_=re.compile("features|caracteristicas"))
    features = []
    if feats_root:
        for li in feats_root.find_all("li")[:20]:
            txt = li.get_text(strip=True)
            if txt:
                features.append(txt[:80])
    photos = [m.get("content") for m in soup.find_all("meta", property="og:image") if m.get("content")][:10]
    addr_el = soup.find(class_=re.compile("address|ubicacion|location"))
    address = addr_el.get_text(strip=True)[:200] if addr_el else ""
    return {
        "title": title, "description": (desc or "").strip()[:2000],
        "price": price, "area_m2": None, "rooms": None,
        "bathrooms": None, "address": address,
        "photos": photos, "features": features,
    }


PARSERS = {
    "easybroker": parse_easybroker,
    "propiedades_com": parse_propiedades_com,
    "casas_terrenos": parse_casas_terrenos,
}


# ─── Pipeline orchestration ──────────────────────────────────────────────────
async def import_listing(db, *, user_id: str, tenant_id: str,
                         source_url: str,
                         target_project_id: Optional[str] = None) -> Dict[str, Any]:
    """Pipeline completo: fetch → parse → persist. Devuelve doc final.

    Errores se persisten con status=failed + error_msg (no levantan 500).
    """
    portal = detect_portal(source_url)
    if portal == "blocked":
        raise ValueError(
            "Portal bloqueado por terminos legales (Inmuebles24/Lamudi/Vivanuncios). "
            "Usa EasyBroker, Propiedades.com o Casas y Terrenos.",
        )
    if not portal or portal not in PARSERS:
        raise ValueError(
            "Portal no soportado. Solo: EasyBroker, Propiedades.com, Casas y Terrenos.",
        )
    now_iso = _iso()
    doc: Dict[str, Any] = {
        "id": _uid(),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "source_portal": portal,
        "source_url": source_url[:1024],
        "fetched_at": now_iso,
        "raw_html_truncated": "",
        "parsed_data": None,
        "status": "pending",
        "error_msg": None,
        "target_project_id": target_project_id,
        "created_at": now_iso,
    }

    allows = await check_robots_allows(source_url)
    if not allows:
        doc.update({"status": "failed", "error_msg": "robots.txt no permite scraping de este portal."})
        await db.listing_imports.insert_one(dict(doc))
        return {k: v for k, v in doc.items() if k != "_id"}

    html = await fetch_html(source_url)
    if not html:
        doc.update({"status": "failed", "error_msg": "No se pudo obtener el HTML del portal (timeout o 4xx/5xx)."})
        await db.listing_imports.insert_one(dict(doc))
        return {k: v for k, v in doc.items() if k != "_id"}

    doc["raw_html_truncated"] = html[:50000]
    try:
        parsed = PARSERS[portal](html)
        doc["parsed_data"] = parsed
        doc["status"] = "parsed"
    except Exception as exc:
        log.warning(f"[importer] parse failed: {exc}")
        doc["status"] = "failed"
        doc["error_msg"] = f"Error al parsear: {str(exc)[:200]}"

    await db.listing_imports.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k != "_id"}


async def list_user_imports(db, user_id: str, limit: int = 20, skip: int = 0) -> Dict[str, Any]:
    cur = db.listing_imports.find({"user_id": user_id}, {"_id": 0, "raw_html_truncated": 0}) \
        .sort("created_at", -1).skip(skip).limit(limit)
    items = [d async for d in cur]
    total = await db.listing_imports.count_documents({"user_id": user_id})
    return {"items": items, "total": total, "limit": limit, "skip": skip}


async def get_import(db, import_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.listing_imports.find_one(
        {"id": import_id, "user_id": user_id}, {"_id": 0},
    )


async def delete_import(db, import_id: str, user_id: str) -> bool:
    res = await db.listing_imports.delete_one({"id": import_id, "user_id": user_id})
    return res.deleted_count > 0


async def ensure_indexes(db) -> None:
    try:
        await db.listing_imports.create_index(
            [("user_id", 1), ("created_at", -1)], background=True,
        )
        await db.listing_imports.create_index("id", unique=True, background=True)
    except Exception as exc:
        log.warning(f"[importer] ensure_indexes warning: {exc}")
    # W5.22 Z.1.1 SUB-FIX-4 · MongoDB-persistent rate-limit collection
    try:
        # TTL index · MongoDB auto-deletes docs after expires_at
        await db.studio_rate_limits.create_index(
            "expires_at", expireAfterSeconds=0,
            name="studio_rate_limits_ttl", background=True,
        )
        # Unique compound (user_id, action, window_start) for upsert idempotency
        await db.studio_rate_limits.create_index(
            [("user_id", 1), ("action", 1), ("window_start", 1)],
            unique=True, name="studio_rate_limits_window_unique", background=True,
        )
    except Exception as exc:
        log.warning(f"[importer] studio_rate_limits indexes warning: {exc}")


# ─── W5.22 Z.1.1 SUB-FIX-4 · MongoDB-persistent rate-limit ───────────────────
async def check_rate_limit_persistent(
    db,
    user_id: str,
    action: str = "listing_import",
    max_per_hour: int = RATE_LIMIT_PER_HOUR,
) -> bool:
    """Persistent rate-limit backed by MongoDB collection `studio_rate_limits`.

    Schema per doc:
      _id (sha256 hash) · user_id · action · window_start (iso hour) ·
      count (int) · expires_at (datetime · TTL auto-clean 1h)

    Idempotent upsert with $inc: race-safe across multi-worker deployments.
    FAIL-SOFT: si MongoDB falla → return True (NO bloquea usuarios legítimos).
    """
    import hashlib
    if not user_id:
        return True
    try:
        now = _now()
        # Window key = current UTC hour (ISO format "YYYY-MM-DDTHH")
        window_start = now.replace(minute=0, second=0, microsecond=0)
        window_iso = window_start.isoformat()
        idem = hashlib.sha256(
            f"{user_id}:{action}:{window_iso}".encode("utf-8")
        ).hexdigest()
        expires_at = window_start + timedelta(hours=1)

        # Atomic upsert + increment · returns new doc
        result = await db.studio_rate_limits.find_one_and_update(
            {"_id": idem},
            {
                "$inc": {"count": 1},
                "$set": {
                    "user_id": user_id,
                    "action": action,
                    "window_start": window_start,
                    "expires_at": expires_at,
                },
            },
            upsert=True,
            return_document=True,
        )
        # Handle both motor return shapes (dict OR ReturnDocument enum response)
        current_count = (result or {}).get("count", 1) if isinstance(result, dict) else 1
        if current_count > max_per_hour:
            return False
        return True
    except Exception as exc:
        log.warning(f"[rate_limit_persistent] FAIL-SOFT default-allow: {exc}")
        return True
