"""W5.ASR.4 Parte 1 · CMA Engine (Comparative Market Analysis).

Motor reusable que combina 6 engines existentes para producir un análisis
comparativo de mercado completo para un asesor:

  1. avm_public_engine.avm_quick_async       → estimated_value + range + pricing_model
  2. DEVELOPMENTS seed (data_developments)   → comparables similares
  3. zone_score_engine.get_zone_with_subscores → 6 subscores zona
  4. forecast_engine.predict_property_forecast → 12m / 24m
  5. db.drpi_snapshots (12 meses)            → drpi_trend (slope LinReg)
  6. emergentintegrations Claude             → narrative 150 palabras tono asesor

Persistencia: db.cmas · TTL 30d sobre `expires_at`.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.cma")

COACH_MODEL = "claude-sonnet-4-5-20250929"
TTL_DAYS = 30
MAX_COMPARABLES = 10
MIN_COMPARABLES_BEFORE_EXPAND = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ─── Comparables ─────────────────────────────────────────────────────────────

def _build_comparables(
    colonia_slug: str,
    subject_m2: float,
    subject_rec: int,
    subject_ban: int,
    avm_pm2: float,
    *,
    expand_to_alcaldia: bool = True,
) -> List[Dict[str, Any]]:
    """Genera lista de comparables top-10 ordenada por similarity_score desc.

    Fuentes:
      1. DEVELOPMENTS seed (prototypes con m2_priv + price_base + beds/baths)
      2. Si <3 resultados → expandir a alcaldía vecina
      3. Si aún <3 → relajar m2 a ±50% en misma colonia + alcaldía vecina
    """
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS_BY_ID

    subject_col = COLONIAS_BY_ID.get(colonia_slug) or {}
    subject_alcaldia = subject_col.get("alcaldia")
    sibling_slugs = (
        {cid for cid, c in COLONIAS_BY_ID.items()
         if c.get("alcaldia") == subject_alcaldia and cid != colonia_slug}
        if subject_alcaldia else set()
    )

    def _scan(predicate, m2_tol: float, rb_tol: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for d in DEVELOPMENTS:
            if not predicate(d):
                continue
            dev_col_slug = d.get("colonia_id")
            # 1) prototypes schema (m2_priv + price_base + beds/baths)
            sources: List[Dict[str, Any]] = []
            for proto in d.get("prototypes", []) or []:
                sources.append({
                    "name": proto.get("name"),
                    "m2": float(proto.get("m2_priv") or 0),
                    "rec": int(proto.get("beds") or 0),
                    "ban": int(proto.get("baths") or 0),
                    "price": float(proto.get("price_base") or 0),
                })
            # 2) units schema (m2_total + price + bedrooms/bathrooms)
            for unit in d.get("units", []) or []:
                m2_u = unit.get("m2_priv") or unit.get("m2_privative") or unit.get("m2_total") or 0
                price_u = unit.get("price") or unit.get("price_total") or 0
                if not m2_u or not price_u:
                    continue
                sources.append({
                    "name": unit.get("unit_number") or unit.get("prototype") or unit.get("id"),
                    "m2": float(m2_u),
                    "rec": int(unit.get("bedrooms") or 0),
                    "ban": int(unit.get("bathrooms") or 0),
                    "price": float(price_u),
                })
            for s in sources:
                p_m2 = s["m2"]
                p_rec = s["rec"]
                p_ban = s["ban"]
                p_price = s["price"]
                if p_m2 <= 0 or p_price <= 0:
                    continue
                m2_dev_pct = abs(p_m2 - subject_m2) / max(subject_m2, 1)
                if m2_dev_pct > m2_tol:
                    continue
                if abs(p_rec - subject_rec) > rb_tol or abs(p_ban - subject_ban) > rb_tol:
                    continue
                price_pm2 = p_price / p_m2
                pm2_dev_pct = (abs(price_pm2 - avm_pm2) / avm_pm2) if avm_pm2 > 0 else 1.0
                similarity = round(1.0 / (1.0 + m2_dev_pct + pm2_dev_pct), 4)
                distance_km: Optional[float] = None
                if dev_col_slug == colonia_slug:
                    distance_km = 0.0
                else:
                    other_col = COLONIAS_BY_ID.get(dev_col_slug) or {}
                    dev_center = subject_col.get("center")
                    other_center = other_col.get("center")
                    if dev_center and other_center:
                        import math
                        lon1, lat1 = dev_center
                        lon2, lat2 = other_center
                        R = 6371.0
                        dlat = math.radians(lat2 - lat1)
                        dlon = math.radians(lon2 - lon1)
                        a = (math.sin(dlat / 2) ** 2
                             + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
                             * math.sin(dlon / 2) ** 2)
                        distance_km = round(2 * R * math.asin(math.sqrt(a)), 2)
                out.append({
                    "dev_id": d["id"],
                    "name": d.get("name") or d["id"],
                    "colonia_slug": dev_col_slug,
                    "prototype_name": s["name"],
                    "m2": p_m2,
                    "recamaras": p_rec,
                    "banos": p_ban,
                    "price": round(p_price),
                    "price_per_m2": round(price_pm2),
                    "distance_km": distance_km,
                    "similarity_score": similarity,
                })
        return out

    # Paso 1: misma colonia · m2 ±20% · rec/ban ±1
    results = _scan(lambda d: d.get("colonia_id") == colonia_slug, 0.20, 1)

    # Paso 2: expandir a alcaldía vecina si <3
    if len(results) < MIN_COMPARABLES_BEFORE_EXPAND and expand_to_alcaldia and sibling_slugs:
        results += _scan(lambda d: d.get("colonia_id") in sibling_slugs, 0.20, 1)

    # Paso 3: relajar tolerancias si aún <3 (m2 ±50%, rec/ban ±2)
    if len(results) < MIN_COMPARABLES_BEFORE_EXPAND:
        relaxed_slugs = {colonia_slug} | sibling_slugs
        relaxed = _scan(lambda d: d.get("colonia_id") in relaxed_slugs, 0.50, 2)
        seen = {(r["dev_id"], r["prototype_name"]) for r in results}
        for r in relaxed:
            if (r["dev_id"], r["prototype_name"]) not in seen:
                results.append(r)

    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    return results[:MAX_COMPARABLES]


# ─── DRPI trend (LinReg sobre 12 meses) ──────────────────────────────────────

async def _compute_drpi_trend(db, colonia_slug: str) -> Dict[str, Any]:
    """Calcula tendencia DRPI sobre últimos 12 snapshots mensuales de la colonia.

    Retorna {label: positive|negative|flat, slope, samples, latest_index, latest_period}.
    """
    cursor = db.drpi_snapshots.find(
        {"zone_id": colonia_slug, "tier": "colonia"},
        {"_id": 0, "period": 1, "index_value": 1, "delta_pct": 1},
    ).sort("period", -1).limit(12)
    rows: List[Dict[str, Any]] = []
    async for r in cursor:
        rows.append(r)
    rows.sort(key=lambda r: r.get("period") or "")  # cronológico asc

    points: List[float] = []
    for r in rows:
        v = r.get("index_value")
        if isinstance(v, (int, float)) and v > 0:
            points.append(float(v))
    if len(points) < 3:
        return {
            "label": "flat",
            "slope": 0.0,
            "samples": len(points),
            "latest_index": points[-1] if points else None,
            "latest_period": rows[-1].get("period") if rows else None,
        }
    # LinReg simple: slope = (Σxy - n·x̄·ȳ) / (Σx² - n·x̄²)
    n = len(points)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(points) / n
    num = sum((xs[i] - mean_x) * (points[i] - mean_y) for i in range(n))
    den = sum((x - mean_x) ** 2 for x in xs)
    slope = num / den if den else 0.0
    # Threshold ±0.5 puntos índice por mes
    if slope > 0.5:
        label = "positive"
    elif slope < -0.5:
        label = "negative"
    else:
        label = "flat"
    return {
        "label": label,
        "slope": round(slope, 3),
        "samples": n,
        "latest_index": round(points[-1], 2),
        "latest_period": rows[-1].get("period") if rows else None,
    }


# ─── Narrativa Claude (template fallback) ────────────────────────────────────

def _narrative_template(
    colonia_name: str, value: float, low: float, high: float,
    n_comp: int, avg_comp_price: float, subscore_sec_label: str,
    drpi_label: str, forecast_12m_pct: Optional[float],
) -> str:
    fc_txt = (
        f"{forecast_12m_pct:+.1f}%" if forecast_12m_pct is not None else "sin proyección"
    )
    trend_es = {"positive": "tendencia al alza", "negative": "tendencia a la baja", "flat": "estabilidad"}[drpi_label]
    return (
        f"Tu propiedad en {colonia_name} se estima en ${value/1_000_000:.1f}M "
        f"(rango ${low/1_000_000:.1f}M – ${high/1_000_000:.1f}M). "
        f"Comparado con {n_comp} unidades similares de la zona "
        f"(${avg_comp_price/1_000_000:.1f}M promedio). "
        f"La zona muestra {subscore_sec_label} en seguridad y {trend_es} en plusvalía. "
        f"Proyección 12 meses: {fc_txt}."
    )


def _subscore_label_es(value: Optional[float]) -> str:
    if value is None:
        return "datos limitados"
    if value >= 80:
        return "excelente desempeño"
    if value >= 65:
        return "buen nivel"
    if value >= 50:
        return "nivel medio"
    return "área de mejora"


async def _llm_narrative(
    cma_id: str, colonia_name: str, value: float, low: float, high: float,
    n_comp: int, avg_comp_price: float, subscores: Dict[str, float],
    drpi_label: str, forecast_12m_pct: Optional[float],
    db=None, asesor_id: Optional[str] = None,
) -> str:
    """Genera narrativa con Claude · fallback a template si falla.

    Hard cap 600 chars. Tono asesor cercano. Español es-MX.
    """
    template_fallback = _narrative_template(
        colonia_name, value, low, high, n_comp, avg_comp_price,
        _subscore_label_es(subscores.get("seguridad")),
        drpi_label, forecast_12m_pct,
    )
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return template_fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys_prompt = (
            "Eres un asesor inmobiliario experto en CDMX. Genera una narrativa de máximo 150 palabras "
            "para un análisis comparativo de mercado (CMA) que un asesor compartirá con su cliente. "
            "Tono cercano, profesional, en español es-MX. Sin emojis. Resalta: valor estimado, comparables, "
            "fortalezas de la zona, y proyección a 12 meses."
        )
        user_prompt = (
            f"Colonia: {colonia_name}. Valor estimado: ${value:,.0f} MXN "
            f"(rango ${low:,.0f} – ${high:,.0f}). "
            f"Comparables analizados: {n_comp} (precio promedio ${avg_comp_price:,.0f}). "
            f"Subscores zona: seguridad {subscores.get('seguridad','-')}, "
            f"lifestyle {subscores.get('lifestyle','-')}, "
            f"transporte {subscores.get('transporte','-')}, "
            f"amenidades {subscores.get('amenidades','-')}, "
            f"precio {subscores.get('precio','-')}, vibe {subscores.get('vibe','-')}. "
            f"DRPI: {drpi_label}. Forecast 12m: "
            f"{f'{forecast_12m_pct:+.1f}%' if forecast_12m_pct is not None else 'no disponible'}."
        )
        chat = LlmChat(
            api_key=api_key,
            session_id=f"cma_{cma_id}",
            system_message=sys_prompt,
        ).with_model("anthropic", COACH_MODEL)
        resp = await chat.send_message(UserMessage(text=user_prompt))
        text = (resp or "").strip()
        if len(text) > 600:
            text = text[:597].rstrip() + "…"

        # ── AI cost tracking (best-effort, fire-and-forget) ────────────
        if db is not None:
            try:
                from ai_budget import track_ai_call
                _in_tokens = max(1, (len(user_prompt) + len(sys_prompt)) // 4)
                _out_tokens = max(1, len(text) // 4)
                await track_ai_call(
                    db=db,
                    dev_org_id=asesor_id or "default",
                    model=COACH_MODEL,
                    tokens=_in_tokens + _out_tokens,
                    tokens_in=_in_tokens,
                    tokens_out=_out_tokens,
                    call_type="cma",
                    feature_key="cma",
                )
            except Exception as _exc:
                log.warning(f"[track_ai_call] failed silent: {_exc}")

        return text or template_fallback
    except Exception as exc:
        log.warning(f"[cma] LLM narrative failed · fallback template · {exc}")
        return template_fallback


# ─── Public API ──────────────────────────────────────────────────────────────

def _public_safe(cma: Dict[str, Any]) -> Dict[str, Any]:
    """Strip campos privados (asesor_id, shared_count) para shape pública."""
    if not cma:
        return cma
    out = {k: v for k, v in cma.items() if k not in ("asesor_id", "shared_count", "_internal")}
    return out


async def generate_cma(db, asesor_id: str, subject: Dict[str, Any]) -> Dict[str, Any]:
    """Genera CMA completo · combina 6 engines + persiste en db.cmas.

    `subject` keys requeridas: colonia_slug, m2, recamaras, banos, antiguedad
    Opcional: address (str)
    """
    colonia_slug = (subject.get("colonia_slug") or "").strip()
    if not colonia_slug:
        return {"error": "colonia_slug requerido"}
    try:
        m2 = float(subject.get("m2") or 0)
        rec = int(subject.get("recamaras") or 0)
        ban = int(subject.get("banos") or 0)
        ant = int(subject.get("antiguedad") or 0)
    except (TypeError, ValueError):
        return {"error": "Inputs numéricos inválidos"}
    if m2 < 10 or m2 > 2000 or rec < 0 or ban < 0 or ant < 0:
        return {"error": "Inputs fuera de rango"}

    # 1. AVM
    from avm_public_engine import avm_quick_async
    avm = await avm_quick_async(
        db, colonia_slug, m2, rec, ban, ant, with_explain=False,
    )
    if "error" in avm:
        return {"error": avm["error"], "colonia_slug": colonia_slug}

    estimated_value = float(avm.get("precio_estimado") or 0)
    range_low = float(avm.get("range_low") or 0)
    range_high = float(avm.get("range_high") or 0)
    avm_pm2 = float(avm.get("precio_per_m2") or 0)
    pricing_model = avm.get("pricing_model") or "heuristic"
    colonia_name = avm.get("colonia_name") or colonia_slug.title()
    confidence = avm.get("confidence") or "media"

    # 2. Comparables
    comparables = _build_comparables(colonia_slug, m2, rec, ban, avm_pm2)
    n_comp = len(comparables)
    avg_comp_price = (
        sum(c["price"] for c in comparables) / n_comp if n_comp else estimated_value
    )

    # 3. Subscores
    subscores_full: Dict[str, Any] = {}
    subscores_narratives: Dict[str, str] = {}
    try:
        from zone_score_engine import get_zone_with_subscores
        zs = await get_zone_with_subscores(db, colonia_slug)
        subscores_full = zs.get("subscores") or {}
        subscores_narratives = zs.get("narratives") or {}
    except Exception as exc:
        log.warning(f"[cma] subscores failed · {exc}")

    # 4. Forecast
    forecast_12m_pct: Optional[float] = None
    forecast_24m_pct: Optional[float] = None
    try:
        from forecast_engine import predict_property_forecast
        fc = await predict_property_forecast(db, colonia_slug, m2, rec, ban, ant, horizon_months=[12, 24])
        if fc.get("available"):
            for band in fc.get("horizons", []):
                if band.get("months") == 12:
                    forecast_12m_pct = float(band.get("delta_pct") or 0)
                elif band.get("months") == 24:
                    forecast_24m_pct = float(band.get("delta_pct") or 0)
    except Exception as exc:
        log.warning(f"[cma] forecast failed · {exc}")

    # 5. DRPI trend
    drpi_trend = await _compute_drpi_trend(db, colonia_slug)

    # 6. Narrative
    cma_id = f"cma_{uuid.uuid4().hex[:14]}"
    narrative = await _llm_narrative(
        cma_id, colonia_name, estimated_value, range_low, range_high,
        n_comp, avg_comp_price, subscores_full,
        drpi_trend.get("label", "flat"), forecast_12m_pct,
        db=db, asesor_id=asesor_id,
    )

    now = _now()
    doc: Dict[str, Any] = {
        "id": cma_id,
        "asesor_id": asesor_id,
        "subject_property": {
            "colonia_slug": colonia_slug,
            "colonia_name": colonia_name,
            "m2": m2,
            "recamaras": rec,
            "banos": ban,
            "antiguedad": ant,
            "address": (subject.get("address") or None),
        },
        "estimated_value": round(estimated_value),
        "estimated_range_low": round(range_low),
        "estimated_range_high": round(range_high),
        "estimated_price_per_m2": round(avm_pm2),
        "confidence": confidence,
        "pricing_model": pricing_model,
        "comparables": comparables,
        "comparables_avg_price": round(avg_comp_price),
        "subscores": subscores_full,
        "subscores_narratives": subscores_narratives,
        "forecast_12m_pct": forecast_12m_pct,
        "forecast_24m_pct": forecast_24m_pct,
        "drpi_trend": drpi_trend,
        "narrative": narrative,
        "generated_at": _iso(now),
        "expires_at": now + timedelta(days=TTL_DAYS),  # TTL index
        "shared_count": 0,
    }
    try:
        # Importante: insert_one muta el dict añadiendo _id; copia previa
        await db.cmas.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[cma] persist failed · {exc}")

    # Devolver dict sin _id (ya excluido en la copia original)
    doc["expires_at"] = _iso(doc["expires_at"])
    return doc


async def list_cmas_by_asesor(
    db, asesor_id: str, limit: int = 50, offset: int = 0,
) -> List[Dict[str, Any]]:
    """Lista CMAs del asesor · orden desc por generated_at."""
    out: List[Dict[str, Any]] = []
    cursor = (
        db.cmas.find({"asesor_id": asesor_id}, {"_id": 0})
        .sort("generated_at", -1)
        .skip(int(offset or 0))
        .limit(int(limit or 50))
    )
    async for r in cursor:
        if isinstance(r.get("expires_at"), datetime):
            r["expires_at"] = _iso(r["expires_at"])
        out.append(r)
    return out


async def get_cma(db, cma_id: str) -> Optional[Dict[str, Any]]:
    """Recupera un CMA por id. None si no existe."""
    doc = await db.cmas.find_one({"id": cma_id}, {"_id": 0})
    if not doc:
        return None
    if isinstance(doc.get("expires_at"), datetime):
        doc["expires_at"] = _iso(doc["expires_at"])
    return doc


async def increment_share_count(db, cma_id: str) -> None:
    """Best-effort: incrementa shared_count cuando alguien accede al link público."""
    try:
        await db.cmas.update_one({"id": cma_id}, {"$inc": {"shared_count": 1}})
    except Exception:
        pass


async def ensure_indexes(db) -> None:
    """Crea índices para db.cmas: id unique, asesor_id + generated_at desc, TTL expires_at."""
    try:
        await db.cmas.create_index("id", unique=True)
        await db.cmas.create_index([("asesor_id", 1), ("generated_at", -1)])
        await db.cmas.create_index("expires_at", expireAfterSeconds=0)
        log.info("[cma] indexes OK")
    except Exception as exc:
        log.warning(f"[cma] ensure_indexes warning · {exc}")
