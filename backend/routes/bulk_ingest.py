"""W1.4 ZZ.1 — Bulk Drive Ingestion Routes.

Prefix: /api/superadmin/bulk-ingest · all require_superadmin.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Literal

from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File, Form
from pydantic import BaseModel, Field

import bulk_ingest_engine as bie

# tipos que la IA puede leer (PDF/XLS/imágenes) — mismo set que la ingesta Drive
_UPLOAD_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel", "text/csv",
    "image/jpeg", "image/png", "image/webp",
}
_UPLOAD_MAX_FILES = 12
_UPLOAD_MAX_MB = 25

log = logging.getLogger("dmx.routes_bulk_ingest")

router = APIRouter(tags=["superadmin_bulk_ingest"])
PREFIX = "/api/superadmin/bulk-ingest"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db(request: Request):
    return request.app.state.db


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────

class StartBody(BaseModel):
    drive_folder_url: str
    target_dev_org_id: Optional[str] = None
    dry_run: bool = False              # SIMULACRO: analiza y extrae sin escribir a la plataforma
    only_project: Optional[str] = None # filtra a UN proyecto (substring del nombre de carpeta)


class RejectBody(BaseModel):
    reason: str = Field(..., max_length=500)


class MergeBody(BaseModel):
    target_dev_id: str


class PatchItemBody(BaseModel):
    patch: Dict[str, Any]


class ForceMatchBody(BaseModel):
    target_dev_id: str
    mode: Literal["merge", "approve_as_new"] = "merge"


class MineHistoryBody(BaseModel):
    drive_folder_url: str
    only_project: Optional[str] = None
    execute: bool = False              # False = PLAN gratis (default) · True = minado pagado (GO explícito)
    max_listas: int = Field(12, ge=1, le=30)


# ─── 0.5) POST /mine-history · MINADOR DE HISTÓRICOS RETRO (idea #1 founder) ─────────────────
# Las listas VIEJAS del drive ("Versiones Antiguas", listas fechadas) son historia de precios y
# ventas que hoy se tira. execute=False (default) = plan GRATIS; execute=True SOLO con GO del founder.

@router.post(PREFIX + "/mine-history")
async def mine_history(body: MineHistoryBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    conn = await bie._resolve_drive_conn(db, None)
    if not conn:
        raise HTTPException(400, "Sin conexión a Drive (OAuth o GOOGLE_DRIVE_API_KEY)")
    from historic_miner import mine
    res = await mine(db, conn, body.drive_folder_url, only_project=body.only_project,
                     plan_only=not body.execute, max_listas=body.max_listas)
    if body.execute:
        try:
            from audit_log import log_mutation
            await log_mutation(db, user, "mine_history", "bulk_ingest", body.drive_folder_url,
                               before=None, after=res, request=request)
        except Exception as _e:
            log.warning("[audit] log_mutation perdido (mine_history): %s", _e)
    return res


# ─── 1) POST /start ───────────────────────────────────────────────────────────

@router.post(PREFIX + "/estimate")
async def estimate_job(body: StartBody, request: Request):
    """COSTO ESTIMADO antes de correr (upgrade #2): lista el Drive (GRATIS, cero tokens) y devuelve el
    costo esperado + rango + desglose por proyecto, para aprobar con un número en vez de a ciegas."""
    await _require_superadmin(request)
    db = _db(request)
    folder_id = bie.parse_folder_id(body.drive_folder_url)
    if not folder_id:
        raise HTTPException(400, "La estimación de costo solo aplica a carpetas de Drive")
    conn = await bie._resolve_drive_conn(db, body.target_dev_org_id)
    if not conn:
        raise HTTPException(409, "No hay conexión Drive activa. Conecta Drive primero.")
    files = await bie._list_folder_recursive(conn, folder_id)
    groups = bie._group_by_project(files, folder_id)
    if body.only_project:
        filtros = [p.strip().lower() for p in body.only_project.split("|") if p.strip()]
        groups = {k: g for k, g in groups.items()
                  if any(f in (g.get("parent_folder_name") or "").lower() for f in filtros)}
    return bie.estimate_job_cost(files, groups)


@router.post(PREFIX + "/start")
async def start_job(body: StartBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)

    from dropbox_source import is_dropbox_url
    _ok_url = (bie.parse_folder_id(body.drive_folder_url) or bie.parse_drive_file_id(body.drive_folder_url)
               or is_dropbox_url(body.drive_folder_url))
    if not _ok_url:
        raise HTTPException(400, "URL no reconocida (carpeta Drive, archivo Sheets o share de Dropbox)")

    # Verify drive connection available
    conn = await bie._resolve_drive_conn(db, body.target_dev_org_id)
    if not conn:
        raise HTTPException(409, "No hay conexión Drive activa. Conecta Drive primero.")

    job_id = f"bij_{secrets.token_urlsafe(10)}"
    job_doc = {
        "id": job_id,
        "drive_folder_url": body.drive_folder_url,
        "target_dev_org_id": body.target_dev_org_id,
        "dry_run": bool(body.dry_run),
        "only_project": body.only_project,
        "status": "pending",
        "items_total": 0,
        "items_auto_approved": 0,
        "items_pending_review": 0,
        "items_rejected": 0,
        "items_failed": 0,
        "started_at": _now_iso(),
        "completed_at": None,
        "started_by": user.user_id,
        "error_log": [],
    }
    await db.bulk_ingest_jobs.insert_one(dict(job_doc))

    # Background task — DO NOT await (don't block response)
    asyncio.create_task(bie.run(db, job_id))

    # Best-effort estimate (don't list synchronously here; let pipeline discover)
    return {"job_id": job_id, "estimated_files_count": None, "status": "pending"}


@router.post(PREFIX + "/upload")
async def upload_job(request: Request,
                     files: list[UploadFile] = File(...),
                     project_name: str = Form(""),
                     target_dev_org_id: str = Form("")):
    """UPLOAD DIRECTO (sin Drive): sube PDF/XLS/imágenes de la ficha de UN proyecto → la IA
    extrae y llena los campos → cola de revisión (misma que la ingesta Drive). Un batch = un
    proyecto. Reusa toda la tubería (extract_bulk_project + dedup + insert_extracted_project)."""
    user = await _require_superadmin(request)
    db = _db(request)
    if not files:
        raise HTTPException(400, "Sube al menos un archivo")
    if len(files) > _UPLOAD_MAX_FILES:
        raise HTTPException(400, f"Máximo {_UPLOAD_MAX_FILES} archivos por proyecto")
    payloads = []
    for f in files:
        data = await f.read()
        if len(data) > _UPLOAD_MAX_MB * 1024 * 1024:
            raise HTTPException(400, f"'{f.filename}' pasa de {_UPLOAD_MAX_MB}MB")
        mime = f.content_type or ""
        if mime not in _UPLOAD_MIMES and not (f.filename or "").lower().endswith((".pdf", ".xlsx", ".xls", ".csv", ".jpg", ".jpeg", ".png", ".webp")):
            continue   # ignora tipos que la IA no lee (no revienta el batch)
        payloads.append((data, mime or "application/octet-stream", f.filename or "archivo"))
    if not payloads:
        raise HTTPException(400, "Ningún archivo legible (usa PDF, XLS/CSV o imágenes)")

    job_id = f"bij_{secrets.token_urlsafe(10)}"
    hint = (project_name or "").strip() or (files[0].filename or "Proyecto").rsplit(".", 1)[0]
    await db.bulk_ingest_jobs.insert_one({
        "id": job_id, "source": "upload", "project_name": hint,
        "target_dev_org_id": target_dev_org_id or None, "status": "extracting",
        "items_total": 0, "started_at": _now_iso(), "started_by": user.user_id, "error_log": [],
    })
    asyncio.create_task(bie.ingest_uploaded_files(db, job_id, hint, payloads, target_dev_org_id or None))
    return {"job_id": job_id, "files": len(payloads), "status": "extracting"}


# ─── 2) GET /jobs ─────────────────────────────────────────────────────────────

@router.get(PREFIX + "/jobs")
async def list_jobs(
    request: Request,
    status: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    q: Dict[str, Any] = {}
    if status and status != "all":
        q["status"] = status
    total = await db.bulk_ingest_jobs.count_documents(q)
    cursor = db.bulk_ingest_jobs.find(q, {"_id": 0}).sort("started_at", -1).skip(skip).limit(limit)
    items = [j async for j in cursor]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── 3) GET /jobs/{job_id} ────────────────────────────────────────────────────

@router.get(PREFIX + "/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)
    job = await db.bulk_ingest_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job no encontrado")
    cursor = db.bulk_ingest_items.find(
        {"job_id": job_id}, {"_id": 0},
    ).sort("created_at", -1).limit(50)
    last_items = [i async for i in cursor]
    return {**job, "last_items": last_items}


# ─── 4) GET /jobs/{job_id}/items ──────────────────────────────────────────────

@router.get(PREFIX + "/jobs/{job_id}/items")
async def list_items(
    job_id: str,
    request: Request,
    decision: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)
    q: Dict[str, Any] = {"job_id": job_id}
    if decision and decision != "all":
        q["decision"] = decision
    total = await db.bulk_ingest_items.count_documents(q)
    cursor = db.bulk_ingest_items.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = [i async for i in cursor]
    # upgrade #3: cada item que NO se auto-aprobó trae su LISTA DE PENDIENTES accionable (qué revisar)
    for it in items:
        if it.get("decision") not in ("approved", "merged"):
            try:
                it["punchlist"] = bie.review_punchlist(it)
            except Exception:  # noqa: BLE001
                it["punchlist"] = []
            # EL PORTÓN (07-15): el lote llega pre-auditado — apruebas sabiendo qué viene
            try:
                from auditor_catalogo import pre_auditar_extraccion
                it["pre_auditoria"] = pre_auditar_extraccion(bie.effective_extracted(it))
            except Exception:  # noqa: BLE001
                it["pre_auditoria"] = None
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ─── 5) POST /items/{item_id}/approve ─────────────────────────────────────────

@router.post(PREFIX + "/items/{item_id}/approve")
async def approve_item(item_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    if item.get("decision") in {"approved", "merged"}:
        return {"ok": True, "already": item["decision"], "dev_id": item.get("inserted_dev_id")}

    try:
        dev_id = await bie.insert_extracted_project(db, item)
    except Exception as e:
        raise HTTPException(500, f"Error al insertar: {e}") from e

    now = _now_iso()
    await db.bulk_ingest_items.update_one(
        {"id": item_id},
        {"$set": {"decision": "approved", "inserted_dev_id": dev_id,
                  "reviewer_user_id": user.user_id, "decision_at": now}},
    )
    await db.bulk_ingest_jobs.update_one(
        {"id": item["job_id"]},
        {"$inc": {"items_auto_approved": 1, "items_pending_review": -1}},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "approve", "bulk_ingest_item", item_id,
                           before=None, after={"dev_id": dev_id}, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_item/%s approve): %s", item_id, _e)
    # PROTOTIPOS v2: tras aprobar, re-derivar los prototipos del catálogo (código puro, $0;
    # fire-and-forget para no bloquear la respuesta). El marketplace recibe dmx_prototypes frescos.
    try:
        import asyncio as _aio
        _aio.create_task(_materializa_y_coteja(db))
    except Exception as _e:
        log.warning("[prototipos] rederivar post-approve falló: %s", _e)
    return {"ok": True, "dev_id": dev_id}



async def _materializa_y_coteja(db):
    """Conciliar moldes y re-cotejar fuentes tras aprobar — el orden importa
    (el cotejo lee los moldes recién conciliados). Fail-soft: nada bloquea la ingesta."""
    import prototype_engine as _pe
    await _pe.materializar_todos(db)
    try:
        import cotejo_engine as _ce
        await _ce.cotejar_todos(db)
    except Exception:  # noqa: BLE001
        pass
    try:
        from auditor_catalogo import auditar
        await auditar(db)
    except Exception:  # noqa: BLE001
        pass


# ─── 6) POST /items/{item_id}/reject ──────────────────────────────────────────

@router.post(PREFIX + "/items/{item_id}/reject")
async def reject_item(item_id: str, body: RejectBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    if item.get("decision") == "rejected":
        return {"ok": True, "already_rejected": True}
    now = _now_iso()
    await db.bulk_ingest_items.update_one(
        {"id": item_id},
        {"$set": {"decision": "rejected", "reject_reason": body.reason,
                  "reviewer_user_id": user.user_id, "decision_at": now}},
    )
    await db.bulk_ingest_jobs.update_one(
        {"id": item["job_id"]},
        {"$inc": {"items_rejected": 1, "items_pending_review": -1}},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "reject", "bulk_ingest_item", item_id,
                           before=None, after={"reason": body.reason}, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_item/%s reject): %s", item_id, _e)
    return {"ok": True}


# ─── 7) POST /items/{item_id}/merge ───────────────────────────────────────────

@router.post(PREFIX + "/items/{item_id}/merge")
async def merge_item(item_id: str, body: MergeBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    target = await db.developments.find_one({"id": body.target_dev_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(404, "Development destino no encontrado")
    try:
        await bie.merge_into_dev(db, item, body.target_dev_id)
    except Exception as e:
        raise HTTPException(500, f"Error al fusionar: {e}") from e
    now = _now_iso()
    await db.bulk_ingest_items.update_one(
        {"id": item_id},
        {"$set": {"decision": "merged", "inserted_dev_id": body.target_dev_id,
                  "reviewer_user_id": user.user_id, "decision_at": now}},
    )
    await db.bulk_ingest_jobs.update_one(
        {"id": item["job_id"]},
        {"$inc": {"items_auto_approved": 1, "items_pending_review": -1}},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "merge", "bulk_ingest_item", item_id,
                           before=None, after={"merged_into": body.target_dev_id}, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_item/%s merge): %s", item_id, _e)
    return {"ok": True, "merged_into": body.target_dev_id}


# ─── 8) POST /jobs/{job_id}/bulk-approve ──────────────────────────────────────

@router.post(PREFIX + "/jobs/{job_id}/bulk-approve")
async def bulk_approve(
    job_id: str,
    request: Request,
    threshold: float = Query(0.85, ge=0.0, le=1.0),
):
    user = await _require_superadmin(request)
    db = _db(request)
    job = await db.bulk_ingest_jobs.find_one({"id": job_id}, {"_id": 0, "id": 1})
    if not job:
        raise HTTPException(404, "Job no encontrado")

    approved = 0
    skipped = 0
    cursor = db.bulk_ingest_items.find({"job_id": job_id, "decision": "pending_review"}, {"_id": 0})
    async for item in cursor:
        score = (item.get("dedup") or {}).get("score")
        # Approve only items where dedup score is None or below 0.65 (truly new)
        if score is None or score < 0.65:
            try:
                dev_id = await bie.insert_extracted_project(db, item)
                await db.bulk_ingest_items.update_one(
                    {"id": item["id"]},
                    {"$set": {"decision": "approved", "inserted_dev_id": dev_id,
                              "reviewer_user_id": user.user_id, "decision_at": _now_iso()}},
                )
                approved += 1
            except Exception as e:
                log.warning(f"[bulk-approve] fail {item['id']}: {e}")
                skipped += 1
        else:
            skipped += 1

    if approved > 0:
        await db.bulk_ingest_jobs.update_one(
            {"id": job_id},
            {"$inc": {"items_auto_approved": approved, "items_pending_review": -approved}},
        )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "bulk_approve", "bulk_ingest_job", job_id,
                           before=None, after={"approved": approved, "skipped": skipped}, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_job/%s bulk_approve): %s", job_id, _e)
    # PROTOTIPOS v2: catálogo cambió en lote → re-derivar prototipos (código puro, $0)
    try:
        import asyncio as _aio
        _aio.create_task(_materializa_y_coteja(db))
    except Exception as _e:
        log.warning("[prototipos] rederivar post-bulk-approve falló: %s", _e)
    return {"approved_count": approved, "skipped_count": skipped}


# ─── W1.5 — Inline edit / Diff / Recompute / Force-match ──────────────────────

@router.patch(PREFIX + "/items/{item_id}")
async def patch_item(item_id: str, body: PatchItemBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    if item.get("decision") in {"approved", "merged", "rejected"}:
        raise HTTPException(409, f"Item ya está en estado {item['decision']}, no editable")
    try:
        updated = await bie.apply_inline_patch(db, item_id, body.patch, user.user_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "patch", "bulk_ingest_item", item_id,
                           before=None, after={"patch": body.patch}, request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_item/%s patch): %s", item_id, _e)
    return {"ok": True, "item": updated, "effective_extracted": bie.effective_extracted(updated)}


@router.get(PREFIX + "/items/{item_id}/diff")
async def get_item_diff(item_id: str, request: Request, target_dev_id: Optional[str] = Query(None)):
    await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    # Default target = best_match_dev_id from dedup
    target = target_dev_id or (item.get("dedup") or {}).get("best_match_dev_id")
    if not target:
        raise HTTPException(400, "Sin target_dev_id (ni explícito ni en dedup.best_match_dev_id)")
    try:
        diff = await bie.build_diff(db, item, target)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    return diff


@router.post(PREFIX + "/items/{item_id}/recompute-extraction")
async def recompute_extraction(item_id: str, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    if item.get("decision") in {"approved", "merged"}:
        raise HTTPException(409, f"Item en estado {item['decision']}, no recomputable")
    if not (item.get("source_files") or []):
        raise HTTPException(400, "Item sin archivos fuente")
    try:
        updated = await bie.recompute_item_extraction(db, item)
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"Error al recomputar: {e}") from e
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "recompute", "bulk_ingest_item", item_id,
                           before=None, after={"history_count": len(updated.get("extraction_history") or [])},
                           request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_item/%s recompute): %s", item_id, _e)
    return {"ok": True, "item": updated}


@router.post(PREFIX + "/items/{item_id}/force-match")
async def force_match(item_id: str, body: ForceMatchBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)
    item = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    if item.get("decision") in {"approved", "merged", "rejected"}:
        raise HTTPException(409, f"Item ya en estado {item['decision']}")

    target = await db.developments.find_one({"id": body.target_dev_id}, {"_id": 0, "id": 1, "name": 1})
    if not target:
        raise HTTPException(404, "Development destino no encontrado")

    if body.mode == "merge":
        try:
            await bie.merge_into_dev(db, item, body.target_dev_id)
        except Exception as e:
            raise HTTPException(500, f"Error al fusionar: {e}") from e
        new_decision = "merged"
        inserted = body.target_dev_id
    else:  # approve_as_new
        try:
            inserted = await bie.insert_extracted_project(db, item)
        except Exception as e:
            raise HTTPException(500, f"Error al insertar: {e}") from e
        new_decision = "approved"

    now = _now_iso()
    await db.bulk_ingest_items.update_one(
        {"id": item_id},
        {"$set": {
            "decision": new_decision,
            "inserted_dev_id": inserted,
            "reviewer_user_id": user.user_id,
            "decision_at": now,
            "force_matched": True,
            "force_match_target_dev_id": body.target_dev_id,
        }},
    )
    await db.bulk_ingest_jobs.update_one(
        {"id": item["job_id"]},
        {"$inc": {"items_auto_approved": 1, "items_pending_review": -1}},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "force_match", "bulk_ingest_item", item_id,
                           before=None, after={"target": body.target_dev_id, "mode": body.mode},
                           request=request)
    except Exception as _e:
        log.warning("[audit] log_mutation perdido (bulk_ingest_item/%s force_match): %s", item_id, _e)
    return {"ok": True, "decision": new_decision, "inserted_dev_id": inserted, "target_name": target.get("name")}


# ─── KPI endpoint (used by frontend strip) ────────────────────────────────────

@router.get(PREFIX + "/accuracy")
async def get_accuracy(request: Request, dias: int = Query(90, ge=1, le=365)):
    """DASHBOARD DE ASERTIVIDAD CONTINUO (upgrade #3): % de acuerdo del doble-check vs la lista, vivo."""
    await _require_superadmin(request)
    db = _db(request)
    return await bie.accuracy_summary(db, dias=dias)


@router.get(PREFIX + "/items/{item_id}/snapshot")
async def get_item_snapshot(item_id: str, request: Request):
    """SNAPSHOT de la lista de precios (idea founder): imagen(es) para verificación visual en la revisión."""
    await _require_superadmin(request)
    db = _db(request)
    it = await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0, "project_folder_name": 1, "source_content_hash": 1})
    if not it:
        raise HTTPException(404, "Item no encontrado")
    snap = await db.ingest_list_snapshots.find_one(
        {"project_folder_name": it.get("project_folder_name"), "source_content_hash": it.get("source_content_hash")},
        {"_id": 0, "list_name": 1, "pages_b64": 1, "ts": 1})
    if not snap:
        raise HTTPException(404, "Sin snapshot para este item")
    return {"list_name": snap.get("list_name"), "pages": [f"data:image/png;base64,{b}" for b in (snap.get("pages_b64") or [])], "ts": snap.get("ts")}


@router.get(PREFIX + "/stats")
async def get_stats(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    jobs_total = await db.bulk_ingest_jobs.count_documents({})
    proyectos_ingested = await db.bulk_ingest_items.count_documents({"decision": "approved"})
    pending_review = await db.bulk_ingest_items.count_documents({"decision": "pending_review"})

    # AI cost current month
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"created_at": {"$gte": start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$ai_cost_mxn"}}},
    ]
    ai_cost_mes = 0.0
    try:
        async for row in db.bulk_ingest_items.aggregate(pipeline):
            ai_cost_mes = round(float(row.get("total") or 0), 2)
    except Exception:
        pass

    return {
        "jobs_total": jobs_total,
        "proyectos_ingested_total": proyectos_ingested,
        "pending_review_total": pending_review,
        "ai_cost_mes_mxn": ai_cost_mes,
    }

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("bulk_drive_ingest", plan_tier="enterprise", monthly_price_mxn=399, category="operations",   name="Bulk Drive Ingest")
