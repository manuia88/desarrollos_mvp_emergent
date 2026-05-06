"""Phase 4 Batch 26 · services — Colonia/Property 3-way Comparator.

Genera matriz de comparación y PDF con winners.
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.comparator")

METRIC_LABELS_COLONIA = [
    {"key": "avg_price_m2",        "label": "Precio promedio / m²",  "type": "number",  "higher_is": False},
    {"key": "score_seguridad",     "label": "Seguridad",              "type": "pct",     "higher_is": True},
    {"key": "score_movilidad",     "label": "Movilidad",              "type": "pct",     "higher_is": True},
    {"key": "score_plusvalia",     "label": "Plusvalía",              "type": "pct",     "higher_is": True},
    {"key": "score_vida",          "label": "Calidad de vida",        "type": "pct",     "higher_is": True},
    {"key": "score_comercio",      "label": "Comercio",               "type": "pct",     "higher_is": True},
    {"key": "momentum",            "label": "Momentum 90d",           "type": "text",    "higher_is": True},
    {"key": "projects_count",      "label": "Proyectos activos",      "type": "number",  "higher_is": True},
    {"key": "risk_flood",          "label": "Riesgo inundación",      "type": "number",  "higher_is": False},
    {"key": "risk_seismic",        "label": "Riesgo sísmico",         "type": "number",  "higher_is": False},
    {"key": "twin_similarity",     "label": "Climate Twin",           "type": "text",    "higher_is": True},
]

METRIC_LABELS_PROPERTY = [
    {"key": "price_from",          "label": "Precio desde",           "type": "number",  "higher_is": False},
    {"key": "m2_min",              "label": "m² mínimos",             "type": "number",  "higher_is": True},
    {"key": "bedrooms_min",        "label": "Recámaras mín.",         "type": "number",  "higher_is": True},
    {"key": "amenities_count",     "label": "Amenidades",             "type": "number",  "higher_is": True},
    {"key": "stage",               "label": "Etapa",                  "type": "text",    "higher_is": None},
    {"key": "colonia",             "label": "Colonia",                "type": "text",    "higher_is": None},
    {"key": "score_seguridad",     "label": "Seguridad colonia",      "type": "pct",     "higher_is": True},
    {"key": "score_plusvalia",     "label": "Plusvalía colonia",      "type": "pct",     "higher_is": True},
]


async def _build_colonia_entity(db, colonia_id: str) -> Optional[Dict[str, Any]]:
    from services.colonia_intelligence import get_colonia_full
    data = await get_colonia_full(db, colonia_id)
    if not data:
        return None
    scores = data.get("scores", {})
    risks = data.get("risks", {})
    twin = data.get("climate_twin", {})
    return {
        "id": colonia_id,
        "nombre": data["colonia"]["nombre"],
        "alcaldia": data["colonia"]["alcaldia"],
        "avg_price_m2": data.get("avg_price_m2", 0),
        "score_seguridad": scores.get("seguridad"),
        "score_movilidad": scores.get("movilidad"),
        "score_plusvalia": scores.get("plusvalia"),
        "score_vida": scores.get("vida"),
        "score_comercio": scores.get("comercio"),
        "momentum": data.get("momentum_label", "—"),
        "projects_count": data.get("projects_count", 0),
        "risk_flood": risks.get("flood"),
        "risk_seismic": risks.get("seismic"),
        "twin_similarity": f"{twin.get('city', '—')} ({twin.get('similarity_pct', 0)}%)",
    }


async def _build_property_entity(db, dev_id: str) -> Optional[Dict[str, Any]]:
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS_BY_ID

    # Check DB first
    try:
        db_dev = await db.developments.find_one(
            {"$or": [{"id": dev_id}, {"slug": dev_id}]},
            {"_id": 0},
        )
    except Exception:
        db_dev = None

    # Fallback to static
    static_dev = next((d for d in DEVELOPMENTS if d["id"] == dev_id or d.get("slug") == dev_id), None)
    dev = db_dev or static_dev
    if not dev:
        return None

    colonia_id = dev.get("colonia_id", "")
    colonia_scores: Dict = {}
    try:
        c = COLONIAS_BY_ID.get(colonia_id, {})
        colonia_scores = c.get("scores", {})
    except Exception:
        pass

    m2_range = dev.get("m2_range", "")
    m2_min = 0
    if m2_range:
        try:
            m2_min = int(str(m2_range).split("-")[0].strip().replace("m²", ""))
        except Exception:
            pass

    beds_range = dev.get("bedrooms_range", "")
    beds_min = 0
    if beds_range:
        try:
            beds_min = int(str(beds_range).split("-")[0].strip())
        except Exception:
            pass

    amenities = dev.get("amenities", [])
    amenities_count = len(amenities) if isinstance(amenities, list) else 0

    return {
        "id": dev_id,
        "nombre": dev.get("name", dev_id),
        "colonia": dev.get("colonia", "—"),
        "price_from": dev.get("price_from", 0),
        "m2_min": m2_min,
        "bedrooms_min": beds_min,
        "amenities_count": amenities_count,
        "stage": dev.get("stage", "—"),
        "score_seguridad": colonia_scores.get("seguridad"),
        "score_plusvalia": colonia_scores.get("plusvalia"),
    }


def _find_winner(values: List[Any], higher_is: Optional[bool]) -> Optional[int]:
    """Devuelve índice del ganador. None si tipo text o todos iguales."""
    if higher_is is None:
        return None
    numeric = []
    for v in values:
        try:
            numeric.append(float(str(v).replace("%", "").replace("+", "").split("(")[0].strip()))
        except Exception:
            numeric.append(None)
    if all(v is None for v in numeric):
        return None
    valid = [(i, v) for i, v in enumerate(numeric) if v is not None]
    if not valid:
        return None
    if higher_is:
        return max(valid, key=lambda x: x[1])[0]
    else:
        return min(valid, key=lambda x: x[1])[0]


def _format_value(key: str, value: Any, entity_type: str) -> str:
    if value is None:
        return "—"
    if key in ("avg_price_m2", "price_from"):
        try:
            v = int(value)
            return f"${v:,}" if v < 1_000_000 else f"${v / 1_000_000:.1f}M"
        except Exception:
            return str(value)
    if key in ("score_seguridad", "score_movilidad", "score_plusvalia", "score_vida", "score_comercio"):
        return f"{value}/100"
    return str(value)


async def compare_entities(
    db,
    entity_type: str,
    ids: List[str],
) -> Dict[str, Any]:
    """
    Genera la matriz de comparación.
    entity_type: 'colonia' | 'property'
    ids: list de 1-3 IDs
    """
    if entity_type not in ("colonia", "property"):
        return {"error": "entity_type debe ser 'colonia' o 'property'"}
    if len(ids) < 1 or len(ids) > 3:
        return {"error": "Proporciona entre 1 y 3 IDs"}

    # Build entities
    entities = []
    for eid in ids:
        if entity_type == "colonia":
            e = await _build_colonia_entity(db, eid)
        else:
            e = await _build_property_entity(db, eid)
        if e:
            entities.append(e)

    if not entities:
        return {"error": "No se encontraron entidades con los IDs proporcionados"}

    metric_defs = METRIC_LABELS_COLONIA if entity_type == "colonia" else METRIC_LABELS_PROPERTY

    metrics = []
    for m in metric_defs:
        key = m["key"]
        values = [e.get(key) for e in entities]
        formatted = [_format_value(key, v, entity_type) for v in values]
        winner_idx = _find_winner(values, m.get("higher_is")) if len(entities) > 1 else None
        metrics.append({
            "label": m["label"],
            "type": m["type"],
            "values": formatted,
            "raw_values": values,
            "winner_idx": winner_idx,
        })

    return {
        "entity_type": entity_type,
        "entities": [{"id": e["id"], "nombre": e["nombre"]} for e in entities],
        "metrics": metrics,
    }


async def generate_comparison_pdf(matrix: Dict[str, Any]) -> bytes:
    """Genera PDF con la matriz de comparación."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER

    C_BG = colors.HexColor("#06080F")
    C_CREAM = colors.HexColor("#F0EBE0")
    C_INDIGO = colors.HexColor("#6366F1")
    C_GRAY = colors.HexColor("#3A3D4A")
    C_WINNER = colors.HexColor("#1E2040")
    PAGE_W, _ = letter

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            rightMargin=0.5 * inch, leftMargin=0.5 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.5 * inch)

    def _sty(name, **kwargs):
        from reportlab.lib.styles import getSampleStyleSheet
        base = getSampleStyleSheet()["Normal"]
        return ParagraphStyle(name, parent=base, **kwargs)

    story = []

    # Header
    banner = Table(
        [[Paragraph(f"<b>COMPARACIÓN · DESARROLLOSMX</b>",
                    _sty("b", fontName="Helvetica-Bold", fontSize=11,
                         textColor=C_CREAM, alignment=TA_CENTER))]],
        colWidths=[PAGE_W - inch],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_INDIGO),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(banner)
    story.append(Spacer(1, 14))

    entities = matrix.get("entities", [])
    et = matrix.get("entity_type", "colonia")
    story.append(Paragraph(
        f"Comparación de {len(entities)} {'colonias' if et == 'colonia' else 'propiedades'}",
        _sty("h1", fontName="Helvetica-Bold", fontSize=16, textColor=C_CREAM, spaceAfter=8),
    ))

    # Tabla comparativa
    metrics = matrix.get("metrics", [])
    n = len(entities)
    col_w = (PAGE_W - inch) / (n + 1)

    # Header row
    header = [Paragraph("<b>Métrica</b>", _sty("th", fontName="Helvetica-Bold", fontSize=8, textColor=C_CREAM))]
    for e in entities:
        header.append(Paragraph(f"<b>{e['nombre'][:25]}</b>",
                                _sty("th2", fontName="Helvetica-Bold", fontSize=8,
                                     textColor=C_CREAM, alignment=TA_CENTER)))

    rows = [header]
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), C_INDIGO),
        ("TEXTCOLOR", (0, 0), (-1, 0), C_CREAM),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, C_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]

    for ri, m in enumerate(metrics):
        row_i = ri + 1
        row = [Paragraph(m["label"], _sty("ml", fontName="Helvetica", fontSize=8, textColor=C_CREAM))]
        winner = m.get("winner_idx")
        for ci, val in enumerate(m.get("values", [])):
            is_winner = winner == ci
            txt_color = C_CREAM if not is_winner else colors.HexColor("#A5B4FC")
            row.append(Paragraph(str(val),
                                 _sty(f"v{ri}{ci}", fontName="Helvetica-Bold" if is_winner else "Helvetica",
                                      fontSize=8, textColor=txt_color, alignment=TA_CENTER)))
            if is_winner:
                style_cmds.append(("BACKGROUND", (ci + 1, row_i), (ci + 1, row_i), C_WINNER))

        # Padding rows
        while len(row) < n + 1:
            row.append(Paragraph("—", _sty("em", fontName="Helvetica", fontSize=8, textColor=C_CREAM, alignment=TA_CENTER)))
        rows.append(row)

    cw = [col_w * 1.6] + [col_w * 0.8] * n
    comp_table = Table(rows, colWidths=cw)
    comp_table.setStyle(TableStyle(style_cmds))
    story.append(comp_table)
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "Generado por DesarrollosMX · desarrollosmx.com",
        _sty("footer", fontName="Helvetica", fontSize=7,
             textColor=colors.HexColor("#555566"), alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()
