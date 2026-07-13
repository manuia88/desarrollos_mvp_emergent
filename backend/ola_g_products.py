"""
ola_g_products.py — OLA G del genoma: PRODUCTOS (la monetización del moat · blueprint).

  G1 estudio_dmx()  — EL producto: el estudio de zona AUTO-GENERADO desde nuestros motores
                      (lo que 4S cobra 500k y tarda meses, aquí sale en segundos y se
                      actualiza solo). Resumen ejecutivo + secciones curadas + folio, y se
                      GUARDA en la memoria de reportes (abrible/comparable en la UI).
  G2 dmx30()        — el índice DMX-30: las 30 colonias con más mercado → valor base-100
                      desde el clima diario por colonia (bitácora), retornos, beta y Sharpe
                      por colonia. Publicable trimestral. Honesto mientras la serie madura.
  G3 carfax()       — el CARFAX del depa: dossier B2C por unidad — su historia de precios
                      (bitácora), días en mercado, demanda sobre sus llaves, rival real,
                      veredicto de precio. REUSA screener/liquidez/set_competitivo.

REGLAS: universalidad (secciones del estudio = REGISTRO de bloques del menú), FAIL-OPEN,
es_estimado honesto. Superadmin-only; licenciamiento = decisión founder por reporte.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.ola_g")


def _med(vals):
    s = sorted(v for v in vals if v is not None)
    return s[len(s) // 2] if s else None


# ═══ G1 · ESTUDIO DMX AUTO-GENERADO (sustituye al 4S de 500k) ═════════════════
# REGISTRO de secciones: (bloque del menú, título de sección del estudio). Un capítulo nuevo
# del estudio = una entrada — el generador de reportes hace el resto.
_SECCIONES_ESTUDIO: List[Dict[str, str]] = [
    {"bloque": "demanda_viva", "seccion": "1 · La demanda viva de la zona"},
    {"bloque": "etapa_vida", "seccion": "2 · Quién busca (etapas de vida)"},
    {"bloque": "espejo", "seccion": "3 · Demanda vs oferta (el espejo)"},
    {"bloque": "escasez", "seccion": "4 · Escasez y lo inexistente"},
    {"bloque": "absorcion_viva", "seccion": "5 · Velocidad de venta medida"},
    {"bloque": "accesibilidad", "seccion": "6 · Accesibilidad y financiamiento"},
    {"bloque": "cap_rate_renta", "seccion": "7 · Rendimiento de renta"},
    {"bloque": "indice_adelantado", "seccion": "8 · Índice adelantado de plusvalía"},
    {"bloque": "reloj_ciclo", "seccion": "9 · Fase del ciclo"},
    {"bloque": "curva_obra", "seccion": "10 · Prima por etapa de obra"},
    {"bloque": "precio_sombra", "seccion": "11 · Cuánto vale cada feature"},
    {"bloque": "prima_marca", "seccion": "12 · Marcas que dominan la zona"},
    {"bloque": "prior_4s", "seccion": "13 · Contraste con estudios 4S (si aplica)"},
    # v1.1 · lo que NINGÚN estudio tradicional puede: compradores vivos + simulación
    {"bloque": "gemelo_v2", "seccion": "14 · ¿Y si construyes aquí? (compradores vivos)"},
    {"bloque": "simulador", "seccion": "15 · Simulación de absorción (agentes reales)"},
    {"bloque": "salud_dato", "seccion": "16 · Transparencia: calidad del dato"},
]


async def estudio_dmx(db, colonias: Optional[List[str]] = None,
                      guardar: bool = True) -> Dict[str, Any]:
    from report_builder import generar_reporte, guardar_reporte
    reporte = await generar_reporte(db, colonias=colonias,
                                    bloques=[s["bloque"] for s in _SECCIONES_ESTUDIO])
    titulos = {s["bloque"]: s["seccion"] for s in _SECCIONES_ESTUDIO}
    secciones = []
    lecturas = []
    for s in reporte.get("secciones", []):
        s["seccion_estudio"] = titulos.get(s.get("bloque"), s.get("titulo"))
        secciones.append(s)
        vacia = str(s.get("lectura", "")).startswith(("0 ", "Sin ", "Ninguna", "Aún ", "Se necesitan"))
        if s.get("lectura") and not s.get("error") and not s.get("es_estimado") and not vacia:
            lecturas.append(f"{s['seccion_estudio'].split('·', 1)[-1].strip()}: {s['lectura']}")

    folio = f"DMX-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    zona = ", ".join(colonias) if colonias else "Ciudad de México (todas las zonas con dato)"
    estudio = {
        "producto": "Estudio DMX de Zona",
        "folio": folio, "zona": zona,
        "generado": reporte.get("generado"),
        "resumen_ejecutivo": lecturas[:8],
        "metodologia": ("Datos medidos por DesarrollosMX: bitácora de inventario evento-por-evento, "
                        "genoma de demanda de buscadores reales, tasas BANXICO, y contraste con "
                        "estudios 4S donde existen. Cada sección declara su procedencia "
                        "(medido/observado/estimado) — sin cajas negras."),
        "territorio": reporte.get("territorio"), "n_secciones": len(secciones),
        "secciones": secciones,
    }
    guardado = None
    if guardar:
        try:
            guardado = await guardar_reporte(db, {**reporte, "producto": "estudio_dmx",
                                                  "folio": folio},
                                             nombre=f"Estudio DMX · {zona[:40]} · {folio}")
        except Exception as e:
            log.warning("[estudio_dmx] guardar fail-open: %s", e)
    return {**estudio, "guardado": guardado,
            "es_estimado": not lecturas,
            "lectura": (f"Estudio {folio} generado para {zona}: {len(secciones)} secciones, "
                        f"{len(lecturas)} hallazgos firmes. Lo que un estudio tradicional tarda "
                        f"meses, aquí se regenera al día.")}


# ═══ G2 · DMX-30: el índice de la vivienda nueva CDMX ══════════════════════════
async def dmx30(db) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    # constituyentes: las 30 colonias con más mercado (unidades × demanda)
    unidades = await _oferta_vectores(db)
    peso_col: Dict[str, int] = {}
    for u in unidades:
        if (u.get("precio") or 0) >= 100000:
            peso_col[u["colonia"]] = peso_col.get(u["colonia"], 0) + 1
    dem_col: Dict[str, int] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "colonia": 1}):
            c = a.get("colonia")
            if c and not c.startswith("_"):
                dem_col[c] = dem_col.get(c, 0) + 1
    except Exception as e:
        log.warning("[dmx30] atoms fail-open: %s", e)
    constituyentes = sorted(peso_col, key=lambda c: -(peso_col[c] * (1 + dem_col.get(c, 0))))[:30]

    # series pm2 por colonia desde el clima diario (contexto_timeline.por_colonia)
    series: Dict[str, List[tuple]] = {}
    try:
        async for d in db.contexto_timeline.find({}, {"_id": 0, "fecha": 1, "por_colonia": 1}):
            for c, v in (d.get("por_colonia") or {}).items():
                if c in constituyentes and v.get("pm2_mediana"):
                    series.setdefault(c, []).append((d["fecha"], float(v["pm2_mediana"])))
    except Exception as e:
        log.warning("[dmx30] contexto fail-open: %s", e)
    for c in series:
        series[c].sort()

    fechas = sorted({f for s in series.values() for f, _ in s})
    # ÍNDICE ENCADENADO (estándar de índices publicables): el retorno del día = promedio de los
    # retornos de las colonias CON DATO EN AMBOS días — la composición cambiante ya no salta el nivel.
    mapas = {c: dict(v) for c, v in series.items()}
    indice_serie = []
    nivel = 100.0
    prev_fecha = None
    for f in fechas:
        con_dato = [c for c in constituyentes if mapas.get(c, {}).get(f)]
        if prev_fecha is not None:
            pares = [(mapas[c][prev_fecha], mapas[c][f]) for c in con_dato
                     if mapas.get(c, {}).get(prev_fecha)]
            if pares:
                nivel *= 1 + sum(b / a - 1 for a, b in pares) / len(pares)
        if con_dato:
            indice_serie.append({"fecha": f, "dmx30": round(nivel, 2),
                                 "colonias_con_dato": len(con_dato)})
            prev_fecha = f

    def _retornos(pares: List[tuple]) -> List[float]:
        return [(b / a - 1) for (_, a), (_, b) in zip(pares, pares[1:]) if a]

    ret_idx = _retornos([(x["fecha"], x["dmx30"]) for x in indice_serie])
    filas = []
    for c in constituyentes:
        s = series.get(c, [])
        rets = _retornos(s)
        beta = sharpe = None
        if len(rets) >= 3 and len(ret_idx) >= 3:
            n = min(len(rets), len(ret_idx))
            r, m = rets[-n:], ret_idx[-n:]
            mr, mm = sum(r) / n, sum(m) / n
            var_m = sum((x - mm) ** 2 for x in m) / n
            cov = sum((a - mr) * (b - mm) for a, b in zip(r, m)) / n
            beta = round(cov / var_m, 2) if var_m else None
            sd = (sum((x - mr) ** 2 for x in r) / n) ** 0.5
            sharpe = round(mr / sd, 2) if sd else None
        filas.append({"colonia": c, "unidades": peso_col.get(c, 0),
                      "senales_demanda": dem_col.get(c, 0),
                      "pm2_ultimo": round(s[-1][1]) if s else None,
                      "dias_de_serie": len(s), "beta": beta, "sharpe": sharpe})
    madura = len(indice_serie) >= 20
    return {"constituyentes": filas, "n_constituyentes": len(constituyentes),
            "indice_serie": indice_serie[-90:], "metodo": "encadenado (retorno de colonias con dato en ambos días)",
            "es_estimado": not madura,
            "nota": None if madura else ("El DMX-30 ya está CONSTITUIDO y acumulando su serie "
                                         "diaria — beta y Sharpe se llenan solos con ~20 días de bitácora."),
            "lectura": (f"DMX-30 en {indice_serie[-1]['dmx30']} (base 100) con {len(indice_serie)} "
                        f"días de serie.") if indice_serie else
                       f"DMX-30 constituido con {len(constituyentes)} colonias — la serie empieza hoy."}


# ═══ G3 · CARFAX DEL DEPA (dossier por unidad) ═════════════════════════════════
async def carfax(db, unit_id: str) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    from market_timeline import _diff_eventos, _periodo

    uid = str(unit_id)
    actual = next((u for u in await _oferta_vectores(db) if str(u.get("unit_id")) == uid), None)

    eventos: List[Dict[str, Any]] = []
    try:
        async for e in db.oferta_timeline.find({"unit_id": uid}, {"_id": 0}):
            if str(e.get("unit_id")) == uid:
                eventos.append(e)
    except Exception as e:
        log.warning("[carfax] timeline fail-open: %s", e)
    eventos.sort(key=lambda e: str(e.get("ts", "")))

    historia = [{"fecha": str(e.get("ts", ""))[:10], "precio": e.get("precio"),
                 "status": e.get("status"), "disponible": e.get("disponible"),
                 "fuente": e.get("fuente")} for e in eventos]
    cambios = []
    for a, b in zip(eventos, eventos[1:]):
        for t in _diff_eventos(a, b):
            cambios.append({"fecha": str(b.get("ts", ""))[:10], **{k: v for k, v in t.items()
                                                                   if k in ("tipo", "campo", "antes", "despues", "delta_pct", "tipo_salida")}})
    dias_en_mercado = None
    if eventos:
        try:
            primero = datetime.fromisoformat(str(eventos[0]["ts"]).replace("Z", "+00:00"))
            if primero.tzinfo is None:
                primero = primero.replace(tzinfo=timezone.utc)
            dias_en_mercado = (datetime.now(timezone.utc) - primero).days
        except Exception:
            pass

    # demanda sobre SUS llaves + rival real + veredicto de precio (REUSA los motores C)
    liquidez = rival = veredicto = None
    try:
        from market_scores_engine import score_liquidez, screener
        liq = await score_liquidez(db, top=5000)
        liquidez = next((f for f in liq.get("filas", []) if str(f.get("unit_id")) == uid), None)
        sc = await screener(db, top=5000)
        veredicto = next((f for f in sc.get("filas", []) if str(f.get("unit_id")) == uid), None)
    except Exception as e:
        log.warning("[carfax] scores fail-open: %s", e)
    try:
        from demand_graph_engine import set_competitivo
        rival = await set_competitivo(db, unit_id=uid)
    except Exception as e:
        log.warning("[carfax] rival fail-open: %s", e)

    senales = {"vistas": 0, "dwell_fotos": 0, "guardados": 0}
    try:
        async for s in db.buyer_signals.find({}, {"_id": 0, "type": 1, "entity_id": 1, "unit_number": 1}):
            if uid in (str(s.get("entity_id")), str(s.get("unit_number"))):
                if s.get("type") == "unit_view":
                    senales["vistas"] += 1
                elif s.get("type") == "photo_dwell":
                    senales["dwell_fotos"] += 1
                elif s.get("type") in ("unit_save", "save", "like"):
                    senales["guardados"] += 1
    except Exception as e:
        log.warning("[carfax] señales fail-open: %s", e)

    existe = bool(actual or eventos)
    return {
        "producto": "CARFAX del depa", "unit_id": uid,
        "identidad": ({"colonia": actual.get("colonia"), "dev_id": actual.get("dev_id"),
                       "precio_actual": actual.get("precio"), "m2": actual.get("m2"),
                       "recamaras": actual.get("recamaras"), "piso": actual.get("piso"),
                       "status": actual.get("status"),
                       "features": sorted(k.rsplit(".", 1)[1] for k in (actual.get("vector") or {})
                                          if k.startswith("producto.feature."))} if actual else None),
        "dias_en_mercado": dias_en_mercado,
        "historia_precios": historia[-20:],
        "cambios": cambios[-15:],
        "senales": senales,
        "liquidez": liquidez,
        "veredicto_precio": veredicto,
        "rival_real": (rival or {}).get("rivales") or (rival or {}).get("filas"),
        "es_estimado": not existe,
        "lectura": ((f"Unidad {uid}: {dias_en_mercado} días en mercado, "
                     f"{len(cambios)} cambios registrados, {senales['vistas']} vistas."
                     + (f" Veredicto de precio: {veredicto.get('veredicto', veredicto.get('estado', ''))}."
                        if veredicto else ""))
                    if existe else f"La unidad {uid} no existe en el inventario ni en la bitácora."),
    }
