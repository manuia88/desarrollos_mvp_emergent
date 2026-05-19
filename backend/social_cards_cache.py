"""W5.16 — Social Cards disk cache helper.

Stores rendered PNGs in storage/social_cards/{layout}_{entity_type}_{slug}.png
TTL 24h (mtime check). LRU eviction not enforced on disk · OS handles it.

API:
  disk_get(layout, entity_type, slug) → Optional[bytes]
  disk_set(layout, entity_type, slug, png_bytes)
  disk_path(layout, entity_type, slug) → Path
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Optional

from social_cards_engine import STORAGE_BASE, ensure_social_cards_dir

log = logging.getLogger("dmx.social_cards_cache")

TTL_SECONDS = 24 * 3600


def _safe_slug(s: str) -> str:
    """Sanitize slug for filesystem · alnum + dash/underscore only."""
    if not s:
        return "anon"
    out = []
    for ch in str(s)[:80]:
        if ch.isalnum() or ch in ("-", "_"):
            out.append(ch)
        else:
            out.append("_")
    return "".join(out) or "anon"


def disk_path(layout: str, entity_type: str, slug: str) -> Path:
    ensure_social_cards_dir()
    fname = f"{_safe_slug(layout)}_{_safe_slug(entity_type)}_{_safe_slug(slug)}.png"
    return STORAGE_BASE / fname


def disk_get(layout: str, entity_type: str, slug: str) -> Optional[bytes]:
    """Return cached PNG bytes if file exists and mtime < TTL · else None."""
    p = disk_path(layout, entity_type, slug)
    try:
        if not p.exists():
            return None
        if time.time() - p.stat().st_mtime > TTL_SECONDS:
            return None
        return p.read_bytes()
    except Exception as exc:
        log.warning(f"[social_cards_cache] disk_get failed {p}: {exc}")
        return None


def disk_set(layout: str, entity_type: str, slug: str, png_bytes: bytes) -> None:
    """Persist PNG to disk · FAIL-SOFT."""
    p = disk_path(layout, entity_type, slug)
    try:
        p.write_bytes(png_bytes)
    except Exception as exc:
        log.warning(f"[social_cards_cache] disk_set failed {p}: {exc}")


def disk_stats() -> dict:
    """Count files + total bytes in storage dir."""
    ensure_social_cards_dir()
    try:
        files = list(STORAGE_BASE.glob("*.png"))
        total_bytes = sum(f.stat().st_size for f in files)
        return {
            "files_count": len(files),
            "total_bytes": total_bytes,
            "storage_path": str(STORAGE_BASE),
        }
    except Exception as exc:
        log.warning(f"[social_cards_cache] disk_stats failed: {exc}")
        return {"files_count": 0, "total_bytes": 0, "storage_path": str(STORAGE_BASE)}
