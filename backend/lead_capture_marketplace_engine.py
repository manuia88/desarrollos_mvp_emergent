"""W5.x F7 · Marketplace Lead Capture engine.

Convierte visitantes anónimos del marketplace en leads cualificados via:
  1. compute_behavioral_score · scroll/time/views/exit_intent → score 0-100
  2. infer_audience_from_session · busca último parse en reverse_search_cache
  3. assign_advisor · primary_advisor del development → fallback users role=advisor → DMX fallback
  4. generate_personalized_pdf · combina F6 tax (closing + predial + opcional ISR) + F4 narrative
  5. build_whatsapp_link · wa.me formato MX móvil 521...
  6. create_lead · inserta lead_captures + audit_immutable

NOTA: Existe ya `lead_capture_engine.py` (W5.ASR.5 · email/FB webhooks) — feature
distinto. Este módulo se llama `lead_capture_marketplace_engine` para no colisionar.

Almacenamiento PDF: collection `lead_capture_pdfs` con bytes_b64 (no GridFS · ver
patrón dev_batch5 línea 734). Servido via GET en routes/lead_capture_marketplace.

Fail-soft total: si PDF gen falla → lead se crea con pdf_url=None; si advisor
assignment falla → fallback "Equipo DesarrollosMX"; nunca lanza excepción al caller.
"""
from __future__ import annotations

import base64
import logging
import re
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.lead_capture_marketplace")

COLLECTION_LEADS = "lead_captures"
COLLECTION_EVENTS = "lead_capture_events"
COLLECTION_PDFS = "lead_capture_pdfs"
EVENT_TTL_DAYS = 7
PDF_TTL_DAYS = 30  # C3 Privacidad · el PDF personalizado caduca (no vive para siempre)

DMX_FALLBACK_PHONE = "+525512345678"
DMX_FALLBACK_NAME = "Equipo DesarrollosMX"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Behavioral scoring ───────────────────────────────────────────────────────

def compute_behavioral_score(
    scroll_depth_pct: int,
    time_on_page_sec: int,
    properties_viewed_count: int,
    exit_intent_triggered: bool,
) -> Dict[str, Any]:
    """Score 0-100 · should_trigger si ≥60.

    Algoritmo:
      scroll * 0.3 + min(time, 300) * 0.2 + min(viewed, 5) * 8 + (20 if exit else 0)
    """
    try:
        scroll = max(0, min(int(scroll_depth_pct), 100))
        time_s = max(0, min(int(time_on_page_sec), 300))
        viewed = max(0, min(int(properties_viewed_count), 5))
        exit_b = bool(exit_intent_triggered)
        raw = (scroll * 0.3) + (time_s * 0.2) + (viewed * 8) + (20 if exit_b else 0)
        score = int(round(min(100, max(0, raw))))
        return {"score": score, "should_trigger": score >= 60}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] compute_behavioral_score failed: {e}")
        return {"score": 0, "should_trigger": False}


VALID_AUDIENCES = {"family", "investor", "first_home", "luxury", "boutique", "neutral"}


async def infer_audience_from_session(db, visitor_session_id: Optional[str]) -> str:
    """Mira reverse_search_cache + lead_capture_events últimas 24h por audience.

    Fail-soft: cualquier error → "neutral".
    """
    if not visitor_session_id or db is None:
        return "neutral"
    cutoff = _now() - timedelta(hours=24)
    try:
        # 1) reverse_search_cache (parsed.buyer_intent)
        try:
            cur = db.reverse_search_cache.find(
                {"generated_at": {"$gte": cutoff}},
                {"_id": 0, "parsed": 1, "audience": 1, "generated_at": 1},
            ).sort("generated_at", -1).limit(20)
            async for row in cur:
                aud = (row.get("audience") or "").lower().strip()
                if aud in VALID_AUDIENCES and aud != "neutral":
                    return aud
                parsed = row.get("parsed") or {}
                bi = (parsed.get("buyer_intent") or "").lower().strip()
                if bi in VALID_AUDIENCES and bi != "neutral":
                    return bi
        except Exception:
            pass
        # 2) lead_capture_events del mismo visitor (último suggested_audience)
        try:
            ev = await db[COLLECTION_EVENTS].find_one(
                {"visitor_session_id": visitor_session_id,
                 "suggested_audience": {"$ne": "neutral"}},
                {"_id": 0, "suggested_audience": 1},
                sort=[("captured_at", -1)],
            )
            if ev:
                aud = (ev.get("suggested_audience") or "").lower().strip()
                if aud in VALID_AUDIENCES:
                    return aud
        except Exception:
            pass
    except Exception as e:  # noqa: BLE001
        log.debug(f"[lead_capture] infer_audience silent fail: {e}")
    return "neutral"


# ─── Advisor assignment ───────────────────────────────────────────────────────

async def assign_advisor(db, property_id: str) -> Dict[str, Any]:
    """Resuelve advisor para un property_id · fallback DMX.

    Orden:
      1. developments collection · campo primary_advisor_id / advisor_id / owner_id
      2. users collection · role=advisor con whatsapp_phone
      3. DMX fallback
    Retorna {advisor_id, advisor_name, advisor_phone}.
    """
    fallback = {
        "advisor_id": None,
        "advisor_name": DMX_FALLBACK_NAME,
        "advisor_phone": DMX_FALLBACK_PHONE,
    }
    if db is None:
        return fallback

    try:
        # 1) Buscar dev en collection (puede no existir · DEVELOPMENTS es in-memory)
        dev_doc: Optional[Dict[str, Any]] = None
        try:
            dev_doc = await db.developments.find_one(
                {"$or": [{"id": property_id}, {"_id": property_id}, {"slug": property_id}]},
                {"_id": 0},
            )
        except Exception:
            dev_doc = None
        advisor_id: Optional[str] = None
        if dev_doc:
            advisor_id = (
                dev_doc.get("primary_advisor_id")
                or dev_doc.get("advisor_id")
                or dev_doc.get("owner_id")
            )

        # 1b) Si no se encontró en mongo, intenta lookup en DEVELOPMENTS in-memory
        if not advisor_id:
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                dev_mem = DEVELOPMENTS_BY_ID.get(property_id) or {}
                advisor_id = (
                    dev_mem.get("primary_advisor_id")
                    or dev_mem.get("advisor_id")
                    or dev_mem.get("owner_id")
                )
            except Exception:
                pass

        # 2) Si tenemos advisor_id, leer su user doc
        if advisor_id:
            try:
                u = await db.users.find_one(
                    {"$or": [{"user_id": advisor_id}, {"id": advisor_id}, {"_id": advisor_id}]},
                    {"_id": 0, "user_id": 1, "id": 1, "full_name": 1, "name": 1,
                     "whatsapp_phone": 1, "phone": 1},
                )
                if u:
                    return {
                        "advisor_id": u.get("user_id") or u.get("id") or advisor_id,
                        "advisor_name": u.get("full_name") or u.get("name") or DMX_FALLBACK_NAME,
                        "advisor_phone": u.get("whatsapp_phone") or u.get("phone") or DMX_FALLBACK_PHONE,
                    }
            except Exception:
                pass

        # 3) Fallback POLÍTICA (LEAD_REGISTRATION_RULES §2·§5·§8.5): lead sin asesor del dev → POOL DMX (la casa),
        #    NUNCA a un asesor de otro tenant. pick_house_asesor filtra a empleados DMX (role advisor/asesor_admin,
        #    tenant None/dmx_root) y reparte por zona + menos cargado. Si no hay asesor de la casa → DMX_FALLBACK.
        try:
            from house_pool_engine import pick_house_asesor
            house_id = await pick_house_asesor(db, property_id)
            if house_id:
                u = await db.users.find_one(
                    {"$or": [{"user_id": house_id}, {"id": house_id}, {"_id": house_id}]},
                    {"_id": 0, "user_id": 1, "id": 1, "full_name": 1, "name": 1, "whatsapp_phone": 1, "phone": 1},
                )
                if u:
                    return {
                        "advisor_id": u.get("user_id") or u.get("id") or house_id,
                        "advisor_name": u.get("full_name") or u.get("name") or DMX_FALLBACK_NAME,
                        "advisor_phone": u.get("whatsapp_phone") or u.get("phone") or DMX_FALLBACK_PHONE,
                    }
        except Exception:
            pass
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] assign_advisor failed: {e}")
    return fallback


# ─── WhatsApp link builder ────────────────────────────────────────────────────

def _normalize_mx_phone(phone: str) -> str:
    """Devuelve 10 dígitos sin prefijo (formato wa.me MX: 521 + 10 dígitos)."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("521") and len(digits) == 13:
        return digits[3:]
    if digits.startswith("52") and len(digits) == 12:
        return digits[2:]
    if len(digits) == 10:
        return digits
    return digits[-10:] if len(digits) >= 10 else digits


def build_whatsapp_link(advisor_phone: str, lead_name: str, property_title: str, advisor_name: str = "") -> str:
    """Construye wa.me link MX (521 + 10 dígitos) con mensaje pre-formateado."""
    phone_10 = _normalize_mx_phone(advisor_phone)
    greeting = f"Hola {advisor_name}, " if advisor_name else "Hola, "
    text = (
        f"{greeting}soy {lead_name or 'un prospecto'}, me interesa {property_title or 'esta propiedad'}. "
        "Vi mi PDF personalizado y quiero saber más."
    )
    return f"https://wa.me/521{phone_10}?text={urllib.parse.quote(text)}"


# ─── PDF generation ───────────────────────────────────────────────────────────

def _property_lookup(property_id: str) -> Dict[str, Any]:
    """Lookup dev en in-memory DEVELOPMENTS · vacío si no existe."""
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        return DEVELOPMENTS_BY_ID.get(property_id) or {}
    except Exception:
        return {}


async def generate_personalized_pdf(
    db,
    property_id: str,
    property_scope: str,
    audience: str,
    lead_data: Dict[str, Any],
) -> Tuple[Optional[str], Optional[str]]:
    """Genera PDF y lo guarda como base64 en collection lead_capture_pdfs.

    Retorna (file_id, pdf_url) o (None, None) si cualquier paso falla.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.colors import HexColor
        from reportlab.pdfgen import canvas as rl_canvas
        import io as _io
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] reportlab unavailable: {e}")
        return None, None

    dev = _property_lookup(property_id)
    property_title = dev.get("name") or property_id or "Propiedad"
    price_from = float(dev.get("price_from") or 0) or 5_000_000.0  # default razonable

    # F6 tax outputs (fail-soft individual)
    closing_block: Optional[Dict[str, Any]] = None
    predial_block: Optional[Dict[str, Any]] = None
    isr_block: Optional[Dict[str, Any]] = None
    try:
        from tax_projector_engine import (
            calculate_closing_cost_total,
            project_predial_10y,
            calculate_isr_vendedor,
        )
        valor_cat = price_from * 0.45  # heurística catastral típica CDMX
        try:
            closing_block = calculate_closing_cost_total(price_from, valor_cat)
        except Exception as e:
            log.debug(f"[lead_capture] closing block failed: {e}")
        try:
            predial_block = project_predial_10y(valor_cat)
        except Exception as e:
            log.debug(f"[lead_capture] predial block failed: {e}")
        if audience in {"investor", "luxury"}:
            try:
                today = _now()
                fecha_compra = today.replace(year=today.year - 5).strftime("%Y-%m-%d")
                fecha_venta = today.strftime("%Y-%m-%d")
                isr_block = calculate_isr_vendedor(
                    precio_compra=price_from * 0.75,
                    fecha_compra=fecha_compra,
                    precio_venta=price_from,
                    fecha_venta=fecha_venta,
                )
            except Exception as e:
                log.debug(f"[lead_capture] isr block failed: {e}")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] tax_projector unavailable: {e}")

    # F4 narrative
    narrative_long = ""
    try:
        from narrative_layer_engine import generate as nl_generate
        nl_res = await nl_generate(
            db, scope=property_scope or "project", entity_id=property_id,
            audience=audience if audience in VALID_AUDIENCES else "neutral",
            language="es-MX", force_refresh=False,
        )
        narrative_long = (nl_res or {}).get("narrative_long") or ""
    except Exception as e:  # noqa: BLE001
        log.debug(f"[lead_capture] narrative_layer unavailable: {e}")

    # Render PDF
    try:
        buf = _io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)
        W, H = A4
        M = 18 * mm
        BG = HexColor("#06080F")
        CREAM = HexColor("#F0EBE0")
        INDIGO = HexColor("#6366F1")
        GRAY = HexColor("#6B7280")

        def _page_bg():
            c.setFillColor(BG)
            c.rect(0, 0, W, H, fill=1, stroke=0)

        _page_bg()
        # Header
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(INDIGO)
        c.drawString(M, H - 13 * mm, "DESARROLLOSMX  ·  PROPUESTA PERSONALIZADA")
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawRightString(W - M, H - 13 * mm, _now().strftime("%Y-%m-%d %H:%M UTC"))
        c.setStrokeColor(INDIGO)
        c.setLineWidth(0.6)
        c.line(M, H - 15.5 * mm, W - M, H - 15.5 * mm)

        # Title
        c.setFont("Helvetica-Bold", 20)
        c.setFillColor(CREAM)
        c.drawString(M, H - 27 * mm, property_title[:60])
        c.setFont("Helvetica", 10)
        c.setFillColor(GRAY)
        c.drawString(
            M, H - 33 * mm,
            f"{dev.get('colonia', '—')} · {dev.get('alcaldia', '—')} · desde ${price_from:,.0f} MXN",
        )

        y = H - 45 * mm

        # Closing cost section
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(INDIGO)
        c.drawString(M, y, "Tu escenario fiscal CDMX 2026")
        y -= 6 * mm
        c.setFont("Helvetica", 9)
        c.setFillColor(CREAM)
        if closing_block and closing_block.get("ok", True):
            total = closing_block.get("total_mxn") or closing_block.get("total") or 0
            c.drawString(M, y, f"Costo total de cierre estimado: ${total:,.0f} MXN")
            y -= 5 * mm
            breakdown = closing_block.get("breakdown") or closing_block.get("desglose") or {}
            if isinstance(breakdown, dict):
                for k, v in list(breakdown.items())[:8]:
                    if isinstance(v, (int, float)):
                        c.drawString(M + 6 * mm, y, f"· {k}: ${v:,.0f}")
                        y -= 4.5 * mm
        else:
            c.drawString(M, y, "Closing breakdown no disponible (servicio temporal).")
            y -= 5 * mm

        y -= 4 * mm
        # Predial 10y
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(INDIGO)
        c.drawString(M, y, "Predial proyectado 10 años")
        y -= 6 * mm
        c.setFont("Helvetica", 9)
        c.setFillColor(CREAM)
        if predial_block and predial_block.get("ok", True):
            proj = predial_block.get("proyeccion") or predial_block.get("years") or []
            if isinstance(proj, list):
                for row in proj[:10]:
                    if isinstance(row, dict):
                        yr = row.get("year") or row.get("anio") or "—"
                        amt = row.get("predial_anual") or row.get("monto") or 0
                        c.drawString(M + 6 * mm, y, f"· {yr}: ${amt:,.0f} MXN")
                        y -= 4 * mm
                        if y < 60 * mm:
                            break
        else:
            c.drawString(M, y, "Proyección predial no disponible.")
            y -= 5 * mm

        # ISR (audiences inversor/luxury)
        if isr_block and isr_block.get("ok", True):
            y -= 4 * mm
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(INDIGO)
            c.drawString(M, y, "Análisis ISR · escenario reventa 5 años")
            y -= 6 * mm
            c.setFont("Helvetica", 9)
            c.setFillColor(CREAM)
            isr_total = isr_block.get("isr_total") or 0
            ganancia = isr_block.get("ganancia_gravable") or 0
            c.drawString(M, y, f"ISR total estimado: ${isr_total:,.0f} · ganancia gravable: ${ganancia:,.0f}")
            y -= 5 * mm

        # Page break si narrative
        if narrative_long and y < 80 * mm:
            c.showPage()
            _page_bg()
            y = H - 25 * mm

        if narrative_long:
            y -= 4 * mm
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(INDIGO)
            c.drawString(M, y, "Por qué este desarrollo encaja contigo")
            y -= 6 * mm
            c.setFont("Helvetica", 9)
            c.setFillColor(CREAM)
            words = narrative_long.split()
            line_buf: List[str] = []
            for w in words:
                line_buf.append(w)
                if len(" ".join(line_buf)) > 95:
                    if y < 25 * mm:
                        c.showPage()
                        _page_bg()
                        y = H - 25 * mm
                    c.drawString(M, y, " ".join(line_buf[:-1]))
                    y -= 5 * mm
                    line_buf = [w]
            if line_buf:
                c.drawString(M, y, " ".join(line_buf))
                y -= 5 * mm

        # Footer
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY)
        lead_name = (lead_data or {}).get("name") or "Prospecto"
        # C6 · fecha visible en hora CDMX (no UTC) — cerca de medianoche daba el día equivocado.
        from cdmx_time import today_cdmx_str
        c.drawString(
            M, 11 * mm,
            f"Generado para {lead_name} · {today_cdmx_str()} · DesarrollosMX",
        )
        c.save()
        pdf_bytes = buf.getvalue()
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] PDF render failed: {e}")
        return None, None

    # Persist — C3 Privacidad: el file_id (uuid4, 122 bits) ya es la "llave"
    # imposible de adivinar; además ciframos los bytes en reposo (un volcado de DB
    # no expone el PDF personalizado), ponemos caducidad (no vive para siempre) y
    # NO guardamos el nombre del lead en claro (ya vive en el lead).
    file_id = uuid.uuid4().hex
    if db is not None:
        try:
            from pii_crypto import try_encrypt_bytes
            enc_bytes, encrypted = try_encrypt_bytes(pdf_bytes)
            expires_at = _now() + timedelta(days=PDF_TTL_DAYS)
            await db[COLLECTION_PDFS].insert_one({
                "file_id": file_id,
                "property_id": property_id,
                "lead_id": (lead_data or {}).get("lead_id"),
                "bytes_b64": base64.b64encode(enc_bytes).decode("ascii"),
                "bytes_encrypted": encrypted,
                "content_type": "application/pdf",
                "size_bytes": len(pdf_bytes),
                "created_at": _now(),
                "expires_at": expires_at,
            })
        except Exception as e:  # noqa: BLE001
            log.warning(f"[lead_capture] PDF persist failed: {e}")
            return None, None

    return file_id, f"/api/lead-capture/pdf/{file_id}"


# ─── Lead creation ────────────────────────────────────────────────────────────

_WHATSAPP_RE = re.compile(r"^(\+52)?\d{10}$")


def _normalize_whatsapp_e164(raw: str) -> Optional[str]:
    """Valida y normaliza a +52XXXXXXXXXX. Retorna None si inválido."""
    cleaned = re.sub(r"[\s\-\(\)]", "", str(raw or ""))
    if not _WHATSAPP_RE.match(cleaned):
        return None
    if cleaned.startswith("+52"):
        return cleaned
    return f"+52{cleaned}"


def _consent_record(consents, request):
    """Bloque de consentimiento LFPDPPP (fail-soft: nunca rompe la captura)."""
    try:
        from compliance_consent import build_consent_record
        return build_consent_record(
            consents=consents if isinstance(consents, dict) else None,
            request=request,
            purpose="marketplace_lead_capture",
            channel="marketplace_web",
        )
    except Exception:
        return {"privacy_notice_shown": True, "privacy_consent_type": "implied_on_submit"}


async def create_lead(db, payload: Dict[str, Any], request=None) -> Dict[str, Any]:
    """Crea lead, asigna advisor, genera PDF, audit. Fail-soft sobre PDF."""
    name = (payload.get("name") or "").strip()
    whatsapp_raw = payload.get("whatsapp") or ""
    whatsapp = _normalize_whatsapp_e164(whatsapp_raw)
    if not whatsapp:
        return {"success": False, "error": "whatsapp_invalid"}
    if not name or len(name) < 2 or len(name) > 80:
        return {"success": False, "error": "name_invalid"}

    property_id = (payload.get("property_id") or "").strip()
    property_scope = (payload.get("property_scope") or "project").strip()
    audience = (payload.get("audience") or "neutral").lower().strip()
    if audience not in VALID_AUDIENCES:
        audience = "neutral"

    lead_id = uuid.uuid4().hex

    advisor_info = await assign_advisor(db, property_id)
    dev = _property_lookup(property_id)
    property_title = dev.get("name") or property_id or "Propiedad DesarrollosMX"

    pdf_file_id: Optional[str] = None
    pdf_url: Optional[str] = None
    try:
        pdf_file_id, pdf_url = await generate_personalized_pdf(
            db, property_id, property_scope, audience,
            {"name": name, "lead_id": lead_id},
        )
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] PDF gen exception: {e}")

    whatsapp_link = build_whatsapp_link(
        advisor_info.get("advisor_phone") or DMX_FALLBACK_PHONE,
        name, property_title,
        advisor_name=advisor_info.get("advisor_name") or "",
    )

    lead_doc = {
        "lead_id": lead_id,
        "name": name,
        "whatsapp": whatsapp,
        "property_id": property_id,
        "property_scope": property_scope,
        "audience": audience,
        "advisor_id": advisor_info.get("advisor_id"),
        "advisor_name": advisor_info.get("advisor_name"),
        "advisor_phone": advisor_info.get("advisor_phone"),
        "assigned_to": advisor_info.get("advisor_id"),  # compat con W4.6 lead routing
        "whatsapp_link": whatsapp_link,
        "pdf_file_id": pdf_file_id,
        "pdf_url": pdf_url,
        "source_page": (payload.get("source_page") or "")[:200],
        "behavioral_score": int(payload.get("behavioral_score") or 0),
        "visitor_session_id": payload.get("visitor_session_id"),
        "utm": payload.get("utm") if isinstance(payload.get("utm"), dict) else None,
        # B2 upgrade · plan de pago elegido en el cotizador → el asesor sabe qué ofrecer (cierra el ciclo)
        "interes": payload.get("interes") if isinstance(payload.get("interes"), dict) else None,
        # C3 Privacidad · registro de consentimiento (LFPDPPP) junto al lead
        "consent": _consent_record(payload.get("consents"), request),
        "created_at": _now(),
        "status": "new",
    }

    if db is not None:
        try:
            await db[COLLECTION_LEADS].insert_one(lead_doc)
            # RUTA UNIFICADA (fix "dos/tres universos de leads"): antes el lead del cotizador quedaba SOLO en lead_captures
            # → el DEV (cuyo cockpit lee db.leads por development_id) nunca lo veía. Ahora pasa por create_buyer_lead →
            # escribe db.leads con development_id (el dev lo ve) + espeja al asesor con contexto + baja favoritos + dedup por
            # visitor_id. El lead_captures de arriba se conserva como registro propio del cotizador (PDF/WhatsApp/audit).
            try:
                _interes = payload.get("interes") if isinstance(payload.get("interes"), dict) else {}
                _ctx = (" · ".join(f"{k}: {v}" for k, v in _interes.items() if v)[:200] or None) if _interes else None
                from routes.buyer_signals import create_buyer_lead
                await create_buyer_lead(
                    db, payload.get("visitor_session_id") or lead_id,
                    name=name, phone=whatsapp, dev_id=property_id, source="cotizador",
                    unit_number=(payload.get("unit_number") or payload.get("unit_id")),
                    lens=audience, contexto=_ctx,
                )
            except Exception as _bexc:  # noqa: BLE001
                log.debug(f"[lead_capture] unified lead skip: {_bexc}")
        except Exception as e:  # noqa: BLE001
            log.warning(f"[lead_capture] insert lead failed: {e}")

    # Audit (fail-soft)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": lead_id, "role": "public"},
            action="lead_captured",
            entity_type="lead_capture",
            entity_id=lead_id,
            before=None,
            after={
                "property_id": property_id,
                "audience": audience,
                "advisor_id": advisor_info.get("advisor_id"),
                "behavioral_score": lead_doc["behavioral_score"],
            },
            request=request,
        )
    except Exception:
        pass

    return {
        "success": True,
        "lead_id": lead_id,
        "advisor_name": advisor_info.get("advisor_name"),
        "advisor_phone": advisor_info.get("advisor_phone"),
        "whatsapp_link": whatsapp_link,
        "pdf_url": pdf_url,
    }


# ─── Event tracking ───────────────────────────────────────────────────────────

async def record_score_event(
    db,
    visitor_session_id: str,
    scroll_depth_pct: int,
    time_on_page_sec: int,
    properties_viewed_count: int,
    exit_intent_triggered: bool,
    score: int,
    should_trigger: bool,
    suggested_audience: str,
) -> None:
    if db is None:
        return
    try:
        now = _now()
        await db[COLLECTION_EVENTS].insert_one({
            "visitor_session_id": visitor_session_id,
            "scroll_depth_pct": int(scroll_depth_pct),
            "time_on_page_sec": int(time_on_page_sec),
            "properties_viewed_count": int(properties_viewed_count),
            "exit_intent_triggered": bool(exit_intent_triggered),
            "score": int(score),
            "should_trigger": bool(should_trigger),
            "suggested_audience": suggested_audience,
            "captured_at": now,
            "ttl_until": now + timedelta(days=EVENT_TTL_DAYS),
        })
    except Exception as e:  # noqa: BLE001
        log.debug(f"[lead_capture] event insert silent fail: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Indexes idempotentes para lead_captures · lead_capture_events · lead_capture_pdfs."""
    if db is None:
        return
    try:
        await db[COLLECTION_LEADS].create_index("lead_id", unique=True, name="lc_lead_id_uniq")
        await db[COLLECTION_LEADS].create_index([("created_at", -1)], name="lc_created_at_desc")
        await db[COLLECTION_LEADS].create_index("advisor_id", name="lc_advisor_id")
        await db[COLLECTION_LEADS].create_index("property_id", name="lc_property_id")
        await db[COLLECTION_EVENTS].create_index("visitor_session_id", name="lce_session")
        await db[COLLECTION_EVENTS].create_index(
            "ttl_until", name="lce_ttl", expireAfterSeconds=0,
        )
        await db[COLLECTION_PDFS].create_index("file_id", unique=True, name="lcp_file_id_uniq")
        await db[COLLECTION_PDFS].create_index([("created_at", -1)], name="lcp_created_at_desc")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_capture] ensure_indexes failed: {e}")
