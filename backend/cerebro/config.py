"""
Cerebro DMX · E2.5 — PERSONALIZACIÓN (config + confianza que se gana)
=====================================================================
La personalización NO es una pantalla de ajustes muerta: es un candado de confianza
que se GANA con tus decisiones. Aquí vive:
  - la config por usuario (autonomía · canales · "mi delicado" · metas custom)
  - la CONFIANZA por tipo de acción (sube si apruebas sin cambios, baja si editas/rechazas)
  - el candado de aprobación PERSONALIZADO (combina base + autonomía + tu config + confianza)
Todo aislado por org (tenant). Piso de seguridad: HARD_DELICATE nunca se automatiza.
"""
from datetime import datetime, timezone
from .guardrails import tenant_of, role_of
from .contract import DELICATE_ACTIONS, HARD_DELICATE, ACTION_REGISTRY

CEREBRO_CONFIG = "cerebro_config"

# Umbral para "graduar" una acción a automática (confianza ganada).
_GRADUATE_APPROVES = 5

DEFAULT_CONFIG = {
    "autonomy": "semi",   # suggest | semi | pilot
    "channels": {"marketplace": True, "meta_ads": True, "redes": True, "newsletter": True, "whatsapp": True},
    "delicate_overrides": [],   # acciones que el dev SIEMPRE quiere aprobar (aunque sean auto)
    "auto_overrides": [],       # acciones graduadas a auto (solo en Piloto · nunca HARD_DELICATE)
    "custom_goals": {},         # {goal_id: {label, steps:[...]}}
    "favorites": [],            # goal_ids fijados arriba
    "trust": {},                # {action: {approves, edits, rejects}}
}


def _now():
    return datetime.now(timezone.utc)


# Las acciones llevan punto ("deal.change_price") y Mongo trata el punto como anidación
# en field paths → sanitizamos la clave de confianza (punto→·) al escribir y la revertimos al leer.
def _tk(action):
    return action.replace(".", "·")


async def ensure_config_indexes(db):
    await db[CEREBRO_CONFIG].create_index([("tenant_id", 1), ("user_id", 1)], unique=True)


def _uid(user):
    return getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)


async def get_config(db, user):
    """Config del usuario (defaults + lo guardado). Siempre scopeada a su org."""
    doc = await db[CEREBRO_CONFIG].find_one({"tenant_id": tenant_of(user), "user_id": _uid(user)}, {"_id": 0})
    cfg = {**DEFAULT_CONFIG, **(doc or {})}
    # merge profundo de channels/trust
    cfg["channels"] = {**DEFAULT_CONFIG["channels"], **((doc or {}).get("channels") or {})}
    raw_trust = (doc or {}).get("trust") or {}
    cfg["trust"] = {k.replace("·", "."): v for k, v in raw_trust.items()}  # revertir sanitizado
    return cfg


async def save_config(db, user, patch):
    """Guarda un parche de config (autonomy/channels/delicate_overrides/custom_goals)."""
    allowed = {"autonomy", "channels", "delicate_overrides", "auto_overrides", "custom_goals", "favorites"}
    set_doc = {k: v for k, v in (patch or {}).items() if k in allowed}
    if patch and patch.get("autonomy") not in (None, "suggest", "semi", "pilot"):
        set_doc.pop("autonomy", None)
    set_doc["updated_at"] = _now().isoformat()
    await db[CEREBRO_CONFIG].update_one(
        {"tenant_id": tenant_of(user), "user_id": _uid(user)},
        {"$set": set_doc, "$setOnInsert": {"tenant_id": tenant_of(user), "user_id": _uid(user), "created_at": _now().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


def trust_level(counters):
    """Nivel de confianza de una acción según el historial."""
    a, e, r = (counters or {}).get("approves", 0), (counters or {}).get("edits", 0), (counters or {}).get("rejects", 0)
    if r > 0 or a == 0:
        return "nuevo"
    if a >= _GRADUATE_APPROVES and e <= 1:
        return "confiable"
    return "subiendo"


async def record_decision(db, user, action, kind):
    """Registra tu decisión sobre una acción (approve|edit|reject) → mueve la confianza.
    Es el cierre de ciclo del upgrade #1 ('autonomía que se gana')."""
    field = {"approve": "approves", "edit": "edits", "reject": "rejects"}.get(kind)
    if not field:
        return
    await db[CEREBRO_CONFIG].update_one(
        {"tenant_id": tenant_of(user), "user_id": _uid(user)},
        {"$inc": {f"trust.{_tk(action)}.{field}": 1},
         "$setOnInsert": {"tenant_id": tenant_of(user), "user_id": _uid(user), "created_at": _now().isoformat()}},
        upsert=True,
    )


async def effective_needs_approval(db, user, action, cfg=None):
    """Candado de aprobación PERSONALIZADO. Combina: piso de seguridad + autonomía +
    'mi delicado' + confianza ganada. Devuelve True si esta acción necesita tu OK."""
    if action in HARD_DELICATE:
        return True   # piso de seguridad · nunca automático
    cfg = cfg or await get_config(db, user)
    autonomy = cfg.get("autonomy", "semi")

    if action in (cfg.get("delicate_overrides") or []):
        return True   # tú marcaste que SIEMPRE te pregunte (gana sobre todo lo demás)
    if action in (cfg.get("auto_overrides") or []):
        return False  # TÚ la graduaste a automática (confianza ganada) · cualquier modo

    base_delicate = action in DELICATE_ACTIONS or not ACTION_REGISTRY.get(action, {}).get("reversible", False)
    if base_delicate:
        return True   # delicada y aún no graduada → tu OK
    return autonomy == "suggest"   # no delicada: en "solo sugiere" pregunta; en semi/pilot la hace sola


async def save_custom_goal(db, user, label, emoji, steps):
    """Guarda una tarjeta propia del dev (combinación de acciones). Candado: solo
    acciones permitidas para su rol."""
    import uuid
    from .contract import ROLE_ALLOWED_ACTIONS
    allowed = ROLE_ALLOWED_ACTIONS.get(role_of(user), set())
    steps = [s for s in (steps or []) if s in allowed]
    if not steps:
        return {"ok": False, "reason": "elige al menos una acción válida"}
    cfg = await get_config(db, user)
    cg = dict(cfg.get("custom_goals") or {})
    gid = "custom_" + uuid.uuid4().hex[:8]
    cg[gid] = {"label": (label or "Mi tarjeta").strip()[:60], "emoji": emoji or "⭐", "steps": steps}
    await save_config(db, user, {"custom_goals": cg})
    return {"ok": True, "goal_id": gid, "spec": cg[gid]}


async def delete_custom_goal(db, user, goal_id):
    cfg = await get_config(db, user)
    cg = dict(cfg.get("custom_goals") or {})
    if goal_id in cg:
        cg.pop(goal_id)
        await save_config(db, user, {"custom_goals": cg})
    return {"ok": True}


async def custom_steps(db, user, goal_id):
    """Pasos de una tarjeta propia (o None si no es custom)."""
    cfg = await get_config(db, user)
    g = (cfg.get("custom_goals") or {}).get(goal_id)
    return g.get("steps") if g else None


async def graduation_candidates(db, user, cfg=None):
    """Acciones DELICADAS (no piso) que ya son 'confiables' y aún piden OK → candidatas
    a graduar a automáticas (upgrade #1). Para el feed de recomendaciones."""
    cfg = cfg or await get_config(db, user)
    out = []
    for action, counters in (cfg.get("trust") or {}).items():
        if action in HARD_DELICATE:
            continue
        if action in (cfg.get("auto_overrides") or []):
            continue
        if (action in DELICATE_ACTIONS) and trust_level(counters) == "confiable":
            out.append(action)
    return out
