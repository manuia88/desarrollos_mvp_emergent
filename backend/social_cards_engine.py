"""W5.16 — Social Cards Multi-platform Renderer.

3 layouts:
  og:    1200×630   (FB / LinkedIn / Twitter / WhatsApp / Telegram / iMessage / Discord / Slack)
  feed:  1080×1080  (IG / FB feed square)
  story: 1080×1920  (IG / TikTok / FB Stories / WA Status)

4 entity types: zone | property | development | asesor

Public API:
  compose_card(layout, entity_type, entity_data) → bytes (PNG)

Pipeline:
  - Pillow composes hero text + KPIs + brand gradient + optional Mapbox map
  - Mapbox Static fetched if entity_data has lat/lng (FAIL-SOFT)
  - QR code added on story layout (qrcode lib)
  - In-memory LRU cache 24h (max 1024 entries)
"""
from __future__ import annotations

import io
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import requests
from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger("dmx.social_cards_engine")

# ─── Brand palette (PIL tuples) ───────────────────────────────────────────────
CREAM = (240, 235, 224)
CREAM_2 = (217, 211, 199)
CREAM_3 = (160, 156, 144)
BG_DARK = (6, 8, 15)
BG_PANEL = (16, 20, 32)
INDIGO = (99, 102, 241)
PINK = (236, 72, 153)
PURPLE = (124, 58, 237)
GREEN = (34, 197, 94)
YELLOW = (234, 179, 8)
RED = (239, 68, 68)
LINE = (255, 255, 255)

# ─── Storage paths ────────────────────────────────────────────────────────────
STORAGE_BASE = Path(os.environ.get("SOCIAL_CARDS_STORAGE", "/app/backend/storage/social_cards"))


def ensure_social_cards_dir() -> Path:
    """Create storage dir if missing. Returns Path."""
    try:
        STORAGE_BASE.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        log.warning(f"[social_cards] storage dir create failed: {exc}")
    return STORAGE_BASE


# ─── Font helpers (Liberation TTF · matches brochure_renderer pattern) ───────
_LIB_DIR = "/usr/share/fonts/truetype/liberation/"
_FONT_MAP = {
    "bold":    _LIB_DIR + "LiberationSans-Bold.ttf",
    "regular": _LIB_DIR + "LiberationSans-Regular.ttf",
    "serif":   _LIB_DIR + "LiberationSerif-Bold.ttf",
}


def _pil_font(size: int, variant: str = "bold") -> ImageFont.FreeTypeFont:
    path = _FONT_MAP.get(variant)
    if path and Path(path).exists():
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font) -> Tuple[int, int]:
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        return draw.textlength(text, font=font), font.size if hasattr(font, "size") else 24


def _truncate(text: str, max_chars: int) -> str:
    if not text:
        return ""
    t = str(text)
    return t if len(t) <= max_chars else t[: max_chars - 1] + "…"


# ─── Mapbox Static fetch ─────────────────────────────────────────────────────
_MAPBOX_CACHE: Dict[str, Tuple[float, Optional[bytes]]] = {}
_MAPBOX_TTL_S = 3600  # 1h


def fetch_mapbox_static(
    lat: float,
    lng: float,
    zoom: int = 13,
    width: int = 1200,
    height: int = 630,
) -> Optional[bytes]:
    """Fetch a static map image from Mapbox dark-v11.

    Returns PNG bytes or None on failure. Caches result 1h in-memory.
    """
    token = os.environ.get("MAPBOX_TOKEN")
    if not token:
        return None

    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return None

    # Mapbox caps single requests at 1280×1280 · clamp
    w = max(120, min(int(width), 1280))
    h = max(120, min(int(height), 1280))
    cache_key = f"{lat:.4f}:{lng:.4f}:{zoom}:{w}x{h}"
    now = time.time()
    if cache_key in _MAPBOX_CACHE:
        ts, png = _MAPBOX_CACHE[cache_key]
        if now - ts < _MAPBOX_TTL_S:
            return png

    url = (
        f"https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/"
        f"{lng},{lat},{int(zoom)}/{w}x{h}@2x"
    )
    try:
        resp = requests.get(url, params={"access_token": token}, timeout=6)
        if resp.status_code == 200 and resp.content:
            png = resp.content
            _MAPBOX_CACHE[cache_key] = (now, png)
            return png
        log.warning(f"[social_cards] mapbox status={resp.status_code}")
    except Exception as exc:
        log.warning(f"[social_cards] mapbox fetch failed: {exc}")

    _MAPBOX_CACHE[cache_key] = (now, None)
    return None


# ─── Background composition ──────────────────────────────────────────────────
def _make_gradient(width: int, height: int, color_a, color_b) -> Image.Image:
    """Vertical gradient from color_a (top) to color_b (bottom)."""
    base = Image.new("RGB", (width, height), color_a)
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(color_a[0] * (1 - t) + color_b[0] * t)
        g = int(color_a[1] * (1 - t) + color_b[1] * t)
        b = int(color_a[2] * (1 - t) + color_b[2] * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return base


def _make_base_canvas(width: int, height: int, lat: Optional[float], lng: Optional[float]) -> Image.Image:
    """Base canvas: Mapbox crop if lat/lng + token · fallback gradient."""
    # Always start with gradient (used as fallback + as overlay base)
    canvas = _make_gradient(width, height, BG_DARK, BG_PANEL)

    if lat is None or lng is None:
        return canvas

    try:
        # Request map at 1280×1280 max · then crop/resize to fit
        req_w = min(width, 1280)
        req_h = min(height, 1280)
        map_png = fetch_mapbox_static(lat, lng, zoom=13, width=req_w, height=req_h)
        if not map_png:
            return canvas
        m = Image.open(io.BytesIO(map_png)).convert("RGB")
        # Resize map to canvas dims, preserving aspect via cover-fit
        m_w, m_h = m.size
        scale = max(width / m_w, height / m_h)
        new_w, new_h = int(m_w * scale), int(m_h * scale)
        m = m.resize((new_w, new_h), Image.LANCZOS)
        # Center-crop to canvas
        left = (new_w - width) // 2
        top = (new_h - height) // 2
        m = m.crop((left, top, left + width, top + height))

        # Darken overlay so text is readable
        overlay = Image.new("RGB", (width, height), BG_DARK)
        canvas = Image.blend(m, overlay, 0.55)
    except Exception as exc:
        log.warning(f"[social_cards] map compose failed: {exc}")
    return canvas


def _draw_gradient_bar(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
    """Brand gradient bar (indigo → pink) as 1-pixel-tall band of vertical lines."""
    for i in range(w):
        t = i / max(1, w - 1)
        r = int(INDIGO[0] * (1 - t) + PINK[0] * t)
        g = int(INDIGO[1] * (1 - t) + PINK[1] * t)
        b = int(INDIGO[2] * (1 - t) + PINK[2] * t)
        draw.line([(x + i, y), (x + i, y + h)], fill=(r, g, b))


def _draw_brand_signature(canvas: Image.Image, x: int, y: int, size: int = 22) -> None:
    """Brand mark 'DesarrollosMX' with gradient bar above."""
    draw = ImageDraw.Draw(canvas)
    bar_w = 56
    _draw_gradient_bar(draw, x, y, bar_w, 3)
    font = _pil_font(size, "bold")
    draw.text((x, y + 12), "DesarrollosMX", fill=CREAM, font=font)


def _draw_kpis_row(canvas: Image.Image, x: int, y: int, w: int, kpis: list) -> None:
    """Render a row of (label, value) KPI cards. Max 4 KPIs."""
    if not kpis:
        return
    kpis = kpis[:4]
    gap = 16
    card_w = (w - gap * (len(kpis) - 1)) // len(kpis) if len(kpis) > 1 else w
    card_h = 110
    draw = ImageDraw.Draw(canvas)
    label_font = _pil_font(18, "regular")
    value_font = _pil_font(40, "bold")
    for i, kpi in enumerate(kpis):
        cx = x + i * (card_w + gap)
        # Card bg (semi-transparent panel using a paste of darker rect)
        panel = Image.new("RGB", (card_w, card_h), BG_PANEL)
        canvas.paste(panel, (cx, y))
        # Border line
        d = ImageDraw.Draw(canvas)
        d.rectangle([cx, y, cx + card_w, y + card_h], outline=(60, 65, 80), width=2)
        # Label
        label = _truncate(str(kpi.get("label", "")).upper(), 16)
        d.text((cx + 16, y + 14), label, fill=CREAM_3, font=label_font)
        # Value
        value = _truncate(str(kpi.get("value", "—")), 14)
        color = kpi.get("color") or CREAM
        d.text((cx + 16, y + 46), value, fill=color, font=value_font)


def _draw_qr(canvas: Image.Image, url: str, x: int, y: int, size: int = 220) -> None:
    """Render a QR code at (x,y) sized `size` px. FAIL-SOFT."""
    try:
        import qrcode
        qr = qrcode.QRCode(box_size=10, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="white", back_color=(6, 8, 15))
        img = img.convert("RGB").resize((size, size), Image.LANCZOS)
        canvas.paste(img, (x, y))
    except Exception as exc:
        log.warning(f"[social_cards] qr render skipped: {exc}")


# ─── Layout renderers ─────────────────────────────────────────────────────────
def _render_layout(layout: str, entity_type: str, data: Dict[str, Any]) -> bytes:
    """Universal renderer · dispatched by layout (og/feed/story)."""
    title = str(data.get("title") or data.get("name") or data.get("slug") or "DesarrollosMX")
    subtitle = str(data.get("subtitle") or data.get("alcaldia") or _entity_subtitle(entity_type))
    kpis = data.get("kpis") or _default_kpis(entity_type, data)
    lat = data.get("lat")
    lng = data.get("lng")
    slug = str(data.get("slug") or "")

    if layout == "feed":
        w, h = 1080, 1080
    elif layout == "story":
        w, h = 1080, 1920
    else:
        w, h = 1200, 630  # og

    canvas = _make_base_canvas(w, h, lat, lng)
    draw = ImageDraw.Draw(canvas)

    # Top brand bar (gradient)
    _draw_gradient_bar(draw, 0, 0, w, 6)

    if layout == "og":
        # Horizontal layout · text left · brand bottom-right
        title_font = _pil_font(64, "bold")
        sub_font = _pil_font(28, "regular")
        # Wrap title to 2 lines
        title = _truncate(title, 36)
        draw.text((64, 96), title, fill=CREAM, font=title_font)
        draw.text((64, 188), _truncate(subtitle, 56), fill=CREAM_2, font=sub_font)
        # KPIs row near bottom
        _draw_kpis_row(canvas, 64, h - 230, w - 128, kpis)
        # Brand signature bottom-right
        _draw_brand_signature(canvas, w - 220, h - 60, size=22)
        # Footer URL tag (left)
        url_font = _pil_font(20, "regular")
        url_text = f"desarrollosmx.io/{entity_type}/{slug}" if slug else "desarrollosmx.io"
        draw.text((64, h - 40), _truncate(url_text, 56), fill=CREAM_3, font=url_font)

    elif layout == "feed":
        # Square · stacked vertical · centered
        title_font = _pil_font(80, "bold")
        sub_font = _pil_font(34, "regular")
        # Center hero
        title = _truncate(title, 24)
        tw, th = _text_size(draw, title, title_font)
        draw.text(((w - tw) // 2, 200), title, fill=CREAM, font=title_font)
        sub = _truncate(subtitle, 36)
        sw, _sh = _text_size(draw, sub, sub_font)
        draw.text(((w - sw) // 2, 320), sub, fill=CREAM_2, font=sub_font)
        # KPIs row center
        _draw_kpis_row(canvas, 80, 460, w - 160, kpis)
        # Brand signature bottom-center
        _draw_brand_signature(canvas, (w - 200) // 2, h - 120, size=24)

    else:  # story
        title_font = _pil_font(90, "bold")
        sub_font = _pil_font(40, "regular")
        # Hero block top-third
        title = _truncate(title, 22)
        tw, _th = _text_size(draw, title, title_font)
        draw.text(((w - tw) // 2, 280), title, fill=CREAM, font=title_font)
        sub = _truncate(subtitle, 32)
        sw, _sh = _text_size(draw, sub, sub_font)
        draw.text(((w - sw) // 2, 420), sub, fill=CREAM_2, font=sub_font)
        # KPIs in middle (vertical stack)
        _draw_kpis_row(canvas, 80, 720, w - 160, kpis[:2])
        # QR code center-bottom
        qr_size = 280
        share_url = f"https://desarrollosmx.io/{entity_type}/{slug}" if slug else "https://desarrollosmx.io"
        _draw_qr(canvas, share_url, (w - qr_size) // 2, h - 540, size=qr_size)
        # Brand signature below QR
        _draw_brand_signature(canvas, (w - 200) // 2, h - 200, size=26)

    # Serialize to PNG bytes
    out = io.BytesIO()
    canvas.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _entity_subtitle(entity_type: str) -> str:
    return {
        "zone": "Inteligencia inmobiliaria · CDMX",
        "property": "Valuación AVM · DesarrollosMX",
        "development": "Preventa verificada · DesarrollosMX",
        "asesor": "Asesor verificado DesarrollosMX",
    }.get(entity_type, "DesarrollosMX · Inteligencia inmobiliaria")


def _default_kpis(entity_type: str, data: Dict[str, Any]) -> list:
    """Build sensible defaults from entity_data when no explicit kpis provided."""
    kpis = []
    if entity_type == "zone":
        if data.get("ie_score_avg") is not None:
            kpis.append({"label": "Score IE", "value": f"{int(round(float(data['ie_score_avg'])))}"})
        if data.get("drpi_value") is not None:
            try:
                kpis.append({"label": "DRPI/m²", "value": f"${int(data['drpi_value']):,}"})
            except Exception:
                pass
        if data.get("total_devs_active") is not None:
            kpis.append({"label": "Desarrollos", "value": str(data["total_devs_active"])})
    elif entity_type == "development":
        if data.get("preventa_pct") is not None:
            kpis.append({"label": "Preventa", "value": f"{data['preventa_pct']}%"})
        if data.get("entrega") is not None:
            kpis.append({"label": "Entrega", "value": str(data["entrega"])})
        if data.get("desde_mxn") is not None:
            try:
                kpis.append({"label": "Desde", "value": f"${int(data['desde_mxn']):,}"})
            except Exception:
                pass
    elif entity_type == "property":
        if data.get("valor_mxn") is not None:
            try:
                kpis.append({"label": "Valor AVM", "value": f"${int(data['valor_mxn']):,}"})
            except Exception:
                pass
        if data.get("m2") is not None:
            kpis.append({"label": "m²", "value": str(data["m2"])})
    elif entity_type == "asesor":
        if data.get("rating") is not None:
            kpis.append({"label": "Rating", "value": f"{data['rating']:.1f} ⭐"})
        if data.get("ventas_anual") is not None:
            kpis.append({"label": "Ventas/año", "value": str(data["ventas_anual"])})
    return kpis


# ─── Fallback PNG (always available even if Pillow font missing) ──────────────
def _fallback_png(layout: str = "og") -> bytes:
    w, h = (1080, 1080) if layout == "feed" else (1080, 1920) if layout == "story" else (1200, 630)
    canvas = _make_gradient(w, h, BG_DARK, BG_PANEL)
    draw = ImageDraw.Draw(canvas)
    _draw_gradient_bar(draw, 0, 0, w, 6)
    font = _pil_font(48, "bold")
    text = "DesarrollosMX"
    tw, _th = _text_size(draw, text, font)
    draw.text(((w - tw) // 2, (h - 60) // 2), text, fill=CREAM, font=font)
    out = io.BytesIO()
    canvas.save(out, format="PNG", optimize=True)
    return out.getvalue()


# ─── Cache: in-memory LRU TTL 24h ────────────────────────────────────────────
_CACHE: Dict[str, Tuple[float, bytes]] = {}
_CACHE_TTL_S = 24 * 3600
_CACHE_MAX = 1024


def _cache_get(key: str) -> Optional[bytes]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, png = entry
    if time.time() - ts > _CACHE_TTL_S:
        _CACHE.pop(key, None)
        return None
    return png


def _cache_set(key: str, png: bytes) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        # Evict oldest 64 entries (LRU approximated by insertion order)
        for old_key in list(_CACHE.keys())[:64]:
            _CACHE.pop(old_key, None)
    _CACHE[key] = (time.time(), png)


def cache_stats() -> Dict[str, Any]:
    return {
        "entries": len(_CACHE),
        "max_entries": _CACHE_MAX,
        "ttl_seconds": _CACHE_TTL_S,
        "mapbox_cache_entries": len(_MAPBOX_CACHE),
    }


def cache_clear() -> None:
    _CACHE.clear()
    _MAPBOX_CACHE.clear()


# ─── Public API ──────────────────────────────────────────────────────────────
ALLOWED_LAYOUTS = {"og", "feed", "story"}
ALLOWED_ENTITY_TYPES = {"zone", "property", "development", "asesor"}


def compose_card(layout: str, entity_type: str, entity_data: Dict[str, Any]) -> bytes:
    """Render a social card. Returns PNG bytes. Fallback PNG on error."""
    layout = (layout or "").strip().lower()
    entity_type = (entity_type or "").strip().lower()
    if layout not in ALLOWED_LAYOUTS:
        layout = "og"
    if entity_type not in ALLOWED_ENTITY_TYPES:
        entity_type = "zone"

    slug = str(entity_data.get("slug") or entity_data.get("id") or "anon")
    cache_key = f"{layout}:{entity_type}:{slug}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        png = _render_layout(layout, entity_type, entity_data or {})
        if png and len(png) > 1000:
            _cache_set(cache_key, png)
            return png
    except Exception as exc:
        log.warning(f"[social_cards] compose failed layout={layout} entity={entity_type} slug={slug}: {exc}")

    return _fallback_png(layout)
