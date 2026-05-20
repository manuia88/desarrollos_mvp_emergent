"""W5.22 Z.8 — Landing brochure PDF renderer (ReportLab A4 · 2-3 pages).

Reusa pattern Z.2 PDF (routes/studio_carrusel.py _render_carrusel_pdf).
Acepta landing dict + brand_kit opcional.
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.studio_landing_pdf")


def _hex_to_rl_color(hex_str: str, fallback: str = "#6366F1"):
    from reportlab.lib.colors import HexColor
    try:
        return HexColor(hex_str or fallback)
    except Exception:
        return HexColor(fallback)


def render_landing_brochure(landing: Dict[str, Any], brand_kit: Optional[Dict[str, Any]] = None) -> bytes:
    """Genera PDF A4 brochure 2-3 pages."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor, Color
    from reportlab.pdfgen import canvas as rl_canvas

    content = landing.get("content") or {}
    hero = content.get("hero") or {}
    stats = content.get("stats") or []
    features = content.get("features") or []
    testimonials = content.get("testimonials") or []
    cta = content.get("cta") or {}

    bk = brand_kit or {}
    primary = _hex_to_rl_color(bk.get("color_primary"), "#6366F1")
    secondary = _hex_to_rl_color(bk.get("color_secondary"), "#EC4899")
    BG = HexColor("#06080F")
    CREAM = HexColor("#F0EBE0")
    GRAY = HexColor("#6B7280")

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    M = 18 * mm
    IW = W - 2 * M

    def gradient_strip(x, y, w, h):
        w_int = int(w)
        step = max(1, w_int // 60)
        for i in range(0, w_int, step):
            t = i / max(w_int - 1, 1)
            r = (primary.red + t * (secondary.red - primary.red))
            g = (primary.green + t * (secondary.green - primary.green))
            b = (primary.blue + t * (secondary.blue - primary.blue))
            c.setFillColor(Color(r, g, b))
            c.rect(x + i, y, step + 1, h, fill=1, stroke=0)

    # ─── PAGE 1: Cover ────────────────────────────────────────────────────────
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    gradient_strip(0, H - 6, W, 6)

    c.setFont("Helvetica-Bold", 30)
    c.setFillColor(CREAM)
    title = (hero.get("title") or "Landing")[:64]
    c.drawString(M, H - M - 40, title)

    if hero.get("subtitle"):
        c.setFont("Helvetica", 14)
        c.setFillColor(HexColor("#a0a4b0"))
        # wrap subtitle (max 90 chars per line)
        sub = hero["subtitle"][:200]
        lines = []
        cur = ""
        for word in sub.split():
            if len(cur) + len(word) + 1 > 70:
                lines.append(cur)
                cur = word
            else:
                cur = (cur + " " + word).strip()
        if cur:
            lines.append(cur)
        for i, line in enumerate(lines[:3]):
            c.drawString(M, H - M - 70 - i * 18, line)

    # Stats row
    if stats:
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(CREAM)
        c.drawString(M, H / 2 + 40, "Indicadores")
        for i, st in enumerate(stats[:4]):
            x = M + i * (IW / 4)
            c.setFont("Helvetica-Bold", 16)
            c.setFillColor(primary)
            c.drawString(x, H / 2, str(st.get("value", ""))[:14])
            c.setFont("Helvetica", 9)
            c.setFillColor(HexColor("#a0a4b0"))
            c.drawString(x, H / 2 - 16, str(st.get("label", ""))[:24])

    # CTA primary
    primary_cta = (cta.get("primary") or {}).get("text") or "Agenda tu visita"
    gradient_strip(M, M + 30, int(IW * 0.45), 30)
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(HexColor("#FFFFFF"))
    c.drawString(M + 14, M + 40, primary_cta[:38])

    # Footer brand
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    footer = (bk.get("footer_legal") or "DesarrollosMX (c) 2026")
    c.drawString(M, 14, footer[:120])
    gradient_strip(0, 0, W, 4)
    c.showPage()

    # ─── PAGE 2: Features + Testimonials ──────────────────────────────────────
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    gradient_strip(0, H - 6, W, 6)

    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(CREAM)
    c.drawString(M, H - M - 28, "Por que este proyecto")

    y = H - M - 60
    for i, feat in enumerate(features[:5]):
        c.setFont("Helvetica-Bold", 13)
        c.setFillColor(primary)
        c.drawString(M, y, f"-  {str(feat.get('title', ''))[:60]}")
        c.setFont("Helvetica", 10)
        c.setFillColor(HexColor("#a0a4b0"))
        c.drawString(M + 12, y - 14, str(feat.get("description", ""))[:90])
        y -= 38

    if testimonials:
        y -= 10
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(CREAM)
        c.drawString(M, y, "Testimonios")
        y -= 22
        for tst in testimonials[:2]:
            c.setFont("Helvetica-Oblique", 10)
            c.setFillColor(HexColor("#a0a4b0"))
            quote = str(tst.get("quote", ""))[:110]
            c.drawString(M, y, f"\"{quote}\"")
            c.setFont("Helvetica", 9)
            c.setFillColor(primary)
            c.drawString(M, y - 14, f"- {tst.get('author', '')[:40]}")
            y -= 36

    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawString(M, 14, (bk.get("disclaimer_text") or "Renders ilustrativos. Especificaciones sujetas a cambio.")[:120])
    gradient_strip(0, 0, W, 4)
    c.showPage()

    # ─── PAGE 3: Contact / CTA ────────────────────────────────────────────────
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    gradient_strip(0, H - 6, W, 6)
    c.setFont("Helvetica-Bold", 24)
    c.setFillColor(CREAM)
    c.drawString(M, H - M - 30, "Siguiente paso")
    c.setFont("Helvetica", 12)
    c.setFillColor(HexColor("#a0a4b0"))
    c.drawString(M, H - M - 56,
                 "Reserva tu visita guiada y recibe brochure ampliado, planos y proyeccion financiera.")
    gradient_strip(M, H / 2, int(IW * 0.5), 36)
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(HexColor("#FFFFFF"))
    c.drawString(M + 14, H / 2 + 12, primary_cta[:40])

    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#a0a4b0"))
    slug = landing.get("slug", "")
    domain = "desarrollosmx.io"
    c.drawString(M, H / 2 - 20, f"Web: https://{domain}/landing/{slug}")
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawString(M, 14, footer[:120])
    gradient_strip(0, 0, W, 4)
    c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()
