"""W4.10 Sub-Fix 2 — AutoNewsletter Pulse Engine.

4 segmentos (dev/asesor/buyer/inversionista) · Claude Haiku · digest sub-agents absorbidos.
Cron domingo 18:00 MX genera · cron lunes 07:00 MX envía via Resend.

Phase Y: master_switch + feature_tier newsletter_pulse >= T1
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

log = logging.getLogger("dmx.newsletter_pulse")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "DMX <hola@desarrollosmx.io>")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
NURTURE_THROTTLE_DAYS = int(os.environ.get("NURTURE_THROTTLE_DAYS", "7"))

VALID_SEGMENTS = {"dev", "asesor", "buyer", "inversionista"}

SEGMENT_LABELS = {
    "dev": "Desarrolladores",
    "asesor": "Asesores Inmobiliarios",
    "buyer": "Compradores",
    "inversionista": "Inversionistas",
}

SEGMENT_CTA = {
    "dev": "Ver mis recomendaciones de pricing →",
    "asesor": "Ver mis leads listos →",
    "buyer": "Ver propiedades guardadas →",
    "inversionista": "Ver análisis ROI →",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _run_id() -> str:
    return f"pulse_{uuid.uuid4().hex[:12]}"


# ─── Phase Y check ─────────────────────────────────────────────────────────────

async def _check_phase_y(db, org_id: str) -> bool:
    try:
        from routes.phase_y_controls import get_phase_y_settings
        s = await get_phase_y_settings(db, org_id)
        if not s.get("agentic_enabled", False):
            return False
        tier = (s.get("feature_tiers") or {}).get("newsletter_pulse", "off")
        return tier not in ("off", "T0")
    except Exception:
        return False


# ─── Claude Haiku content generation ──────────────────────────────────────────

async def _generate_segment_content(segment: str, zone_data: Dict) -> Dict[str, Any]:
    """Genera contenido para un segmento usando Claude Haiku."""
    if not EMERGENT_LLM_KEY:
        return _stub_segment_content(segment)

    top_zones = zone_data.get("top_growth", [])[:3]
    zones_txt = ", ".join([f"{z['name']} ({z.get('delta','?')}%)" for z in top_zones]) or "Polanco, Roma Norte, Condesa"

    segment_context = {
        "dev": "desarrolladores que construyen proyectos residenciales en CDMX",
        "asesor": "asesores inmobiliarios que venden propiedades nuevas en CDMX",
        "buyer": "compradores buscando su primera o segunda propiedad en CDMX",
        "inversionista": "inversionistas analizando rentabilidad en mercado inmobiliario CDMX",
    }

    prompt = (
        f"Eres el editor del boletín semanal de DesarrollosMX, plataforma líder de real estate CDMX. "
        f"Genera el contenido del Pulse semanal para segmento: {segment_context.get(segment, segment)}. "
        f"Zonas con mayor crecimiento esta semana: {zones_txt}. "
        f"Responde SOLO JSON con estas claves: "
        f"hero_title (1 frase impactante ≤12 palabras sin emojis), "
        f"market_summary (3-4 oraciones sobre mercado CDMX esta semana, usa números reales), "
        f"top_3_zonas (array de 3 objetos {{name, insight}}), "
        f"segment_highlight (1-2 oraciones específicas para este segmento). "
        f"REGLAS: sin emojis, español mexicano formal, datos concretos, tono ejecutivo."
    )

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"newsletter_pulse_{segment}",
            system_message="Eres editor de newsletter real estate CDMX. Responde solo JSON válido.",
        ).with_model("anthropic", "claude-haiku-4-5")
        resp = await chat.send_message(UserMessage(text=prompt))
        import json
        raw = resp.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        content = json.loads(raw.strip())
        cost_usd = 0.001  # Haiku ~$0.001/call
        return {**content, "cost_usd": cost_usd, "layer": "llm"}
    except Exception as exc:
        log.warning(f"[newsletter] haiku generation failed ({segment}): {exc}")
        return _stub_segment_content(segment)


def _stub_segment_content(segment: str) -> Dict[str, Any]:
    """Contenido stub cuando LLM no disponible."""
    return {
        "hero_title": f"Pulse semanal · {SEGMENT_LABELS.get(segment, segment)}",
        "market_summary": (
            "El mercado inmobiliario de CDMX mantiene dinamismo esta semana. "
            "Polanco y Roma Norte lideran el crecimiento en precio por m². "
            "La absorción de unidades en preventa se mantiene estable. "
            "DesarrollosMX registra nuevas tendencias de demanda en alcaldías centrales."
        ),
        "top_3_zonas": [
            {"name": "Polanco", "insight": "Precio por m² en máximo histórico del trimestre."},
            {"name": "Roma Norte", "insight": "Mayor velocidad de absorción en preventa."},
            {"name": "Condesa", "insight": "Nueva oferta de desarrollos boutique."},
        ],
        "segment_highlight": f"Esta semana hay oportunidades relevantes para {SEGMENT_LABELS.get(segment, segment).lower()}.",
        "cost_usd": 0.0,
        "layer": "stub",
    }


# ─── Per-user personalization ─────────────────────────────────────────────────

async def _get_user_personalization(db, user: Dict, segment: str) -> str:
    """Genera sección personalizada según segmento."""
    user_id = user.get("user_id") or user.get("_id")

    if segment == "dev":
        # Top 3 recommendations Phase Y (pending, sorted por expected_lift_pct DESC)
        try:
            recs = await db.phase_y_recommendations.find(
                {"org_id": user.get("org_id"), "status": "pending"},
                {"_id": 0, "title": 1, "expected_lift_pct": 1, "category": 1},
            ).sort("expected_lift_pct", -1).limit(3).to_list(3)
            if recs:
                lines = [f"• {r.get('title','Recomendación')} (+{r.get('expected_lift_pct',0):.1f}% ROI estimado)" for r in recs]
                return "Tus top 3 acciones esta semana:\n" + "\n".join(lines)
        except Exception:
            pass
        return "Revisa tus recomendaciones de pricing y marketing en el portal."

    elif segment == "asesor":
        # Top 5 leads pendientes por Smart Routing score
        try:
            sequences = await db.nurture_sequences.find(
                {"asesor_id": user_id, "status": {"$in": ["active", "pending"]}},
                {"_id": 0, "lead_id": 1},
            ).limit(5).to_list(5)
            count = len(sequences)
            if count > 0:
                return f"Tienes {count} lead{'s' if count > 1 else ''} activo{'s' if count > 1 else ''} listos para seguimiento esta semana."
        except Exception:
            pass
        return "Revisa tu lista de leads y próximas citas en el portal."

    elif segment == "buyer":
        # 3 propiedades match watchlist
        try:
            favs = await db.buyer_favorites.find(
                {"user_id": user_id},
                {"_id": 0, "development_id": 1},
            ).limit(3).to_list(3)
            count = len(favs)
            if count > 0:
                return f"Tienes {count} propiedad{'es' if count > 1 else ''} guardada{'s' if count > 1 else ''} en tu lista. Verifica si hay cambios de precio."
        except Exception:
            pass
        return "Explora las novedades del mercado en tu zona de interés."

    elif segment == "inversionista":
        # ROI summary + zonas growth
        try:
            explorer = await db.investment_explorer_results.find_one(
                {"user_id": user_id},
                {"_id": 0, "top_zones": 1, "avg_roi_5y": 1},
                sort=[("created_at", -1)],
            )
            if explorer:
                roi = explorer.get("avg_roi_5y", 0)
                return f"Tu ROI proyectado a 5 años en las zonas analizadas: {roi:.1f}%. Actualiza tu portafolio."
        except Exception:
            pass
        return "El Investment Explorer tiene nuevas zonas con potencial de plusvalía."

    return ""


# ─── HTML email builder ────────────────────────────────────────────────────────

def _build_email_html(
    user_name: str,
    segment: str,
    content: Dict,
    personalized_section: str,
    unsubscribe_url: str,
    app_url: str = "https://desarrollosmx.io",
) -> str:
    top_zones_html = "".join([
        f"<li style='margin-bottom:8px;'><strong>{z.get('name','')}</strong> — {z.get('insight','')}</li>"
        for z in content.get("top_3_zonas", [])
    ])
    personal_html = (
        f"<div style='background:#f9f7f3;border-left:4px solid #6366F1;padding:14px 18px;margin:20px 0;border-radius:6px;'>"
        f"<p style='margin:0;font-size:14px;color:#06080F;'>{personalized_section}</p>"
        f"</div>"
    ) if personalized_section else ""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
  <!-- Header gradient -->
  <tr><td style="background:linear-gradient(90deg,#6366F1,#EC4899);padding:28px 32px 24px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">
      DesarrollosMX · Pulse Semanal · {SEGMENT_LABELS.get(segment, segment)}
    </p>
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.25;">
      {content.get('hero_title', 'Pulse Semanal')}
    </h1>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="color:#444;font-size:14px;margin:0 0 4px;">Hola <strong>{user_name}</strong>,</p>
    <p style="color:#666;font-size:13px;margin:0 0 20px;">Resumen ejecutivo del mercado inmobiliario CDMX esta semana.</p>
    <!-- Market summary -->
    <p style="color:#06080F;font-size:14px;line-height:1.65;margin:0 0 20px;">{content.get('market_summary','')}</p>
    <!-- Zonas top -->
    <h3 style="color:#06080F;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Top 3 Zonas Esta Semana</h3>
    <ul style="padding-left:18px;color:#444;font-size:13px;line-height:1.6;margin:0 0 20px;">{top_zones_html}</ul>
    <!-- Personalized -->
    {personal_html}
    <!-- Segment highlight -->
    <p style="color:#444;font-size:13.5px;font-style:italic;border-top:1px solid #eee;padding-top:16px;margin:0 0 20px;">
      {content.get('segment_highlight','')}
    </p>
    <!-- CTA -->
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="{app_url}" style="display:inline-block;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;text-decoration:none;padding:13px 32px;border-radius:9999px;font-weight:700;font-size:13px;letter-spacing:0.02em;">
        {SEGMENT_CTA.get(segment, 'Ver en DesarrollosMX →')}
      </a>
    </div>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:16px 32px;background:#f9f9f9;border-top:1px solid #eee;">
    <p style="margin:0;font-size:11px;color:#999;text-align:center;">
      DesarrollosMX · Plataforma de Inteligencia Inmobiliaria CDMX<br>
      <a href="{unsubscribe_url}" style="color:#aaa;">Cancelar suscripción</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>"""


# ─── Resend email send ────────────────────────────────────────────────────────

async def _send_resend(to_email: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        log.info(f"[newsletter] Resend stub — would email {to_email}")
        return False
    try:
        import httpx
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": RESEND_FROM, "to": [to_email], "subject": subject, "html": html},
            timeout=10,
        )
        if resp.status_code in (200, 201):
            return True
        log.warning(f"[newsletter] resend error {resp.status_code}: {resp.text[:200]}")
        return False
    except Exception as exc:
        log.error(f"[newsletter] resend exception: {exc}")
        return False


# ─── NewsletterPulseEngine ────────────────────────────────────────────────────

class NewsletterPulseEngine:

    def __init__(self, db):
        self.db = db

    async def generate_pulse(
        self,
        period_start: datetime,
        period_end: datetime,
        segments: Optional[List[str]] = None,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """Genera contenido para 4 segmentos en paralelo."""
        segs = segments or list(VALID_SEGMENTS)

        # Obtener datos de zonas para enriquecer el prompt
        zone_data = await self._get_zone_data()

        # Generar contenido por segmento en paralelo
        tasks = {seg: asyncio.create_task(_generate_segment_content(seg, zone_data)) for seg in segs}
        await asyncio.gather(*tasks.values(), return_exceptions=True)

        total_cost = 0.0
        runs = {}

        for seg in segs:
            content = tasks[seg].result() if not isinstance(tasks[seg].exception(), Exception) else _stub_segment_content(seg)
            total_cost += content.get("cost_usd", 0)

            # ── AI cost tracking (best-effort, fire-and-forget) ────────
            # Only track when the LLM actually ran (layer="llm"); stubs are free.
            if content.get("layer") == "llm":
                try:
                    from ai_budget import track_ai_call
                    import json as _json
                    _content_str = _json.dumps(content, ensure_ascii=False)
                    # Prompt size is roughly constant (~500 chars from _generate_segment_content)
                    _in_tokens = max(1, 500 // 4)
                    _out_tokens = max(1, len(_content_str) // 4)
                    await track_ai_call(
                        db=self.db,
                        dev_org_id="dmx",  # platform-level newsletter (no per-tenant scope)
                        model="claude-haiku-4-5",
                        tokens=_in_tokens + _out_tokens,
                        tokens_in=_in_tokens,
                        tokens_out=_out_tokens,
                        call_type="newsletter_pulse",
                        feature_key="newsletter_pulse",
                    )
                except Exception as _exc:
                    log.warning(f"[track_ai_call] failed silent: {_exc}")

            # Idempotente: un run por (período, segmento)
            period_key = period_start.strftime("%Y-W%W")
            existing = await self.db.newsletter_pulse_runs.find_one(
                {"period_key": period_key, "segment": seg, "status": {"$in": ["generated", "sending", "sent"]}},
            )
            if existing and not dry_run:
                runs[seg] = {"run_id": existing.get("_id"), "status": "already_generated"}
                continue

            # Contar opt-ins del segmento
            opt_in_count = await self.db.newsletter_opt_ins.count_documents(
                {"segment": seg, "status": "active"}
            )

            run_doc = {
                "_id": f"pulse_{uuid.uuid4().hex[:12]}",
                "period_key": period_key,
                "period_start": period_start,
                "period_end": period_end,
                "segment": seg,
                "generated_at": _now(),
                "sent_at": None,
                "recipients_count": opt_in_count,
                "content_template": {k: v for k, v in content.items() if k != "cost_usd"},
                "cost_usd": content.get("cost_usd", 0),
                "status": "preview" if dry_run else "generated",
                "layer": content.get("layer", "stub"),
            }

            if not dry_run:
                await self.db.newsletter_pulse_runs.insert_one(run_doc)
                log.info(f"[newsletter] generated {seg} run={run_doc['_id']} opt_ins={opt_in_count}")

            runs[seg] = {"run_id": run_doc["_id"], "status": run_doc["status"], "content": content}

        return {"ok": True, "segments": runs, "total_cost_usd": total_cost}

    async def _get_zone_data(self) -> Dict[str, Any]:
        """Obtiene top zonas de crecimiento del cubo OLAP."""
        try:
            cursor = self.db.cube_aggregations.find(
                {"tier": "colonia", "period": "30d"},
                {"_id": 0, "tier_id": 1, "tier_name": 1, "ie_score_promedio": 1},
            ).sort("ie_score_promedio", -1).limit(5)
            zones = await cursor.to_list(5)
            return {
                "top_growth": [
                    {"name": z.get("tier_name", z.get("tier_id", "?")), "delta": round(z.get("ie_score_promedio", 0), 1)}
                    for z in zones
                ]
            }
        except Exception:
            return {"top_growth": [{"name": "Polanco", "delta": 3.2}, {"name": "Roma Norte", "delta": 2.8}, {"name": "Condesa", "delta": 2.1}]}

    async def send_pulse(self, run_id: str, app_url: str = "https://desarrollosmx.io") -> Dict[str, Any]:
        """Envía un run generado a todos los opt-ins del segmento via Resend."""
        run = await self.db.newsletter_pulse_runs.find_one({"_id": run_id})
        if not run:
            raise ValueError(f"Run {run_id} no encontrado")
        if run.get("status") == "sent":
            return {"ok": True, "run_id": run_id, "status": "already_sent"}

        segment = run["segment"]
        content = run.get("content_template", {})

        # Obtener opt-ins activos del segmento
        opt_ins = await self.db.newsletter_opt_ins.find(
            {"segment": segment, "status": "active"},
            {"_id": 0, "user_id": 1, "email": 1, "name": 1},
        ).to_list(1000)

        sent = 0
        failed = 0

        await self.db.newsletter_pulse_runs.update_one(
            {"_id": run_id}, {"$set": {"status": "sending"}}
        )

        for opt in opt_ins:
            try:
                user_name = opt.get("name") or opt.get("email", "").split("@")[0]
                user_id = opt.get("user_id")
                unsubscribe_url = f"{app_url}/api/users/{user_id}/newsletter-opt-out/{segment}"

                # Personalización por usuario
                user_doc = {"user_id": user_id, "org_id": opt.get("org_id")}
                personal = await _get_user_personalization(self.db, user_doc, segment)

                html = _build_email_html(user_name, segment, content, personal, unsubscribe_url, app_url)
                subject = f"Pulse Semanal DMX · {SEGMENT_LABELS.get(segment, segment)}"
                ok = await _send_resend(opt["email"], subject, html)
                if ok:
                    sent += 1
                else:
                    failed += 1
            except Exception as exc:
                log.warning(f"[newsletter] send failed for {opt.get('email')}: {exc}")
                failed += 1

        await self.db.newsletter_pulse_runs.update_one(
            {"_id": run_id},
            {"$set": {"status": "sent", "sent_at": _now(), "recipients_count": sent}},
        )

        log.info(f"[newsletter] sent run={run_id} segment={segment} sent={sent} failed={failed}")
        return {"ok": True, "run_id": run_id, "status": "sent", "sent": sent, "failed": failed}


# ─── Cron entries ─────────────────────────────────────────────────────────────

async def run_newsletter_generate(db) -> None:
    """Cron domingo 18:00 MX — genera 4 segmentos."""
    engine = NewsletterPulseEngine(db)
    now = _now()
    period_start = now - timedelta(days=7)
    result = await engine.generate_pulse(period_start, now)
    log.info(f"[newsletter] generate cron done: {result}")


async def run_newsletter_send(db) -> None:
    """Cron lunes 07:00 MX — envía runs con status=generated."""
    engine = NewsletterPulseEngine(db)
    runs = await db.newsletter_pulse_runs.find(
        {"status": "generated"},
        {"_id": 1},
    ).to_list(50)
    for run in runs:
        try:
            await engine.send_pulse(run["_id"])
        except Exception as exc:
            log.error(f"[newsletter] send cron error run={run['_id']}: {exc}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_newsletter_indexes(db) -> None:
    try:
        await db.newsletter_pulse_runs.create_index(
            [("segment", 1), ("generated_at", -1)],
            name="idx_pulse_segment_date", background=True,
        )
        await db.newsletter_pulse_runs.create_index(
            "status", name="idx_pulse_status", background=True,
        )
        await db.newsletter_pulse_runs.create_index(
            [("period_key", 1), ("segment", 1)],
            name="idx_pulse_period_seg", background=True,
        )
        await db.newsletter_opt_ins.create_index(
            [("user_id", 1), ("segment", 1)],
            unique=True, name="idx_optin_user_seg", background=True,
        )
        await db.newsletter_opt_ins.create_index(
            [("segment", 1), ("status", 1)],
            name="idx_optin_seg_status", background=True,
        )
        log.info("[newsletter] indexes OK")
    except Exception as exc:
        log.warning(f"[newsletter] ensure_indexes failed: {exc}")
