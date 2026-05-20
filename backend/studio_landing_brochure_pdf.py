"""W5.22 Z.8.5 — Brochure PDF reportlab para property landings.

A4 4-6 pages:
  1. Cover: hero + brand kit + property name
  2. Property data: price · m2 · entrega · stage · units
  3. Amenidades grid
  4. Mapa + ubicacion (placeholder image)
  5. Lead form info + QR code lead capture
  6. Footer: asesor info + disclaimer

Reusa reportlab pattern de Z.2 (studio_carrusel_engine genera PDFs ya).
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.studio_landing_brochure")


def _safe_str(v: Any, limit: int = 200) -> str:
    if v is None:
        return ""
    return str(v)[:limit]


def render_landing_brochure(landing: Dict[str, Any], brand_kit: Optional[Dict[str, Any]] = None) -> bytes:
    """Genera PDF brochure desde landing data. Returns bytes."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.colors import HexColor, white, black
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas as rl_canvas
    except Exception as exc:
        log.warning(f"[brochure_pdf] reportlab not available: {exc}")
        return _minimal_fallback(landing)

    buffer = io.BytesIO()
    c = rl_canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    bk = brand_kit or {}
    primary = bk.get("color_primary") or "#6366F1"
    secondary = bk.get("color_secondary") or "#EC4899"
    try:
        primary_color = HexColor(primary)
    except Exception:
        primary_color = HexColor("#6366F1")
    try:
        secondary_color = HexColor(secondary)
    except Exception:
        secondary_color = HexColor("#EC4899")

    le = landing.get("linked_entity") or {}
    content = landing.get("content") or {}
    hero_section = next((s for s in (landing.get("sections") or []) if s.get("type") == "hero"), None)
    title = (hero_section or {}).get("config", {}).get("headline") or le.get("name") or content.get("hero", {}).get("title") or "DMX Landing"
    subtitle = (hero_section or {}).get("config", {}).get("subhead") or content.get("hero", {}).get("subtitle") or ""

    # ── Page 1: COVER ────────────────────────────────────────────────────────
    c.setFillColor(HexColor("#0A0A0A"))
    c.rect(0, 0, width, height, fill=1, stroke=0)
    # Gradient stripe
    c.setFillColor(primary_color)
    c.rect(0, height - 8 * mm, width, 8 * mm, fill=1, stroke=0)
    # Brand
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 12)
    brand_name = (bk.get("brand_name") or "DesarrollosMX").upper()
    c.drawString(20 * mm, height - 20 * mm, brand_name)
    # Title
    c.setFont("Helvetica-Bold", 28)
    c.drawString(20 * mm, height / 2 + 20 * mm, _safe_str(title, 60))
    # Subtitle
    c.setFont("Helvetica", 14)
    c.setFillColor(HexColor("#a0a4b0"))
    _wrap_text(c, _safe_str(subtitle, 180), 20 * mm, height / 2, max_width=width - 40 * mm, line_height=18, font="Helvetica", size=14)
    # Price chip
    if le.get("price_from"):
        c.setFillColor(secondary_color)
        c.roundRect(20 * mm, 30 * mm, 70 * mm, 15 * mm, 8, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(55 * mm, 36 * mm, f"Desde ${le['price_from']:,}")
    # Footer
    c.setFillColor(HexColor("#666"))
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, 12 * mm, f"Brochure generado por {brand_name} · /landing/{landing.get('slug', '')}")
    c.showPage()

    # ── Page 2: PROPERTY DATA ────────────────────────────────────────────────
    c.setFillColor(white)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColor(primary_color)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, height - 20 * mm, "DATOS DE LA PROPIEDAD")
    c.setStrokeColor(primary_color)
    c.line(20 * mm, height - 22 * mm, width - 20 * mm, height - 22 * mm)
    y = height - 32 * mm
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, y, _safe_str(le.get("name") or title, 50))
    y -= 8 * mm
    c.setFont("Helvetica", 11)
    c.setFillColor(HexColor("#555"))
    c.drawString(20 * mm, y, _safe_str(f"{le.get('colonia', '')} · {le.get('alcaldia', '')}", 80))
    y -= 16 * mm
    rows = [
        ("Precio desde", f"${le.get('price_from', 0):,}" if le.get('price_from') else "TBD"),
        ("Entrega", _safe_str(le.get("delivery_estimate") or "TBD", 30)),
        ("Stage", _safe_str(le.get("stage") or "TBD", 30)),
        ("Unidades", f"{le.get('units_available', '?')} / {le.get('units_total', '?')}"),
        ("M2 range", _safe_str(le.get("m2_range") or "TBD", 30)),
        ("Recamaras", _safe_str(le.get("bedrooms_range") or "TBD", 30)),
    ]
    for label, val in rows:
        c.setFillColor(HexColor("#999"))
        c.setFont("Helvetica", 9)
        c.drawString(20 * mm, y, label.upper())
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(20 * mm, y - 5 * mm, _safe_str(val, 40))
        y -= 12 * mm
    c.showPage()

    # ── Page 3: AMENIDADES ───────────────────────────────────────────────────
    c.setFillColor(white)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColor(primary_color)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, height - 20 * mm, "AMENIDADES")
    c.line(20 * mm, height - 22 * mm, width - 20 * mm, height - 22 * mm)
    amenities = (le.get("amenities") or [])[:12]
    cols = 2
    col_w = (width - 60 * mm) / cols
    y_base = height - 32 * mm
    for i, am in enumerate(amenities):
        col = i % cols
        row = i // cols
        x = 20 * mm + col * (col_w + 10 * mm)
        y = y_base - row * 18 * mm
        c.setFillColor(secondary_color)
        c.circle(x + 3 * mm, y + 1.5 * mm, 2 * mm, fill=1, stroke=0)
        c.setFillColor(black)
        c.setFont("Helvetica", 11)
        c.drawString(x + 9 * mm, y, _safe_str(am, 60))
    c.showPage()

    # ── Page 4: LEAD CAPTURE INFO + QR ───────────────────────────────────────
    c.setFillColor(white)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColor(primary_color)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, height - 20 * mm, "AGENDA TU VISITA")
    c.line(20 * mm, height - 22 * mm, width - 20 * mm, height - 22 * mm)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, height - 40 * mm, "Hablemos.")
    c.setFont("Helvetica", 12)
    c.setFillColor(HexColor("#555"))
    msg = "Escanea el QR o visita el link · te contactamos en menos de 24h."
    _wrap_text(c, msg, 20 * mm, height - 50 * mm, max_width=width - 40 * mm, line_height=16, font="Helvetica", size=12)
    # Try QR generation
    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPDF
        slug = landing.get("slug", "")
        landing_url = f"https://desarrollosmx.io/landing/{slug}"
        qr = QrCodeWidget(landing_url)
        bounds = qr.getBounds()
        qr_size = 60 * mm
        d = Drawing(qr_size, qr_size, transform=[qr_size / (bounds[2] - bounds[0]), 0, 0, qr_size / (bounds[3] - bounds[1]), 0, 0])
        d.add(qr)
        renderPDF.draw(d, c, 20 * mm, 70 * mm)
        c.setFont("Helvetica", 9)
        c.setFillColor(HexColor("#666"))
        c.drawString(20 * mm, 65 * mm, landing_url)
    except Exception as exc:
        log.warning(f"[brochure_pdf] qr failed (soft): {exc}")
        c.setFont("Helvetica", 10)
        c.setFillColor(HexColor("#666"))
        c.drawString(20 * mm, 90 * mm, f"https://desarrollosmx.io/landing/{landing.get('slug', '')}")
    # Asesor footer
    c.setStrokeColor(HexColor("#ddd"))
    c.line(20 * mm, 40 * mm, width - 20 * mm, 40 * mm)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, 32 * mm, _safe_str(bk.get("brand_name") or "Tu asesor DMX", 50))
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#666"))
    contact = bk.get("contact_whatsapp") or bk.get("phone") or ""
    if contact:
        c.drawString(20 * mm, 26 * mm, f"WhatsApp · {contact}")
    disclaimer = bk.get("disclaimer_text") or "Renders ilustrativos. Especificaciones sujetas a cambio sin previo aviso."
    c.setFont("Helvetica-Oblique", 8)
    _wrap_text(c, _safe_str(disclaimer, 300), 20 * mm, 18 * mm, max_width=width - 40 * mm, line_height=10, font="Helvetica-Oblique", size=8)
    c.showPage()

    c.save()
    return buffer.getvalue()


def _wrap_text(c, text: str, x: float, y: float, max_width: float, line_height: float, font: str = "Helvetica", size: int = 12) -> float:
    """Helper: dibuja texto con wrap basico."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    words = (text or "").split()
    lines: list = []
    cur = ""
    for w in words:
        candidate = (cur + " " + w).strip()
        if stringWidth(candidate, font, size) <= max_width:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    c.setFont(font, size)
    for i, line in enumerate(lines[:8]):  # cap 8 lines
        c.drawString(x, y - i * line_height, line)
    return y - len(lines[:8]) * line_height


def _minimal_fallback(landing: Dict[str, Any]) -> bytes:
    """Fallback minimal · sin reportlab."""
    name = landing.get("slug", "landing")
    text = f"DMX Brochure · {name}\n\n(PDF generator no disponible · contacta a DesarrollosMX)\n"
    return text.encode("utf-8")
