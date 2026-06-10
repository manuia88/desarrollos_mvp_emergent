"""
DMX · F2.6 — El Estudio de Mercado Vivo (ruta dev/superadmin).
GET /api/dev/estudio-mercado?colonia_id=&categoria=  → estudio completo fusionando los motores F2.
Auth developer/superadmin. FAIL-OPEN. Cero deuda.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["estudio_mercado"])
log = logging.getLogger("dmx.routes_estudio_mercado")

ROLES = {"developer_admin", "developer_member", "developer_director", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ROLES:
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/api/dev/estudio-mercado")
async def estudio_mercado(request: Request,
                          colonia_id: Optional[str] = Query(None),
                          categoria: str = Query("media")):
    """Estudio de Mercado Vivo de una colonia — fusiona demanda, producto, oferta y zona."""
    await _auth(request)
    from estudio_mercado_engine import generar_estudio
    return await generar_estudio(_db(request), colonia_id, categoria)


@router.get("/api/dev/absorcion")
async def absorcion(request: Request, colonia_id: str = Query(...)):
    """Curva de absorción por cohorte + comparables de una colonia (F2.7 · reusable)."""
    await _auth(request)
    from absorcion_engine import curva_absorcion
    return await curva_absorcion(_db(request), colonia_id=colonia_id)


@router.get("/api/dev/perfil-zona")
async def perfil_zona_ep(request: Request, colonia_id: str = Query(...)):
    """Perfil de zona unificado (score+ciclo+servicios) + qué le falta (F2.8 · reusable)."""
    await _auth(request)
    from perfil_zona_engine import perfil_zona
    return await perfil_zona(_db(request), colonia_id)


@router.get("/api/dev/memo-inversionista")
async def memo_inversionista_ep(request: Request,
                                colonia_id: str = Query(...),
                                precio: Optional[float] = Query(None, ge=0),
                                m2: Optional[float] = Query(None, ge=0),
                                plazo_meses: int = Query(24, ge=6, le=360)):
    """Memo de inversionista: rendimiento + perfil de inquilino + comercio PB (F2.10)."""
    await _auth(request)
    from inversionista_engine import memo_inversionista
    return await memo_inversionista(_db(request), colonia_id, precio, m2, plazo_meses)


@router.get("/api/dev/comercio-pb")
async def comercio_pb_ep(request: Request, colonia_id: str = Query(...)):
    """¿Conviene comercio en planta baja? (F2.10 · reusable)."""
    await _auth(request)
    from inversionista_engine import comercio_pb
    return await comercio_pb(_db(request), colonia_id)


@router.get("/api/dev/amenidades-ranker")
async def amenidades_ranker_ep(request: Request, colonia_id: Optional[str] = Query(None)):
    """Ranker de amenidades en 2 ejes (precio hedónico + deseo de la demanda) (F2.9)."""
    await _auth(request)
    from amenidades_engine import ranker_amenidades
    return await ranker_amenidades(_db(request), colonia_id)


@router.get("/api/dev/cuota-recomendada")
async def cuota_recomendada_ep(request: Request,
                               m2: float = Query(..., gt=0, le=2000),
                               amenidades: Optional[str] = Query(None),
                               colonia_id: Optional[str] = Query(None)):
    """Cuota de mantenimiento sugerida desde el paquete de amenidades, vs disposición real (F2.9)."""
    await _auth(request)
    from amenidades_engine import recomendar_cuota
    amen = [a.strip() for a in (amenidades or "").split(",") if a.strip()]
    return await recomendar_cuota(_db(request), m2, amen, colonia_id)


@router.get("/api/dev/tono-marketing")
async def tono_marketing_ep(request: Request, colonia_id: str = Query(...)):
    """Tono de marketing de la zona (perfil psicográfico → insumo del copy de landings) (F2.11)."""
    await _auth(request)
    from data_seed import COLONIAS  # tier por colonia
    col = next((c for c in COLONIAS if str(c.get("id")) == str(colonia_id)
                or c.get("slug") == colonia_id), {})
    from preferencias_engine import perfil_psicografico
    return perfil_psicografico(col.get("tier"))


@router.get("/api/dev/deseabilidad/{dev_id}/{unit_id}")
async def deseabilidad_ep(request: Request, dev_id: str, unit_id: str):
    """Deseabilidad de UNA unidad vs otras al mismo precio (estudio 4S) (F2.11)."""
    await _auth(request)
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == dev_id), None)
    unit = next((u for u in (dev or {}).get("units", [])
                 if u["id"] == unit_id or u.get("unit_number") == unit_id), None) if dev else None
    if not dev or not unit:
        raise HTTPException(404, "Unidad no encontrada")
    from preferencias_engine import score_deseabilidad
    return await score_deseabilidad(_db(request), unit, dev)


@router.post("/api/dev/estudio-mercado/guardar")
async def estudio_mercado_guardar(request: Request,
                                  colonia_id: str = Query(...),
                                  categoria: str = Query("media")):
    """Guarda una versión fechada del estudio (historial). Reusa estudio_mercado_engine.guardar_estudio."""
    user = await _auth(request)
    from estudio_mercado_engine import guardar_estudio
    return await guardar_estudio(_db(request), getattr(user, "user_id", "") or "", colonia_id, categoria)


@router.get("/api/dev/simulador-palancas/factores")
async def simulador_factores_ep(request: Request):
    """Catálogo de factores simulables + sus opciones aprendidas (F4.2)."""
    await _auth(request)
    from simulador_palancas_engine import factores
    return await factores(_db(request))


@router.get("/api/dev/simulador-palancas")
async def simulador_palancas_ep(request: Request,
                                factor: str = Query("recamaras"),
                                de: Optional[str] = Query(None),
                                a: str = Query(...)):
    """Qué Pasaría Si: proyecta el impacto de un cambio de producto con las palancas aprendidas (F4.1/F4.2)."""
    await _auth(request)
    from simulador_palancas_engine import simular
    return await simular(_db(request), factor, de, a)


@router.get("/api/dev/estudio-mercado/propuestas")
async def estudio_mercado_propuestas(request: Request):
    """Autopiloto: el Cerebro detecta colonias cuyo dato cambió vs el último estudio guardado (F3.4)."""
    user = await _auth(request)
    from estudio_autopiloto_engine import detectar_cambios
    return await detectar_cambios(_db(request), getattr(user, "user_id", "") or "")


@router.post("/api/dev/estudio-mercado/regenerar")
async def estudio_mercado_regenerar(request: Request,
                                    colonia_id: str = Query(...),
                                    categoria: str = Query("media")):
    """Aprobar la jugada del Cerebro: resuelve la predicción previa vs la realidad y guarda versión nueva (F3.4)."""
    user = await _auth(request)
    from estudio_autopiloto_engine import regenerar
    return await regenerar(_db(request), getattr(user, "user_id", "") or "", colonia_id, categoria)


@router.get("/api/dev/estudio-mercado/historial")
async def estudio_mercado_historial(request: Request,
                                    colonia_id: Optional[str] = Query(None)):
    """Historial de estudios guardados (versiones). Filtra por colonia si se pasa. FAIL-OPEN."""
    user = await _auth(request)
    db = _db(request)
    owner = getattr(user, "user_id", "") or ""
    q = {"owner_id": owner, "type": "estudio"}
    if colonia_id:
        q["colonia_id"] = colonia_id
    items = await db.developer_reports.find(q, {"_id": 0}).sort("generated_at", -1).to_list(50)
    return {"items": items, "total": len(items)}


@router.get("/api/dev/estudio-mercado/pdf")
async def estudio_mercado_pdf(request: Request,
                             colonia_id: str = Query(...),
                             categoria: str = Query("media")):
    """Estudio de Mercado Vivo + Memo como PDF con marca DMX (F3.1). Reusa el stack del CMA."""
    user = await _auth(request)
    from estudio_pdf_renderer import render_estudio_pdf
    from estudio_mercado_engine import generar_estudio
    try:
        pdf_bytes = await render_estudio_pdf(_db(request), colonia_id, categoria,
                                             user_id=getattr(user, "user_id", "") or "")
    except Exception as exc:
        log.exception(f"[estudio.pdf] render failed · {exc}")
        raise HTTPException(500, "Error al generar el PDF del estudio")
    # nombre de archivo legible
    est = await generar_estudio(_db(request), colonia_id, categoria)
    import re as _re
    slug = _re.sub(r"[^a-zA-Z0-9]+", "-", (est.get("colonia") or "estudio")).strip("-").lower()
    from datetime import datetime as _dt
    filename = f"Estudio_{slug}_{_dt.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "Content-Length": str(len(pdf_bytes))},
    )


@router.get("/api/dev/estudio-mercado/radio")
async def estudio_mercado_radio(request: Request,
                                lat: float = Query(..., ge=-90, le=90),
                                lng: float = Query(..., ge=-180, le=180),
                                radio_m: float = Query(1000, ge=100, le=10000),
                                categoria: str = Query("media")):
    """Estudio de microzona a la medida (punto + radio): compone las colonias del círculo.
    Solo representativo si junta dato suficiente; si no, lo dice (oculto)."""
    await _auth(request)
    from estudio_mercado_engine import generar_estudio_radio
    return await generar_estudio_radio(_db(request), lat, lng, radio_m, categoria)
