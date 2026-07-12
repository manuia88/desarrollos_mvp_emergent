"""W4.9 — Brochure Renderer (PDF + 4 social variants).

PDF: ReportLab 6-page A4 portrait (WeasyPrint not available in sandbox → ReportLab fallback).
Social: Pillow compositor for 4 formats.
"""
from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import qrcode

log = logging.getLogger("dmx.brochure_renderer")

# ─── Storage paths ───────────────────────────────────────────────────────────
STORAGE_BASE = Path(os.environ.get("BROCHURE_STORAGE_PATH", "/app/backend/storage/brochures"))
from fs_fallback import dir_or_tmp  # [AUD-008] fallback si /app no es escribible (local/CI)
PDF_DIR = dir_or_tmp(STORAGE_BASE / "pdf", "brochures/pdf")
SOCIAL_DIR = dir_or_tmp(STORAGE_BASE / "social", "brochures/social")

# ─── Colors ──────────────────────────────────────────────────────────────────
CREAM = HexColor("#F0EBE0")
BG_DARK = HexColor("#06080F")
INDIGO = HexColor("#6366F1")
ROSE = HexColor("#EC4899")
GRAY = HexColor("#6B7280")
WHITE = HexColor("#FFFFFF")
CREAM_PIL = (240, 235, 224)
BG_PIL = (6, 8, 15)
INDIGO_PIL = (99, 102, 241)
ROSE_PIL = (236, 72, 153)

# ─── Font registration ────────────────────────────────────────────────────────
_FONTS_REGISTERED = False

def _register_fonts():
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    try:
        LIB = Path("/usr/share/fonts/truetype/liberation")
        pdfmetrics.registerFont(TTFont("Body", str(LIB / "LiberationSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("Body-Bold", str(LIB / "LiberationSans-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("Display", str(LIB / "LiberationSerif-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("Display-Regular", str(LIB / "LiberationSerif-Regular.ttf")))
        _FONTS_REGISTERED = True
    except Exception as exc:
        # BUGFIX (auditoría 2026-07-12): Liberation TTF Linux-only → en macOS/otros el registro fallaba,
        # dejaba _FONTS_REGISTERED=False y setFont('Display') tronaba con KeyError → brochure daba 500.
        # Alias a fuentes NATIVAS de reportlab bajo los MISMOS nombres, así setFont SIEMPRE resuelve.
        log.warning(f"[renderer] TTF Liberation no disponibles, usando alias nativas: {exc}")
        try:
            pdfmetrics.registerFont(pdfmetrics.Font("Body", "Helvetica", "WinAnsiEncoding"))
            pdfmetrics.registerFont(pdfmetrics.Font("Body-Bold", "Helvetica-Bold", "WinAnsiEncoding"))
            pdfmetrics.registerFont(pdfmetrics.Font("Display", "Times-Bold", "WinAnsiEncoding"))
            pdfmetrics.registerFont(pdfmetrics.Font("Display-Regular", "Times-Roman", "WinAnsiEncoding"))
            _FONTS_REGISTERED = True
        except Exception as e2:
            log.warning(f"[renderer] alias fallback también falló: {e2}")


def _font_path(variant: str = "regular") -> Optional[str]:
    """Returns TTF path for Pillow."""
    LIB = "/usr/share/fonts/truetype/liberation/"
    mapping = {
        "bold": LIB + "LiberationSans-Bold.ttf",
        "regular": LIB + "LiberationSans-Regular.ttf",
        "serif_bold": LIB + "LiberationSerif-Bold.ttf",
        "serif": LIB + "LiberationSerif-Regular.ttf",
    }
    p = mapping.get(variant)
    return p if p and Path(p).exists() else None


def _pil_font(size: int, variant: str = "regular") -> ImageFont.FreeTypeFont:
    path = _font_path(variant)
    if path:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _fetch_image_pil(url: Optional[str], w: int = 800, h: int = 600) -> Optional[Image.Image]:
    """Fetch + resize image from URL. Returns None on failure."""
    if not url:
        return None
    try:
        from services.url_guard import assert_safe_url, UnsafeURLError  # anti-SSRF (fetch de URL del usuario)
        try:
            assert_safe_url(url, label="brochure_image")
        except UnsafeURLError:
            return None
        import requests
        resp = requests.get(url, timeout=8, stream=True)
        if resp.status_code == 200:
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            img = _resize_fill(img, w, h)
            return img
    except Exception as exc:
        log.debug(f"[renderer] fetch_image failed {url}: {exc}")
    return None


def _resize_fill(img: Image.Image, w: int, h: int) -> Image.Image:
    """Center-crop resize to fill exact dimensions."""
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


def _dark_placeholder(w: int, h: int, text: str = "Sin imagen") -> Image.Image:
    img = Image.new("RGB", (w, h), BG_PIL)
    d = ImageDraw.Draw(img)
    fnt = _pil_font(18, "regular")
    d.text((w // 2, h // 2), text, font=fnt, fill=CREAM_PIL, anchor="mm")
    return img


def _gradient_overlay_pil(img: Image.Image, direction: str = "bottom", alpha: int = 180) -> Image.Image:
    """Apply gradient overlay (dark→transparent for hero readability)."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    w, h = img.size
    steps = 60
    if direction == "bottom":
        for i in range(steps):
            a = int(alpha * (i / steps) ** 0.7)
            y = h - int(h * (i + 1) / steps)
            d.rectangle([0, y, w, h], fill=(0, 0, 0, a))
    elif direction == "full":
        overlay = Image.new("RGBA", img.size, (0, 0, 0, alpha))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def _draw_gradient_bar_pil(draw: ImageDraw.Draw, x0: int, y0: int, x1: int, y1: int):
    """Draw indigo→rose gradient horizontal bar."""
    w = x1 - x0
    for i in range(w):
        t = i / max(w - 1, 1)
        r = int(INDIGO_PIL[0] + t * (ROSE_PIL[0] - INDIGO_PIL[0]))
        g = int(INDIGO_PIL[1] + t * (ROSE_PIL[1] - INDIGO_PIL[1]))
        b = int(INDIGO_PIL[2] + t * (ROSE_PIL[2] - INDIGO_PIL[2]))
        draw.line([(x0 + i, y0), (x0 + i, y1)], fill=(r, g, b))


def _generate_qr(url: str, size: int = 200) -> Image.Image:
    qr = qrcode.QRCode(box_size=4, border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=BG_PIL, back_color=CREAM_PIL).convert("RGB")
    return img.resize((size, size), Image.LANCZOS)


def _fmt_price(price: Optional[float]) -> str:
    if not price:
        return "Consultar"
    if price >= 1_000_000:
        return f"${price / 1_000_000:.1f}M MXN"
    return f"${price:,.0f} MXN"


# ─── ReportLab PDF helpers ─────────────────────────────────────────────────────

def _rl_fetch_image(url: Optional[str]) -> Optional[ImageReader]:
    if not url:
        return None
    try:
        from services.url_guard import assert_safe_url, UnsafeURLError  # anti-SSRF (fetch de URL del usuario)
        try:
            assert_safe_url(url, label="brochure_image_rl")
        except UnsafeURLError:
            return None
        import requests
        r = requests.get(url, timeout=8)
        if r.status_code == 200:
            return ImageReader(io.BytesIO(r.content))
    except Exception:
        pass
    return None


def _rl_gradient_rect(c: canvas.Canvas, x: float, y: float, w: float, h: float, steps: int = 40):
    """Draw indigo→rose gradient rect in ReportLab."""
    step_w = w / steps
    for i in range(steps):
        t = i / (steps - 1)
        r_c = int(99 + t * (236 - 99)) / 255
        g_c = int(102 + t * (72 - 102)) / 255
        b_c = int(241 + t * (153 - 241)) / 255
        c.setFillColor(Color(r_c, g_c, b_c))
        c.rect(x + i * step_w, y, step_w + 1, h, fill=1, stroke=0)


# ─── PDF: 6-page brochure ─────────────────────────────────────────────────────

def render_brochure_pdf(
    project: Dict[str, Any],
    branding: Dict[str, Any],
    brochure_id: str,
) -> str:
    """
    Genera PDF A4 portrait 6 páginas con ReportLab.
    Returns path to saved PDF.
    """
    _register_fonts()
    out_path = str(PDF_DIR / f"{brochure_id}.pdf")

    W, H = A4  # 595.28 x 841.89 pts
    MARGIN = 15 * mm
    IW = W - 2 * MARGIN  # inner width

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Pre-fetch images
    hero_img = _rl_fetch_image(project.get("hero_photo_url") or
                                (project.get("gallery_photos", [None])[0] if project.get("gallery_photos") else None))
    logo_img = _rl_fetch_image(branding.get("logo"))
    floor_img = _rl_fetch_image(project.get("floor_plan_url"))
    brand_logo_img = _rl_fetch_image(branding.get("logo"))

    # ── PAGE 1: Cover ──
    c.setFillColor(HexColor("#0d1017"))
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Hero photo full-bleed
    if hero_img:
        try:
            c.drawImage(hero_img, 0, 0, W, H, preserveAspectRatio=False, mask="auto")
            # Dark overlay bottom 60%
            c.setFillColorRGB(0, 0, 0, alpha=0.55)
            c.rect(0, 0, W, H * 0.65, fill=1, stroke=0)
        except Exception:
            pass

    # Gradient bar at top
    _rl_gradient_rect(c, 0, H - 4, W, 4)

    # Branding logo top-right
    if brand_logo_img:
        try:
            c.drawImage(brand_logo_img, W - MARGIN - 80, H - MARGIN - 30, 80, 30, mask="auto")
        except Exception:
            pass

    # Project name
    name = project.get("name") or "Proyecto"
    zone = project.get("zone_id") or project.get("colonia") or ""
    c.setFont("Display", 32)
    c.setFillColor(CREAM)
    c.drawString(MARGIN, 200, name[:40])
    c.setFont("Body", 14)
    c.setFillColor(HexColor("#a0a4b0"))
    if zone:
        c.drawString(MARGIN, 178, zone.replace("-", " ").title())

    # Status badge
    status = project.get("status", "")
    if status:
        c.setFillColor(INDIGO)
        c.roundRect(MARGIN, 148, 70, 18, 9, fill=1, stroke=0)
        c.setFont("Body-Bold", 8)
        c.setFillColor(WHITE)
        c.drawCentredString(MARGIN + 35, 153, status[:15].upper())

    # Footer disclaimer
    c.setFont("Body", 7)
    c.setFillColor(HexColor("#6b7280"))
    footer_txt = branding.get("footer_text", "© DesarrollosMX")
    c.drawString(MARGIN, 20, footer_txt[:80])
    c.drawRightString(W - MARGIN, 20, "Generado por DesarrollosMX · Solo uso informativo")

    c.showPage()

    # ── PAGE 2: Specs ──
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)

    c.setFont("Display", 22)
    c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Especificaciones del proyecto")
    c.setFillColor(GRAY)
    c.rect(MARGIN, H - MARGIN - 35, IW, 1, fill=1, stroke=0)

    specs = [
        ("Superficie", f"{project.get('m2_from', '—')} – {project.get('m2_to', '—')} m²"),
        ("Recámaras", str(project.get("bedrooms_from", "—"))),
        ("Baños", str(project.get("bathrooms_from", "—"))),
        ("Estacionamientos", str(project.get("parking_spots", "—"))),
        ("Año de entrega", str(project.get("delivery_year") or project.get("delivery_date", "—"))[:10]),
        ("Status", (project.get("status") or "—").title()),
        ("Precio desde", _fmt_price(project.get("price_from"))),
        ("Precio hasta", _fmt_price(project.get("price_to")) if project.get("price_to") else "Consultar"),
        ("Precio / m²", _fmt_price(project.get("price_per_m2") or
                                    (project.get("price_from", 0) / max(project.get("m2_from", 80), 1) if project.get("price_from") else None))),
        ("Tipo", (project.get("property_type") or "Departamento").title()),
    ]
    col_w = IW / 2 - 5
    for i, (label, value) in enumerate(specs):
        col = i % 2
        row = i // 2
        bx = MARGIN + col * (col_w + 10)
        by = H - MARGIN - 70 - row * 55
        c.setFillColor(HexColor("#f5f0e8"))
        c.roundRect(bx, by - 30, col_w, 45, 5, fill=1, stroke=0)
        c.setFont("Body", 8)
        c.setFillColor(GRAY)
        c.drawString(bx + 10, by + 6, label.upper())
        c.setFont("Body-Bold", 13)
        c.setFillColor(BG_DARK)
        c.drawString(bx + 10, by - 14, str(value)[:30])

    # Contact info
    cy = MARGIN + 30
    c.setFont("Body-Bold", 10)
    c.setFillColor(BG_DARK)
    c.drawString(MARGIN, cy, f"Contacto: {branding.get('contact_name', '')} · {branding.get('contact_email', '')} · {branding.get('contact_phone', '')}"[:80])
    c.showPage()

    # ── PAGE 3: Plano + Amenities ──
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)

    c.setFont("Display", 22)
    c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Plano y amenidades")

    # Floor plan
    left_w = IW * 0.55
    if floor_img:
        try:
            c.drawImage(floor_img, MARGIN, H - MARGIN - 60 - 320, left_w, 320, preserveAspectRatio=True, mask="auto")
        except Exception:
            c.setFillColor(HexColor("#e5e0d8"))
            c.roundRect(MARGIN, H - MARGIN - 60 - 320, left_w, 320, 8, fill=1, stroke=0)
            c.setFont("Body", 10)
            c.setFillColor(GRAY)
            c.drawCentredString(MARGIN + left_w / 2, H - MARGIN - 60 - 160, "Plano disponible bajo solicitud")
    else:
        c.setFillColor(HexColor("#e5e0d8"))
        c.roundRect(MARGIN, H - MARGIN - 60 - 320, left_w, 320, 8, fill=1, stroke=0)
        c.setFont("Body", 10)
        c.setFillColor(GRAY)
        c.drawCentredString(MARGIN + left_w / 2, H - MARGIN - 60 - 160, "Plano disponible bajo solicitud")

    # Amenities list right
    amenities = project.get("amenities", [])[:12]
    ax = MARGIN + left_w + 12
    aw = IW - left_w - 12
    c.setFont("Body-Bold", 11)
    c.setFillColor(BG_DARK)
    c.drawString(ax, H - MARGIN - 60, "Amenidades")
    for j, am in enumerate(amenities):
        ay = H - MARGIN - 80 - j * 22
        c.setFillColor(INDIGO)
        c.circle(ax + 5, ay + 4, 3, fill=1, stroke=0)
        c.setFont("Body", 9)
        c.setFillColor(BG_DARK)
        c.drawString(ax + 14, ay, str(am)[:28])
    if not amenities:
        c.setFont("Body", 9)
        c.setFillColor(GRAY)
        c.drawString(ax, H - MARGIN - 85, "Ver amenidades en portal")

    c.showPage()

    # ── PAGE 4: Zone Score ──
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)

    c.setFont("Display", 22)
    c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Calidad de zona")
    c.setFillColor(GRAY)
    c.setFont("Body", 10)
    c.drawString(MARGIN, H - MARGIN - 50, "Zone Score DMX — índice de plusvalía y calidad de vida")

    zone_score = project.get("_zone_score") or {}
    tier = zone_score.get("tier", "B")
    score_total = zone_score.get("score_total", 72)
    tier_color = {"A": INDIGO, "B": HexColor("#22D3EE"), "C": HexColor("#10B981"),
                  "D": HexColor("#F59E0B"), "F": HexColor("#EF4444")}.get(tier, INDIGO)

    # Tier badge
    _rl_gradient_rect(c, MARGIN, H - MARGIN - 140, 60, 60)
    c.setFont("Display", 28)
    c.setFillColor(WHITE)
    c.drawCentredString(MARGIN + 30, H - MARGIN - 118, tier)
    c.setFont("Body-Bold", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(MARGIN + 30, H - MARGIN - 148, "TIER")

    # Score number
    c.setFont("Display", 48)
    c.setFillColor(BG_DARK)
    c.drawString(MARGIN + 80, H - MARGIN - 130, f"{score_total:.0f}")
    c.setFont("Body", 10)
    c.setFillColor(GRAY)
    c.drawString(MARGIN + 80, H - MARGIN - 145, "/100 · Score de plusvalía")

    # Axis scores radar-style (horizontal bars)
    axes = [
        ("Lifestyle", zone_score.get("score_lifestyle") or zone_score.get("lifestyle", 70)),
        ("Seguridad", zone_score.get("score_seguridad") or zone_score.get("safety", 65)),
        ("Transporte", zone_score.get("score_transporte") or zone_score.get("transit", 60)),
        ("Amenidades", zone_score.get("score_amenidades") or zone_score.get("amenidades", 75)),
        ("Precio/m²", zone_score.get("score_precio") or zone_score.get("price", 55)),
        ("Vibe urbano", zone_score.get("score_vibe") or zone_score.get("vibe", 68)),
    ]
    by_start = H - MARGIN - 200
    bar_max_w = IW * 0.55
    for k, (axis_name, axis_val) in enumerate(axes):
        by = by_start - k * 38
        c.setFont("Body", 9)
        c.setFillColor(BG_DARK)
        c.drawString(MARGIN, by, axis_name)
        # Background bar
        c.setFillColor(HexColor("#e5e0d8"))
        c.roundRect(MARGIN + 100, by - 4, bar_max_w, 14, 7, fill=1, stroke=0)
        # Value bar
        val_pct = min(float(axis_val or 0) / 100, 1.0)
        _rl_gradient_rect(c, MARGIN + 100, by - 4, int(bar_max_w * val_pct), 14)
        c.setFont("Body-Bold", 8)
        c.setFillColor(BG_DARK)
        c.drawString(MARGIN + 110 + bar_max_w, by, f"{float(axis_val or 0):.0f}")

    c.showPage()

    # ── PAGE 5: Comparables ──
    comparables = project.get("_comparables", [])[:3]
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)
    c.setFont("Display", 22)
    c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Proyectos comparables")
    c.setFont("Body", 10)
    c.setFillColor(GRAY)
    c.drawString(MARGIN, H - MARGIN - 50, "Análisis de mercado · misma zona · precio similar")

    if not comparables:
        c.setFont("Body", 11)
        c.setFillColor(GRAY)
        c.drawCentredString(W / 2, H / 2, "Comparables no disponibles para esta zona")
    else:
        card_h = 100
        for k, comp in enumerate(comparables):
            bx = MARGIN
            by = H - MARGIN - 90 - k * (card_h + 15)
            c.setFillColor(HexColor("#f5f0e8"))
            c.roundRect(bx, by, IW, card_h, 8, fill=1, stroke=0)
            c.setFont("Body-Bold", 12)
            c.setFillColor(BG_DARK)
            c.drawString(bx + 12, by + card_h - 20, str(comp.get("name", "—"))[:40])
            detail = f"  {comp.get('zone_id', '')}  ·  {_fmt_price(comp.get('price_from'))}  ·  {comp.get('price_m2', '—')} $/m²"
            c.setFont("Body", 9)
            c.setFillColor(GRAY)
            c.drawString(bx + 12, by + card_h - 38, detail[:70])
            # Days in market
            dom = comp.get("days_in_market") or comp.get("dom")
            if dom:
                c.setFont("Body", 8)
                c.setFillColor(INDIGO)
                c.drawString(bx + 12, by + card_h - 54, f"{dom} días en mercado")

    c.showPage()

    # ── PAGE 6: CTA + QR ──
    _rl_gradient_rect(c, 0, 0, W, H, steps=60)
    c.setFillColor(WHITE)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(HexColor("#0d1017"))
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Top gradient stripe
    _rl_gradient_rect(c, 0, H - 6, W, 6)

    # Contact block
    c.setFont("Display", 26)
    c.setFillColor(CREAM)
    c.drawCentredString(W / 2, H - MARGIN - 60, "¿Te interesa este proyecto?")
    c.setFont("Body", 14)
    c.setFillColor(HexColor("#a0a4b0"))
    c.drawCentredString(W / 2, H - MARGIN - 85, "Habla con nosotros, sin compromiso")

    # Contact info card
    card_y = H / 2 - 50
    c.setFillColor(HexColor("#161b25"))
    c.roundRect(MARGIN + 20, card_y, IW - 40, 130, 12, fill=1, stroke=0)
    c.setFont("Body-Bold", 12)
    c.setFillColor(CREAM)
    contact_name = branding.get("contact_name") or "DesarrollosMX"
    c.drawCentredString(W / 2, card_y + 100, contact_name[:40])
    c.setFont("Body", 10)
    c.setFillColor(HexColor("#a0a4b0"))
    items = []
    if branding.get("contact_email"):
        items.append(branding["contact_email"])
    if branding.get("contact_phone"):
        items.append(branding["contact_phone"])
    for ki, item in enumerate(items[:2]):
        c.drawCentredString(W / 2, card_y + 75 - ki * 22, item[:50])

    # QR Code
    wa_url = f"https://wa.me/?text=Hola, vi el brochure de {project.get('name', 'este proyecto')} y quiero más info"
    try:
        qr_img = _generate_qr(wa_url, size=100)
        qr_buf = io.BytesIO()
        qr_img.save(qr_buf, "PNG")
        qr_buf.seek(0)
        c.drawImage(ImageReader(qr_buf), W / 2 - 50, card_y - 130, 100, 100, mask="auto")
        c.setFont("Body", 8)
        c.setFillColor(GRAY)
        c.drawCentredString(W / 2, card_y - 140, "Escanea para contactar por WhatsApp")
    except Exception as exc:
        log.debug(f"[renderer] QR failed: {exc}")

    # Footer
    _rl_gradient_rect(c, 0, 0, W, 4)
    c.setFont("Body", 7)
    c.setFillColor(HexColor("#6b7280"))
    footer = branding.get("footer_text", "© DesarrollosMX")
    c.drawString(MARGIN, 10, footer[:80])
    dmx_txt = "DesarrollosMX · Inteligencia Inmobiliaria CDMX"
    if branding.get("variant") != "dmx_neutral":
        c.drawRightString(W - MARGIN, 10, dmx_txt)

    c.showPage()
    c.save()

    # Write to disk
    buf.seek(0)
    with open(out_path, "wb") as f:
        f.write(buf.read())

    log.info(f"[renderer] PDF saved: {out_path} ({Path(out_path).stat().st_size} bytes)")
    return out_path


# ─── Social variant renderer ─────────────────────────────────────────────────

_SOCIAL_SPECS = {
    "fb_feed":    (1200, 630),
    "ig_feed":    (1080, 1080),
    "ig_stories": (1080, 1920),
    "wa_status":  (1080, 1920),
}


def render_social_variant(
    project: Dict[str, Any],
    branding: Dict[str, Any],
    variant_format: str,
    brochure_id: str,
) -> str:
    """
    Genera PNG de variante social con Pillow.
    Returns path to PNG file.
    """
    sw, sh = _SOCIAL_SPECS.get(variant_format, (1080, 1080))
    out_dir = SOCIAL_DIR / brochure_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(out_dir / f"{variant_format}.png")

    # Hero base
    hero_pil = _fetch_image_pil(
        project.get("hero_photo_url") or
        (project.get("gallery_photos", [None])[0] if project.get("gallery_photos") else None),
        sw, sh,
    )
    if not hero_pil:
        hero_pil = _dark_placeholder(sw, sh, project.get("name", "DMX Proyecto"))

    # Apply gradient overlay
    hero_pil = _gradient_overlay_pil(hero_pil, "full" if variant_format in ("ig_stories", "wa_status") else "bottom", 150)
    canvas_img = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    canvas_img.paste(hero_pil.convert("RGBA"), (0, 0))
    draw = ImageDraw.Draw(canvas_img)

    name = project.get("name") or "Proyecto"
    price_str = _fmt_price(project.get("price_from"))
    m2_str = f"{project.get('m2_from', '—')} m²"
    beds_str = f"{project.get('bedrooms_from', '—')} rec."
    zone = (project.get("zone_id") or "").replace("-", " ").title()

    if variant_format == "fb_feed":
        # 1200×630 — bottom section with specs
        panel_h = 180
        draw.rectangle([0, sh - panel_h, sw, sh], fill=(13, 16, 23, 220))
        _draw_gradient_bar_pil(draw, 0, sh - panel_h, sw, sh - panel_h + 3)

        fnt_title = _pil_font(38, "serif_bold")
        fnt_sub = _pil_font(20, "regular")
        fnt_spec = _pil_font(18, "bold")

        draw.text((40, sh - panel_h + 12), name[:45], font=fnt_title, fill=CREAM_PIL)
        draw.text((40, sh - panel_h + 60), zone, font=fnt_sub, fill=(160, 164, 176))
        specs_y = sh - panel_h + 100
        for i, s in enumerate([m2_str, beds_str, price_str]):
            draw.text((40 + i * 240, specs_y), s, font=fnt_spec, fill=CREAM_PIL)

        # Branding logo top-right placeholder
        _draw_gradient_bar_pil(draw, 0, 0, sw, 4)
        draw.text((sw - 260, 12), branding.get("contact_name", "DMX")[:30], font=fnt_sub, fill=CREAM_PIL)

    elif variant_format == "ig_feed":
        # 1080×1080 — top half hero + bottom panel
        panel_y = sh // 2
        draw.rectangle([0, panel_y, sw, sh], fill=(13, 16, 23, 240))
        _draw_gradient_bar_pil(draw, 0, panel_y, sw, panel_y + 4)

        fnt_title = _pil_font(42, "serif_bold")
        fnt_sub = _pil_font(22, "regular")
        fnt_spec = _pil_font(20, "bold")

        draw.text((40, panel_y + 20), name[:35], font=fnt_title, fill=CREAM_PIL)
        draw.text((40, panel_y + 80), zone, font=fnt_sub, fill=(160, 164, 176))
        draw.text((40, panel_y + 120), f"{m2_str}  ·  {beds_str}", font=fnt_spec, fill=CREAM_PIL)
        draw.text((40, panel_y + 160), price_str, font=fnt_spec, fill=tuple(INDIGO_PIL))
        # CTA bar bottom
        _draw_gradient_bar_pil(draw, 0, sh - 60, sw, sh)
        cta_fnt = _pil_font(22, "bold")
        draw.text((sw // 2 - 80, sh - 42), "Más información", font=cta_fnt, fill=(255, 255, 255))

        # Logo top-right
        _draw_gradient_bar_pil(draw, 0, 0, sw, 5)

    elif variant_format in ("ig_stories", "wa_status"):
        # 1080×1920 vertical
        # Safe zone top
        _draw_gradient_bar_pil(draw, 0, 0, sw, 6)
        fnt_safe = _pil_font(30, "bold")
        draw.text((50, 30), branding.get("contact_name", "DesarrollosMX")[:35], font=fnt_safe, fill=CREAM_PIL)

        # Project name center-top
        fnt_title = _pil_font(52, "serif_bold")
        fnt_sub = _pil_font(26, "regular")
        fnt_spec = _pil_font(24, "bold")

        # Semi-transparent card center
        card_y = sh // 3
        card_h = 380
        card_overlay = Image.new("RGBA", (sw - 80, card_h), (13, 16, 23, 200))
        canvas_img.paste(card_overlay, (40, card_y), card_overlay)
        draw = ImageDraw.Draw(canvas_img)

        draw.text((80, card_y + 20), name[:30], font=fnt_title, fill=CREAM_PIL)
        draw.text((80, card_y + 90), zone, font=fnt_sub, fill=(160, 164, 176))
        draw.text((80, card_y + 140), m2_str, font=fnt_spec, fill=CREAM_PIL)
        draw.text((80, card_y + 190), beds_str, font=fnt_spec, fill=CREAM_PIL)
        draw.text((80, card_y + 240), price_str, font=fnt_spec, fill=tuple(INDIGO_PIL))

        # CTA bottom safe zone
        cta_y = sh - 200
        cta_txt = "Contacto WhatsApp" if variant_format == "wa_status" else "Desliza para más"
        _draw_gradient_bar_pil(draw, 0, cta_y - 4, sw, cta_y - 1)
        draw.rectangle([80, cta_y + 10, sw - 80, cta_y + 80], fill=(*INDIGO_PIL, 230))
        cta_fnt = _pil_font(30, "bold")
        draw.text((sw // 2 - 100, cta_y + 20), cta_txt, font=cta_fnt, fill=(255, 255, 255))
        _draw_gradient_bar_pil(draw, 0, sh - 6, sw, sh)

    # Save optimized PNG
    final = canvas_img.convert("RGB")
    # Optimize: scale down if too big
    if final.width * final.height > 1500000:
        scale = (1500000 / (final.width * final.height)) ** 0.5
        final = final.resize((int(final.width * scale), int(final.height * scale)), Image.LANCZOS)

    final.save(out_path, "PNG", optimize=True, quality=85)
    log.info(f"[renderer] {variant_format} saved: {out_path} ({Path(out_path).stat().st_size} bytes)")
    return out_path


def render_all_social(project: Dict[str, Any], branding: Dict[str, Any], brochure_id: str) -> Dict[str, str]:
    """Genera los 4 formatos. Returns {variant: path}."""
    paths = {}
    for fmt in ("fb_feed", "ig_feed", "ig_stories", "wa_status"):
        try:
            paths[fmt] = render_social_variant(project, branding, fmt, brochure_id)
        except Exception as exc:
            log.warning(f"[renderer] {fmt} failed: {exc}")
            paths[fmt] = ""
    return paths
