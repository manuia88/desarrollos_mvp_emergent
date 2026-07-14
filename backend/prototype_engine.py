"""PROTOTIPOS v2 — el código MIDE, la IA solo ETIQUETA.

Diagnóstico (founder 07-14, medido): 867 unidades con campo 'prototype' de texto basura
('01','1','02-A' — 118 valores sin normalizar) y la colección dmx_prototypes que el marketplace
espera estaba en CERO. Causa: le pedíamos a la IA adivinar el prototipo leyendo texto; nadie medía.

v2 corre DESPUÉS de toda la extracción existente (no toca prompts, ni anti-fantasma, ni golden
gates — los complementa):
  1. CLUSTER (montoncitos) por MEDIDAS: recámaras + baños + estacionamiento iguales, m² ±3%.
  2. Señales de refuerzo: la terminación del número (101/201/301) y el texto de prototipo que ya
     extrajo la IA se usan para CONFIANZA y NOMBRE, nunca como verdad de agrupación.
  3. Cuarentena: unidades sin medidas suficientes NO se inventan — quedan marcadas.
  4. MATERIALIZA: escribe dmx_prototypes (schema Prototype de dmx_unit_schema) + prototype_id
     en cada unidad → el marketplace por fin recibe prototipos reales.
  5. Bautizo IA (opcional, centavos, aprobado por founder): nombra los montoncitos en humano;
     si no hay IA disponible cae al nombre de código ("2R·2B·84m²") sin fallar.

Jerarquía de hipersegmentación: PROTOTIPO (el molde) → variantes (piso/vista, viven como campos
de la unidad) → UNIDAD. Con esto se desbloquea precio/m² por prototipo y absorción por prototipo.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.prototipos")

M2_TOLERANCIA = 0.03          # ±3% (variación por nivel/medición) — mismo criterio que la ingesta
_PH_RE = re.compile(r"\bph\b|penthouse", re.I)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _num(v) -> Optional[float]:
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def norm_proto_texto(s: Any) -> str:
    """Normaliza el texto de prototipo que dejó la IA: '1'≡'01', 'Tipo A'≡'A', 'modelo luna'≡'LUNA'."""
    t = re.sub(r"^(tipo|modelo|proto(tipo)?|unidad)\s*", "", str(s or "").strip(), flags=re.I)
    t = t.strip(" -_·.").upper()
    if t.isdigit():
        t = t.zfill(2)
    return t


def _m2_de(u: Dict[str, Any]) -> Optional[float]:
    return _num(u.get("size_m2")) or _num(u.get("m2_privative")) or _num(u.get("m2_total"))


def _terminacion(u: Dict[str, Any]) -> str:
    """101→'01' · 1105→'05' · 302B→'02B' (misma regla que _derive_prototypes de la ingesta)."""
    un = str(u.get("unit_number") or "").strip()
    m = re.fullmatch(r"(?:[A-Za-z]{0,4}[-_ ]?)?(\d{3,4})[-_ ]?([A-Za-z]?)", un)
    return (m.group(1)[-2:] + (m.group(2) or "").upper()) if m else ""


# ─── EL CLUSTER (puro, testeable) ─────────────────────────────────────────────
def clusterizar(units: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Agrupa unidades en montoncitos (prototipos) por MEDIDAS. Devuelve
    {"clusters": [...], "cuarentena": [unit_ids sin medidas]}."""
    medibles: List[Dict[str, Any]] = []
    solo_texto: List[Dict[str, Any]] = []
    cuarentena: List[str] = []
    for u in units:
        if _m2_de(u) and u.get("bedrooms") is not None:
            medibles.append(u)
        elif norm_proto_texto(u.get("prototype")):
            solo_texto.append(u)          # sin medidas pero con etiqueta → cluster por etiqueta
        else:
            cuarentena.append(u.get("id"))

    clusters: List[Dict[str, Any]] = []

    # 1) por medidas: llave exacta (rec, baños, cajones) + partición de m² con tolerancia ±3%
    grupos: Dict[tuple, List[Dict[str, Any]]] = {}
    for u in medibles:
        k = (u.get("bedrooms"), _num(u.get("bathrooms")) or -1,
             int(u.get("parking_spots") or u.get("parking") or 0))
        grupos.setdefault(k, []).append(u)
    for (rec, ban, caj), us in grupos.items():
        us = sorted(us, key=_m2_de)
        lote: List[Dict[str, Any]] = []
        for u in us:
            if lote and _m2_de(u) > _m2_de(lote[0]) * (1 + M2_TOLERANCIA):
                clusters.append(_cerrar_cluster(lote, rec, ban, caj))
                lote = []
            lote.append(u)
        if lote:
            clusters.append(_cerrar_cluster(lote, rec, ban, caj))

    # 2) sin medidas pero con etiqueta de la IA: un cluster por etiqueta normalizada
    por_texto: Dict[str, List[Dict[str, Any]]] = {}
    for u in solo_texto:
        por_texto.setdefault(norm_proto_texto(u.get("prototype")), []).append(u)
    for etiqueta, us in por_texto.items():
        c = _cerrar_cluster(us, us[0].get("bedrooms"), _num(us[0].get("bathrooms")) or -1,
                            int(us[0].get("parking_spots") or 0))
        c["confianza"] = "media"          # sin medidas: la etiqueta es la única señal
        c["senales"]["origen"] = "etiqueta_ia"
        clusters.append(c)

    return {"clusters": clusters, "cuarentena": cuarentena}


def _cerrar_cluster(us: List[Dict[str, Any]], rec, ban, caj) -> Dict[str, Any]:
    m2s = [_m2_de(u) for u in us if _m2_de(u)]
    protos = sorted({norm_proto_texto(u.get("prototype")) for u in us
                     if norm_proto_texto(u.get("prototype"))})
    terms = sorted({_terminacion(u) for u in us if _terminacion(u)})
    precios = [_num(u.get("price_mxn")) or _num(u.get("price")) for u in us]
    precios = [p for p in precios if p]
    es_ph = any(_PH_RE.search(str(u.get("prototype") or "") + str(u.get("type") or "")) for u in us)

    # confianza: ≥2 unidades con medidas consistentes = alta; 1 sola (un PH único) = media
    confianza = "alta" if len(us) >= 2 and m2s else "media"
    m2_prom = round(sum(m2s) / len(m2s), 1) if m2s else None
    nombre = (f"{int(rec)}R" if rec is not None else "?R")
    nombre += f"·{ban:g}B" if ban and ban > 0 else ""
    nombre += f"·{round(m2_prom)}m²" if m2_prom else ""
    if es_ph:
        nombre = "PH " + nombre
    return {
        "unidades": [u.get("id") for u in us], "n": len(us),
        "recamaras": int(rec) if rec is not None else None,
        "banos": float(ban) if ban and ban > 0 else None,
        "estacionamientos": int(caj) if caj and caj >= 0 else None,
        "m2_prom": m2_prom, "m2_min": min(m2s) if m2s else None, "m2_max": max(m2s) if m2s else None,
        "precio_desde": min(precios) if precios else None,
        "nombre_auto": nombre, "confianza": confianza, "es_ph": es_ph,
        "senales": {"etiquetas_ia": protos, "terminaciones": terms, "origen": "medidas"},
    }


# ─── BAUTIZO IA (opcional · centavos · fail-soft al nombre de código) ─────────
async def bautizar_ia(clusters: List[Dict[str, Any]], development_nombre: str) -> Dict[int, str]:
    """1 llamada por desarrollo: la IA propone nombres humanos ('Tipo A', 'Luna 2R')."""
    try:
        import json as _json
        from llm_client import LlmChat, UserMessage
        desc = [{"i": i, "medidas": c["nombre_auto"], "n_unidades": c["n"],
                 "etiquetas_que_dejo_la_lista": c["senales"]["etiquetas_ia"][:6],
                 "terminaciones": c["senales"]["terminaciones"][:6]} for i, c in enumerate(clusters)]
        prompt = (f"Desarrollo '{development_nombre}'. Estos son sus prototipos DETECTADOS POR "
                  f"MEDIDAS (agrupación por m²/recámaras — ya es un hecho, no lo cambies). "
                  f"Propón un nombre CORTO y humano para cada uno usando las etiquetas de la "
                  f"lista original si existen (ej. 'Tipo A', 'Modelo Luna'); si no, deja las "
                  f"medidas como nombre. Devuelve SOLO JSON: {{\"nombres\": {{\"0\": \"...\"}}}}\n"
                  f"{_json.dumps(desc, ensure_ascii=False)}")
        chat = LlmChat(api_key=None, session_id=f"proto_{development_nombre[:20]}",
                       system_message="Nombras tipologías inmobiliarias. Solo JSON.")
        resp = await chat.send_message(UserMessage(text=prompt))
        data = _json.loads(re.search(r"\{[\s\S]*\}", str(resp)).group(0))
        return {int(k): str(v)[:60] for k, v in (data.get("nombres") or {}).items()}
    except Exception as e:  # noqa: BLE001 — sin IA no se cae nada: nombre de código
        log.info(f"[prototipos] bautizo IA no disponible ({str(e)[:80]}) — uso nombres de código")
        return {}


# ─── MATERIALIZAR (escribe lo que el marketplace espera) ──────────────────────
async def materializar(db, development_id: str, bautizar: bool = False) -> Dict[str, Any]:
    units = await db.units.find({"development_id": development_id}, {"_id": 0}).to_list(2000)
    if not units:
        return {"development_id": development_id, "prototipos": 0, "unidades": 0, "cuarentena": 0}
    res = clusterizar(units)
    clusters = res["clusters"]

    nombres_ia: Dict[int, str] = {}
    if bautizar and clusters:
        dev_doc = await db.developments.find_one({"id": development_id}, {"_id": 0, "name": 1})
        nombres_ia = await bautizar_ia(clusters, (dev_doc or {}).get("name") or development_id)

    await db.dmx_prototypes.delete_many({"development_id": development_id})
    asignadas = 0
    for i, c in enumerate(clusters):
        pid = f"{development_id}__p{i:02d}"
        await db.dmx_prototypes.insert_one({
            # campos del schema Prototype (dmx_unit_schema) — el contrato del marketplace
            "prototype_id": pid, "development_id": development_id,
            "nombre": nombres_ia.get(i) or c["nombre_auto"],
            "m2_construido": c["m2_prom"], "m2_privativo": None,
            "recamaras": c["recamaras"], "banos": c["banos"],
            "estacionamientos": c["estacionamientos"],
            "precio_desde_mxn": c["precio_desde"], "unidades_total": c["n"],
            "floor_plan_url": None,
            # linaje/confianza (extra, para la bandeja y auditoría)
            "confianza": c["confianza"], "es_ph": c["es_ph"], "senales": c["senales"],
            "m2_min": c["m2_min"], "m2_max": c["m2_max"],
            "derivado_at": _now_iso(), "metodo": "cluster_medidas_v2",
        })
        r = await db.units.update_many({"id": {"$in": c["unidades"]}},
                                       {"$set": {"prototype_id": pid}})
        asignadas += r.modified_count
    if res["cuarentena"]:
        await db.units.update_many({"id": {"$in": res["cuarentena"]}},
                                   {"$set": {"prototype_id": None,
                                             "prototype_cuarentena": True}})
    return {"development_id": development_id, "prototipos": len(clusters),
            "unidades": asignadas, "cuarentena": len(res["cuarentena"])}


async def materializar_todos(db, bautizar: bool = False) -> Dict[str, Any]:
    dev_ids = await db.units.distinct("development_id")
    total = {"desarrollos": 0, "prototipos": 0, "unidades": 0, "cuarentena": 0, "ts": _now_iso()}
    for did in dev_ids:
        if not did:
            continue
        r = await materializar(db, did, bautizar=bautizar)
        total["desarrollos"] += 1
        for k in ("prototipos", "unidades", "cuarentena"):
            total[k] += r[k]
    return total
