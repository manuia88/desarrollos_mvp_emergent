"""Phase 4 Batch 27 · routes — Mortgage Calculator (Infonavit/Fovissste/Banca).

Endpoints públicos (sin auth):
  POST /api/public/mortgage/calculate  — 3-source calc
  POST /api/public/mortgage/save       — Guarda lead + envía resumen email
"""
from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.mortgage_routes")

router = APIRouter(tags=["public-mortgage"])

# Rate limit: 20 req/min/IP (cálculo) · 5/min/IP (save)
_calc_store: dict = defaultdict(deque)
_save_store: dict = defaultdict(deque)


def _check_rl(store: dict, ip: str, limit: int) -> bool:
    key = hashlib.sha256(ip.encode()).hexdigest()[:16]
    now = time.monotonic()
    win = store[key]
    while win and now - win[0] > 60:
        win.popleft()
    if len(win) >= limit:
        return False
    win.append(now)
    return True


def _get_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_db(request: Request):
    return request.app.state.db


def _validate_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not e or "@" not in e or "." not in e.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Email inválido")
    return e


# ─── Pydantic ────────────────────────────────────────────────────────────────

class MortgageCalcBody(BaseModel):
    precio: float
    enganche_pct: float = 0.20
    plazo_anos: int = 20
    ingreso_mensual: float = 0.0
    edad: int = 30
    sbc: float = 0.0
    ahorro_voluntario: float = 0.0
    sueldo_basico: float = 0.0
    banco_filter: str = ""


class MortgageSaveBody(BaseModel):
    email: str
    accepted_terms: bool = True
    calculation: Dict[str, Any] = Field(default_factory=dict)
    propiedad_id: Optional[str] = None


class TourRequestBody(BaseModel):
    email: str
    accepted_terms: bool = True
    propiedad_id: Optional[str] = None
    propiedad_nombre: Optional[str] = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/api/public/mortgage/calculate")
async def calculate_mortgage(body: MortgageCalcBody, request: Request):
    """Calcula opciones de Infonavit + Fovissste + Banca privada."""
    ip = _get_ip(request)
    if not _check_rl(_calc_store, ip, 20):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intenta en 1 minuto.")

    if body.precio <= 0:
        raise HTTPException(status_code=400, detail="Precio debe ser mayor a 0")
    if body.plazo_anos < 1 or body.plazo_anos > 30:
        raise HTTPException(status_code=400, detail="Plazo debe estar entre 1 y 30 años")
    if body.enganche_pct < 0 or body.enganche_pct > 0.95:
        raise HTTPException(status_code=400, detail="Enganche % debe estar entre 0 y 0.95")
    if body.edad < 18 or body.edad > 80:
        raise HTTPException(status_code=400, detail="Edad debe estar entre 18 y 80")

    from services.mortgage_calculator import calculate_all
    result = calculate_all(
        precio=body.precio,
        enganche_pct=body.enganche_pct,
        plazo_anos=body.plazo_anos,
        ingreso_mensual=body.ingreso_mensual,
        edad=body.edad,
        sbc=body.sbc,
        ahorro_voluntario=body.ahorro_voluntario,
        sueldo_basico=body.sueldo_basico,
        banco_filter=body.banco_filter,
    )
    result["disclaimer"] = (
        "Cálculo referencial basado en parámetros públicos. No constituye oferta vinculante. "
        "Consulta con cada institución para condiciones exactas."
    )
    return result


@router.get("/api/public/mortgage/market-rate")
async def mortgage_market_rate(request: Request):
    """Tasa hipotecaria promedio del sistema (Banxico, cuadro CF303) — VIVA con fail-open.

    Orden: BanxicoEngine.lookup(CF303) live+cache → default oficial documentado
    (banxico_rates). Nunca lanza; si todo falla regresa el default con modo='fallback'.
    REUSA BanxicoEngine (cache 3-capas) y banxico_rates (fuente oficial). No duplica.
    """
    ip = _get_ip(request)
    if not _check_rl(_calc_store, ip, 30):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intenta en 1 minuto.")

    # CAT promedio: no hay serie SIE en el repo → default oficial documentado (CF303 CAT prom.)
    try:
        from banxico_rates import get_rate_meta
        cat_meta = get_rate_meta("hipoteca_cat_prom")
        cat_pct = round(float(cat_meta["valor"]) * 100, 2)
    except Exception:
        cat_meta, cat_pct = {}, 13.96

    # 1) Tasa fija promedio VIVA (serie CF303)
    try:
        from data_sources.banxico_engine import BanxicoEngine
        res = await BanxicoEngine(_get_db(request)).lookup("CF303")
        if res.get("ok") and res.get("value_latest") is not None:
            return {
                "ok": True,
                "serie": "CF303",
                "tasa_pct": round(float(res["value_latest"]), 2),
                "cat_pct": cat_pct,
                "fecha": res.get("date_latest"),
                "fuente": "Banxico SIE · CF303 (tasa fija promedio del sistema)",
                "modo": "vivo",
            }
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[market-rate] banxico live falló, uso default: {exc}")

    # 2) Fail-open: default oficial documentado (banxico_rates)
    try:
        from banxico_rates import get_rate_meta
        fija = get_rate_meta("hipoteca_fija_ref")
        return {
            "ok": True,
            "serie": "CF303",
            "tasa_pct": round(float(fija["valor"]) * 100, 2),
            "cat_pct": cat_pct,
            "fecha": fija.get("as_of"),
            "fuente": fija.get("fuente", "Banxico CF303 (fija, prom.)"),
            "modo": "default_oficial",
        }
    except Exception as exc:  # noqa: BLE001
        log.warning(f"[market-rate] default falló: {exc}")
        return {"ok": True, "serie": "CF303", "tasa_pct": 11.46, "cat_pct": cat_pct,
                "fecha": "2026-04", "fuente": "Banxico CF303 (fija, prom.)", "modo": "fallback"}


@router.post("/api/public/mortgage/save")
async def save_mortgage(body: MortgageSaveBody, request: Request):
    """Guarda el cálculo como lead capture + envía resumen por email."""
    ip = _get_ip(request)
    if not _check_rl(_save_store, ip, 5):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intenta en 1 minuto.")

    if not body.accepted_terms:
        raise HTTPException(status_code=400, detail="Debes aceptar los términos")

    email = _validate_email(body.email)
    db = _get_db(request)

    from services.lead_capture import capture_lead
    payload = {"calculation": body.calculation, "propiedad_id": body.propiedad_id}
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:20]

    lead = await capture_lead(
        db=db, email=email, source="mortgage_calc",
        payload=payload, ip_hash=ip_hash,
    )

    # Email opcional con resumen branded (best-effort)
    email_sent = await _send_mortgage_email(email, body.calculation)

    return {"saved": True, "capture_id": lead.get("capture_id"), "email_sent": email_sent}


@router.post("/api/public/virtual-tour/request")
async def request_virtual_tour(body: TourRequestBody, request: Request):
    """Captura una solicitud de notificación cuando el tour virtual esté listo."""
    ip = _get_ip(request)
    if not _check_rl(_save_store, ip, 5):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intenta en 1 minuto.")

    if not body.accepted_terms:
        raise HTTPException(status_code=400, detail="Debes aceptar los términos")

    email = _validate_email(body.email)
    db = _get_db(request)

    from services.lead_capture import capture_lead
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:20]
    lead = await capture_lead(
        db=db, email=email, source="virtual_tour_request",
        payload={
            "propiedad_id": body.propiedad_id,
            "propiedad_nombre": body.propiedad_nombre,
        },
        ip_hash=ip_hash,
    )
    return {"registered": True, "capture_id": lead.get("capture_id")}


async def _send_mortgage_email(to: str, calc: Dict[str, Any]) -> bool:
    """Email branded con resumen de cálculo. Reusa send_resend desde lead_capture."""
    try:
        from services.lead_capture import _send_email
    except Exception:
        return False

    inputs = calc.get("inputs", {}) if isinstance(calc, dict) else {}
    banca = (calc.get("banca") or [])[:5]

    def _row(b):
        viable = b.get("viable")
        color = "#22C55E" if viable else "#EF4444"
        return f"""
        <tr style="border-top:1px solid rgba(240,235,224,0.10);">
          <td style="padding:8px 10px;font-family:'DM Sans',Arial;font-size:13px;color:#F0EBE0;">{b.get('banco','—')}</td>
          <td style="padding:8px 10px;font-family:'DM Sans',Arial;font-size:13px;color:#F0EBE0;text-align:right;">${int(b.get('pago_mensual',0)):,}</td>
          <td style="padding:8px 10px;font-family:'DM Sans',Arial;font-size:12px;color:rgba(240,235,224,0.65);text-align:right;">{b.get('cat_pct','—')}%</td>
          <td style="padding:8px 10px;font-family:'DM Sans',Arial;font-size:11px;color:{color};text-align:right;font-weight:700;">{'Viable' if viable else 'No viable'}</td>
        </tr>
        """

    rows = "".join(_row(b) for b in banca)
    html = f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial,sans-serif;padding:32px 20px;max-width:580px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
      </div>
      <h1 style="font-family:'Outfit',Arial;font-weight:800;font-size:24px;color:#F0EBE0;margin:0 0 8px;letter-spacing:-0.02em;">Tu cálculo de hipoteca</h1>
      <p style="color:rgba(240,235,224,0.55);font-size:13px;margin:0 0 18px;">
        Precio ${int(inputs.get('precio',0)):,} · enganche {inputs.get('enganche_pct',0)}% · plazo {inputs.get('plazo_anos',0)} años · ingreso ${int(inputs.get('ingreso_mensual',0)):,}.
      </p>
      <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.03);border-radius:12px;overflow:hidden;border:1px solid rgba(240,235,224,0.10);">
        <thead><tr style="background:rgba(99,102,241,0.18);">
          <th style="padding:10px;text-align:left;font-family:'DM Sans',Arial;font-size:11px;color:#F0EBE0;letter-spacing:0.06em;text-transform:uppercase;">Banco</th>
          <th style="padding:10px;text-align:right;font-family:'DM Sans',Arial;font-size:11px;color:#F0EBE0;letter-spacing:0.06em;text-transform:uppercase;">Pago/mes</th>
          <th style="padding:10px;text-align:right;font-family:'DM Sans',Arial;font-size:11px;color:#F0EBE0;letter-spacing:0.06em;text-transform:uppercase;">CAT</th>
          <th style="padding:10px;text-align:right;font-family:'DM Sans',Arial;font-size:11px;color:#F0EBE0;letter-spacing:0.06em;text-transform:uppercase;">Estado</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <p style="color:rgba(240,235,224,0.40);font-size:11px;margin:16px 0 0;">
        Cálculo referencial — no constituye oferta vinculante.
      </p>
    </body></html>"""

    return await _send_email(
        to=to,
        subject="Tu cálculo de hipoteca · DesarrollosMX",
        html=html,
    )
