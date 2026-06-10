"""
estudio_mercado_engine — F2.6 · El Estudio de Mercado Vivo (el entregable).
═══════════════════════════════════════════════════════════════════════════════
Auto-genera, en minutos y para cualquier colonia, el estudio de mercado completo que firmas
profesionales cobran carísimo — fusionando los motores F2 que ya construimos:
  • Demanda real  → Grafo del Comprador (F2.1)
  • Demanda potencial → modelo EPRAV (F2.4)
  • Producto recomendado → Generador de Producto (F2.2)
  • Oferta / competencia → inventario vertical de la colonia (DEVELOPMENTS)
  • Zona → atributos (tier, precio, scores) de data_seed
  • Veredicto → síntesis honesta
Reusa todo (cero reinvención), bandas honestas, FAIL-OPEN. Es la versión VIVA del estudio
4S: se regenera solo conforme entra dato. Lo consume dev + superadmin; exportable a PDF (print).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.estudio_mercado")

# Mínimo de búsquedas reales en el radio para que la DEMANDA real se considere representativa.
_UMBRAL_REPRESENTATIVO = 5


async def colonias_en_radio(db, lat: float, lng: float, radio_m: float) -> List[Dict[str, Any]]:
    """Colonias cuyo centroide cae dentro del radio (m) de un punto. Reusa el haversine de Norma 3.
    Compone microzonas a la medida SIN partir colonias (el átomo más fino sigue siendo la colonia)."""
    try:
        from norma3_engine import _haversine_km
    except Exception:
        return []
    punto = [float(lng), float(lat)]   # formato [lng, lat] (igual que colonia.center)
    radio_km = float(radio_m) / 1000.0
    # Dedup por NOMBRE (no por id): la semilla y el catálogo SIG usan ids distintos para la misma
    # colonia (ej. "anzures" vs "anzures-miguel-hidalgo") → antes se doble-contaba. Se queda la más cercana.
    by_name: Dict[str, Dict[str, Any]] = {}

    def _add(cid, name, alc, center):
        if not center:
            return
        d = _haversine_km(punto, center)
        if d is None or d > radio_km:
            return
        key = (name or cid or "").strip().lower()
        if not key:
            return
        dist_m = round(d * 1000)
        prev = by_name.get(key)
        if prev is None or dist_m < prev["dist_m"]:
            by_name[key] = {"id": cid, "name": name, "alcaldia": alc, "dist_m": dist_m}

    # 1) catálogo SIG en DB.
    try:
        async for c in db.colonias.find({"center": {"$exists": True}},
                                        {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "center": 1}):
            _add(c.get("id"), c.get("name"), c.get("alcaldia"), c.get("center"))
    except Exception as e:
        log.warning(f"[estudio] colonias_en_radio db fail-open: {e}")
    # 2) semilla (rellena nombres que no estén ya en el catálogo).
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            _add(c.get("id"), c.get("name"), c.get("alcaldia"), c.get("center"))
    except Exception:
        pass
    return sorted(by_name.values(), key=lambda x: x["dist_m"])


async def generar_estudio_radio(db, lat: float, lng: float, radio_m: float,
                                categoria: str = "media") -> Dict[str, Any]:
    """Estudio de Mercado de una microzona a la medida (punto + radio): compone las colonias
    dentro del círculo. Solo representativo si junta dato suficiente; si no, lo dice. FAIL-OPEN."""
    cols = await colonias_en_radio(db, lat, lng, radio_m)
    base = {"lat": lat, "lng": lng, "radio_m": radio_m, "categoria": categoria, "colonias": cols}
    if not cols:
        return {**base, "representativo": False, "oculto": True,
                "lectura": "Sin colonias con dato en este radio — amplía el radio o mueve el punto."}
    col_ids = [c["id"] for c in cols]

    # 1 · Demanda real agregada (Grafo del Comprador).
    seg_acc: Dict[str, int] = defaultdict(int)
    demanda_total = 0
    try:
        from grafo_comprador_engine import build_grafo, SEG_LABEL
        g = await build_grafo(db)
        for col in g.get("colonias", []):
            if col.get("colonia_id") in col_ids:
                demanda_total += col.get("demanda_total", 0) or 0
                for s in (col.get("segmentos") or []):
                    seg_acc[s["segmento"]] += s.get("demanda", 0) or 0
        segmentos = sorted(
            [{"segmento": k, "label": SEG_LABEL.get(k, k), "demanda": v} for k, v in seg_acc.items() if v > 0],
            key=lambda x: -x["demanda"])
    except Exception as e:
        log.warning(f"[estudio radio] grafo fail-open: {e}")
        segmentos = []

    # 2 · Demanda potencial agregada (EPRAV sumado por colonia).
    pob = fam = vert = gap = capt = 0
    try:
        from demanda_demografica_engine import estimar_demanda
        for cid in col_ids:
            d = await estimar_demanda(db, cid, categoria)
            pob += d.get("poblacion", 0) or 0
            fam += d.get("demanda_anual_total", 0) or 0
            vert += d.get("demanda_vertical", 0) or 0
            gap += d.get("gap_vertical", 0) or 0
            capt += d.get("captura_objetivo", 0) or 0
    except Exception as e:
        log.warning(f"[estudio radio] demografica fail-open: {e}")

    # 3 · Oferta agregada (inventario vertical en las colonias del radio).
    oferta = {"proyectos": 0, "unidades_disponibles": 0, "precio_desde": None, "precio_hasta": None}
    try:
        from data_developments import DEVELOPMENTS
        names = {(c.get("name") or "").strip().lower() for c in cols}
        precios = []
        for dv in DEVELOPMENTS:
            if str(dv.get("colonia") or "").strip().lower() in names or dv.get("colonia_id") in col_ids:
                oferta["proyectos"] += 1
                oferta["unidades_disponibles"] += int(dv.get("units_available") or len(dv.get("units") or []) or 0)
                if dv.get("price_from"):
                    precios.append(dv["price_from"])
                if dv.get("price_to"):
                    precios.append(dv["price_to"])
        if precios:
            oferta["precio_desde"], oferta["precio_hasta"] = min(precios), max(precios)
    except Exception as e:
        log.warning(f"[estudio radio] oferta fail-open: {e}")

    # Absorción por cohorte + comparables agregados de la microzona (F2.7).
    absorcion = None
    try:
        from absorcion_engine import curva_absorcion
        names_set = {(c.get("name") or "").strip().lower() for c in cols}
        absorcion = await curva_absorcion(db, col_names=names_set, col_ids=set(col_ids))
    except Exception as e:
        log.warning(f"[estudio radio] absorcion fail-open: {e}")

    # F2.8 · qué le falta a la microzona (giros sub-atendidos en la mayoría de colonias del radio).
    falta_radio = []
    try:
        from perfil_zona_engine import perfil_zona
        cnt: Dict[str, int] = defaultdict(int)
        for cid in col_ids[:12]:
            pz = await perfil_zona(db, cid)
            for f in ((pz.get("que_le_falta") or {}).get("faltan") or []):
                cnt[f["giro"]] += 1
        falta_radio = sorted(({"giro": g, "colonias_sin": n} for g, n in cnt.items()),
                             key=lambda x: -x["colonias_sin"])[:6]
    except Exception as e:
        log.warning(f"[estudio radio] qué le falta fail-open: {e}")

    demanda_representativa = demanda_total >= _UMBRAL_REPRESENTATIVO
    veredicto = []
    veredicto.append(f"Microzona de {round(radio_m)} m: {len(cols)} colonias ({', '.join(c['name'] for c in cols[:4])}{'…' if len(cols) > 4 else ''}).")
    if gap > 0:
        veredicto.append(f"Hueco de mercado agregado: ~{round(gap)} unidades verticales/año sin oferta.")
    if demanda_representativa and segmentos:
        veredicto.append(f"Demanda activa la lidera: {segmentos[0]['label']} ({demanda_total} búsquedas).")
    elif not demanda_representativa:
        veredicto.append("Pocas búsquedas reales en el radio: la demanda activa aún no es representativa (se usa el potencial demográfico).")
    if oferta["proyectos"]:
        veredicto.append(f"Competencia: {oferta['proyectos']} proyectos, {oferta['unidades_disponibles']} unidades.")

    return {
        **base,
        "representativo": True,
        "oculto": False,
        "n_colonias": len(cols),
        "demanda_real": {"demanda_total": demanda_total, "representativa": demanda_representativa, "segmentos": segmentos},
        "demanda_potencial": {"poblacion": pob, "demanda_anual_total": fam, "demanda_vertical": vert,
                              "gap_vertical": round(gap), "captura_objetivo": round(capt)},
        "oferta": oferta,
        "absorcion": absorcion,
        "que_le_falta": falta_radio,
        "veredicto": veredicto,
        "lectura": ("Microzona viva con demanda real." if demanda_representativa
                    else "Microzona preliminar: demanda activa aún escasa, se complementa con demografía."),
        "fuente": "Estudio de Mercado Vivo DMX · microzona por radio (compone colonias)",
    }


def _fmt_money(n):
    return f"${round(n/1e6,1)}M" if n else None


async def generar_estudio(db, colonia_id: Optional[str], categoria: str = "media") -> Dict[str, Any]:
    """Fusiona los motores F2 en un estudio de mercado estructurado. FAIL-OPEN."""
    try:
        from data_seed import COLONIAS_BY_ID
    except Exception:
        COLONIAS_BY_ID = {}
    col = COLONIAS_BY_ID.get(colonia_id) or {}
    name = col.get("name") or (colonia_id or "")

    # 1 · Demanda real (Grafo del Comprador).
    grafo = None
    try:
        from grafo_comprador_engine import build_grafo
        g = await build_grafo(db, colonia_id=colonia_id)
        cols = g.get("colonias") or []
        grafo = cols[0] if cols else {"demanda_total": 0, "segmentos": [], "etiqueta": "Sin Búsquedas Aún"}
    except Exception as e:
        log.warning(f"[estudio] grafo fail-open: {e}")

    # 2 · Demanda potencial (EPRAV).
    demografica = None
    try:
        from demanda_demografica_engine import estimar_demanda
        demografica = await estimar_demanda(db, colonia_id, categoria)
    except Exception as e:
        log.warning(f"[estudio] demografica fail-open: {e}")

    # 3 · Producto recomendado (Generador · mezcla % independiente del tamaño del terreno).
    producto = None
    try:
        from generador_producto_engine import generar_producto
        producto = await generar_producto(db, colonia_id, 1000, categoria)
    except Exception as e:
        log.warning(f"[estudio] generador fail-open: {e}")

    # 4 · Oferta / competencia (inventario vertical de la colonia).
    oferta = {"proyectos": 0, "unidades_disponibles": 0, "precio_desde": None, "precio_hasta": None}
    try:
        from data_developments import DEVELOPMENTS
        nm = name.strip().lower()
        precios = []
        for d in DEVELOPMENTS:
            if str(d.get("colonia") or "").strip().lower() == nm or d.get("colonia_id") == colonia_id:
                oferta["proyectos"] += 1
                oferta["unidades_disponibles"] += int(d.get("units_available") or len(d.get("units") or []) or 0)
                if d.get("price_from"):
                    precios.append(d["price_from"])
                if d.get("price_to"):
                    precios.append(d["price_to"])
        if precios:
            oferta["precio_desde"] = min(precios)
            oferta["precio_hasta"] = max(precios)
    except Exception as e:
        log.warning(f"[estudio] oferta fail-open: {e}")

    # 5 · Zona (atributos).
    zona = {
        "tier": col.get("tier"),
        "precio_m2": col.get("price_m2_num") or col.get("price_m2"),
        "momentum": col.get("momentum"),
        "scores": col.get("scores") or {},
        "alcaldia": col.get("alcaldia"),
    }

    # 6 · Veredicto (síntesis honesta).
    veredicto = []
    dt = (grafo or {}).get("demanda_total", 0)
    gap = (demografica or {}).get("gap_vertical")
    if gap is not None and gap > 0:
        veredicto.append(f"Hay hueco de mercado: ~{gap} unidades verticales/año sin oferta en {name}.")
    elif gap is not None:
        veredicto.append(f"La oferta vertical cubre la demanda potencial de {name} — entrar con diferenciación.")
    if dt > 0 and (grafo or {}).get("segmento_dominante_label"):
        veredicto.append(f"La demanda activa la lidera: {grafo['segmento_dominante_label']}.")
    if producto and producto.get("mezcla"):
        dom = max(producto["mezcla"], key=lambda m: m.get("unidades", 0))
        veredicto.append(f"Producto sugerido: sobre todo {dom['tipologia'].lower()} ({dom['pct']}% de la mezcla).")
    if oferta["proyectos"]:
        veredicto.append(f"Competencia directa: {oferta['proyectos']} proyectos, {oferta['unidades_disponibles']} unidades disponibles.")
    if not veredicto:
        veredicto.append(f"Aún con poco dato en {name}: el estudio se completa solo conforme entra demanda y oferta.")

    # 6.5 · F2.8 · enriquecer zona con perfil unificado + qué le falta (reusa perfil_zona_engine).
    try:
        from perfil_zona_engine import perfil_zona
        pz = await perfil_zona(db, colonia_id)
        zona["servicios"] = pz.get("servicios")
        zona["que_le_falta"] = pz.get("que_le_falta")
        zona["ciclo"] = pz.get("ciclo")
    except Exception as e:
        log.warning(f"[estudio] perfil_zona fail-open: {e}")

    # 7 · Absorción por cohorte + comparables (F2.7).
    absorcion = None
    try:
        from absorcion_engine import curva_absorcion
        absorcion = await curva_absorcion(db, colonia_id=colonia_id)
    except Exception as e:
        log.warning(f"[estudio] absorcion fail-open: {e}")

    # 8 · Amenidades en 2 ejes (precio + deseo) (F2.9).
    amenidades_rank = None
    try:
        from amenidades_engine import ranker_amenidades
        amenidades_rank = await ranker_amenidades(db, colonia_id)
    except Exception as e:
        log.warning(f"[estudio] amenidades fail-open: {e}")

    # 9 · Memo de inversionista (usa el producto dominante recomendado) (F2.10).
    inversionista = None
    try:
        from inversionista_engine import memo_inversionista
        precio_inv = m2_inv = None
        if producto and producto.get("mezcla"):
            dom = max(producto["mezcla"], key=lambda m: m.get("unidades", 0))
            precio_inv = dom.get("precio_tipico")
            m2_inv = dom.get("m2_promedio")
        inversionista = await memo_inversionista(db, colonia_id, precio_inv, m2_inv)
    except Exception as e:
        log.warning(f"[estudio] inversionista fail-open: {e}")

    # 10 · Tono de marketing (perfil psicográfico de la zona) (F2.11).
    tono_marketing = None
    try:
        from preferencias_engine import perfil_psicografico
        tono_marketing = perfil_psicografico(col.get("tier"))
    except Exception as e:
        log.warning(f"[estudio] tono_marketing fail-open: {e}")

    es_estimado = (dt < 30)   # P0.11 · umbral más honesto (10 búsquedas no es "vivo")
    from data_doctrine import has_real_sales
    real = await has_real_sales(db)
    return {
        "colonia_id": colonia_id, "colonia": name, "categoria": categoria,
        "data_basis": "real" if real else "demo",
        "secciones": {
            "demanda_real": grafo,
            "demanda_potencial": demografica,
            "producto_recomendado": producto,
            "oferta": oferta,
            "absorcion": absorcion,
            "amenidades": amenidades_rank,
            "inversionista": inversionista,
            "tono_marketing": tono_marketing,
            "zona": zona,
        },
        "veredicto": veredicto,
        "es_estimado": es_estimado,
        "lectura": ("Estudio preliminar: se afina solo conforme entra dato real."
                    if es_estimado else
                    ("Estudio vivo con demanda real en la zona." if real
                     else "Estudio con demanda real (búsquedas); oferta/absorción del catálogo de ejemplo (DEMO).")),
        "fuente": "Estudio de Mercado Vivo DMX · fusiona Grafo + EPRAV + Generador + oferta + zona",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# F3.2/F3.4 · Snapshot + guardado versionado (compartido por la ruta y el autopiloto)
# ═══════════════════════════════════════════════════════════════════════════════
def snapshot_estudio(est: dict) -> Dict[str, Any]:
    """Foto de los números clave que el estudio PREDICE (para comparar luego vs la realidad)."""
    s = est.get("secciones") or {}
    dr = s.get("demanda_real") or {}
    dp = s.get("demanda_potencial") or {}
    prod = s.get("producto_recomendado") or {}
    of = s.get("oferta") or {}
    absn = s.get("absorcion") or {}
    tono = (s.get("tono_marketing") or {}).get("dominante") or {}
    dom = None
    mezcla = prod.get("mezcla") or []
    if mezcla:
        dom = max(mezcla, key=lambda m: m.get("pct", 0) or 0)
    return {
        "demanda_total": dr.get("demanda_total"),
        "gap_vertical": dp.get("gap_vertical"),
        "captura_objetivo": dp.get("captura_objetivo"),
        "producto_dominante": ({"tipologia": dom.get("tipologia"), "pct": dom.get("pct"),
                                "m2": dom.get("m2_promedio"), "precio": dom.get("precio_tipico")} if dom else None),
        "oferta_proyectos": of.get("proyectos"),
        "oferta_unidades": of.get("unidades_disponibles"),
        "absorcion_pct": absn.get("absorcion_pct") if isinstance(absn, dict) else None,
        "tono_dominante": tono.get("nombre"),
    }


async def guardar_estudio(db, owner_id: str, colonia_id: str, categoria: str = "media") -> Dict[str, Any]:
    """Guarda una versión fechada del estudio en db.developer_reports (type=estudio) + registra
    la predicción de demanda en el Cerebro del Mercado. Reusado por la ruta y el autopiloto. FAIL-OPEN."""
    from datetime import datetime as _dt, timezone as _tz
    import uuid as _uuid
    est = await generar_estudio(db, colonia_id, categoria)
    prev = await db.developer_reports.count_documents(
        {"owner_id": owner_id, "type": "estudio", "colonia_id": colonia_id})
    doc = {
        "id": f"est_{_uuid.uuid4().hex[:12]}",
        "owner_id": owner_id,
        "type": "estudio",
        "colonia_id": colonia_id,
        "colonia": est.get("colonia"),
        "categoria": categoria,
        "version": prev + 1,
        "snapshot": snapshot_estudio(est),
        "veredicto": (est.get("veredicto") or [])[:6],
        "es_estimado": est.get("es_estimado", True),
        "generated_at": _dt.now(_tz.utc).isoformat(),
    }
    await db.developer_reports.insert_one(dict(doc))
    doc.pop("_id", None)
    try:
        from cerebro_mercado_engine import registrar_prediccion
        dt_total = (doc["snapshot"] or {}).get("demanda_total")
        if dt_total is not None:
            await registrar_prediccion(db, kind="days_on_market", predicted=float(dt_total),
                                       ref=f"estudio__{colonia_id}__v{doc['version']}",
                                       meta={"colonia_id": colonia_id, "categoria": categoria,
                                             "kind_real": "demanda_estudio"})
    except Exception as e:
        log.warning(f"[estudio.guardar] registrar_prediccion fail-open: {e}")
    return doc
