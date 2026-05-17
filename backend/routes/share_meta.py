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
    d.text((68, OG_H - 64), "desarrollosmx.com/comparar", fill=CREAM, font=f_cta)

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


# ─── W5.ASR.4 Parte 2 · CMA share meta + og:image ───────────────────────────

import time as _cma_time
from collections import OrderedDict as _CmaOD

# LRU in-memory cache para PNG bytes · max 200 · TTL 24h
_CMA_OG_CACHE: "_CmaOD[str, tuple]" = _CmaOD()
_CMA_OG_CACHE_MAX = 200
_CMA_OG_CACHE_TTL = 86400  # 24h

# Rate-limit público OG image 100/min/IP
_CMA_OG_RATE: dict = {}


def _check_cma_rate(ip: str, cap: int = 100, window_s: int = 60) -> bool:
    now = _cma_time.monotonic()
    bucket = _CMA_OG_RATE.setdefault(ip, [])
    pruned = [t for t in bucket if now - t < window_s]
    _CMA_OG_RATE[ip] = pruned
    if len(pruned) >= cap:
        return False
    pruned.append(now)
    return True


def _make_og_image_cma(cma: dict) -> bytes:
    """Genera OG image PNG 1200x630 para un CMA con gradient indigo→rose."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (OG_W, OG_H), NAVY)

    # Gradient background (suave indigo→rose en banda inferior)
    band = Image.new("RGBA", (OG_W, OG_H), (0, 0, 0, 0))
    band_draw = ImageDraw.Draw(band)
    for x in range(OG_W):
        ratio = x / OG_W
        r = int(INDIGO[0] * (1 - ratio) + ROSE[0] * ratio)
        g = int(INDIGO[1] * (1 - ratio) + ROSE[1] * ratio)
        b = int(INDIGO[2] * (1 - ratio) + ROSE[2] * ratio)
        band_draw.line([(x, 0), (x, 8)], fill=(r, g, b, 255))
    img = Image.alpha_composite(img.convert("RGBA"), band).convert("RGB")
    d = ImageDraw.Draw(img)

    # Brand top-left
    f_brand = _font(28, bold=True)
    d.text((48, 50), "DesarrollosMX", fill=CREAM, font=f_brand)

    # Eyebrow
    f_eyebrow = _font(18)
    d.text((48, 100), "ANÁLISIS COMPARATIVO DE MERCADO",
           fill=(170, 170, 190), font=f_eyebrow)

    # Estimated value GIGANTE centrado
    val = cma.get("estimated_value") or 0
    val_str = f"${val/1_000_000:.2f}M MXN" if val >= 1_000_000 else f"${int(val):,}".replace(",", " ")
    f_value = _font(96, bold=True)
    # Centra horizontalmente
    try:
        bbox = d.textbbox((0, 0), val_str, font=f_value)
        text_w = bbox[2] - bbox[0]
    except Exception:
        text_w = len(val_str) * 48
    d.text(((OG_W - text_w) // 2, 200), val_str, fill=CREAM, font=f_value)

    # Colonia name center subtitle
    subj = cma.get("subject_property") or {}
    colonia = subj.get("colonia_name") or subj.get("colonia_slug", "—")
    summary = f"{colonia.title()} · {subj.get('m2', '—')} m² · {subj.get('recamaras', '—')} rec"
    f_sub = _font(32)
    try:
        bbox = d.textbbox((0, 0), summary, font=f_sub)
        sub_w = bbox[2] - bbox[0]
    except Exception:
        sub_w = len(summary) * 16
    d.text(((OG_W - sub_w) // 2, 330), summary, fill=(200, 200, 215), font=f_sub)

    # Footer bottom-left: N comparables · confianza
    n_comp = len(cma.get("comparables") or [])
    conf = (cma.get("confidence") or "media").upper()
    f_meta = _font(22)
    d.text((48, OG_H - 80),
           f"{n_comp} comparables analizados  ·  Confianza {conf}",
           fill=CREAM, font=f_meta)

    # Forecast badge bottom-left line 2
    fc12 = cma.get("forecast_12m_pct")
    if fc12 is not None:
        fc_str = f"Proyección 12m: {fc12:+.1f}%"
        d.text((48, OG_H - 50), fc_str, fill=(170, 170, 190), font=f_meta)

    # Bottom-right CTA chip
    f_cta = _font(20, bold=True)
    d.rectangle([OG_W - 280, OG_H - 70, OG_W - 48, OG_H - 30], fill=INDIGO)
    d.rectangle([OG_W - 164, OG_H - 70, OG_W - 48, OG_H - 30], fill=ROSE)
    d.text((OG_W - 264, OG_H - 64), "desarrollosmx.io", fill=CREAM, font=f_cta)

    # Bottom gradient bar
    bar = Image.new("RGB", (OG_W, 4), NAVY)
    bd = ImageDraw.Draw(bar)
    for x in range(OG_W):
        ratio = x / OG_W
        r = int(INDIGO[0] * (1 - ratio) + ROSE[0] * ratio)
        g = int(INDIGO[1] * (1 - ratio) + ROSE[1] * ratio)
        b = int(INDIGO[2] * (1 - ratio) + ROSE[2] * ratio)
        bd.line([(x, 0), (x, 4)], fill=(r, g, b))
    img.paste(bar, (0, OG_H - 4))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@router.get("/api/share/cma/{cma_id}/og-image")
async def share_cma_og_image(cma_id: str, request: Request):
    """Genera OG image PNG 1200x630 para un CMA · cache 24h LRU · 100/min/IP."""
    ip = request.client.host if request.client else "unknown"
    if not _check_cma_rate(ip, cap=100, window_s=60):
        raise HTTPException(429, "Límite 100/min alcanzado")

    # Cache hit
    now = _cma_time.time()
    entry = _CMA_OG_CACHE.get(cma_id)
    if entry and (now - entry[1]) < _CMA_OG_CACHE_TTL:
        _CMA_OG_CACHE.move_to_end(cma_id)
        return Response(content=entry[0], media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400",
                                 "X-Cma-Cache": "hit"})

    # Generate
    db = _get_db(request)
    from cma_engine import get_cma
    cma = await get_cma(db, cma_id)
    if not cma:
        raise HTTPException(404, "CMA no encontrado")
    try:
        png_bytes = _make_og_image_cma(cma)
    except Exception as exc:
        log.exception(f"[share_meta] cma og-image failed · {exc}")
        raise HTTPException(500, "Error generando og:image")

    # Watermark best-effort
    try:
        from export_brand import add_watermark
        png_bytes = add_watermark(png_bytes)
    except Exception:
        pass

    # Persist en LRU
    _CMA_OG_CACHE[cma_id] = (png_bytes, now)
    _CMA_OG_CACHE.move_to_end(cma_id)
    while len(_CMA_OG_CACHE) > _CMA_OG_CACHE_MAX:
        _CMA_OG_CACHE.popitem(last=False)

    return Response(content=png_bytes, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400",
                             "X-Cma-Cache": "miss"})


@router.get("/api/share/cma/{cma_id}/meta")
async def share_cma_meta(cma_id: str, request: Request):
    """JSON meta para previews redes sociales (og + schema.org JSON-LD)."""
    db = _get_db(request)
    from cma_engine import get_cma
    cma = await get_cma(db, cma_id)
    if not cma:
        raise HTTPException(404, "CMA no encontrado")

    subj = cma.get("subject_property") or {}
    colonia = subj.get("colonia_name") or subj.get("colonia_slug", "—")
    val = cma.get("estimated_value") or 0
    val_str = f"${val/1_000_000:.2f}M MXN" if val >= 1_000_000 else f"${int(val):,}"
    n_comp = len(cma.get("comparables") or [])
    conf = (cma.get("confidence") or "media")

    backend_base = str(request.base_url).rstrip("/")
    og_image_url = f"{backend_base}/api/share/cma/{cma_id}/og-image"
    public_path = f"/cma-publico/{cma_id}"

    title = f"CMA {colonia} · {val_str} · DesarrollosMX"
    description = (
        f"Análisis comparativo de mercado: {subj.get('m2', '—')}m² en {colonia}. "
        f"{n_comp} comparables · confianza {conf}. Generado con DesarrollosMX."
    )

    jsonld = {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        "name": title[:120],
        "description": description[:300],
        "image": og_image_url,
        "url": f"{backend_base}{public_path}",
        "offers": {
            "@type": "Offer",
            "price": int(val) if val else None,
            "priceCurrency": "MXN",
            "availability": "https://schema.org/InStock",
        },
        "additionalProperty": [
            {"@type": "PropertyValue", "name": "m2", "value": subj.get("m2")},
            {"@type": "PropertyValue", "name": "recamaras", "value": subj.get("recamaras")},
            {"@type": "PropertyValue", "name": "banos", "value": subj.get("banos")},
        ],
    }
    return {
        "title": title[:120],
        "description": description[:300],
        "og_image_url": og_image_url,
        "share_url_path": public_path,
        "schema_org_jsonld": jsonld,
    }
