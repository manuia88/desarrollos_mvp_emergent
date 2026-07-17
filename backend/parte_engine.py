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
    "diario":     {"dias": 1,   "titulo": "📆 Parte del día",       "secciones": ["movimientos", "listas", "catalogo", "absorcion", "moldes", "gangas", "salud"]},
    "semanal":    {"dias": 7,   "titulo": "🗓 Parte semanal",       "secciones": ["movimientos", "listas", "catalogo", "absorcion", "ritmo", "frescura", "moldes", "gangas", "salud"]},
    "quincenal":  {"dias": 15,  "titulo": "🗓 Parte quincenal",     "secciones": ["movimientos", "catalogo", "absorcion", "ritmo", "frescura", "moldes", "gangas", "salud"]},
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


def linea_movimiento(r: Dict[str, Any], nombres: Optional[Dict[str, str]] = None) -> str:
    """Una transición → una línea humana COMPLETA: unidad · specs · desarrollo (nombre real)
    · qué pasó. La fuente de estas líneas es la LISTA del dev (las vio el vigía)."""
    uid = str(r.get("unit_id") or "?").split("__")[-1]
    did = r.get("dev_id") or ""
    proy = (nombres or {}).get(did) or did or r.get("colonia") or "proyecto sin nombre"
    if r.get("campo") == "precio":
        antes, despues = r.get("antes"), r.get("despues")
        try:
            pct = (float(despues) - float(antes)) / float(antes) * 100
            flecha = "💰" if pct > 0 else "📉"
            return (f"{flecha} {proy} · unidad {uid}: precio {_fmt_precio(antes)} → "
                    f"{_fmt_precio(despues)} ({pct:+.1f}%)")
        except (TypeError, ValueError, ZeroDivisionError):
            return f"✏️ {proy} · unidad {uid}: cambió el precio"
    if r["tipo"] == "salida":
        vendida = (r.get("tipo_salida") or "").startswith("vend")
        return (f"🔴 {proy} · unidad {uid}: {'VENDIDA' if vendida else 'salió de la lista'}"
                f" · {_specs(r)} · {_fmt_precio(r.get('precio'))}")
    if r["tipo"] == "alta":
        return f"🆕 {proy} · unidad {uid}: ALTA en la lista · {_specs(r)} · {_fmt_precio(r.get('precio'))}"
    if r["tipo"] == "reaparicion":
        return f"↩️ {proy} · unidad {uid}: regresó a la lista (estaba fuera)"
    return f"{_EMOJI_TIPO.get(r['tipo'], '·')} {proy} · unidad {uid}: cambió {r.get('campo')}"


async def _nombres_devs(db) -> Dict[str, str]:
    return {d["id"]: (d.get("name") or d["id"]) async for d in
            db.developments.find({}, {"_id": 0, "id": 1, "name": 1})}


# ─── las secciones (cada una: datos reales → líneas con emoji) ───────────────
async def _sec_movimientos(db, desde: str) -> List[str]:
    """Dos fuentes, separadas para que se sepa QUIÉN movió qué (pedido founder 07-16):
    · lo que cambió en las LISTAS de los devs (lo vio el vigía comparando fotos),
    · lo que se cambió A MANO en la plataforma (portal del dev o superadmin), con autor."""
    from market_timeline import transiciones
    nombres = await _nombres_devs(db)
    lineas: List[str] = []
    t = await transiciones(db, desde=desde, limite=500)
    regs = t.get("registros") or t.get("eventos") or []
    if regs:
        lineas += ["<b>🏃 Movimientos que hicieron LOS DESARROLLADORES</b>",
                   "<i>(cada línea la causó el dev al actualizar su lista en Drive — "
                   "no fuiste tú ni la plataforma)</i>"]
        orden = {"salida": 0, "cambio": 1, "alta": 2, "reaparicion": 3}
        for r in sorted(regs, key=lambda x: orden.get(x["tipo"], 9))[:20]:
            lineas.append(linea_movimiento(r, nombres))
        if len(regs) > 20:
            lineas.append(f"… y {len(regs) - 20} más (completos en la plataforma).")
    # cambios MANUALES: portal del dev (developer_audit) + superadmin (audit_log)
    manuales: List[str] = []
    try:
        async for a in db.developer_audit.find(
                {"ts": {"$gte": desde}, "action": "unit_fields_change"},
                {"_id": 0}).sort("ts", -1).limit(12):
            proy = nombres.get(a.get("dev_id")) or a.get("dev_id")
            cambios = ", ".join(f"{k}: {(a.get('antes') or {}).get(k)} → {v}"
                                for k, v in (a.get("payload") or {}).items())
            manuales.append(f"✍️ {proy} · unidad {a.get('unit_id')}: {cambios[:120]} "
                            f"— lo cambió el DEV en su portal")
    except Exception:  # noqa: BLE001
        pass
    try:
        async for a in db.audit_log.find(
                {"ts": {"$gte": desde}, "entity": "unit",
                 "actor.role": {"$ne": "developer"}}, {"_id": 0}).sort("ts", -1).limit(12):
            actor = (a.get("actor") or {})
            quien = ("TÚ (superadmin)" if (actor.get("role") or "") in ("superadmin", "admin")
                     else (actor.get("name") or actor.get("role") or "la plataforma"))
            manuales.append(f"✍️ unidad {a.get('entity_id')}: {a.get('action')} "
                            f"— lo hiciste {quien}" if quien.startswith("TÚ") else
                            f"✍️ unidad {a.get('entity_id')}: {a.get('action')} — lo hizo {quien}")
    except Exception:  # noqa: BLE001
        pass
    if manuales:
        lineas += ["", "<b>✍️ Cambios manuales en la plataforma</b>",
                   "<i>(NO vinieron del Drive: los hizo el dev en su portal o tú en "
                   "superadmin — cada línea dice quién)</i>"] + manuales
    if not lineas:
        return ["😴 Sin movimientos de unidades en el periodo "
                "<i>(ni en listas de devs ni cambios manuales)</i>."]
    return lineas


async def _sec_listas(db, desde: str) -> List[str]:
    """Novedades en el Drive vigilado — SIEMPRE con quién (el dev movió SU Drive), qué cambió
    (el peek de la lista, unidad por unidad) y qué hacer. Dedup real (07-16: 'Desarrollador
    nuevo detectado' salía repetido cada día): solo se anuncia si NUNCA se había anunciado."""
    from lista_peek import lineas_de_cambios
    lineas, vistos = [], set()
    # los renombres callan al 'proyecto nuevo' del MISMO proyecto (caso Cordobanes 07-17:
    # sin esto salían las dos líneas juntas y el parte se contradecía solo)
    renombrados = {(e.get("dev"), e.get("proyecto")) async for e in db.vigia_eventos.find(
        {"tipo": "proyecto_renombrado"}, {"_id": 0, "dev": 1, "proyecto": 1})}
    async for ev in db.vigia_eventos.find({"ts": {"$gte": desde},
                                           "tipo": {"$in": ["lista_cambiada", "lista_nueva",
                                                            "proyecto_nuevo", "dev_nuevo",
                                                            "proyecto_renombrado"]}},
                                          {"_id": 0}).sort("ts", -1).limit(30):
        if ev["tipo"] == "proyecto_nuevo" and (ev.get("dev"), ev.get("proyecto")) in renombrados:
            continue                     # no era nuevo: fue un renombre
        # la llave incluye el archivo: dos listas del mismo proyecto (Torre A y B) SÍ son dos
        llave = (ev["tipo"], ev.get("dev"), ev.get("proyecto"),
                 (ev.get("archivo") or {}).get("id"))
        if llave in vistos:
            continue                     # repetido dentro del periodo
        vistos.add(llave)
        if ev.get("proyecto") == "(raíz)":
            ev["proyecto"] = "carpeta principal del dev"
        if ev["tipo"] in ("dev_nuevo", "proyecto_nuevo", "proyecto_renombrado"):
            # ¿ya se anunció ANTES del periodo? → no es nuevo, el robot lo re-emitió
            ya = await db.vigia_eventos.find_one(
                {"tipo": ev["tipo"], "dev": ev.get("dev"),
                 "proyecto": ev.get("proyecto"), "ts": {"$lt": desde}}, {"_id": 1})
            if ya:
                continue
        a = ev.get("archivo") or {}
        if ev["tipo"] == "lista_cambiada":
            lineas.append(f"✏️ <b>{ev.get('dev')}</b> actualizó su lista de precios "
                          f"«{a.get('nombre')}» ({ev.get('proyecto')}) — lo cambió el "
                          f"DESARROLLADOR en su Drive, no fuiste tú:")
            lineas += lineas_de_cambios(ev.get("cambios"))
            if ev.get("aplicado"):
                ap = ev["aplicado"]
                lineas.append(f"   ✅ el vigía YA lo aplicó a la plataforma "
                              f"({ap.get('precios', 0)} precios · {ap.get('status', 0)} "
                              f"estados, auditados) — no tienes que hacer nada")
        elif ev["tipo"] == "lista_nueva":
            lineas.append(f"📄 <b>{ev.get('dev')}</b> subió lista nueva: «{a.get('nombre')}» "
                          f"— {ev.get('proyecto')}")
            if ev.get("cambios"):
                lineas += lineas_de_cambios(ev.get("cambios"))
        elif ev["tipo"] == "proyecto_renombrado":
            viejo = (ev.get("antes") or {}).get("proyecto")
            lineas.append(f"📁 <b>{ev.get('dev')}</b> RENOMBRÓ la carpeta «{viejo}» → "
                          f"«{ev.get('proyecto')}» — es el MISMO proyecto de siempre, "
                          f"no es nuevo. Nada que aprobar.")
        elif ev["tipo"] == "proyecto_nuevo":
            if ev.get("ya_en_catalogo"):
                ya_c = ev["ya_en_catalogo"]
                lineas.append(f"📁 <b>{ev.get('dev')}</b> subió la carpeta «{ev.get('proyecto')}» "
                              f"— OJO: parece ser el proyecto EXISTENTE "
                              f"<b>{ya_c.get('name')}</b> ({ya_c.get('unidades')} unidades ya "
                              f"en el catálogo), no uno nuevo. Revisa antes de aprobar.")
            else:
                lineas.append(f"🏗 Proyecto nuevo en el Drive: <b>{ev.get('proyecto')}</b> — "
                              f"de {ev.get('dev')} → pide aprobar/ignorar abajo")
        elif ev["tipo"] == "dev_nuevo":
            lineas.append(f"🏢 Desarrollador nuevo en el Drive: <b>{ev.get('dev')}</b> "
                          f"→ hay que mapearlo antes de ingerir nada")
    # movimiento de ARCHIVOS por proyecto (planos que entran/salen = señal de ventas):
    # resumen agrupado, nunca un renglón por archivo
    conteo: Dict[tuple, Dict[str, int]] = {}
    async for ev in db.vigia_eventos.find(
            {"ts": {"$gte": desde},
             "tipo": {"$in": ["archivo_nuevo", "archivo_eliminado",
                              "archivo_reemplazado", "archivo_cambiado"]}},
            {"_id": 0, "tipo": 1, "dev": 1, "proyecto": 1}).limit(2000):
        k = (ev.get("dev"), ev.get("proyecto"))
        conteo.setdefault(k, {})[ev["tipo"]] = conteo.setdefault(k, {}).get(ev["tipo"], 0) + 1
    resumen = []
    for (dev, proy), c in sorted(conteo.items(), key=lambda kv: -sum(kv[1].values()))[:8]:
        partes = []
        if c.get("archivo_nuevo"):
            partes.append(f"subió {c['archivo_nuevo']} archivo(s)")
        if c.get("archivo_eliminado"):
            partes.append(f"retiró {c['archivo_eliminado']}")
        if c.get("archivo_reemplazado"):
            partes.append(f"re-subió {c['archivo_reemplazado']}")
        if c.get("archivo_cambiado"):
            partes.append(f"editó {c['archivo_cambiado']}")
        if partes:
            resumen.append(f"· {dev} · {proy}: {', '.join(partes)}")
    if resumen:
        lineas += ["", "📂 <b>Movimiento de archivos en el Drive</b> "
                       "<i>(lo hicieron los devs en sus carpetas; retirar planos suele "
                       "significar deptos vendidos)</i>"] + resumen
    return (["<b>👁 Lo que vio el vigía en el Drive</b>"] + lineas) if lineas else []


async def _sec_catalogo(db, desde: str) -> List[str]:
    total = await db.units.estimated_document_count()
    disp = await db.units.count_documents({"status": {"$in": [None, "", "disponible", "available"]}})
    vend = await db.units.count_documents({"status": {"$in": ["vendida", "vendido", "sold"]}})
    apart = await db.units.count_documents({"status": {"$in": ["apartada", "reservado", "reserved"]}})
    devs = await db.developments.estimated_document_count()
    lineas = ["<b>🏢 El catálogo hoy</b>",
              f"📦 {devs} proyectos · {total} unidades ({disp} disponibles · {apart} apartadas · {vend} vendidas)"]
    # desglose por DESARROLLADOR (quién es quién en esos números — pedido founder 07-16)
    try:
        pipeline = [{"$group": {"_id": "$developer_id", "proyectos": {"$sum": 1}}}]
        conteo_devs = {r["_id"]: r["proyectos"]
                       async for r in db.developments.aggregate(pipeline)}
        nombres_org = {}
        async for o in db.dev_orgs.find({}, {"_id": 0, "tenant_id": 1, "id": 1,
                                             "name": 1, "display_name": 1}):
            k = o.get("tenant_id") or o.get("id")
            if k:
                nombres_org[k] = o.get("display_name") or o.get("name") or k
        top = sorted(conteo_devs.items(), key=lambda x: -x[1])[:5]
        if top:
            partes = " · ".join(f"{nombres_org.get(k) or k or 'sin dueño'}: {n}" for k, n in top)
            lineas.append(f"🏗 Por desarrollador: {partes}")
    except Exception:  # noqa: BLE001
        pass
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
            f"{semaforo} {vendidas} unidades salieron · {pct:.1f}% del inventario "
            f"<i>(qué tan rápido se vende el catálogo: verde ≥2% en el periodo)</i>"]


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
    protos = await db.dmx_prototypes.find({}, {"_id": 0}).to_list(2000)
    if not protos:
        return []
    nombres = await _nombres_devs(db)

    def _dev_de(p):
        return nombres.get(p.get("development_id")) or ""

    # los '?R' (sin recámaras en el dato) NO se publican como molde — van a salud
    sanos = [p for p in protos if "?" not in str(p.get("nombre") or "")]
    rotos = len(protos) - len(sanos)
    out = ["<b>📦 Los moldes del catálogo</b>",
           "<i>(molde = un tipo de depto: rec·baños·m². Nace cuando aparece en una lista, "
           "se agota cuando se vende su última unidad)</i>"]
    vida = []
    for p in sanos:
        n, d = p.get("nombre"), _dev_de(p)
        if (p.get("agoto_at") or "") >= desde:
            vida.append(f"🔴 Se AGOTÓ {n} ({d}) — dato de oro: ese producto vuela")
        elif (p.get("revivio_at") or "") >= desde:
            vida.append(f"🟢 Revivió {n} ({d}) — el dev liberó más unidades")
        elif (p.get("nacio_at") or "") >= desde:
            vida.append(f"✨ Nació {n} ({d})")
    out += vida[:6]
    top = sorted(sanos, key=lambda p: -(p.get("unidades_total") or 0))[:5]
    out += [f"· {p.get('nombre')} ({_dev_de(p)}): {p.get('unidades_total')}u"
            + (f" desde {_fmt_precio(p.get('precio_desde_mxn'))}" if p.get("precio_desde_mxn") else "")
            + (" · AGOTADO" if p.get("estado") == "agotado" else "")
            for p in top]
    if rotos:
        out.append(f"🧩 {rotos} moldes sin recámaras en el dato — no se publican; "
                   f"el detalle está en Salud del dato")
    return out


async def _sec_gangas(db, desde: str) -> List[str]:
    """Las unidades que están BARATAS contra sus gemelas (mismo plano) — accionable hoy:
    el comprador las quiere, el dev debe saber por qué no se han ido."""
    from ficha_atomo import gangas_catalogo
    gangas = await gangas_catalogo(db, limite=5)
    if not gangas:
        return []

    def _piso(g):
        try:
            return f", piso {int(float(g['piso']))}" if g.get("piso") is not None else ""
        except (TypeError, ValueError):
            return ""
    return ["<b>💎 Gangas del catálogo</b>",
            "<i>(unidades hasta 25% por DEBAJO de sus gemelas del mismo molde, ajustado por "
            "piso — descuentos mayores se tratan como error de dato, no como ganga. "
            "Úsalas para: ofrecerlas a compradores o preguntar al dev por qué no salen)</i>"] + [
        f"· {g['desarrollo']} · unidad {g['unidad']}{_piso(g)}: "
        f"<b>{g['vs_molde_pct']}%</b> bajo sus gemelas · {_fmt_precio(g['precio'])}"
        for g in gangas]


_ACCION_REGLA = {   # qué HACER con cada tipo de hallazgo (el reporte siempre dice el paso)
    "m2_coherencia": "revisar la lista fuente y corregir el desglose de m²",
    "campos_obligatorios": "pedir el dato al dev o completarlo de la lista",
    "plausibilidad": "reextraer de la lista fuente (valor imposible)",
    "ganga_sospechosa": "verificar precio/m² contra la lista antes de publicar",
    "nivel_vs_numero": "corregir el piso (level) o el número de unidad",
    "molde_sin_rec": "marcar rec=0 si son lofts o completar recámaras",
    "flex_pendiente": "nada urgente: config flexible anotada",
    "censo_fuente": "abrir la lista del dev y corregir la plataforma (la fuente manda)",
}


async def _sec_salud(db, desde: str) -> List[str]:
    """El Auditor del Catálogo: datos rotos con el átomo exacto (desarrollo · unidad),
    agrupados por tipo y SIEMPRE con la acción a tomar."""
    from auditor_catalogo import ultima_auditoria
    a = await ultima_auditoria(db)
    hs = a.get("hallazgos") or []
    if not hs:
        return ["<b>🩺 Salud del dato</b>", "✅ 0 hallazgos — el catálogo está sano"]
    r = a.get("resumen") or {}
    out = [f"<b>🩺 Salud del dato</b> — {r.get('error', 0)} errores · "
           f"{r.get('alerta', 0)} alertas · {r.get('aviso', 0)} avisos",
           "<i>(el auditor corre solo tras cada carga; aquí salen los 5 más graves con "
           "SU acción — la lista completa vive en /superadmin/inventario)</i>"]
    # agrupar por (regla, severidad) para que 1,400 avisos iguales no ahoguen el reporte
    por_regla: Dict[tuple, List[Dict[str, Any]]] = {}
    for h in hs:
        por_regla.setdefault((h.get("regla") or "otra", h.get("severidad")), []).append(h)
    orden_sev = {"error": 0, "alerta": 1, "aviso": 2}
    resumen_reglas = sorted(por_regla.items(),
                            key=lambda kv: (orden_sev.get(kv[0][1], 9), -len(kv[1])))[:5]
    for (regla, sev), grupo in resumen_reglas:
        ej = grupo[0]
        quien = f"{ej.get('desarrollo') or '?'} · {ej.get('ref')}"
        out.append(f"· [{sev[:1].upper()}] <b>{len(grupo)}×</b> {regla}: "
                   f"p.ej. {quien} — {ej['detalle'][:95]}")
        accion = ej.get("accion") or _ACCION_REGLA.get(regla)
        if accion:
            out.append(f"  → {accion}")
    # el juez de jueces: cuánto del mapa de riesgos tiene vigilante (error_matrix)
    try:
        from error_matrix import resumen as _mr
        mr = _mr()
        out.append(f"🧭 Mapa de jueces: <b>{mr['cubiertas']}/{mr['total']}</b> riesgos "
                   f"conocidos con juez ({mr['pct']}%) — sin juez aún: "
                   + ", ".join(f"{f['campo']}·{f['modo']}" for f in mr["faltantes"][:3])
                   + " <i>(cada error cazado a ojo se vuelve juez nuevo)</i>")
    except Exception:  # noqa: BLE001
        pass
    return out


_SECCIONES = {"movimientos": _sec_movimientos, "listas": _sec_listas, "catalogo": _sec_catalogo,
              "absorcion": _sec_absorcion, "ritmo": _sec_ritmo, "frescura": _sec_frescura,
              "meses_inventario": _sec_meses_inventario, "demanda": _sec_demanda,
              "moldes": _sec_moldes, "gangas": _sec_gangas, "salud": _sec_salud}


async def generar_parte_dev(db, dev_org_id: str, periodo: str = "semanal") -> str:
    """EL PARTE DEL DEV (alertas por audiencia, 07-15): SU catálogo, SU salud, SU pedido —
    el gancho de retención de su portal. Solo datos de SUS proyectos."""
    devs = await db.developments.find({"developer_id": dev_org_id},
                                      {"_id": 0, "id": 1, "name": 1,
                                       "readiness_pct": 1}).to_list(100)
    if not devs:
        return "Aún no tienes proyectos en la plataforma."
    lineas = [f"<b>📊 Tu resumen {periodo}</b>"]
    from ficha_atomo import gangas_catalogo
    gangas = [g for g in await gangas_catalogo(db, limite=50)
              if g.get("development_id") in {d["id"] for d in devs}]
    for d in devs:
        pct = d.get("readiness_pct")
        lineas.append(f"· {d.get('name')}: ficha al {pct}%"
                      + (" — completa tus datos para destacar" if (pct or 0) < 80 else " ✓"))
    if gangas:
        lineas.append(f"💎 {len(gangas)} unidades tuyas están por DEBAJO de sus gemelas y "
                      f"aún no se venden — ¿problema de visibilidad, no de precio?")
    from lista_pedidos import pedido_desarrollo
    for d in devs[:3]:
        p = await pedido_desarrollo(db, d["id"])
        if not p.get("al_dia"):
            lineas.append(f"📋 {d.get('name')}: {p.get('n_puntos')} datos pendientes de tu lado")
    return "\n".join(lineas)


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
