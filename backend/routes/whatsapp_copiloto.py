"""
Copiloto sobre WhatsApp — Etapa 6 (2026-06-18).

WhatsApp es un CANAL de entrada + alertas, NO un reemplazo de la plataforma (la plataforma es el cerebro). El
comprador escribe → Atlax (el asistente que ya existe) conversa, perfila y recomienda; para lo profundo (swipe,
ficha, mapa) lo manda a la plataforma con un LINK → el `visitor_id`/lead capturan la conducta igual. Cero data
perdida. Reusa: AsistenteEngine (Atlax) + WAEngine (Twilio/Meta, ya construido) + el espinazo (buyer_signals).

Si el LLM no está disponible (local/sin key), cae a un mensaje estructurado que lleva a la plataforma — honesto
y funcional sin LLM; el LLM lo enriquece en deploy.
"""
import logging
import os

log = logging.getLogger("dmx.routes_whatsapp_copiloto")

DMX_ORG = os.environ.get("DMX_ORG_ID", "dmx_root")
PLATFORM = os.environ.get("FRONTEND_URL", "https://desarrollosmx.io")


async def _session_for_phone(db, engine, phone):
    """Una sesión de Atlax por número (el teléfono = la identidad en WhatsApp, como el visitor_id en web)."""
    row = await db.wa_buyer_sessions.find_one({"phone": phone}, {"_id": 0, "session_token": 1})
    if row and row.get("session_token"):
        return row["session_token"]
    try:
        s = await engine.start_session(ip_raw=f"wa:{phone}", user_agent="whatsapp", referral_source="whatsapp")
        token = s.get("session_token") or s.get("token")
        if token:
            await db.wa_buyer_sessions.update_one({"phone": phone}, {"$set": {"phone": phone, "session_token": token}}, upsert=True)
        return token
    except Exception as e:  # noqa: BLE001
        log.warning(f"[wa_copiloto] start_session: {e}")
        return None


async def handle_buyer_wa(db, from_number: str, text: str):
    """Inbound de un comprador → Atlax → respuesta. Captura la conducta en el espinazo. Fail-open con fallback."""
    from whatsapp_engine import WAEngine
    wa = WAEngine(db, DMX_ORG)
    # CANDADO: no secuestrar conversaciones del asesor. Si el número ya es contacto de algún asesor, el asesor
    # responde (su hilo); el Copiloto solo atiende números NUEVOS/públicos.
    try:
        last10 = "".join(c for c in (from_number or "") if c.isdigit())[-10:]
        if last10:
            existing = await db.asesor_contactos.find_one({"phones_norm": {"$regex": last10}}, {"_id": 1})
            if existing:
                return None
    except Exception:
        pass
    # Espinazo: la interacción de WhatsApp cuenta como señal del comprador (capa B/C · el teléfono es el visitor).
    try:
        await db.buyer_signals.insert_one({
            "visitor_id": f"wa:{from_number}", "type": "view", "value": (text or "")[:120],
            "ip_hash": None, "created_at_dt": __import__("datetime").datetime.utcnow(), "channel": "whatsapp",
        })
    except Exception:
        pass
    # Atlax (el cerebro). Si el LLM no está, fallback estructurado que lleva a la plataforma.
    answer = None
    try:
        from asistente_engine import AsistenteEngine
        engine = AsistenteEngine(db)
        token = await _session_for_phone(db, engine, from_number)
        if token:
            r = await engine.chat(token, text, org_id=DMX_ORG)
            answer = (r or {}).get("assistant_message") or (r or {}).get("answer")
    except Exception as e:  # noqa: BLE001
        log.info(f"[wa_copiloto] Atlax no disponible (fallback): {e}")
    if not answer:
        answer = (f"¡Hola! 👋 Soy Atlax de DesarrollosMX. Te ayudo a encontrar tu lugar ideal — con tu presupuesto, "
                  f"crédito, zona y plazo.\n\nEmpieza tu búsqueda aquí 👉 {PLATFORM}/marketplace\n"
                  f"Y te aviso por aquí cuando entre algo que encaje. 🔔")
    try:
        await wa.send_message(to_number=from_number, body=answer)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[wa_copiloto] send fail: {e}")
    return answer


async def notify_buyer_wa(db, phone: str, text: str):
    """Alerta saliente al comprador por WhatsApp (la usa la casamentera E4). Fail-open."""
    if not phone:
        return False
    try:
        from whatsapp_engine import WAEngine
        await WAEngine(db, DMX_ORG).send_message(to_number=phone, body=text)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning(f"[wa_copiloto] notify fail: {e}")
        return False
