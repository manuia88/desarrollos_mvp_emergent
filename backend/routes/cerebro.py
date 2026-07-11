"""
Cerebro DMX · Etapa 3 — API de la Sala de Control
==================================================
Expone el Cerebro a los 4 perfiles (cada uno con su lente, vía contexto de sesión).
Todo pasa por los candados (aislamiento por org + allow-list por rol + aprobación).
Apagado por flag CEREBRO_ENABLED (default off) → responde 503 si está apagado.
"""
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/cerebro", tags=["cerebro"])
log = logging.getLogger("dmx.cerebro.api")


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    """Cualquier usuario autenticado (el Cerebro sirve a los 4 perfiles · el rol lo
    scopea internamente con la allow-list y el aislamiento por org)."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


def _guard_enabled():
    import cerebro
    if not cerebro.CEREBRO_ENABLED:
        raise HTTPException(503, "Cerebro apagado (CEREBRO_ENABLED off)")


# Rate-limit anti-abuso (founder 07-11): el Cerebro queda PRENDIDO, pero /run y /detect-market gastan LLM →
# tope de corridas por usuario/hora para cerrar el único vector real (spam de corridas = costo). Sin fuga.
import time as _time
from collections import defaultdict as _dd
_CEREBRO_BUCKETS: Dict[str, list] = _dd(list)
_CEREBRO_LIMIT = 15
_CEREBRO_WINDOW = 3600.0


def _rate_limit_cerebro(user):
    uid = getattr(user, "user_id", None) or getattr(user, "email", None) or "anon"
    if (getattr(user, "role", None) or "") == "superadmin":
        return
    now = _time.time()
    b = _CEREBRO_BUCKETS[uid]
    b[:] = [t for t in b if now - t < _CEREBRO_WINDOW]
    if len(b) >= _CEREBRO_LIMIT:
        raise HTTPException(429, "Demasiadas corridas del Cerebro en poco tiempo. Intenta más tarde.")
    b.append(now)


class RunIn(BaseModel):
    goal_id: str
    context: Dict[str, Any] = Field(default_factory=dict)


class ApproveIn(BaseModel):
    edits: Optional[Dict[str, Any]] = None


@router.get("/status")
async def status(request: Request):
    """¿Está prendido? + las metas disponibles para el rol del usuario."""
    user = await _auth(request)
    import cerebro
    from cerebro.guardrails import role_of
    from cerebro.contract import goals_for
    from cerebro.orchestrator import get_plan
    role = role_of(user)
    # Solo metas que SÍ tienen plan ejecutable (evita botones rotos) + las tarjetas propias.
    goals = {gid: lbl for gid, lbl in goals_for(role).items() if get_plan(role, gid)}
    cfg = await cerebro.get_config(_db(request), user)
    customs = cfg.get("custom_goals") or {}
    for gid, g in customs.items():
        goals[gid] = g.get("label", gid)
    return {"enabled": cerebro.CEREBRO_ENABLED, "role": role, "goals": goals, "custom_goals": customs}


@router.post("/detect-market")
async def detect_market(request: Request):
    """Fase 2.4 · El Cerebro lee el CUBO (hedónico + demand-gap + prob. de venta) →
    detecta señales → PROPONE tareas (con tu OK donde aplica). Aparecen en la Sala de
    Control. Multi-tenant: mercado compartido; precio/estancadas = tus desarrollos."""
    _guard_enabled()
    user = await _auth(request)
    _rate_limit_cerebro(user)
    import dmx_cerebro_market as m
    return await m.detect_and_propose(_db(request), user)


@router.get("/tasks")
async def tasks(request: Request, status: Optional[str] = None):
    """Feed de la Sala de Control: tareas visibles para este usuario (scopeadas)."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    return {"tasks": await cerebro.list_tasks(_db(request), user, status=status)}


@router.get("/runs/{run_id}")
async def run_detail(run_id: str, request: Request):
    """Línea de tiempo de una corrida de meta (sus pasos, en orden)."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    return {"tasks": await cerebro.get_run_tasks(_db(request), user, run_id)}


@router.post("/run")
async def run(payload: RunIn, request: Request):
    """Arranca una meta. Devuelve done | paused (esperando tu OK) | error."""
    _guard_enabled()
    user = await _auth(request)
    _rate_limit_cerebro(user)
    import cerebro
    res = await cerebro.run_goal(_db(request), user, payload.goal_id, payload.context)
    if not res.get("ok") and res.get("status") == "error":
        raise HTTPException(400, res.get("reason", "no se pudo correr la meta"))
    return res


@router.post("/tasks/{task_id}/approve")
async def approve(task_id: str, payload: ApproveIn, request: Request):
    """Aprueba un paso delicado (con edición opcional = señal de aprendizaje) y
    CONTINÚA la corrida automáticamente."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    db = _db(request)
    t = await cerebro.get_task(db, user, task_id)
    if not t:
        raise HTTPException(404, "tarea no encontrada o fuera de tu alcance")
    ap = await cerebro.approve_task(db, user, task_id, edits=(payload.edits or {}))
    if not ap.get("ok"):
        raise HTTPException(409, ap.get("reason", "no se pudo aprobar"))
    # Cierre de ciclo (upgrade #1): tu decisión mueve la confianza de esa acción.
    await cerebro.record_decision(db, user, t.get("action"), "edit" if payload.edits else "approve")
    resume = await cerebro.resume_run(db, user, t.get("run_id")) if t.get("run_id") else {"status": "done"}
    return {"approved": True, "resume": resume}


@router.post("/tasks/{task_id}/reject")
async def reject(task_id: str, request: Request):
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    db = _db(request)
    t = await cerebro.get_task(db, user, task_id)
    rj = await cerebro.reject_task(db, user, task_id)
    if not rj.get("ok"):
        raise HTTPException(409, rj.get("reason", "no se pudo rechazar"))
    if t:  # cierre de ciclo: rechazar BAJA la confianza de esa acción
        await cerebro.record_decision(db, user, t.get("action"), "reject")
    return {"rejected": True}


# ─── E2.5 · Personalización (config + catálogo + recomendaciones) ─────────────
class ConfigPatch(BaseModel):
    autonomy: Optional[str] = None
    channels: Optional[Dict[str, bool]] = None
    delicate_overrides: Optional[list] = None
    auto_overrides: Optional[list] = None
    custom_goals: Optional[Dict[str, Any]] = None
    favorites: Optional[list] = None


@router.get("/config")
async def get_config(request: Request):
    """Tu config + tu nivel de confianza por acción (para 'Configurar mi Cerebro')."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    cfg = await cerebro.get_config(_db(request), user)
    trust = {a: cerebro.trust_level(c) for a, c in (cfg.get("trust") or {}).items()}
    return {"config": cfg, "trust_levels": trust}


@router.put("/config")
async def put_config(payload: ConfigPatch, request: Request):
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    await cerebro.save_config(_db(request), user, payload.dict(exclude_none=True))
    return await get_config(request)


@router.get("/catalog")
async def catalog(request: Request):
    """Catálogo de acciones que tu rol puede usar, agrupado por área."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    from cerebro.guardrails import role_of
    return {"areas": cerebro.catalog_for_role(role_of(user))}


class CustomGoalIn(BaseModel):
    label: str
    emoji: Optional[str] = "⭐"
    steps: list


@router.post("/custom-goal")
async def create_custom_goal(payload: CustomGoalIn, request: Request):
    """Crea una tarjeta propia del dev combinando acciones del catálogo."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    res = await cerebro.save_custom_goal(_db(request), user, payload.label, payload.emoji, payload.steps)
    if not res.get("ok"):
        raise HTTPException(400, res.get("reason", "no se pudo crear"))
    return res


@router.delete("/custom-goal/{goal_id}")
async def remove_custom_goal(goal_id: str, request: Request):
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    return await cerebro.delete_custom_goal(_db(request), user, goal_id)


@router.get("/scopes")
async def scopes(request: Request):
    """Alcances sobre los que el dev puede preguntar — SOLO de su inventario registrado:
    sus proyectos · las zonas donde TIENE proyectos · rangos de precio derivados de sus precios reales."""
    _guard_enabled()
    user = await _auth(request)
    projs, prices = [], []
    try:
        from data_developments import DEVELOPMENTS
        tid = getattr(user, "tenant_id", None)
        owned = [d for d in DEVELOPMENTS if d.get("developer_id") == tid] if tid else []
        src = owned if owned else DEVELOPMENTS   # demo: si no hay match por tenant, muestra el inventario demo
        for d in src:
            projs.append({"id": d.get("id"), "name": d.get("name"), "zone": d.get("colonia"),
                          "price_from": d.get("price_from"), "price_display": d.get("price_from_display")})
            if d.get("price_from"):
                prices.append(d["price_from"])
    except Exception:
        pass
    zones = sorted({p["zone"] for p in projs if p.get("zone")})   # solo zonas donde TIENE proyectos
    # rangos de precio DERIVADOS de su inventario real (no genéricos)
    bands = []
    if prices:
        lo, hi = min(prices), max(prices)
        def _m(v):
            return f"${round(v / 1_000_000, 1)}M"
        if hi > lo:
            t1, t2 = lo + (hi - lo) / 3, lo + 2 * (hi - lo) / 3
            bands = [f"{_m(lo)} – {_m(t1)}", f"{_m(t1)} – {_m(t2)}", f"{_m(t2)} – {_m(hi)}"]
        else:
            bands = [f"~{_m(lo)}"]
    pmin, pmax = (min(prices), max(prices)) if prices else (None, None)
    return {"projects": projs, "zones": zones, "price_bands": bands, "price_min": pmin, "price_max": pmax}


@router.get("/recommendations")
async def recommendations(request: Request):
    """Feed de recomendaciones (los 5 upgrades que cierran ciclo)."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    return {"recommendations": await cerebro.build_recommendations(_db(request), user)}


class ApplyRecIn(BaseModel):
    apply: Dict[str, Any]


@router.post("/recommendations/apply")
async def apply_rec(payload: ApplyRecIn, request: Request):
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    res = await cerebro.apply_recommendation(_db(request), user, payload.apply)
    if not res.get("ok"):
        raise HTTPException(400, res.get("reason", "no se pudo aplicar"))
    return res


# ─── E4 · loop de aprendizaje (Coach) ─────────────────────────────────────────
@router.get("/learning")
async def learning(request: Request):
    """'Cómo voy aprendiendo': marcador de calibración + lecciones + reentrenos. Por org."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    return await cerebro.learning_snapshot(_db(request), user)


class DealClosedIn(BaseModel):
    ref: str                                   # id del trato/lead/proyecto
    outcome: str                               # 'won' | 'lost'
    deal: Dict[str, Any] = Field(default_factory=dict)   # señales opcionales (response_time_hrs, angle, follow_ups, days_to_close, sale_price)


@router.post("/deal-closed")
async def deal_closed(payload: DealClosedIn, request: Request):
    """GATE de E4: marcar un trato cerrado/perdido dispara el loop (califica predicciones
    → genera lección → reentrena). Aislado por org."""
    _guard_enabled()
    user = await _auth(request)
    if payload.outcome not in ("won", "lost"):
        raise HTTPException(400, "outcome debe ser 'won' o 'lost'")
    import cerebro
    return await cerebro.on_deal_closed(_db(request), user, ref=payload.ref,
                                        outcome=payload.outcome, deal=payload.deal)


@router.post("/learning/demo")
async def learning_demo(request: Request):
    """Solo para VER cómo funciona el loop: siembra predicciones de EJEMPLO y cierra un
    trato de ejemplo, para que el panel se llene una vez. Todo marcado como ejemplo."""
    _guard_enabled()
    user = await _auth(request)
    import cerebro
    db = _db(request)
    ref = "ejemplo"
    await cerebro.log_prediction(db, user, kind="close_prob", predicted=0.8, ref=ref, meta={"demo": True, "is_example": True})
    await cerebro.log_prediction(db, user, kind="days_on_market", predicted=90, ref=ref, meta={"demo": True, "is_example": True})
    await cerebro.log_prediction(db, user, kind="price", predicted=5_000_000, ref=ref, meta={"demo": True, "is_example": True})
    res = await cerebro.on_deal_closed(db, user, ref=ref, outcome="won",
        deal={"response_time_hrs": 1.5, "angle": "precio", "follow_ups": 2,
              "days_to_close": 85, "sale_price": 5_200_000})
    return {"ok": True, "demo": True, **res}
