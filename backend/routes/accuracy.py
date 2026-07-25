"""W5.15 Parte 1 Sub-E — Accuracy routes (8 endpoints + notif hooks).

Publicos T0:
  GET /api/avm/fsd/{property_id}
  GET /api/accuracy/meta-dashboard
  GET /api/accuracy/export.csv?period=30d|90d|365d

Superadmin:
  GET  /api/accuracy/per-zone
  GET  /api/accuracy/calibration-curve
  GET  /api/superadmin/accuracy/debug
  GET  /api/superadmin/accuracy/zone-weights
  POST /api/superadmin/accuracy/trigger-drift-check
"""
from __future__ import annotations

import csv
import io
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

import accuracy_engine
import drift_detector

log = logging.getLogger("dmx.routes.accuracy")

router = APIRouter()


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Rate-limit (60 req/min/IP para endpoints publicos pesados) ──────────────

_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_WINDOW_S = 60


def _rate_limit(request: Request, key: str) -> None:
    ip = request.client.host if request.client else "anon"
    bucket_key = f"{key}:{ip}"
    bucket = _RATE_BUCKET[bucket_key]
    now = time.time()
    while bucket and (now - bucket[0]) > _RATE_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= 60:
        raise HTTPException(status_code=429, detail="Rate limit excedido · 60/min")
    bucket.append(now)


# ─── Endpoint 1 — FSD per-property (publico) ─────────────────────────────────

@router.get("/api/avm/fsd/{property_id}")
async def get_fsd(property_id: str, request: Request):
    _rate_limit(request, "fsd")
    db = _db(request)
    pred = await db.avm_predictions.find_one(
        {"property_id": property_id}, {"_id": 0},
        sort=[("prediction_date_dt", -1)],
    )
    if not pred:
        return {"available": False, "reason": "no_prediction", "property_id": property_id}
    return {
        "available": True,
        "property_id": property_id,
        "zone_slug": pred.get("zone_slug"),
        "value": pred.get("fsd_value") or pred.get("predicted_value"),
        "low_estimate": pred.get("low_estimate"),
        "high_estimate": pred.get("high_estimate"),
        "fsd_pct": pred.get("fsd_pct"),
        "confidence_lvl": pred.get("confidence_lvl"),
        "feature_breakdown": pred.get("feature_breakdown") or {},
        "model_id": pred.get("model_id"),
        "prediction_date": pred.get("prediction_date"),
    }


# ─── Endpoint 2 — Meta dashboard (publico Fitch-style) ───────────────────────

@router.get("/api/accuracy/meta-dashboard")
async def meta_dashboard(request: Request):
    _rate_limit(request, "meta")
    db = _db(request)
    mape = await accuracy_engine.compute_mape_rolling(db, None, days=30)
    if not mape.get("available"):
        # ETA: dias para llegar a 20 cierres a ritmo actual (rough)
        n = int(mape.get("sample_size") or 0)
        eta = max(1, (accuracy_engine.MIN_SAMPLE - n) * 7)
        return {
            "state": "insufficient_data",
            "message": "Data acumulandose",
            "sample_size": n,
            "min_required": accuracy_engine.MIN_SAMPLE,
            "eta_days": eta,
            "last_updated": _now().isoformat(),
        }
    hit = await accuracy_engine.compute_hit_rate(db, None, days=30)
    cal = await accuracy_engine.calibration_curve(db, days=90, bins=10)
    mape_pct = float(mape.get("mape_pct") or 0.0)
    if mape_pct < 8:
        conf_label = "ALTA"
    elif mape_pct < 15:
        conf_label = "MEDIA"
    else:
        conf_label = "BAJA"
    return {
        "state": "available",
        "global_mape_30d": mape["mape_pct"],
        "hit_rate": hit.get("hit_rate") if hit.get("available") else None,
        "sample_size": mape["sample_size"],
        "confidence_label": conf_label,
        "calibration_curve_data": cal.get("bins") if cal.get("available") else [],
        "calibration_error": cal.get("calibration_error"),
        "last_updated": _now().isoformat(),
    }


# ─── Endpoint 3 — Per-zone (superadmin) ──────────────────────────────────────

@router.get("/api/accuracy/per-zone")
async def per_zone(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    zones = await drift_detector.list_top_zones_for_drift(db, limit=50)
    out = []
    for z in zones:
        mape = await accuracy_engine.compute_mape_rolling(db, z, days=30)
        hit = await accuracy_engine.compute_hit_rate(db, z, days=30)
        zw = await db.zone_weights.find_one(
            {"zone_slug": z}, {"_id": 0, "version": 1, "r2_score": 1, "sample_size": 1},
        )
        mape_pct = mape.get("mape_pct") if mape.get("available") else None
        if mape_pct is None:
            conf = "BAJA"
        elif mape_pct < 8:
            conf = "ALTA"
        elif mape_pct < 15:
            conf = "MEDIA"
        else:
            conf = "BAJA"
        out.append({
            "zone_slug": z,
            "mape_30d": mape_pct,
            "hit_rate": hit.get("hit_rate") if hit.get("available") else None,
            "sample_size": mape.get("sample_size") or 0,
            "confidence_label": conf,
            "weights_version": (zw or {}).get("version"),
            "weights_r2": (zw or {}).get("r2_score"),
        })
    return {"zones": out, "count": len(out)}


# ─── Endpoint 4 — Calibration curve (superadmin) ─────────────────────────────

@router.get("/api/accuracy/calibration-curve")
async def calibration_curve_endpoint(request: Request, days: int = 90, bins: int = 10):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    days = max(1, min(int(days), 365))
    bins = max(2, min(int(bins), 20))
    return await accuracy_engine.calibration_curve(db, days=days, bins=bins)


# ─── Endpoint 5 — Debug per-property (superadmin) ────────────────────────────

@router.get("/api/superadmin/accuracy/debug")
async def debug_property(request: Request, property_id: str, days: int = 30):
    from permissions import require_superadmin
    await require_superadmin(request)
    days = max(1, min(int(days), 365))
    db = _db(request)
    cutoff = _now() - timedelta(days=days)
    rows = await db.prediction_accuracy_log.find(
        {"property_id": property_id, "close_date_dt": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("close_date_dt", -1).to_list(100)
    pred = await db.avm_predictions.find_one(
        {"property_id": property_id}, {"_id": 0},
        sort=[("prediction_date_dt", -1)],
    )
    return {
        "property_id": property_id,
        "days": days,
        "latest_prediction": pred,
        "accuracy_log": rows,
        "count": len(rows),
    }


# ─── Endpoint 6 — Zone weights aprendidos (superadmin) ──────────────────────

@router.get("/api/superadmin/accuracy/zone-weights")
async def zone_weights_list(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    rows = []
    cursor = db.zone_weights.find({}, {"_id": 0}).sort("optimized_at_dt", -1)
    async for r in cursor:
        rows.append({
            "zone_slug": r.get("zone_slug"),
            "weights": r.get("weights"),
            "intercept": r.get("intercept"),
            "r2_score": r.get("r2_score"),
            "sample_size": r.get("sample_size"),
            "optimized_at": r.get("optimized_at"),
            "version": r.get("version"),
        })
    return {"zones": rows, "count": len(rows)}


# ─── Endpoint 7 — Trigger drift manual (superadmin) ──────────────────────────

@router.post("/api/superadmin/accuracy/trigger-drift-check")
async def trigger_drift_check(request: Request, zone_slug: str):
    from permissions import require_superadmin
    user = await require_superadmin(request)
    if not zone_slug:
        raise HTTPException(status_code=422, detail="zone_slug es requerido")
    db = _db(request)
    result = await drift_detector.check_drift(db, zone_slug)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": getattr(user, "user_id", "superadmin"), "role": "superadmin"},
            action="accuracy_trigger_drift_check",
            entity_type="zone_accuracy",
            entity_id=zone_slug,
            before=None,
            after=result,
            request=request,
        )
    except Exception as exc:
        log.warning(f"[accuracy.trigger_drift] audit failed: {exc}")
    return result


# ─── Endpoint 8 — CSV export ─────────────────────────────────────────────────

@router.get("/api/accuracy/export.csv")
async def export_csv(request: Request, period: str = "30d"):
    _rate_limit(request, "export")
    # SEGURIDAD (auditoría A–Z 07-24): esta exportación entrega, propiedad por propiedad,
    # lo que el modelo predijo contra el precio real de cierre. Respondía sin sesión.
    from permissions import require_superadmin
    await require_superadmin(request)
    days_map = {"30d": 30, "90d": 90, "365d": 365}
    if period not in days_map:
        raise HTTPException(status_code=422, detail="period debe ser 30d, 90d o 365d")
    days = days_map[period]
    db = _db(request)
    cutoff = _now() - timedelta(days=days)
    cursor = db.prediction_accuracy_log.find(
        {"close_date_dt": {"$gte": cutoff}}, {"_id": 0},
    ).sort("close_date_dt", -1)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "close_date", "zone_slug", "property_id", "predicted_value", "actual_value",
        "error_abs", "error_pct", "fsd_pct_at_prediction", "confidence_lvl", "was_within_range",
    ])
    n = 0
    async for r in cursor:
        writer.writerow([
            (r.get("close_date") or "")[:10],
            r.get("zone_slug") or "",
            r.get("property_id") or "",
            r.get("predicted_value") or 0,
            r.get("actual_value") or 0,
            r.get("error_abs") or 0,
            r.get("error_pct") or 0,
            r.get("fsd_pct_at_prediction") or "",
            r.get("confidence_lvl") or "",
            "1" if r.get("was_within_range") else "0",
        ])
        n += 1
    log.info(f"[accuracy] export.csv period={period} rows={n}")
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="accuracy_{period}.csv"'},
    )


# ─── Endpoint 9 — PDF export Fitch-style (T0 publico · rate-limit 10/min/IP) ──

@router.get("/api/accuracy/export.pdf")
async def export_pdf(request: Request, period: str = "30d"):
    # SEGURIDAD (auditoría A–Z 07-24): mismo caso que export.csv — entrega predicho vs precio real
    # de cierre por propiedad, y respondía sin sesión.
    from permissions import require_superadmin
    await require_superadmin(request)
    # Rate-limit mas estricto: 10/min/IP
    _rate_limit_pdf(request)
    days_map = {"30d": 30, "90d": 90, "365d": 365}
    if period not in days_map:
        raise HTTPException(status_code=422, detail="period debe ser 30d, 90d o 365d")
    days = days_map[period]
    db = _db(request)

    # Recopilar data
    meta = await accuracy_engine.compute_mape_rolling(db, None, days=days)
    hit = await accuracy_engine.compute_hit_rate(db, None, days=days)
    pct = await accuracy_engine.compute_percentile_errors(db, None, days=days)
    cal = await accuracy_engine.calibration_curve(db, days=days, bins=10)
    zones = await drift_detector.list_top_zones_for_drift(db, limit=10)
    per_zone_rows = []
    for z in zones:
        m = await accuracy_engine.compute_mape_rolling(db, z, days=days)
        h = await accuracy_engine.compute_hit_rate(db, z, days=days)
        per_zone_rows.append({
            "zone_slug": z,
            "mape": m.get("mape_pct"),
            "hit_rate": h.get("hit_rate"),
            "sample_size": m.get("sample_size"),
        })

    # Drift events ultimos N dias via audit_immutable
    drift_events = []
    try:
        cutoff = _now() - timedelta(days=days)
        cursor = db.audit_immutable.find(
            {"action": "drift_detected", "timestamp": {"$gte": cutoff.isoformat()}},
            {"_id": 0, "entity_id": 1, "after_state": 1, "timestamp": 1},
        ).sort("timestamp", -1).limit(20)
        async for d in cursor:
            drift_events.append(d)
    except Exception:
        pass

    pdf_bytes = _render_accuracy_pdf(period, meta, hit, pct, cal, per_zone_rows, drift_events)

    # Audit
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "anon", "role": "anon"},
            action="accuracy_pdf_export",
            entity_type="accuracy_report",
            entity_id=period,
            before=None,
            after={"period": period, "size_bytes": len(pdf_bytes)},
            request=request,
        )
    except Exception as exc:
        log.warning(f"[accuracy.pdf] audit failed: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="accuracy_report_{period}.pdf"'},
    )


_RATE_BUCKET_PDF: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))


def _rate_limit_pdf(request: Request) -> None:
    ip = request.client.host if request.client else "anon"
    bucket = _RATE_BUCKET_PDF[ip]
    now = time.time()
    while bucket and (now - bucket[0]) > 60:
        bucket.popleft()
    if len(bucket) >= 10:
        raise HTTPException(status_code=429, detail="Rate limit excedido · 10/min para PDF")
    bucket.append(now)


def _render_accuracy_pdf(
    period: str,
    meta: Dict[str, Any],
    hit: Dict[str, Any],
    pct: Dict[str, Any],
    cal: Dict[str, Any],
    per_zone_rows: list,
    drift_events: list,
) -> bytes:
    """Render Fitch-style PDF via reportlab (mismo stack que brochure_renderer W4.9)."""
    import io as _io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.pdfgen import canvas

    BG = HexColor("#06080F")
    CREAM = HexColor("#F0EBE0")
    INDIGO = HexColor("#6366F1")
    ROSE = HexColor("#EC4899")
    GRAY = HexColor("#6B7280")
    GREEN = HexColor("#22C55E")
    ORANGE = HexColor("#F59E0B")

    buf = _io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    margin = 18 * mm
    page_num = [0]
    total_pages_estimate = 4

    def _new_page():
        c.setFillColor(BG)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        page_num[0] += 1

    def _footer():
        c.setFont("Helvetica", 7.5)
        c.setFillColor(GRAY)
        c.drawString(margin, 12 * mm, "Datos auditables en cadena SHA-256 · DesarrollosMX 2026")
        c.drawRightString(W - margin, 12 * mm, f"Pagina {page_num[0]} de {total_pages_estimate}")

    def _header(title: str):
        c.setFillColor(CREAM)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin, H - 14 * mm, "DESARROLLOSMX  ·  REPORTE DE PRECISION INSTITUCIONAL")
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawRightString(W - margin, H - 14 * mm, f"Periodo: {period}  ·  Generado: {_now().strftime('%Y-%m-%d %H:%M UTC')}")
        c.setStrokeColor(INDIGO)
        c.setLineWidth(0.7)
        c.line(margin, H - 16 * mm, W - margin, H - 16 * mm)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(margin, H - 26 * mm, title)

    # ── Page 1: Cover + KPIs ──────────────────────────────────────────────
    _new_page()
    _header("Reporte de Precision Institucional")
    y = H - 38 * mm
    c.setFont("Helvetica", 11)
    c.setFillColor(CREAM)
    c.drawString(margin, y, "Resumen Ejecutivo")
    c.setStrokeColor(INDIGO)
    c.line(margin, y - 2, margin + 50 * mm, y - 2)
    y -= 12 * mm

    def _kpi(x, label, value, color=INDIGO):
        c.setFillColor(color)
        c.setFont("Helvetica", 7.5)
        c.drawString(x, y + 16 * mm, label.upper())
        c.setFillColor(CREAM)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(x, y + 4 * mm, str(value))

    mape_str = f"{meta.get('mape_pct', '—'):.2f}%" if meta.get("available") else "—"
    hit_str = f"{(hit.get('hit_rate', 0) * 100):.1f}%" if hit.get("available") else "—"
    sample_str = str(meta.get("sample_size") or 0)
    conf = "ALTA" if (meta.get("mape_pct") or 99) < 8 else "MEDIA" if (meta.get("mape_pct") or 99) < 15 else "BAJA"
    p90 = f"{pct.get('p90', 0):.2f}%" if pct.get("available") else "—"
    p95 = f"{pct.get('p95', 0):.2f}%" if pct.get("available") else "—"
    _kpi(margin,            "MAPE",         mape_str, INDIGO)
    _kpi(margin + 45 * mm,  "HIT RATE",     hit_str,  GREEN)
    _kpi(margin + 90 * mm,  "SAMPLE SIZE",  sample_str, ROSE)
    _kpi(margin + 135 * mm, "CONFIANZA",    conf,     ORANGE)
    y -= 30 * mm
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawString(margin, y, f"P90 error: {p90}    ·    P95 error: {p95}    ·    Calibration error: {cal.get('calibration_error', '—')}")
    _footer()
    c.showPage()

    # ── Page 2: Methodology ────────────────────────────────────────────────
    _new_page()
    _header("Metodologia")
    y = H - 38 * mm
    c.setFillColor(CREAM)
    c.setFont("Helvetica", 10)
    paragraphs = [
        "El modelo AVM (Automated Valuation Model) de DesarrollosMX utiliza regresion hedonica OLS",
        "sobre transacciones recientes por colonia. Cada prediccion incluye un intervalo de confianza",
        "del 80% (FSD - Full-spectrum Diagnostic) calculado a partir del RMSE de los residuales del",
        "modelo entrenado para la zona.",
        "",
        "El error MAPE (Mean Absolute Percentage Error) se mide al cierre real de cada lead que pasa",
        "a estado 'cerrado_ganado': comparamos el valor predicho con el precio efectivo de venta.",
        "",
        "Cuando la zona acumula mas de 50 cierres en 365 dias, entrenamos pesos especificos via",
        "Ridge regression (alpha=1.0). Si el R2 del modelo zone-specific supera al modelo global,",
        "el predictor del AVM bascula automaticamente al zone-specific.",
        "",
        "Detectamos drift comparando MAPE rolling 30d contra el baseline 180d. Si la diferencia",
        "supera +10 puntos porcentuales y no hubo retrain en los ultimos 7 dias, disparamos un",
        "retrain del modelo y notificamos al equipo superadmin.",
        "",
        "Toda esta cadena de decisiones queda registrada en audit immutable SHA-256.",
    ]
    for line in paragraphs:
        c.drawString(margin, y, line)
        y -= 6 * mm
    _footer()
    c.showPage()

    # ── Page 3: Per-zone table ─────────────────────────────────────────────
    _new_page()
    _header("Precision por colonia (top 10)")
    y = H - 38 * mm
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(margin, y, "COLONIA")
    c.drawString(margin + 65 * mm, y, "MAPE")
    c.drawString(margin + 90 * mm, y, "HIT RATE")
    c.drawString(margin + 120 * mm, y, "SAMPLE")
    y -= 4 * mm
    c.setStrokeColor(INDIGO)
    c.line(margin, y, W - margin, y)
    y -= 6 * mm
    c.setFillColor(CREAM)
    c.setFont("Helvetica", 9.5)
    if not per_zone_rows:
        c.setFillColor(GRAY)
        c.drawString(margin, y, "Sin data suficiente para desglose por colonia.")
        y -= 6 * mm
    for r in per_zone_rows:
        c.setFillColor(CREAM)
        c.drawString(margin, y, str(r.get("zone_slug") or "")[:30])
        c.drawString(margin + 65 * mm, y, f"{r.get('mape', '—'):.2f}%" if r.get("mape") is not None else "—")
        hr = r.get("hit_rate")
        c.drawString(margin + 90 * mm, y, f"{(hr * 100):.1f}%" if hr is not None else "—")
        c.drawString(margin + 120 * mm, y, str(r.get("sample_size") or 0))
        y -= 6 * mm
        if y < 25 * mm:
            break
    _footer()
    c.showPage()

    # ── Page 4: Drift events + calibration summary ─────────────────────────
    _new_page()
    _header("Eventos de drift detectados")
    y = H - 38 * mm
    c.setFillColor(CREAM)
    c.setFont("Helvetica", 9.5)
    if not drift_events:
        c.setFillColor(GRAY)
        c.drawString(margin, y, "Sin eventos de drift en el periodo.")
    else:
        for d in drift_events[:14]:
            after = d.get("after_state") or {}
            line = (
                f"{(d.get('timestamp') or '')[:16].replace('T', ' ')}  ·  "
                f"{d.get('entity_id', '—')}  ·  Δ {after.get('delta_pp', '—')}pp  ·  "
                f"retrain {'OK' if after.get('retrain_triggered') else '—'}"
            )
            c.drawString(margin, y, line)
            y -= 6 * mm
            if y < 30 * mm:
                break

    # Calibration summary
    y -= 6 * mm
    c.setFillColor(CREAM)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Calibracion del modelo")
    y -= 6 * mm
    c.setFont("Helvetica", 9.5)
    if cal.get("available"):
        c.drawString(margin, y, f"Calibration error: {cal.get('calibration_error'):.4f}  ·  Bins con data: {len([b for b in cal.get('bins', []) if b.get('sample', 0) > 0])} / {len(cal.get('bins', []))}")
    else:
        c.setFillColor(GRAY)
        c.drawString(margin, y, "Sin data suficiente para reliability diagram en este periodo.")
    _footer()
    c.showPage()

    c.save()
    return buf.getvalue()

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("fsd_accuracy", plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="FSD Accuracy")
_w5ff4_register_feature("forecast_accuracy", plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="Forecast Accuracy")
