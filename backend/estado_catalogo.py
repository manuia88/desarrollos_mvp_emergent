"""ESTADO DEL CATÁLOGO EN EL TIEMPO — el almacén de comparativos (founder 07-16).

Las series de MERCADO ya existían (oferta_timeline, lista_snapshots, precios, ml). Pero
los motores de CALIDAD (censo, cobertura, cotejo) sólo guardaban el ÚLTIMO estado por
dev (upsert) — sin historia, imposible comparar "hoy vs el mes pasado". Este motor cierra
el hueco: fotografía TODO el estado del catálogo —global y por dev, hipersegmentado— y lo
APPEND (jamás sobreescribe) a `estado_catalogo_historico`. Así cada métrica implementada
tiene un lugar en el tiempo y sirve para comparativos futuros.

Corre tras cada carga + semanal (cron). Comparar = snapshot_estado + delta_vs_anterior.
Puro salvo la lectura Mongo. $0.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


async def _estado_dev(db, dev: Dict[str, Any]) -> Dict[str, Any]:
    pid = dev["id"]
    units = await db.units.count_documents({"development_id": pid})
    con_plano = await db.units.count_documents(
        {"development_id": pid, "plano_url": {"$nin": [None, ""]}})
    plano_img = await db.units.count_documents(
        {"development_id": pid, "plano_url": {"$regex": r"\.(png|jpg|jpeg|webp)$"}})
    assets = await db.dev_assets.count_documents({"development_id": pid})
    moldes = await db.dmx_prototypes.count_documents({"development_id": pid})
    cob = await db.cobertura_fuente.find_one({"development_id": pid},
                                             {"_id": 0, "cobertura_pct": 1, "huecos": 1})
    cen = await db.censo_verificacion.find_one({"development_id": pid},
                                               {"_id": 0, "pct": 1, "discrepa": 1})
    cot = await db.cotejo_datos.find_one({"development_id": pid},
                                         {"_id": 0, "resumen": 1})
    return {
        "development_id": pid, "nombre": dev.get("name"),
        "unidades": units, "moldes": moldes,
        "readiness_pct": dev.get("readiness_pct"),
        "cobertura_fuente_pct": (cob or {}).get("cobertura_pct"),
        "huecos_fuente": len((cob or {}).get("huecos") or []),
        "censo_pct": (cen or {}).get("pct"),
        "censo_discrepa": (cen or {}).get("discrepa"),
        "verificados_2fuentes": ((cot or {}).get("resumen") or {}).get("coincide", 0),
        "planos_con_imagen": plano_img, "con_plano": con_plano,
        "assets": assets, "gps": dev.get("lat") is not None,
        "precio_desde": dev.get("price_from"),
        "juez_gate": bool(dev.get("juez_gate")),
    }


async def snapshot_estado(db, origen: str = "manual") -> Dict[str, Any]:
    """Fotografía el estado completo del catálogo y lo APPEND al histórico.
    UNIVERSAL: todo dev con ≥1 unidad (sin importar el origen de la carga)."""
    con_units = await db.units.distinct("development_id")
    devs = await db.developments.find(
        {"id": {"$in": con_units}}, {"_id": 0}).to_list(1000)
    por_dev = [await _estado_dev(db, d) for d in devs]
    ml = await db.ml_modelos.find_one({}, {"_id": 0, "n": 1, "r2": 1, "validacion": 1},
                                      sort=[("ts", -1)])
    total_u = sum(d["unidades"] for d in por_dev)
    con_plano = sum(d["con_plano"] for d in por_dev)
    plano_img = sum(d["planos_con_imagen"] for d in por_dev)

    def _prom(campo):
        vals = [d[campo] for d in por_dev if d.get(campo) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    glob = {
        "desarrollos": len(por_dev), "unidades": total_u,
        "moldes": sum(d["moldes"] for d in por_dev),
        "assets": sum(d["assets"] for d in por_dev),
        "cobertura_fuente_pct": _prom("cobertura_fuente_pct"),
        "censo_pct": _prom("censo_pct"),
        "readiness_pct": _prom("readiness_pct"),
        "verificados_2fuentes": sum(d["verificados_2fuentes"] for d in por_dev),
        "con_plano_pct": round(con_plano * 100 / total_u, 1) if total_u else None,
        "planos_con_imagen_pct": round(plano_img * 100 / con_plano, 1) if con_plano else None,
        "devs_con_gps": sum(1 for d in por_dev if d["gps"]),
        "devs_con_hueco_fuente": sum(1 for d in por_dev if (d["huecos_fuente"] or 0) > 0),
        "ml": ({"n": ml.get("n"), "r2": ml.get("r2"),
                "error_unidad_nueva_pct": ((ml.get("validacion") or {}).get("unidad_nueva") or {}).get("error_pct")}
               if ml else None),
    }
    doc = {"ts": datetime.now(timezone.utc).isoformat(), "origen": origen,
           "global": glob, "por_dev": por_dev}
    await db.estado_catalogo_historico.insert_one(dict(doc))
    return doc


def delta(anterior: Optional[Dict[str, Any]], actual: Dict[str, Any]) -> Dict[str, Any]:
    """Comparativo entre dos fotos: qué mejoró/empeoró en cada métrica global."""
    if not anterior:
        return {"nota": "primera foto — el comparativo arranca con la 2ª"}
    a, b = anterior.get("global", {}), actual.get("global", {})
    campos = ("cobertura_fuente_pct", "censo_pct", "readiness_pct",
              "verificados_2fuentes", "con_plano_pct", "planos_con_imagen_pct",
              "unidades", "assets", "desarrollos")
    out = {}
    for c in campos:
        va, vb = a.get(c), b.get(c)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)) and va != vb:
            out[c] = {"antes": va, "ahora": vb, "delta": round(vb - va, 1)}
    return {"desde": anterior.get("ts"), "hasta": actual.get("ts"), "cambios": out}


async def estado_con_comparativo(db) -> Dict[str, Any]:
    """El último estado + el delta contra la foto anterior (para la Fábrica/API)."""
    ultimos: List[Dict[str, Any]] = await db.estado_catalogo_historico.find(
        {}, {"_id": 0}).sort("ts", -1).to_list(2)
    if not ultimos:
        return {"estado": None, "comparativo": None}
    actual = ultimos[0]
    anterior = ultimos[1] if len(ultimos) > 1 else None
    return {"estado": actual.get("global"), "ts": actual.get("ts"),
            "comparativo": delta(anterior, actual),
            "fotos_en_historia": await db.estado_catalogo_historico.count_documents({})}
