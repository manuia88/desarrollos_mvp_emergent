"""Phase 4 Batch 26 · services — Colonia Report PDF (reportlab branded).

Genera PDF de 5-10 páginas con información completa de una colonia.
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.colonia_report_pdf")

# ─── Paleta DMX ───────────────────────────────────────────────────────────────
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

C_BG      = colors.HexColor("#06080F")
C_CREAM   = colors.HexColor("#F0EBE0")
C_INDIGO  = colors.HexColor("#6366F1")
C_ROSE    = colors.HexColor("#EC4899")
C_GRAY    = colors.HexColor("#3A3D4A")
C_AMBER   = colors.HexColor("#F59E0B")
C_GREEN   = colors.HexColor("#22C55E")
C_RED     = colors.HexColor("#EF4444")

PAGE_W, PAGE_H = letter


def _style(name, **kwargs):
    base = getSampleStyleSheet()["Normal"]
    s = ParagraphStyle(name, parent=base, **kwargs)
    return s


def _risk_color(v: int) -> Any:
    if v <= 30: return C_GREEN
    if v <= 60: return C_AMBER
    return C_RED


def _bar_table(label: str, value: int, max_w: float = 300) -> Table:
    """Fila de barra horizontal para riesgos/scores."""
    filled = int(max_w * value / 100)
    empty = int(max_w * (100 - value) / 100)
    bar_color = _risk_color(value)
    data = [[label, f"{value}/100"]]
    t = Table(data, colWidths=[200, 60])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), C_CREAM),
        ("BACKGROUND", (0, 0), (-1, -1), C_BG),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def generate_colonia_report_pdf(
    colonia_data: Dict[str, Any],
) -> bytes:
    """
    Genera el PDF del reporte de colonia.
    `colonia_data` es el response de get_colonia_full() (B24).
    Retorna bytes del PDF.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=0.6 * inch,
        leftMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
    )

    colonia = colonia_data.get("colonia", {})
    nombre = colonia.get("nombre", "Colonia")
    alcaldia = colonia.get("alcaldia", "—")
    tier = colonia.get("tier", "—")
    scores = colonia_data.get("scores", {})
    projects_count = colonia_data.get("projects_count", 0)
    avg_price_m2 = colonia_data.get("avg_price_m2", 0)
    momentum_label = colonia_data.get("momentum_label", "—")
    twin = colonia_data.get("climate_twin", {})
    risks = colonia_data.get("risks", {})

    style_h1 = _style("h1", fontName="Helvetica-Bold", fontSize=22,
                      textColor=C_CREAM, spaceAfter=8, leading=28)
    style_h2 = _style("h2", fontName="Helvetica-Bold", fontSize=14,
                      textColor=C_INDIGO, spaceAfter=6, leading=18)
    style_body = _style("body", fontName="Helvetica", fontSize=9,
                        textColor=C_CREAM, leading=13)
    style_small = _style("small", fontName="Helvetica", fontSize=8,
                         textColor=colors.HexColor("#888899"), leading=11)
    style_kpi_val = _style("kpiv", fontName="Helvetica-Bold", fontSize=16,
                           textColor=C_INDIGO, spaceAfter=2, leading=20)
    style_kpi_lbl = _style("kpil", fontName="Helvetica", fontSize=8,
                           textColor=colors.HexColor("#888899"), spaceAfter=10)

    story = []
    hr = HRFlowable(width="100%", thickness=1, color=C_GRAY, spaceAfter=10, spaceBefore=10)

    # ── Página 1: Hero ────────────────────────────────────────────────────────
    # Banner gradient (table row)
    banner = Table(
        [[Paragraph(f"<b>REPORTE DE COLONIA</b>", _style("banner",
            fontName="Helvetica-Bold", fontSize=10,
            textColor=C_CREAM, alignment=TA_CENTER))]],
        colWidths=[PAGE_W - 1.2 * inch],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_INDIGO),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(banner)
    story.append(Spacer(1, 14))

    story.append(Paragraph(nombre, style_h1))
    story.append(Paragraph(f"{alcaldia} · Tier {tier}", style_small))
    story.append(Spacer(1, 10))
    story.append(hr)

    # KPIs en tabla 5 columnas
    kpi_data = [
        [
            Paragraph(f"${avg_price_m2 // 1000}k", style_kpi_val),
            Paragraph(str(projects_count), style_kpi_val),
            Paragraph(str(momentum_label), style_kpi_val),
            Paragraph(str(scores.get("seguridad", "—")), style_kpi_val),
            Paragraph(str(scores.get("vida", "—")), style_kpi_val),
        ],
        [
            Paragraph("$/m² prom.", style_kpi_lbl),
            Paragraph("Proyectos", style_kpi_lbl),
            Paragraph("Momentum", style_kpi_lbl),
            Paragraph("Seguridad", style_kpi_lbl),
            Paragraph("Calidad vida", style_kpi_lbl),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[(PAGE_W - 1.2 * inch) / 5] * 5)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0D1017")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, C_GRAY),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 14))

    # Intro paragraph
    story.append(Paragraph(
        f"Este reporte presenta un análisis exhaustivo de <b>{nombre}</b>, "
        f"una de las colonias más relevantes de {alcaldia}, Ciudad de México. "
        f"Incluye datos de mercado, indicadores de calidad de vida, riesgos urbanos "
        f"y una comparación con ciudades de referencia internacional.",
        style_body
    ))
    story.append(PageBreak())

    # ── Páginas 2-3: IE Engine Scores ────────────────────────────────────────
    story.append(Paragraph("Scores IE Engine", style_h2))
    story.append(Paragraph(
        "Indicadores de calidad urbana calculados por el IE Engine de DesarrollosMX.",
        style_small
    ))
    story.append(Spacer(1, 8))

    SCORE_LABELS = {
        "vida": "Calidad de Vida", "movilidad": "Movilidad",
        "seguridad": "Seguridad", "comercio": "Comercio",
        "plusvalia": "Plusvalía", "educacion": "Educación",
        "riesgo": "Riesgo Global",
    }

    if scores:
        score_rows = []
        for k, lbl in SCORE_LABELS.items():
            v = scores.get(k)
            if v is None:
                continue
            try:
                v_int = int(v)
            except Exception:
                continue
            color = _risk_color(v_int) if k == "riesgo" else (
                C_GREEN if v_int >= 70 else C_AMBER if v_int >= 45 else C_RED
            )
            bar_filled = v_int
            # Mini bar usando Table
            score_rows.append([
                Paragraph(lbl, _style("sl", fontName="Helvetica", fontSize=9, textColor=C_CREAM)),
                Paragraph(f"<b>{v_int}</b>", _style("sv", fontName="Helvetica-Bold", fontSize=9, textColor=color)),
            ])
        if score_rows:
            score_table = Table(score_rows, colWidths=[260, 60])
            score_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0D1017")),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_BG, colors.HexColor("#0D1017")]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(score_table)
    else:
        story.append(Paragraph("Scores IE en proceso de cálculo para esta colonia.", style_small))

    story.append(PageBreak())

    # ── Página 4: Climate Twin ────────────────────────────────────────────────
    story.append(Paragraph("Climate Twin", style_h2))
    if twin and twin.get("city"):
        story.append(Paragraph(
            f"<b>{nombre}</b> comparte características urbanas con "
            f"<b>{twin['city']}</b>, {twin['country']} "
            f"({twin.get('similarity_pct', 0)}% de similitud).",
            style_body
        ))
        story.append(Spacer(1, 6))
        if twin.get("description"):
            story.append(Paragraph(twin["description"], style_body))
    else:
        story.append(Paragraph("Climate Twin en cálculo para esta colonia.", style_small))
    story.append(PageBreak())

    # ── Página 5: Riesgos ────────────────────────────────────────────────────
    story.append(Paragraph("Análisis de Riesgos Urbanos", style_h2))
    risk_labels = {
        "flood": "Inundación", "seismic": "Sismo",
        "theft": "Robo / Seguridad", "heat_stress": "Estrés Térmico",
    }
    if risks:
        risk_data = []
        for k, lbl in risk_labels.items():
            v = risks.get(k, 0)
            color = _risk_color(v)
            risk_data.append([
                Paragraph(lbl, _style("rl", fontName="Helvetica", fontSize=9, textColor=C_CREAM)),
                Paragraph(f"<b>{v}/100</b>", _style("rv", fontName="Helvetica-Bold", fontSize=9, textColor=color)),
                Paragraph(
                    "Bajo" if v <= 30 else "Moderado" if v <= 60 else "Alto",
                    _style("rcat", fontName="Helvetica", fontSize=8, textColor=color)
                ),
            ])
        risk_table = Table(risk_data, colWidths=[200, 70, 80])
        risk_table.setStyle(TableStyle([
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_BG, colors.HexColor("#0D1017")]),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(risk_table)
        if risks.get("mock"):
            story.append(Spacer(1, 6))
            story.append(Paragraph("* Datos estimados. Integración INEGI en progreso.", style_small))
    story.append(PageBreak())

    # ── Páginas 6-7: Top Desarrollos ──────────────────────────────────────────
    story.append(Paragraph(f"Desarrollos en {nombre}", style_h2))
    top_devs = colonia_data.get("top_developments", [])
    if top_devs:
        dev_data = [["Proyecto", "Precio desde", "m²", "Etapa"]]
        for d in top_devs[:5]:
            price = f"${int(d.get('price_from', 0) / 1_000_000):.1f}M" if d.get("price_from") else "—"
            m2 = d.get("m2_range", "—")
            stage = d.get("stage", "—")
            dev_data.append([d.get("name", "—"), price, str(m2), str(stage)])
        dev_table = Table(dev_data, colWidths=[200, 80, 60, 80])
        dev_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), C_INDIGO),
            ("TEXTCOLOR", (0, 0), (-1, 0), C_CREAM),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 1), (-1, -1), C_CREAM),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_BG, colors.HexColor("#0D1017")]),
            ("GRID", (0, 0), (-1, -1), 0.5, C_GRAY),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(dev_table)
    else:
        story.append(Paragraph(f"No hay desarrollos registrados actualmente en {nombre}.", style_small))
    story.append(PageBreak())

    # ── Página 8: Tendencia de Precios ────────────────────────────────────────
    story.append(Paragraph("Tendencia de Precios (12 meses)", style_h2))
    trend = colonia_data.get("price_trend", [])
    if trend:
        # Tabla simple con los últimos 6 puntos
        t_header = [["Mes", "$/m²"]]
        t_rows = [[str(p.get("month", "—")), f"${p.get('price_m2', 0):,}"] for p in trend[-6:]]
        t_table = Table(t_header + t_rows, colWidths=[160, 120])
        t_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), C_INDIGO),
            ("TEXTCOLOR", (0, 0), (-1, 0), C_CREAM),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 1), (-1, -1), C_CREAM),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_BG, colors.HexColor("#0D1017")]),
            ("GRID", (0, 0), (-1, -1), 0.5, C_GRAY),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t_table)
    else:
        story.append(Paragraph("Datos históricos de precios en proceso de recopilación.", style_small))
    story.append(PageBreak())

    # ── Página 9: CTA ────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(Paragraph("¿Listo para invertir en " + nombre + "?", style_h1))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Nuestros asesores especializados en esta colonia pueden ayudarte a "
        "encontrar la propiedad ideal y guiarte en el proceso de compra.",
        style_body
    ))
    story.append(Spacer(1, 16))
    cta_table = Table(
        [[Paragraph("<b>Agenda una cita gratuita: desarrollosmx.io/cita</b>",
                    _style("cta", fontName="Helvetica-Bold", fontSize=11,
                           textColor=C_CREAM, alignment=TA_CENTER))]],
        colWidths=[PAGE_W - 1.2 * inch],
    )
    cta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_INDIGO),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    story.append(cta_table)
    story.append(PageBreak())

    # ── Página 10: Footer ────────────────────────────────────────────────────
    story.append(Spacer(1, 40))
    story.append(hr)
    story.append(Paragraph(
        "DesarrollosMX · Spatial Decision Intelligence Platform · CDMX",
        _style("footer", fontName="Helvetica", fontSize=8,
               textColor=colors.HexColor("#666677"), alignment=TA_CENTER)
    ))
    story.append(Paragraph(
        "Datos actualizados. Riesgos con flag estimado hasta integración INEGI completa.",
        _style("footer2", fontName="Helvetica", fontSize=7,
               textColor=colors.HexColor("#555566"), alignment=TA_CENTER)
    ))

    doc.build(story)
    return buf.getvalue()
