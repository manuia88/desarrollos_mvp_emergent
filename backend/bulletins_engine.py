"""W3.3 ZZ.3 — DMX Bulletins Engine.

Generates monthly bulletins (general + per-zone) from DRPI snapshots, with
narrative authored by Claude Sonnet (ai_budget gated). Outputs:
  - Markdown narrative (stored)
  - Branded PDF (B5/B19 styling) generated via reportlab
  - Distribution via Resend (subscribers list)

Schema db.dmx_bulletins:
  { id, type:"general|zone", zone_id?, period:"YYYY-MM",
    pdf_url, html_content, narrative_md, kpis_summary,
    generated_at, distributed_at?, distribution_count }
  unique (type, zone_id, period)
"""
from __future__ import annotations

import io
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.bulletins_engine")

UPLOAD_BASE = os.environ.get("IE_UPLOAD_DIR", "/app/backend/uploads/ie_engine")
PDF_DIR = os.path.join(os.path.dirname(UPLOAD_BASE), "bulletins")
os.makedirs(PDF_DIR, exist_ok=True)

TOP_ZONES = [
    {"zone_id": "polanco", "name": "Polanco"},
    {"zone_id": "roma", "name": "Roma"},
    {"zone_id": "lomas", "name": "Lomas de Chapultepec"},
    {"zone_id": "condesa", "name": "Condesa"},
    {"zone_id": "del_valle", "name": "Del Valle"},
    {"zone_id": "coyoacan", "name": "Coyoacán"},
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _new_id(prefix: str = "bul") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


def _slug_for(zone_id: Optional[str]) -> str:
    return (zone_id or "general").lower().replace(" ", "_")


# ─── Narrative authoring (Claude Sonnet) ──────────────────────────────────────

async def _generate_narrative(
    db, *, period: str, kpis: Dict[str, Any], context_label: str,
) -> str:
    """Generate Spanish boletín narrative using Claude Sonnet via emergentintegrations.
    ai_budget gated. Falls back to template if budget exceeded or call fails."""
    from ai_budget import is_within_budget, track_ai_call

    fallback = (
        f"# Boletín DMX {context_label} · {period}\n\n"
        f"Período analizado: **{period}**.\n\n"
        f"Índice DRPI: **{kpis.get('index_value', '—')}** "
        f"(Δ {kpis.get('delta_pct', '—')}%).\n\n"
        f"Muestra utilizada: {kpis.get('sample_size', 0)} transacciones verificadas.\n\n"
        f"R² del modelo hedónico: {kpis.get('r_squared', '—')}.\n\n"
        f"Continuaremos publicando este boletín mensualmente con datos de cierres reales y "
        f"metodología abierta. Visita /methodology para detalles del modelo."
    )

    if not await is_within_budget(db, "dmx_bulletins"):
        return fallback

    api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return fallback

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys_msg = (
            "Eres un editor de mercado inmobiliario en México escribiendo un boletín "
            "mensual riguroso para tomadores de decisión. Voz neutra, basada en datos, "
            "sin emojis, en español es-MX. Cita métricas concretas. 250-400 palabras. "
            "Genera markdown con un H1, 3 secciones cortas (## H2) y un cierre."
        )
        prompt = (
            f"Genera el boletín DMX para {context_label} del período {period}.\n\n"
            f"KPIs disponibles:\n{kpis}\n\n"
            f"Estructura sugerida:\n"
            f"## Lectura del mes\n"
            f"## Detalle por segmento\n"
            f"## Implicaciones\n"
        )
        chat = LlmChat(
            api_key=api_key,
            session_id=f"bulletin_{_slug_for(context_label)}_{period}",
            system_message=sys_msg,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(text=prompt)
        text = await chat.send_message(msg)
        await track_ai_call(
            db, "dmx_bulletins", "claude-sonnet-4-5-20250929",
            tokens=2000, call_type="bulletin_narrative",
            feature_key="bulletin_narrative",
        )
        return text or fallback
    except Exception as e:
        log.warning(f"[bulletins] sonnet failed: {e}")
        return fallback


# ─── PDF render ────────────────────────────────────────────────────────────────

def _build_bulletin_pdf(*, title: str, period: str, kpis: Dict[str, Any],
                       narrative_md: str) -> bytes:
    """Branded PDF (B5/B19 navy + cream) — uses reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    primary = HexColor("#06080F")
    cream = HexColor("#F0EBE0")
    accent = HexColor("#6366F1")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=22, leading=26,
                        textColor=primary, fontName="Helvetica-Bold", spaceAfter=10)
    eyebrow = ParagraphStyle("eb", parent=styles["Normal"], textColor=accent,
                             fontSize=9, fontName="Helvetica-Bold", spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, leading=16,
                        textColor=primary, fontName="Helvetica-Bold", spaceAfter=6)
    body = ParagraphStyle("B", parent=styles["BodyText"], fontSize=10, leading=14,
                          textColor=colors.black, spaceAfter=6)
    small = ParagraphStyle("S", parent=styles["Normal"], fontSize=8,
                           textColor=colors.grey, spaceAfter=4)

    story: List = []
    story.append(Paragraph("BOLETÍN DESARROLLOS MX", eyebrow))
    story.append(Paragraph(title, h1))
    story.append(Paragraph(f"Período: {period}", small))
    story.append(Spacer(1, 0.15 * inch))

    # KPIs strip
    rows = [
        ["Índice DRPI", str(kpis.get("index_value", "—"))],
        ["Δ vs. período anterior (%)", str(kpis.get("delta_pct", "—"))],
        ["Muestra (transacciones)", str(kpis.get("sample_size", "—"))],
        ["R² del modelo", str(round(kpis.get("r_squared", 0) or 0, 3))],
    ]
    t = Table(rows, colWidths=[2.5 * inch, 4.5 * inch])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#dddddd")),
        ("BACKGROUND", (0, 0), (0, -1), cream),
        ("TEXTCOLOR", (0, 0), (0, -1), primary),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2 * inch))

    # Narrative — naive markdown render
    for line in (narrative_md or "").splitlines():
        s = line.strip()
        if not s:
            story.append(Spacer(1, 0.06 * inch)); continue
        if s.startswith("# "):
            story.append(Paragraph(s[2:], h1))
        elif s.startswith("## "):
            story.append(Paragraph(s[3:], h2))
        elif s.startswith("### "):
            story.append(Paragraph(s[4:], h2))
        else:
            story.append(Paragraph(s, body))

    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(
        "Fuente: DesarrollosMX (DRPI) · Metodología abierta en /methodology · "
        "Datos basados en cierres verificados (Transaction Network) y modelo hedónico OLS.",
        small,
    ))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def _save_pdf_bytes(filename: str, data: bytes) -> str:
    path = os.path.join(PDF_DIR, filename)
    with open(path, "wb") as f:
        f.write(data)
    return f"/api/uploads/bulletins/{filename}"


# ─── Public generators ────────────────────────────────────────────────────────

async def generate_bulletin_general(db, period: str = "") -> Dict[str, Any]:
    """Generate the national DRPI bulletin."""
    import drpi_engine as drpi
    period = period or drpi._period_now()

    nat = await drpi.compute_drpi_national(db, period)
    kpis = {
        "index_value": nat.get("national_index"),
        "delta_pct": nat.get("national_delta_pct"),
        "sample_size": nat.get("total_sample_size"),
        "zones_count": nat.get("zones_count"),
        "r_squared": None,
    }
    title = f"DRPI Nacional · {period}"
    narrative = await _generate_narrative(
        db, period=period, kpis=kpis, context_label="Nacional CDMX",
    )
    pdf_bytes = _build_bulletin_pdf(title=title, period=period, kpis=kpis, narrative_md=narrative)
    pdf_url = _save_pdf_bytes(f"general_{period}.pdf", pdf_bytes)

    doc = {
        "id": _new_id("bul"),
        "type": "general",
        "zone_id": None,
        "slug": "general",
        "period": period,
        "pdf_url": pdf_url,
        "narrative_md": narrative,
        "html_content": _md_to_html(narrative),
        "kpis_summary": kpis,
        "generated_at": _iso(),
        "distributed_at": None,
        "distribution_count": 0,
    }
    await db.dmx_bulletins.update_one(
        {"type": "general", "period": period}, {"$set": doc}, upsert=True,
    )
    return doc


async def generate_bulletin_zone(db, zone_id: str, period: str = "") -> Dict[str, Any]:
    """Generate per-zone bulletin (only top 6 V1)."""
    import drpi_engine as drpi
    period = period or drpi._period_now()

    snap = await db.drpi_snapshots.find_one(
        {"zone_id": zone_id, "tier": "colonia", "period": period},
        {"_id": 0},
    )
    if not snap:
        snap = await drpi.compute_drpi_snapshot(db, zone_id, "colonia", period)

    zone_meta = next((z for z in TOP_ZONES if z["zone_id"] == zone_id),
                    {"zone_id": zone_id, "name": zone_id.title()})
    name = zone_meta["name"]

    kpis = {
        "index_value": snap.get("index_value"),
        "delta_pct": snap.get("delta_pct"),
        "sample_size": snap.get("sample_size"),
        "r_squared": snap.get("r_squared"),
    }
    title = f"DRPI · {name} · {period}"
    narrative = await _generate_narrative(
        db, period=period, kpis=kpis, context_label=name,
    )
    pdf_bytes = _build_bulletin_pdf(title=title, period=period, kpis=kpis, narrative_md=narrative)
    pdf_url = _save_pdf_bytes(f"{_slug_for(zone_id)}_{period}.pdf", pdf_bytes)

    doc = {
        "id": _new_id("bul"),
        "type": "zone",
        "zone_id": zone_id,
        "slug": _slug_for(zone_id),
        "period": period,
        "pdf_url": pdf_url,
        "narrative_md": narrative,
        "html_content": _md_to_html(narrative),
        "kpis_summary": kpis,
        "generated_at": _iso(),
        "distributed_at": None,
        "distribution_count": 0,
    }
    await db.dmx_bulletins.update_one(
        {"type": "zone", "zone_id": zone_id, "period": period},
        {"$set": doc}, upsert=True,
    )
    return doc


def _md_to_html(md: str) -> str:
    """Minimal MD → HTML for bulletin web view.
    P2.12 · XSS: el contenido (puede venir de un LLM) se ESCAPA antes de envolverlo en
    tags seguros (h1/h2/h3/li/p). Así cualquier <script>/<img onerror>/<iframe> queda
    inerte aunque la página lo renderice con dangerouslySetInnerHTML."""
    import html as _html
    out: List[str] = []
    for line in (md or "").splitlines():
        s = line.strip()
        if not s:
            out.append(""); continue
        if s.startswith("# "):
            out.append(f"<h1>{_html.escape(s[2:])}</h1>")
        elif s.startswith("## "):
            out.append(f"<h2>{_html.escape(s[3:])}</h2>")
        elif s.startswith("### "):
            out.append(f"<h3>{_html.escape(s[4:])}</h3>")
        elif s.startswith("- "):
            out.append(f"<li>{_html.escape(s[2:])}</li>")
        else:
            # bold **x** → texto plano escapado
            out.append(f"<p>{_html.escape(s.replace('**', ''))}</p>")
    return "\n".join(out)


# ─── Distribution (Resend) ────────────────────────────────────────────────────

async def distribute_bulletin(
    db, bulletin_id: str, segment: str = "subscribers",
) -> Dict[str, Any]:
    """Email bulletin via Resend to subscribers list (placeholder list).
    `segment` ∈ {"public", "subscribers"}.
    """
    bul = await db.dmx_bulletins.find_one({"id": bulletin_id}, {"_id": 0})
    if not bul:
        return {"ok": False, "reason": "not_found"}

    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        return {"ok": False, "reason": "resend_key_missing"}

    # Subscribers list placeholder (W4 will replace)
    subscribers_cursor = db.bulletin_subscribers.find(
        {"active": True, "segment": {"$in": [segment, "all"]}},
        {"_id": 0, "email": 1},
    ).limit(1000)
    subs = [s async for s in subscribers_cursor]
    if not subs:
        return {"ok": False, "reason": "no_subscribers", "distribution_count": 0}

    sent = 0
    failed = 0
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            for s in subs:
                email = s.get("email")
                if not email:
                    continue
                try:
                    body = {
                        "from": "DMX Boletines <no-reply@desarrollosmx.io>",
                        "to": [email],
                        "subject": f"[DMX] Boletín DRPI · {bul.get('period')}",
                        "html": (
                            f"<div style='font-family:DM Sans,Arial,sans-serif;color:#06080F;'>"
                            f"<h2 style='color:#06080F'>Boletín DesarrollosMX · {bul.get('period')}</h2>"
                            f"<p>Tu boletín mensual ya está disponible.</p>"
                            f"<p>Lee el boletín completo en línea: "
                            f"<a href='https://desarrollosmx.io/boletin/{bul.get('slug')}/{bul.get('period')}'>Abrir boletín</a></p>"
                            f"<p style='color:#807e78;font-size:12px'>"
                            f"Metodología abierta: /methodology · DesarrollosMX</p>"
                            f"</div>"
                        ),
                    }
                    r = await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {resend_key}"},
                        json=body,
                    )
                    if r.status_code in (200, 202):
                        sent += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1
    except Exception as e:
        log.warning(f"[bulletins] Resend client init failed: {e}")
        return {"ok": False, "reason": "resend_init_failed"}

    await db.dmx_bulletins.update_one(
        {"id": bulletin_id},
        {"$set": {"distributed_at": _iso(), "distribution_count": sent}},
    )
    return {"ok": True, "distribution_count": sent, "failed": failed}


# ─── Cron runner ──────────────────────────────────────────────────────────────

async def cron_bulletins_monthly_generate(db) -> Dict[str, Any]:
    """Generate 1 general + 6 sectoral bulletins + Resend distribution."""
    import drpi_engine as drpi
    from ai_budget import is_within_budget

    period = drpi._period_now()
    if not await is_within_budget(db, "dmx_bulletins"):
        try:
            await db.system_alerts.insert_one({
                "ts": _now(), "severity": "warning",
                "source": "bulletins_monthly_generate",
                "message": f"Boletines saltados por presupuesto IA agotado · {period}",
                "details": {"reason": "ai_budget_exceeded"},
                "resolved_at": None,
            })
        except Exception:
            pass
        return {"ok": False, "reason": "ai_budget_exceeded", "period": period}

    out: Dict[str, Any] = {"period": period, "generated": [], "distributed": 0}
    try:
        gen = await generate_bulletin_general(db, period)
        out["generated"].append({"type": "general", "id": gen["id"]})
        dist = await distribute_bulletin(db, gen["id"], "subscribers")
        out["distributed"] += dist.get("distribution_count", 0)
    except Exception as e:
        log.warning(f"[bulletins cron] general failed: {e}")

    for z in TOP_ZONES:
        try:
            g = await generate_bulletin_zone(db, z["zone_id"], period)
            out["generated"].append({"type": "zone", "zone_id": z["zone_id"], "id": g["id"]})
            dist = await distribute_bulletin(db, g["id"], "subscribers")
            out["distributed"] += dist.get("distribution_count", 0)
        except Exception as e:
            log.warning(f"[bulletins cron] zone {z['zone_id']} failed: {e}")

    out["completed_at"] = _iso()
    return out


def schedule_bulletins_monthly_cron(scheduler, db) -> None:
    """Register cron `bulletins_monthly_generate` 1ro mes 07:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_bulletins_monthly_generate, "bulletins_monthly_generate"),
            CronTrigger(day=1, hour=7, minute=0, timezone="America/Mexico_City"),
            args=[db], id="bulletins_monthly_generate",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[bulletins] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.dmx_bulletins.create_index(
            [("type", 1), ("zone_id", 1), ("period", -1)],
            unique=True, name="bulletins_type_zone_period_unique",
            partialFilterExpression={"period": {"$exists": True}},
        )
        await db.dmx_bulletins.create_index([("slug", 1), ("period", -1)], name="bulletins_slug_period")
        await db.bulletin_subscribers.create_index([("email", 1)], unique=True, name="subs_email_unique")
        await db.bulletin_subscribers.create_index([("active", 1), ("segment", 1)], name="subs_active_segment")
    except Exception as e:
        log.warning(f"[bulletins] ensure_indexes failed: {e}")
