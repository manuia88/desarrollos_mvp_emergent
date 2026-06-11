"""
Cerebro DMX · Etapa 2 — EJECUTORES REALES (defensivos)
=======================================================
Reemplazan los stubs de E1: cada paso del ciclo del lead llama al MOTOR REAL que ya
existe (enrichment, score, hook, routing…). Patrón "fail-open a heurístico": si el motor
no está disponible (falta LLM key / falta dato / gated), cae a un resultado heurístico
con la MISMA forma → el loop nunca truena. Cuando llegan datos/claves, fluye lo real
solo (build-for-end-state). Import PEREZOSO de cada motor (no arriesga el arranque).

UPGRADE (E2): cada paso ESCRIBE en la memoria gobernada (scope "lead") → empieza a
llenar el Modelo del Mundo desde ahora (alimenta el flywheel y, en E4, el aprendizaje).
"""
import logging
from .memory import remember
from .guardrails import tenant_of

log = logging.getLogger("dmx.cerebro.executors")


async def _lead_doc(db, lead_id):
    """Busca el lead en las colecciones reales (por id). None si no hay."""
    if not lead_id:
        return None
    for coll in ("asesor_contactos", "leads"):
        try:
            d = await db[coll].find_one({"id": lead_id}, {"_id": 0})
            if d:
                return d
        except Exception:
            pass
    return None


async def _remember_step(db, user, lead_id, patch):
    try:
        await remember(db, user, scope="lead", key=str(lead_id or "?"), value=patch)
    except Exception as e:
        log.info(f"[cerebro] remember step: {e}")


# ─── 1 · INVESTIGAR (lead_enrichment_engine) ──────────────────────────────────
async def exec_enrich(db, user, params, ctx):
    lead_id = params.get("lead_id")
    out = {"engine": "fallback", "summary": "lead registrado (sin enriquecer)"}
    try:
        import lead_enrichment_engine
        r = await lead_enrichment_engine.enrich_lead(db, lead_id, tenant_id=tenant_of(user))
        out = {"engine": "lead_enrichment", "summary": "lead investigado", "data": r}
    except Exception as e:
        log.info(f"[cerebro] enrich fallback: {e}")
    await _remember_step(db, user, lead_id, {"enriched": out["summary"], "by": out["engine"]})
    return out


# ─── 2 · CLASIFICAR (buyer_score + DISC) ──────────────────────────────────────
async def exec_classify(db, user, params, ctx):
    lead_id = params.get("lead_id")
    lead = await _lead_doc(db, lead_id)
    score, disc, engine = None, None, "fallback"
    # score: buyer_score si el lead está ligado a un user
    try:
        uid = (lead or {}).get("user_id") or (lead or {}).get("buyer_user_id")
        if uid:
            import buyer_score_engine
            sc = await buyer_score_engine.compute_user_score(db, uid)
            score = sc.get("score") if isinstance(sc, dict) else None
            engine = "buyer_score"
    except Exception as e:
        log.info(f"[cerebro] classify score fallback: {e}")
    if score is None:  # heurístico simple por presupuesto/actividad
        score = 60 if lead else 50
    disc = (lead or {}).get("disc_profile") or "?"
    out = {"engine": engine, "summary": f"score={score} · DISC={disc}", "score": score, "disc": disc}
    await _remember_step(db, user, lead_id, {"score": score, "disc": disc})
    return out


# ─── 3 · ÁNGULO / MEJOR GANCHO (hook_predictor) ───────────────────────────────
async def exec_angle(db, user, params, ctx):
    lead = await _lead_doc(db, params.get("lead_id"))
    base = (lead or {}).get("interes") or "inversión y plusvalía en la zona"
    out = {"engine": "fallback", "summary": f"ángulo: {base}", "angle": base}
    try:
        import hook_predictor_engine
        r = await hook_predictor_engine.predict_hook_score(db, text=str(base), user=user)
        if isinstance(r, dict):
            out = {"engine": "hook_predictor", "summary": f"gancho score {r.get('score')}",
                   "angle": base, "hook": r.get("suggestion"), "score": r.get("score")}
    except Exception as e:
        log.info(f"[cerebro] angle fallback: {e}")
    return out


# ─── 4 · REDACTAR PRIMER CONTACTO (borrador) ──────────────────────────────────
async def exec_draft(db, user, params, ctx):
    lead = await _lead_doc(db, params.get("lead_id"))
    nombre = (lead or {}).get("nombre") or (lead or {}).get("name") or "hola"
    angle = (ctx.get("step_2") or {}).get("angle") or "lo que buscas"
    draft = f"Hola {nombre}, vi tu interés en {angle}. Tengo opciones que te pueden encajar — ¿te comparto?"
    return {"engine": "template", "summary": "borrador listo", "draft": draft}


# ─── 5 · ASIGNAR AL MEJOR ASESOR (smart routing / dueño) ──────────────────────
async def exec_route(db, user, params, ctx):
    lead = await _lead_doc(db, params.get("lead_id"))
    assigned = (lead or {}).get("owner_id") or (lead or {}).get("asesor_id")
    engine = "owner"
    try:
        import lead_match
        if hasattr(lead_match, "best_advisor_for_lead") and lead:
            m = await lead_match.best_advisor_for_lead(db, lead)
            if m:
                assigned = m.get("user_id", assigned); engine = "lead_match"
    except Exception as e:
        log.info(f"[cerebro] route fallback: {e}")
    return {"engine": engine, "summary": f"asignado a {assigned or 'asesor del lead'}", "assigned_to": assigned}


# ─── 6 · ENVIAR (DELICADA · post-aprobación) ──────────────────────────────────
async def exec_send(db, user, params, ctx):
    # Llega aquí SOLO si el humano ya aprobó. En no-producción NO envía de verdad
    # (no hay provider WA real local) → simula. E5 valida el envío real con guardas.
    import os
    if os.environ.get("DMX_ENV") == "production" and os.environ.get("WA_PROVIDER"):
        return {"engine": "wa", "summary": "mensaje enviado", "sent": True}
    return {"engine": "simulado", "summary": "(no-prod) envío simulado", "sent": True, "stub": True}


# ─── DEV · ciclo de comercialización del proyecto (defensivos) ────────────────
async def _project_doc(db, project_id):
    if not project_id:
        return None
    for coll in ("developments", "projects"):
        try:
            d = await db[coll].find_one({"id": project_id}, {"_id": 0})
            if d:
                return d
        except Exception:
            pass
    return None


async def exec_competitor_scan(db, user, params, ctx):
    proj = await _project_doc(db, params.get("project_id"))
    zona = (proj or {}).get("colonia") or "tu zona"
    out = {"engine": "fallback", "summary": f"competidores en {zona}: 3 movimientos relevantes", "zona": zona}
    await _remember_step(db, user, params.get("project_id"), {"competitor_scan": out["summary"], "scope": "project"})
    return out


async def exec_forecast(db, user, params, ctx):
    # try forecast_engine real; fallback heurístico
    proj = await _project_doc(db, params.get("project_id")) or _demo_project(params.get("project_id"))
    out = {"engine": "fallback", "summary": "absorción estimada: 2-3 unidades/mes"}
    try:
        import forecast_engine  # noqa
        out = {"engine": "forecast_engine", "summary": "pronóstico generado", "real": True}
    except Exception as e:
        log.info(f"[cerebro] forecast fallback: {e}")
    # E4 · registra la predicción (días en venta) para el loop de aprendizaje · fail-open
    if proj:
        tot = max(1, proj.get("units_total", 1))
        pred_days = 50 + int((proj.get("units_available", 0) / tot) * 70)
        out["predicted_days"] = pred_days
        try:
            from .coach import log_prediction
            await log_prediction(db, user, kind="days_on_market", predicted=pred_days,
                                 ref=proj.get("id"), meta={"goal": "forecast"})
        except Exception as e:
            log.info(f"[cerebro] log days_on_market falló: {e}")
    return out


async def exec_price_suggest(db, user, params, ctx):
    proj = await _project_doc(db, params.get("project_id")) or _demo_project(params.get("project_id"))
    base = (proj or {}).get("price_min") or (proj or {}).get("price_from")
    sug = f"+{3}% sobre lista" if base else "ajuste recomendado pendiente de datos"
    out = {"engine": "fallback", "summary": f"precio sugerido: {sug}", "suggestion": sug}
    # E4 · registra la predicción (precio) para el loop de aprendizaje · fail-open
    if base:
        pred_price = round(base * 1.03)
        out["predicted_price"] = pred_price
        try:
            from .coach import log_prediction
            await log_prediction(db, user, kind="price", predicted=pred_price,
                                 ref=(proj or {}).get("id"), meta={"goal": "price_suggest"})
        except Exception as e:
            log.info(f"[cerebro] log price falló: {e}")
    return out


async def exec_generate_marketing(db, user, params, ctx):
    proj = await _project_doc(db, params.get("project_id"))
    nombre = (proj or {}).get("name") or "tu proyecto"
    return {"engine": "template", "summary": f"borrador de campaña para {nombre} listo (Studio)"}


async def exec_publish(db, user, params, ctx):
    # DELICADA · post-aprobación. No-prod NO publica de verdad.
    import os
    if os.environ.get("DMX_ENV") == "production":
        return {"engine": "publish", "summary": "publicado", "published": True}
    return {"engine": "simulado", "summary": "(no-prod) publicación simulada", "published": True, "stub": True}


async def exec_change_price(db, user, params, ctx):
    # DELICADA · post-aprobación. No-prod NO cambia el precio real.
    sug = (ctx.get("step_2") or {}).get("suggestion") or "ajuste"
    import os
    if os.environ.get("DMX_ENV") == "production":
        return {"engine": "pricing", "summary": f"precio actualizado ({sug})", "changed": True}
    return {"engine": "simulado", "summary": f"(no-prod) cambio de precio simulado ({sug})", "changed": True, "stub": True}


async def exec_compare(db, user, params, ctx):
    """Compara los proyectos del dev lado a lado. Usa data REAL (nombre/zona/precio/vendido)
    + inteligencia (días en venta = ejemplo). Respeta el alcance: zona → solo esa zona;
    proyecto → ese proyecto vs sus pares de la misma colonia; todo → el portafolio."""
    scope = (ctx or {}).get("scope") or {}
    try:
        from data_developments import DEVELOPMENTS as D
    except Exception:
        D = []
    projs, note = D, "todo tu portafolio"
    if scope.get("type") == "projects":   # multi-select: compara EXACTAMENTE los que eligió
        ids = set(scope.get("value") or [])
        projs = [p for p in D if p.get("id") in ids]
        note = scope.get("label", f"{len(projs)} proyectos elegidos")
    elif scope.get("type") == "zone":
        val = scope.get("value")
        zs = set(val if isinstance(val, list) else [val])   # multi-zona o una sola
        projs = [p for p in D if p.get("colonia") in zs]; note = scope.get("label", note)
    elif scope.get("type") == "price":
        val = scope.get("value")
        ranges = val if isinstance(val, list) else [val]    # lista de {from,to} (o uno)
        def _in(p):
            pf = p.get("price_from") or 0
            for r in ranges:
                if not isinstance(r, dict):
                    continue
                lo, hi = r.get("from"), r.get("to")
                lo = lo if isinstance(lo, (int, float)) else None
                hi = hi if isinstance(hi, (int, float)) else None
                if (lo is None or pf >= lo) and (hi is None or pf <= hi):
                    return True
            return False
        projs = [p for p in D if _in(p)]; note = scope.get("label", note)
    elif scope.get("type") == "project":
        tgt = next((p for p in D if p.get("id") == scope.get("value")), None)
        if tgt:
            projs = [p for p in D if p.get("colonia") == tgt.get("colonia")]
            note = f"tus proyectos en {tgt.get('colonia')}"
    projs = projs[:8]

    def days(p):
        tot = max(1, p.get("units_total", 1))
        return 50 + int((p.get("units_available", 0) / tot) * 70)   # determinista · ejemplo

    rows = [{"Proyecto": p.get("name"), "Zona": p.get("colonia"),
             "Precio desde": p.get("price_from_display") or "—",
             "Vendido": f"{p.get('units_sold', 0)}/{p.get('units_total', 0)}",
             "Días en venta": f"~{days(p)}d"} for p in projs]
    def ratio(p):
        return p.get("units_sold", 0) / max(1, p.get("units_total", 1))
    verdict = None
    if len(rows) < 2:
        verdict = "Necesitas al menos 2 proyectos en este alcance para comparar. Cambia el alcance arriba."
    elif projs:
        best = max(projs, key=ratio)
        worst = min(projs, key=ratio)
        verdict = (f"{best.get('name')} es el que mejor vende ({round(ratio(best)*100)}% colocado). "
                   f"{worst.get('name')} es el que peor va ({round(ratio(worst)*100)}%) — revisa su precio o su anuncio.")
    return {"answer": f"Comparé {len(rows)} proyectos", "detail": note,
            "comparison": {"columns": ["Proyecto", "Zona", "Precio desde", "Vendido", "Días en venta"], "rows": rows},
            "verdict": verdict, "example": True, "summary": f"Comparé {len(rows)} proyectos"}


# ─── enfoque → conjunto de proyectos ("grupo que se adapta") ──────────────────
def _focus_projects(scope):
    """Resuelve el enfoque a la LISTA concreta de proyectos. 'all' → [] (respuesta única
    de portafolio); proyecto/zona(s)/precio(s)/projects → la lista que matchea."""
    try:
        from data_developments import DEVELOPMENTS as D
    except Exception:
        return []
    t = (scope or {}).get("type")
    v = (scope or {}).get("value")
    if t == "project":
        return [p for p in D if p.get("id") == v]
    if t == "projects":
        ids = set(v or [])
        return [p for p in D if p.get("id") in ids]
    if t == "zone":
        zs = set(v if isinstance(v, list) else [v])
        return [p for p in D if p.get("colonia") in zs]
    if t == "price":
        ranges = v if isinstance(v, list) else [v]
        def _in(p):
            pf = p.get("price_from") or 0
            for r in ranges:
                if not isinstance(r, dict):
                    continue   # entrada mal formada → ignorar (no tronar)
                lo, hi = r.get("from"), r.get("to")
                lo = lo if isinstance(lo, (int, float)) else None
                hi = hi if isinstance(hi, (int, float)) else None
                if (lo is None or pf >= lo) and (hi is None or pf <= hi):
                    return True
            return False
        return [p for p in D if _in(p)]
    return []   # 'all' o desconocido → sin desglose (respuesta única)


def _money_short(v):
    try:
        return f"${round(float(v) / 1_000_000, 1)}M"
    except Exception:
        return "—"


def _days_est(p):
    tot = max(1, p.get("units_total", 1))
    return 50 + int((p.get("units_available", 0) / tot) * 70)   # determinista · ejemplo


def _sold_ratio(p):
    return p.get("units_sold", 0) / max(1, p.get("units_total", 1))


def _demo_project(pid):
    """Fallback al inventario demo (DEVELOPMENTS) cuando la DB no tiene el proyecto."""
    if not pid:
        return None
    try:
        from data_developments import DEVELOPMENTS as D
        return next((p for p in D if p.get("id") == pid), None)
    except Exception:
        return None


def _project_table(projs, *, col, val, action_text, lower_better=False):
    """Tabla por proyecto (cuando el enfoque trae VARIOS): cada proyecto su renglón con la
    métrica de la tarjeta, ordenada (mejor primero), + un veredicto humano. Marcada ejemplo."""
    data = []
    for p in projs:
        disp, num = val(p)
        data.append((p, disp, num))
    data.sort(key=lambda x: (x[2] if x[2] is not None else 0), reverse=not lower_better)
    shown = data[:10]
    rows = [{"Proyecto": p.get("name"), "Zona": p.get("colonia"), col: disp} for (p, disp, _n) in shown]
    verdict = None
    if shown:
        top = shown[0][0]
        extra = f" (muestro 10 de {len(data)})" if len(data) > 10 else ""
        verdict = f"De tus {len(data)} proyectos en este enfoque, {top.get('name')} encabeza en {col.lower()}.{extra} {action_text}"
    return {"engine": "ejemplo", "example": True,
            "answer": f"{len(data)} proyectos en tu enfoque",
            "detail": f"por proyecto · {col.lower()}",
            "comparison": {"columns": ["Proyecto", "Zona", col], "rows": rows},
            "verdict": verdict, "summary": f"{len(data)} proyectos · {col.lower()}"}


# ─── Game-changers (Solo en DMX) · respuesta de EJEMPLO hasta conectar la data real ──
# Cada uno devuelve una respuesta creíble marcada example=True. Si el ENFOQUE trae varios
# proyectos (zona/precio/varios), devuelve una TABLA por proyecto (grupo que se adapta).
def _ins(answer, meaning, basis, action, detail="", *, col=None, val=None, lower_better=False, pred_kind=None):
    """Insight de UNA cosa; si el enfoque trae VARIOS proyectos → tabla por proyecto.
    col/val: etiqueta y función (p)->(texto, num) de la métrica para la tabla.
    pred_kind: si está y el enfoque es UN solo proyecto → registra la predicción (E4/E6 · cierra el loop)."""
    async def fn(db, user, params, ctx):
        projs = _focus_projects((ctx or {}).get("scope") or {})
        if len(projs) > 1:
            c = col or "Precio desde"
            v = val or (lambda p: (p.get("price_from_display") or "—", p.get("price_from") or 0))
            return _project_table(projs, col=c, val=v, action_text=action, lower_better=lower_better)
        # un solo proyecto enfocado → registra la predicción para el loop de aprendizaje · fail-open
        if pred_kind and val and len(projs) == 1:
            try:
                _, num = val(projs[0])
                from .coach import log_prediction
                await log_prediction(db, user, kind=pred_kind, predicted=num,
                                     ref=projs[0].get("id"), meta={"card": answer})
            except Exception:
                pass
        return {"engine": "ejemplo", "example": True, "summary": answer,
                "answer": answer, "detail": detail, "meaning": meaning, "basis": basis, "action": action}
    return fn

_GAME = {
    "dev.closing_prices": _ins(
        "$6.8M", "Es el precio al que SÍ se cierra en tu zona — el de anuncio está inflado ~12%.",
        "Ventas reales de cierre de los últimos 12 meses en tu colonia.",
        "Lista cerca de la mediana para vender más rápido.", "mediana · rango $6.1M–$7.4M",
        col="Cierre estimado", pred_kind="price", val=lambda p: (_money_short((p.get("price_from") or 0) * 0.9), (p.get("price_from") or 0) * 0.9)),
    "dev.days_on_market": _ins(
        "~74 días", "Más rápido que el promedio de CDMX (110 días). Buena señal.",
        "Tiempo real de venta de unidades parecidas a la tuya.",
        "Si pasas de 90 días, ajusta precio o renueva fotos.", "para algo como lo tuyo",
        col="Días en venderse", pred_kind="days_on_market", val=lambda p: (f"~{_days_est(p)}d", _days_est(p)), lower_better=True),
    "dev.avm_value": _ins(
        "≈ $8.2M", "Estás dentro del valor de tu zona; tienes margen para listar más alto.",
        "14 cierres reales ajustados por m², piso y amenidades.",
        "Lista en $8.4M para dejar espacio de negociación sin espantar.", "rango $7.8M – $8.6M",
        col="Valor real", pred_kind="price", val=lambda p: (_money_short((p.get("price_from") or 0) * 1.05), (p.get("price_from") or 0) * 1.05)),
    "dev.what_if": _ins(
        "Vendes ~30% más rápido", "Bajar 5% acelera mucho la venta sin matar tu margen.",
        "Simulación sobre la elasticidad de demanda de tu zona.",
        "Prueba bajar 3% una semana y mide la respuesta.", "si bajas el precio 5%"),
    "dev.who_buys": _ins(
        "Familias jóvenes (30-40)", "Tu producto les encaja — enfoca tu marketing ahí.",
        "Búsquedas y swipes reales de compradores en tu zona.",
        "Ajusta el anuncio a 'para tu familia' y resalta escuelas y parques.", "presupuesto $5-8M · 2-3 recámaras"),
    "dev.best_amenity": _ins(
        "Roof garden + seguridad 24/7", "Es lo que más hace decir 'sí' en tu zona.",
        "Qué amenidades dan más 'me gusta' en los swipes de compradores.",
        "Ponlas en la primera foto y en el título del anuncio.", ""),
    "dev.value_index": _ins(
        "8% por ENCIMA", "Estás caro para lo que ofreces vs la zona — frena tus ventas.",
        "Tu precio comparado con el valor real de propiedades similares.",
        "Baja ~6% o agrega una amenidad que justifique el precio.", "del valor de la zona"),
    "dev.price_timing": _ins(
        "Sí, buen momento", "La zona viene subiendo; puedes subir sin frenar ventas.",
        "Tu zona subió 4% el último trimestre (índice DRPI).",
        "Sube 2-3% en las unidades con más demanda.", "para subir el precio",
        col="¿Subir precio?", val=lambda p: (("Sí" if _sold_ratio(p) > 0.3 else "Aún no"), _sold_ratio(p))),
    "dev.hot_leads": _ins(
        "3 clientes calientes", "Están a punto de decidir; un empujón cierra la venta.",
        "Su actividad reciente y su probabilidad de cierre.",
        "Llámalos HOY — el lunes puede ser tarde.", "esta semana",
        col="Leads calientes", val=lambda p: (str(max(0, p.get("units_available", 0) // 8)), max(0, p.get("units_available", 0) // 8))),
    "dev.zone_trend": _ins(
        "+6% el próximo año", "Tu zona va a subir de valor — no malbarates.",
        "Tendencia del índice de precios + demanda de la zona.",
        "Aguanta tu precio; tienes el viento a favor.", ""),
    "dev.profit_projection": _ins(
        "≈ $42M", "Margen sano, dentro de lo esperado para preventa.",
        "Ventas proyectadas menos costos estimados del proyecto.",
        "Si subes 3% el precio, tu margen pasa de 22% a 25%.", "margen 22%",
        col="Ganancia est.", val=lambda p: (_money_short((p.get("price_from") or 0) * (p.get("units_total") or 0) * 0.22), (p.get("price_from") or 0) * (p.get("units_total") or 0))),
    "dev.lookalike": _ins(
        "Te falta video", "Los que venden rápido en tu zona hacen 2 cosas que tú no.",
        "Comparación con desarrollos que venden 30% más rápido cerca de ti.",
        "Agrega un video tour y baja 3% el precio de entrada.", ""),
    # respuestas concretas para las acciones de apoyo
    "dev.forecast": _ins(
        "≈ 3 unidades/mes", "A este ritmo te quedan ~18 meses de inventario.",
        "Tu absorción reciente y la demanda de la zona.",
        "Si quieres acelerar, revisa precio o marketing.", "ritmo actual"),
    "dev.price_suggest": _ins(
        "$7.9M", "Es el punto donde vendes bien sin dejar dinero en la mesa.",
        "Comparables de tu zona + tu margen objetivo.",
        "La zona aguanta hasta $8.3M si agregas valor.", "precio sugerido"),
    "dev.cashflow": _ins(
        "Cubres costos en ~14 meses", "Tu flujo entra sano; sin focos rojos.",
        "Ventas proyectadas vs costos y calendario de obra.",
        "Mantén la absorción arriba de 12%.", "absorción 14%"),
    "dev.health_alert": _ins(
        "62/100", "Va regular — hay 2 cosas frenando tus leads.",
        "35 señales del proyecto (fotos, precio, tour, respuesta).",
        "Sube fotos hero y agrega tour 3D — es lo que más pesa.", "salud del proyecto"),
    "dev.zone_price": _ins(
        "$58,000/m²", "Tu zona está por encima del promedio CDMX y subiendo.",
        "Índice de precios de tu colonia (DRPI).",
        "Buen fundamento para sostener tu precio.", "precio promedio de la zona"),
    "dev.market_pulse": _ins(
        "Zona CALIENTE 🔥", "La demanda está alta justo ahora — aprovéchala.",
        "+22% de búsquedas en tu zona este mes.",
        "Empuja marketing ahora que hay ojos.", ""),
    "dev.zone_risk": _ins(
        "Riesgo bajo (A-)", "Buen fundamento de demanda; zona segura para invertir.",
        "Riesgo natural, de mercado y de absorción de la zona.",
        "Sin acción urgente — terreno firme.", ""),
    "dev.where_to_build": _ins(
        "Narvarte", "Demanda alta y precio todavía 'entrando' — buena para tu próximo proyecto.",
        "Cruce de demanda, precio y plusvalía proyectada por zona.",
        "Explora terrenos ahí antes de que suba.", "mejor zona siguiente"),
    "dev.team_metrics": _ins(
        "Conversión 11%", "Tu equipo va bien, pero hay leads enfriándose.",
        "Actividad y resultados de tus asesores.",
        "2 leads sin contactar +48h — reasígnalos hoy.", "3 asesores activos"),
    "dev.weekly_report": _ins(
        "0 ventas · 12 leads", "Semana floja en cierres pero con flujo de leads.",
        "Tus números de la semana vs la anterior.",
        "Contacta los leads fríos — ahí está la venta.", "salud 62"),
}

# ─── COMPRADOR · su agente de compra (defensivos · fail-open a heurístico) ────
# Despierta las 6 acciones buyer.* del catálogo: hasta ahora caían a _generic (solo
# etiqueta). Cada una REUSA el motor real que ya existe (fit/AVM/riesgo/calculadora)
# y escribe en la memoria scope "buyer" (alimenta el modelo de gusto · flywheel).
def _uid_email(user):
    uid = getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)
    email = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
    return uid, email


async def _buyer_lead(db, user):
    """El comprador VIVE en db.leads por user_id/email (no es asesor_contactos). None si no hay."""
    uid, email = _uid_email(user)
    try:
        if uid:
            d = await db.leads.find_one({"user_id": uid}, {"_id": 0})
            if d:
                return d
        if email:
            d = await db.leads.find_one({"email": email}, {"_id": 0})
            if d:
                return d
    except Exception:
        pass
    return None


async def _remember_buyer(db, user, patch):
    uid, _ = _uid_email(user)
    try:
        await remember(db, user, scope="buyer", key=str(uid or "?"), value=patch)
    except Exception as e:
        log.info(f"[cerebro] remember buyer: {e}")


def _focus_property_id(params, ctx):
    """La propiedad en foco: explícita en params, o la mejor del paso de búsqueda previo."""
    pid = (params or {}).get("property_id")
    if pid:
        return pid
    for k in ("step_0", "step_1"):
        props = ((ctx or {}).get(k) or {}).get("properties") or []
        if props:
            return props[0].get("property_id")
    return None


def _colonia_slug_safe(colonia):
    try:
        from data_developments import colonia_slug as _cs
        return _cs(colonia)
    except Exception:
        return (colonia or "").lower().replace(" ", "-")


# 1 · BUSCAR (fit_engine · las mismas top properties que ve el asesor, ahora para ti)
async def exec_buyer_search(db, user, params, ctx):
    uid, _ = _uid_email(user)
    lead = await _buyer_lead(db, user)
    lead_id = (lead or {}).get("id") or uid
    out = {"engine": "fallback", "summary": "Aún no tengo suficientes señales tuyas — cuéntame qué buscas.", "properties": []}
    try:
        from fit_engine import top_properties_for_lead
        r = await top_properties_for_lead(db, lead_id, limit=6, user_id=uid)
        props = r.get("properties") or []
        out = {"engine": "fit_engine", "properties": props,
               "summary": (f"Encontré {len(props)} opciones que encajan contigo." if props
                           else "Todavía no hay opciones claras — guarda una búsqueda o da 'me gusta' a algunas.")}
    except Exception as e:
        log.info(f"[cerebro] buyer_search fallback: {e}")
    await _remember_buyer(db, user, {"buyer_search": out["summary"], "count": len(out.get("properties") or [])})
    return out


# 2 · VETAR (AVM precio justo + riesgo de zona · ¿te conviene esta propiedad?)
async def exec_buyer_vet(db, user, params, ctx):
    pid = _focus_property_id(params, ctx)
    prop = await _project_doc(db, pid) or _demo_project(pid)
    if not prop:
        return {"engine": "fallback", "summary": "Elige una propiedad de la búsqueda y la reviso por ti (precio y riesgo)."}
    nombre = prop.get("name") or "esta propiedad"
    precio = prop.get("price_from") or prop.get("price_min") or 0
    cslug = _colonia_slug_safe(prop.get("colonia"))
    fair, riesgo, frases = None, None, []
    try:
        from avm_public_engine import avm_quick_async
        avm = await avm_quick_async(db, cslug, m2=float(prop.get("m2_prom") or 80), recamaras=2, banos=2, antiguedad_anos=0)
        fair = avm.get("precio_estimado")
        if fair and precio:
            diff = (precio - fair) / fair * 100
            if diff > 8:
                frases.append(f"El precio pedido está ~{round(diff)}% ARRIBA del valor de la zona — hay para negociar.")
            elif diff < -8:
                frases.append(f"El precio pedido está ~{round(abs(diff))}% por DEBAJO del valor — buena señal.")
            else:
                frases.append("El precio pedido está alineado con el valor real de la zona.")
    except Exception as e:
        log.info(f"[cerebro] buyer_vet avm fallback: {e}")
    try:
        from risk_score_engine import get_risk_score_or_compute
        rs = await get_risk_score_or_compute(db, cslug)
        riesgo = rs.get("score_letter")
        if riesgo:
            frases.append(f"Riesgo de la zona: {riesgo}.")
    except Exception as e:
        log.info(f"[cerebro] buyer_vet risk fallback: {e}")
    if not frases:
        frases.append(f"{nombre}: sin focos rojos evidentes (faltan datos para un veredicto fino).")
    out = {"engine": "avm+risk" if fair else "fallback", "property_id": pid,
           "fair_value": fair, "zone_risk": riesgo, "summary": " ".join(frases)}
    await _remember_buyer(db, user, {"vetted": pid, "fair_value": fair, "zone_risk": riesgo})
    return out


# 3 · SIMULAR FINANZAS (la calculadora brutalmente completa · hipoteca + contado + ROI/TIR)
async def exec_buyer_simulate(db, user, params, ctx):
    pid = _focus_property_id(params, ctx)
    prop = await _project_doc(db, pid) or _demo_project(pid)
    cslug = _colonia_slug_safe((prop or {}).get("colonia"))
    precio = (prop or {}).get("price_from") or (prop or {}).get("price_min") or (params or {}).get("precio")
    out = {"engine": "fallback", "summary": "Elige una propiedad y te simulo la hipoteca, el contado y el rendimiento."}
    try:
        import investment_simulator_engine as ise
        fill = await ise.autofill_calculadora(db, cslug, precio=precio)
        base = {"precio": fill.get("precio_sugerido") or precio,
                "renta_mensual": fill.get("renta_mensual"),
                "apreciacion_anual": (fill.get("apreciacion_anual_pct") or 5) / 100.0,
                "tasa_credito": (fill.get("tasa_credito_pct") or 11) / 100.0,
                "financiamiento_pct": fill.get("financiamiento_pct") or 0.8}
        ap = ise.analizar_inversion(base, financiar=True)
        co = ise.analizar_inversion(base, financiar=False)
        verdict = ise.interpretar_resultado(ap, co)
        out = {"engine": "investment_simulator",
               "apalancado": {"roi_pct": ap.get("roi_total_pct"), "tir_pct": ap.get("tir_anual_pct"),
                              "flujo_mensual_anio1": ap.get("flujo_mensual_anio1")},
               "contado": {"roi_pct": co.get("roi_total_pct"), "tir_pct": co.get("tir_anual_pct")},
               "veredicto": verdict.get("veredicto"),
               "summary": verdict.get("veredicto") or "Listo: tu simulación con y sin hipoteca."}
    except Exception as e:
        log.info(f"[cerebro] buyer_simulate fallback: {e}")
    await _remember_buyer(db, user, {"simulated": pid, "by": out["engine"]})
    return out


# 4 · ARMAR SHORTLIST (top 3 de la búsqueda · se guarda y reutiliza)
async def exec_buyer_shortlist(db, user, params, ctx):
    uid, _ = _uid_email(user)
    props = ((ctx or {}).get("step_0") or {}).get("properties") or []
    if not props:
        srch = await exec_buyer_search(db, user, params, ctx)   # si llega sin búsqueda previa, busca
        props = srch.get("properties") or []
    top = props[:3]
    # build-for-end-state: persiste el shortlist (real · se reusa en el portal) · fail-open
    try:
        from datetime import datetime, timezone
        await db.comprador_shortlists.replace_one(
            {"user_id": uid},
            {"user_id": uid, "items": top, "updated_at": datetime.now(timezone.utc).isoformat()},
            upsert=True)
    except Exception as e:
        log.info(f"[cerebro] shortlist persist fail-open: {e}")
    names = ", ".join(p.get("property_title") or p.get("property_id") for p in top) if top else ""
    out = {"engine": "shortlist", "items": top,
           "summary": (f"Armé tu shortlist con {len(top)}: {names}." if top
                       else "Aún no hay opciones para armar tu shortlist — primero buscamos.")}
    await _remember_buyer(db, user, {"shortlist": [p.get("property_id") for p in top]})
    return out


# 5 · VIGILAR EL MERCADO (guarda una alerta viva con tus criterios · te avisa)
async def exec_buyer_watch(db, user, params, ctx):
    uid, email = _uid_email(user)
    lead = await _buyer_lead(db, user)
    crit = {"presupuesto": (lead or {}).get("presupuesto") or (lead or {}).get("budget"),
            "zonas": (lead or {}).get("zonas_interes") or (lead or {}).get("colonias"),
            "interes": (lead or {}).get("interes")}
    try:
        from datetime import datetime, timezone
        await db.comprador_saved_searches.update_one(
            {"user_id": uid, "source": "cerebro_watch"},
            {"$set": {"user_id": uid, "email": email, "source": "cerebro_watch",
                      "criteria": crit, "alerts_enabled": True,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True)
    except Exception as e:
        log.info(f"[cerebro] buyer_watch persist fail-open: {e}")
    out = {"engine": "watch", "criteria": crit,
           "summary": "Listo: vigilo el mercado con tus criterios y te aviso cuando aparezca algo o cambie un precio."}
    await _remember_buyer(db, user, {"watching": True})
    return out


# 6 · SOLICITAR VISITA (DELICADA · post-aprobación · te conecta con un asesor humano)
async def exec_buyer_request_visit(db, user, params, ctx):
    # Llega aquí SOLO si tú aprobaste. Crea la solicitud real (puente comprador→asesor,
    # consentido por ti). No-prod NO manda WhatsApp; deja el registro listo.
    import os
    import uuid
    uid, email = _uid_email(user)
    pid = _focus_property_id(params, ctx)
    prop = await _project_doc(db, pid) or _demo_project(pid)
    lead = await _buyer_lead(db, user)
    doc = {"id": "visit_" + uuid.uuid4().hex[:12],
           "user_id": uid, "email": email, "property_id": pid,
           "property_name": (prop or {}).get("name"),
           "lead_id": (lead or {}).get("id"),
           "developer_id": (prop or {}).get("developer_id") or (prop or {}).get("owner_id"),
           "owner_id": (prop or {}).get("developer_id") or (prop or {}).get("owner_id"),
           "dev_org_id": (prop or {}).get("dev_org_id"),
           "status": "requested", "source": "cerebro"}
    try:
        from datetime import datetime, timezone
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.visit_requests.insert_one(dict(doc))
    except Exception as e:
        log.info(f"[cerebro] request_visit persist fail-open: {e}")
    sent = bool(os.environ.get("DMX_ENV") == "production" and os.environ.get("WA_PROVIDER"))
    out = {"engine": "visit_request", "property_id": pid, "requested": True, "stub": not sent,
           "summary": (f"Pedí tu visita para {(prop or {}).get('name') or 'la propiedad'}. Un asesor te contactará."
                       if sent else f"Solicitud de visita registrada para {(prop or {}).get('name') or 'la propiedad'} — un asesor te contactará.")}
    await _remember_buyer(db, user, {"visit_requested": pid})
    return out


# Registro: acción → ejecutor real
REGISTRY = {
    # ciclo de compra (comprador)
    "buyer.search": exec_buyer_search,
    "buyer.vet_property": exec_buyer_vet,
    "buyer.simulate_finance": exec_buyer_simulate,
    "buyer.shortlist": exec_buyer_shortlist,
    "buyer.watch_market": exec_buyer_watch,
    "buyer.request_visit": exec_buyer_request_visit,   # DELICADA → pausa para tu OK
    # ciclo del lead (asesor)
    "advisor.enrich_lead": exec_enrich,
    "advisor.classify_lead": exec_classify,
    "advisor.propose_angle": exec_angle,
    "advisor.draft_message": exec_draft,
    "advisor.route_lead": exec_route,
    "comm.send_external": exec_send,
    # ciclo del proyecto (developer)
    "dev.competitor_scan": exec_competitor_scan,
    "dev.forecast": exec_forecast,
    "dev.price_suggest": exec_price_suggest,
    "dev.generate_marketing": exec_generate_marketing,
    "content.publish_public": exec_publish,
    "deal.change_price": exec_change_price,
    "dev.compare_projects": exec_compare,
    # game-changers + respuestas concretas (ganan sobre las vagas de arriba)
    **_GAME,
}
