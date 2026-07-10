"""W4.14 — Investment Simulator API Routes.

POST /api/investment-simulator/simulate
GET  /api/investment-simulator/colonia/{slug}/baseline
POST /api/investment-simulator/stress-test

Rate limit: 30 req/min/IP. LFPDPPP IP hash log.
"""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

import investment_simulator_engine as eng
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

router = APIRouter()

LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")
_RL_BUCKET: Dict[str, Deque[float]] = defaultdict(deque)
RL_LIMIT = 30
RL_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    fwd =_dmx_canon_ip(request)
    return fwd or (request.client.host if request.client else "unknown")


def _rate_limit(ip: str) -> None:
    now = time.time()
    bucket = _RL_BUCKET[ip]
    while bucket and (now - bucket[0]) > RL_WINDOW_S:
        bucket.popleft()
    if len(bucket) >= RL_LIMIT:
        raise HTTPException(429, "rate_limit_exceeded")
    bucket.append(now)


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


def _db(request: Request):
    return request.app.state.db


# ─── POST /api/investment-simulator/simulate ─────────────────────────────────

class SimulateBody(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)  # SEGURIDAD (4ª pasada): rechaza NaN/Infinity → no envenena el AVM
    precio_entrada: float
    plazo_meses: int = 120
    m2: float = 80.0
    colonia_slug: str = "del-valle"
    apreciacion_anual_user_pct: Optional[float] = None
    financiamiento_pct: float = 0.80


# (v1 /simulate borrado 2026-06-16 · 0 callers · la UI usa /analyze)


# ─── GET /api/investment-simulator/colonia/{slug}/baseline ───────────────────

@router.get("/api/investment-simulator/colonia/{slug}/baseline")
async def colonia_baseline(slug: str, request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    db = _db(request)
    result = await eng.get_colonia_baseline(db, slug)
    return JSONResponse({"ok": True, **result})


# ─── POST /api/investment-simulator/stress-test ──────────────────────────────

@router.post("/api/investment-simulator/stress-test")
async def stress_test_endpoint(request: Request):
    ip = _client_ip(request)
    _rate_limit(ip)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(422, "invalid_json")
    result = await eng.stress_test(body)
    return JSONResponse({"ok": True, **result})


# ─── GET /api/investment-simulator/colonia/{slug}/comparables ────────────────

@router.get("/api/investment-simulator/colonia/{slug}/comparables")
async def comparables_endpoint(slug: str, request: Request, precio: float = 3_000_000.0):
    _rate_limit(_client_ip(request))
    db = _db(request)
    alts = await eng.compare_alternatives(db, slug, precio)
    return JSONResponse({"ok": True, "alternatives": alts})


# ═══════════════════════════════════════════════════════════════════════════════
# CALCULADORA COMPLETA — análisis brutal (contado + apalancado), comparar, autofill,
# renta mínima, captura de lead, guardar/compartir, analíticas (protegido).
# ═══════════════════════════════════════════════════════════════════════════════

class AnalyzeBody(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)  # SEGURIDAD (4ª pasada): rechaza NaN/Infinity → no envenena el AVM
    precio: float
    colonia_slug: Optional[str] = None
    anios_tenencia: int = 10
    financiamiento_pct: float = 0.80
    plazo_credito_anios: float = 20
    tasa_credito: Optional[float] = None          # decimal (0.115). None → tasa oficial
    apreciacion_anual: Optional[float] = None      # decimal (0.05)
    renta_mensual: Optional[float] = None
    rental_yield_anual: Optional[float] = None
    crecimiento_renta_anual: Optional[float] = None
    isr_renta_pct: Optional[float] = None
    isr_ganancia_pct: Optional[float] = None
    cetes_anual: Optional[float] = None
    vacancia_pct: Optional[float] = None


def _params_from(body: AnalyzeBody) -> dict:
    return {k: v for k, v in body.dict().items() if v is not None}


@router.post("/api/investment-simulator/analyze")
async def analyze_endpoint(body: AnalyzeBody, request: Request):
    """Análisis COMPLETO: corre al contado y con hipoteca, da veredicto y guarda la huella anónima."""
    ip = _client_ip(request)
    _rate_limit(ip)
    if body.precio <= 0:
        raise HTTPException(422, "precio_invalido")
    db = _db(request)
    params = _params_from(body)
    apalancado = eng.analizar_inversion(params, financiar=True)
    contado = eng.analizar_inversion(params, financiar=False)
    veredicto = eng.interpretar_resultado(apalancado, contado)
    # Capa 4 · huella anónima (no rompe la respuesta si falla)
    await eng.registrar_simulacion(db, params, apalancado, ip_hash=_ip_hash(ip))
    return JSONResponse({"ok": True, "apalancado": apalancado, "contado": contado, "veredicto": veredicto})


# (v1 /compare borrado 2026-06-16 · 0 callers)


@router.post("/api/investment-simulator/min-rent")
async def min_rent_endpoint(body: AnalyzeBody, request: Request):
    _rate_limit(_client_ip(request))
    if body.precio <= 0:
        raise HTTPException(422, "precio_invalido")
    return JSONResponse({"ok": True, **eng.renta_minima(_params_from(body))})


@router.get("/api/investment-simulator/colonia/{slug}/autofill")
async def autofill_endpoint(slug: str, request: Request, precio: Optional[float] = None, m2: float = 80.0):
    _rate_limit(_client_ip(request))
    db = _db(request)
    return JSONResponse({"ok": True, **await eng.autofill_calculadora(db, slug, precio, m2)})


class CaptureLeadBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    consent: bool = False
    params: dict = {}
    resultado: dict = {}


@router.post("/api/investment-simulator/capture-lead")
async def capture_lead_endpoint(body: CaptureLeadBody, request: Request):
    _rate_limit(_client_ip(request))
    if not body.consent:
        raise HTTPException(422, "consentimiento_requerido")
    db = _db(request)
    contacto = {"name": body.name, "email": body.email, "phone": body.phone, "consent": True}
    res = await eng.capturar_lead_simulacion(db, contacto, body.params or {}, body.resultado or {})
    if not res.get("ok"):
        raise HTTPException(400, res.get("reason") or "no_capturado")
    return JSONResponse({"ok": True, **res})


@router.post("/api/investment-simulator/save")
async def save_scenario_endpoint(request: Request):
    _rate_limit(_client_ip(request))
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(422, "invalid_json")
    db = _db(request)
    return JSONResponse({"ok": True, **await eng.guardar_escenario(db, body.get("params") or {}, body.get("resultado") or {})})


@router.get("/api/investment-simulator/scenario/{token}")
async def get_scenario_endpoint(token: str, request: Request):
    """FIX auditoría: 'Guardar y compartir' generaba /simulador?escenario={token} pero la ruta que lo servía
    se había borrado → el link no abría nada. Restaurada: rehidrata el escenario guardado."""
    return JSONResponse(await eng.obtener_escenario(_db(request), token))
