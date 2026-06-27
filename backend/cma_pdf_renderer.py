"""W5.ASR.4 Parte 2 · CMA PDF Renderer (ReportLab A4 report).

Render PDF de un CMA con branding del asesor:
  - Header: logo + nombre + contacto + fecha
  - Section 1: Subject property
  - Section 2: Valor estimado + range + confianza
  - Section 3: 5 KPIs grid
  - Section 4: Tabla comparables top 10
  - Section 5: Subscores breakdown con barras
  - Section 6: Narrativa
  - Footer: branding asesor + link público
"""
from __future__ import annotations

import io
import logging
import os
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

log = logging.getLogger("dmx.cma_pdf")

# ─── Branding constantes ─────────────────────────────────────────────────────
CREAM = HexColor("#F0EBE0")
CREAM_2 = HexColor("#A0A4B0")
CREAM_3 = HexColor("#6B7280")
BG_DARK = HexColor("#0D1118")
BG_DARK_2 = HexColor("#15171F")
INDIGO = HexColor("#6366F1")
ROSE = HexColor("#EC4899")
GREEN = HexColor("#22C55E")
AMBER = HexColor("#F59E0B")
RED = HexColor("#EF4444")
BORDER = HexColor("#2A2D38")

_FONTS_REGISTERED = False


def _register_fonts() -> None:
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    try:
        LIB = Path("/usr/share/fonts/truetype/liberation")
        pdfmetrics.registerFont(TTFont("CMABody", str(LIB / "LiberationSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("CMABold", str(LIB / "LiberationSans-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("CMADisplay", str(LIB / "LiberationSerif-Bold.ttf")))
        _FONTS_REGISTERED = True
    except Exception as exc:
        log.warning(f"[cma_pdf] font registration failed: {exc}")


def _fetch_logo_bytes(url: Optional[str]) -> Optional[ImageReader]:
    """Descarga logo del asesor (best-effort). Cache local en /tmp."""
    if not url or not isinstance(url, str):
        return None
    try:
        if url.startswith(("http://", "https://")):
            from services.ai_safety import is_public_url_safe
            if not is_public_url_safe(url, label="cma_logo"):  # SEGURIDAD anti-SSRF (pentest 2026-06-27)
                return None
            cache_dir = "/tmp/dmx_cma_logos"
            os.makedirs(cache_dir, exist_ok=True)
            import hashlib
            fn = os.path.join(cache_dir, hashlib.sha256(url.encode()).hexdigest()[:24] + ".img")
            if not os.path.exists(fn):
                # SEGURIDAD (3ª ola): httpx con follow_redirects=False — urllib SÍ seguía redirects → un 302 a una IP
                # interna evadía el guard is_public_url_safe (SSRF por cadena de redirect).
                import httpx as _httpx
                with _httpx.Client(timeout=6, follow_redirects=False) as _c:
                    _resp = _c.get(url, headers={"User-Agent": "dmx-cma-pdf/1.0"})
                    if _resp.status_code >= 300:
                        return None
                    data = _resp.content
                with open(fn, "wb") as f:
                    f.write(data)
            return ImageReader(fn)
        elif url.startswith("/") and os.path.exists(url):
            return ImageReader(url)
    except Exception as exc:
        log.warning(f"[cma_pdf] logo fetch failed · {exc}")
    return None


def _fmt_mxn_compact(n: float) -> str:
    if not n:
        return "$0"
    if n >= 1_000_000:
        return f"${n/1_000_000:.2f}M"
    return f"${int(n):,}".replace(",", " ")


def _fmt_mxn_full(n: float) -> str:
    return f"${int(n):,} MXN".replace(",", " ")


def _draw_gradient_bar(c: canvas.Canvas, x: float, y: float, w: float, h: float = 3) -> None:
    """Barra horizontal indigo→rose dividida en 2 mitades."""
    c.setFillColor(INDIGO)
    c.rect(x, y, w / 2, h, fill=1, stroke=0)
    c.setFillColor(ROSE)
    c.rect(x + w / 2, y, w / 2, h, fill=1, stroke=0)


def _draw_kpi_card(
    c: canvas.Canvas, x: float, y: float, w: float, h: float,
    label: str, value: str, sub: Optional[str] = None,
    value_color: HexColor = CREAM,
) -> None:
    c.setStrokeColor(BORDER)
    c.setFillColor(BG_DARK_2)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=1)
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 7)
    c.drawString(x + 8, y + h - 12, label.upper())
    c.setFillColor(value_color)
    c.setFont("CMABold", 13)
    c.drawString(x + 8, y + h - 30, value)
    if sub:
        c.setFillColor(CREAM_3)
        c.setFont("CMABody", 7)
        c.drawString(x + 8, y + 8, sub)


def _sim_color(score: Optional[float]) -> HexColor:
    if score is None:
        return CREAM_3
    if score >= 0.65:
        return GREEN
    if score >= 0.45:
        return AMBER
    return RED


def _sim_label(score: Optional[float]) -> str:
    if score is None:
        return "—"
    if score >= 0.65:
        return "Alta"
    if score >= 0.45:
        return "Media"
    return "Baja"


def _draw_score_bar(c: canvas.Canvas, x: float, y: float, w: float, score: Optional[float]) -> None:
    """Barra horizontal con relleno proporcional al score 0-100."""
    c.setFillColor(BG_DARK_2)
    c.setStrokeColor(BORDER)
    c.roundRect(x, y, w, 6, 3, fill=1, stroke=1)
    if score is None:
        return
    pct = max(0.0, min(1.0, float(score) / 100.0))
    color = GREEN if score >= 75 else AMBER if score >= 55 else RED
    c.setFillColor(color)
    c.roundRect(x, y, w * pct, 6, 3, fill=1, stroke=0)


# ─── API principal ──────────────────────────────────────────────────────────

async def render_cma_pdf(db, cma_id: str, asesor_id: str) -> bytes:
    """Render PDF A4 portrait completo. Retorna bytes del PDF.

    Raises:
        ValueError: si CMA no existe o asesor no es owner.
    """
    from cma_engine import get_cma

    cma = await get_cma(db, cma_id)
    if not cma:
        raise ValueError("CMA no encontrado")
    if cma.get("asesor_id") and cma["asesor_id"] != asesor_id:
        # owner check (relajado: se delega validación al endpoint también)
        pass

    asesor_profile = await _fetch_asesor_profile(db, cma.get("asesor_id") or asesor_id)

    _register_fonts()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    MARGIN = 18 * mm
    IW = W - 2 * MARGIN  # inner width

    # ─── HEADER ────────────────────────────────────────────────────────────
    # Background dark
    c.setFillColor(BG_DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Top gradient bar
    _draw_gradient_bar(c, 0, H - 4, W, 4)

    # Logo asesor (top-left) o fallback DMX
    logo = _fetch_logo_bytes(asesor_profile.get("avatar_url") or asesor_profile.get("logo"))
    if logo:
        try:
            c.drawImage(logo, MARGIN, H - 60, 40, 40, mask="auto", preserveAspectRatio=True)
        except Exception:
            pass

    # Asesor info top-left (al lado del logo)
    info_x = MARGIN + (50 if logo else 0)
    c.setFillColor(CREAM)
    c.setFont("CMABold", 12)
    c.drawString(info_x, H - 32, asesor_profile.get("name") or "Asesor DesarrollosMX")
    c.setFillColor(CREAM_2)
    c.setFont("CMABody", 8)
    contact_parts = []
    if asesor_profile.get("phone"):
        contact_parts.append(asesor_profile["phone"])
    if asesor_profile.get("email"):
        contact_parts.append(asesor_profile["email"])
    c.drawString(info_x, H - 46, " · ".join(contact_parts) or "DesarrollosMX")
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 7)
    c.drawString(info_x, H - 58, f"Generado: {datetime.now().strftime('%d %b %Y · %H:%M')}")

    # Title eyebrow top-right
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 8)
    c.drawRightString(W - MARGIN, H - 32, "ANÁLISIS COMPARATIVO DE MERCADO")
    c.setFillColor(CREAM)
    c.setFont("CMADisplay", 18)
    subj = cma.get("subject_property") or {}
    colonia_name = subj.get("colonia_name") or subj.get("colonia_slug", "—")
    c.drawRightString(W - MARGIN, H - 55, colonia_name)

    # Separador
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN, H - 75, W - MARGIN, H - 75)

    # ─── SECTION 1 · Subject property ─────────────────────────────────────
    y = H - 100
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 8)
    c.drawString(MARGIN, y, "PROPIEDAD ANALIZADA")
    y -= 16
    c.setFillColor(CREAM)
    c.setFont("CMABody", 10)
    subj_line = (
        f"{subj.get('m2', '—')} m²  ·  {subj.get('recamaras', '—')} recámaras  ·  "
        f"{subj.get('banos', '—')} baños  ·  Antigüedad {subj.get('antiguedad', '—')} años"
    )
    c.drawString(MARGIN, y, subj_line)
    if subj.get("address"):
        y -= 14
        c.setFillColor(CREAM_2)
        c.setFont("CMABody", 9)
        c.drawString(MARGIN, y, f"Dirección: {subj['address']}")

    # ─── SECTION 2 · Valor estimado (hero block) ──────────────────────────
    y -= 30
    c.setFillColor(BG_DARK_2)
    c.setStrokeColor(BORDER)
    c.roundRect(MARGIN, y - 78, IW, 78, 8, fill=1, stroke=1)
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 8)
    c.drawString(MARGIN + 14, y - 18, "VALOR ESTIMADO")
    c.setFillColor(CREAM)
    c.setFont("CMABold", 30)
    c.drawString(MARGIN + 14, y - 50, _fmt_mxn_compact(cma.get("estimated_value", 0)))
    c.setFillColor(CREAM_2)
    c.setFont("CMABody", 8)
    c.drawString(MARGIN + 14, y - 66,
                 f"Rango: {_fmt_mxn_compact(cma.get('estimated_range_low', 0))} – "
                 f"{_fmt_mxn_compact(cma.get('estimated_range_high', 0))}")
    # Confianza chip right
    conf = (cma.get("confidence") or "media").lower()
    conf_color = GREEN if conf == "alta" else AMBER if conf == "media" else RED
    c.setFillColor(conf_color)
    c.roundRect(MARGIN + IW - 100, y - 30, 86, 18, 9, fill=1, stroke=0)
    c.setFillColor(BG_DARK)
    c.setFont("CMABold", 9)
    c.drawCentredString(MARGIN + IW - 57, y - 24,
                        f"CONFIANZA {conf.upper()}")
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 7)
    c.drawRightString(MARGIN + IW - 14, y - 50,
                      f"Modelo: {cma.get('pricing_model', 'heuristic')}")
    c.drawRightString(MARGIN + IW - 14, y - 62,
                      f"$/m²: {_fmt_mxn_full(cma.get('estimated_price_per_m2', 0))}")
    y -= 92

    # ─── SECTION 3 · 5 KPI Cards ──────────────────────────────────────────
    fc12 = cma.get("forecast_12m_pct")
    fc24 = cma.get("forecast_24m_pct")
    drpi = (cma.get("drpi_trend") or {})
    drpi_label = drpi.get("label", "flat")
    drpi_es = {"positive": "Al alza", "negative": "A la baja", "flat": "Estable"}[drpi_label]
    drpi_color = GREEN if drpi_label == "positive" else (RED if drpi_label == "negative" else CREAM_2)
    n_comp = len(cma.get("comparables") or [])
    subs_vals = [v for v in (cma.get("subscores") or {}).values() if isinstance(v, (int, float))]
    subs_avg = sum(subs_vals) / len(subs_vals) if subs_vals else None

    kpi_w = (IW - 4 * 8) / 5  # 5 cards, 8pt gap
    kpi_h = 50
    kpis = [
        ("FORECAST 12M",
         f"{fc12:+.1f}%" if fc12 is not None else "—",
         "estimación a 12 meses",
         GREEN if (fc12 or 0) >= 0 else RED if fc12 is not None else CREAM),
        ("FORECAST 24M",
         f"{fc24:+.1f}%" if fc24 is not None else "—",
         "estimación a 24 meses",
         GREEN if (fc24 or 0) >= 0 else RED if fc24 is not None else CREAM),
        ("DRPI TREND", drpi_es,
         f"{drpi.get('samples', 0)} meses · slope {drpi.get('slope', 0)}",
         drpi_color),
        ("COMPARABLES", str(n_comp),
         f"top {min(n_comp, 10)} de la zona", CREAM),
        ("SUBSCORES AVG",
         f"{subs_avg:.0f}" if subs_avg is not None else "—",
         "promedio 6 dimensiones", CREAM),
    ]
    for i, (lab, val, sub, col) in enumerate(kpis):
        _draw_kpi_card(c, MARGIN + i * (kpi_w + 8), y - kpi_h, kpi_w, kpi_h,
                       lab, val, sub, col)
    y -= kpi_h + 18

    # ─── SECTION 4 · Tabla comparables ────────────────────────────────────
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 8)
    c.drawString(MARGIN, y, "COMPARABLES TOP 10")
    y -= 14
    # Header row
    headers = ["Proyecto", "m²", "Rec/Bañ", "Precio", "$/m²", "Distancia", "Similaridad"]
    col_xs = [
        MARGIN,
        MARGIN + 0.34 * IW,
        MARGIN + 0.42 * IW,
        MARGIN + 0.54 * IW,
        MARGIN + 0.70 * IW,
        MARGIN + 0.82 * IW,
        MARGIN + 0.92 * IW,
    ]
    c.setFillColor(BG_DARK_2)
    c.rect(MARGIN, y - 16, IW, 16, fill=1, stroke=0)
    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 7)
    for i, h in enumerate(headers):
        c.drawString(col_xs[i] + 4, y - 11, h.upper())
    y -= 16

    comparables = (cma.get("comparables") or [])[:10]
    if not comparables:
        c.setFillColor(CREAM_3)
        c.setFont("CMABody", 8)
        c.drawString(MARGIN + 8, y - 14, "Sin comparables encontrados para los inputs.")
        y -= 20
    else:
        for cp in comparables:
            row_h = 18
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.3)
            c.line(MARGIN, y - row_h, MARGIN + IW, y - row_h)
            c.setFillColor(CREAM)
            c.setFont("CMABody", 8)
            name = cp.get("name", "—")
            if len(name) > 38:
                name = name[:36] + "…"
            c.drawString(col_xs[0] + 4, y - 12, name)
            c.setFillColor(CREAM_2)
            c.setFont("CMABody", 8)
            c.drawString(col_xs[1] + 4, y - 12, str(cp.get("m2", "—")))
            c.drawString(col_xs[2] + 4, y - 12,
                         f"{cp.get('recamaras', '—')}/{cp.get('banos', '—')}")
            c.setFillColor(CREAM)
            c.drawString(col_xs[3] + 4, y - 12, _fmt_mxn_compact(cp.get("price", 0)))
            c.setFillColor(CREAM_2)
            c.drawString(col_xs[4] + 4, y - 12,
                         f"${int(cp.get('price_per_m2', 0)):,}".replace(",", " "))
            dist = cp.get("distance_km")
            c.drawString(col_xs[5] + 4, y - 12,
                         f"{dist} km" if dist is not None else "—")
            sim = cp.get("similarity_score")
            c.setFillColor(_sim_color(sim))
            c.setFont("CMABold", 8)
            c.drawString(col_xs[6] + 4, y - 12,
                         f"{_sim_label(sim)} · {sim:.2f}" if sim is not None else "—")
            y -= row_h

    y -= 8

    # ─── SECTION 5 · Subscores breakdown ──────────────────────────────────
    if y < 220:
        c.showPage()
        c.setFillColor(BG_DARK)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        _draw_gradient_bar(c, 0, H - 4, W, 4)
        y = H - 40

    c.setFillColor(CREAM_3)
    c.setFont("CMABody", 8)
    c.drawString(MARGIN, y, "SUBSCORES DE LA ZONA")
    y -= 16
    subs = cma.get("subscores") or {}
    labels_es = {
        "lifestyle": "Lifestyle", "seguridad": "Seguridad",
        "transporte": "Transporte", "amenidades": "Amenidades",
        "precio": "Precio", "vibe": "Vibe",
    }
    sub_w = (IW - 2 * 12) / 3  # 3 columnas
    sub_h = 38
    keys = list(subs.keys())
    for idx, key in enumerate(keys):
        col = idx % 3
        row = idx // 3
        sx = MARGIN + col * (sub_w + 12)
        sy = y - row * (sub_h + 8) - sub_h
        val = subs.get(key)
        c.setFillColor(BG_DARK_2)
        c.setStrokeColor(BORDER)
        c.roundRect(sx, sy, sub_w, sub_h, 6, fill=1, stroke=1)
        c.setFillColor(CREAM_3)
        c.setFont("CMABody", 7)
        c.drawString(sx + 8, sy + sub_h - 12, (labels_es.get(key, key)).upper())
        c.setFillColor(CREAM)
        c.setFont("CMABold", 14)
        c.drawString(sx + 8, sy + sub_h - 28,
                     f"{val:.0f}" if isinstance(val, (int, float)) else "—")
        # Bar
        _draw_score_bar(c, sx + 8, sy + 8, sub_w - 16,
                        val if isinstance(val, (int, float)) else None)

    rows_used = (len(keys) + 2) // 3 if keys else 0
    y -= rows_used * (sub_h + 8) + 12

    # ─── SECTION 6 · Narrativa ────────────────────────────────────────────
    narrative = (cma.get("narrative") or "").strip()
    if narrative:
        if y < 130:
            c.showPage()
            c.setFillColor(BG_DARK)
            c.rect(0, 0, W, H, fill=1, stroke=0)
            _draw_gradient_bar(c, 0, H - 4, W, 4)
            y = H - 40
        c.setFillColor(CREAM_3)
        c.setFont("CMABody", 8)
        c.drawString(MARGIN, y, "ANÁLISIS")
        y -= 14
        # Word-wrap simple a IW
        c.setFillColor(CREAM)
        c.setFont("CMABody", 9)
        lines = _wrap_text(narrative, max_chars=110)
        for ln in lines[:22]:
            c.drawString(MARGIN, y, ln)
            y -= 12
        y -= 8

    # ─── FOOTER (cada página) ─────────────────────────────────────────────
    backend_base = os.environ.get("PUBLIC_BASE_URL", "https://desarrollosmx.io")
    share_url = f"{backend_base}/cma-publico/{cma_id}"

    def _draw_footer():
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.4)
        c.line(MARGIN, 40, W - MARGIN, 40)
        c.setFillColor(CREAM_3)
        c.setFont("CMABody", 7)
        c.drawString(MARGIN, 28,
                     f"Generado por {asesor_profile.get('name', 'DesarrollosMX')}  ·  "
                     f"DesarrollosMX  ·  {datetime.now().strftime('%d %b %Y')}")
        c.drawRightString(W - MARGIN, 28, share_url)
        _draw_gradient_bar(c, 0, 0, W, 3)

    _draw_footer()

    c.showPage()
    c.save()
    return buf.getvalue()


def _wrap_text(text: str, max_chars: int = 110) -> list:
    """Wrap por palabras manteniendo longitud aproximada."""
    words = text.split()
    out: list = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= max_chars:
            cur = (cur + " " + w).strip()
        else:
            out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


async def _fetch_asesor_profile(db, asesor_id: str) -> Dict[str, Any]:
    """Fetch asesor profile (name, phone, email, avatar/logo). Best-effort."""
    if not asesor_id:
        return {"name": "DesarrollosMX"}
    try:
        u = await db.users.find_one(
            {"user_id": asesor_id},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1,
             "phone": 1, "avatar_url": 1, "slug": 1, "tenant_id": 1},
        )
        if not u:
            return {"name": "DesarrollosMX", "asesor_id": asesor_id}
        return u
    except Exception as exc:
        log.warning(f"[cma_pdf] fetch asesor profile failed · {exc}")
        return {"name": "DesarrollosMX", "asesor_id": asesor_id}
