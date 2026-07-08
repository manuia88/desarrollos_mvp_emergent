"""MINADOR DE HISTÓRICOS RETROACTIVOS (idea #1 founder 07-08).

Las carpetas "Versiones Antiguas" y las listas con fecha en el nombre ("PRECIOS CADIZ 15 ABRIL 24") son
UN AÑO O MÁS de historia de precios y absorción que hoy se ignora. Este minador:

  1. encuentra las listas VIEJAS de un proyecto (carpeta histórica + listas fechadas),
  2. extrae cada una (precio+estatus por unidad, misma IA de la ingesta),
  3. guarda un SNAPSHOT por fecha (db.lista_snapshots) y
  4. deriva los eventos RETRO entre snapshots consecutivos → los escribe en las MISMAS colecciones que ya
     consumen la ficha/absorción (price_events + unit_status_events, con source='retro_lista' y changed_at
     = fecha HISTÓRICA de la lista) — cero motor duplicado, los consumidores existentes lo leen sin cambios.

MODO PLAN (plan_only=True, GRATIS): solo lista candidatos + costo estimado — la extracción pagada corre
únicamente con GO explícito del founder. Idempotente: un snapshot (dev, fecha, archivo) no se re-extrae.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.historic_miner")

_HIST_FOLDER_RE = re.compile(r"(?i)versione?s?\s+antigua|old\s+version|hist[oó]rico")
_LISTA_NAME_RE = re.compile(r"(?i)precio|lista|disponib|inventar|\blp[ _]")


async def find_candidates(conn, folder_url: str, only_project: Optional[str] = None) -> List[Dict[str, Any]]:
    """Candidatos a minar: listas viejas por proyecto. GRATIS (solo listado). Devuelve
    [{project, file_id, name, fecha, origen: carpeta_historica|lista_fechada}] orden cronológico."""
    import bulk_ingest_engine as bie

    folder_id = bie.parse_folder_id(folder_url)
    files = await bie._list_folder_recursive(conn, folder_id)
    groups = bie._group_by_project(files, folder_id)

    out: List[Dict[str, Any]] = []
    for g in groups.values():
        pname = g["parent_folder_name"]
        if only_project and only_project.lower() not in (pname or "").lower():
            continue
        # (a) listas FECHADAS dentro del proyecto (la más nueva es la vigente → las demás son historia)
        fechadas = []
        for f in g["files"]:
            nm = f.get("name") or ""
            if _LISTA_NAME_RE.search(nm.lower()):
                fecha = bie._fecha_de_nombre(nm)
                if fecha:
                    fechadas.append({"project": pname, "file_id": f["id"], "name": nm,
                                     "fecha": fecha, "origen": "lista_fechada"})
        fechadas.sort(key=lambda x: x["fecha"])
        out.extend(fechadas[:-1])   # todas menos la vigente

    # (b) carpetas HISTÓRICAS a nivel raíz (el lister normal las salta a propósito) — walk propio sin skip
    from drive_engine import _drive_service as _svc_f
    _svc = None

    def _ls(fid: str):
        nonlocal _svc
        if _svc is None:
            _svc = _svc_f(conn)
        out, tok = [], None
        while True:
            r = _svc.files().list(q=f"'{fid}' in parents and trashed = false",
                                  fields="nextPageToken,files(id,name,mimeType)", pageSize=200,
                                  supportsAllDrives=True, includeItemsFromAllDrives=True,
                                  pageToken=tok).execute()
            out += r.get("files", [])
            tok = r.get("nextPageToken")
            if not tok:
                return out

    def _walk_hist(fid: str, base: str) -> List[Dict[str, Any]]:
        from bulk_ingest_engine import FOLDER_MIME
        res = []
        try:
            for it in _ls(fid):
                nm = it.get("name") or ""
                if it.get("mimeType") == FOLDER_MIME:
                    res.extend(_walk_hist(it["id"], f"{base}/{nm}"))
                elif _LISTA_NAME_RE.search(nm.lower()):
                    res.append({"file_id": it["id"], "name": nm, "carpeta": base,
                                "fecha": bie._fecha_de_nombre(nm)})
        except Exception as e:  # noqa: BLE001
            log.warning(f"[miner] walk hist {base}: {e}")
        return res

    root_items = await asyncio.to_thread(_ls, folder_id)
    for it in root_items:
        if _HIST_FOLDER_RE.search(it.get("name") or ""):
            hist = await asyncio.to_thread(_walk_hist, it["id"], it.get("name") or "hist")
            for h in hist:
                # el proyecto se infiere de la subcarpeta dentro de la histórica (o del nombre del archivo)
                proj = (h.get("carpeta") or "").split("/")[-1] or h["name"]
                if only_project and only_project.lower() not in (proj + " " + h["name"]).lower():
                    continue
                out.append({"project": proj, "file_id": h["file_id"], "name": h["name"],
                            "fecha": h.get("fecha"), "origen": "carpeta_historica"})
    return out


async def mine(db, conn, folder_url: str, only_project: Optional[str] = None,
               plan_only: bool = True, max_listas: int = 12) -> Dict[str, Any]:
    """Mina las listas viejas → snapshots + eventos retro. plan_only=True (default) NO gasta IA."""
    import bulk_ingest_engine as bie

    cands = await find_candidates(conn, folder_url, only_project)
    # idempotencia: fuera los ya minados
    nuevos = []
    for c in cands:
        ya = await db.lista_snapshots.find_one({"file_id": c["file_id"]}, {"_id": 0, "file_id": 1})
        if not ya:
            nuevos.append(c)
    plan = {"candidatos": len(cands), "nuevos": len(nuevos),
            "costo_estimado_mxn": round(len(nuevos[:max_listas]) * 0.6, 1),
            "muestras": [{k: c[k] for k in ("project", "name", "fecha", "origen")} for c in nuevos[:15]]}
    if plan_only:
        return {"plan": plan, "ejecutado": False}

    minados = eventos_p = eventos_v = 0
    por_dev: Dict[str, List[Dict[str, Any]]] = {}
    for c in nuevos[:max_listas]:
        try:
            data, mime = await bie._download_file_bytes(conn, c["file_id"], "")
            ex, _cost = await bie.extract_bulk_project(c["project"], [(data, mime or "application/pdf", c["name"])])
            units = [{"unit_number": u.get("unit_number"), "price": u.get("price_mxn"),
                      "status": u.get("status") or "disponible"}
                     for u in (ex.get("units") or []) if u.get("unit_number")]
            if not units:
                continue
            snap = {"dev_name": c["project"], "fecha": c["fecha"], "file_id": c["file_id"],
                    "source_file": c["name"], "units": units, "retro": True, "minado_at": bie._iso()}
            # liga al dev REAL si existe (por nombre)
            dev = await db.developments.find_one(
                {"name": {"$regex": re.escape(c["project"].split("(")[0].strip()[:18]), "$options": "i"}},
                {"_id": 0, "id": 1})
            if dev:
                snap["dev_id"] = dev["id"]
            await db.lista_snapshots.insert_one(dict(snap))
            minados += 1
            por_dev.setdefault(snap.get("dev_id") or c["project"], []).append(snap)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[miner] {c['name']}: {e}")

    # eventos RETRO entre snapshots consecutivos (cronológico) — a las colecciones EXISTENTES
    for dev_key, snaps in por_dev.items():
        todos = [s async for s in db.lista_snapshots.find(
            {"$or": [{"dev_id": dev_key}, {"dev_name": dev_key}]}, {"_id": 0})]
        todos.sort(key=lambda s: s.get("fecha") or "")
        for prev, cur in zip(todos, todos[1:]):
            prev_u = {bie._unit_identity(u["unit_number"]): u for u in prev["units"]}
            cur_u = {bie._unit_identity(u["unit_number"]): u for u in cur["units"]}
            for k, pu in prev_u.items():
                cu = cur_u.get(k)
                dev_id = cur.get("dev_id") or dev_key
                if cu and pu.get("price") and cu.get("price") and pu["price"] != cu["price"]:
                    ya = await db.price_events.find_one({"dev_id": dev_id, "unit_number": pu["unit_number"],
                                                         "changed_at": cur["fecha"], "source": "retro_lista"})
                    if not ya:
                        await db.price_events.insert_one({
                            "dev_id": dev_id, "unit_number": pu["unit_number"],
                            "old_price": pu["price"], "new_price": cu["price"],
                            "delta_pct": round((cu["price"] / pu["price"] - 1) * 100, 2),
                            "changed_at": cur["fecha"], "source": "retro_lista",
                            "label": f"Δ lista {prev.get('fecha')}→{cur.get('fecha')}"})
                        eventos_p += 1
                elif not cu:   # desapareció de la lista siguiente → vendida en ese intervalo
                    ya = await db.unit_status_events.find_one({"dev_id": dev_id, "unit_number": pu["unit_number"],
                                                               "changed_at": cur["fecha"], "source": "retro_lista"})
                    if not ya:
                        await db.unit_status_events.insert_one({
                            "dev_id": dev_id, "unit_number": pu["unit_number"],
                            "old_status": pu.get("status") or "disponible", "new_status": "vendido",
                            "changed_at": cur["fecha"], "sold_at": cur["fecha"],
                            "price": pu.get("price"), "source": "retro_lista",
                            "nota": f"ausente en lista {cur.get('fecha')}"})
                        eventos_v += 1

    return {"plan": plan, "ejecutado": True, "listas_minadas": minados,
            "eventos_precio_retro": eventos_p, "ventas_retro": eventos_v}
