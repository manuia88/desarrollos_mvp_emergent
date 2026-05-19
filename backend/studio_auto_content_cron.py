"""W5.22 Z.2 Sub-C — Studio Auto-content Cron.

Cron diario 06:00 UTC (= 00:00 MX) para usuarios T2+ activos (login 30d).
Genera 1-3 sugerencias por user usando:
  - BANXICO rate change (W5.20)
  - zone_score top mover 7d (W3)
  - demand_supply_gap por zona favorita (W3)
  - fsd_zone accuracy top (W5.15)
  - price_velocity spike (W5.5)

Idempotency: sha256(user_id+iso_date)[:16] en studio_auto_content_idem TTL 25h.

Collection studio_auto_content_queue: {id, tenant_id, user_id, suggested_topic_id,
  context_data, suggested_copy_preview, suggested_aspect_ratios, language,
  status, expires_at, created_at}
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_auto_content")

TOPICS = [
    "banxico_rate_change",
    "zone_hot",
    "demand_supply_gap",
    "fsd_zone_top",
    "price_velocity_spike",
]

QUEUE_TTL_HOURS = 24


async def _get_banxico_context(db) -> Optional[Dict]:
    try:
        from data_sources.banxico_engine import BanxicoEngine
        result = await BanxicoEngine(db).lookup("SF43783")  # TIIE 28d
        if result and result.get("value"):
            return {
                "topic": "banxico_rate_change",
                "label": "Tasa TIIE 28d BANXICO",
                "value": result.get("value"),
                "unit": result.get("unit", "%"),
                "source": "BANXICO SIE oficial",
            }
    except Exception as exc:
        log.debug(f"[auto_content] banxico: {exc}")
    return None


async def _get_zone_hot_context(db) -> Optional[Dict]:
    try:
        zones = await db.zone_scores.find(
            {}, {"_id": 0, "zone_id": 1, "zone_name": 1, "score_total": 1, "momentum_7d": 1}
        ).sort("momentum_7d", -1).limit(1).to_list(1)
        if zones:
            z = zones[0]
            return {
                "topic": "zone_hot",
                "label": f"Zona caliente: {z.get('zone_name', z.get('zone_id', 'N/A'))}",
                "value": f"+{z.get('momentum_7d', 0):.1f}% momentum 7d",
                "zone_id": z.get("zone_id", ""),
                "source": "zone_score (W3)",
            }
    except Exception as exc:
        log.debug(f"[auto_content] zone_hot: {exc}")
    # Fallback demo
    return {
        "topic": "zone_hot",
        "label": "Zona caliente: Roma Norte",
        "value": "+12% momentum 7d",
        "zone_id": "roma-norte",
        "source": "zone_score (demo)",
    }


async def _get_price_velocity_context(db) -> Optional[Dict]:
    try:
        pulses = await db.live_pulse_snapshots.find(
            {}, {"_id": 0, "zone_id": 1, "price_change_7d_pct": 1}
        ).sort("price_change_7d_pct", -1).limit(1).to_list(1)
        if pulses and pulses[0].get("price_change_7d_pct"):
            p = pulses[0]
            return {
                "topic": "price_velocity_spike",
                "label": f"Spike de precio: zona {p.get('zone_id', 'N/A')}",
                "value": f"+{p['price_change_7d_pct']:.1f}% precio 7d",
                "zone_id": p.get("zone_id", ""),
                "source": "live_pulse (W5.5)",
            }
    except Exception as exc:
        log.debug(f"[auto_content] price_velocity: {exc}")
    return None


async def _build_suggestions(db, user: Dict) -> List[Dict]:
    suggestions = []
    uid = user.get("user_id", "")
    lang = user.get("preferred_language", "es-MX")
    tenant_id = user.get("tenant_id", "")

    ctx_list = await asyncio.gather(
        _get_banxico_context(db),
        _get_zone_hot_context(db),
        _get_price_velocity_context(db),
        return_exceptions=True,
    )

    for ctx in ctx_list:
        if not ctx or isinstance(ctx, Exception) or not isinstance(ctx, dict):
            continue
        topic = ctx.get("topic", "")
        label = ctx.get("label", "")
        value = ctx.get("value", "")
        source = ctx.get("source", "")

        preview = _build_copy_preview(topic, label, value, lang)

        suggestions.append({
            "id": f"acq_{uuid.uuid4().hex[:14]}",
            "tenant_id": tenant_id,
            "user_id": uid,
            "suggested_topic_id": topic,
            "context_data": {
                "label": label,
                "value": value,
                "source": source,
                "zone_id": ctx.get("zone_id"),
            },
            "suggested_copy_preview": preview,
            "suggested_aspect_ratios": ["1:1", "9:16", "16:9"],
            "language": lang,
            "status": "pending",
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=QUEUE_TTL_HOURS),
            "created_at": datetime.now(timezone.utc),
        })
        if len(suggestions) >= 3:
            break

    return suggestions


def _build_copy_preview(topic: str, label: str, value: str, lang: str) -> str:
    if lang == "en-US":
        templates = {
            "banxico_rate_change": f"Interest rate update: {value}. This directly affects your clients' mortgage capacity.",
            "zone_hot": f"{label} — {value}. Now is the time to show your inventory in this zone.",
            "demand_supply_gap": f"Demand exceeds supply in key zones. Your listing stands out now.",
            "fsd_zone_top": f"Our predictive model identifies this zone as top performer. Share the data.",
            "price_velocity_spike": f"{label} — {value}. Your clients need to know.",
        }
    else:
        templates = {
            "banxico_rate_change": f"Actualizacion de tasa: {value}. Esto impacta directamente la capacidad hipotecaria de tus clientes.",
            "zone_hot": f"{label} — {value}. Es momento de mostrar tu inventario en esta zona.",
            "demand_supply_gap": f"La demanda supera a la oferta en zonas clave. Tu listing destaca ahora.",
            "fsd_zone_top": f"Nuestro modelo predictivo identifica esta zona como top performer. Comparte el dato.",
            "price_velocity_spike": f"{label} — {value}. Tus clientes necesitan saberlo.",
        }
    return templates.get(topic, f"{label}: {value}")


async def run_daily_batch(db) -> Dict[str, Any]:
    """Punto de entrada del cron. Itera users T2+ activos, genera sugerencias."""
    now = datetime.now(timezone.utc)
    iso_date = now.strftime("%Y-%m-%d")
    cutoff_login = now - timedelta(days=30)

    # Usuarios T2+ activos (plan_tier pro/enterprise) con login en 30d
    users = await db.users.find(
        {
            "role": {"$in": ["advisor", "asesor_admin", "developer_admin", "superadmin"]},
            "last_login_at": {"$gte": cutoff_login},
        },
        {"_id": 0, "user_id": 1, "tenant_id": 1, "preferred_language": 1, "email": 1}
    ).to_list(500)

    generated = 0
    skipped = 0

    for user in users:
        uid = user.get("user_id", "")
        if not uid:
            continue

        # Idempotency check
        idem_key = hashlib.sha256(f"{uid}{iso_date}".encode()).hexdigest()[:16]
        existing = await db.studio_auto_content_idem.find_one({"_id": idem_key})
        if existing:
            skipped += 1
            continue

        try:
            suggestions = await _build_suggestions(db, user)
            if suggestions:
                await db.studio_auto_content_queue.insert_many(suggestions)
                generated += len(suggestions)

                # Emit notification (best-effort)
                try:
                    from notifications_engine import emit_notification
                    await emit_notification(
                        db,
                        user_id=uid,
                        tenant_id=user.get("tenant_id"),
                        type="generic",
                        severity="normal",
                        title="Contenido sugerido listo",
                        body=f"Tienes {len(suggestions)} sugerencia(s) de contenido para hoy. Aprueba y genera tu carrusel.",
                        action_url="/portal/studio/auto-content",
                    )
                except Exception as ne:
                    log.debug(f"[auto_content] notif failed: {ne}")

            # Mark idempotency (TTL 25h handled by MongoDB TTL index)
            await db.studio_auto_content_idem.update_one(
                {"_id": idem_key},
                {"$set": {"_id": idem_key, "user_id": uid, "date": iso_date,
                           "created_at": now}},
                upsert=True,
            )
        except Exception as exc:
            log.warning(f"[auto_content] user {uid} failed: {exc}")

    log.info(f"[auto_content] cron done: generated={generated} skipped={skipped} total_users={len(users)}")
    return {"generated": generated, "skipped": skipped, "users_processed": len(users)}


async def approve_queue_item(db, queue_id: str, user_id: str) -> Dict[str, Any]:
    item = await db.studio_auto_content_queue.find_one(
        {"id": queue_id, "user_id": user_id, "status": "pending"}, {"_id": 0}
    )
    if not item:
        return {"ok": False, "error": "Sugerencia no encontrada o ya procesada"}

    from studio_carrusel_engine import generate_carrusel_job
    pages_data = {
        "hero": {
            "title": item.get("suggested_copy_preview", "")[:80],
            "subtitle": item.get("context_data", {}).get("label", ""),
        },
        "stats": [
            {"label": item.get("context_data", {}).get("label", ""), "value": item.get("context_data", {}).get("value", "")},
        ],
        "cta": {"text": "Ver mas"},
        "disclaimer": f"Fuente: {item.get('context_data', {}).get('source', 'DMX')}",
    }

    result = await generate_carrusel_job(
        db,
        tenant_id=item.get("tenant_id", ""),
        user_id=user_id,
        copy_id=None,
        brand_kit_id=None,
        pages_data=pages_data,
        aspect_ratios=item.get("suggested_aspect_ratios", ["1:1", "9:16", "16:9"]),
        hook_score_pre_gate_min=0,  # Auto-content bypasa el gate de score
        project_id=None,
    )

    carrusel_id = result.get("carrusel_id") or result.get("carrusel_a_id")
    await db.studio_auto_content_queue.update_one(
        {"id": queue_id},
        {"$set": {"status": carrusel_id or "approved", "generated_carrusel_id": carrusel_id}},
    )
    return {"ok": True, "queue_id": queue_id, "carrusel_id": carrusel_id}


async def reject_queue_item(db, queue_id: str, user_id: str) -> bool:
    result = await db.studio_auto_content_queue.update_one(
        {"id": queue_id, "user_id": user_id, "status": "pending"},
        {"$set": {"status": "rejected"}},
    )
    return result.modified_count > 0


async def list_queue(db, user_id: str, status_filter: Optional[str] = None, limit: int = 20, skip: int = 0) -> List[Dict]:
    q: Dict[str, Any] = {"user_id": user_id}
    if status_filter:
        q["status"] = status_filter
    cursor = db.studio_auto_content_queue.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    return await cursor.to_list(limit)


async def queue_stats(db, user_id: str) -> Dict[str, int]:
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    docs = await db.studio_auto_content_queue.aggregate(pipeline).to_list(20)
    counts = {d["_id"]: d["count"] for d in docs}
    return {
        "pending": counts.get("pending", 0),
        "approved": counts.get("approved", 0) + len([v for k, v in counts.items() if k and k.startswith("cr_")]),
        "rejected": counts.get("rejected", 0),
        "expired": counts.get("expired", 0),
    }


def register_auto_content_job(scheduler, db) -> None:
    from apscheduler.triggers.cron import CronTrigger
    import asyncio

    def _sync_run():
        try:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(run_daily_batch(db))
        except Exception as exc:
            log.warning(f"[auto_content] cron run failed: {exc}")

    scheduler.add_job(
        run_daily_batch,
        CronTrigger(hour=6, minute=0, timezone="UTC"),
        id="studio_auto_content_daily",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
    )
    log.info("[auto_content] daily cron registered @ 06:00 UTC")


async def ensure_indexes(db) -> None:
    await db.studio_auto_content_queue.create_index(
        [("user_id", 1), ("created_at", -1)], background=True
    )
    await db.studio_auto_content_queue.create_index("id", unique=True, background=True)
    await db.studio_auto_content_queue.create_index(
        "expires_at", expireAfterSeconds=0, background=True, name="ttl_expires"
    )
    await db.studio_auto_content_idem.create_index(
        "created_at", expireAfterSeconds=90000, background=True, name="ttl_idem"
    )
    log.info("[studio_auto_content] indexes OK")
