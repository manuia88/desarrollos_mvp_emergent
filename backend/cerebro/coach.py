"""
Cerebro DMX · Etapa 4 — COACH (cerrar el loop de aprendizaje · "el espejo del asistente")
=========================================================================================
Lo que vuelve el Cerebro "agéntico de verdad": NO solo hace, sino que APRENDE de cada
resultado. Dos mecanismos atados (cierran el ciclo predecir→realidad→ajuste):

 1) CALIBRACIÓN honesta (self-scorecard): cada predicción que el Cerebro hace (prob. de
    cierre · días en venta · precio · ángulo) se GUARDA. Cuando llega la realidad (trato
    cerrado/perdido) se compara predicho vs real y se lleva un marcador vivo de "qué tan
    bien le atino" por tipo. Es la confianza-que-se-gana hecha VISIBLE.
 2) LECCIÓN → siguiente jugada: cada cierre/pérdida produce UNA lección humana y dispara
    un REENTRENO real (reusa los motores que ya existían y estaban inertes:
    close_probability_tuning.tune + coaching_analysis.analyze_performance · fail-open).

Todo aislado por org (tenant). El registro de reentrenos da observabilidad (gate de E4).
"""
import uuid
import logging
from datetime import datetime, timezone, timedelta

from .guardrails import tenant_of
from .memory import remember

log = logging.getLogger("dmx.cerebro.coach")

CEREBRO_PREDICTIONS = "cerebro_predictions"
CEREBRO_LESSONS = "cerebro_lessons"
CEREBRO_RETRAINS = "cerebro_retrains"

_PRED_TTL_DAYS = 540
_LESSON_TTL_DAYS = 365

# Tipos de predicción que el cerebro hace y luego contrasta con la realidad.
PRED_KINDS = {
    "close_prob":     {"label": "Probabilidad de cierre", "metric": "hit"},        # 0..1 vs ganó/perdió
    "days_on_market": {"label": "Días en venderse",        "metric": "error_days"},
    "price":          {"label": "Precio de venta",         "metric": "error_pct"},
    "angle":          {"label": "Mejor ángulo",            "metric": "match"},
}


def _now():
    return datetime.now(timezone.utc)


def _uid(user):
    return getattr(user, "user_id", None) or (user.get("user_id") if isinstance(user, dict) else None)


def _pid():
    return "cpred_" + uuid.uuid4().hex[:12]


async def ensure_learning_indexes(db):
    """Índices del loop de aprendizaje (aislamiento + panel rápidos)."""
    p = db[CEREBRO_PREDICTIONS]
    await p.create_index([("tenant_id", 1), ("kind", 1), ("resolved", 1)])
    await p.create_index([("tenant_id", 1), ("ref", 1), ("resolved", 1)])
    await p.create_index("id", unique=True)
    # P1.6 · candado de concurrencia: 1 sola predicción ABIERTA por (tenant, ref, kind).
    # Índice único parcial (solo sobre resolved:False) → el dedup deja de ser read-then-write.
    try:
        await p.create_index(
            [("tenant_id", 1), ("ref", 1), ("kind", 1)], unique=True,
            partialFilterExpression={"resolved": False}, name="uniq_open_pred",
        )
    except Exception:
        pass
    try:
        await p.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
    for c in (CEREBRO_LESSONS, CEREBRO_RETRAINS):
        await db[c].create_index([("tenant_id", 1), ("created_at", -1)])
        try:
            await db[c].create_index("expires_at", expireAfterSeconds=0)
        except Exception:
            pass


# ─── 1 · PREDICCIONES + CALIBRACIÓN ───────────────────────────────────────────
async def log_prediction(db, user, *, kind, predicted, ref=None, meta=None):
    """El Cerebro registra una predicción que hizo (para luego calificarse vs la realidad).
    Fail-open: si algo falla, no rompe el flujo que la generó."""
    if kind not in PRED_KINDS:
        return {"ok": False, "reason": "kind desconocido"}
    now = _now()
    doc = {"id": _pid(), "tenant_id": tenant_of(user), "user_id": _uid(user),
           "kind": kind, "predicted": predicted, "ref": ref, "meta": meta or {},
           # C4 · marca de ejemplo/demo: NO debe contaminar la calibración ni el reentreno
           "is_example": bool((meta or {}).get("is_example", False)),
           "resolved": False, "actual": None, "hit": None, "error": None,
           "created_at": now.isoformat(), "expires_at": now + timedelta(days=_PRED_TTL_DAYS)}
    try:
        await db[CEREBRO_PREDICTIONS].insert_one(dict(doc))
    except Exception as e:
        # P1.6 · si el índice único parcial rechaza el duplicado, ya hay una predicción abierta
        # para (tenant, ref, kind) → resultado idempotente deseado (no es un fallo).
        if e.__class__.__name__ == "DuplicateKeyError":
            return {"ok": True, "dedup": True}
        log.warning(f"[coach] log_prediction falló: {e}")
        return {"ok": False}
    return {"ok": True, "id": doc["id"]}


def _score(kind, predicted, actual):
    """(hit:bool|None, error:float|None) según el tipo de predicción."""
    try:
        if kind == "close_prob":
            return ((float(predicted) >= 0.5) == bool(actual)), None
        if kind == "days_on_market":
            return None, abs(float(predicted) - float(actual))
        if kind == "price":
            a = float(actual) or 1.0
            return None, abs(float(predicted) - a) / a
        if kind == "angle":
            return (str(predicted).strip().lower() == str(actual).strip().lower()), None
    except Exception:
        return None, None
    return None, None


async def resolve_predictions(db, user, ref, actuals):
    """Llega la realidad de un trato (ref) → califica las predicciones abiertas de ese ref.
    actuals = {kind: valor_real}. Devuelve cuántas resolvió."""
    resolved = 0
    cur = db[CEREBRO_PREDICTIONS].find(
        {"tenant_id": tenant_of(user), "ref": ref, "resolved": False}, {"_id": 0})
    async for p in cur:
        k = p["kind"]
        if k not in actuals:
            continue
        hit, err = _score(k, p["predicted"], actuals[k])
        ok = await db[CEREBRO_PREDICTIONS].update_one(
            {"id": p["id"], "tenant_id": tenant_of(user), "resolved": False},
            {"$set": {"resolved": True, "actual": actuals[k], "hit": hit, "error": err,
                      "resolved_at": _now().isoformat()}})
        resolved += ok.modified_count
    return resolved


async def calibration(db, user):
    """Marcador honesto: qué tan bien le atina el Cerebro, por tipo de predicción."""
    out = []
    for kind, spec in PRED_KINDS.items():
        hits, errs, n = 0, [], 0
        cur = db[CEREBRO_PREDICTIONS].find(
            # C4 · excluye predicciones de ejemplo/demo de la calibración honesta
            {"tenant_id": tenant_of(user), "kind": kind, "resolved": True,
             "is_example": {"$ne": True}},
            {"_id": 0, "hit": 1, "error": 1})
        async for p in cur:
            n += 1
            if p.get("hit") is True:
                hits += 1
            if p.get("error") is not None:
                errs.append(p["error"])
        row = {"kind": kind, "label": spec["label"], "n": n}
        if n == 0:
            row["summary"] = "Aún no tengo resultados para calificarme."
        elif spec["metric"] in ("hit", "match"):
            row["hit_rate"] = round(hits / n, 2)
            row["summary"] = f"Le atiné {hits} de {n}."
        elif spec["metric"] == "error_days":
            avg = round(sum(errs) / len(errs)) if errs else None
            row["avg_error"] = avg
            row["summary"] = f"Me equivoco por ~{avg} días en promedio." if avg is not None else f"{n} resultados."
        elif spec["metric"] == "error_pct":
            avg = round((sum(errs) / len(errs)) * 100) if errs else None
            row["avg_error_pct"] = avg
            row["summary"] = f"Me equivoco ~{avg}% en el precio." if avg is not None else f"{n} resultados."
        out.append(row)
    return out


# ─── 2 · LECCIONES + REENTRENO ────────────────────────────────────────────────
async def _add_lesson(db, user, text, *, basis="", deal_ref=None, outcome=None):
    if not text:
        return None
    now = _now()
    doc = {"tenant_id": tenant_of(user), "user_id": _uid(user), "text": text[:400],
           "basis": (basis or "")[:200], "deal_ref": deal_ref, "outcome": outcome,
           "created_at": now.isoformat(), "expires_at": now + timedelta(days=_LESSON_TTL_DAYS)}
    try:
        await db[CEREBRO_LESSONS].insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[coach] _add_lesson falló: {e}")
    return text


def _deal_lesson_text(deal, outcome):
    """Una lección humana del trato (usa los campos que existan · build-for-end-state)."""
    d = deal or {}
    won = outcome == "won"
    bits = []
    rt = d.get("response_time_hrs")
    if rt is not None:
        bits.append(f"respuesta en {'menos de 2h' if rt < 2 else f'~{round(rt)}h'}")
    if d.get("angle"):
        bits.append(f"ángulo «{d['angle']}»")
    fu = d.get("follow_ups")
    if fu is not None:
        bits.append(f"{fu} seguimiento{'s' if fu != 1 else ''}")
    ctx = (" con " + ", ".join(bits)) if bits else ""
    if won:
        return f"Cerraste{ctx}. Repite ese patrón en leads parecidos."
    return f"Se perdió{ctx}. Lección: contesta más rápido y no dejes enfriar el 2º contacto."


async def recent_lessons(db, user, limit=6):
    cur = db[CEREBRO_LESSONS].find({"tenant_id": tenant_of(user)}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [l async for l in cur]


async def recent_retrains(db, user, limit=6):
    cur = db[CEREBRO_RETRAINS].find({"tenant_id": tenant_of(user)}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [r async for r in cur]


async def retrain_signal(db, user, *, trigger="manual", level="lead", zone=None):
    """Reentrena DE VERDAD reusando los motores que ya existían (fail-open) y deja rastro.
    Cualquier cierre → prob. de cierre. Cierre de PROYECTO con zona → ADEMÁS la valuación
    (AVM) de esa zona (E6: prende el ML del desarrollador, acotado a la zona del proyecto)."""
    ran, parts, applied = [], [], False
    # 1) probabilidad de cierre (reusa los cierres reales · advisor + dev)
    try:
        from close_probability_tuning import tune
        res = await tune(db) or {}
        ran.append("close_probability")
        n = res.get("sample_size", 0)
        if res.get("applied"):
            applied = True
            parts.append(f"la probabilidad de cierre con {n} cierres reales")
    except Exception as e:
        log.info(f"[coach] tune no disponible: {e}")
    # 2) cierre de PROYECTO → reentrena la valuación (AVM) de la zona (E6 · acotado)
    if level == "project" and zone:
        try:
            from avm_retrain_cron import retrain_and_maybe_promote
            r = await retrain_and_maybe_promote(db, zone, "colonia") or {}
            ran.append(f"avm:{zone}")
            if r.get("promoted"):
                applied = True
                parts.append(f"la valuación (AVM) de {zone}")
        except Exception as e:
            log.info(f"[coach] avm retrain no disponible: {e}")
    summary = ("Reajusté " + " y ".join(parts) + ".") if parts else "Aún junto datos para reajustar el modelo."
    now = _now()
    rec = {"tenant_id": tenant_of(user), "user_id": _uid(user), "engines": ran, "trigger": trigger,
           "level": level, "applied": applied, "summary": summary, "created_at": now.isoformat(),
           "expires_at": now + timedelta(days=_LESSON_TTL_DAYS)}
    try:
        await db[CEREBRO_RETRAINS].insert_one(dict(rec))
        rec.pop("_id", None)
    except Exception as e:
        log.warning(f"[coach] retrain record falló: {e}")
    return rec


# ─── EL GATE DE E4: un trato cerrado dispara todo el loop ─────────────────────
async def on_deal_closed(db, user, *, ref, outcome, deal=None, actuals=None, level="lead", zone=None):
    """Punto de entrada del loop. Un trato/venta marcado cerrado/perdido dispara:
    (1) califica las predicciones de ese ref, (2) genera una lección humana
    (propia + Coach real fail-open), (3) reentrena y deja rastro. Aislado por org.
    level='project' (venta de unidad) + zone → además reentrena la valuación de la zona (E6)."""
    deal = deal or {}
    won = outcome == "won"
    # arma los valores reales con que calificar las predicciones abiertas
    acts = dict(actuals or {})
    acts.setdefault("close_prob", won)
    if deal.get("days_to_close") is not None:
        acts.setdefault("days_on_market", deal["days_to_close"])
    if deal.get("sale_price") is not None:
        acts.setdefault("price", deal["sale_price"])
    if deal.get("angle") is not None:
        acts.setdefault("angle", deal["angle"])
    resolved = await resolve_predictions(db, user, ref, acts)

    # (2) lección — del trato + (reuse) Coach real fail-open
    lesson = await _add_lesson(db, user, _deal_lesson_text(deal, outcome),
                               basis="cierre", deal_ref=ref, outcome=outcome)
    try:
        from coaching_analysis import analyze_performance
        rep = await analyze_performance(db, _uid(user), tenant_of(user))
        sug = (rep or {}).get("suggestions") or []
        if sug and sug[0].get("text"):
            await _add_lesson(db, user, sug[0]["text"], basis="coach", deal_ref=ref, outcome=outcome)
    except Exception as e:
        log.info(f"[coach] analyze_performance no disponible: {e}")

    # (3) reentreno real (prende el motor inerte) + rastro
    retrain = await retrain_signal(db, user, trigger=f"deal:{outcome}", level=level, zone=zone)

    # memoria del mundo (no-PII · alimenta el flywheel · candado por org)
    try:
        await remember(db, user, scope="world", key=f"outcome:{ref}",
                       value={"outcome": outcome, "ref": str(ref)})
    except Exception:
        pass

    # (4) Alimentar db.transactions → DRPI (antes el cierre NO poblaba el índice = "precios de cierre"
    #     fantasma). Solo con precio de cierre + zona reales; idempotente por ref. Fail-soft.
    tx_id = None
    try:
        price = deal.get("sale_price") or acts.get("price")
        zone_id = zone or deal.get("zone_id") or deal.get("colonia_id")
        if won and price and zone_id:
            exists = await db.transactions.find_one({"source_ref": str(ref)}, {"_id": 1})
            if not exists:
                from transaction_network_engine import ingest_transaction
                tx = await ingest_transaction(db, {
                    "zone_id": zone_id,
                    "closing_price_mxn": price,
                    "property_type": deal.get("property_type") or "depto",
                    "m2": deal.get("m2") or deal.get("surface_m2"),
                    "listed_price_mxn": deal.get("listed_price") or deal.get("list_price"),
                    "closed_at": deal.get("closed_at"),
                    "source_ref": str(ref),
                }, source="dmx_native")
                tx_id = (tx or {}).get("id")
    except Exception as e:
        log.info(f"[coach] ingest_transaction no aplicó: {e}")

    return {"ok": True, "resolved": resolved, "lesson": lesson, "retrain": retrain, "tx": tx_id}


async def learning_snapshot(db, user):
    """Lo que muestra el panel 'Cómo voy aprendiendo' en la Sala de Control."""
    return {
        "calibration": await calibration(db, user),
        "lessons": await recent_lessons(db, user),
        "retrains": await recent_retrains(db, user),
    }
