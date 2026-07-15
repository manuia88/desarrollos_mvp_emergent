"""EL AUDITOR DEL CATÁLOGO — reglas invariantes que auditan SOLAS, después de cada conciliación.

Orden founder (07-15): "audita todo... señala si hay algún otro problema" + "profundidad,
universalidad, hipersegmentación, hipergranularidad". Las auditorías de una vez caducan;
esto es un VERIFICADOR PERMANENTE:

  · UNIVERSALIDAD — el registro `REGLAS`: una regla nueva = una entrada (nivel, severidad,
    check puro). Aplica a cualquier dev presente o futuro, cero código por dev.
  · HIPERGRANULARIDAD — cada hallazgo ancla al ÁTOMO exacto (unit_id / prototype_id /
    development_id) con el valor observado y el esperado. Nada de "hay errores": cuál,
    dónde, cuánto.
  · HIPERSEGMENTACIÓN — hallazgos consultables por nivel (unidad/molde/desarrollo/catálogo),
    severidad (error/alerta/aviso) y desarrollo.
  · PROFUNDIDAD — 18 reglas en 4 niveles: coherencia de m² (la regla que habría cazado el
    282.75 del A-1505 sola), campos obligatorios, rangos sanos de $/m², duplicados, moldes
    sin plano/programa/unidades, biografía incoherente, cotejo caducado, price_from
    desalineado, archivos de assets DESAPARECIDOS del disco, bitácora incompleta,
    manifiesto sin dueño, robot dormido.

Corre tras cada conciliación (mismo hook que el cotejo) + a demanda. Persiste en
`auditoria_hallazgos` (1 doc por corrida, hallazgos adentro) y CACHEA readiness_pct en
developments (la barra de avance del Inventario lee eso, gratis). Sale en El Parte.
$0, sin IA. Reglas puras testeables; Mongo solo en auditar().
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

ERROR, ALERTA, AVISO = "error", "alerta", "aviso"
PM2_MIN, PM2_MAX = 15_000, 250_000          # banda sana CDMX (fuera de esto: dato roto)
ESTADOS_VALIDOS = {"disponible", "apartada", "apartado", "vendida", "vendido",
                   "bloqueada", "renta", "available", "sold", "reservado"}


def _h(regla: str, nivel: str, severidad: str, ref: str, detalle: str,
       **extra) -> Dict[str, Any]:
    return {"regla": regla, "nivel": nivel, "severidad": severidad, "ref": ref,
            "detalle": detalle, **extra}


def _pm2(u) -> Optional[float]:
    p, m = u.get("price_mxn") or u.get("price"), u.get("size_m2") or u.get("m2_total")
    return p / m if p and m else None


# ═══ REGLAS DE UNIDAD (el átomo) ═══════════════════════════════════════════════
def r_m2_coherencia(u, ctx) -> Optional[Dict[str, Any]]:
    """habitables + exteriores debe ≈ totales (±3%) — el caso A-1505 (roof sin desglosar)."""
    hab = u.get("m2_privative") or u.get("size_m2")
    tot = u.get("m2_total") or u.get("size_m2_total")
    if not hab or not tot:
        return None
    ext = sum(u.get(k) or 0 for k in ("m2_balcony", "m2_terrace", "m2_roof_garden",
                                      "patio_m2"))
    esperado = hab + ext
    if abs(tot - esperado) > max(2.0, esperado * 0.03):
        return _h("m2_coherencia", "unidad", ALERTA, u.get("unit_number") or u.get("id"),
                  f"los m² no cuadran: {hab:g} habitables + {ext:g} exteriores = "
                  f"{esperado:g}, pero totales dice {tot:g} — hay {tot - esperado:+.1f} m² "
                  f"sin desglosar (¿roof/bodega no itemizados en la lista?)",
                  unit_id=u.get("id"), observado=tot, esperado=round(esperado, 1))
    return None


def r_campos_obligatorios(u, ctx):
    faltan = [c for c, k in (("número", "unit_number"), ("precio", "price_mxn"),
                             ("m²", "size_m2"), ("recámaras", "bedrooms"),
                             ("baños", "bathrooms"))
              if not (u.get(k) or (k == "price_mxn" and u.get("price")))]
    if faltan:
        return _h("campos_obligatorios", "unidad", ERROR,
                  u.get("unit_number") or u.get("id"),
                  f"faltan campos base: {', '.join(faltan)} (así no puede publicarse)",
                  unit_id=u.get("id"), faltan=faltan)
    return None


def r_precio_rango(u, ctx):
    v = _pm2(u)
    if v and not (PM2_MIN <= v <= PM2_MAX):
        return _h("precio_rango", "unidad", ERROR, u.get("unit_number") or u.get("id"),
                  f"${v:,.0f}/m² fuera de rango sano (${PM2_MIN:,}–${PM2_MAX:,}) — "
                  f"precio o m² mal extraídos", unit_id=u.get("id"), pm2=round(v))
    return None


def r_dinero_coherencia(u, ctx):
    """crédito + enganche debe = precio (la validación que salvó la prueba NUA/Nupol)."""
    pr, cr, en = (u.get("price_mxn") or u.get("price")), u.get("credito_mxn"), u.get("enganche_mxn")
    if pr and cr and en and abs((cr + en) - pr) > 2:
        return _h("dinero_coherencia", "unidad", ERROR, u.get("unit_number") or u.get("id"),
                  f"crédito ${cr:,.0f} + enganche ${en:,.0f} ≠ precio ${pr:,.0f} — "
                  f"columna corrida o dato mal extraído", unit_id=u.get("id"))
    return None


def r_molde_asignado(u, ctx):
    if not u.get("prototype_id") and not u.get("prototype_cuarentena"):
        return _h("molde_asignado", "unidad", ALERTA, u.get("unit_number") or u.get("id"),
                  "sin molde y sin marca de cuarentena — el conciliador no la vio",
                  unit_id=u.get("id"))
    return None


def r_estatus_valido(u, ctx):
    st = (u.get("status") or "disponible").lower()
    if st not in ESTADOS_VALIDOS:
        return _h("estatus_valido", "unidad", ALERTA, u.get("unit_number") or u.get("id"),
                  f"estatus desconocido '{st}' — los motores lo van a ignorar",
                  unit_id=u.get("id"))
    return None


# ═══ REGLAS DE MOLDE ═══════════════════════════════════════════════════════════
def r_molde_estado_coherente(m, ctx):
    n = sum(1 for u in ctx["units"] if u.get("prototype_id") == m.get("prototype_id"))
    if m.get("estado") == "agotado" and n > 0:
        return _h("molde_estado", "molde", ERROR, m.get("nombre") or m.get("prototype_id"),
                  f"dice AGOTADO pero tiene {n} unidades vivas apuntándole",
                  prototype_id=m.get("prototype_id"))
    if m.get("estado") in (None, "nuevo", "activo") and n == 0:
        return _h("molde_estado", "molde", ALERTA, m.get("nombre") or m.get("prototype_id"),
                  "activo pero sin unidades — debería estar agotado",
                  prototype_id=m.get("prototype_id"))
    return None


def r_molde_planos(m, ctx):
    if m.get("estado") == "agotado":
        return None
    if not m.get("floor_plan_url") and not m.get("plano_amueblado_url"):
        return _h("molde_planos", "molde", ALERTA, m.get("nombre") or m.get("prototype_id"),
                  "molde sin plano ni planta amueblada (pedir a la carpeta del dev)",
                  prototype_id=m.get("prototype_id"))
    return None


def r_piso_vs_plano(u, ctx):
    """El piso derivado debe existir en los niveles que el PLANO declara para su molde."""
    prog = ctx.get("programas_docs", {}).get(u.get("prototype_id"))
    niveles = (prog or {}).get("niveles_plano") or []
    if niveles and u.get("level") is not None and int(u["level"]) not in niveles             and len(niveles) >= 3:
        return _h("piso_vs_plano", "unidad", AVISO, u.get("unit_number") or u.get("id"),
                  f"piso {u['level']} no está en los niveles del plano de su molde "
                  f"({niveles[:6]}…) — ¿molde mal asignado o plano de otra línea?",
                  unit_id=u.get("id"))
    return None


def r_molde_programa(m, ctx):
    if m.get("estado") != "agotado" and m.get("prototype_id") not in ctx["programas"]:
        return _h("molde_programa", "molde", AVISO, m.get("nombre") or m.get("prototype_id"),
                  "sin programa arquitectónico (espacios del plano)",
                  prototype_id=m.get("prototype_id"))
    return None


def r_huella_duplicada(m, ctx):
    iguales = [x for x in ctx["moldes"] if x.get("huella") and
               x.get("huella") == m.get("huella") and
               x.get("prototype_id") != m.get("prototype_id") and
               x.get("estado") != "agotado" and m.get("estado") != "agotado"]
    if iguales:
        return _h("huella_duplicada", "molde", ALERTA,
                  m.get("nombre") or m.get("prototype_id"),
                  f"dos moldes activos con la misma huella {m.get('huella')} — "
                  f"el conciliador debería fusionarlos", prototype_id=m.get("prototype_id"))
    return None


def r_biografia(m, ctx):
    if m.get("estado") == "agotado" and not m.get("agoto_at"):
        return _h("biografia", "molde", AVISO, m.get("nombre") or m.get("prototype_id"),
                  "agotado sin fecha de agotamiento", prototype_id=m.get("prototype_id"))
    return None


# ═══ REGLAS DE DESARROLLO ══════════════════════════════════════════════════════
def r_duplicados(d, ctx):
    vistos: Dict[str, int] = {}
    for u in ctx["units"]:
        k = str(u.get("unit_number") or "").strip()
        if k:
            vistos[k] = vistos.get(k, 0) + 1
    dups = {k: n for k, n in vistos.items() if n > 1}
    if dups:
        return _h("unidades_duplicadas", "desarrollo", ERROR, d.get("name") or d.get("id"),
                  f"números de unidad repetidos: {dict(list(dups.items())[:5])}",
                  development_id=d.get("id"))
    return None


def r_total_edificio(d, ctx):
    """disponibles ≤ total del edificio, y colocación plausible (la regla del 516→258:
    los totales repetidos por renglón se toman UNA vez, jamás se suman)."""
    tot = d.get("total_units_project")
    n = len(ctx["units"])
    if tot and n > tot:
        return _h("total_edificio", "desarrollo", ERROR, d.get("name") or d.get("id"),
                  f"{n} unidades vivas pero el edificio declara {tot} totales — "
                  f"¿total sumado dos veces o unidades duplicadas?",
                  development_id=d.get("id"))
    return None


def r_conteo_consistente(d, ctx):
    """sum(unidades por molde activo) debe = unidades vivas (fugas silenciosas del conciliador)."""
    activos = [m for m in ctx["moldes"] if m.get("estado") != "agotado"]
    if not activos:
        return None
    suma = sum(m.get("unidades_total") or 0 for m in activos)
    con_molde = sum(1 for u in ctx["units"] if u.get("prototype_id"))
    if abs(suma - con_molde) > 0:
        return _h("conteo_consistente", "desarrollo", ALERTA, d.get("name") or d.get("id"),
                  f"los moldes suman {suma} unidades pero hay {con_molde} con molde — "
                  f"conciliador desincronizado", development_id=d.get("id"))
    return None


def r_price_from(d, ctx):
    precios = [u.get("price_mxn") or u.get("price") for u in ctx["units"]
               if u.get("price_mxn") or u.get("price")]
    if not precios or not d.get("price_from"):
        return None
    if abs(d["price_from"] - min(precios)) > 1:
        return _h("price_from", "desarrollo", ALERTA, d.get("name") or d.get("id"),
                  f"'precio desde' dice ${d['price_from']:,.0f} pero la unidad más barata "
                  f"vale ${min(precios):,.0f}", development_id=d.get("id"))
    return None


def r_cotejo_fresco(d, ctx):
    cot = ctx.get("cotejo")
    ultimo = max((m.get("derivado_at") or "" for m in ctx["moldes"]), default="")
    if ctx["moldes"] and (not cot or (cot.get("cotejado_at") or "") < ultimo):
        return _h("cotejo_fresco", "desarrollo", AVISO, d.get("name") or d.get("id"),
                  "el cotejo es más viejo que la última conciliación — re-cotejar",
                  development_id=d.get("id"))
    return None


def r_bitacora_cubre(d, ctx):
    sin = [u.get("unit_number") for u in ctx["units"]
           if u.get("id") and u["id"] not in ctx["unidades_en_bitacora"]]
    if sin:
        return _h("bitacora_cubre", "desarrollo", ALERTA, d.get("name") or d.get("id"),
                  f"{len(sin)} unidades sin UN solo evento en la bitácora (ej. "
                  f"{sin[:3]}) — su historia no se está guardando",
                  development_id=d.get("id"), n=len(sin))
    return None


def r_assets_en_disco(d, ctx):
    rotos = [a.get("filename") for a in ctx["assets"]
             if a.get("storage_path") and not os.path.exists(a["storage_path"])]
    if rotos:
        return _h("assets_en_disco", "desarrollo", ERROR, d.get("name") or d.get("id"),
                  f"{len(rotos)} archivos de fotos/planos NO existen en disco (ej. "
                  f"{rotos[:3]}) — la galería los mostraría rotos",
                  development_id=d.get("id"), n=len(rotos))
    return None


# alias conocidos: el dato EXISTE pero bajo un nombre que la ficha no lee (familia
# cazada por el founder 07-15: address vs address_full — dirección invisible 2 días)
ALIAS_DEV = [("address_full", ("address", "direccion", "ubicacion")),
             ("delivery_estimate", ("delivery_date", "fecha_entrega")),
             ("description", ("descripcion", "about")),
             ("colonia_id", ("colonia_slug",))]


def r_alias_invisible(d, ctx):
    for canonico, alias in ALIAS_DEV:
        if d.get(canonico):
            continue
        con_dato = [a for a in alias if d.get(a)]
        if con_dato:
            return _h("alias_invisible", "desarrollo", ALERTA, d.get("name") or d.get("id"),
                      f"'{canonico}' está vacío pero el dato EXISTE bajo '{con_dato[0]}' "
                      f"— la ficha lo muestra como FALTA siendo que ya lo tenemos",
                      development_id=d.get("id"), canonico=canonico, alias=con_dato[0])
    return None


def r_dev_basicos(d, ctx):
    if not ctx["units"]:
        return None
    faltan = [c for c in ("address_full", "description", "delivery_estimate")
              if not d.get(c)]
    if faltan:
        return _h("dev_basicos", "desarrollo", ALERTA, d.get("name") or d.get("id"),
                  f"campos base del desarrollo vacíos: {', '.join(faltan)} — el comprador "
                  f"no sabrá ni dónde está", development_id=d.get("id"), faltan=faltan)
    return None


def r_cobertura_planos(d, ctx):
    """≥60% de las unidades vivas deben tener SU plano ligado (el founder cazó el hueco
    a ojo en NUA — ahora es métrica, no descubrimiento)."""
    n = len(ctx["units"])
    if n < 5:
        return None
    con = sum(1 for u in ctx["units"] if u.get("plano_url"))
    if con / n < 0.6:
        return _h("cobertura_planos", "desarrollo", ALERTA, d.get("name") or d.get("id"),
                  f"solo {con}/{n} unidades tienen plano ligado ({con * 100 / n:.0f}%) — "
                  f"correr el pase de planos o pedir los faltantes al dev",
                  development_id=d.get("id"), con_plano=con, total=n)
    return None


def r_dueno(d, ctx):
    if ctx["units"] and not d.get("developer_id"):
        return _h("dueno", "desarrollo", ERROR, d.get("name") or d.get("id"),
                  "desarrollo con unidades pero SIN desarrollador dueño (manifiesto)",
                  development_id=d.get("id"))
    return None


# ═══ EL REGISTRO (universalidad: regla nueva = renglón nuevo) ══════════════════
REGLAS: List[Dict[str, Any]] = [
    {"key": "m2_coherencia", "nivel": "unidad", "fn": r_m2_coherencia},
    {"key": "campos_obligatorios", "nivel": "unidad", "fn": r_campos_obligatorios},
    {"key": "precio_rango", "nivel": "unidad", "fn": r_precio_rango},
    {"key": "dinero_coherencia", "nivel": "unidad", "fn": r_dinero_coherencia},
    {"key": "molde_asignado", "nivel": "unidad", "fn": r_molde_asignado},
    {"key": "estatus_valido", "nivel": "unidad", "fn": r_estatus_valido},
    {"key": "piso_vs_plano", "nivel": "unidad", "fn": r_piso_vs_plano},
    {"key": "molde_estado", "nivel": "molde", "fn": r_molde_estado_coherente},
    {"key": "molde_planos", "nivel": "molde", "fn": r_molde_planos},
    {"key": "molde_programa", "nivel": "molde", "fn": r_molde_programa},
    {"key": "huella_duplicada", "nivel": "molde", "fn": r_huella_duplicada},
    {"key": "biografia", "nivel": "molde", "fn": r_biografia},
    {"key": "unidades_duplicadas", "nivel": "desarrollo", "fn": r_duplicados},
    {"key": "total_edificio", "nivel": "desarrollo", "fn": r_total_edificio},
    {"key": "conteo_consistente", "nivel": "desarrollo", "fn": r_conteo_consistente},
    {"key": "price_from", "nivel": "desarrollo", "fn": r_price_from},
    {"key": "cotejo_fresco", "nivel": "desarrollo", "fn": r_cotejo_fresco},
    {"key": "bitacora_cubre", "nivel": "desarrollo", "fn": r_bitacora_cubre},
    {"key": "assets_en_disco", "nivel": "desarrollo", "fn": r_assets_en_disco},
    {"key": "alias_invisible", "nivel": "desarrollo", "fn": r_alias_invisible},
    {"key": "dev_basicos", "nivel": "desarrollo", "fn": r_dev_basicos},
    {"key": "cobertura_planos", "nivel": "desarrollo", "fn": r_cobertura_planos},
    {"key": "dueno", "nivel": "desarrollo", "fn": r_dueno},
]


def auditar_desarrollo_puro(d: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Aplica TODO el registro a un desarrollo (puro, testeable)."""
    hallazgos: List[Dict[str, Any]] = []
    for regla in REGLAS:
        try:
            if regla["nivel"] == "unidad":
                for u in ctx["units"]:
                    h = regla["fn"](u, ctx)
                    if h:
                        hallazgos.append({**h, "development_id": d.get("id"),
                                          "desarrollo": d.get("name")})
            elif regla["nivel"] == "molde":
                for m in ctx["moldes"]:
                    h = regla["fn"](m, ctx)
                    if h:
                        hallazgos.append({**h, "development_id": d.get("id"),
                                          "desarrollo": d.get("name")})
            else:
                h = regla["fn"](d, ctx)
                if h:
                    hallazgos.append({**h, "desarrollo": d.get("name")})
        except Exception as e:  # noqa: BLE001 — una regla rota no tira la auditoría
            hallazgos.append(_h(regla["key"], regla["nivel"], AVISO, "auditor",
                                f"la regla tronó: {str(e)[:100]}"))
    return hallazgos


def resumen_hallazgos(hallazgos: List[Dict[str, Any]]) -> Dict[str, int]:
    r = {ERROR: 0, ALERTA: 0, AVISO: 0}
    for h in hallazgos:
        r[h["severidad"]] = r.get(h["severidad"], 0) + 1
    return r


# ═══ CORRIDA COMPLETA (Mongo solo aquí) ════════════════════════════════════════
async def auditar(db, development_id: Optional[str] = None) -> Dict[str, Any]:
    from unidades_efectivas import unidades_efectivas
    q = {"id": development_id} if development_id else {}
    devs = await db.developments.find(q, {"_id": 0}).to_list(500)
    todos: List[Dict[str, Any]] = []
    ts = datetime.now(timezone.utc).isoformat()
    for d in devs:
        units = await unidades_efectivas(db, {"development_id": d["id"]})
        if not units:
            continue
        moldes = await db.dmx_prototypes.find({"development_id": d["id"]},
                                              {"_id": 0}).to_list(200)
        progs_docs = {p["prototype_id"]: p for p in await db.molde_programa.find(
            {"development_id": d["id"]}, {"_id": 0}).to_list(200)}
        programas = set(progs_docs)
        cotejo = await db.cotejo_datos.find_one({"development_id": d["id"]}, {"_id": 0})
        assets = await db.dev_assets.find({"development_id": d["id"]},
                                          {"_id": 0, "filename": 1,
                                           "storage_path": 1}).to_list(2000)
        en_bitacora = set(await db.oferta_timeline.distinct(
            "unit_id", {"dev_id": d["id"]}))
        ctx = {"units": units, "moldes": moldes, "programas": programas,
               "programas_docs": progs_docs,
               "cotejo": cotejo, "assets": assets, "unidades_en_bitacora": en_bitacora}
        hs = auditar_desarrollo_puro(d, ctx)
        todos.extend(hs)
        # CACHE de readiness (la barra del Inventario lee esto, gratis)
        try:
            from routes.dev_project_full import project_full, project_readiness
            rd = project_readiness(await project_full(db, d["id"]))
            await db.developments.update_one(
                {"id": d["id"]},
                {"$set": {"readiness_pct": rd.get("pct"),
                          "salud_dato": resumen_hallazgos(hs),
                          "auditado_at": ts}})
        except Exception:  # noqa: BLE001
            pass
    # nivel CATÁLOGO: ¿el robot está vivo?
    fuente = await db.vigia_fuentes.find_one({"activa": True}, {"_id": 0})
    if fuente and fuente.get("last_ronda_at"):
        try:
            desde = datetime.fromisoformat(str(fuente["last_ronda_at"])[:19]
                                           ).replace(tzinfo=timezone.utc)
            horas = (datetime.now(timezone.utc) - desde).total_seconds() / 3600
            if horas > 2:
                todos.append(_h("robot_vivo", "catalogo", ALERTA, "vigía",
                                f"la última ronda fue hace {horas:.0f}h — el robot "
                                f"está dormido (¿laptop cerrada?)"))
        except ValueError:
            pass
    doc = {"ts": ts, "development_id": development_id,
           "hallazgos": todos, "resumen": resumen_hallazgos(todos),
           "reglas_evaluadas": len(REGLAS)}
    await db.auditoria_hallazgos.insert_one(dict(doc))
    return doc


async def ultima_auditoria(db, development_id: Optional[str] = None,
                           nivel: Optional[str] = None,
                           severidad: Optional[str] = None) -> Dict[str, Any]:
    """La corrida más reciente, hipersegmentable por dev/nivel/severidad."""
    doc = await db.auditoria_hallazgos.find_one({}, {"_id": 0}, sort=[("ts", -1)]) or \
        {"ts": None, "hallazgos": [], "resumen": {}}
    hs = doc.get("hallazgos") or []
    if development_id:
        hs = [h for h in hs if h.get("development_id") == development_id]
    if nivel:
        hs = [h for h in hs if h.get("nivel") == nivel]
    if severidad:
        hs = [h for h in hs if h.get("severidad") == severidad]
    return {"ts": doc.get("ts"), "hallazgos": hs, "resumen": resumen_hallazgos(hs)}


# ═══ PRE-AUDITORÍA: el portón de entrada (reglas sobre el LOTE, ANTES de aprobar) ═══
# founder 07-15: "un renglón roto en 80 no se ve a ojo" — apruebas ya sabiendo qué viene.
CAMPOS_CONOCIDOS_EXTRACCION = {
    "unit_number", "price_mxn", "price", "status", "bedrooms", "bathrooms",
    "size_m2", "m2_interior", "m2_total", "size_m2_total", "m2_privative",
    "m2_balcony", "m2_terrace", "m2_roof_garden", "patio_m2", "level", "prototype",
    "tower", "torre", "type", "parking", "parking_spots", "parking_type", "bodega",
    "storage", "storage_count", "enganche_mxn", "enganche_pct", "credito_mxn",
    "credito_pct", "reservacion_mxn", "contrato_mxn", "a_diferir_mxn", "notas",
    "amueblado", "cuarto_servicio", "orientacion", "vista", "acabados", "escritura_mxn",
    "renta_mxn", "operacion", "mantenimiento_mxn",
}
# alias frecuentes de extracción → campo canónico (L22 a nivel unidad)
ALIAS_UNIDAD = {"orientation": "orientacion", "banos": "bathrooms",
                "recamaras": "bedrooms", "precio": "price_mxn", "piso": "level",
                "estacionamientos": "parking_spots", "m2_habitable": "m2_privative"}


def _adaptar_extraida(u: Dict[str, Any]) -> Dict[str, Any]:
    """Unidad extraída → la forma que esperan las reglas (permisivo con alias)."""
    return {"id": u.get("unit_number"), "unit_number": u.get("unit_number"),
            "price_mxn": u.get("price_mxn") or u.get("price") or u.get("precio"),
            "size_m2": u.get("size_m2") or u.get("m2_interior") or u.get("m2_habitable"),
            "m2_privative": u.get("m2_privative") or u.get("m2_interior") or u.get("size_m2"),
            "m2_total": u.get("m2_total") or u.get("size_m2_total"),
            "m2_balcony": u.get("m2_balcony"), "m2_terrace": u.get("m2_terrace"),
            "m2_roof_garden": u.get("m2_roof_garden"), "patio_m2": u.get("patio_m2"),
            "bedrooms": u.get("bedrooms") if u.get("bedrooms") is not None else u.get("recamaras"),
            "bathrooms": u.get("bathrooms") if u.get("bathrooms") is not None else u.get("banos"),
            "status": u.get("status") or "disponible",
            "prototype_id": "pre", "level": u.get("level")}


def campos_sin_colocar(units: List[Dict[str, Any]]) -> List[str]:
    """L21: lo capturado que la plataforma NO sabe dónde poner = trabajo tirado."""
    vistos = {k for u in units for k in u}
    return sorted(vistos - CAMPOS_CONOCIDOS_EXTRACCION - set(ALIAS_UNIDAD))


def pre_auditar_extraccion(extracted: Dict[str, Any]) -> Dict[str, Any]:
    """El veredicto del lote antes del clic: hallazgos + resumen + preguntas al dev."""
    units = (extracted or {}).get("units") or []
    hallazgos: List[Dict[str, Any]] = []
    for u in units:
        a = _adaptar_extraida(u)
        for regla in (r_m2_coherencia, r_campos_obligatorios, r_precio_rango,
                      r_estatus_valido):
            try:
                h = regla(a, {})
                if h:
                    hallazgos.append(h)
            except Exception:  # noqa: BLE001
                pass
    # duplicados dentro del lote
    d_falso = {"id": "lote", "name": extracted.get("project_name") or "el lote"}
    dup = r_duplicados(d_falso, {"units": [_adaptar_extraida(u) for u in units]})
    if dup:
        hallazgos.append(dup)
    sin = campos_sin_colocar(units)
    if sin:
        hallazgos.append(_h("campos_sin_colocar", "lote", AVISO, "extracción",
                            f"campos capturados que la plataforma no sabe colocar: "
                            f"{', '.join(sin[:8])} — o se mapean o se descartan a propósito",
                            campos=sin))
    return {"hallazgos": hallazgos, "resumen": resumen_hallazgos(hallazgos),
            "preguntas_al_dev": preguntas_de_hallazgos(hallazgos),
            "muestra_juez": muestra_juez(units)}


def muestra_juez(units: List[Dict[str, Any]], n: int = 20,
                 semilla: int = 42) -> List[Dict[str, Any]]:
    """EL JUEZ INTEGRADO (gate del 98%): n campos al azar (semilla fija = reproducible)
    para que el founder los verifique contra el PDF/Excel ANTES de aprobar el lote."""
    import random
    CAMPOS = ("price_mxn", "size_m2", "m2_total", "bedrooms", "bathrooms",
              "parking_spots", "enganche_mxn", "credito_mxn")
    candidatos = []
    for u in units:
        for c in CAMPOS:
            v = u.get(c) or (u.get("precio") if c == "price_mxn" else None) or                 (u.get("m2_habitable") if c == "size_m2" else None)
            if v not in (None, ""):
                candidatos.append({"unidad": u.get("unit_number") or u.get("unidad"),
                                   "campo": c, "valor": v})
    rng = random.Random(semilla)
    return rng.sample(candidatos, min(n, len(candidatos)))


# ═══ hallazgo → PREGUNTA lista para mandarle al dev ═══════════════════════════
def preguntas_de_hallazgos(hallazgos: List[Dict[str, Any]]) -> List[str]:
    out: List[str] = []
    m2s = [h for h in hallazgos if h["regla"] == "m2_coherencia"]
    if m2s:
        refs = [str(h.get("ref")) for h in m2s[:8]]
        out.append(f"Los totales de {len(m2s)} unidades ({', '.join(refs[:4])}"
                   f"{'…' if len(refs) > 4 else ''}) traen m² sin desglosar — "
                   f"¿tienen roof/terraza privada? ¿nos comparten los m² por concepto?")
    incompletas = [h for h in hallazgos if h["regla"] == "campos_obligatorios"]
    if incompletas:
        out.append(f"{len(incompletas)} unidad(es) sin datos base "
                   f"({', '.join(str(h.get('ref')) for h in incompletas[:4])}): "
                   f"¿nos pasan recámaras/baños/m² de esas?")
    if any(h["regla"] == "unidades_duplicadas" for h in hallazgos):
        out.append("Hay números de unidad repetidos en la lista — ¿cuál es el correcto?")
    return out
