"""Phase 4 Batch 27 · routes — Share metadata & og:image dinámico.

Endpoints públicos:
  GET /api/public/colonia/{id}/history       — Historia/proyección Claude (cache 7d)
  GET /share/comparar/meta?ids=...&type=...   — JSON con og_title/og_description/og_image_url
  GET /share/comparar/og-image?ids=...&type=...  — PNG dinámico para preview redes
"""
from __future__ import annotations

import hashlib
import io
import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, JSONResponse

log = logging.getLogger("dmx.share_meta")

router = APIRouter(tags=["public-share"])

OG_CACHE_DIR = "/tmp/dmx_og_cache"
os.makedirs(OG_CACHE_DIR, exist_ok=True)

OG_W, OG_H = 1200, 630
NAVY = (6, 8, 15)
CREAM = (240, 235, 224)
INDIGO = (99, 102, 241)
ROSE = (236, 72, 153)


def _get_db(request: Request):
    return request.app.state.db


def _ids_key(entity_type: str, ids: list) -> str:
    raw = f"{entity_type}::{','.join(sorted(ids))}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


# ─── Historia colonia ────────────────────────────────────────────────────────

@router.get("/api/public/colonia/{colonia_id}/history")
async def get_colonia_history_ep(colonia_id: str, request: Request):
    """Devuelve la historia/proyección. Cache 7d en `db.colonia_history`."""
    from services.colonia_history import generate_colonia_history
    db = _get_db(request)
    data = await generate_colonia_history(db, colonia_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Colonia '{colonia_id}' no encontrada")
    return data


# ─── Share meta JSON ─────────────────────────────────────────────────────────

@router.get("/api/share/comparar/meta")
async def share_compare_meta(
    request: Request,
    ids: str = "",
    type: str = "colonia",
):
    """Meta JSON para SSR/og previews."""
    if type not in ("colonia", "property"):
        raise HTTPException(status_code=400, detail="type debe ser 'colonia' o 'property'")
    id_list = [x.strip() for x in (ids or "").split(",") if x.strip()][:3]
    if not id_list:
        raise HTTPException(status_code=400, detail="ids es requerido (máx 3, separados por coma)")

    # Resolver nombres legibles
    names: list = []
    if type == "colonia":
        try:
            from data_seed import COLONIAS
            byid = {c["id"]: c for c in COLONIAS}
            for cid in id_list:
                c = byid.get(cid)
                names.append(c["name"] if c else cid)
        except Exception:
            names = id_list
    else:
        names = id_list

    backend_base = str(request.base_url).rstrip("/")
    og_image_url = f"{backend_base}/api/share/comparar/og-image?ids={ids}&type={type}"
    title = f"Compara {' · '.join(names)} en DesarrollosMX"
    desc = (
        f"Comparativa lado-a-lado de {len(names)} {'colonias' if type == 'colonia' else 'propiedades'} "
        f"con scores IE Engine, riesgos, climate twin y desarrollos activos."
    )
    return {
        "og_title": title[:120],
        "og_description": desc[:240],
        "og_image_url": og_image_url,
        "share_url_path": f"/comparar?ids={ids}&type={type}",
        "entities": [{"id": i, "nombre": n} for i, n in zip(id_list, names)],
    }


# ─── og:image generator ──────────────────────────────────────────────────────

def _draw_gradient_band(img, y0: int, y1: int):
    """Dibuja una banda con gradiente indigo→rose."""
    from PIL import ImageDraw  # noqa: F401
    px = img.load()
    span = max(1, OG_W)
    for x in range(OG_W):
        t = x / span
        r = int(INDIGO[0] + (ROSE[0] - INDIGO[0]) * t)
        g = int(INDIGO[1] + (ROSE[1] - INDIGO[1]) * t)
        b = int(INDIGO[2] + (ROSE[2] - INDIGO[2]) * t)
        for y in range(y0, y1):
            px[x, y] = (r, g, b, 255)


def _font(size: int, bold: bool = False):
    """Resuelve una fuente del sistema con fallback."""
    from PIL import ImageFont
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


def _make_og_image(names: list, entity_type: str) -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (OG_W, OG_H), NAVY)
    d = ImageDraw.Draw(img)

    # Banda gradient top
    _draw_gradient_band(img.convert("RGBA"), 0, 8)
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, OG_W, 8], fill=INDIGO)
    d.rectangle([OG_W // 2, 0, OG_W, 8], fill=ROSE)

    # Logo / brand
    f_brand = _font(26, bold=True)
    d.text((48, 50), "DesarrollosMX", fill=CREAM, font=f_brand)

    # Eyebrow
    f_eyebrow = _font(18)
    eyebrow = "COMPARADOR · " + ("COLONIAS" if entity_type == "colonia" else "PROPIEDADES")
    d.text((48, 96), eyebrow, fill=(170, 170, 190), font=f_eyebrow)

    # Title
    f_title = _font(56, bold=True)
    title = " · ".join(names[:3])
    if len(title) > 36:
        title = title[:33] + "…"
    d.text((48, 150), title, fill=CREAM, font=f_title)

    # Cards 1..3
    n = len(names[:3])
    if n > 0:
        card_w = (OG_W - 96 - 24 * (n - 1)) // n
        card_top = 290
        card_h = 250
        for i, name in enumerate(names[:3]):
            x = 48 + i * (card_w + 24)
            d.rectangle([x, card_top, x + card_w, card_top + card_h],
                        fill=(13, 16, 23), outline=(99, 102, 241))
            f_idx = _font(18, bold=True)
            f_name = _font(34, bold=True)
            d.text((x + 18, card_top + 16), f"#{i + 1}", fill=INDIGO, font=f_idx)
            short = name if len(name) <= 18 else name[:17] + "…"
            d.text((x + 18, card_top + 50), short, fill=CREAM, font=f_name)
            f_kpi = _font(16)
            d.text((x + 18, card_top + card_h - 60), "Scores IE · Climate Twin",
                   fill=(170, 170, 190), font=f_kpi)
            d.text((x + 18, card_top + card_h - 36), "Riesgos · Desarrollos activos",
                   fill=(170, 170, 190), font=f_kpi)

    # Footer CTA
    f_cta = _font(20, bold=True)
    d.rectangle([48, OG_H - 70, 360, OG_H - 30], fill=INDIGO)
    d.rectangle([200, OG_H - 70, 360, OG_H - 30], fill=ROSE)
    d.text((68, OG_H - 64), "desarrollosmx.io/comparar", fill=CREAM, font=f_cta)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@router.get("/api/share/comparar/og-image")
async def share_compare_og_image(
    request: Request,
    ids: str = "",
    type: str = "colonia",
):
    """Genera og:image PNG dinámico. Cache 24h por hash(ids+type)."""
    if type not in ("colonia", "property"):
        raise HTTPException(status_code=400, detail="type inválido")
    id_list = [x.strip() for x in (ids or "").split(",") if x.strip()][:3]
    if not id_list:
        raise HTTPException(status_code=400, detail="ids requerido")

    cache_key = _ids_key(type, id_list)
    cache_path = os.path.join(OG_CACHE_DIR, f"{cache_key}.png")

    # Cache hit (24h)
    try:
        if os.path.exists(cache_path):
            import time as _t
            age = _t.time() - os.path.getmtime(cache_path)
            if age < 86400:
                with open(cache_path, "rb") as f:
                    return Response(content=f.read(), media_type="image/png",
                                    headers={"Cache-Control": "public, max-age=86400"})
    except Exception:
        pass

    # Resolver nombres
    names: list = []
    if type == "colonia":
        try:
            from data_seed import COLONIAS
            byid = {c["id"]: c for c in COLONIAS}
            for cid in id_list:
                c = byid.get(cid)
                names.append(c["name"] if c else cid)
        except Exception:
            names = id_list
    else:
        names = id_list

    try:
        png_bytes = _make_og_image(names, type)
    except Exception as ex:
        log.warning(f"[share_meta] og-image generation failed: {ex}")
        raise HTTPException(status_code=500, detail="Error generando og:image")

    # W4.2C — brand watermark
    try:
        from export_brand import add_watermark
        png_bytes = add_watermark(png_bytes)
    except Exception as wm_ex:
        log.warning(f"[share_meta] watermark failed (non-fatal): {wm_ex}")

    # Cache write
    try:
        with open(cache_path, "wb") as f:
            f.write(png_bytes)
    except Exception:
        pass

    return Response(content=png_bytes, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})


# ─── W4.2C — QR export endpoint ──────────────────────────────────────────────

@router.get("/api/exports/qr")
async def export_qr(url: str):
    """Generate a brand QR code PNG for any URL.

    Query param: url (required) — the URL to encode.
    Returns PNG image (200×200 approx) in DMX brand colors.
    """
    if not url:
        from fastapi import HTTPException as _HE
        raise _HE(status_code=400, detail="url parameter requerido")
    try:
        from export_brand import generate_qr
        qr_bytes = generate_qr(url)
    except Exception as e:
        log.warning(f"[share_meta] QR generation failed: {e}")
        from fastapi import HTTPException as _HE
        raise _HE(status_code=500, detail="Error generando QR")
    return Response(
        content=qr_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )
