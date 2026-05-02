"""Phase 4 Batch 1 — Dev Portal Foundation + Upload Ready.

Endpoints:
  4.1  POST /api/dev/bulk-upload/parse   → preview + validation
       POST /api/dev/bulk-upload/commit  → persist batch
       GET  /api/dev/bulk-upload/jobs    → historial
  4.5  PATCH /api/dev/projects/:id/location → save lat/lng
       GET   /api/dev/projects           → list projects (con location)
  4.7  POST   /api/dev/units/:id/hold    → crear apartado temporal
       DELETE /api/dev/units/:id/hold    → liberar
       GET    /api/dev/units/:id/hold    → estado actual
  4.9  GET/POST/PATCH/DELETE /api/dev/internal-users → CRUD team
       PATCH /api/dev/org/settings       → toggle allow_external_inventory
  4.10 GET/POST /api/dev/erp-webhooks    → config providers
       PATCH  /api/dev/erp-webhooks/:id  → update
       POST   /api/dev/erp-webhooks/:provider/event → stub receiver
  4.15 POST /api/dev/content/upload      → submit pending
       GET  /api/dev/content             → list
       POST /api/dev/content/:id/approve|reject → director action
"""
from __future__ import annotations

import io
import csv
import uuid
import logging
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("dmx.dev_batch1")

router = APIRouter(prefix="/api/dev", tags=["dev_batch1"])

DEV_ROLES = {"developer_admin", "superadmin"}

VALID_STATUSES = {"disponible", "apartado", "reservado", "vendido", "bloqueado", "pre-venta"}

ERP_PROVIDERS = {"easybroker", "salesforce", "hubspot", "pipedrive", "ghl"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(pfx: str) -> str:
    return f"{pfx}_{uuid.uuid4().hex[:12]}"


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in DEV_ROLES:
        raise HTTPException(403, "Acceso restringido al portal del desarrollador")
    return user


def _tenant(user) -> str:
    return getattr(user, "tenant_id", None) or "default_org"


def _fernet():
    """Return Fernet instance for encrypting API keys. Silently falls back to identity."""
    try:
        from cryptography.fernet import Fernet
        key = __import__("os").environ.get("IE_FERNET_KEY", "")
        if key:
            return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        pass
    return None


def _encrypt(val: str) -> str:
    f = _fernet()
    if f:
        return f.encrypt(val.encode()).decode()
    return val


def _decrypt(val: str) -> str:
    f = _fernet()
    if f:
        try:
            return f.decrypt(val.encode()).decode()
        except Exception:
            pass
    return val


# ═══════════════════════════════════════════════════════════════════════════════
# 4.1 BULK UPLOAD
# ═══════════════════════════════════════════════════════════════════════════════

BULK_COLS_REQUIRED = ["unit_number"]
BULK_COLS_ALL = ["unit_number", "prototype", "level", "bedrooms", "bathrooms",
                 "m2_total", "m2_private", "m2_terrace", "price", "status",
                 "parking_spots", "storage_room", "orientation", "notes"]


def _norm_header(h: str) -> str:
    return h.strip().lower().replace(" ", "_").replace("-", "_")


def _parse_rows(raw_bytes: bytes, filename: str) -> List[Dict]:
    """Parse CSV or Excel and return list of row dicts."""
    fname_lower = filename.lower()
    if fname_lower.endswith(".csv"):
        text = raw_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = [dict(r) for r in reader]
    elif fname_lower.endswith((".xlsx", ".xls")):
        import pandas as pd
        df = pd.read_excel(io.BytesIO(raw_bytes), dtype=str, na_filter=False)
        rows = df.to_dict("records")
    else:
        raise ValueError("Formato no soportado. Usa .csv, .xlsx o .xls")

    # Normalize headers
    normalized = []
    for row in rows:
        norm = {_norm_header(k): str(v).strip() for k, v in row.items() if str(v).strip()}
        if any(norm.values()):
            normalized.append(norm)
    return normalized


def _validate_row(i: int, row: Dict) -> Dict:
    """Validate a parsed row. Returns row with 'errors' and 'valid' keys."""
    errors = []

    unit_number = row.get("unit_number", "").strip()
    if not unit_number:
        errors.append("unit_number es requerido")

    # Price
    price_raw = row.get("price", "").replace(",", "").replace("$", "").replace(" ", "")
    price = None
    if price_raw:
        try:
            price = int(float(price_raw))
            if price <= 0:
                errors.append("price debe ser > 0")
        except ValueError:
            errors.append(f"price inválido: '{price_raw}'")

    # Status
    status = row.get("status", "disponible").strip().lower()
    if status and status not in VALID_STATUSES:
        errors.append(f"status inválido '{status}' — valores: {', '.join(VALID_STATUSES)}")

    # Numeric fields
    for field in ("bedrooms", "bathrooms", "level", "parking_spots"):
        val = row.get(field, "")
        if val:
            try:
                int(float(val))
            except ValueError:
                errors.append(f"{field} debe ser numérico")

    for field in ("m2_total", "m2_private", "m2_terrace"):
        val = row.get(field, "")
        if val:
            try:
                float(val)
            except ValueError:
                errors.append(f"{field} debe ser numérico")

    return {
        **row,
        "_row_index": i + 1,
        "_unit_number": unit_number,
        "_price": price,
        "_status": status or "disponible",
        "errors": errors,
        "valid": len(errors) == 0,
    }


@router.post("/bulk-upload/parse")
async def bulk_parse(
    request: Request,
    dev_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Parse Excel/CSV and return preview + per-row validation."""
    user = await _auth(request)
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:  # 10 MB max
        raise HTTPException(400, "Archivo demasiado grande (max 10 MB)")

    try:
        rows = _parse_rows(raw, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if not rows:
        raise HTTPException(400, "El archivo está vacío o no se detectaron columnas válidas")

    if len(rows) > 2000:
        raise HTTPException(400, "Máximo 2,000 unidades por batch")

    validated = [_validate_row(i, r) for i, r in enumerate(rows)]
    valid_count = sum(1 for r in validated if r["valid"])
    error_count = len(validated) - valid_count
    detected_cols = [c for c in BULK_COLS_ALL if any(c in r for r in rows)]

    return {
        "filename": file.filename,
        "dev_id": dev_id,
        "total_rows": len(validated),
        "valid_rows": valid_count,
        "error_rows": error_count,
        "detected_columns": detected_cols,
        "preview": validated[:100],  # cap preview at 100 rows
    }


class BulkCommitPayload(BaseModel):
    dev_id: str
    filename: str
    rows: List[Dict[str, Any]]  # validated rows from parse
    override_mode: str = "upsert"  # upsert|skip_existing


@router.post("/bulk-upload/commit")
async def bulk_commit(payload: BulkCommitPayload, request: Request):
    """Persist validated batch into developer_unit_overrides."""
    user = await _auth(request)
    db = _db(request)

    valid_rows = [r for r in payload.rows if r.get("valid")]
    if not valid_rows:
        raise HTTPException(400, "No hay filas válidas para persistir")

    job_id = _uid("bulkjob")
    job = {
        "id": job_id,
        "dev_org_id": _tenant(user),
        "dev_id": payload.dev_id,
        "filename": payload.filename,
        "status": "parsing",
        "rows_parsed": len(payload.rows),
        "rows_committed": 0,
        "errors": [],
        "ts": _now().isoformat(),
        "committed_by": user.user_id,
    }
    await db.bulk_upload_jobs.insert_one(dict(job))
    job.pop("_id", None)

    committed = 0
    errors = []

    for row in valid_rows:
        unit_number = str(row.get("_unit_number") or row.get("unit_number", "")).strip()
        if not unit_number:
            continue

        unit_id = f"{payload.dev_id}-{unit_number.lower().replace(' ', '-')}"
        price_raw = row.get("_price") or row.get("price", "")
        try:
            price = int(float(str(price_raw).replace(",", "").replace("$", ""))) if price_raw else None
        except Exception:
            price = None

        def safe_int(v):
            try: return int(float(str(v))) if v else None
            except Exception: return None

        def safe_float(v):
            try: return float(str(v)) if v else None
            except Exception: return None

        override = {
            "unit_id": unit_id,
            "unit_number": unit_number,
            "dev_id": payload.dev_id,
            "dev_org_id": _tenant(user),
            "status": row.get("_status") or row.get("status", "disponible"),
            "prototype": row.get("prototype") or None,
            "level": safe_int(row.get("level")),
            "bedrooms": safe_int(row.get("bedrooms")),
            "bathrooms": safe_int(row.get("bathrooms")),
            "m2_total": safe_float(row.get("m2_total")),
            "m2_private": safe_float(row.get("m2_private")),
            "m2_terrace": safe_float(row.get("m2_terrace")),
            "price": price,
            "parking_spots": safe_int(row.get("parking_spots")),
            "storage_room": row.get("storage_room") or None,
            "orientation": row.get("orientation") or None,
            "notes": row.get("notes") or None,
            "updated_by": user.user_id,
            "updated_at": _now().isoformat(),
            "source": "bulk_upload",
            "bulk_job_id": job_id,
        }
        # Remove None values
        override = {k: v for k, v in override.items() if v is not None or k in ("unit_id", "unit_number", "dev_id", "dev_org_id")}

        if payload.override_mode == "skip_existing":
            existing = await db.developer_unit_overrides.find_one({"unit_id": unit_id})
            if existing:
                continue

        await db.developer_unit_overrides.update_one(
            {"unit_id": unit_id},
            {"$set": override},
            upsert=True,
        )
        committed += 1

    # Update job status
    job_status = "committed" if not errors else "partial"
    await db.bulk_upload_jobs.update_one(
        {"id": job_id},
        {"$set": {"status": job_status, "rows_committed": committed, "errors": errors}},
    )

    # Audit log + ML event
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(db, user, "create", "bulk_upload", job_id,
                           before=None,
                           after={"dev_id": payload.dev_id, "committed": committed, "filename": payload.filename},
                           request=request)
        await emit_ml_event(db, "mutation_logged", user.user_id, _tenant(user), user.role,
                            context={"entity_type": "bulk_upload", "action": "commit", "rows": committed},
                            ai_decision={}, user_action={})
    except Exception: pass

    return {
        "job_id": job_id,
        "status": job_status,
        "rows_parsed": len(payload.rows),
        "rows_committed": committed,
        "errors": errors,
    }


@router.get("/bulk-upload/jobs")
async def list_bulk_jobs(request: Request):
    user = await _auth(request)
    db = _db(request)
    items = await db.bulk_upload_jobs.find(
        {"dev_org_id": _tenant(user)}, {"_id": 0}
    ).sort("ts", -1).limit(50).to_list(50)
    return items


# ═══════════════════════════════════════════════════════════════════════════════
# 4.5 GEOLOCATION (lat/lng per project)
# ═══════════════════════════════════════════════════════════════════════════════

class LocationPayload(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    address: Optional[str] = None
    zoom: Optional[float] = 14.0


@router.patch("/projects/{project_id}/location")
async def save_project_location(project_id: str, payload: LocationPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    # Capture before state for audit diff
    before_doc = await db.dev_project_meta.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    before = (
        {"lat": before_doc.get("lat"), "lng": before_doc.get("lng"), "zoom": before_doc.get("zoom")}
        if before_doc else None
    )
    await db.dev_project_meta.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": {
            "project_id": project_id,
            "dev_org_id": _tenant(user),
            "lat": payload.lat,
            "lng": payload.lng,
            "address": payload.address,
            "zoom": payload.zoom,
            "updated_at": _now().isoformat(),
            "updated_by": user.user_id,
        }},
        upsert=True,
    )
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "update", "project_location", project_id,
            before=before,
            after={"lat": payload.lat, "lng": payload.lng, "zoom": payload.zoom},
            request=request,
        )
        await emit_ml_event(
            db, event_type="mapbox_location_set",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"project_id": project_id},
            ai_decision={},
            user_action={"lat": payload.lat, "lng": payload.lng, "zoom": payload.zoom},
        )
    except Exception: pass
    return {"ok": True, "project_id": project_id, "lat": payload.lat, "lng": payload.lng, "zoom": payload.zoom}


@router.get("/projects")
async def list_projects(request: Request):
    """List projects with their location metadata."""
    user = await _auth(request)
    db = _db(request)
    from data_developments import DEVELOPMENTS
    metas = {}
    async for m in db.dev_project_meta.find({"dev_org_id": _tenant(user)}, {"_id": 0}):
        metas[m["project_id"]] = m

    return [
        {
            "id": d["id"],
            "name": d["name"],
            "colonia": d["colonia"],
            "stage": d["stage"],
            "center": d.get("center"),
            "location_meta": metas.get(d["id"]),
        }
        for d in DEVELOPMENTS
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# 4.7 UNIT HOLDS (apartado temporal)
# ═══════════════════════════════════════════════════════════════════════════════

class HoldPayload(BaseModel):
    dev_id: str
    hours: int  # 24 | 48 | 72
    reason: Optional[str] = None
    holder_name: Optional[str] = None

    @field_validator("hours")
    @classmethod
    def validate_hours(cls, v):
        if v not in (1, 24, 48, 72):
            raise ValueError("hours debe ser 1, 24, 48 o 72")
        return v


@router.post("/units/{unit_id}/hold")
async def create_hold(unit_id: str, payload: HoldPayload, request: Request):
    user = await _auth(request)
    db = _db(request)

    # Check existing active hold
    existing = await db.unit_holds.find_one({"unit_id": unit_id, "status": "active"}, {"_id": 0})
    if existing:
        raise HTTPException(409, f"La unidad ya tiene un apartado activo hasta {existing.get('expires_at')}")

    expires_at = _now() + timedelta(hours=payload.hours)
    hold = {
        "id": _uid("hold"),
        "unit_id": unit_id,
        "dev_id": payload.dev_id,
        "dev_org_id": _tenant(user),
        "holder_user_id": user.user_id,
        "holder_name": payload.holder_name or getattr(user, "name", None),
        "expires_at": expires_at.isoformat(),
        "hours": payload.hours,
        "reason": payload.reason or "",
        "status": "active",
        "created_at": _now().isoformat(),
    }
    await db.unit_holds.insert_one(dict(hold))
    hold.pop("_id", None)

    # Auto-set unit status to "apartado"
    await db.developer_unit_overrides.update_one(
        {"unit_id": unit_id},
        {"$set": {"unit_id": unit_id, "dev_id": payload.dev_id, "status": "apartado",
                  "hold_id": hold["id"], "updated_by": user.user_id, "updated_at": _now().isoformat()}},
        upsert=True,
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "unit_hold", unit_id,
                           before=None, after={"hours": payload.hours, "expires_at": expires_at.isoformat()},
                           request=request)
    except Exception: pass
    return hold


@router.delete("/units/{unit_id}/hold")
async def release_hold(unit_id: str, dev_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    result = await db.unit_holds.update_one(
        {"unit_id": unit_id, "status": "active"},
        {"$set": {"status": "released", "released_at": _now().isoformat(), "released_by": user.user_id}},
    )
    if not result.matched_count:
        raise HTTPException(404, "No se encontró apartado activo para esta unidad")

    # Restore unit to disponible
    await db.developer_unit_overrides.update_one(
        {"unit_id": unit_id},
        {"$set": {"status": "disponible", "hold_id": None, "updated_by": user.user_id, "updated_at": _now().isoformat()}},
    )
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "delete", "unit_hold", unit_id,
                           before={"status": "active"}, after={"status": "released"}, request=request)
    except Exception: pass
    return {"ok": True, "unit_id": unit_id, "status": "released"}


@router.get("/units/{unit_id}/hold")
async def get_hold(unit_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    hold = await db.unit_holds.find_one({"unit_id": unit_id, "status": "active"}, {"_id": 0})
    if not hold:
        return {"active": False, "unit_id": unit_id}
    # Compute remaining seconds
    try:
        exp = datetime.fromisoformat(hold["expires_at"])
        remaining = max(0, int((exp - _now()).total_seconds()))
    except Exception:
        remaining = 0
    return {**hold, "active": True, "remaining_seconds": remaining}


@router.get("/holds")
async def list_holds(request: Request, dev_id: Optional[str] = None):
    """List all active holds for this org (optional dev filter)."""
    user = await _auth(request)
    db = _db(request)
    filt: Dict[str, Any] = {"dev_org_id": _tenant(user), "status": "active"}
    if dev_id:
        filt["dev_id"] = dev_id
    items = await db.unit_holds.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Augment with remaining_seconds
    now_str = _now()
    for item in items:
        try:
            exp = datetime.fromisoformat(item["expires_at"])
            item["remaining_seconds"] = max(0, int((exp - now_str).total_seconds()))
        except Exception:
            item["remaining_seconds"] = 0
    return items


async def auto_release_expired_holds(db) -> int:
    """Called by scheduler every 30min. Releases holds past expires_at."""
    now_iso = _now().isoformat()
    cursor = db.unit_holds.find({"status": "active", "expires_at": {"$lte": now_iso}})
    released = 0
    async for hold in cursor:
        await db.unit_holds.update_one(
            {"_id": hold["_id"]},
            {"$set": {"status": "released", "released_at": now_iso, "released_by": "scheduler"}},
        )
        # Restore unit status
        await db.developer_unit_overrides.update_one(
            {"unit_id": hold["unit_id"]},
            {"$set": {"status": "disponible", "hold_id": None, "updated_at": now_iso}},
        )
        released += 1
    if released:
        log.info(f"[unit_holds] auto-released {released} expired holds")
    return released


# ═══════════════════════════════════════════════════════════════════════════════
# 4.9 INTERNAL USERS (Phase 14 dev slice)
# ═══════════════════════════════════════════════════════════════════════════════

INTERNAL_ROLES = {"admin", "commercial_director", "comercial", "obras", "marketing"}


class InternalUserCreate(BaseModel):
    email: str
    name: str
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in INTERNAL_ROLES:
            raise ValueError(f"role inválido — válidos: {', '.join(INTERNAL_ROLES)}")
        return v


class InternalUserPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


@router.get("/internal-users")
async def list_internal_users(request: Request):
    user = await _auth(request)
    db = _db(request)
    items = await db.dev_internal_users.find(
        {"dev_org_id": _tenant(user)}, {"_id": 0}
    ).sort("ts", -1).to_list(200)
    return items


@router.post("/internal-users")
async def create_internal_user(payload: InternalUserCreate, request: Request):
    user = await _auth(request)
    db = _db(request)
    if not payload.email or "@" not in payload.email:
        raise HTTPException(400, "Email inválido")

    # Check duplicate
    existing = await db.dev_internal_users.find_one({"dev_org_id": _tenant(user), "email": payload.email.lower()})
    if existing:
        raise HTTPException(409, "Ya existe un usuario con ese email en tu organización")

    activation_token = uuid.uuid4().hex
    new_user = {
        "id": _uid("diu"),
        "dev_org_id": _tenant(user),
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "status": "invited",
        "invited_by": user.user_id,
        "activation_token": activation_token,
        "ts": _now().isoformat(),
    }
    await db.dev_internal_users.insert_one(dict(new_user))
    new_user.pop("_id", None)

    # Stub: log invite (real email via Resend when RESEND_API_KEY present)
    invite_url = f"/activar-cuenta?token={activation_token}"
    email_sent = False
    resend_key = __import__("os").environ.get("RESEND_API_KEY", "")
    if resend_key:
        try:
            import resend
            resend.api_key = resend_key
            resend.Emails.send({
                "from": "DMX Platform <noreply@desarrollosmx.com>",
                "to": payload.email.lower(),
                "subject": f"Invitación a DesarrollosMX — Portal Desarrollador",
                "html": (
                    f"<h2>Bienvenido a DesarrollosMX</h2>"
                    f"<p>Has sido invitado como <strong>{payload.role}</strong> por tu organización.</p>"
                    f"<p><a href='{invite_url}'>Activar cuenta</a></p>"
                ),
            })
            email_sent = True
        except Exception as e:
            log.warning(f"[invite] Resend failed: {e}")

    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "internal_user", new_user["id"],
                           before=None, after={"email": payload.email, "role": payload.role}, request=request)
        from observability import emit_ml_event
        await emit_ml_event(db, "mutation_logged", user.user_id, _tenant(user), user.role,
                            context={"entity_type": "internal_user", "action": "invite", "role": payload.role},
                            ai_decision={}, user_action={})
    except Exception: pass

    return {**new_user, "email_sent": email_sent, "invite_url": invite_url}


@router.patch("/internal-users/{uid}")
async def patch_internal_user(uid: str, payload: InternalUserPatch, request: Request):
    user = await _auth(request)
    db = _db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "role" in patch and patch["role"] not in INTERNAL_ROLES:
        raise HTTPException(400, f"role inválido")
    if "status" in patch and patch["status"] not in {"active", "invited", "disabled"}:
        raise HTTPException(400, "status inválido")
    old = await db.dev_internal_users.find_one({"id": uid, "dev_org_id": _tenant(user)}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Usuario no encontrado")
    patch["updated_at"] = _now().isoformat()
    await db.dev_internal_users.update_one({"id": uid}, {"$set": patch})
    updated = await db.dev_internal_users.find_one({"id": uid}, {"_id": 0})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "internal_user", uid,
                           before=old, after=updated, request=request)
    except Exception: pass
    return updated


@router.delete("/internal-users/{uid}")
async def disable_internal_user(uid: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    r = await db.dev_internal_users.update_one(
        {"id": uid, "dev_org_id": _tenant(user)},
        {"$set": {"status": "disabled", "disabled_at": _now().isoformat(), "disabled_by": user.user_id}},
    )
    if not r.matched_count:
        raise HTTPException(404, "Usuario no encontrado")
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "delete", "internal_user", uid, before=None, after={"status": "disabled"}, request=request)
    except Exception: pass
    return {"ok": True, "status": "disabled"}


# ─── Org Settings ─────────────────────────────────────────────────────────────

class OrgSettingsPatch(BaseModel):
    allow_external_inventory: Optional[bool] = None
    org_display_name: Optional[str] = None
    contact_email: Optional[str] = None


@router.patch("/org/settings")
async def patch_org_settings(payload: OrgSettingsPatch, request: Request):
    user = await _auth(request)
    db = _db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    patch["updated_at"] = _now().isoformat()
    await db.dev_org_settings.update_one(
        {"dev_org_id": _tenant(user)},
        {"$set": {"dev_org_id": _tenant(user), **patch}},
        upsert=True,
    )
    doc = await db.dev_org_settings.find_one({"dev_org_id": _tenant(user)}, {"_id": 0})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "org_settings", _tenant(user),
                           before=None, after=patch, request=request)
    except Exception: pass
    return doc


@router.get("/org/settings")
async def get_org_settings(request: Request):
    user = await _auth(request)
    db = _db(request)
    doc = await db.dev_org_settings.find_one({"dev_org_id": _tenant(user)}, {"_id": 0})
    return doc or {"dev_org_id": _tenant(user), "allow_external_inventory": False}


# ═══════════════════════════════════════════════════════════════════════════════
# 4.10 ERP WEBHOOKS (stub honesto)
# ═══════════════════════════════════════════════════════════════════════════════

class ERPWebhookConfig(BaseModel):
    provider: str
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    events: List[str] = []
    label: Optional[str] = None

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v):
        if v not in ERP_PROVIDERS:
            raise ValueError(f"provider inválido — válidos: {', '.join(ERP_PROVIDERS)}")
        return v


@router.get("/erp-webhooks")
async def list_erp_webhooks(request: Request):
    user = await _auth(request)
    db = _db(request)
    items = await db.erp_webhooks.find({"dev_org_id": _tenant(user)}, {"_id": 0}).to_list(20)
    # Redact api_key in responses
    for item in items:
        if item.get("api_key_encrypted"):
            item["api_key_masked"] = "••••••••" + _decrypt(item["api_key_encrypted"])[-4:] if item.get("api_key_encrypted") else None
            del item["api_key_encrypted"]
    return items


@router.post("/erp-webhooks")
async def create_erp_webhook(payload: ERPWebhookConfig, request: Request):
    user = await _auth(request)
    db = _db(request)
    # Upsert per provider
    existing = await db.erp_webhooks.find_one({"dev_org_id": _tenant(user), "provider": payload.provider})
    wid = existing["id"] if existing else _uid("erpwh")

    doc = {
        "id": wid,
        "dev_org_id": _tenant(user),
        "provider": payload.provider,
        "label": payload.label or payload.provider,
        "endpoint": payload.endpoint,
        "events": payload.events,
        "status": "active",
        "last_ping_ts": None,
        "ts": _now().isoformat(),
    }
    if payload.api_key:
        doc["api_key_encrypted"] = _encrypt(payload.api_key)

    await db.erp_webhooks.update_one(
        {"dev_org_id": _tenant(user), "provider": payload.provider},
        {"$set": doc},
        upsert=True,
    )
    doc.pop("api_key_encrypted", None)
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "erp_webhook", wid,
                           before=None, after={"provider": payload.provider, "endpoint": payload.endpoint},
                           request=request)
    except Exception: pass
    return {**doc, "webhook_receiver_url": f"/api/dev/erp-webhooks/{payload.provider}/event"}


@router.patch("/erp-webhooks/{wid}")
async def patch_erp_webhook(wid: str, payload: ERPWebhookConfig, request: Request):
    user = await _auth(request)
    db = _db(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    patch.pop("provider", None)  # provider is immutable
    if "api_key" in patch:
        patch["api_key_encrypted"] = _encrypt(patch.pop("api_key"))
    patch["updated_at"] = _now().isoformat()
    r = await db.erp_webhooks.update_one({"id": wid, "dev_org_id": _tenant(user)}, {"$set": patch})
    if not r.matched_count:
        raise HTTPException(404, "Webhook no encontrado")
    return {"ok": True}


@router.post("/erp-webhooks/{provider}/event")
async def receive_erp_event(provider: str, request: Request):
    """Stub webhook receiver — log incoming events, return 200 always."""
    if provider not in ERP_PROVIDERS:
        raise HTTPException(400, f"Provider desconocido: {provider}")

    db = _db(request)
    try:
        body = await request.json()
    except Exception:
        body = {}

    event_doc = {
        "id": _uid("erpev"),
        "provider": provider,
        "payload": body,
        "ts": _now().isoformat(),
        "ip": (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or getattr(request.client, "host", None),
        "user_agent": request.headers.get("user-agent"),
    }
    await db.erp_webhook_events.insert_one(dict(event_doc))
    # Update last_ping_ts
    await db.erp_webhooks.update_one(
        {"provider": provider},
        {"$set": {"last_ping_ts": _now().isoformat()}},
    )
    return {"received": True, "event_id": event_doc["id"], "stub": True}


@router.get("/erp-webhooks/{provider}/events")
async def list_erp_events(provider: str, request: Request, limit: int = 50):
    user = await _auth(request)
    db = _db(request)
    items = await db.erp_webhook_events.find(
        {"provider": provider}, {"_id": 0}
    ).sort("ts", -1).limit(limit).to_list(limit)
    return items


# ═══════════════════════════════════════════════════════════════════════════════
# 4.15 CONTENT CALENDAR (upload/approve/reject)
# ═══════════════════════════════════════════════════════════════════════════════

CONTENT_TYPES = {"foto", "video", "plano", "doc", "render"}
CONTENT_STATUSES = {"pending", "approved", "published", "rejected"}


class ContentUploadPayload(BaseModel):
    project_id: str
    type: str
    file_url: str
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_publish_at: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v):
        if v not in CONTENT_TYPES:
            raise ValueError(f"type inválido — válidos: {', '.join(CONTENT_TYPES)}")
        return v


class ContentActionPayload(BaseModel):
    comment: Optional[str] = None


@router.post("/content/upload")
async def submit_content(payload: ContentUploadPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    doc = {
        "id": _uid("cont"),
        "dev_org_id": _tenant(user),
        "project_id": payload.project_id,
        "type": payload.type,
        "file_url": payload.file_url,
        "title": payload.title or "",
        "description": payload.description or "",
        "scheduled_publish_at": payload.scheduled_publish_at,
        "status": "pending",
        "uploader_id": user.user_id,
        "uploader_name": getattr(user, "name", None),
        "approver_id": None,
        "comment": None,
        "ts": _now().isoformat(),
    }
    await db.content_uploads.insert_one(dict(doc))
    doc.pop("_id", None)
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "create", "content_upload", doc["id"],
                           before=None, after={"project_id": payload.project_id, "type": payload.type},
                           request=request)
    except Exception: pass
    return doc


@router.get("/content")
async def list_content(
    request: Request,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
):
    user = await _auth(request)
    db = _db(request)
    filt: Dict[str, Any] = {"dev_org_id": _tenant(user)}
    if project_id:
        filt["project_id"] = project_id
    if status:
        filt["status"] = status
    if type:
        filt["type"] = type
    items = await db.content_uploads.find(filt, {"_id": 0}).sort("ts", -1).limit(300).to_list(300)
    return items


@router.post("/content/{cid}/approve")
async def approve_content(cid: str, payload: ContentActionPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    r = await db.content_uploads.update_one(
        {"id": cid, "dev_org_id": _tenant(user)},
        {"$set": {"status": "approved", "approver_id": user.user_id, "comment": payload.comment, "actioned_at": _now().isoformat()}},
    )
    if not r.matched_count:
        raise HTTPException(404, "Contenido no encontrado")
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "content_upload", cid,
                           before={"status": "pending"}, after={"status": "approved"}, request=request)
    except Exception: pass
    return {"ok": True, "status": "approved"}


@router.post("/content/{cid}/reject")
async def reject_content(cid: str, payload: ContentActionPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    r = await db.content_uploads.update_one(
        {"id": cid, "dev_org_id": _tenant(user)},
        {"$set": {"status": "rejected", "approver_id": user.user_id, "comment": payload.comment, "actioned_at": _now().isoformat()}},
    )
    if not r.matched_count:
        raise HTTPException(404, "Contenido no encontrado")
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "content_upload", cid,
                           before={"status": "pending"}, after={"status": "rejected"}, request=request)
    except Exception: pass
    return {"ok": True, "status": "rejected"}


@router.post("/content/{cid}/publish")
async def publish_content(cid: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    r = await db.content_uploads.update_one(
        {"id": cid, "dev_org_id": _tenant(user), "status": "approved"},
        {"$set": {"status": "published", "published_at": _now().isoformat(), "published_by": user.user_id}},
    )
    if not r.matched_count:
        raise HTTPException(409, "Solo contenido aprobado puede publicarse")
    return {"ok": True, "status": "published"}


# ═══════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═══════════════════════════════════════════════════════════════════════════════
async def ensure_dev_batch1_indexes(db) -> None:
    await db.bulk_upload_jobs.create_index([("dev_org_id", 1), ("ts", -1)], background=True)
    await db.unit_holds.create_index([("unit_id", 1), ("status", 1)], background=True)
    await db.unit_holds.create_index([("dev_org_id", 1), ("expires_at", 1)], background=True)
    await db.dev_internal_users.create_index([("dev_org_id", 1), ("email", 1)], unique=True, background=True)
    await db.erp_webhooks.create_index([("dev_org_id", 1), ("provider", 1)], background=True)
    await db.erp_webhook_events.create_index([("provider", 1), ("ts", -1)], background=True)
    await db.content_uploads.create_index([("dev_org_id", 1), ("status", 1), ("ts", -1)], background=True)
    await db.dev_project_meta.create_index([("dev_org_id", 1), ("project_id", 1)], background=True)
    log.info("[dev_batch1] indexes ensured")
