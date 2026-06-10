"""
estudio_pdf_renderer — F3.1 · El Estudio de Mercado Vivo + Memo como PDF con marca DMX.
═══════════════════════════════════════════════════════════════════════════════
REUSA (grep-antes-de-construir · NO duplica stack de PDF):
  • cma_pdf_renderer → fuentes, paleta DMX, _draw_gradient_bar, _draw_kpi_card,
    _draw_score_bar, _wrap_text, _fmt_mxn_compact, _fetch_asesor_profile. Mismo look & feel.
  • estudio_mercado_engine.generar_estudio → el contenido (Grafo + EPRAV + Generador +
    oferta + absorción + amenidades + memo inversionista + tono de marketing + zona).
NUEVO (lo que falta): el ENTREGABLE armado (portada + secciones + memo) en una hoja vendible.
FAIL-OPEN. Cierra ciclo: el mismo estudio vivo se vuelve documento descargable/branded.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# Reuso directo del stack de marca/branding del CMA (cero duplicado).
from cma_pdf_renderer import (
    CREAM, CREAM_2, CREAM_3, BG_DARK, BG_DARK_2, INDIGO, GREEN, AMBER, RED, BORDER,
    _register_fonts, _draw_gradient_bar, _draw_kpi_card, _draw_score_bar,
    _wrap_text, _fmt_mxn_compact, _fetch_asesor_profile,
)

log = logging.getLogger("dmx.estudio_pdf")


def _fonts():
    """Fuentes de marca (Liberation TTF en prod). Si faltan (dev), alias a fuentes nativas
    bajo los MISMOS nombres CMA* — así los helpers reusados del CMA resuelven igual. FAIL-OPEN."""
    _register_fonts()
    from reportlab.pdfbase import pdfmetrics
    try:
        registered = set(pdfmetrics.getRegisteredFontNames())
    except Exception:
        registered = set()
    if "CMABody" not in registered:
        try:
            pdfmetrics.registerFont(pdfmetrics.Font("CMABody", "Helvetica", "WinAnsiEncoding"))
            pdfmetrics.registerFont(pdfmetrics.Font("CMABold", "Helvetica-Bold", "WinAnsiEncoding"))
            pdfmetrics.registerFont(pdfmetrics.Font("CMADisplay", "Times-Bold", "WinAnsiEncoding"))
        except Exception as e:
            log.warning(f"[estudio_pdf] font alias fallback failed: {e}")
            return "Helvetica", "Helvetica-Bold", "Times-Bold"
    return "CMABody", "CMABold", "CMADisplay"


def _num(v) -> str:
    try:
        return f"{int(v):,}".replace(",", " ")
    except Exception:
        return "—"


async def render_estudio_pdf(db, colonia_id: str, categoria: str = "media",
                             user_id: str = "") -> bytes:
    """Render del Estudio de Mercado Vivo + Memo a PDF A4 branded. Retorna bytes."""
    from estudio_mercado_engine import generar_estudio
    est = await generar_estudio(db, colonia_id, categoria)
    s = est.get("secciones") or {}
    dr = s.get("demanda_real") or {}
    dp = s.get("demanda_potencial") or {}
    prod = s.get("producto_recomendado") or {}
    of = s.get("oferta") or {}
    inv = s.get("inversionista") or {}
    tono = s.get("tono_marketing") or {}
    zona = s.get("zona") or {}

    perfil = await _fetch_asesor_profile(db, user_id) if user_id else {"name": "DesarrollosMX"}

    BODY, BOLD, DISPLAY = _fonts()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    MARGIN = 18 * mm
    IW = W - 2 * MARGIN

    def _bg():
        c.setFillColor(BG_DARK)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        _draw_gradient_bar(c, 0, H - 4, W, 4)

    def _footer():
        import os
        base = os.environ.get("PUBLIC_BASE_URL", "https://desarrollosmx.io")
        c.setStrokeColor(BORDER); c.setLineWidth(0.4)
        c.line(MARGIN, 40, W - MARGIN, 40)
        c.setFillColor(CREAM_3); c.setFont(BODY, 7)
        c.drawString(MARGIN, 28, f"Estudio de Mercado Vivo · DesarrollosMX · {datetime.now().strftime('%d %b %Y')}")
        c.drawRightString(W - MARGIN, 28, base.replace("https://", ""))
        _draw_gradient_bar(c, 0, 0, W, 3)

    def _section_title(y, t):
        c.setFillColor(CREAM_3); c.setFont(BODY, 8)
        c.drawString(MARGIN, y, t.upper())
        return y - 14

    def _para(y, text, color=CREAM, size=9, lh=12, maxc=110, maxlines=20):
        c.setFillColor(color); c.setFont(BODY, size)
        for ln in _wrap_text(text, max_chars=maxc)[:maxlines]:
            c.drawString(MARGIN, y, ln); y -= lh
        return y

    # ════════ PÁGINA 1 · Portada + síntesis ════════
    _bg()
    c.setFillColor(CREAM_3); c.setFont(BODY, 8)
    c.drawString(MARGIN, H - 34, "ESTUDIO DE MERCADO VIVO · RESIDENCIAL CDMX")
    c.setFillColor(CREAM); c.setFont(DISPLAY, 26)
    c.drawString(MARGIN, H - 62, est.get("colonia") or "—")
    c.setFillColor(CREAM_2); c.setFont(BODY, 9)
    c.drawString(MARGIN, H - 78, f"Categoría: {categoria.title()}  ·  Generado: {datetime.now().strftime('%d %b %Y · %H:%M')}")
    if est.get("es_estimado"):
        c.setFillColor(AMBER); c.setFont(BODY, 8)
        c.drawString(MARGIN, H - 92, "◐ Estudio preliminar — se afina solo conforme entra dato real.")
    c.setStrokeColor(BORDER); c.setLineWidth(0.5)
    c.line(MARGIN, H - 100, W - MARGIN, H - 100)

    # KPIs clave
    kpi_w = (IW - 3 * 8) / 4
    kpis = [
        ("DEMANDA REAL", _num(dr.get("demanda_total")), "búsquedas activas", INDIGO),
        ("HUECO VERTICAL", _num(dp.get("gap_vertical")), "unidades/año sin oferta",
         GREEN if (dp.get("gap_vertical") or 0) > 0 else CREAM),
        ("COMPETENCIA", _num(of.get("proyectos")), f"{_num(of.get('unidades_disponibles'))} disponibles", CREAM),
        ("CAPTURA OBJETIVO", _num(dp.get("captura_objetivo")), "unidades alcanzables", CREAM),
    ]
    ky = H - 118
    for i, (lab, val, sub, col) in enumerate(kpis):
        _draw_kpi_card(c, MARGIN + i * (kpi_w + 8), ky - 52, kpi_w, 52, lab, val, sub, col)
    y = ky - 52 - 22

    # Veredicto (síntesis honesta)
    y = _section_title(y, "Veredicto")
    for v in (est.get("veredicto") or [])[:6]:
        y = _para(y, f"· {v}", color=CREAM, size=9.5, lh=14, maxlines=2)
    y -= 6

    # Demanda real (Grafo) — segmentos
    y = _section_title(y, "Quién Compra Aquí (Demanda Real · Grafo del Comprador)")
    segs = dr.get("segmentos") or []
    if segs:
        for seg in segs[:6]:
            c.setFillColor(CREAM); c.setFont(BODY, 9)
            c.drawString(MARGIN + 6, y, f"· {seg.get('label', seg.get('segmento', '—'))}")
            c.setFillColor(CREAM_2); c.setFont(BODY, 9)
            c.drawRightString(W - MARGIN, y, f"{_num(seg.get('demanda'))} búsquedas")
            y -= 13
    else:
        y = _para(y, "Aún sin búsquedas representativas — se usa el potencial demográfico.", color=CREAM_3)
    y -= 6

    # Producto recomendado
    y = _section_title(y, "Qué Construir (Mezcla Recomendada)")
    mezcla = prod.get("mezcla") or []
    if mezcla:
        for m in mezcla[:6]:
            c.setFillColor(CREAM); c.setFont(BODY, 9)
            c.drawString(MARGIN + 6, y, f"· {m.get('tipologia', '—')} — {m.get('pct', '—')}%")
            c.setFillColor(CREAM_2); c.setFont(BODY, 9)
            extra = []
            if m.get("m2_promedio"): extra.append(f"{_num(m['m2_promedio'])} m²")
            if m.get("precio_tipico"): extra.append(_fmt_mxn_compact(m["precio_tipico"]))
            c.drawRightString(W - MARGIN, y, " · ".join(extra) or "—")
            y -= 13
    else:
        y = _para(y, "Sin mezcla calculada todavía.", color=CREAM_3)

    _footer()

    # ════════ PÁGINA 2 · Memo de inversionista + zona + tono ════════
    c.showPage(); _bg()
    y = H - 40
    c.setFillColor(CREAM); c.setFont(DISPLAY, 18)
    c.drawString(MARGIN, y, "Memo de Inversionista")
    y -= 24

    rend = inv.get("rendimiento") or {}
    if rend:
        kw = (IW - 2 * 8) / 3
        ik = [
            ("CAP RATE", f"{rend.get('cap_rate_pct', '—')}%", "anual", CREAM),
            ("IRR (5 AÑOS)", f"{rend.get('irr_pct', '—')}%", "proyectado", GREEN),
            ("RENTA EST./MES", _fmt_mxn_compact(rend.get("renta_mensual_estimada") or 0), "bruta", CREAM),
        ]
        for i, (lab, val, sub, col) in enumerate(ik):
            _draw_kpi_card(c, MARGIN + i * (kw + 8), y - 50, kw, 50, lab, val, sub, col)
        y -= 50 + 18
    else:
        y = _para(y, "Rendimiento estimado: faltan precio/m² del producto dominante para el cálculo fino.", color=CREAM_3)
        y -= 6

    if inv.get("plusvalia_anual_pct") is not None:
        y = _para(y, f"Plusvalía base de la zona: ~{inv['plusvalia_anual_pct']}%/año.", color=CREAM_2)
    pi = inv.get("perfil_inquilino") or {}
    if pi.get("perfil"):
        y = _para(y, f"Rentar a: {pi['perfil']}.", color=CREAM)
    pb = inv.get("comercio_pb") or {}
    if pb.get("recomendacion"):
        y = _para(y, f"Comercio en planta baja: {pb['recomendacion']} — {pb.get('razon', '')}", color=CREAM, maxlines=3)
    y -= 8

    # Tono de marketing (F2.11)
    if tono:
        y = _section_title(y, "Tono de Marketing (A Quién Le Hablas)")
        dom = tono.get("dominante") or {}
        y = _para(y, f"Comprador dominante: {dom.get('nombre', '—')}.", color=CREAM)
        if tono.get("tono_marketing"):
            y = _para(y, f"Tono sugerido: {tono['tono_marketing']}", color=CREAM_2, maxlines=2)
        if dom.get("enfoque"):
            y = _para(y, f"Enfoque: {dom['enfoque']}", color=CREAM_3, maxlines=2)
        y -= 6

    # Zona — qué le falta
    qf = (zona.get("que_le_falta") or {})
    if qf.get("faltan"):
        y = _section_title(y, "Qué Le Falta a la Zona (Oportunidad de Comercio)")
        for f in qf["faltan"][:5]:
            c.setFillColor(CREAM); c.setFont(BODY, 9)
            c.drawString(MARGIN + 6, y, f"· {f.get('giro', '—')}")
            c.setFillColor(AMBER); c.setFont(BODY, 9)
            c.drawRightString(W - MARGIN, y, f"tienes {f.get('tienes', '—')} · {f.get('nivel', '')}")
            y -= 13
        y -= 6

    c.setFillColor(CREAM_3); c.setFont(BODY, 8)
    y = _para(y, est.get("fuente") or "Estudio de Mercado Vivo DMX", color=CREAM_3, size=8, maxlines=2)

    _footer()
    c.showPage()
    c.save()
    return buf.getvalue()
