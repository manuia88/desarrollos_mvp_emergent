"""Phase 4 Batch 30 · services — Wrapped Generator.

Genera narrativas mensuales/anuales de actividad del comprador.
Usa Claude Haiku (mensual) o Claude Sonnet (anual) para la narrativa.

Schema db.buyer_wrapped:
  { wrapped_id, user_id, year_month, stats, narrative_text,
    generated_at, viewed_at, shared_count }
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.wrapped_generator")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
HAIKU_MODEL   = "claude-haiku-4-5-20251001"
SONNET_MODEL  = "claude-sonnet-4-5-20250929"
PLATFORM_ORG  = "dmx_platform"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _clean(doc: Dict) -> Dict:
    doc.pop("_id", None)
    for k in ("generated_at", "viewed_at"):
        doc[k] = _iso(doc.get(k))
    return doc


# ─── AI narrative ─────────────────────────────────────────────────────────────

async def _generate_narrative(stats: Dict[str, Any], model: str, is_annual: bool) -> str:
    """
    Llama Claude Haiku/Sonnet para narrativa estilo Spotify Wrapped.
    Retorna string ≤120 palabras (mensual) o ≤200 (anual).
    """
    if not EMERGENT_LLM_KEY:
        return _fallback_narrative(stats, is_annual)

    period = "este año" if is_annual else "este mes"
    word_limit = 200 if is_annual else 120
    top_zona = stats.get("top_zonas", [{}])[0].get("zona", "la ciudad") if stats.get("top_zonas") else "la ciudad"
    avg_price = stats.get("avg_price_seen", 0)
    price_str = f"${avg_price / 1_000_000:.1f}M MXN" if avg_price >= 1_000_000 else f"${avg_price:,.0f} MXN"

    prompt = (
        f"Eres el asistente de DesarrollosMX. Genera una narrativa motivadora para un comprador "
        f"de bienes raíces en CDMX/LATAM, estilo Spotify Wrapped. "
        f"Máximo {word_limit} palabras. Sin markdown. Español mexicano informal pero profesional.\n\n"
        f"Datos del comprador {period}:\n"
        f"- Propiedades vistas: {stats.get('properties_viewed', 0)}\n"
        f"- Zona favorita: {top_zona}\n"
        f"- Precio promedio visto: {price_str}\n"
        f"- Comparaciones realizadas: {stats.get('comparisons_count', 0)}\n"
        f"- Favoritos agregados: {stats.get('favoritos_added', 0)}\n"
        f"- Alertas enviadas: {stats.get('alerts_triggered', 0)}\n"
        f"- Asesores con quien habló: {stats.get('asesores_count', 0)}\n\n"
        f"Genera la narrativa en 3-4 oraciones. Sé específico con los números. "
        f"Termina con una frase motivadora sobre su búsqueda."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        session_id = f"wrapped_{uuid.uuid4().hex[:8]}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message="Eres el asistente de DesarrollosMX. Responde en español mexicano.",
        ).with_model("anthropic", model)
        raw = await chat.send_message(UserMessage(text=prompt))
        if raw and raw.strip():
            text = raw.strip()
            # Track AI cost
            try:
                from ai_budget import track_ai_call
                import asyncio
                t_in = len(prompt) // 4
                t_out = len(text) // 4
                # Use create_task so it doesn't block
                asyncio.get_event_loop().create_task(
                    track_ai_call(None, PLATFORM_ORG, model, 0, "wrapped_narrative",
                                  tokens_in=t_in, tokens_out=t_out)
                )
            except Exception:
                pass
            return text
    except Exception as e:
        log.warning(f"[wrapped_gen] Claude error ({model}): {e}")

    return _fallback_narrative(stats, is_annual)


def _fallback_narrative(stats: Dict[str, Any], is_annual: bool) -> str:
    period = "este año" if is_annual else "este mes"
    n = stats.get("properties_viewed", 0)
    top_zona = stats.get("top_zonas", [{}])[0].get("zona", "la ciudad") if stats.get("top_zonas") else "la ciudad"
    favs = stats.get("favoritos_added", 0)
    return (
        f"{period.capitalize()} exploraste {n} propiedades en DesarrollosMX. "
        f"Tu zona favorita fue {top_zona}. "
        f"Guardaste {favs} favorito{'s' if favs != 1 else ''}. "
        f"Sigue así — tu propiedad ideal está cada vez más cerca."
    )


# ─── Stats aggregation ────────────────────────────────────────────────────────

async def _aggregate_stats(db, user_id: str, start: datetime, end: datetime) -> Dict[str, Any]:
    """Agrega estadísticas del buyer en el rango start..end."""

    # 1. buyer_views — count + top zonas
    properties_viewed = await db.buyer_views.count_documents({
        "user_id": user_id,
        "viewed_at": {"$gte": start, "$lt": end},
    })

    # Top zonas: agrupar item_id, luego obtener colonia de developments
    top_zonas: List[Dict] = []
    try:
        views = await db.buyer_views.find(
            {"user_id": user_id, "viewed_at": {"$gte": start, "$lt": end}},
            {"_id": 0, "item_id": 1},
        ).to_list(500)
        zona_count: Dict[str, int] = {}
        for v in views:
            item_id = v.get("item_id", "")
            dev = await db.developments.find_one(
                {"$or": [{"id": item_id}, {"slug": item_id}]},
                {"_id": 0, "colonia": 1, "colonia_id": 1},
            )
            if dev:
                zona = dev.get("colonia") or dev.get("colonia_id") or "Otras"
                zona_count[zona] = zona_count.get(zona, 0) + 1
        top_zonas = sorted(
            [{"zona": k, "count": v} for k, v in zona_count.items()],
            key=lambda x: -x["count"],
        )[:5]
    except Exception:
        pass

    # 2. avg_price_seen
    avg_price_seen = 0
    try:
        prices = []
        views_ids = await db.buyer_views.find(
            {"user_id": user_id, "viewed_at": {"$gte": start, "$lt": end}},
            {"_id": 0, "item_id": 1},
        ).to_list(200)
        for v in views_ids:
            dev = await db.developments.find_one(
                {"$or": [{"id": v["item_id"]}, {"slug": v["item_id"]}]},
                {"_id": 0, "price_from": 1},
            )
            if dev and dev.get("price_from"):
                prices.append(dev["price_from"])
        if prices:
            avg_price_seen = sum(prices) / len(prices)
    except Exception:
        pass

    # 3. buyer_favorites — count in period
    favoritos_added = await db.buyer_favorites.count_documents({
        "user_id": user_id,
        "added_at": {"$gte": start, "$lt": end},
    })

    # 4. alert_deliveries — count in period
    alerts_triggered = await db.alert_deliveries.count_documents({
        "user_id": user_id,
        "sent_at": {"$gte": start, "$lt": end},
        "status": "sent",
    })

    # 5. chat_threads — asesores únicos hablados
    asesores_count = 0
    try:
        threads = await db.chat_threads.distinct("asesor_id", {
            "buyer_id": user_id,
            "created_at": {"$gte": start, "$lt": end},
        })
        asesores_count = len(threads)
    except Exception:
        pass

    # 6. comparisons — desde funnel_events B20
    comparisons_count = 0
    try:
        comparisons_count = await db.funnel_events.count_documents({
            "user_id": user_id,
            "event_type": "comparator_used",
            "ts": {"$gte": start, "$lt": end},
        })
    except Exception:
        pass

    # 7. top_amenities (from viewed developments)
    top_amenities: List[str] = []
    try:
        amenity_count: Dict[str, int] = {}
        for v in views_ids[:50]:  # type: ignore[name-defined]
            dev = await db.developments.find_one(
                {"$or": [{"id": v["item_id"]}, {"slug": v["item_id"]}]},
                {"_id": 0, "amenities": 1},
            )
            if dev:
                for am in dev.get("amenities", []):
                    amenity_count[am] = amenity_count.get(am, 0) + 1
        top_amenities = sorted(amenity_count, key=lambda k: -amenity_count[k])[:5]
    except Exception:
        pass

    return {
        "properties_viewed": properties_viewed,
        "top_zonas": top_zonas,
        "avg_price_seen": round(avg_price_seen),
        "favoritos_added": favoritos_added,
        "alerts_triggered": alerts_triggered,
        "asesores_count": asesores_count,
        "comparisons_count": comparisons_count,
        "top_amenities": top_amenities,
        "total_time_minutes": properties_viewed * 3,  # estimación 3 min/propiedad
    }


# ─── Main generators ───────────────────────────────────────────────────────────

async def generate_monthly_wrapped(db, user_id: str, year_month: str) -> Optional[Dict[str, Any]]:
    """
    Genera (o retorna cacheado) el wrapped mensual para user_id en 'YYYY-MM'.
    Retorna None si el user no tiene actividad.
    """
    # Check cache
    existing = await db.buyer_wrapped.find_one(
        {"user_id": user_id, "year_month": year_month},
        {"_id": 0},
    )
    if existing:
        return _clean(existing)

    # Parse date range
    try:
        year, month = map(int, year_month.split("-"))
    except Exception:
        return None

    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    stats = await _aggregate_stats(db, user_id, start, end)

    # Skip if no activity
    if stats["properties_viewed"] == 0 and stats["favoritos_added"] == 0:
        return None

    narrative = await _generate_narrative(stats, HAIKU_MODEL, is_annual=False)

    wrapped_id = uuid.uuid4().hex
    now = _now()
    doc = {
        "wrapped_id": wrapped_id,
        "user_id": user_id,
        "year_month": year_month,
        "stats": stats,
        "narrative_text": narrative,
        "generated_at": now,
        "viewed_at": None,
        "shared_count": 0,
    }
    try:
        await db.buyer_wrapped.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[wrapped_gen] insert error: {e}")

    doc.pop("_id", None)
    doc["generated_at"] = _iso(now)
    doc["viewed_at"] = None
    return doc


async def generate_annual_wrapped(db, user_id: str, year: int) -> Optional[Dict[str, Any]]:
    """
    Genera (o retorna cacheado) el wrapped anual para user_id en 'YYYY'.
    Usa Claude Sonnet para la narrativa.
    """
    year_key = f"{year}-annual"

    existing = await db.buyer_wrapped.find_one(
        {"user_id": user_id, "year_month": year_key},
        {"_id": 0},
    )
    if existing:
        return _clean(existing)

    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    stats = await _aggregate_stats(db, user_id, start, end)

    if stats["properties_viewed"] == 0 and stats["favoritos_added"] == 0:
        return None

    narrative = await _generate_narrative(stats, SONNET_MODEL, is_annual=True)

    wrapped_id = uuid.uuid4().hex
    now = _now()
    doc = {
        "wrapped_id": wrapped_id,
        "user_id": user_id,
        "year_month": year_key,
        "stats": stats,
        "narrative_text": narrative,
        "generated_at": now,
        "viewed_at": None,
        "shared_count": 0,
    }
    try:
        await db.buyer_wrapped.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[wrapped_gen] annual insert error: {e}")

    doc.pop("_id", None)
    doc["generated_at"] = _iso(now)
    doc["viewed_at"] = None
    return doc


# ─── Bulk monthly (for scheduler) ─────────────────────────────────────────────

async def generate_bulk_monthly(db, year_month: str) -> Dict[str, Any]:
    """
    Genera wrapped mensual para todos los buyers con actividad ese mes.
    Llamado por el scheduler el 1ro de cada mes.
    """
    try:
        year, month = map(int, year_month.split("-"))
    except Exception:
        return {"error": "year_month inválido"}

    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    # Find active users
    try:
        user_ids = await db.buyer_views.distinct("user_id", {
            "viewed_at": {"$gte": start, "$lt": end},
        })
    except Exception:
        user_ids = []

    generated = 0
    skipped = 0
    for uid in user_ids:
        try:
            result = await generate_monthly_wrapped(db, uid, year_month)
            if result:
                generated += 1
                # Send email notification
                try:
                    await _notify_wrapped_ready(db, uid, year_month, result)
                except Exception:
                    pass
            else:
                skipped += 1
        except Exception as e:
            log.warning(f"[wrapped_gen] bulk error for user {uid}: {e}")
            skipped += 1

    log.info(f"[wrapped_gen] bulk {year_month}: generated={generated} skipped={skipped}")
    return {"year_month": year_month, "generated": generated, "skipped": skipped}


async def _notify_wrapped_ready(db, user_id: str, year_month: str, wrapped: Dict) -> None:
    """Envía email al buyer notificando que su wrapped está listo."""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1})
    if not user or not user.get("email"):
        return

    try:
        year, month = year_month.split("-")
        from datetime import date
        month_name = date(int(year), int(month), 1).strftime("%B %Y").capitalize()
    except Exception:
        month_name = year_month

    stats = wrapped.get("stats", {})
    name = user.get("name", "").split()[0] if user.get("name") else "Hola"
    n = stats.get("properties_viewed", 0)
    top_zona = stats.get("top_zonas", [{}])[0].get("zona", "") if stats.get("top_zonas") else ""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#06080F;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:rgba(13,16,23,0.92);border:1px solid rgba(240,235,224,0.10);border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#6366F1,#EC4899);padding:4px 0;"></td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;color:#F0EBE0;margin-bottom:6px;">DesarrollosMX</div>
          <div style="font-size:11px;font-weight:700;color:rgba(99,102,241,0.85);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:24px;">Tu Wrapped {month_name}</div>
          <div style="font-size:28px;font-weight:800;color:#F0EBE0;font-family:'Outfit',Arial;letter-spacing:-0.02em;margin-bottom:8px;">{name}, tu mes en review</div>
          <div style="font-size:15px;color:rgba(240,235,224,0.75);line-height:1.6;margin-bottom:24px;">
            Viste <strong>{n} propiedades</strong>{f' · zona favorita: <strong>{top_zona}</strong>' if top_zona else ''}.
            Tu resumen personalizado está listo.
          </div>
          <a href="https://desarrollosmx.com/comprador/wrapped/{year_month}"
            style="display:inline-block;padding:13px 26px;border-radius:9999px;
            background:linear-gradient(90deg,#6366F1,#EC4899);
            color:#fff;font-size:14px;font-weight:700;text-decoration:none;">
            Ver mi Wrapped
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(240,235,224,0.06);">
          <div style="font-size:11px;color:rgba(240,235,224,0.3);">
            Generado automáticamente el 1ro de cada mes · DesarrollosMX Portal Comprador
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    from services.lead_capture import _send_email
    await _send_email(
        user["email"],
        f"Tu Wrapped {month_name} está listo · DesarrollosMX",
        html,
    )


async def send_annual_optin_emails(db, year: int) -> Dict[str, Any]:
    """
    Envía emails de opt-in para wrapped anual (1 diciembre).
    """
    # Users with activity this year
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    try:
        user_ids = await db.buyer_views.distinct("user_id", {
            "viewed_at": {"$gte": start, "$lt": end},
        })
    except Exception:
        user_ids = []

    sent = 0
    for uid in user_ids:
        try:
            user = await db.users.find_one({"user_id": uid}, {"_id": 0, "email": 1, "name": 1})
            if not user or not user.get("email"):
                continue
            name = user.get("name", "").split()[0] if user.get("name") else "Hola"
            html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#06080F;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:rgba(13,16,23,0.92);border:1px solid rgba(240,235,224,0.10);border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#6366F1,#EC4899);padding:4px 0;"></td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;color:#F0EBE0;margin-bottom:24px;">DesarrollosMX</div>
          <div style="font-size:28px;font-weight:800;color:#F0EBE0;font-family:'Outfit';margin-bottom:12px;">{name}, ¿quieres tu Wrapped {year} anual?</div>
          <div style="font-size:14px;color:rgba(240,235,224,0.75);line-height:1.6;margin-bottom:24px;">
            Este año exploraste el mercado inmobiliario de CDMX. Genera tu resumen anual personalizado con IA.
          </div>
          <a href="https://desarrollosmx.com/comprador/wrapped?annual={year}"
            style="display:inline-block;padding:13px 26px;border-radius:9999px;
            background:linear-gradient(90deg,#6366F1,#EC4899);
            color:#fff;font-size:14px;font-weight:700;text-decoration:none;">
            Generar mi Wrapped {year}
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
            from services.lead_capture import _send_email
            await _send_email(
                user["email"],
                f"¿Quieres tu Wrapped {year} anual? · DesarrollosMX",
                html,
            )
            sent += 1
        except Exception as e:
            log.warning(f"[wrapped_gen] annual optin email error user {uid}: {e}")

    return {"year": year, "emails_sent": sent}


# ─── Ensure indexes ────────────────────────────────────────────────────────────

async def ensure_wrapped_indexes(db) -> None:
    await db.buyer_wrapped.create_index("wrapped_id", unique=True)
    await db.buyer_wrapped.create_index("user_id")
    await db.buyer_wrapped.create_index([("user_id", 1), ("year_month", -1)])
    await db.buyer_wrapped.create_index([("user_id", 1), ("year_month", 1)], unique=True, sparse=True)
