"""W1.4 ZZ.1 — Bulk Drive Ingestion Routes.

Prefix: /api/superadmin/bulk-ingest · all require_superadmin.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Literal

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

import bulk_ingest_engine as bie

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


class RejectBody(BaseModel):
    reason: str = Field(..., max_length=500)


class MergeBody(BaseModel):
    target_dev_id: str


# ─── 1) POST /start ───────────────────────────────────────────────────────────

@router.post(PREFIX + "/start")
async def start_job(body: StartBody, request: Request):
    user = await _require_superadmin(request)
    db = _db(request)

    folder_id = bie.parse_folder_id(body.drive_folder_url)
    if not folder_id:
        raise HTTPException(400, "URL de carpeta Drive inválida")

    # Verify drive connection available
    conn = await bie._resolve_drive_conn(db, body.target_dev_org_id)
    if not conn:
        raise HTTPException(409, "No hay conexión Drive activa. Conecta Drive primero.")

    job_id = f"bij_{secrets.token_urlsafe(10)}"
    job_doc = {
        "id": job_id,
        "drive_folder_url": body.drive_folder_url,
        "target_dev_org_id": body.target_dev_org_id,
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
    except Exception:
        pass
    return {"ok": True, "dev_id": dev_id}


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
    except Exception:
        pass
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
    except Exception:
        pass
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
    except Exception:
        pass
    return {"approved_count": approved, "skipped_count": skipped}


# ─── KPI endpoint (used by frontend strip) ────────────────────────────────────

@router.get(PREFIX + "/stats")
async def get_stats(request: Request):
    await _require_superadmin(request)
    db = _db(request)
    jobs_total = await db.bulk_ingest_jobs.count_documents({})
    proyectos_ingested = await db.bulk_ingest_items.count_documents({"decision": "approved"})
    pending_review = await db.bulk_ingest_items.count_documents({"decision": "pending_review"})

    # AI cost current month
    from datetime import timedelta
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
