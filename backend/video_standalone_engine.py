"""W5.22 Z.4 · Video Standalone engine.

Capa standalone sobre el bundle W5.16 Studio Video (tools #39+#40 ya shipped).
NO redefine adapters · REUSA `studio_video_engine.generate_video_multiratio`
(que internamente usa `studio_video_providers.generate_with_fallback`).

Diferencias vs StudioVideoPage W5.16-C:
    - Queue robust: retry 3x exponential ante provider_error + fallback chain visible.
    - Hook Predictor gate (W5.22 Z.5): warning si score<60 (NO bloquea).
    - History filtrable (date · provider · status · ratio).
    - Export pipeline: PDF report (reportlab) + WhatsApp share + download.

Colecciones:
    db.video_standalone_jobs  — job tracking standalone (status · retry · fallback ·
                                hook_check · export history). NO duplica studio_video_cache.

El render de video reusa db.studio_video_cache + db.studio_videos (W5.16-B).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import quote

log = logging.getLogger("dmx.video_standalone_engine")

JOBS_COLLECTION = "video_standalone_jobs"
SUPPORTED_PROVIDERS = ("luma", "pika", "runway", "replicate_kling")
SUPPORTED_DURATIONS = (30, 60, 90)
SUPPORTED_RATIOS = ("1:1", "9:16", "16:9")
HOOK_THRESHOLD = 60
MAX_RETRIES = 3
RETRY_BASE_DELAY_S = 0.5  # exponential: 0.5 · 1.0 · 2.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _video_id() -> str:
    return f"vstd_{uuid.uuid4().hex[:12]}"


def _iso(v: Any) -> Any:
    return v.isoformat() if hasattr(v, "isoformat") else v


# ─── Hook Predictor gate (W5.22 Z.5) · FAIL-OPEN ─────────────────────────────
async def _check_hook_score(db, script: str, audience: Optional[str]) -> Optional[Dict[str, Any]]:
    """Llama hook_predictor_engine sobre el inicio del script. NO bloquea.

    Returns {score, passes, threshold, suggestion, warning} · None si falla (FAIL-OPEN).
    """
    body = (script or "").strip()
    if not body:
        return None
    try:
        from hook_predictor_engine import predict_hook_score
        res = await predict_hook_score(db, text=body[:500], target_audience=audience)
        score = int(res.get("score") or 0)
        threshold = int(res.get("threshold") or HOOK_THRESHOLD)
        passes = bool(res.get("passes"))
        warning = None
        if not passes:
            warning = (
                f"El hook obtuvo {score}/100 (umbral {threshold}). "
                "Considera reforzarlo antes de generar para mejorar el desempeño."
            )
        return {
            "score": score,
            "threshold": threshold,
            "passes": passes,
            "suggestion": res.get("suggestion"),
            "warning": warning,
            "source": res.get("source"),
        }
    except Exception as exc:
        log.warning(f"[video_standalone] hook gate failed (fail-open): {exc}")
        return None


# ─── Generate robust · retry 3x exponential + fallback chain ─────────────────
async def generate_video_robust(
    db,
    dev_org_id: Optional[str],
    user_id: Optional[str],
    script: str,
    image_url: Optional[str] = None,
    provider: Optional[str] = None,
    audience: Optional[str] = None,
    duration_sec: int = 60,
    hook_check: bool = False,
) -> Dict[str, Any]:
    """Genera video reusando W5.16 multiratio con retry 3x + fallback chain.

    - hook_check: si True corre Hook Predictor gate (warning si score<60 · NO bloquea).
    - quota_exceeded: NO reintenta · retorna inmediato con quota.
    - FAIL-OPEN: si el bundle W5.16 cae por completo → job status=error + retry suggestion.
    """
    body = (script or "").strip()
    if not body:
        return {"ok": False, "reason": "script_empty"}

    prov = (provider or "luma").strip().lower()
    if prov not in SUPPORTED_PROVIDERS:
        prov = "luma"
    dur = duration_sec if duration_sec in SUPPORTED_DURATIONS else 60

    video_id = _video_id()
    now = _now()

    hook_result: Optional[Dict[str, Any]] = None
    if hook_check:
        hook_result = await _check_hook_score(db, body, audience)

    job: Dict[str, Any] = {
        "video_id": video_id,
        "task_id": None,
        "user_id": user_id,
        "dev_org_id": dev_org_id,
        "script": body[:5000],
        "script_chars": len(body),
        "image_url": image_url,
        "audience": audience,
        "provider_preferred": prov,
        "provider_used": None,
        "duration_sec": dur,
        "ratios": {},
        "master_url": None,
        "is_stub": None,
        "cost_usd": 0.0,
        "status": "processing",
        "retry_count": 0,
        "fallback_attempts": [],
        "hook_check": hook_result,
        "error_reason": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db[JOBS_COLLECTION].insert_one(dict(job))
    except Exception as exc:
        log.warning(f"[video_standalone] job insert failed: {exc}")

    # Retry 3x exponential · fallback chain via generate_video_multiratio
    last_reason = "unknown"
    result: Optional[Dict[str, Any]] = None
    attempts = 0
    for attempt in range(MAX_RETRIES):
        attempts = attempt + 1
        try:
            from studio_video_engine import generate_video_multiratio
            result = await generate_video_multiratio(
                db,
                dev_org_id=dev_org_id,
                script=body,
                image_url=image_url,
                provider=prov,
                duration_sec=dur,
                user_id=user_id,
            )
        except Exception as exc:
            log.warning(f"[video_standalone] multiratio threw (attempt {attempts}): {exc}")
            result = {"ok": False, "reason": f"engine_error_{type(exc).__name__}"}

        if result.get("ok"):
            break
        last_reason = result.get("reason") or "unknown"
        # quota_exceeded: NO reintentar
        if last_reason == "quota_exceeded":
            await _update_job(db, video_id, {
                "status": "error", "error_reason": "quota_exceeded",
                "retry_count": attempts,
            })
            return {
                "ok": False, "reason": "quota_exceeded", "video_id": video_id,
                "quota": result.get("quota"), "hook_check": hook_result,
            }
        # backoff exponential antes del próximo intento
        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(RETRY_BASE_DELAY_S * (2 ** attempt))

    if not result or not result.get("ok"):
        # FAIL-OPEN · job error con retry suggestion
        await _update_job(db, video_id, {
            "status": "error", "error_reason": last_reason, "retry_count": attempts,
        })
        return {
            "ok": False,
            "reason": last_reason,
            "video_id": video_id,
            "retry_suggestion": "El proveedor no respondió. Reintenta en unos segundos o cambia de proveedor.",
            "hook_check": hook_result,
        }

    # Éxito · persistir estado final
    ratios = result.get("ratios") or {}
    patch = {
        "task_id": result.get("task_id"),
        "provider_used": result.get("provider"),
        "ratios": ratios,
        "master_url": result.get("master_url"),
        "is_stub": bool(result.get("is_stub")),
        "cost_usd": float(result.get("cost_usd") or 0),
        "status": "completed",
        "retry_count": attempts,
        "fallback_attempts": result.get("fallback_attempts") or [],
        "error_reason": None,
    }
    await _update_job(db, video_id, patch)

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "anon", "role": "advisor"},
            action="video_standalone.generated",
            entity_type="video_standalone",
            entity_id=video_id,
            after={
                "provider": result.get("provider"), "is_stub": patch["is_stub"],
                "cost_usd": patch["cost_usd"], "retry_count": attempts,
            },
        )
    except Exception as exc:
        log.debug(f"[video_standalone] audit skipped: {exc}")

    return {
        "ok": True,
        "video_id": video_id,
        "task_id": result.get("task_id"),
        "provider": result.get("provider"),
        "provider_preferred": prov,
        "ratios": ratios,
        "master_url": result.get("master_url"),
        "is_stub": patch["is_stub"],
        "cost_usd": patch["cost_usd"],
        "duration_sec": dur,
        "status": "completed",
        "retry_count": attempts,
        "fallback_attempts": patch["fallback_attempts"],
        "hook_check": hook_result,
        "quota": result.get("quota"),
        "generated_at": now.isoformat(),
    }


async def _update_job(db, video_id: str, patch: Dict[str, Any]) -> None:
    patch = dict(patch)
    patch["updated_at"] = _now()
    try:
        await db[JOBS_COLLECTION].update_one({"video_id": video_id}, {"$set": patch})
    except Exception as exc:
        log.warning(f"[video_standalone] job update failed: {exc}")


# ─── History filtrable ───────────────────────────────────────────────────────
async def get_user_history(
    db,
    user_id: Optional[str],
    limit: int = 50,
    filters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Últimos jobs del user con filtros (days · provider · status · ratio)."""
    limit = max(1, min(int(limit or 50), 200))
    filters = filters or {}
    q: Dict[str, Any] = {}
    if user_id:
        q["user_id"] = user_id

    days = filters.get("days")
    if days:
        try:
            cutoff = _now() - timedelta(days=max(1, min(int(days), 365)))
            q["created_at"] = {"$gte": cutoff}
        except (TypeError, ValueError):
            pass

    prov = filters.get("provider")
    if prov:
        q["$or"] = [{"provider_used": prov}, {"provider_preferred": prov}]
    status = filters.get("status")
    if status in ("queued", "processing", "completed", "error"):
        q["status"] = status
    ratio = filters.get("ratio")
    if ratio in SUPPORTED_RATIOS:
        q[f"ratios.{ratio}"] = {"$nin": [None, ""]}

    items: List[Dict[str, Any]] = []
    try:
        cursor = db[JOBS_COLLECTION].find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
        async for d in cursor:
            d["created_at"] = _iso(d.get("created_at"))
            d["updated_at"] = _iso(d.get("updated_at"))
            items.append(d)
    except Exception as exc:
        log.warning(f"[video_standalone] history failed: {exc}")

    active = sum(1 for it in items if it.get("status") in ("queued", "processing"))
    return {"items": items, "count": len(items), "active": active}


async def get_job(db, video_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Job by id · si user_id se pasa, enforce ownership (tenant isolation)."""
    try:
        q: Dict[str, Any] = {"video_id": video_id}
        if user_id:
            q["user_id"] = user_id
        doc = await db[JOBS_COLLECTION].find_one(q, {"_id": 0})
        if doc:
            doc["created_at"] = _iso(doc.get("created_at"))
            doc["updated_at"] = _iso(doc.get("updated_at"))
        return doc
    except Exception as exc:
        log.warning(f"[video_standalone] get_job failed: {exc}")
        return None


async def delete_video(db, video_id: str, user_id: Optional[str]) -> Dict[str, Any]:
    """Borra job (own only) · audit."""
    try:
        q: Dict[str, Any] = {"video_id": video_id}
        if user_id:
            q["user_id"] = user_id
        res = await db[JOBS_COLLECTION].delete_one(q)
        deleted = res.deleted_count > 0
        if deleted:
            try:
                from audit_immutable_engine import log as audit_log
                await audit_log(
                    db,
                    actor={"user_id": user_id or "anon", "role": "advisor"},
                    action="video_standalone.deleted",
                    entity_type="video_standalone",
                    entity_id=video_id,
                    after={"deleted": True},
                )
            except Exception:
                pass
        return {"ok": deleted, "deleted": deleted}
    except Exception as exc:
        log.warning(f"[video_standalone] delete failed: {exc}")
        return {"ok": False, "deleted": False, "error": str(exc)}


# ─── Export · PDF report + download ──────────────────────────────────────────
def _build_pdf_report(job: Dict[str, Any]) -> bytes:
    """Genera PDF report con reportlab (Helvetica built-in · sin TTF externos)."""
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.pdfgen import canvas as _canvas

    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    margin = 20 * mm
    y = h - margin

    ink = HexColor("#0D1017")
    accent = HexColor("#6366F1")
    muted = HexColor("#6B7280")

    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin, y, "DESARROLLOSMX · STUDIO VIDEO STANDALONE")
    y -= 10 * mm
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin, y, "Reporte de video")
    y -= 8 * mm
    c.setFillColor(muted)
    c.setFont("Helvetica", 9)
    c.drawString(margin, y, f"ID: {job.get('video_id', '')}  ·  generado: {str(job.get('updated_at') or job.get('created_at') or '')[:19]}")
    y -= 12 * mm

    # Script
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Guion")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    script = (job.get("script") or "")[:1800]
    for line in _wrap_lines(script, 95):
        if y < margin + 50 * mm:
            c.showPage(); y = h - margin
            c.setFillColor(ink); c.setFont("Helvetica", 9)
        c.drawString(margin, y, line)
        y -= 5 * mm
    y -= 6 * mm

    # Analytics
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Detalle")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    rows = [
        ("Proveedor", str(job.get("provider_used") or job.get("provider_preferred") or "-")),
        ("Duración", f"{job.get('duration_sec', '-')}s"),
        ("Estado", str(job.get("status") or "-")),
        ("Reintentos", str(job.get("retry_count", 0))),
        ("Costo USD", f"${float(job.get('cost_usd') or 0):.2f}"),
        ("Demo (stub)", "sí" if job.get("is_stub") else "no"),
    ]
    hk = job.get("hook_check") or {}
    if hk:
        rows.append(("Hook score", f"{hk.get('score', '-')}/100"))
    for label, val in rows:
        c.setFillColor(muted); c.drawString(margin, y, label)
        c.setFillColor(ink); c.drawString(margin + 45 * mm, y, val)
        y -= 5.5 * mm
    y -= 6 * mm

    # Ratio links
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Enlaces por formato")
    y -= 6 * mm
    c.setFont("Helvetica", 8)
    for ratio in SUPPORTED_RATIOS:
        url = (job.get("ratios") or {}).get(ratio) or "-"
        c.setFillColor(muted); c.drawString(margin, y, ratio)
        c.setFillColor(accent); c.drawString(margin + 20 * mm, y, str(url)[:90])
        y -= 5.5 * mm

    c.showPage()
    c.save()
    return buf.getvalue()


def _wrap_lines(text: str, width: int) -> List[str]:
    out: List[str] = []
    for paragraph in (text or "").splitlines() or [""]:
        words = paragraph.split(" ")
        line = ""
        for word in words:
            if len(line) + len(word) + 1 > width:
                out.append(line)
                line = word
            else:
                line = f"{line} {word}".strip()
        out.append(line)
    return out or [""]


async def export_video(db, video_id: str, user_id: Optional[str], fmt: str = "pdf") -> Dict[str, Any]:
    """Export: fmt=pdf → reportlab bytes · fmt=download → ratio URLs. Audit."""
    job = await get_job(db, video_id, user_id=user_id)
    if not job:
        return {"ok": False, "reason": "not_found"}

    fmt = (fmt or "pdf").strip().lower()
    if fmt not in ("pdf", "download"):
        return {"ok": False, "reason": "format_invalid"}

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "anon", "role": "advisor"},
            action="video_standalone.exported",
            entity_type="video_standalone",
            entity_id=video_id,
            after={"format": fmt},
        )
    except Exception:
        pass

    if fmt == "download":
        return {
            "ok": True, "format": "download", "video_id": video_id,
            "ratios": job.get("ratios") or {}, "master_url": job.get("master_url"),
            "is_stub": bool(job.get("is_stub")),
        }

    try:
        pdf_bytes = await asyncio.to_thread(_build_pdf_report, job)
    except Exception as exc:
        log.warning(f"[video_standalone] pdf build failed: {exc}")
        return {"ok": False, "reason": f"pdf_error_{type(exc).__name__}"}
    return {
        "ok": True, "format": "pdf", "video_id": video_id,
        "pdf_bytes": pdf_bytes, "filename": f"video-{video_id}.pdf",
    }


async def share_to_whatsapp(db, video_id: str, user_id: Optional[str], ratio: str = "9:16") -> Dict[str, Any]:
    """Genera wa.me link con hook + URL del ratio elegido."""
    job = await get_job(db, video_id, user_id=user_id)
    if not job:
        return {"ok": False, "reason": "not_found"}
    if ratio not in SUPPORTED_RATIOS:
        ratio = "9:16"
    url = (job.get("ratios") or {}).get(ratio) or job.get("master_url") or ""
    hook = (job.get("script") or "").strip().split("\n")[0][:160]
    text = f"{hook}\n\n{url}".strip() if hook else url
    wa_url = f"https://wa.me/?text={quote(text)}"
    return {
        "ok": True, "video_id": video_id, "ratio": ratio,
        "url": url, "text": text, "wa_url": wa_url,
        "is_stub": bool(job.get("is_stub")),
    }


# ─── Superadmin stats ────────────────────────────────────────────────────────
async def get_superadmin_stats(db, days: int = 30) -> Dict[str, Any]:
    """KPIs globales: total · success rate · avg cost · top providers · top users."""
    days = max(1, min(int(days or 30), 365))
    cutoff = _now() - timedelta(days=days)
    total = 0
    completed = 0
    cost_sum = 0.0
    by_provider: Dict[str, int] = {}
    by_user: Dict[str, int] = {}
    try:
        cursor = db[JOBS_COLLECTION].find(
            {"created_at": {"$gte": cutoff}},
            {"_id": 0, "status": 1, "cost_usd": 1, "provider_used": 1,
             "provider_preferred": 1, "user_id": 1},
        )
        async for d in cursor:
            total += 1
            if d.get("status") == "completed":
                completed += 1
            try:
                cost_sum += float(d.get("cost_usd") or 0)
            except (TypeError, ValueError):
                pass
            prov = d.get("provider_used") or d.get("provider_preferred") or "unknown"
            by_provider[prov] = by_provider.get(prov, 0) + 1
            uid = d.get("user_id") or "anon"
            by_user[uid] = by_user.get(uid, 0) + 1
    except Exception as exc:
        log.warning(f"[video_standalone] superadmin stats failed: {exc}")

    top_providers = sorted(
        ({"provider": k, "count": v} for k, v in by_provider.items()),
        key=lambda x: x["count"], reverse=True,
    )[:5]
    top_users = sorted(
        ({"user_id": k, "count": v} for k, v in by_user.items()),
        key=lambda x: x["count"], reverse=True,
    )[:10]
    return {
        "days": days,
        "total_videos": total,
        "completed": completed,
        "success_rate_pct": round(100.0 * completed / total, 1) if total else 0.0,
        "avg_cost_usd": round(cost_sum / total, 4) if total else 0.0,
        "total_cost_usd": round(cost_sum, 2),
        "top_providers": top_providers,
        "top_users": top_users,
    }


# ─── ensure_indexes (idempotente) ────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db[JOBS_COLLECTION].create_index("video_id", unique=True, background=True)
        await db[JOBS_COLLECTION].create_index(
            [("user_id", 1), ("created_at", -1)], background=True,
        )
        await db[JOBS_COLLECTION].create_index([("created_at", -1)], background=True)
        await db[JOBS_COLLECTION].create_index("status", background=True)
        log.info("[video_standalone] indexes OK")
    except Exception as exc:
        log.warning(f"[video_standalone] ensure_indexes failed: {exc}")
