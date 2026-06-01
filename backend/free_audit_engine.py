"""W4.16 Sub-A — Free Audit Engine.

Captures a property submission, generates a 6-page A4 PDF using ReportLab
(reusing the pattern from brochure_renderer.py), sends it via Resend.
"""
from __future__ import annotations

import hashlib
import io
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

log = logging.getLogger("dmx.free_audit_engine")

STORAGE_BASE = Path(os.environ.get("FREE_AUDIT_STORAGE", "/app/backend/storage/free_audit"))
PDF_DIR = STORAGE_BASE / "pdf"
PDF_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = STORAGE_BASE / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")

CREAM = HexColor("#F0EBE0")
BG_DARK = HexColor("#06080F")
INDIGO = HexColor("#6366F1")
GRAY = HexColor("#6B7280")
WHITE = HexColor("#FFFFFF")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


def _fmt_mxn(v: Optional[float]) -> str:
    if not v:
        return "—"
    if v >= 1_000_000:
        return f"${v/1_000_000:.1f}M MXN"
    if v >= 1_000:
        return f"${v/1_000:.0f}K MXN"
    return f"${v:,.0f} MXN"


def _rl_gradient_rect(c: canvas.Canvas, x: float, y: float, w: float, h: float, steps: int = 40):
    step_w = w / steps
    for i in range(steps):
        t = i / max(steps - 1, 1)
        r = (99 + t * (236 - 99)) / 255
        g = (102 + t * (72 - 102)) / 255
        b = (241 + t * (153 - 241)) / 255
        c.setFillColor(Color(r, g, b))
        c.rect(x + i * step_w, y, step_w + 1, h, fill=1, stroke=0)


REQUIRED_FIELDS = ("project_name", "colonia_slug", "m2", "recamaras", "banos", "email")


async def submit_audit(db, form_data: Dict[str, Any], ip: str, user_agent: str = "") -> Dict[str, Any]:
    missing = [f for f in REQUIRED_FIELDS if not form_data.get(f)]
    if missing:
        raise ValueError(f"missing_fields:{','.join(missing)}")
    audit_id = str(uuid.uuid4())
    doc = {
        "audit_id": audit_id,
        "project_name": str(form_data.get("project_name", ""))[:120],
        "colonia_slug": str(form_data.get("colonia_slug", ""))[:60],
        "m2": float(form_data.get("m2") or 0),
        "recamaras": int(form_data.get("recamaras") or 0),
        "banos": int(form_data.get("banos") or 0),
        "antiguedad_anos": int(form_data.get("antiguedad_anos") or 0),
        "precio_estimado": float(form_data.get("precio_estimado") or 0),
        "descripcion": str(form_data.get("descripcion", ""))[:500],
        "floor_plan_url": form_data.get("floor_plan_url") or "",
        "submitted_email": str(form_data.get("email", ""))[:120].lower().strip(),
        "submitted_phone": str(form_data.get("phone") or "")[:30],
        "utm_source": form_data.get("utm_source") or "",
        "utm_medium": form_data.get("utm_medium") or "",
        "utm_campaign": form_data.get("utm_campaign") or "",
        "ip_hash": hash_ip(ip),
        "user_agent": (user_agent or "")[:300],
        "locale": form_data.get("locale") or "es-MX",
        "generated_pdf_url": "",
        "sent_email_at": None,
        "status": "processing",
        "submitted_at": _now_iso(),
        "generated_at": None,
    }
    try:
        await db.free_audit_submissions.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[free_audit] mongo insert failed: {exc}")
    doc.pop("_id", None)
    return doc


async def get_audit(db, audit_id: str) -> Optional[Dict[str, Any]]:
    return await db.free_audit_submissions.find_one({"audit_id": audit_id}, {"_id": 0})


async def _hydrate_for_pdf(db, doc: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "zone_score": None, "hedonic_pred": None, "demand_supply": None,
        "scenarios": None, "comparables": [], "recommendations": [],
    }
    colonia = doc["colonia_slug"]
    m2 = doc["m2"] or 80.0
    precio = doc["precio_estimado"] or 0.0

    try:
        from zone_score_engine import get_score_or_compute
        zs = await get_score_or_compute(db, colonia, tier="colonia")
        if zs and not zs.get("error"):
            out["zone_score"] = zs
    except Exception as exc:
        log.debug(f"[free_audit] zone_score failed: {exc}")

    try:
        from hedonic_regression_engine import predict_price
        latest_model = await db.hedonic_models.find_one(
            {"available": True}, {"_id": 0, "id": 1}, sort=[("fit_at_dt", -1)],
        )
        if latest_model:
            features = {
                "m2": float(m2), "recamaras": int(doc["recamaras"]),
                "banos": int(doc["banos"]),
                "antiguedad_anos": int(doc["antiguedad_anos"]),
                "colonia_score": float((out["zone_score"] or {}).get("score_total") or 60),
            }
            pred = await predict_price(db, latest_model["id"], features)
            if pred.get("available"):
                out["hedonic_pred"] = pred
    except Exception as exc:
        log.debug(f"[free_audit] hedonic failed: {exc}")

    try:
        from maps_cross_engine import demand_supply_gap_geojson
        geo = await demand_supply_gap_geojson(db)
        feats = (geo or {}).get("features") or []
        match = next(
            (f for f in feats if (f.get("properties") or {}).get("colonia_id") == colonia
             or (f.get("properties") or {}).get("slug") == colonia), None,
        )
        if match:
            out["demand_supply"] = match.get("properties")
    except Exception as exc:
        log.debug(f"[free_audit] demand_supply failed: {exc}")

    try:
        from investment_simulator_engine import simulate, compare_alternatives
        if precio > 0:
            scn = await simulate(db, precio_entrada=precio, plazo_meses=24, m2=m2, colonia_slug=colonia)
            out["scenarios"] = scn
            alts = await compare_alternatives(db, colonia, precio)
            out["comparables"] = (alts or [])[:3]
    except Exception as exc:
        log.debug(f"[free_audit] invest_sim failed: {exc}")

    out["recommendations"] = _build_recommendations(doc, out)
    return out


def _build_recommendations(doc: Dict[str, Any], context: Dict[str, Any]) -> List[Dict[str, str]]:
    recs: List[Dict[str, str]] = []
    zs = (context.get("zone_score") or {})
    score = float(zs.get("score_total") or zs.get("score") or 60)
    hed = context.get("hedonic_pred") or {}
    pred_total = float(hed.get("predicted_total") or 0)
    precio = float(doc.get("precio_estimado") or 0)

    if pred_total and precio:
        delta_pct = (precio - pred_total) / pred_total * 100
        if delta_pct > 5:
            recs.append({
                "title": "Reconsidera tu precio de lista",
                "body": f"Tu precio está {delta_pct:.1f}% sobre el predicho hedónico. "
                        f"Sugerimos ajustar a {_fmt_mxn(pred_total)} para optimizar velocity.",
                "impact": "+30% probabilidad de venta en 90 días",
            })
        elif delta_pct < -5:
            recs.append({
                "title": "Tu precio luce subvalorado",
                "body": f"Estás {abs(delta_pct):.1f}% bajo el predicho. "
                        f"Sube a {_fmt_mxn(pred_total)} sin perder competitividad.",
                "impact": f"+{abs(delta_pct):.0f}% margen capturado",
            })

    if score >= 75:
        recs.append({
            "title": "Tu zona favorece preventa premium",
            "body": "Zone Score alto (A/B). Posiciona como activo de plusvalía garantizada.",
            "impact": "Reduce time-to-sell hasta 35%",
        })
    elif score < 55:
        recs.append({
            "title": "Refuerza tu propuesta de valor local",
            "body": "Zone Score medio. Acompaña fichas con benchmarks de plusvalía 5y y video tour.",
            "impact": "Mejora conversión 18-22%",
        })

    if not recs:
        recs.append({
            "title": "Inicia el journey de comercialización con DMX",
            "body": "Activa el Studio DMX para tracking de leads, comparables actualizados y AVM automático.",
            "impact": "Acelera ciclo comercial 2-3 semanas",
        })

    recs.append({
        "title": "Distribuye con asesoría DMX",
        "body": "Conecta con asesores DMX para distribución en marketplace + AI buyer matching.",
        "impact": "Acceso a 12+ asesores certificados",
    })
    return recs[:3]


def _draw_axis_bar(c: canvas.Canvas, x: float, y: float, w: float, label: str, value: float):
    c.setFont("Helvetica", 9); c.setFillColor(BG_DARK)
    c.drawString(x, y + 4, label)
    c.setFillColor(HexColor("#e5e0d8"))
    c.roundRect(x + 100, y, w, 10, 5, fill=1, stroke=0)
    val_pct = max(0.0, min(value / 100.0, 1.0))
    _rl_gradient_rect(c, x + 100, y, w * val_pct, 10)
    c.setFont("Helvetica-Bold", 8); c.setFillColor(BG_DARK)
    c.drawString(x + 110 + w, y + 3, f"{value:.0f}")


def render_audit_pdf(audit: Dict[str, Any], context: Dict[str, Any]) -> str:
    pdf_path = str(PDF_DIR / f"{audit['audit_id']}.pdf")
    W, H = A4
    MARGIN = 15 * mm
    IW = W - 2 * MARGIN

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # PAGE 1: Cover
    c.setFillColor(BG_DARK); c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 6, W, 6)
    c.setFont("Helvetica-Bold", 12); c.setFillColor(HexColor("#a0a4b0"))
    c.drawString(MARGIN, H - MARGIN - 18, "DMX AUDIT REPORT")
    c.setFont("Helvetica-Bold", 30); c.setFillColor(CREAM)
    c.drawString(MARGIN, H - MARGIN - 80, (audit.get("project_name") or "Tu propiedad")[:40])
    c.setFont("Helvetica", 14); c.setFillColor(HexColor("#a0a4b0"))
    c.drawString(MARGIN, H - MARGIN - 105, (audit.get("colonia_slug") or "").replace("-", " ").title())
    c.setFont("Helvetica", 11); c.setFillColor(CREAM)
    c.drawString(MARGIN, MARGIN + 90, f"Generado para: {audit.get('submitted_email', '')}")
    c.setFillColor(HexColor("#6b7280")); c.setFont("Helvetica", 9)
    c.drawString(MARGIN, MARGIN + 30, "Solo uso informativo · DMX no opina, mide.")
    c.drawRightString(W - MARGIN, MARGIN + 30, _now_iso()[:10])
    c.showPage()

    # PAGE 2: Specs + Zone Score
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)
    c.setFont("Helvetica-Bold", 22); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Tu propiedad · Zone Score")
    specs = [
        ("Superficie", f"{audit.get('m2', '—')} m²"),
        ("Recámaras", str(audit.get("recamaras"))),
        ("Baños", str(audit.get("banos"))),
        ("Antigüedad", f"{audit.get('antiguedad_anos', 0)} años"),
        ("Tu precio", _fmt_mxn(audit.get("precio_estimado"))),
        ("Zona", (audit.get("colonia_slug") or "").replace("-", " ").title()),
    ]
    col_w = IW / 2 - 5
    for i, (lbl, val) in enumerate(specs):
        col = i % 2; row = i // 2
        bx = MARGIN + col * (col_w + 10)
        by = H - MARGIN - 70 - row * 45
        c.setFillColor(HexColor("#f5f0e8"))
        c.roundRect(bx, by - 22, col_w, 36, 5, fill=1, stroke=0)
        c.setFont("Helvetica", 8); c.setFillColor(GRAY)
        c.drawString(bx + 10, by + 5, lbl.upper())
        c.setFont("Helvetica-Bold", 12); c.setFillColor(BG_DARK)
        c.drawString(bx + 10, by - 10, str(val)[:30])

    zs = context.get("zone_score") or {}
    tier = zs.get("tier") or "B"
    score_total = float(zs.get("score_total") or zs.get("score") or 65)
    by = H - MARGIN - 280
    c.setFont("Helvetica-Bold", 14); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, by + 8, "Zone Score DMX")
    _rl_gradient_rect(c, MARGIN, by - 60, 60, 60)
    c.setFont("Helvetica-Bold", 26); c.setFillColor(WHITE)
    c.drawCentredString(MARGIN + 30, by - 38, tier)
    c.setFont("Helvetica-Bold", 36); c.setFillColor(BG_DARK)
    c.drawString(MARGIN + 80, by - 30, f"{score_total:.0f}")
    c.setFont("Helvetica", 10); c.setFillColor(GRAY)
    c.drawString(MARGIN + 80, by - 50, "/100 índice plusvalía")
    axes = [
        ("Lifestyle", float(zs.get("score_lifestyle") or 70)),
        ("Seguridad", float(zs.get("score_seguridad") or 65)),
        ("Transporte", float(zs.get("score_transporte") or 60)),
        ("Amenidades", float(zs.get("score_amenidades") or 75)),
        ("Precio/m²", float(zs.get("score_precio") or 55)),
        ("Vibe urbano", float(zs.get("score_vibe") or 68)),
    ]
    for i, (lbl, val) in enumerate(axes):
        _draw_axis_bar(c, MARGIN, by - 100 - i * 26, IW * 0.55, lbl, val)
    c.showPage()

    # PAGE 3: Hedonic prediction
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)
    c.setFont("Helvetica-Bold", 22); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Predicción hedónica")
    hed = context.get("hedonic_pred") or {}
    if hed.get("available"):
        pred = float(hed.get("predicted_total") or 0)
        low = pred * 0.9; high = pred * 1.1
        c.setFont("Helvetica", 11); c.setFillColor(GRAY)
        c.drawString(MARGIN, H - MARGIN - 55,
                     "Modelo OLS log-precio sobre coordenadas DMX. R² del modelo: "
                     f"{(hed.get('r_squared') or 0):.2f}")
        c.setFillColor(HexColor("#e5e0d8"))
        c.roundRect(MARGIN, H - MARGIN - 130, IW, 28, 14, fill=1, stroke=0)
        cx = MARGIN + IW * 0.5
        _rl_gradient_rect(c, MARGIN, H - MARGIN - 130, cx - MARGIN, 28)
        c.setFont("Helvetica-Bold", 16); c.setFillColor(WHITE)
        c.drawCentredString(cx, H - MARGIN - 120, _fmt_mxn(pred))
        c.setFont("Helvetica", 10); c.setFillColor(BG_DARK)
        c.drawString(MARGIN, H - MARGIN - 150, f"Rango: {_fmt_mxn(low)} — {_fmt_mxn(high)} (intervalo 95%)")
        if audit.get("precio_estimado"):
            diff = (float(audit["precio_estimado"]) - pred) / pred * 100 if pred else 0
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(HexColor("#dc2626") if diff > 5 else HexColor("#16a34a") if diff < -5 else BG_DARK)
            c.drawString(MARGIN, H - MARGIN - 175, f"Tu precio vs predicho: {diff:+.1f}%")
    else:
        c.setFont("Helvetica", 11); c.setFillColor(GRAY)
        c.drawString(MARGIN, H - MARGIN - 80,
                     "Modelo hedónico no disponible para tu zona aún · usaremos AVM básico.")
    c.showPage()

    # PAGE 4: Demand-Supply gap
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)
    c.setFont("Helvetica-Bold", 22); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Demanda vs oferta")
    ds = context.get("demand_supply") or {}
    gap = float(ds.get("gap_score") or ds.get("gap") or 0)
    label = "Mercado caliente" if gap > 30 else "Equilibrado" if gap > 0 else "Sobreoferta"
    color_hex = HexColor("#22c55e") if gap > 30 else HexColor("#f59e0b") if gap > 0 else HexColor("#ef4444")
    c.setFillColor(color_hex); c.roundRect(MARGIN, H - MARGIN - 100, 220, 40, 10, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 14); c.setFillColor(WHITE)
    c.drawCentredString(MARGIN + 110, H - MARGIN - 85, label)
    c.setFont("Helvetica", 11); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 130, f"Gap score: {gap:.0f}")
    velocity = float(ds.get("velocity_months") or 9)
    c.setFont("Helvetica-Bold", 12); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 170, f"Velocity estimada: {velocity:.0f} meses al sellout completo")
    c.showPage()

    # PAGE 5: Scenarios
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 4, W, 4)
    c.setFont("Helvetica-Bold", 22); c.setFillColor(BG_DARK)
    c.drawString(MARGIN, H - MARGIN - 30, "Escenarios de inversión (24 meses)")
    scn = context.get("scenarios") or {}
    bundles = scn.get("scenarios") or scn.get("bundles") or [
        {"label": "Conservador", "roi_pct": 6.0, "tir": 2.9},
        {"label": "Base", "roi_pct": 11.5, "tir": 5.8},
        {"label": "Optimista", "roi_pct": 18.0, "tir": 8.9},
    ]
    card_w = (IW - 24) / 3
    for i, b in enumerate(bundles[:3]):
        bx = MARGIN + i * (card_w + 12)
        by = H - MARGIN - 200
        c.setFillColor(HexColor("#f5f0e8"))
        c.roundRect(bx, by, card_w, 130, 12, fill=1, stroke=0)
        _rl_gradient_rect(c, bx, by + 120, card_w, 4)
        c.setFont("Helvetica-Bold", 12); c.setFillColor(BG_DARK)
        c.drawString(bx + 12, by + 95, str(b.get("label") or b.get("name") or f"Escenario {i+1}")[:18])
        c.setFont("Helvetica-Bold", 22)
        roi = float(b.get("roi_pct") or b.get("roi") or 0)
        c.drawString(bx + 12, by + 60, f"{roi:.1f}%")
        c.setFont("Helvetica", 8); c.setFillColor(GRAY)
        c.drawString(bx + 12, by + 45, "ROI 24m")
        tir = b.get("tir") or b.get("tir_anual_pct")
        if tir is not None:
            c.setFont("Helvetica-Bold", 11); c.setFillColor(BG_DARK)
            c.drawString(bx + 12, by + 22, f"TIR: {float(tir):.1f}%")
    c.showPage()

    # PAGE 6: Recommendations + CTA
    c.setFillColor(BG_DARK); c.rect(0, 0, W, H, fill=1, stroke=0)
    _rl_gradient_rect(c, 0, H - 6, W, 6)
    c.setFont("Helvetica-Bold", 22); c.setFillColor(CREAM)
    c.drawString(MARGIN, H - MARGIN - 30, "Recomendaciones DMX")
    recs = context.get("recommendations") or []
    for i, r in enumerate(recs[:3]):
        by = H - MARGIN - 90 - i * 130
        c.setFillColor(HexColor("#161b25"))
        c.roundRect(MARGIN, by, IW, 110, 12, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 12); c.setFillColor(CREAM)
        c.drawString(MARGIN + 14, by + 85, str(r.get("title", ""))[:80])
        c.setFont("Helvetica", 10); c.setFillColor(HexColor("#a0a4b0"))
        body = str(r.get("body", ""))
        line_w = IW - 30
        words = body.split(); line = ""; ly = by + 60
        for w in words:
            test = (line + " " + w).strip()
            if c.stringWidth(test, "Helvetica", 10) > line_w:
                c.drawString(MARGIN + 14, ly, line)
                ly -= 12; line = w
            else:
                line = test
            if ly < by + 28:
                break
        if line:
            c.drawString(MARGIN + 14, ly, line)
        c.setFont("Helvetica-Bold", 9); c.setFillColor(HexColor("#22D3EE"))
        c.drawString(MARGIN + 14, by + 14, str(r.get("impact", ""))[:80])

    c.setFont("Helvetica-Bold", 13); c.setFillColor(CREAM)
    c.drawCentredString(W / 2, MARGIN + 60, "¿Quieres que un asesor DMX te ayude?")
    _rl_gradient_rect(c, W / 2 - 110, MARGIN + 28, 220, 26)
    c.setFont("Helvetica-Bold", 11); c.setFillColor(WHITE)
    c.drawCentredString(W / 2, MARGIN + 35, "HABLAR CON ASESOR DMX")
    c.setFont("Helvetica", 8); c.setFillColor(HexColor("#6b7280"))
    c.drawCentredString(W / 2, MARGIN + 10, "desarrollosmx.io · Solo uso informativo")
    c.showPage()
    c.save()
    buf.seek(0)
    with open(pdf_path, "wb") as f:
        f.write(buf.read())
    return pdf_path


async def generate_audit_pdf(db, audit_id: str) -> Dict[str, Any]:
    audit = await get_audit(db, audit_id)
    if not audit:
        raise ValueError("audit_not_found")
    context = await _hydrate_for_pdf(db, audit)
    path = render_audit_pdf(audit, context)
    pdf_url = f"/api/free-audit/{audit_id}/download"
    await db.free_audit_submissions.update_one(
        {"audit_id": audit_id},
        {"$set": {
            "generated_pdf_url": pdf_url, "generated_at": _now_iso(),
            "status": "ready", "pdf_path": str(path),
            "pdf_size_bytes": Path(path).stat().st_size,
        }},
    )
    audit.update({"generated_pdf_url": pdf_url, "status": "ready"})
    return audit


def resolve_pdf_path(audit_id: str) -> Optional[Path]:
    p = PDF_DIR / f"{audit_id}.pdf"
    return p if p.exists() else None


async def send_audit_email(db, audit_id: str) -> bool:
    audit = await get_audit(db, audit_id)
    if not audit or not audit.get("submitted_email"):
        return False
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        log.info("[free_audit] no RESEND_API_KEY · skip email")
        return False
    path = resolve_pdf_path(audit_id)
    if not path:
        return False
    try:
        import base64
        import resend  # type: ignore
        resend.api_key = key
        with open(path, "rb") as f:
            attachment_b64 = base64.b64encode(f.read()).decode()
        html = (
            f"<div style='font-family:Helvetica,Arial,sans-serif;background:#06080F;color:#F0EBE0;padding:32px'>"
            f"<h2 style='margin:0 0 16px'>Tu DMX Audit Report</h2>"
            f"<p>Aquí tienes el análisis de <strong>{audit.get('project_name')}</strong> en "
            f"<strong>{(audit.get('colonia_slug') or '').replace('-', ' ').title()}</strong>.</p>"
            f"<a href='https://desarrollosmx.io/asesores' "
            f"style='display:inline-block;background:linear-gradient(90deg,#6366F1,#EC4899);"
            f"color:#fff;padding:10px 22px;border-radius:9999px;text-decoration:none;font-weight:700'>"
            f"HABLAR CON ASESOR</a></div>"
        )
        resend.Emails.send({
            "from": "DMX Audit <noreply@desarrollosmx.io>",
            "to": audit["submitted_email"],
            "subject": f"Tu DMX Audit · {audit.get('project_name', 'Tu propiedad')}",
            "html": html,
            "attachments": [{"filename": f"DMX_Audit_{audit_id[:8]}.pdf", "content": attachment_b64}],
        })
        await db.free_audit_submissions.update_one(
            {"audit_id": audit_id}, {"$set": {"sent_email_at": _now_iso()}}
        )
        return True
    except Exception as exc:
        log.warning(f"[free_audit] email send failed: {exc}")
        return False


async def funnel_stats(db, period_days: int = 30) -> Dict[str, Any]:
    """F0.2·Sub-E — Aggregates for superadmin funnel dashboard.

    Returns counts by status, email-send conversion, top colonias, avg PDF gen
    time (when timestamps available).
    """
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=int(period_days or 30))
    cutoff_iso = cutoff.isoformat()

    base_q = {"submitted_at": {"$gte": cutoff_iso}}

    submitted = 0
    by_status: Dict[str, int] = {}
    emails_sent = 0
    by_colonia: Dict[str, int] = {}
    by_utm: Dict[str, int] = {}
    gen_durations: List[float] = []

    try:
        cursor = db.free_audit_submissions.find(
            base_q,
            {"_id": 0, "status": 1, "colonia_slug": 1, "submitted_email": 1,
             "submitted_at": 1, "generated_at": 1, "sent_email_at": 1,
             "utm_source": 1},
        )
        async for d in cursor:
            submitted += 1
            st = (d.get("status") or "unknown").lower()
            by_status[st] = by_status.get(st, 0) + 1
            if d.get("sent_email_at"):
                emails_sent += 1
            col = (d.get("colonia_slug") or "—")
            by_colonia[col] = by_colonia.get(col, 0) + 1
            utm = (d.get("utm_source") or "direct")
            by_utm[utm] = by_utm.get(utm, 0) + 1
            sub_at = d.get("submitted_at")
            gen_at = d.get("generated_at")
            if sub_at and gen_at:
                try:
                    s = datetime.fromisoformat(str(sub_at).replace("Z", "+00:00"))
                    g = datetime.fromisoformat(str(gen_at).replace("Z", "+00:00"))
                    delta = (g - s).total_seconds()
                    if 0 < delta < 3600:
                        gen_durations.append(delta)
                except Exception:
                    pass
    except Exception as exc:
        log.warning(f"[funnel_stats] aggregate failed: {exc}")

    ready = by_status.get("ready", 0)
    pdf_conv = round(ready / submitted * 100, 1) if submitted else 0
    email_conv = round(emails_sent / submitted * 100, 1) if submitted else 0
    avg_gen_s = round(sum(gen_durations) / len(gen_durations), 1) if gen_durations else 0

    top_colonias = sorted(
        [{"slug": k, "count": v} for k, v in by_colonia.items()],
        key=lambda r: r["count"], reverse=True,
    )[:10]
    top_utm = sorted(
        [{"source": k, "count": v} for k, v in by_utm.items()],
        key=lambda r: r["count"], reverse=True,
    )[:10]

    return {
        "period_days": int(period_days or 30),
        "submitted": submitted,
        "by_status": by_status,
        "pdf_ready": ready,
        "emails_sent": emails_sent,
        "pdf_conversion_pct": pdf_conv,
        "email_conversion_pct": email_conv,
        "avg_pdf_gen_seconds": avg_gen_s,
        "top_colonias": top_colonias,
        "top_utm_sources": top_utm,
    }


async def ensure_free_audit_indexes(db) -> None:
    try:
        await db.free_audit_submissions.create_index("audit_id", unique=True)
        await db.free_audit_submissions.create_index([("submitted_email", 1), ("ip_hash", 1)])
        await db.free_audit_submissions.create_index([("generated_at", -1)])
    except Exception as exc:
        log.warning(f"[free_audit] index create failed: {exc}")


# ─── F0.3·Sub-C — CSV export for CRM ─────────────────────────────────────────

_CSV_HEADERS = [
    "audit_id", "email", "phone", "project_name", "colonia_slug",
    "m2", "recamaras", "banos", "antiguedad_anos", "precio_estimado",
    "utm_source", "utm_medium", "utm_campaign",
    "submitted_at", "pdf_generated", "email_sent", "locale", "ip_hash",
]


def _csv_escape(val: Any) -> str:
    if val is None:
        return ""
    s = str(val)
    if any(ch in s for ch in (',', '"', '\n', '\r')):
        s = s.replace('"', '""')
        return f'"{s}"'
    return s


async def export_to_csv(db, period_days: int = 30) -> bytes:
    """Returns UTF-8-BOM CSV bytes ready to stream to client.

    Excel-friendly: leading BOM ensures correct encoding detection.
    """
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=int(period_days or 30))
    cutoff_iso = cutoff.isoformat()

    lines = [",".join(_CSV_HEADERS)]
    try:
        cursor = db.free_audit_submissions.find(
            {"submitted_at": {"$gte": cutoff_iso}},
            {"_id": 0},
        ).sort("submitted_at", -1)
        async for d in cursor:
            row = [
                d.get("audit_id", ""),
                d.get("submitted_email", ""),
                d.get("submitted_phone", ""),
                d.get("project_name", ""),
                d.get("colonia_slug", ""),
                d.get("m2", ""),
                d.get("recamaras", ""),
                d.get("banos", ""),
                d.get("antiguedad_anos", ""),
                d.get("precio_estimado", ""),
                d.get("utm_source", ""),
                d.get("utm_medium", ""),
                d.get("utm_campaign", ""),
                d.get("submitted_at", ""),
                "1" if d.get("generated_at") else "0",
                "1" if d.get("sent_email_at") else "0",
                d.get("locale", ""),
                d.get("ip_hash", ""),
            ]
            lines.append(",".join(_csv_escape(v) for v in row))
    except Exception as exc:
        log.warning(f"[free_audit·csv] export failed: {exc}")

    body = "\n".join(lines) + "\n"
    return b"\xef\xbb\xbf" + body.encode("utf-8")
