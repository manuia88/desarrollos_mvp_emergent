"""EL PERFIL DEL DESARROLLADOR — la empresa completa, no solo sus proyectos ingeridos.

Punto ciego cazado (07-15): teníamos todo a nivel proyecto y NADA a nivel dev-empresa,
mientras el Drive de CLASS muestra su portafolio entero. Este perfil junta:
  · CATÁLOGO: lo ya ingerido (avance, unidades, colocación, publicado)
  · RADAR DRIVE: lo que el Vigía VE pero aún no ingerimos (proyectos + etapa comercial
    leída del nombre de la carpeta + qué documentos tiene cada uno + si trae lista)
  · AGREGADOS: mix del portafolio por etapa — el perfil de riesgo del dev en un vistazo.
$0: todo sale de la foto del Vigía (metadata) + el catálogo. Lógica pura testeable.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional

from vigia_engine import etapa_de_nombre


def _norm(s: str) -> str:
    """minúsculas + sin acentos + solo alfanumérico ('Almina San Ángel' ≡ 'almina san angel')."""
    sin_acentos = "".join(c for c in unicodedata.normalize("NFD", s or "")
                          if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", sin_acentos.lower())


def radar_drive(foto_dev: Dict[str, Any],
                proyectos_catalogo: List[str],
                excluidos: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Los proyectos del Drive con su etapa, sus documentos y si ya están en catálogo.
    `excluidos` (founder 07-15: 'Mérida y rentas no se aplica'): patrones de carpetas
    FUERA del alcance de la plataforma — se marcan, no cuentan como pendientes."""
    cat_norm = [_norm(n) for n in proyectos_catalogo]
    exc_norm = [_norm(e) for e in (excluidos or []) if e]
    out: List[Dict[str, Any]] = []
    archivos = foto_dev.get("archivos") or []
    for proyecto in (foto_dev.get("proyectos") or []):
        if proyecto == "(raíz)":
            continue
        del_proy = [a for a in archivos if a.get("proyecto") == proyecto]
        tipos: Dict[str, int] = {}
        for a in del_proy:
            t = a.get("tipo_doc") or "otro"
            tipos[t] = tipos.get(t, 0) + 1
        pn = _norm(proyecto)
        ingerido = any(c and (c in pn or pn in c) for c in cat_norm)
        fuera = any(e and e in pn for e in exc_norm)
        out.append({"proyecto": proyecto, "fuera_alcance": fuera,
                    "etapa": etapa_de_nombre(proyecto),
                    "n_archivos": len(del_proy),
                    "tiene_lista": any(a.get("es_lista") for a in del_proy),
                    "documentos": tipos,
                    "ingerido": ingerido})
    return sorted(out, key=lambda p: (p["ingerido"], p["proyecto"]))


def agregados(radar: List[Dict[str, Any]]) -> Dict[str, Any]:
    por_etapa: Dict[str, int] = {}
    for p in radar:
        k = p.get("etapa") or "sin etiqueta"
        por_etapa[k] = por_etapa.get(k, 0) + 1
    en_alcance = [p for p in radar if not p.get("fuera_alcance")]
    return {"proyectos_drive": len(radar),
            "fuera_alcance": len(radar) - len(en_alcance),
            "con_lista": sum(1 for p in en_alcance if p["tiene_lista"]),
            "sin_ingerir": sum(1 for p in en_alcance if not p["ingerido"]),
            "por_etapa": por_etapa}


async def perfil_desarrollador(db, dev_org_id: str) -> Dict[str, Any]:
    # catálogo (lo ya ingerido)
    proyectos = await db.developments.find(
        {"developer_id": dev_org_id},
        {"_id": 0, "id": 1, "name": 1, "readiness_pct": 1, "published": 1,
         "stage": 1, "salud_dato": 1}).to_list(200)
    from unidades_efectivas import unidades_efectivas
    for p in proyectos:
        us = await unidades_efectivas(db, {"development_id": p["id"]})
        vend = sum(1 for u in us if (u.get("status") or "").lower() in
                   ("vendida", "vendido", "sold"))
        p["unidades"] = len(us)
        p["colocacion_pct"] = round(vend * 100 / len(us), 1) if us else None
    # radar del Drive (vía manifiesto → foto del vigía)
    mapeo = await db.vigia_manifiesto.find_one({"dev_org_id": dev_org_id}, {"_id": 0})
    radar: List[Dict[str, Any]] = []
    if mapeo:
        foto = await db.vigia_fotos.find_one({}, {"_id": 0})
        foto_dev = ((foto or {}).get("devs") or {}).get(mapeo.get("dev_carpeta")) or {}
        radar = radar_drive(foto_dev, [p.get("name") or "" for p in proyectos],
                            excluidos=mapeo.get("excluir_proyectos") or [])
    # nombre humano del dev
    org = await db.dev_orgs.find_one({"tenant_id": dev_org_id}, {"_id": 0, "name": 1}) or \
        await db.users.find_one({"tenant_id": dev_org_id, "role": "developer_admin"},
                                {"_id": 0, "name": 1}) or {}
    # ÍNDICE DEL DEV v1: $/m² ponderado del portafolio por foto (crece con cada lista)
    from mercado_cruces import indice_dev
    dev_ids = [p["id"] for p in proyectos]
    eventos = await db.oferta_timeline.find({"dev_id": {"$in": dev_ids}},
                                            {"_id": 0, "ts": 1, "pm2": 1}).to_list(50000)
    indice = indice_dev(eventos)
    # TEMPERATURA DEL DATO: qué tan fresco nos tiene el dev
    ultima_lista = None
    if mapeo:
        foto = await db.vigia_fotos.find_one({}, {"_id": 0})
        fd = ((foto or {}).get("devs") or {}).get(mapeo.get("dev_carpeta")) or {}
        fechas = [a.get("modificado") for a in fd.get("archivos", []) if a.get("es_lista")]
        ultima_lista = max(fechas) if fechas else None
    return {"dev_org_id": dev_org_id, "nombre": org.get("name") or dev_org_id,
            "catalogo": proyectos, "radar": radar, "agregados": agregados(radar),
            "indice": indice,
            "temperatura_dato": {"ultima_lista": ultima_lista,
                                 "listas_en_drive": sum(1 for p in radar if p["tiene_lista"])}}
