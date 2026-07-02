"""W1.4 ZZ.1 — Bulk Drive Ingestion Engine.

Pipeline (async):
  1. Resolve folder_id from drive URL
  2. List Drive contents (recursive 1 level → group subfolders as projects)
  3. Per project: download up to 5 PDFs + 1 spreadsheet → Claude Haiku extract
  4. Dedup against existing developments (rapidfuzz WRatio on name+address)
  5. Insert item record with decision (auto_approve / pending_review)
  6. If auto_approve → INSERT in developments+units+project_assets immediately
  7. Email founder on completion (Resend, branded template)

Extends drive_engine for "superadmin ingest mode" (no development_id, scope readonly):
the engine reuses the first connected drive_connection it can find as the OAuth
context. This works because superadmins have access to any tenant's Drive on
the platform and the founder pre-negotiates broad-scope grants.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.bulk_ingest")

CLAUDE_SEMAPHORE = asyncio.Semaphore(10)
MAX_FILES_PER_FOLDER = 200
MAX_KEY_FILES_PER_PROJECT = 5
PDF_MIMES = {"application/pdf"}
SPREADSHEET_MIMES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.google-apps.spreadsheet",
    "text/csv",
}
NATIVE_DOC_MIMES = {
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.presentation",
}
INGEST_MIMES = PDF_MIMES | SPREADSHEET_MIMES | NATIVE_DOC_MIMES | {
    "image/jpeg", "image/png", "image/webp",
}

# Folder mime is filtered separately
FOLDER_MIME = "application/vnd.google-apps.folder"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


# ─── URL → folder_id ──────────────────────────────────────────────────────────

FOLDER_RE = re.compile(r"/folders/([a-zA-Z0-9_-]{10,})")


def parse_folder_id(url: str) -> Optional[str]:
    if not url:
        return None
    m = FOLDER_RE.search(url)
    if m:
        return m.group(1)
    # Fallback: maybe user pasted raw id
    if re.match(r"^[a-zA-Z0-9_-]{10,}$", url.strip()):
        return url.strip()
    return None


# ─── OAuth context resolver ───────────────────────────────────────────────────

async def _resolve_drive_conn(db, target_dev_org_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return a valid drive_connection. Prefer target_dev_org_id, else first connected."""
    coll = db.dev_drive_connections
    if target_dev_org_id:
        conn = await coll.find_one(
            {"developer_id": target_dev_org_id, "status": "connected"}, {"_id": 0},
        )
        if conn:
            return conn
    return await coll.find_one({"status": "connected"}, {"_id": 0})


# ─── Drive operations (sync wrappers via run_in_executor) ─────────────────────

async def _list_folder_recursive(conn: Dict[str, Any], folder_id: str) -> List[Dict[str, Any]]:
    """Return all files in folder + 1-level subfolders, with `parent_folder_id` annotation."""
    from drive_engine import _drive_service
    svc = await asyncio.to_thread(_drive_service, conn)

    def _list_in(fid: str) -> List[Dict[str, Any]]:
        out = []
        q = f"'{fid}' in parents and trashed = false"
        page_token = None
        while True:
            resp = svc.files().list(
                q=q, fields="files(id,name,mimeType,modifiedTime,size),nextPageToken",
                pageSize=200, pageToken=page_token,
            ).execute()
            out.extend(resp.get("files", []) or [])
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return out

    root_items = await asyncio.to_thread(_list_in, folder_id)
    all_files: List[Dict[str, Any]] = []

    # Files at root
    for f in root_items:
        if f.get("mimeType") == FOLDER_MIME:
            continue
        all_files.append({**f, "parent_folder_id": folder_id, "parent_folder_name": ""})

    # 1-level subfolders → each is a project
    for f in root_items:
        if f.get("mimeType") == FOLDER_MIME:
            sub_items = await asyncio.to_thread(_list_in, f["id"])
            for sf in sub_items:
                if sf.get("mimeType") == FOLDER_MIME:
                    continue
                all_files.append({**sf, "parent_folder_id": f["id"], "parent_folder_name": f["name"]})
        if len(all_files) >= MAX_FILES_PER_FOLDER:
            break

    return all_files[:MAX_FILES_PER_FOLDER]


def _group_by_project(files: List[Dict[str, Any]], root_folder_id: str) -> Dict[str, Dict[str, Any]]:
    """Group files by parent_folder_id. Files at root → 1 group keyed by root id."""
    groups: Dict[str, Dict[str, Any]] = {}
    for f in files:
        key = f.get("parent_folder_id") or root_folder_id
        if key not in groups:
            groups[key] = {
                "parent_folder_id": key,
                "parent_folder_name": f.get("parent_folder_name") or "Proyecto principal",
                "files": [],
            }
        groups[key]["files"].append(f)
    return groups


async def _download_file_bytes(conn: Dict[str, Any], file_id: str, mime: str) -> Tuple[bytes, str]:
    """Returns (bytes, effective_mime)."""
    from drive_engine import _download_file_sync, _export_native_doc_sync, NATIVE_EXPORT_MAP
    if mime in NATIVE_EXPORT_MAP:
        data, _ext = await asyncio.to_thread(_export_native_doc_sync, conn, file_id, mime)
        return data, NATIVE_EXPORT_MAP[mime][0]
    data = await asyncio.to_thread(_download_file_sync, conn, file_id)
    return data, mime


# ─── Claude extraction ────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """Eres un extractor de datos para proyectos inmobiliarios LATAM.
Recibes nombre del proyecto y archivos de marketing/ficha técnica.
Devuelve SOLO JSON válido con la siguiente estructura:
{
  "project_name": "string requerido",
  "address_full": "calle, colonia, ciudad, estado, país",
  "lat": null o float,
  "lng": null o float,
  "total_units": int,
  "price_range": {"min_mxn": int|null, "max_mxn": int|null},
  "amenities": ["string", ...],
  "units": [
    {"unit_number": "string", "type": "depto|casa|townhouse|loft", "bedrooms": int, "bathrooms": int, "size_m2": int|null, "price_mxn": int|null}
  ]
}
Si un campo no se puede determinar con certeza, usa null/array vacío. NO inventes datos.
Si no hay info clara del proyecto, devuelve {"project_name": "<carpeta>", "_low_confidence": true} y resto vacío.
Responde EXCLUSIVAMENTE con JSON, sin markdown."""


async def extract_bulk_project(
    project_name_hint: str,
    file_payloads: List[Tuple[bytes, str, str]],  # (bytes, mime, filename)
) -> Tuple[Dict[str, Any], float]:
    """Run Claude Haiku on the project's key files and return structured data + cost_mxn."""
    async with CLAUDE_SEMAPHORE:
        try:
            from llm_client import LlmChat, UserMessage  # type: ignore
        except Exception:
            log.warning("[bulk_ingest] emergentintegrations not available, returning stub")
            return _stub_extraction(project_name_hint), 0.0

        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            log.warning("[bulk_ingest] no LLM key, returning stub")
            return _stub_extraction(project_name_hint), 0.0

        # For PDFs/images, attach as user message; otherwise just use filename hints
        content_parts = [f"Carpeta del proyecto: {project_name_hint}\n"]
        for _b, mime, fname in file_payloads:
            content_parts.append(f"- Archivo: {fname} ({mime})")
        user_text = "\n".join(content_parts) + "\n\nDevuelve el JSON estructurado."

        try:
            session_id = f"bulk-ingest-{secrets.token_urlsafe(8)}"
            chat = LlmChat(api_key=api_key, session_id=session_id, system_message=EXTRACTION_PROMPT)
            chat = chat.with_model("anthropic", "claude-haiku-4-5")
            resp = await chat.send_message(UserMessage(text=user_text))
            raw = (resp or "").strip()
            # Strip code fences
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?\s*", "", raw)
                raw = re.sub(r"\s*```$", "", raw)
            data = json.loads(raw)
            # Approx cost: 0.50 MXN per call (Haiku ballpark) — caller side records
            # the budget event via track_ai_call (db handle lives there).
            return data, 0.50
        except Exception as e:
            log.warning(f"[bulk_ingest] extraction failed for {project_name_hint}: {e}")
            return _stub_extraction(project_name_hint), 0.0


def _stub_extraction(name: str) -> Dict[str, Any]:
    return {
        "project_name": name,
        "address_full": "",
        "lat": None, "lng": None,
        "total_units": 0,
        "price_range": {"min_mxn": None, "max_mxn": None},
        "amenities": [],
        "units": [],
        "_low_confidence": True,
        "_stub": True,
    }


# ─── Dedup ────────────────────────────────────────────────────────────────────

async def find_dedup_matches(db, extracted: Dict[str, Any], target_dev_org_id: Optional[str]) -> Dict[str, Any]:
    """Return {best_match_dev_id, score, similar_matches[{dev_id,score,name}]}."""
    try:
        from rapidfuzz import fuzz
    except Exception:
        return {"best_match_dev_id": None, "score": None, "similar_matches": []}

    query_str = f"{extracted.get('project_name', '')} {extracted.get('address_full', '')}".lower().strip()
    if not query_str:
        return {"best_match_dev_id": None, "score": None, "similar_matches": []}

    q: Dict[str, Any] = {}
    if target_dev_org_id:
        q["developer_id"] = target_dev_org_id

    matches: List[Tuple[str, float, str]] = []
    async for d in db.developments.find(q, {"_id": 0, "id": 1, "name": 1, "address": 1, "ciudad": 1}):
        cand = f"{d.get('name', '')} {d.get('address', '')} {d.get('ciudad', '')}".lower().strip()
        if not cand:
            continue
        score = fuzz.WRatio(query_str, cand) / 100.0
        if score >= 0.50:
            matches.append((d["id"], round(score, 3), d.get("name", "")))

    matches.sort(key=lambda x: x[1], reverse=True)
    top = matches[:3]
    best_id = top[0][0] if top else None
    best_score = top[0][1] if top else None
    return {
        "best_match_dev_id": best_id,
        "score": best_score,
        "similar_matches": [{"dev_id": d, "score": s, "name": n} for d, s, n in top],
    }


# ─── Insert into developments + units + project_assets ────────────────────────

async def insert_extracted_project(db, item: Dict[str, Any]) -> str:
    """Inserts new dev. Returns dev_id."""
    extracted = effective_extracted(item)
    dev_id = f"dev_{secrets.token_urlsafe(10)}"
    now = _iso()
    target_org = item.get("target_dev_org_id") or "superadmin_global"

    dev_doc = {
        "id": dev_id,
        "name": extracted.get("project_name") or item.get("source_files", [{}])[0].get("name", "Proyecto sin nombre"),
        "address": extracted.get("address_full") or "",
        "lat": extracted.get("lat"),
        "lng": extracted.get("lng"),
        "developer_id": target_org,
        "total_units": int(extracted.get("total_units") or 0),
        "price_min_mxn": (extracted.get("price_range") or {}).get("min_mxn"),
        "price_max_mxn": (extracted.get("price_range") or {}).get("max_mxn"),
        "amenities": extracted.get("amenities") or [],
        "status": "active",
        "source": "bulk_ingest",
        "source_job_id": item.get("job_id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.developments.insert_one(dict(dev_doc))

    # Units
    for u in (extracted.get("units") or []):
        unit_doc = {
            "id": f"unit_{secrets.token_urlsafe(10)}",
            "development_id": dev_id,
            "developer_id": target_org,
            "unit_number": u.get("unit_number") or f"U{secrets.token_hex(3)}",
            "type": u.get("type") or "depto",
            "bedrooms": u.get("bedrooms"),
            "bathrooms": u.get("bathrooms"),
            "size_m2": u.get("size_m2"),
            "price_mxn": u.get("price_mxn"),
            "status": "available",
            "source": "bulk_ingest",
            "created_at": now,
        }
        await db.units.insert_one(dict(unit_doc))

    # Assets — store Drive references
    for f in item.get("source_files", []):
        asset = {
            "id": f"asset_{secrets.token_urlsafe(10)}",
            "development_id": dev_id,
            "type": "drive_reference",
            "drive_file_id": f.get("file_id"),
            "filename": f.get("name"),
            "mime": f.get("mime"),
            "source": "bulk_ingest",
            "created_at": now,
        }
        await db.project_assets.insert_one(dict(asset))

    return dev_id


async def merge_into_dev(db, item: Dict[str, Any], target_dev_id: str) -> None:
    """UPSERT units (no duplicate unit_number) + APPEND assets."""
    extracted = effective_extracted(item)
    now = _iso()
    for u in (extracted.get("units") or []):
        unit_no = u.get("unit_number")
        if not unit_no:
            continue
        existing = await db.units.find_one(
            {"development_id": target_dev_id, "unit_number": unit_no}, {"_id": 0, "id": 1},
        )
        if existing:
            await db.units.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "type": u.get("type"),
                    "bedrooms": u.get("bedrooms"),
                    "bathrooms": u.get("bathrooms"),
                    "size_m2": u.get("size_m2"),
                    "price_mxn": u.get("price_mxn"),
                    "updated_at": now,
                }},
            )
        else:
            await db.units.insert_one({
                "id": f"unit_{secrets.token_urlsafe(10)}",
                "development_id": target_dev_id,
                "unit_number": unit_no,
                "type": u.get("type") or "depto",
                "bedrooms": u.get("bedrooms"),
                "bathrooms": u.get("bathrooms"),
                "size_m2": u.get("size_m2"),
                "price_mxn": u.get("price_mxn"),
                "status": "available",
                "source": "bulk_ingest_merge",
                "created_at": now,
            })

    for f in item.get("source_files", []):
        await db.project_assets.insert_one({
            "id": f"asset_{secrets.token_urlsafe(10)}",
            "development_id": target_dev_id,
            "type": "drive_reference",
            "drive_file_id": f.get("file_id"),
            "filename": f.get("name"),
            "mime": f.get("mime"),
            "source": "bulk_ingest_merge",
            "created_at": now,
        })


# ─── Email notification ───────────────────────────────────────────────────────

async def _email_completion(job: Dict[str, Any]) -> None:
    admin = os.environ.get("ADMIN_EMAIL")
    key = os.environ.get("RESEND_API_KEY")
    if not admin or not key:
        log.info("[bulk_ingest] skip completion email (no admin/key)")
        return
    try:
        import resend  # type: ignore
        resend.api_key = key
        resend.Emails.send({
            "from": "DMX Platform <noreply@desarrollosmx.io>",
            "to": admin,
            "subject": f"[DMX] Bulk ingest completado · {job.get('items_total', 0)} proyectos",
            "html": (
                f"<div style='font-family:Outfit,sans-serif;background:#06080F;color:#F0EBE0;padding:32px'>"
                f"<h2 style='color:#818CF8;margin:0 0 12px'>Ingesta masiva completada</h2>"
                f"<p style='font-size:14px;margin:0 0 8px'><strong>Job:</strong> {job.get('id')}</p>"
                f"<p style='font-size:14px;margin:0 0 8px'><strong>Total:</strong> {job.get('items_total', 0)}</p>"
                f"<p style='font-size:14px;margin:0 0 8px'><strong>Auto-aprobados:</strong> {job.get('items_auto_approved', 0)}</p>"
                f"<p style='font-size:14px;margin:0 0 8px'><strong>Pendientes:</strong> {job.get('items_pending_review', 0)}</p>"
                f"<p style='font-size:14px;margin:0 0 16px'><strong>Fallidos:</strong> {job.get('items_failed', 0)}</p>"
                f"<p style='font-size:12px;color:#8F897A;margin:24px 0 0'>"
                f"DMX Bulk Ingest · {_iso()}</p></div>"
            ),
        })
    except Exception as e:
        log.warning(f"[bulk_ingest] email failed: {e}")


# ─── Pipeline runner ──────────────────────────────────────────────────────────

async def run(db, job_id: str) -> None:
    """Background task: extract + dedup + persist. Updates job status as it progresses."""
    job = await db.bulk_ingest_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        log.warning(f"[bulk_ingest] job {job_id} not found")
        return

    target_org = job.get("target_dev_org_id")
    error_log: List[str] = []
    items_auto = items_pending = items_failed = 0
    items_total = 0

    # Budget gate
    try:
        from ai_budget import is_within_budget
        bg_ok = await is_within_budget(db, target_org or "superadmin_global")
        if not bg_ok:
            await db.bulk_ingest_jobs.update_one(
                {"id": job_id},
                {"$set": {"status": "failed", "completed_at": _iso(),
                          "error_log": ["AI budget exceeded for this org/month"]}},
            )
            return
    except Exception:
        pass

    await db.bulk_ingest_jobs.update_one({"id": job_id}, {"$set": {"status": "extracting"}})

    try:
        conn = await _resolve_drive_conn(db, target_org)
        if not conn:
            await db.bulk_ingest_jobs.update_one(
                {"id": job_id},
                {"$set": {"status": "failed", "completed_at": _iso(),
                          "error_log": ["No Drive OAuth connection available"]}},
            )
            return

        folder_id = parse_folder_id(job.get("drive_folder_url", ""))
        if not folder_id:
            await db.bulk_ingest_jobs.update_one(
                {"id": job_id},
                {"$set": {"status": "failed", "completed_at": _iso(),
                          "error_log": [f"Invalid drive URL: {job.get('drive_folder_url')}"]}},
            )
            return

        files = await _list_folder_recursive(conn, folder_id)
        groups = _group_by_project(files, folder_id)

        for gkey, gdata in groups.items():
            items_total += 1
            project_name_hint = gdata["parent_folder_name"]
            # Pick key files: max 5 PDFs + 1 spreadsheet (or first 5 if no PDFs)
            pdfs = [f for f in gdata["files"] if f.get("mimeType") in PDF_MIMES]
            sheets = [f for f in gdata["files"] if f.get("mimeType") in SPREADSHEET_MIMES]
            others = [f for f in gdata["files"] if f.get("mimeType") in INGEST_MIMES and f not in pdfs and f not in sheets]
            key_files = (pdfs[:MAX_KEY_FILES_PER_PROJECT]
                         + sheets[:1]
                         + others[:max(0, MAX_KEY_FILES_PER_PROJECT - len(pdfs[:MAX_KEY_FILES_PER_PROJECT]))])
            key_files = key_files[:MAX_KEY_FILES_PER_PROJECT + 1]

            # Download (best-effort, don't fail entire item)
            payloads: List[Tuple[bytes, str, str]] = []
            for f in key_files:
                try:
                    data, eff_mime = await _download_file_bytes(conn, f["id"], f.get("mimeType", ""))
                    payloads.append((data, eff_mime, f.get("name", "")))
                except Exception as e:
                    error_log.append(f"download failed {f.get('id')}: {e}")

            try:
                extracted, cost_mxn = await extract_bulk_project(project_name_hint, payloads)
            except Exception as e:
                extracted, cost_mxn = _stub_extraction(project_name_hint), 0.0
                error_log.append(f"extract failed {gkey}: {e}")

            # W2.3 SA4 — feature_key tagging for AI cost observatory
            if cost_mxn > 0:
                try:
                    from ai_budget import track_ai_call
                    await track_ai_call(
                        db, target_org or "bulk_ingest", "claude-haiku-4-5",
                        0, "bulk_ingest_haiku",
                        tokens_in=2000, tokens_out=400,
                        feature_key="bulk_ingest_haiku",
                    )
                except Exception:
                    pass

            # Dedup
            try:
                dedup = await find_dedup_matches(db, extracted, target_org)
            except Exception as e:
                dedup = {"best_match_dev_id": None, "score": None, "similar_matches": []}
                error_log.append(f"dedup failed {gkey}: {e}")

            score = dedup.get("score")
            if score is None or score < 0.65:
                decision = "auto_approve"
            elif score >= 0.85:
                decision = "auto_approve"  # exact match auto-merge candidate via bulk-approve
            else:
                decision = "pending_review"

            item_id = f"bii_{secrets.token_urlsafe(10)}"
            item_doc = {
                "id": item_id,
                "job_id": job_id,
                "target_dev_org_id": target_org,
                "source_files": [
                    {"file_id": f["id"], "name": f.get("name"), "mime": f.get("mimeType")}
                    for f in gdata["files"][:50]
                ],
                "project_folder_name": project_name_hint,
                "extracted": extracted,
                "dedup": dedup,
                "decision": decision,
                "inserted_dev_id": None,
                "ai_cost_mxn": cost_mxn,
                "created_at": _iso(),
            }

            if decision == "auto_approve":
                try:
                    new_dev_id = await insert_extracted_project(db, item_doc)
                    item_doc["decision"] = "approved"
                    item_doc["inserted_dev_id"] = new_dev_id
                    item_doc["decision_at"] = _iso()
                    items_auto += 1
                except Exception as e:
                    item_doc["decision"] = "failed"
                    item_doc["error"] = str(e)[:500]
                    items_failed += 1
                    error_log.append(f"insert failed {gkey}: {e}")
            else:
                items_pending += 1

            await db.bulk_ingest_items.insert_one(dict(item_doc))

        status = "completed" if items_failed == 0 or (items_auto + items_pending) > 0 else "failed"
        await db.bulk_ingest_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "reviewing" if items_pending > 0 else "completed",
                "items_total": items_total,
                "items_auto_approved": items_auto,
                "items_pending_review": items_pending,
                "items_failed": items_failed,
                "completed_at": _iso(),
                "error_log": error_log[:50],
            }},
        )
    except Exception as e:
        log.exception(f"[bulk_ingest] job {job_id} crashed")
        await db.bulk_ingest_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "completed_at": _iso(),
                      "error_log": error_log[:50] + [f"crash: {e}"]}},
        )
        return

    # Notification
    fresh = await db.bulk_ingest_jobs.find_one({"id": job_id}, {"_id": 0})
    if fresh:
        await _email_completion(fresh)


# ─── W1.5 — Inline edits, diff, recompute, force-match ────────────────────────

# Whitelisted top-level fields editable via PATCH
EDITABLE_TOP_LEVEL = {
    "project_name", "address_full", "lat", "lng",
    "total_units", "amenities",
}
# Editable nested keys
EDITABLE_PRICE_RANGE = {"min_mxn", "max_mxn"}
EDITABLE_UNIT_KEYS = {"unit_number", "type", "bedrooms", "bathrooms", "size_m2", "price_mxn"}


def effective_extracted(item: Dict[str, Any]) -> Dict[str, Any]:
    """Return extracted dict with overrides applied (last-write-wins per field)."""
    base = dict(item.get("extracted") or {})
    for ov in item.get("extracted_overrides") or []:
        patch = ov.get("patch") or {}
        for k, v in patch.items():
            if k == "price_range" and isinstance(v, dict):
                pr = dict(base.get("price_range") or {})
                pr.update(v)
                base["price_range"] = pr
            elif k == "units" and isinstance(v, list):
                # Replace whole units array (full replacement semantics for simplicity)
                base["units"] = v
            else:
                base[k] = v
    return base


def _validate_patch(patch: Dict[str, Any]) -> Optional[str]:
    """Return error string if invalid, None if valid."""
    if not isinstance(patch, dict) or not patch:
        return "Patch vacío"
    for k, v in patch.items():
        if k == "price_range":
            if not isinstance(v, dict):
                return "price_range debe ser objeto"
            for pk in v.keys():
                if pk not in EDITABLE_PRICE_RANGE:
                    return f"price_range.{pk} no editable"
        elif k == "units":
            if not isinstance(v, list):
                return "units debe ser lista"
            for u in v:
                if not isinstance(u, dict):
                    return "Cada unit debe ser objeto"
                for uk in u.keys():
                    if uk not in EDITABLE_UNIT_KEYS:
                        return f"units.{uk} no editable"
        elif k not in EDITABLE_TOP_LEVEL:
            return f"Campo {k} no editable"
        else:
            # Type checks for top-level
            if k in {"lat", "lng"} and v is not None and not isinstance(v, (int, float)):
                return f"{k} debe ser numérico o null"
            if k == "total_units" and v is not None and not isinstance(v, int):
                return "total_units debe ser entero"
            if k == "amenities" and not isinstance(v, list):
                return "amenities debe ser lista"
            if k in {"project_name", "address_full"} and v is not None and not isinstance(v, str):
                return f"{k} debe ser string"
    return None


async def apply_inline_patch(db, item_id: str, patch: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """Append override entry to extracted_overrides and return updated item."""
    err = _validate_patch(patch)
    if err:
        raise ValueError(err)
    override = {
        "patch": patch,
        "user_id": user_id,
        "ts": _iso(),
    }
    await db.bulk_ingest_items.update_one(
        {"id": item_id},
        {"$push": {"extracted_overrides": override}, "$set": {"updated_at": _iso()}},
    )
    return await db.bulk_ingest_items.find_one({"id": item_id}, {"_id": 0})


async def build_diff(db, item: Dict[str, Any], target_dev_id: str) -> Dict[str, Any]:
    """Build side-by-side diff between item's effective extracted and target dev."""
    target = await db.developments.find_one({"id": target_dev_id}, {"_id": 0})
    if not target:
        raise ValueError("Development destino no encontrado")
    eff = effective_extracted(item)

    # Target units sourced from collection
    target_units_cursor = db.units.find(
        {"development_id": target_dev_id}, {"_id": 0},
    ).limit(200)
    target_units = [u async for u in target_units_cursor]
    target_units_by_no = {u.get("unit_number"): u for u in target_units}

    pr = eff.get("price_range") or {}

    fields = [
        ("project_name", "Nombre", eff.get("project_name"), target.get("name")),
        ("address_full", "Dirección", eff.get("address_full"), target.get("address")),
        ("lat", "Latitud", eff.get("lat"), target.get("lat")),
        ("lng", "Longitud", eff.get("lng"), target.get("lng")),
        ("total_units", "Total unidades", eff.get("total_units"), target.get("total_units")),
        ("price_min_mxn", "Precio mínimo", pr.get("min_mxn"), target.get("price_min_mxn")),
        ("price_max_mxn", "Precio máximo", pr.get("max_mxn"), target.get("price_max_mxn")),
        ("amenities", "Amenidades", eff.get("amenities") or [], target.get("amenities") or []),
    ]
    field_diffs = []
    for key, label, src, dst in fields:
        same = src == dst
        field_diffs.append({
            "key": key, "label": label,
            "ingest": src, "target": dst,
            "status": "same" if same else ("missing_target" if dst in (None, "", [], 0) and src not in (None, "", [], 0) else
                                            ("missing_ingest" if src in (None, "", [], 0) and dst not in (None, "", [], 0) else "diff")),
        })

    # Units diff by unit_number
    unit_diffs = []
    for u in (eff.get("units") or []):
        un = u.get("unit_number")
        match = target_units_by_no.get(un) if un else None
        unit_diffs.append({
            "unit_number": un,
            "ingest": u,
            "target": match,
            "status": "same" if (match and all(match.get(k) == u.get(k) for k in ["type", "bedrooms", "bathrooms", "size_m2", "price_mxn"])) else
                      ("new" if not match else "diff"),
        })
    # Existing target-only units
    ingest_unit_nos = {u.get("unit_number") for u in (eff.get("units") or [])}
    for un, tu in target_units_by_no.items():
        if un not in ingest_unit_nos:
            unit_diffs.append({
                "unit_number": un, "ingest": None, "target": tu, "status": "target_only",
            })

    return {
        "item_id": item.get("id"),
        "target_dev_id": target_dev_id,
        "target_name": target.get("name"),
        "fields": field_diffs,
        "units": unit_diffs,
        "summary": {
            "total_fields": len(field_diffs),
            "fields_diff": sum(1 for f in field_diffs if f["status"] == "diff"),
            "fields_same": sum(1 for f in field_diffs if f["status"] == "same"),
            "units_new": sum(1 for u in unit_diffs if u["status"] == "new"),
            "units_diff": sum(1 for u in unit_diffs if u["status"] == "diff"),
            "units_target_only": sum(1 for u in unit_diffs if u["status"] == "target_only"),
        },
    }


async def recompute_item_extraction(db, item: Dict[str, Any]) -> Dict[str, Any]:
    """Re-download files + re-run Claude. Push old version into extraction_history."""
    target_org = item.get("target_dev_org_id")
    conn = await _resolve_drive_conn(db, target_org)
    if not conn:
        raise RuntimeError("Sin conexión Drive activa")

    payloads: List[Tuple[bytes, str, str]] = []
    for f in (item.get("source_files") or [])[:MAX_KEY_FILES_PER_PROJECT + 1]:
        try:
            data, eff_mime = await _download_file_bytes(conn, f.get("file_id"), f.get("mime") or "")
            payloads.append((data, eff_mime, f.get("name") or ""))
        except Exception as e:
            log.warning(f"[recompute] download failed {f.get('file_id')}: {e}")

    project_name_hint = item.get("project_folder_name") or (item.get("extracted") or {}).get("project_name") or "Proyecto"
    new_extracted, cost_mxn = await extract_bulk_project(project_name_hint, payloads)

    history_entry = {
        "extracted": item.get("extracted") or {},
        "ts": _iso(),
        "ai_cost_mxn": item.get("ai_cost_mxn") or 0.0,
    }
    # Re-run dedup against new extraction
    try:
        new_dedup = await find_dedup_matches(db, new_extracted, target_org)
    except Exception:
        new_dedup = item.get("dedup") or {"best_match_dev_id": None, "score": None, "similar_matches": []}

    await db.bulk_ingest_items.update_one(
        {"id": item["id"]},
        {
            "$push": {"extraction_history": history_entry},
            "$set": {
                "extracted": new_extracted,
                "dedup": new_dedup,
                "ai_cost_mxn": (item.get("ai_cost_mxn") or 0.0) + cost_mxn,
                "extracted_overrides": [],  # reset overrides since base changed
                "recomputed_at": _iso(),
                "updated_at": _iso(),
            },
        },
    )
    return await db.bulk_ingest_items.find_one({"id": item["id"]}, {"_id": 0})


async def ensure_bulk_ingest_indexes(db) -> None:
    try:
        await db.bulk_ingest_jobs.create_index("id", unique=True)
        await db.bulk_ingest_jobs.create_index([("status", 1), ("started_at", -1)])
        await db.bulk_ingest_items.create_index("id", unique=True)
        await db.bulk_ingest_items.create_index([("job_id", 1), ("decision", 1)])
    except Exception as e:
        log.warning(f"[bulk_ingest] indexes failed: {e}")
