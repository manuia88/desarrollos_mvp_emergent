"""
Cerebro DMX · E2.5 — RECOMENDACIONES (los 5 upgrades que cierran ciclo)
=======================================================================
Feed unificado donde el Cerebro te PROPONE ajustar tu personalización solo. No es una
pantalla muerta: reacciona a tus decisiones y (cuando lleguen) a tus resultados.
Fuentes (cada upgrade = una fuente · viva donde hay base, stub donde faltan datos):
  1 trust   · graduar acciones que ya apruebas siempre (VIVO · de tu historial)
  2 outcome · mover esfuerzo a lo que vende (STUB hasta conectar datos de campañas)
  3 template· guardar una meta que cerró ventas como plantilla (VIVO si hay metas hechas)
  4 flow    · arrancar autopiloto donde aplica (VIVO · de tu config + proyectos)
  5 network · adoptar la receta de devs como tú (STUB hasta crecer la red)
Construido AHORA (build-for-end-state); las fuentes stub se prenden solas con los datos.
"""
from .contract import ACTION_REGISTRY, CEREBRO_TASKS
from .config import get_config, graduation_candidates
from .guardrails import tenant_of


def _rec(rid, title, detail, source, apply=None, live=True):
    return {"id": rid, "title": title, "detail": detail, "source": source, "apply": apply, "live": live}


async def build_recommendations(db, user):
    """Lista de recomendaciones para el feed de la Sala de Control."""
    cfg = await get_config(db, user)
    recs = []

    # 1 · TRUST (vivo): acciones confiables que aún piden OK → graduar a auto
    for action in await graduation_candidates(db, user, cfg):
        lbl = ACTION_REGISTRY.get(action, {}).get("label", action)
        recs.append(_rec(
            f"grad:{action}",
            f"¿Que '{lbl}' lo haga solo?",
            "Lo apruebas siempre sin cambios. Puedo graduarlo a automático (lo sigues viendo, pero ya no te detiene).",
            "trust",
            apply={"type": "graduate", "action": action},
        ))

    # 3 · TEMPLATE (vivo si hay metas completadas): guardar como plantilla reusable
    try:
        done_runs = await db[CEREBRO_TASKS].distinct(
            "run_id", {"tenant_id": tenant_of(user), "status": "done", "goal_id": {"$ne": None}}
        )
        if done_runs:
            recs.append(_rec(
                "tpl:last",
                "Guarda tu última meta como plantilla",
                "Una meta que ya corriste puede volverse plantilla para copiarla a tus otros proyectos.",
                "template",
                apply={"type": "save_template"},
            ))
    except Exception:
        pass

    # 4 · FLOW (vivo): autopiloto contextual según tu autonomía
    if cfg.get("autonomy") == "pilot":
        recs.append(_rec(
            "flow:autopilot",
            "Tienes Piloto activo",
            "El Cerebro puede arrancar la comercialización en tus proyectos nuevos sin que entres aquí. Lo delicado te lo seguirá preguntando.",
            "flow", apply=None,
        ))
    elif cfg.get("autonomy") == "suggest":
        recs.append(_rec(
            "flow:semi",
            "¿Subimos a 'Semi'?",
            "Hoy el Cerebro solo sugiere. En 'Semi' hace lo seguro solo y te pregunta lo delicado — menos clics para ti.",
            "flow", apply={"type": "set_autonomy", "autonomy": "semi"},
        ))

    # 2 · OUTCOME (vivo si ya hay resultados calificados · E4): aprendo de tus cierres
    try:
        from .coach import calibration
        cal = await calibration(db, user)
        resolved_total = sum(c.get("n", 0) for c in cal)
    except Exception:
        cal, resolved_total = [], 0
    if resolved_total > 0:
        best = max(cal, key=lambda c: c.get("n", 0))
        recs.append(_rec(
            "outcome:learning",
            "Estoy aprendiendo de tus cierres",
            f"Ya califiqué {resolved_total} de mis predicciones contra la realidad. {best.get('summary', '')} Lo uso para afinar lo que te recomiendo.",
            "outcome", apply=None, live=True,
        ))
    else:
        recs.append(_rec(
            "outcome:channels",
            "Mover esfuerzo a lo que vende",
            "Cuando registres tus primeros cierres, te diré qué funciona y qué cambiar. (Se prende solo con datos.)",
            "outcome", apply=None, live=False,
        ))

    # 5 · NETWORK (stub hasta red): aprende de devs como tú
    recs.append(_rec(
        "network:lookalike",
        "Aprende de devs como tú",
        "Al crecer la red, compararé tu receta (anónima) con desarrolladores que venden más en tu zona y te propondré la suya.",
        "network", apply=None, live=False,
    ))

    return recs


async def apply_recommendation(db, user, rec):
    """Aplica una recomendación (cambia la config). rec = el dict 'apply' de la rec."""
    from .config import save_config, get_config
    if not rec or not rec.get("type"):
        return {"ok": False, "reason": "nada que aplicar"}
    cfg = await get_config(db, user)
    t = rec["type"]
    if t == "graduate":
        auto = list(cfg.get("auto_overrides") or [])
        if rec["action"] not in auto:
            auto.append(rec["action"])
        await save_config(db, user, {"auto_overrides": auto})
        return {"ok": True, "msg": "graduada a automática"}
    if t == "set_autonomy":
        await save_config(db, user, {"autonomy": rec.get("autonomy", "semi")})
        return {"ok": True, "msg": f"autonomía = {rec.get('autonomy')}"}
    if t == "save_template":
        # marca intención · el guardado real del playbook se completa en el builder de metas
        return {"ok": True, "msg": "listo para guardar como plantilla (elige el nombre en Metas)"}
    return {"ok": False, "reason": f"tipo no soportado: {t}"}
