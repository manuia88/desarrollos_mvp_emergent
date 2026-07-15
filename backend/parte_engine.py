"""EL PARTE — el reporte periódico de movimientos que llega solo (Telegram + correo).

Pedido del founder: "reporte diario/semanal/quincenal/mensual/trimestral/semestral/anual con
QUÉ cambió específicamente — 'se vendió la 105 · 2R·2B·2E · $X' — con emojis, visual".

Todo templado desde datos REALES ($0, sin IA): transiciones (el río de cambios de la bitácora),
eventos del vigía (listas que cambiaron, con linaje), catálogo actual, sold-outs, absorción y
demanda. Universalidad: CADENCIAS es un registro — agregar un periodo o una sección = 1 entrada.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.parte")

# ─── el registro de cadencias (universal) ─────────────────────────────────────
CADENCIAS: Dict[str, Dict[str, Any]] = {
    "diario":     {"dias": 1,   "titulo": "📆 Parte del día",       "secciones": ["movimientos", "listas", "catalogo", "absorcion", "moldes", "gangas"]},
    "semanal":    {"dias": 7,   "titulo": "🗓 Parte semanal",       "secciones": ["movimientos", "listas", "catalogo", "absorcion", "ritmo", "frescura", "moldes", "gangas"]},
    "quincenal":  {"dias": 15,  "titulo": "🗓 Parte quincenal",     "secciones": ["movimientos", "catalogo", "absorcion", "ritmo", "frescura", "moldes", "gangas"]},
    "mensual":    {"dias": 30,  "titulo": "📊 Parte mensual",       "secciones": ["movimientos", "catalogo", "absorcion", "ritmo", "meses_inventario", "demanda", "moldes"]},
    "trimestral": {"dias": 91,  "titulo": "📈 Parte trimestral",    "secciones": ["catalogo", "absorcion", "ritmo", "meses_inventario", "demanda", "moldes"]},
    "semestral":  {"dias": 182, "titulo": "📈 Parte semestral",     "secciones": ["catalogo", "absorcion", "meses_inventario", "demanda", "moldes"]},
    "anual":      {"dias": 365, "titulo": "🏆 Parte anual",         "secciones": ["catalogo", "absorcion", "meses_inventario", "demanda", "moldes"]},
}

_EMOJI_TIPO = {"alta": "🆕", "salida": "🔴", "cambio": "✏️", "reaparicion": "↩️"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fmt_precio(v) -> str:
    """Regla founder: TODO dinero va $1,000,000 — sin abreviar."""
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "$?"


def _specs(u: Dict[str, Any]) -> str:
    """'2R·2B·2E · 84m²' desde lo que la unidad tenga (hipergranular pero tolerante)."""
    partes = []
    if u.get("recamaras") is not None or u.get("bedrooms") is not None:
        partes.append(f"{u.get('recamaras') or u.get('bedrooms')}R")
    if u.get("banos") or u.get("bathrooms"):
        partes.append(f"{u.get('banos') or u.get('bathrooms'):g}B")
    if u.get("estacionamientos") is not None or u.get("parking_spots") is not None:
        partes.append(f"{u.get('estacionamientos') or u.get('parking_spots')}E")
    s = "·".join(partes)
    m2 = u.get("m2") or u.get("size_m2")
    if m2:
        s += f" · {m2:g}m²"
    return s


def linea_movimiento(r: Dict[str, Any]) -> str:
    """Una transición → una línea humana con emoji. Ejemplos:
    🔴 Vendida/retirada: 105 · 2R·2B·2E · $4.85M — Almina
    💰 402: $4.65M → $4.85M (+4.3%) — Torre Alba"""
    uid = str(r.get("unit_id") or "?").split("__")[-1]
    proy = r.get("dev_id") or r.get("colonia") or ""
    if r.get("campo") == "precio":
        antes, despues = r.get("antes"), r.get("despues")
        try:
            pct = (float(despues) - float(antes)) / float(antes) * 100
            flecha = "💰" if pct > 0 else "📉"
            return f"{flecha} {uid}: {_fmt_precio(antes)} → {_fmt_precio(despues)} ({pct:+.1f}%) — {proy}"
        except (TypeError, ValueError, ZeroDivisionError):
            return f"✏️ {uid}: precio cambió — {proy}"
    if r["tipo"] == "salida":
        motivo = "vendida" if (r.get("tipo_salida") or "").startswith("vend") else "retirada"
        return f"🔴 {'Vendida' if motivo == 'vendida' else 'Salió'}: {uid} · {_specs(r)} · {_fmt_precio(r.get('precio'))} — {proy}"
    if r["tipo"] == "alta":
        return f"🆕 Nueva: {uid} · {_specs(r)} · {_fmt_precio(r.get('precio'))} — {proy}"
    if r["tipo"] == "reaparicion":
        return f"↩️ Regresó: {uid} — {proy}"
    return f"{_EMOJI_TIPO.get(r['tipo'], '·')} {uid}: {r.get('campo')} cambió — {proy}"


# ─── las secciones (cada una: datos reales → líneas con emoji) ───────────────
async def _sec_movimientos(db, desde: str) -> List[str]:
    from market_timeline import transiciones
    t = await transiciones(db, desde=desde, limite=500)
    regs = t.get("registros") or t.get("eventos") or []
    if not regs:
        return ["😴 Sin movimientos de unidades en el periodo."]
    lineas = ["<b>🏃 Movimientos de unidades</b>"]
    # vendidas/salidas primero (lo que más importa), luego precios, luego altas
    orden = {"salida": 0, "cambio": 1, "alta": 2, "reaparicion": 3}
    for r in sorted(regs, key=lambda x: orden.get(x["tipo"], 9))[:25]:
        lineas.append(linea_movimiento(r))
    if len(regs) > 25:
        lineas.append(f"… y {len(regs) - 25} movimientos más (completo en la plataforma).")
    return lineas


async def _sec_listas(db, desde: str) -> List[str]:
    lineas = []
    async for ev in db.vigia_eventos.find({"ts": {"$gte": desde},
                                           "tipo": {"$in": ["lista_cambiada", "lista_nueva",
                                                            "proyecto_nuevo", "dev_nuevo"]}},
                                          {"_id": 0}).sort("ts", -1).limit(15):
        a = ev.get("archivo") or {}
        if ev["tipo"] == "lista_cambiada":
            lineas.append(f"✏️ Lista cambió: <b>{a.get('nombre')}</b> — {ev.get('dev')} · {ev.get('proyecto')}")
        elif ev["tipo"] == "lista_nueva":
            lineas.append(f"📄 Lista nueva: <b>{a.get('nombre')}</b> — {ev.get('dev')} · {ev.get('proyecto')}")
        elif ev["tipo"] == "proyecto_nuevo":
            lineas.append(f"🏗 Carpeta de proyecto nueva: <b>{ev.get('proyecto')}</b> — {ev.get('dev')}")
        elif ev["tipo"] == "dev_nuevo":
            lineas.append(f"🏢 Desarrollador nuevo detectado: <b>{ev.get('dev')}</b>")
    return (["<b>👁 Lo que vio el vigía</b>"] + lineas) if lineas else []


async def _sec_catalogo(db, desde: str) -> List[str]:
    total = await db.units.estimated_document_count()
    disp = await db.units.count_documents({"status": {"$in": [None, "", "disponible", "available"]}})
    vend = await db.units.count_documents({"status": {"$in": ["vendida", "sold"]}})
    apart = await db.units.count_documents({"status": {"$in": ["apartada", "reserved"]}})
    devs = await db.developments.estimated_document_count()
    lineas = ["<b>🏢 El catálogo hoy</b>",
              f"📦 {devs} proyectos · {total} unidades ({disp} disponibles · {apart} apartadas · {vend} vendidas)"]
    # SOLD OUTs: proyectos con unidades pero cero disponibles
    async for d in db.developments.find({}, {"_id": 0, "id": 1, "name": 1}).limit(300):
        n = await db.units.count_documents({"development_id": d["id"]})
        if n and not await db.units.count_documents(
                {"development_id": d["id"], "status": {"$in": [None, "", "disponible", "available"]}}):
            lineas.append(f"🎉 <b>SOLD OUT</b>: {d.get('name')} ({n}/{n})")
    return lineas


async def _sec_absorcion(db, desde: str) -> List[str]:
    from market_timeline import transiciones
    t = await transiciones(db, desde=desde, tipo="salida", limite=1000)
    vendidas = len(t.get("registros") or t.get("eventos") or [])
    disp = await db.units.count_documents({"status": {"$in": [None, "", "disponible", "available"]}})
    base = disp + vendidas
    pct = (vendidas / base * 100) if base else 0
    semaforo = "🟢" if pct >= 2 else ("🟡" if pct > 0 else "⚪")
    return [f"<b>📊 Absorción del periodo</b>",
            f"{semaforo} {vendidas} unidades salieron · {pct:.1f}% del inventario"]


async def _sec_ritmo(db, desde: str) -> List[str]:
    """Ritmo por proyecto: quién se mueve y quién está parado."""
    from market_timeline import transiciones
    t = await transiciones(db, desde=desde, limite=1000)
    por_proy: Dict[str, int] = {}
    for r in (t.get("registros") or t.get("eventos") or []):
        k = r.get("dev_id") or "?"
        por_proy[k] = por_proy.get(k, 0) + 1
    if not por_proy:
        return []
    top = sorted(por_proy.items(), key=lambda x: -x[1])[:5]
    return ["<b>🔥 Los que más se mueven</b>"] + [f"· {k}: {n} movimientos" for k, n in top]


async def _sec_frescura(db, desde: str) -> List[str]:
    """Qué devs NO han actualizado su lista en el periodo (dato podrido = riesgo)."""
    frescos = set()
    async for ev in db.vigia_eventos.find({"ts": {"$gte": desde}}, {"_id": 0, "dev": 1}):
        frescos.add(ev.get("dev"))
    vigilados = set()
    foto = await db.vigia_fotos.find_one({}, {"_id": 0})
    for dev in ((foto or {}).get("devs") or {}):
        vigilados.add(dev)
    podridos = sorted(vigilados - frescos)
    if not podridos:
        return []
    return ["<b>🥀 Sin actualizar en el periodo</b>"] + [f"· {d}" for d in podridos[:8]]


async def _sec_meses_inventario(db, desde: str) -> List[str]:
    from market_timeline import transiciones
    t = await transiciones(db, desde=desde, tipo="salida", limite=2000)
    vendidas = len(t.get("registros") or t.get("eventos") or [])
    dias = max((_now() - datetime.fromisoformat(desde.replace("Z", "+00:00"))).days, 1)
    ritmo_mensual = vendidas / dias * 30
    disp = await db.units.count_documents({"status": {"$in": [None, "", "disponible", "available"]}})
    if not ritmo_mensual:
        return ["<b>⏳ Meses de inventario</b>", "⚪ Sin ventas en el periodo para calcular."]
    return ["<b>⏳ Meses de inventario</b>",
            f"Al ritmo actual ({ritmo_mensual:.1f} u/mes), el inventario disponible dura <b>{disp / ritmo_mensual:.1f} meses</b>."]


async def _sec_demanda(db, desde: str) -> List[str]:
    n = await db.demand_atoms.count_documents({})
    nuevos = 0
    try:
        nuevos = await db.demand_atoms.count_documents({"ts": {"$gte": desde}})
    except Exception:
        pass
    return ["<b>👤 Demanda (el genoma)</b>",
            f"🧬 {n} señales acumuladas · +{nuevos} en el periodo"]


async def _sec_moldes(db, desde: str) -> List[str]:
    """La vida del Catálogo de Moldes en el periodo: nació / se agotó / revivió (la
    biografía del conciliador) + los más grandes del catálogo."""
    protos = await db.dmx_prototypes.find({}, {"_id": 0}).to_list(500)
    if not protos:
        return []
    out = ["<b>📦 Los moldes del catálogo</b>"]
    vida = []
    for p in protos:
        n = p.get("nombre")
        if (p.get("agoto_at") or "") >= desde:
            vida.append(f"🔴 Se AGOTÓ el molde {n} — dato de oro: qué producto vuela")
        elif (p.get("revivio_at") or "") >= desde:
            vida.append(f"🟢 Revivió {n} (el dev liberó más unidades)")
        elif (p.get("nacio_at") or "") >= desde:
            vida.append(f"✨ Nació {n}")
    out += vida[:6]
    top = sorted(protos, key=lambda p: -(p.get("unidades_total") or 0))[:5]
    out += [f"· {p.get('nombre')}: {p.get('unidades_total')}u"
            + (f" desde {_fmt_precio(p.get('precio_desde_mxn'))}" if p.get("precio_desde_mxn") else "")
            + (" · AGOTADO" if p.get("estado") == "agotado" else "")
            for p in top]
    return out


async def _sec_gangas(db, desde: str) -> List[str]:
    """Las unidades que están BARATAS contra sus gemelas (mismo plano) — accionable hoy:
    el comprador las quiere, el dev debe saber por qué no se han ido."""
    from ficha_atomo import gangas_catalogo
    gangas = await gangas_catalogo(db, limite=5)
    if not gangas:
        return []
    return ["<b>💎 Gangas del catálogo (vs sus gemelas)</b>"] + [
        f"· {g['unidad']} ({g['desarrollo']}, p.{g['piso']}): "
        f"<b>{g['vs_molde_pct']}%</b> bajo su molde · {_fmt_precio(g['precio'])}"
        for g in gangas]


_SECCIONES = {"movimientos": _sec_movimientos, "listas": _sec_listas, "catalogo": _sec_catalogo,
              "absorcion": _sec_absorcion, "ritmo": _sec_ritmo, "frescura": _sec_frescura,
              "meses_inventario": _sec_meses_inventario, "demanda": _sec_demanda,
              "moldes": _sec_moldes, "gangas": _sec_gangas}


async def generar_parte(db, periodo: str = "diario") -> str:
    """El parte completo en HTML-telegram (también sirve para el correo)."""
    cfg = CADENCIAS.get(periodo) or CADENCIAS["diario"]
    desde = (_now() - timedelta(days=cfg["dias"])).isoformat()
    fecha = _now().astimezone().strftime("%d %b %Y")
    bloques: List[str] = [f"<b>{cfg['titulo']}</b> · {fecha}"]
    for sec in cfg["secciones"]:
        fn = _SECCIONES.get(sec)
        if not fn:
            continue
        try:
            lineas = await fn(db, desde)
            if lineas:
                bloques.append("\n".join(lineas))
        except Exception as e:  # noqa: BLE001 — una sección rota no tira el parte
            log.warning(f"[parte] sección {sec}: {e}")
    return "\n\n".join(bloques)


async def enviar_parte(db, periodo: str = "diario") -> Dict[str, Any]:
    """Genera y manda por Telegram + correo. Devuelve el texto (para preview/API)."""
    texto = await generar_parte(db, periodo)
    enviado = {"telegram": False, "correo": False}
    try:
        from telegram_bot import _tg, _chat_vinculado
        chat = await _chat_vinculado(db)
        if chat:
            enviado["telegram"] = bool(await _tg("sendMessage", {
                "chat_id": chat, "text": texto[:4000], "parse_mode": "HTML"}))
    except Exception as e:  # noqa: BLE001
        log.warning(f"[parte] telegram: {e}")
    try:
        import os
        correo = os.environ.get("VIGIA_NOTIFY_EMAIL") or os.environ.get("ADMIN_EMAIL")
        if correo:
            from notifications_engine import _send_email_notification
            import re as _re
            plano = _re.sub(r"</?b>", "", texto)
            enviado["correo"] = await _send_email_notification(
                correo, CADENCIAS[periodo]["titulo"], plano.replace("\n", "<br>"), "")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[parte] correo: {e}")
    return {"periodo": periodo, "texto": texto, "enviado": enviado}


def cadencias_de_hoy(hoy: Optional[datetime] = None) -> List[str]:
    """Qué partes tocan HOY (se evalúa una vez al día a las 8am MX). Puro y testeable."""
    d = (hoy or _now().astimezone())
    toca = ["diario"]
    if d.weekday() == 0:
        toca.append("semanal")
    if d.day in (1, 16):
        toca.append("quincenal")
    if d.day == 1:
        toca.append("mensual")
        if d.month in (1, 4, 7, 10):
            toca.append("trimestral")
        if d.month in (1, 7):
            toca.append("semestral")
        if d.month == 1:
            toca.append("anual")
    return toca


async def enviar_partes_del_dia(db) -> List[str]:
    enviados = []
    for periodo in cadencias_de_hoy():
        await enviar_parte(db, periodo)
        enviados.append(periodo)
    return enviados
