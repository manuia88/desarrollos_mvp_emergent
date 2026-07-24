"""BOT DE TELEGRAM — el copiloto de decisiones del founder en el celular.

No manda botones pelones: manda TARJETAS DE DECISIÓN con contexto real (qué pasó, historial
del archivo, estado del proyecto, mapeo del dev), las opciones disponibles y la consecuencia
de cada una. Flujos de varios pasos con botones (carpeta nueva → ¿de quién es? → ¿ingiero?).
TODO templado desde datos reales — $0, sin IA. (Cuando haya crédito API, la misma tarjeta
gana un botón de recomendación de la IA.)

Seguridad: el bot solo obedece al chat VINCULADO. Vincular = mandarle /vincular <código>
(el código vive en la pestaña Vigía del superadmin). Sin token en .env, todo no-opea.

Comandos: /pendientes · /ronda · /estado · /vincular <código>
Callbacks: ap:<id> aprobar · rj:<id> ignorar · det:<id> detalle · mapmenu:<id> · map:<id>:<org>
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.telegram")

_API = "https://api.telegram.org/bot{token}/{method}"


def _token() -> str:
    return (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _tg(method: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Llamada cruda al API de Telegram (gratis). Fail-soft: None si no hay token o falla."""
    tok = _token()
    if not tok:
        return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=60) as cli:
            r = await cli.post(_API.format(token=tok, method=method), json=payload)
            data = r.json()
            if not data.get("ok"):
                log.warning(f"[telegram] {method} → {str(data)[:200]}")
                return None
            return data.get("result")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[telegram] {method} falló: {str(e)[:120]}")
        return None


# ─── vínculo (solo el founder manda) ─────────────────────────────────────────
async def get_config(db) -> Dict[str, Any]:
    cfg = await db.telegram_config.find_one({"_id": "cfg"}) or {}
    if not cfg.get("bind_code"):
        cfg = {"_id": "cfg", "bind_code": secrets.token_hex(3).upper(), "chat_id": None}
        await db.telegram_config.update_one({"_id": "cfg"}, {"$set": cfg}, upsert=True)
    return cfg


async def _chat_vinculado(db) -> Optional[int]:
    return (await get_config(db)).get("chat_id")


# ─── TARJETAS DE DECISIÓN (puras y testeables: datos → texto+botones) ─────────
def _esc(s: Any) -> str:
    return str(s or "").replace("<", "‹").replace(">", "›")


def _lista_limpia(nombre: Any) -> str:
    """Nombre de archivo → etiqueta legible de la lista (sin ruido). Conserva lo que distingue
    (ej. la torre 'Panorama L C'), quita 'VP_Lista_de_Precios', '_SF', '_LP', la extensión y los _."""
    n = re.sub(r"\.(pdf|xlsx?|xlsm|csv)$", "", str(nombre or ""), flags=re.I)
    n = n.replace("_", " ")
    n = re.sub(r"(?i)\bvp\b|lista\s*de\s*precios|\blp\b|\bsf\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def tarjeta_pendiente(p: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Arma la tarjeta con CONTEXTO: qué pasó · datos para decidir · consecuencia de cada botón.
    ctx = {mapeado_a, n_proyectos_dev, n_unidades_dev, eventos_previos, ultima_ingesta}."""
    tipo = p.get("tipo")
    dev = _esc(p.get("dev"))
    lineas: List[str] = []
    botones: List[List[Dict[str, str]]] = []
    pid = p["id"]

    if tipo == "dev_nuevo":
        det = p.get("detalle") or {}
        proyectos = det.get("proyectos") or []
        lineas = [
            f"🏢 <b>Desarrollador nuevo detectado: {dev}</b>",
            f"Su carpeta trae <b>{len(proyectos)} proyectos</b> y {det.get('n_archivos', '?')} archivos.",
            "Muestra: " + ", ".join(_esc(x) for x in proyectos[:4]) + ("…" if len(proyectos) > 4 else ""),
            "",
        ]
        if ctx.get("mapeado_a"):
            lineas += [f"✅ Ya está mapeado a <b>{_esc(ctx['mapeado_a'])}</b>.",
                       "▸ <b>Aprobar</b>: ingiere TODA su carpeta con IA (gasta API).",
                       "▸ <b>Ignorar</b>: lo archivo y no entra nada."]
            botones = [[{"text": "✅ Aprobar e ingerir", "callback_data": f"ap:{pid}"},
                        {"text": "❌ Ignorar", "callback_data": f"rj:{pid}"}]]
        else:
            lineas += ["⚠️ <b>Aún no me dices de quién es esta carpeta.</b>",
                       "Primero el mapeo (sin dueño, nada se ingiere):"]
            botones = [[{"text": "👤 ¿De quién es? (elegir dev)", "callback_data": f"mapmenu:{pid}"}],
                       [{"text": "❌ Ignorar", "callback_data": f"rj:{pid}"}]]
    elif tipo in ("lista_cambiada", "lista_nueva"):
        # TARJETA "SIMPLE CON CONTEXTO" (founder 07-24): proyecto + de quién viene + el cambio en
        # español + máx. la pregunta con botones. SIN nombre de archivo, .pdf, fechas, "Historial",
        # "en su Drive", "comparado contra", ni jerga forense — todo eso confundía al founder.
        from lista_peek import es_cambio_real
        a = p.get("archivo") or {}
        c = p.get("cambios") or {}
        real = tipo == "lista_nueva" or es_cambio_real(c)
        primera = "primera lectura" in str(c.get("nota") or "")
        proy = _esc(p.get("proyecto") or p.get("dev"))
        origen = ctx.get("mapeado_a") or (p.get("dev") if p.get("dev") and p.get("dev") != p.get("proyecto") else None)
        lista = _lista_limpia(a.get("nombre"))
        # la etiqueta de lista solo si AGREGA info que el nombre del proyecto no da (ej. torre "Panorama L C")
        etq = f" «{_esc(lista)}»" if lista and lista.lower() not in str(p.get("proyecto") or "").lower() else ""
        lineas = [f"🏢 <b>{proy}</b>"]
        if origen:
            lineas.append(f"<i>vía {_esc(origen)}</i>")
        # QUÉ SUBIÓ EL DESARROLLADOR (la acción, en claro — sin nombre de archivo crudo ni fechas)
        if tipo == "lista_nueva" or primera:
            lineas += ["", f"📄 Subió una lista de precios nueva{etq} — apenas la empiezo a vigilar."]
        elif not real:
            lineas += ["", f"📄 Volvió a subir su lista{etq}, pero con los <b>mismos datos</b> — nada cambió."]
        else:
            lineas += ["", f"📄 Actualizó su lista de precios{etq}."]
        # QUÉ CAMBIÓ (en viñetas, claro)
        frases = _cambios_humanos(c)
        if frases:
            lineas.append("<b>Esto cambió:</b>")
            lineas += [f"· {f}" for f in frases[:8]]
        # QUÉ HACER
        if p.get("aplicado"):
            lineas += ["", "✅ <b>Ya lo actualicé solo.</b> No tienes que hacer nada."]
            botones = [[{"text": "🔍 Ver detalle", "callback_data": f"det:{pid}"},
                        {"text": "👍 Ok", "callback_data": f"rj:{pid}"}]]
        elif real and not ctx.get("mapeado_a"):
            lineas += ["", "Este dev todavía no está ligado a un desarrollo tuyo — dime de quién es:"]
            botones = [[{"text": "👤 Ligar a un dev", "callback_data": f"mapmenu:{pid}"}],
                       [{"text": "🔕 Después", "callback_data": f"rj:{pid}"}]]
        elif real:
            lineas += ["", "¿Reviso a fondo con IA? (cuesta)"]
            botones = [[{"text": "✅ Sí, revísalo", "callback_data": f"ap:{pid}"},
                        {"text": "🔍 Ver detalle", "callback_data": f"det:{pid}"}],
                       [{"text": "🔕 No hace falta", "callback_data": f"rj:{pid}"}]]
        else:
            botones = [[{"text": "👍 Ok", "callback_data": f"rj:{pid}"}]]
    elif tipo == "proyecto_nuevo":
        lineas = [f"📁 <b>{dev}</b> subió carpeta de proyecto nueva: <b>{_esc(p.get('proyecto'))}</b>."]
        if p.get("ya_en_catalogo"):
            ya_c = p["ya_en_catalogo"]
            lineas += [f"⚠️ <b>OJO: no parece nuevo.</b> Coincide con el proyecto EXISTENTE "
                       f"<b>{_esc(ya_c.get('name'))}</b> ({ya_c.get('unidades')} unidades ya en "
                       f"el catálogo). Puede ser carpeta renombrada o duplicada.",
                       "▸ <b>Aprobar</b>: RE-LEO ese proyecto con IA (gasta API) — útil si el dev lo actualizó.",
                       "▸ <b>Ignorar</b>: no hago nada (lo sigo vigilando)."]
        else:
            lineas += ["▸ <b>Aprobar</b>: la ingiero con IA (gasta API) y entra al catálogo de ese dev.",
                       "▸ <b>Ignorar</b>: queda fuera (la sigo vigilando)."]
        botones = [[{"text": "✅ Aprobar e ingerir", "callback_data": f"ap:{pid}"},
                    {"text": "❌ Ignorar", "callback_data": f"rj:{pid}"}]]
    elif tipo == "proyecto_renombrado":
        viejo = _esc((p.get("antes") or {}).get("proyecto"))
        lineas = [f"📁 <b>{dev}</b> renombró la carpeta «{viejo}» → <b>{_esc(p.get('proyecto'))}</b>.",
                  "Es el MISMO proyecto de siempre (sus archivos son los mismos) — solo te aviso.",
                  "▸ <b>Enterado</b>: lo archivo."]
        botones = [[{"text": "👍 Enterado", "callback_data": f"rj:{pid}"}]]
    elif tipo == "acceso_roto":
        lineas = [f"⚠️ <b>Perdí acceso a la carpeta de {dev}.</b>",
                  "Causas típicas: te quitaron el permiso o borraron/movieron la carpeta.",
                  "▸ <b>Enterado</b>: lo archivo. Si vuelve el acceso, la ronda lo re-detecta sola."]
        botones = [[{"text": "👍 Enterado", "callback_data": f"ap:{pid}"}]]
    else:
        lineas = [f"🔔 {_esc(tipo)} · {dev}"]
        botones = [[{"text": "👍 OK", "callback_data": f"rj:{pid}"}]]

    return {"texto": "\n".join(lineas), "botones": botones}


async def _contexto_de(db, p: Dict[str, Any]) -> Dict[str, Any]:
    """Junta el contexto REAL para decidir (código puro, $0)."""
    ctx: Dict[str, Any] = {}
    try:
        m = await db.vigia_manifiesto.find_one(
            {"fuente_id": p.get("fuente_id"), "dev_carpeta": p.get("dev")}, {"_id": 0})
        if m:
            nombre = await db.dev_orgs.find_one({"tenant_id": m["dev_org_id"]}, {"_id": 0, "name": 1})
            ctx["mapeado_a"] = (nombre or {}).get("name") or m["dev_org_id"]
            ctx["dev_org_id"] = m["dev_org_id"]
        arch = (p.get("archivo") or {}).get("id")
        if arch:
            ctx["eventos_previos"] = await db.vigia_eventos.count_documents({"archivo.id": arch})
        if ctx.get("dev_org_id"):
            ult = await db.bulk_ingest_jobs.find_one(
                {"target_dev_org_id": ctx["dev_org_id"]}, {"_id": 0, "started_at": 1},
                sort=[("started_at", -1)])
            if ult:
                ctx["ultima_ingesta"] = ult.get("started_at")
        if p.get("proyecto") and p["proyecto"] != "(raíz)":
            d = await db.developments.find_one(
                {"name": {"$regex": f"^{p['proyecto'][:40]}", "$options": "i"}}, {"_id": 0, "id": 1})
            if d:
                ctx["n_unidades_proyecto"] = await db.units.count_documents({"development_id": d["id"]})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[telegram] contexto: {e}")
    return ctx


# ─── envío de tarjetas ────────────────────────────────────────────────────────
def _resumen_reupload(noop: List[Dict[str, Any]]) -> str:
    """Colapsa N re-subidas SIN cambios en UNA línea callada, agrupada por desarrollador (UX 07-22):
    el dev volvió a subir el mismo archivo con los mismos datos → no amerita una tarjeta cada una."""
    por_dev: Dict[str, List[str]] = {}
    for p in noop:
        por_dev.setdefault(_esc(p.get("dev") or "?"), []).append(_esc(p.get("proyecto") or ""))
    lineas = [f"😴 <b>{len(noop)} lista(s) re-subida(s) SIN cambios</b> — el desarrollador volvió a subir el mismo "
              f"archivo (mismos datos). Nada que aprobar:"]
    for d, proys in por_dev.items():
        vistos = [x for x in dict.fromkeys(proys) if x]
        lineas.append(f"· <b>{d}</b>" + (f": {', '.join(vistos)}" if vistos else ""))
    lineas.append("<i>Ya vigilados · el linaje quedó registrado (/detalle si quieres verlo).</i>")
    return "\n".join(lineas)


_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def _hoy_corto() -> str:
    try:
        from zoneinfo import ZoneInfo
        d = datetime.now(ZoneInfo("America/Mexico_City"))
    except Exception:  # noqa: BLE001
        d = datetime.now(timezone.utc)
    return f"{d.day} {_MESES[d.month - 1]}"


def _es_primera(p: Dict[str, Any]) -> bool:
    return "primera lectura" in str((p.get("cambios") or {}).get("nota") or "")


def _tiene_nuevas(p: Dict[str, Any]) -> bool:
    return bool((p.get("cambios") or {}).get("nuevas"))


def _cambios_humanos(c: Dict[str, Any]) -> List[str]:
    """Diff → frases cortas de español de a pie (sin jerga, sin flechas técnicas)."""
    out: List[str] = []
    for x in c.get("cambios_precio") or []:
        try:
            pct = (x["ahora"] - x["antes"]) / x["antes"] * 100
            verbo = "bajó" if pct < 0 else "subió"
            out.append(f"{_esc(x['unidad'])} {verbo} a ${float(x['ahora']):,.0f} ({pct:+.1f}%)")
        except (TypeError, ValueError, ZeroDivisionError, KeyError):
            out.append(f"{_esc(x.get('unidad'))} cambió de precio")
    for x in c.get("cambios_status") or []:
        ah = str(x.get("ahora") or "").lower()
        # OJO: 'dispon' es substring de 'no_disponible' → los casos negativos van PRIMERO.
        if "vend" in ah or "sold" in ah:
            out.append(f"{_esc(x['unidad'])} se vendió")
        elif "no dispon" in ah or "no_dispon" in ah or "apart" in ah or "reserv" in ah or "bloq" in ah:
            out.append(f"{_esc(x['unidad'])} se apartó")
        elif "dispon" in ah or "libre" in ah or "avail" in ah:
            out.append(f"{_esc(x['unidad'])} volvió a estar disponible")
        else:
            out.append(f"{_esc(x['unidad'])} cambió de estatus")
    ynz = c.get("ya_no_estan") or []
    if ynz:
        us = ", ".join(_esc(x) for x in ynz[:6])
        out.append(f"ya no aparece(n) {us} (probable venta)")
    nv = c.get("nuevas") or []
    if nv:
        us = ", ".join(_esc(x) for x in nv[:6])
        out.append(f"deptos nuevos en la lista: {us}")
    return out


def _resumen_auto(auto: List[Dict[str, Any]]) -> str:
    """Colapsa lo que el vigía YA aplicó solo (gratis) en un digest humano por proyecto — sin botones,
    porque no hay nada que decidir. Es la respuesta a '¿se actualizó?': sí, esto ya quedó."""
    lineas = ["✅ <b>Ya lo actualicé solo</b> (gratis, con respaldo — no tienes que hacer nada):"]
    tot_p = tot_s = tot_v = 0
    for p in auto:
        c = p.get("cambios") or {}
        frases = _cambios_humanos(c)
        etq = _esc(p.get("proyecto") or p.get("dev"))
        ap = p.get("aplicado") or {}
        tot_p += ap.get("precios") or 0
        tot_s += ap.get("status") or 0
        tot_v += ap.get("senales_venta") or 0
        if frases:
            lineas.append(f"· <b>{etq}</b>: " + " · ".join(frases[:5]))
        else:
            n = (ap.get("precios") or 0) + (ap.get("status") or 0)
            lineas.append(f"· <b>{etq}</b>: {n} cambio(s) aplicado(s)")
    resumen = []
    if tot_s:
        resumen.append(f"{tot_s} de estatus")
    if tot_p:
        resumen.append(f"{tot_p} de precio")
    total = tot_s + tot_p
    if total:
        lineas.append(f"→ <b>{total} cambio(s)</b> ({', '.join(resumen)}) quedaron en el catálogo"
                      + (f" · {tot_v} probable(s) venta(s) anotada(s)" if tot_v else "") + ".")
    return "\n".join(lineas)


def _resumen_primeras(primeras: List[Dict[str, Any]]) -> str:
    """Las 'primeras lecturas' NO son cambios — el vigía apenas empezó a vigilar ese archivo.
    No merecen tarjeta de alarma; van en una línea calmada (con aviso si el PDF salió flaco)."""
    nombres = list(dict.fromkeys(_esc(p.get("proyecto") or p.get("dev")) for p in primeras))
    lineas = [f"👀 <b>Empecé a vigilar {len(primeras)} lista(s) nueva(s)</b> — aún sin nada que reportar:",
              "· " + ", ".join(nombres)]
    pocas = [p for p in primeras if ((p.get("cambios") or {}).get("n_leidas") or 99) <= 2]
    if pocas:
        lineas.append(f"⚠️ {len(pocas)} de esas traían muy poquitos depas leídos — puede que el PDF no se "
                      f"dejó leer bien. Dime si las reviso a fondo (eso sí usa IA).")
    return "\n".join(lineas)


async def notificar_pendientes(db, limite: int = 5) -> int:
    """Manda el parte del vigía SIN ruido (UX 07-23). Tres cubetas calladas se colapsan en UN solo
    digest (sin botones, nada que decidir): (a) lo que YA apliqué solo, (b) listas que apenas empecé a
    vigilar, (c) re-subidas idénticas. Solo lo que DE VERDAD necesita tu OK (unidades nuevas por ingerir,
    dev/carpeta por mapear, acceso roto) llega como tarjeta con botones."""
    from lista_peek import es_cambio_real
    chat = await _chat_vinculado(db)
    if not chat:
        return 0
    pend = [p async for p in db.vigia_pendientes.find(
        {"estado": "pendiente", "telegram_sent": {"$ne": True}}, {"_id": 0}).limit(60)]
    auto, decision, primeras, noop = [], [], [], []
    for p in pend:
        if p.get("tipo") in ("lista_cambiada", "lista_nueva"):
            c = p.get("cambios") or {}
            if p.get("aplicado") and not _tiene_nuevas(p):
                auto.append(p)                      # el vigía ya lo aplicó → digest, sin botones
            elif _es_primera(p) and not p.get("aplicado"):
                primeras.append(p)                  # apenas empezó a vigilar → digest
            elif es_cambio_real(c):
                decision.append(p)                  # cambio real que SÍ necesita tu OK (ej. unidades nuevas)
            else:
                noop.append(p)                      # re-subida idéntica → digest de una línea
        else:
            decision.append(p)                      # dev_nuevo, proyecto_nuevo, acceso_roto…
    enviados = 0

    # 1) DIGEST callado (auto + primeras + noop) — UN solo mensaje, sin botones
    quiet = bool(auto or primeras or noop)
    if quiet:
        bloques = [f"🤖 <b>Vigía · {_hoy_corto()}</b>"]
        if auto:
            bloques.append(_resumen_auto(auto))
        if primeras:
            bloques.append(_resumen_primeras(primeras))
        if noop:
            bloques.append(_resumen_reupload(noop))
        bloques.append("👉 <i>Lo que SÍ necesita tu decisión te lo mando abajo.</i>" if decision
                       else "<i>Nada requiere tu decisión hoy. /detalle para ver el linaje.</i>")
        r = await _tg("sendMessage", {"chat_id": chat, "text": "\n\n".join(bloques), "parse_mode": "HTML"})
        if r:
            enviados += 1
            for p in auto:
                await db.vigia_pendientes.update_one(
                    {"id": p["id"]}, {"$set": {"telegram_sent": True, "estado": "aplicado"}})
            for p in primeras:
                await db.vigia_pendientes.update_one(
                    {"id": p["id"]}, {"$set": {"telegram_sent": True, "estado": "vigilando"}})
            for p in noop:
                await db.vigia_pendientes.update_one(
                    {"id": p["id"]}, {"$set": {"telegram_sent": True, "estado": "sin_cambios"}})

    # 2) DECISIONES → tarjeta individual con botones (cap `limite`; quedan 'pendiente' hasta que actúes)
    for p in decision[:limite]:
        card = tarjeta_pendiente(p, await _contexto_de(db, p))
        r = await _tg("sendMessage", {"chat_id": chat, "text": card["texto"], "parse_mode": "HTML",
                                      "reply_markup": {"inline_keyboard": card["botones"]}})
        if r:
            await db.vigia_pendientes.update_one({"id": p["id"]}, {"$set": {"telegram_sent": True}})
            enviados += 1
    return enviados


# ─── flujo de callbacks (los botones) ────────────────────────────────────────
async def _detalle(db, pid: str) -> str:
    p = await db.vigia_pendientes.find_one({"id": pid}, {"_id": 0})
    if not p:
        return "Ese pendiente ya no existe."
    lineas = [f"🔍 <b>Linaje de {_esc(p.get('dev'))} · {_esc(p.get('proyecto') or '')}</b>"]
    arch = (p.get("archivo") or {}).get("id")
    q = {"archivo.id": arch} if arch else {"dev": p.get("dev")}
    async for ev in db.vigia_eventos.find(q, {"_id": 0}).sort("ts", -1).limit(6):
        lineas.append(f"· {_esc(ev.get('ts'))[:16]} — {_esc(ev.get('tipo'))}"
                      + (f" · {_esc((ev.get('archivo') or {}).get('nombre'))}" if ev.get("archivo") else ""))
    if p.get("antes"):
        lineas.append(f"Huella anterior: {_esc(p['antes'].get('huella'))[:18]}… (cambió de verdad, no solo lo abrieron)")
    return "\n".join(lineas)


async def _menu_mapear(db, pid: str) -> Dict[str, Any]:
    p = await db.vigia_pendientes.find_one({"id": pid}, {"_id": 0})
    botones: List[List[Dict[str, str]]] = []
    async for o in db.dev_orgs.find({}, {"_id": 0, "tenant_id": 1, "name": 1}).limit(6):
        if o.get("tenant_id"):
            botones.append([{"text": f"👤 {o.get('name') or o['tenant_id']}",
                             "callback_data": f"map:{pid}:{o['tenant_id']}"}])
    botones.append([{"text": f"➕ Crear \"{(p or {}).get('dev','')[:24]}\"", "callback_data": f"map:{pid}:__crear__"}])
    return {"texto": f"👤 ¿De quién es la carpeta <b>{_esc((p or {}).get('dev'))}</b>?", "botones": botones}


async def procesar_callback(db, cb: Dict[str, Any]) -> None:
    chat = await _chat_vinculado(db)
    if not chat or (cb.get("message") or {}).get("chat", {}).get("id") != chat:
        return
    data = cb.get("data") or ""
    await _tg("answerCallbackQuery", {"callback_query_id": cb.get("id")})
    partes = data.split(":")
    accion, pid = partes[0], (partes[1] if len(partes) > 1 else "")
    import vigia_engine as VE

    if accion == "det":
        await _tg("sendMessage", {"chat_id": chat, "text": await _detalle(db, pid), "parse_mode": "HTML"})
    elif accion == "mapmenu":
        m = await _menu_mapear(db, pid)
        await _tg("sendMessage", {"chat_id": chat, "text": m["texto"], "parse_mode": "HTML",
                                  "reply_markup": {"inline_keyboard": m["botones"]}})
    elif accion == "map" and len(partes) == 3:
        p = await db.vigia_pendientes.find_one({"id": pid}, {"_id": 0})
        if not p:
            await _tg("sendMessage", {"chat_id": chat, "text": "Ese pendiente ya no existe."})
            return
        org = partes[2]
        if org == "__crear__":
            import uuid
            org = f"org_user_{uuid.uuid4().hex[:12]}"
            await db.dev_orgs.update_one({"tenant_id": org}, {"$set": {
                "tenant_id": org, "name": p.get("dev"), "plan_tier": "pro",
                "status": "pending_claim", "claim_token": secrets.token_urlsafe(16),
                "created_by": "superadmin", "created_at": _now_iso(), "origen": "telegram"}}, upsert=True)
        await VE.mapear_dev(db, p["fuente_id"], p.get("dev") or "", org,
                            p.get("dev_folder_id") or "")
        await _tg("sendMessage", {"chat_id": chat, "parse_mode": "HTML",
                                  "text": f"✅ <b>{_esc(p.get('dev'))}</b> mapeado. "
                                          f"¿Ingiero su contenido ahora? (esto sí usa IA)",
                                  "reply_markup": {"inline_keyboard": [[
                                      {"text": "✅ Sí, ingerir", "callback_data": f"ap:{pid}"},
                                      {"text": "⏸ Después", "callback_data": f"noop:{pid}"}]]}})
    elif accion == "ap":
        try:
            r = await VE.aprobar_pendiente(db, pid, "founder_telegram")
            txt = ("🚀 Ingesta disparada (job " + r.get("job_id", "?")[:14] + "…). Te aviso al terminar."
                   if r.get("accion") == "ingesta_disparada" else "👍 Archivado.")
        except LookupError as e:
            txt = f"⚠️ {e}"
        except ValueError:
            txt = "Ese pendiente ya estaba resuelto."
        await _tg("sendMessage", {"chat_id": chat, "text": txt})
    elif accion == "rj":
        try:
            await VE.rechazar_pendiente(db, pid, "founder_telegram", "desde telegram")
            txt = "❌ Ignorado. Sigo vigilando."
        except ValueError:
            txt = "Ese pendiente ya estaba resuelto."
        await _tg("sendMessage", {"chat_id": chat, "text": txt})


# ─── comandos de texto ────────────────────────────────────────────────────────
async def procesar_mensaje(db, msg: Dict[str, Any]) -> None:
    chat_id = (msg.get("chat") or {}).get("id")
    texto = (msg.get("text") or "").strip()
    cfg = await get_config(db)

    if texto.startswith("/vincular"):
        code = texto.split(maxsplit=1)[1].strip().upper() if len(texto.split()) > 1 else ""
        if code == cfg.get("bind_code") and not cfg.get("chat_id"):
            await db.telegram_config.update_one({"_id": "cfg"}, {"$set": {"chat_id": chat_id,
                                                                          "vinculado_at": _now_iso()}})
            await _tg("sendMessage", {"chat_id": chat_id,
                                      "text": "✅ Vinculado. Desde ahora te mando las tarjetas de decisión del vigía aquí.\nComandos: /pendientes · /ronda · /estado · /parte"})
        else:
            await _tg("sendMessage", {"chat_id": chat_id, "text": "Código inválido o bot ya vinculado."})
        return

    if cfg.get("chat_id") != chat_id:
        await _tg("sendMessage", {"chat_id": chat_id,
                                  "text": "Este bot es privado. Vincúlalo con /vincular <código> (el código está en Superadmin → Inventario → Vigía)."})
        return

    if texto.startswith("/pendientes"):
        n = await db.vigia_pendientes.count_documents({"estado": "pendiente"})
        await _tg("sendMessage", {"chat_id": chat_id, "text": f"📥 {n} pendiente(s). Te mando las tarjetas…"})
        await db.vigia_pendientes.update_many({"estado": "pendiente"}, {"$set": {"telegram_sent": False}})
        await notificar_pendientes(db)
    elif texto.startswith("/ronda"):
        import vigia_engine as VE
        await _tg("sendMessage", {"chat_id": chat_id, "text": "🔄 Corriendo ronda (solo metadata, $0)…"})
        r = await VE.ronda(db, notificar=False)
        await _tg("sendMessage", {"chat_id": chat_id,
                                  "text": f"Ronda lista: {r['eventos']} evento(s), {r['pendientes_nuevos']} pendiente(s) nuevos."})
        await notificar_pendientes(db)
    elif texto.startswith("/parte"):
        from parte_engine import CADENCIAS, generar_parte
        partes = texto.split()
        periodo = partes[1].lower() if len(partes) > 1 and partes[1].lower() in CADENCIAS else "diario"
        t = await generar_parte(db, periodo)
        await _tg("sendMessage", {"chat_id": chat_id, "text": t[:4000], "parse_mode": "HTML"})
    elif texto.startswith("/estado"):
        f = await db.vigia_fuentes.count_documents({"activa": True})
        pn = await db.vigia_pendientes.count_documents({"estado": "pendiente"})
        devs = await db.developments.estimated_document_count()
        units = await db.units.estimated_document_count()
        await _tg("sendMessage", {"chat_id": chat_id,
                                  "text": f"📊 Vigía: {f} fuente(s) · {pn} pendientes\n🏢 Catálogo: {devs} proyectos · {units} unidades"})
    else:
        await _tg("sendMessage", {"chat_id": chat_id,
                                  "text": "Comandos: /pendientes · /ronda · /estado · /parte [diario|semanal|mensual…]\n(Las instrucciones en lenguaje libre llegan cuando conectemos la IA — necesita crédito API.)"})


# ─── polling loop (arranca en el startup del server si hay token) ─────────────
async def polling_loop(db) -> None:
    if not _token():
        log.info("[telegram] sin TELEGRAM_BOT_TOKEN — bot apagado")
        return
    log.info("[telegram] bot encendido (long-polling)")
    offset = 0
    while True:
        try:
            updates = await _tg("getUpdates", {"timeout": 50, "offset": offset,
                                               "allowed_updates": ["message", "callback_query"]})
            for u in updates or []:
                offset = max(offset, u["update_id"] + 1)
                if u.get("callback_query"):
                    await procesar_callback(db, u["callback_query"])
                elif u.get("message"):
                    await procesar_mensaje(db, u["message"])
        except Exception as e:  # noqa: BLE001
            log.warning(f"[telegram] loop: {str(e)[:120]}")
            await asyncio.sleep(5)
        if not updates:
            await asyncio.sleep(1)
