"""
estudio_autopiloto_engine — F3.4 · El Cerebro propone regenerar el estudio cuando el dato cambió.
═══════════════════════════════════════════════════════════════════════════════
Loop agéntico que CIERRA el ciclo predicción↔realidad del Estudio de Mercado Vivo:
  1. detectar_cambios — para cada colonia con estudio guardado, recalcula el snapshot de HOY
     y lo compara con el de la última versión. Si hay deriva real (demanda u oferta), propone
     una "jugada": regenerar (con el OK del dev). NO actúa solo en lo delicado.
  2. regenerar — al aprobar: resuelve la predicción previa vs la demanda real de hoy (el Cerebro
     mide su error y reentrena) y guarda la versión nueva (que registra la siguiente predicción).
REUSA (grep-antes-de-construir): estudio_mercado_engine.generar_estudio + snapshot_estudio +
guardar_estudio · cerebro_mercado_engine.resolver_estudio (coach.resolve_predictions+retrain).
FAIL-OPEN. Build-for-endstate: con pocos datos no inventa jugadas (umbral mínimo).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.estudio_autopiloto")

# Umbrales de deriva para que valga la pena proponer (evita ruido por cambios mínimos).
_UMBRAL_DEMANDA = 3       # ± búsquedas activas
_UMBRAL_OFERTA = 1        # ± proyectos en competencia


def _delta(antes, ahora):
    a = antes if isinstance(antes, (int, float)) else 0
    b = ahora if isinstance(ahora, (int, float)) else 0
    return b - a


def _evaluar(prev_snap: dict, now_snap: dict) -> Dict[str, Any]:
    """Compara snapshot guardado vs el de hoy. Devuelve motivos + severidad."""
    motivos: List[str] = []
    d_dem = _delta((prev_snap or {}).get("demanda_total"), (now_snap or {}).get("demanda_total"))
    d_of = _delta((prev_snap or {}).get("oferta_proyectos"), (now_snap or {}).get("oferta_proyectos"))
    if abs(d_dem) >= _UMBRAL_DEMANDA:
        motivos.append(f"La demanda {'subió' if d_dem > 0 else 'bajó'} de "
                       f"{(prev_snap or {}).get('demanda_total', 0)} a {(now_snap or {}).get('demanda_total', 0)} búsquedas.")
    if abs(d_of) >= _UMBRAL_OFERTA:
        motivos.append(f"La competencia {'creció' if d_of > 0 else 'bajó'}: de "
                       f"{(prev_snap or {}).get('oferta_proyectos', 0)} a {(now_snap or {}).get('oferta_proyectos', 0)} proyectos.")
    # Producto dominante cambió de tipología
    pa = ((prev_snap or {}).get("producto_dominante") or {}).get("tipologia")
    pb = ((now_snap or {}).get("producto_dominante") or {}).get("tipologia")
    if pa and pb and pa != pb:
        motivos.append(f"El producto que más se pide cambió de {pa} a {pb}.")
    severidad = "alta" if (abs(d_dem) >= _UMBRAL_DEMANDA * 3 or abs(d_of) >= 2) else ("media" if motivos else "ninguna")
    return {"motivos": motivos, "severidad": severidad,
            "delta_demanda": d_dem, "delta_oferta": d_of}


async def detectar_cambios(db, owner_id: str) -> Dict[str, Any]:
    """Para cada colonia con último estudio guardado, ¿cambió el dato? → jugadas a aprobar. FAIL-OPEN."""
    from estudio_mercado_engine import generar_estudio, snapshot_estudio
    propuestas: List[Dict[str, Any]] = []
    try:
        # última versión por colonia (developer_reports type=estudio)
        rows = await db.developer_reports.find(
            {"owner_id": owner_id, "type": "estudio"}, {"_id": 0}
        ).sort("version", -1).to_list(200)
    except Exception as e:
        log.warning(f"[autopiloto] read historial fail-open: {e}")
        rows = []

    vistos = set()
    for r in rows:
        cid = r.get("colonia_id")
        if not cid or cid in vistos:
            continue
        vistos.add(cid)   # solo la última versión de cada colonia
        try:
            est = await generar_estudio(db, cid, r.get("categoria", "media"))
            now_snap = snapshot_estudio(est)
            ev = _evaluar(r.get("snapshot") or {}, now_snap)
            if ev["motivos"]:
                propuestas.append({
                    "colonia_id": cid,
                    "colonia": r.get("colonia") or est.get("colonia"),
                    "categoria": r.get("categoria", "media"),
                    "version_actual": r.get("version"),
                    "severidad": ev["severidad"],
                    "motivos": ev["motivos"],
                    "snapshot_guardado": r.get("snapshot"),
                    "snapshot_hoy": now_snap,
                    "accion": "regenerar",
                    "jugada": f"El Cerebro detectó cambios en {r.get('colonia') or cid}. ¿Regenerar el estudio?",
                })
        except Exception as e:
            log.warning(f"[autopiloto] evaluar {cid} fail-open: {e}")

    propuestas.sort(key=lambda p: {"alta": 0, "media": 1, "ninguna": 2}.get(p["severidad"], 3))
    return {
        "propuestas": propuestas,
        "total": len(propuestas),
        "lectura": ("El Cerebro vigila tus zonas: cuando el dato cambia, te propone refrescar el estudio (con tu OK)."
                    if propuestas else "Sin cambios relevantes — tus estudios siguen vigentes."),
    }


async def regenerar(db, owner_id: str, colonia_id: str, categoria: str = "media") -> Dict[str, Any]:
    """Aprobar la jugada: resuelve la predicción previa vs la realidad de hoy y guarda versión nueva. FAIL-OPEN."""
    from estudio_mercado_engine import guardar_estudio, generar_estudio, snapshot_estudio

    # 1) ¿cuál era la última versión y su demanda predicha? → resolver vs demanda real de hoy
    resueltas = 0
    try:
        prev = await db.developer_reports.find_one(
            {"owner_id": owner_id, "type": "estudio", "colonia_id": colonia_id},
            {"_id": 0}, sort=[("version", -1)])
        if prev:
            est_hoy = await generar_estudio(db, colonia_id, categoria)
            demanda_real = (snapshot_estudio(est_hoy) or {}).get("demanda_total")
            if demanda_real is not None:
                from cerebro_mercado_engine import resolver_estudio
                res = await resolver_estudio(db, f"estudio__{colonia_id}__v{prev.get('version')}", demanda_real)
                resueltas = res.get("resueltas", 0)
    except Exception as e:
        log.warning(f"[autopiloto] resolver previo fail-open: {e}")

    # 2) guardar versión nueva (registra la siguiente predicción)
    doc = await guardar_estudio(db, owner_id, colonia_id, categoria)
    return {
        "ok": True,
        "nueva_version": doc.get("version"),
        "predicciones_resueltas": resueltas,
        "doc": doc,
        "lectura": (f"Estudio regenerado (v{doc.get('version')}). "
                    + (f"El Cerebro calificó {resueltas} predicción(es) vs la realidad y aprendió."
                       if resueltas else "El Cerebro guardó la nueva predicción para calificarla después.")),
    }
