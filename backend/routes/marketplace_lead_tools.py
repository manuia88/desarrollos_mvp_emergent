"""Phase 4 Batch 26 · Marketplace Lead-Capture Tools (Reporte + Quiz + Comparador).

Endpoints públicos (sin auth):
  POST /api/public/colonia/{colonia_id}/report-request — Genera PDF + envía email + lead capture
  POST /api/public/quiz/submit                          — Match top 3 colonias + email + lead capture
  POST /api/public/compare                              — Matriz comparativa (colonias o propiedades)
  POST /api/public/compare/pdf                          — PDF de la matriz comparativa
"""
from __future__ import annotations

import base64
import hashlib
import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.lead_tools")

router = APIRouter(tags=["public-lead-tools"])

# ─── Rate limiters (5 req/min por IP por endpoint) ────────────────────────────
_RATE_WINDOW = 60
_REPORT_LIMIT = 5
_QUIZ_LIMIT = 5
_COMPARE_LIMIT = 10  # comparador es read-only, más permisivo

_report_store: dict = defaultdict(deque)
_quiz_store: dict = defaultdict(deque)
_compare_store: dict = defaultdict(deque)


def _check_rl(store: dict, ip: str, limit: int) -> bool:
    key = hashlib.sha256(ip.encode()).hexdigest()[:16]
    now = time.monotonic()
    window = store[key]
    while window and now - window[0] > _RATE_WINDOW:
        window.popleft()
    if len(window) >= limit:
        return False
    window.append(now)
    return True


def _get_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()[:20]


def _get_db(request: Request):
    return request.app.state.db


def _validate_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not e or "@" not in e or "." not in e.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Email inválido")
    if len(e) > 200:
        raise HTTPException(status_code=400, detail="Email demasiado largo")
    return e


# ─── Pydantic models ──────────────────────────────────────────────────────────

class ReportRequestBody(BaseModel):
    email: str
    accepted_terms: bool = True


class QuizSubmitBody(BaseModel):
    email: str
    answers: Dict[str, Any] = Field(default_factory=dict)
    accepted_terms: bool = True


class CompareBody(BaseModel):
    entity_type: str = "colonia"  # 'colonia' | 'property'
    ids: List[str] = Field(default_factory=list)


class ComparePdfBody(BaseModel):
    entity_type: str = "colonia"
    ids: List[str] = Field(default_factory=list)


# ─── C3 · Reporte de Colonia ──────────────────────────────────────────────────

@router.post("/api/public/colonia/{colonia_id}/report-request")
async def request_colonia_report(
    colonia_id: str,
    body: ReportRequestBody,
    request: Request,
):
    """
    Genera el reporte PDF de una colonia, lo envía por email y registra el lead.
    Rate limit: 5 req/min por IP.
    Devuelve: { capture_id, email_sent, pdf_base64 (para descarga inmediata) }
    """
    ip = _get_ip(request)
    if not _check_rl(_report_store, ip, _REPORT_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Máximo 5 reportes por minuto.",
        )

    if not body.accepted_terms:
        raise HTTPException(status_code=400, detail="Debes aceptar los términos")

    email = _validate_email(body.email)
    db = _get_db(request)

    # Importes locales para evitar ciclos al boot
    from services.colonia_intelligence import get_colonia_full
    from services.colonia_report_pdf import generate_colonia_report_pdf
    from services.lead_capture import capture_lead, send_report_email

    # 1. Obtener datos de colonia
    colonia_data = await get_colonia_full(db, colonia_id)
    if not colonia_data or not colonia_data.get("colonia"):
        raise HTTPException(status_code=404, detail="Colonia no encontrada")

    # 2. Generar PDF (sync, CPU bound — ReportLab; ok para <500ms)
    try:
        pdf_bytes = generate_colonia_report_pdf(colonia_data)
    except Exception as ex:
        log.exception(f"[report] PDF generation failed: {ex}")
        raise HTTPException(status_code=500, detail="Error generando el reporte")

    nombre = colonia_data["colonia"].get("nombre", "Colonia")

    # 3. Capturar lead
    lead = await capture_lead(
        db=db,
        email=email,
        source="colonia_report",
        payload={
            "colonia_id": colonia_id,
            "colonia_nombre": nombre,
        },
        ip_hash=_ip_hash(ip),
    )

    # 4. Enviar email (no bloquea respuesta si falla)
    email_sent = await send_report_email(
        to=email,
        colonia_nombre=nombre,
        pdf_bytes=pdf_bytes,
    )

    # 5. Devolver PDF en base64 para descarga inmediata
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    return {
        "capture_id": lead.get("capture_id"),
        "colonia_nombre": nombre,
        "email_sent": email_sent,
        "pdf_base64": pdf_b64,
        "pdf_filename": f"reporte_{nombre.lower().replace(' ', '_')}.pdf",
    }


# ─── C4 · Quiz de Colonia Ideal ───────────────────────────────────────────────

@router.post("/api/public/quiz/submit")
async def submit_quiz(body: QuizSubmitBody, request: Request):
    """
    Match top 3 colonias según respuestas del quiz, captura lead y envía email.
    Rate limit: 5 req/min por IP.
    """
    ip = _get_ip(request)
    if not _check_rl(_quiz_store, ip, _QUIZ_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Intenta en 1 minuto.",
        )

    if not body.accepted_terms:
        raise HTTPException(status_code=400, detail="Debes aceptar los términos")

    email = _validate_email(body.email)

    if not body.answers or len(body.answers) < 3:
        raise HTTPException(
            status_code=400,
            detail="Responde al menos 3 preguntas para obtener tu match",
        )

    db = _get_db(request)

    from services.colonia_quiz import match_colonias
    from services.lead_capture import capture_lead, send_quiz_results_email

    matches = await match_colonias(body.answers, top_n=3)

    # Enriquecer con projects_count desde DB
    for m in matches:
        try:
            cnt = await db.developments.count_documents(
                {"colonia_id": m["colonia_id"], "stage": {"$ne": "sold_out"}}
            )
            m["projects_count"] = cnt
        except Exception:
            pass

    # Lead capture
    lead = await capture_lead(
        db=db,
        email=email,
        source="quiz",
        payload={
            "answers": body.answers,
            "matches": [
                {"colonia_id": m["colonia_id"], "match_pct": m["match_pct"]}
                for m in matches
            ],
        },
        ip_hash=_ip_hash(ip),
    )

    email_sent = await send_quiz_results_email(to=email, matches=matches)

    return {
        "capture_id": lead.get("capture_id"),
        "matches": matches,
        "email_sent": email_sent,
    }


# ─── C5 · Comparador 3-way ────────────────────────────────────────────────────

@router.post("/api/public/compare")
async def compare(body: CompareBody, request: Request):
    """
    Genera matriz comparativa entre 1-3 entidades (colonias o propiedades).
    Rate limit: 10 req/min por IP.
    """
    ip = _get_ip(request)
    if not _check_rl(_compare_store, ip, _COMPARE_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Intenta en 1 minuto.",
        )

    if body.entity_type not in ("colonia", "property"):
        raise HTTPException(
            status_code=400,
            detail="entity_type debe ser 'colonia' o 'property'",
        )
    if not body.ids or len(body.ids) > 3:
        raise HTTPException(
            status_code=400,
            detail="Proporciona entre 1 y 3 IDs para comparar",
        )

    db = _get_db(request)
    from services.colonia_comparator import compare_entities

    matrix = await compare_entities(db, body.entity_type, body.ids)
    if matrix.get("error"):
        return JSONResponse(status_code=422, content=matrix)

    return matrix


@router.post("/api/public/compare/pdf")
async def compare_pdf(body: ComparePdfBody, request: Request):
    """
    Genera PDF descargable de la matriz comparativa.
    Rate limit: 10 req/min por IP.
    """
    ip = _get_ip(request)
    if not _check_rl(_compare_store, ip, _COMPARE_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes. Intenta en 1 minuto.",
        )

    if body.entity_type not in ("colonia", "property"):
        raise HTTPException(status_code=400, detail="entity_type inválido")
    if not body.ids or len(body.ids) > 3:
        raise HTTPException(status_code=400, detail="Proporciona entre 1 y 3 IDs")

    db = _get_db(request)
    from services.colonia_comparator import compare_entities, generate_comparison_pdf

    matrix = await compare_entities(db, body.entity_type, body.ids)
    if matrix.get("error"):
        return JSONResponse(status_code=422, content=matrix)

    pdf_bytes = await generate_comparison_pdf(matrix)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=comparacion_desarrollosmx.pdf",
        },
    )
