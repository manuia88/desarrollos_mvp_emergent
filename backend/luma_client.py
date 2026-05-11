"""W4.9.6 — Luma AI client wrapper.

Wrapper for Luma AI 3D Gaussian Splatting API (https://lumalabs.ai/api).

If `LUMA_API_KEY` is missing, all functions return mock data so the UI/flows
continue to work end-to-end in dev/preview. Mock mode is logged loudly.
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests

log = logging.getLogger("dmx.luma_client")

LUMA_API_BASE = os.environ.get("LUMA_API_BASE", "https://webapp.lumalabs.ai/api/v3")
LUMA_API_KEY = os.environ.get("LUMA_API_KEY", "").strip()
_TIMEOUT = 15
_MAX_RETRIES = 3


def is_stub_mode() -> bool:
    return not bool(LUMA_API_KEY)


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"luma-api-key={LUMA_API_KEY}",
        "Content-Type": "application/json",
    }


def _retry(method: str, url: str, **kwargs) -> requests.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_RETRIES):
        try:
            r = requests.request(method, url, timeout=_TIMEOUT, **kwargs)
            if r.status_code < 500:
                return r
            last_exc = Exception(f"luma_5xx_{r.status_code}")
        except Exception as exc:
            last_exc = exc
        time.sleep(0.6 * (2 ** attempt))
    raise RuntimeError(f"luma_request_failed: {last_exc}")


def _mock_scan(name: str) -> Dict[str, Any]:
    """Mock data shape mirrors Luma response. Used when LUMA_API_KEY missing."""
    return {
        "id": f"mock-luma-{int(time.time())}",
        "name": name,
        "state": "queued",
        "splat_url": "",
        "ply_url": "",
        "spz_url": "",
        "thumbnail_url": "",
    }


# ─── Public API ──────────────────────────────────────────────────────────────

def create_scan(name: str, capture_video_url: Optional[str] = None) -> Dict[str, Any]:
    """Inicia un scan Luma. Returns {luma_scan_id, status, ...}."""
    if is_stub_mode():
        log.warning("[luma] STUB MODE — no LUMA_API_KEY · returning mock scan")
        m = _mock_scan(name)
        return {"luma_scan_id": m["id"], "status": "processing", "_stub": True}

    payload = {"title": name}
    if capture_video_url:
        payload["video_url"] = capture_video_url
    try:
        r = _retry("POST", f"{LUMA_API_BASE}/capture", headers=_headers(), json=payload)
        data = r.json()
        return {"luma_scan_id": data.get("id"), "status": data.get("state", "processing"), "raw": data}
    except Exception as exc:
        log.exception(f"[luma] create_scan failed: {exc}")
        raise


def get_scan_status(luma_scan_id: str) -> Dict[str, Any]:
    """Returns {status, splat_url, ply_url, spz_url, thumbnail_url}."""
    if is_stub_mode():
        return {
            "status": "ready",
            "splat_url": f"https://stub.dmx.local/luma/{luma_scan_id}.splat",
            "ply_url": f"https://stub.dmx.local/luma/{luma_scan_id}.ply",
            "spz_url": f"https://stub.dmx.local/luma/{luma_scan_id}.spz",
            "thumbnail_url": f"https://stub.dmx.local/luma/{luma_scan_id}.png",
            "_stub": True,
        }
    try:
        r = _retry("GET", f"{LUMA_API_BASE}/capture/{luma_scan_id}", headers=_headers())
        data = r.json()
        state = data.get("state") or data.get("status") or "processing"
        # Normalise to our vocabulary
        norm_state = {"complete": "ready", "completed": "ready", "finished": "ready",
                      "failed": "failed", "error": "failed"}.get(state, "processing")
        return {
            "status": norm_state,
            "splat_url": (data.get("assets", {}) or {}).get("splat") or data.get("splat_url", ""),
            "ply_url": (data.get("assets", {}) or {}).get("ply") or data.get("ply_url", ""),
            "spz_url": (data.get("assets", {}) or {}).get("spz") or data.get("spz_url", ""),
            "thumbnail_url": (data.get("assets", {}) or {}).get("thumbnail") or data.get("thumbnail_url", ""),
            "raw": data,
        }
    except Exception as exc:
        log.warning(f"[luma] get_scan_status failed: {exc}")
        return {"status": "processing"}


def download_assets(luma_scan_id: str, target_dir: Path) -> Dict[str, str]:
    """Descarga assets a `target_dir`. Returns {format: local_path}."""
    target_dir.mkdir(parents=True, exist_ok=True)
    if is_stub_mode():
        # Stub: write small placeholder files so the rest of the pipeline works
        placeholders = {}
        for ext, name in (("splat", "scene.splat"), ("ply", "scene.ply"),
                          ("spz", "scene.spz"), ("png", "thumbnail.png")):
            p = target_dir / name
            if not p.exists():
                p.write_bytes(b"DMX_LUMA_STUB_PLACEHOLDER")
            placeholders[ext] = str(p)
        return placeholders

    status = get_scan_status(luma_scan_id)
    result: Dict[str, str] = {}
    mapping = [
        ("splat", status.get("splat_url"), "scene.splat"),
        ("ply", status.get("ply_url"), "scene.ply"),
        ("spz", status.get("spz_url"), "scene.spz"),
        ("png", status.get("thumbnail_url"), "thumbnail.png"),
    ]
    for ext, url, name in mapping:
        if not url:
            continue
        try:
            r = requests.get(url, timeout=60, stream=True)
            if r.status_code == 200:
                p = target_dir / name
                with open(p, "wb") as f:
                    for chunk in r.iter_content(chunk_size=65536):
                        f.write(chunk)
                result[ext] = str(p)
        except Exception as exc:
            log.warning(f"[luma] download {ext} failed: {exc}")
    return result
