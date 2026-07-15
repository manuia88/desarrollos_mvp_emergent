"""EL VIGÍA — rondas cada hora sobre la carpeta maestra del founder (accesos directos a devs).

Cómo funciona (lenguaje founder): un robot toma una FOTO de qué carpetas y archivos hay (solo
nombres, fechas y huella — CERO descarga, CERO IA, costo $0), la compara contra la foto anterior
y convierte las diferencias en: (a) EVENTOS con linaje completo (el ADN del dato: qué archivo,
qué huella, qué dev, qué proyecto, cuándo) y (b) PENDIENTES accionables en la bandeja
(dev nuevo · proyecto nuevo · lista nueva/cambiada · acceso roto). Nada se ingiere sin aprobar.

Universalidad: `vigia_fuentes` es un REGISTRO — hoy tipo 'drive_master'; mañana correo o
Salesforce = un renglón nuevo con otro `tipo`, mismo ciclo foto→diff→bandeja.

Colecciones: vigia_fuentes · vigia_fotos (última por fuente) · vigia_eventos (linaje, append-only)
· vigia_pendientes (bandeja).
"""
from __future__ import annotations

import os
import re
import secrets
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.vigia")

FOLDER_MIME = "application/vnd.google-apps.folder"
# ¿Este archivo parece una LISTA DE PRECIOS/disponibilidad? (nombre + tipo)
_LISTA_NOMBRE = re.compile(r"lista|precio|price|disponib|inventario|avail|stock", re.I)
_LISTA_MIMES = ("spreadsheet", "excel", "sheet", "csv", "pdf")

# Tipos de evento que SÍ van a la bandeja (accionables). El resto queda solo como linaje.
TIPOS_ACCIONABLES = {"dev_nuevo", "proyecto_nuevo", "lista_nueva", "lista_cambiada", "acceso_roto"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _es_lista(nombre: str, mime: str) -> bool:
    return bool(_LISTA_NOMBRE.search(nombre or "")) and any(m in (mime or "") for m in _LISTA_MIMES)


# ─── ESCANEO (metadata pura — $0) ─────────────────────────────────────────────
async def escanear_fuente(db, fuente: Dict[str, Any]) -> Dict[str, Any]:
    """Toma la FOTO de una fuente drive_master: cada hijo de la carpeta maestra (acceso directo o
    carpeta) = un DEV; de cada dev se lista el árbol completo (metadata) y se resume por proyecto."""
    import bulk_ingest_engine as bie
    conn = await bie._resolve_drive_conn(db, None)
    if not conn:
        raise RuntimeError("sin_conexion_drive")

    hijos = await bie.list_folder_children(conn, fuente["folder_id"])
    devs: Dict[str, Any] = {}
    for h in hijos:
        if h.get("mimeType") != FOLDER_MIME:
            continue                       # solo carpetas (reales o shortcuts ya resueltos)
        nombre_dev = (h.get("name") or "").strip()
        if not nombre_dev:
            continue
        entrada: Dict[str, Any] = {"folder_id": h["id"], "ok": True, "proyectos": [], "archivos": [],
                                   "via_shortcut": bool(h.get("_via_shortcut"))}
        try:
            files = await bie._list_folder_recursive(conn, h["id"])
            entrada["proyectos"] = sorted({f.get("parent_folder_name") or "(raíz)" for f in files
                                           if f.get("parent_folder_name")})
            entrada["archivos"] = [{
                "id": f.get("id"), "nombre": f.get("name") or "",
                "proyecto": f.get("parent_folder_name") or "(raíz)",
                "carpeta": f.get("immediate_folder") or "",
                "mime": f.get("mimeType") or "",
                "huella": bie._huella(f),
                "modificado": f.get("modifiedTime") or "",
                "es_lista": _es_lista(f.get("name") or "", f.get("mimeType") or ""),
            } for f in files]
        except Exception as e:  # noqa: BLE001 — un dev roto no tira la ronda
            log.warning(f"[vigia] dev '{nombre_dev}' ilegible: {str(e)[:120]}")
            entrada["ok"] = False
        devs[nombre_dev] = entrada
    return {"fuente_id": fuente["id"], "ts": _now_iso(), "devs": devs}


# ─── DIFF (puro, sin I/O — aquí viven los tests) ──────────────────────────────
def diff_fotos(prev: Optional[Dict[str, Any]], nueva: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Compara dos fotos y devuelve EVENTOS. Reglas:
    - dev nuevo → 1 evento resumen (NO un evento por archivo: su primera foto es la línea base).
    - dev que ya no se puede leer o desapareció → acceso_roto.
    - proyecto (subcarpeta 1er nivel) nuevo → proyecto_nuevo.
    - archivo nuevo/cambiado (por HUELLA, no por fecha de shortcut) → lista_* si parece lista
      de precios; si no, archivo_* (solo linaje, sin bandeja). Eliminado → archivo_eliminado."""
    eventos: List[Dict[str, Any]] = []
    prev_devs = (prev or {}).get("devs", {}) or {}

    for dev, d in (nueva.get("devs") or {}).items():
        pd = prev_devs.get(dev)
        if pd is None:
            eventos.append({"tipo": "dev_nuevo", "dev": dev,
                            "detalle": {"proyectos": d.get("proyectos", []),
                                        "n_archivos": len(d.get("archivos", []))}})
            continue
        if not d.get("ok"):
            # 2 strikes: la primera falla es solo linaje (fallo_transitorio); la segunda alarma
            if int(d.get("fails") or 1) >= 2 and int(pd.get("fails") or 0) < 2:
                eventos.append({"tipo": "acceso_roto", "dev": dev})
            else:
                eventos.append({"tipo": "fallo_transitorio", "dev": dev})
            continue

        for p in d.get("proyectos", []):
            if p != "(raíz)" and p not in (pd.get("proyectos") or []):
                eventos.append({"tipo": "proyecto_nuevo", "dev": dev, "proyecto": p})

        prev_files = {f["id"]: f for f in (pd.get("archivos") or [])}
        ids_ahora = set()
        for f in d.get("archivos", []):
            ids_ahora.add(f["id"])
            pf = prev_files.get(f["id"])
            if pf is None:
                tipo = "lista_nueva" if f["es_lista"] else "archivo_nuevo"
                eventos.append({"tipo": tipo, "dev": dev, "proyecto": f["proyecto"], "archivo": f})
            elif pf.get("huella") != f.get("huella"):
                tipo = "lista_cambiada" if f["es_lista"] else "archivo_cambiado"
                eventos.append({"tipo": tipo, "dev": dev, "proyecto": f["proyecto"], "archivo": f,
                                "antes": {"huella": pf.get("huella"),
                                          "modificado": pf.get("modificado")}})
        for fid, pf in prev_files.items():
            if fid not in ids_ahora:
                eventos.append({"tipo": "archivo_eliminado", "dev": dev,
                                "proyecto": pf.get("proyecto"), "archivo": pf})

    for dev in prev_devs:
        if dev not in (nueva.get("devs") or {}):
            eventos.append({"tipo": "acceso_roto", "dev": dev})
    return eventos


def _clave_pendiente(ev: Dict[str, Any]) -> str:
    """Clave de dedupe: el mismo hallazgo no debe crear 2 pendientes mientras siga sin resolver."""
    if ev["tipo"] == "dev_nuevo":
        return f"dev::{ev['dev']}"
    if ev["tipo"] == "proyecto_nuevo":
        return f"proj::{ev['dev']}::{ev.get('proyecto')}"
    if ev["tipo"] == "acceso_roto":
        return f"roto::{ev['dev']}"
    a = ev.get("archivo") or {}
    return f"file::{a.get('id')}::{a.get('huella')}"


# ─── RONDA (orquesta: escanear → diff → persistir → notificar) ────────────────
async def ronda(db, fuente_id: Optional[str] = None, notificar: bool = True) -> Dict[str, Any]:
    q: Dict[str, Any] = {"activa": True}
    if fuente_id:
        q["id"] = fuente_id
    fuentes = await db.vigia_fuentes.find(q, {"_id": 0}).to_list(50)
    resumen = {"ts": _now_iso(), "fuentes": len(fuentes), "eventos": 0, "pendientes_nuevos": 0,
               "por_tipo": {}, "errores": []}

    for fuente in fuentes:
        try:
            nueva = await escanear_fuente(db, fuente)
        except Exception as e:  # noqa: BLE001
            resumen["errores"].append({"fuente": fuente["id"], "error": str(e)[:200]})
            continue
        prev = await db.vigia_fotos.find_one({"fuente_id": fuente["id"]}, {"_id": 0})
        # ANTI-FALSA-ALARMA (founder 07-14: el token OAuth murió y alarmó a la primera): un dev
        # ilegible hereda el contador de fallas; acceso_roto solo se dispara en la 2ª consecutiva.
        prev_devs = (prev or {}).get("devs", {}) or {}
        for _dev, _d in (nueva.get("devs") or {}).items():
            if not _d.get("ok"):
                _d["fails"] = int((prev_devs.get(_dev) or {}).get("fails") or 0) + 1
        eventos = diff_fotos(prev, nueva)

        # persistir linaje (append-only, hipersegmentado)
        for ev in eventos:
            resumen["por_tipo"][ev["tipo"]] = resumen["por_tipo"].get(ev["tipo"], 0) + 1
            await db.vigia_eventos.insert_one({
                "id": f"vev_{secrets.token_urlsafe(8)}", "fuente_id": fuente["id"],
                "ts": nueva["ts"], **ev,
            })
        resumen["eventos"] += len(eventos)

        # bandeja (solo accionables, con dedupe contra pendientes sin resolver)
        for ev in eventos:
            if ev["tipo"] not in TIPOS_ACCIONABLES:
                continue
            clave = _clave_pendiente(ev)
            ya = await db.vigia_pendientes.find_one({"clave": clave, "estado": "pendiente"})
            if ya:
                continue
            dev_meta = (nueva.get("devs") or {}).get(ev.get("dev"), {})
            await db.vigia_pendientes.insert_one({
                "id": f"vp_{secrets.token_urlsafe(8)}", "clave": clave, "estado": "pendiente",
                "fuente_id": fuente["id"], "tipo": ev["tipo"], "dev": ev.get("dev"),
                "proyecto": ev.get("proyecto"), "archivo": ev.get("archivo"),
                "detalle": ev.get("detalle"), "antes": ev.get("antes"),
                "dev_folder_id": dev_meta.get("folder_id"),
                "created_at": _now_iso(), "resuelto_at": None, "resuelto_por": None,
            })
            resumen["pendientes_nuevos"] += 1

        # AUTO-RESOLUCIÓN: si un dev volvió a leerse bien, su pendiente de "perdí acceso"
        # se cierra solo (y queda el evento acceso_restaurado en el linaje).
        for _dev, _d in (nueva.get("devs") or {}).items():
            if not _d.get("ok"):
                continue
            r = await db.vigia_pendientes.update_many(
                {"clave": f"roto::{_dev}", "estado": "pendiente"},
                {"$set": {"estado": "resuelto", "resuelto_at": _now_iso(),
                          "resuelto_por": "vigia_auto", "razon": "acceso restaurado"}})
            if r.modified_count:
                await db.vigia_eventos.insert_one({
                    "id": f"vev_{secrets.token_urlsafe(8)}", "fuente_id": fuente["id"],
                    "ts": nueva["ts"], "tipo": "acceso_restaurado", "dev": _dev})
                resumen["por_tipo"]["acceso_restaurado"] = \
                    resumen["por_tipo"].get("acceso_restaurado", 0) + 1

        # la foto nueva reemplaza a la anterior (el linaje ya quedó en eventos)
        await db.vigia_fotos.update_one({"fuente_id": fuente["id"]},
                                        {"$set": nueva}, upsert=True)
        await db.vigia_fuentes.update_one({"id": fuente["id"]},
                                          {"$set": {"last_ronda_at": nueva["ts"],
                                                    "last_resumen": {k: v for k, v in resumen.items()
                                                                     if k != "errores"}}})

    if notificar and resumen["pendientes_nuevos"] > 0:
        await _notificar(db, resumen)
    if notificar and resumen["por_tipo"].get("acceso_restaurado"):
        # cerrar el ciclo de la alarma: si te avisé que perdí acceso, te aviso que volvió
        try:
            from telegram_bot import get_config, _tg
            cfg = await get_config(db)
            if cfg.get("chat_id"):
                await _tg("sendMessage", {"chat_id": cfg["chat_id"],
                                          "text": "✅ Acceso restaurado — vuelvo a ver las carpetas. El pendiente rojo se cerró solo."})
        except Exception:  # noqa: BLE001 — avisar nunca tira la ronda
            pass
    return resumen


async def _notificar(db, resumen: Dict[str, Any]) -> None:
    """Campana del superadmin + correo directo al founder. Solo cuando HAY pendientes (cero spam)."""
    partes = [f"{n} {t.replace('_', ' ')}" for t, n in resumen["por_tipo"].items()
              if t in TIPOS_ACCIONABLES]
    titulo = f"Vigía: {resumen['pendientes_nuevos']} pendiente(s) por aprobar"
    cuerpo = ("La ronda encontró: " + " · ".join(partes) +
              ". Entra a la bandeja para aprobar o rechazar.") if partes else titulo
    url = "/superadmin/alta?tab=vigia"
    try:
        superadmin = await db.users.find_one({"role": "superadmin"}, {"_id": 0, "user_id": 1})
        if superadmin:
            from notifications_engine import emit_notification
            await emit_notification(db, user_id=superadmin["user_id"], type="generic",
                                    severity="high", title=titulo, body=cuerpo,
                                    action_url=url, channels=["in_app"])
    except Exception as e:  # noqa: BLE001
        log.warning(f"[vigia] campana falló: {e}")
    try:
        correo = os.environ.get("VIGIA_NOTIFY_EMAIL") or os.environ.get("ADMIN_EMAIL")
        if correo:
            from notifications_engine import _send_email_notification
            await _send_email_notification(correo, titulo, cuerpo,
                                           (os.environ.get("FRONTEND_URL") or "") + url)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[vigia] correo falló: {e}")
    # Telegram: tarjetas de decisión con contexto (fail-soft si el bot no está vinculado)
    try:
        from telegram_bot import notificar_pendientes
        await notificar_pendientes(db)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[vigia] telegram falló: {e}")


# ─── EL MANIFIESTO: carpeta del founder → dev de la plataforma + su patrón ────
# Responde "¿cómo sabe el sistema que DESARROLLOS-CLASS es 'class' y Almina es su proyecto?":
# NO adivina — TÚ lo declaras UNA vez y queda. Sin mapeo, la aprobación se niega (nada cae al
# costal genérico superadmin_global). El patrón (notas de cómo trabaja ese dev) alimenta al
# RECON de la ingesta vía extraction_profiles (la huella que ya existía).
async def mapear_dev(db, fuente_id: str, dev_carpeta: str, dev_org_id: str,
                     dev_folder_id: str = "", patron_notas: str = "") -> Dict[str, Any]:
    doc = {"fuente_id": fuente_id, "dev_carpeta": dev_carpeta, "dev_org_id": dev_org_id,
           "dev_folder_id": dev_folder_id, "patron_notas": patron_notas[:1500],
           "updated_at": _now_iso()}
    await db.vigia_manifiesto.update_one(
        {"fuente_id": fuente_id, "dev_carpeta": dev_carpeta}, {"$set": doc}, upsert=True)
    # las notas del founder viajan al RECON por la huella existente (extraction_profiles)
    if dev_folder_id and patron_notas:
        await db.extraction_profiles.update_one(
            {"folder_key": dev_folder_id},
            {"$set": {"notas_founder": patron_notas[:1500], "updated_at": _now_iso()}},
            upsert=True)
    return doc


async def _dev_org_de(db, fuente_id: str, dev_carpeta: str) -> Optional[str]:
    m = await db.vigia_manifiesto.find_one(
        {"fuente_id": fuente_id, "dev_carpeta": dev_carpeta}, {"_id": 0, "dev_org_id": 1})
    return (m or {}).get("dev_org_id")


# ─── APROBAR / RECHAZAR (la única puerta que gasta: tu clic) ─────────────────
async def aprobar_pendiente(db, pendiente_id: str, user_id: str) -> Dict[str, Any]:
    p = await db.vigia_pendientes.find_one({"id": pendiente_id, "estado": "pendiente"}, {"_id": 0})
    if not p:
        raise ValueError("Pendiente no encontrado o ya resuelto")

    resultado: Dict[str, Any] = {"accion": "archivado"}
    if p["tipo"] in ("proyecto_nuevo", "lista_nueva", "lista_cambiada", "dev_nuevo") and p.get("dev_folder_id"):
        # identidad primero: sin mapeo en el manifiesto NO se ingiere (nada al costal genérico)
        dev_org = await _dev_org_de(db, p["fuente_id"], p.get("dev") or "")
        if not dev_org:
            raise LookupError(f"Mapea primero '{p.get('dev')}' en el manifiesto "
                              f"(¿a qué desarrollador de la plataforma corresponde?)")
        # tu clic ES la aprobación de gasto: arranca la ingesta del proyecto (o del dev completo)
        import asyncio
        import bulk_ingest_engine as bie
        job_id = f"bij_{secrets.token_urlsafe(10)}"
        await db.bulk_ingest_jobs.insert_one({
            "id": job_id,
            "drive_folder_url": f"https://drive.google.com/drive/folders/{p['dev_folder_id']}",
            "target_dev_org_id": dev_org, "dry_run": False,
            "only_project": (p.get("proyecto") if p["tipo"] != "dev_nuevo"
                             and p.get("proyecto") not in (None, "", "(raíz)") else None),
            "status": "pending", "items_total": 0, "items_auto_approved": 0,
            "items_pending_review": 0, "items_rejected": 0, "items_failed": 0,
            "started_at": _now_iso(), "completed_at": None,
            "started_by": user_id, "error_log": [],
            # nota: only_project se limpia abajo — "(raíz)" no es carpeta real (archivo suelto
            # en la raíz del dev, p.ej. un Sheets con varios desarrollos) → se ingiere el dev entero
            "origen": {"via": "vigia", "pendiente_id": pendiente_id,   # ← linaje end-to-end
                       "archivo": p.get("archivo"), "dev": p.get("dev")},
        })
        asyncio.create_task(bie.run(db, job_id))
        resultado = {"accion": "ingesta_disparada", "job_id": job_id}

    await db.vigia_pendientes.update_one(
        {"id": pendiente_id},
        {"$set": {"estado": "aprobado", "resuelto_at": _now_iso(), "resuelto_por": user_id,
                  "resultado": resultado}})
    return resultado


async def rechazar_pendiente(db, pendiente_id: str, user_id: str, razon: str = "") -> None:
    r = await db.vigia_pendientes.update_one(
        {"id": pendiente_id, "estado": "pendiente"},
        {"$set": {"estado": "rechazado", "resuelto_at": _now_iso(), "resuelto_por": user_id,
                  "razon": razon[:300]}})
    if not r.matched_count:
        raise ValueError("Pendiente no encontrado o ya resuelto")
