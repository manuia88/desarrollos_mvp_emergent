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
                 "parking_spots", "storage_room", "orientation", "notes",
                 "vista", "parking_type", "bodega"]

_BULK_PARKING_TYPES = {"individual", "bateria_propia", "bateria_vecino", "eleva_autos"}


def _parse_bool_cell(v):
    """Sí/no, x, 1/0, true/false → bool (None si vacío)."""
    s = str(v or "").strip().lower()
    if not s:
        return None
    return s in ("si", "sí", "yes", "y", "x", "1", "true", "verdadero", "✓")


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
            "vista": (row.get("vista") or "").strip().lower() if (row.get("vista") or "").strip().lower() in ("interior", "exterior") else None,
            "parking_type": (row.get("parking_type") or "").strip().lower() if (row.get("parking_type") or "").strip().lower() in _BULK_PARKING_TYPES else None,
            "bodega": _parse_bool_cell(row.get("bodega")),
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
    calle: Optional[str] = None
    colonia: Optional[str] = None
    alcaldia: Optional[str] = None
    cp: Optional[str] = None


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
            "calle": payload.calle,
            "colonia": payload.colonia,
            "alcaldia": payload.alcaldia,
            "cp": payload.cp,
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


# ═══════════════════════════════════════════════════════════════════════════════
# FORMAS DE PAGO (esquemas R3) — hasta 5 por proyecto, ajustan precio + plan
# ═══════════════════════════════════════════════════════════════════════════════
class PaymentSchemesPut(BaseModel):
    schemes: List[Dict[str, Any]] = Field(default_factory=list)
    fecha_inicio: Optional[str] = None     # inicio de obra (para meses)
    fecha_entrega: Optional[str] = None     # entrega estimada


class PaymentQuoteBody(BaseModel):
    precio_base: float = Field(..., gt=0)
    scheme_id: Optional[str] = None         # esquema configurado
    enganche_pct: Optional[float] = None    # cotizador no-fijo
    escritura_pct: Optional[float] = None
    meses: Optional[int] = None


def _project_dates(dev: Dict[str, Any], meta: Dict[str, Any]) -> tuple:
    """Resuelve (fecha_inicio, fecha_entrega) de meta del dev o del proyecto."""
    meta = meta or {}
    dev = dev or {}
    inicio = (meta.get("fecha_inicio") or dev.get("construction_start_date")
              or dev.get("fecha_inicio_construccion"))
    entrega = (meta.get("fecha_entrega") or dev.get("expected_delivery_date")
               or dev.get("delivery_date") or dev.get("delivery_estimate"))
    return inicio, entrega


@router.get("/projects/{project_id}/payment-schemes")
async def get_payment_schemes(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    import payment_schemes as ps
    from data_developments import DEVELOPMENTS_BY_ID

    doc = await db.dev_payment_schemes.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    )
    dev = DEVELOPMENTS_BY_ID.get(project_id) or {}
    meta = await db.dev_project_meta.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {}

    schemes = (doc or {}).get("schemes") or ps.default_schemes()
    fecha_inicio = (doc or {}).get("fecha_inicio")
    fecha_entrega = (doc or {}).get("fecha_entrega")
    if not fecha_inicio or not fecha_entrega:
        di, de = _project_dates(dev, meta)
        fecha_inicio = fecha_inicio or di
        fecha_entrega = fecha_entrega or de

    return {
        "project_id": project_id,
        "schemes": schemes,
        "fecha_inicio": fecha_inicio,
        "fecha_entrega": fecha_entrega,
        "meses_auto": ps.auto_months(fecha_inicio, fecha_entrega),
        "configured": bool(doc),
    }


@router.put("/projects/{project_id}/payment-schemes")
async def put_payment_schemes(project_id: str, payload: PaymentSchemesPut, request: Request):
    user = await _auth(request)
    db = _db(request)
    import payment_schemes as ps

    errors = ps.validate_schemes(payload.schemes)
    if errors:
        raise HTTPException(400, "; ".join(errors[:6]))

    # Asegura un id por esquema
    for i, s in enumerate(payload.schemes):
        if not s.get("id"):
            s["id"] = _uid("esq")

    await db.dev_payment_schemes.update_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)},
        {"$set": {
            "project_id": project_id,
            "dev_org_id": _tenant(user),
            "schemes": payload.schemes,
            "fecha_inicio": payload.fecha_inicio,
            "fecha_entrega": payload.fecha_entrega,
            "updated_at": _now().isoformat(),
            "updated_by": user.user_id,
        }},
        upsert=True,
    )
    return {"ok": True, "project_id": project_id, "count": len(payload.schemes)}


@router.post("/projects/{project_id}/payment-quote")
async def payment_quote(project_id: str, payload: PaymentQuoteBody, request: Request):
    """Desglosa el precio bajo un esquema configurado o un enganche libre (cotizador)."""
    user = await _auth(request)
    db = _db(request)
    import payment_schemes as ps
    from data_developments import DEVELOPMENTS_BY_ID

    doc = await db.dev_payment_schemes.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {}
    schemes = doc.get("schemes") or ps.default_schemes()
    dev = DEVELOPMENTS_BY_ID.get(project_id) or {}
    meta = await db.dev_project_meta.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {}
    fi = doc.get("fecha_inicio") or _project_dates(dev, meta)[0]
    fe = doc.get("fecha_entrega") or _project_dates(dev, meta)[1]

    if payload.enganche_pct is not None:
        bd = ps.compute_custom(payload.precio_base, payload.enganche_pct, schemes,
                               escritura_pct=payload.escritura_pct, meses=payload.meses,
                               fecha_inicio=fi, fecha_entrega=fe)
        return {"ok": True, "mode": "cotizador", "breakdown": bd}

    scheme = next((s for s in schemes if s.get("id") == payload.scheme_id), None)
    if not scheme:
        raise HTTPException(404, "Esquema no encontrado")
    bd = ps.compute_breakdown(payload.precio_base, scheme, fecha_inicio=fi, fecha_entrega=fe)
    return {"ok": True, "mode": "esquema", "scheme_id": scheme.get("id"), "breakdown": bd}


# ── Cotización exportable: PDF (link público para WhatsApp) + resumen de texto ──
class QuotePdfBody(BaseModel):
    scope: str = "unidad"               # 'proyecto' | 'unidad'
    unit_id: Optional[str] = None
    unit_number: Optional[str] = None
    precio_base: Optional[float] = None  # precio de la unidad o de referencia
    mode: str = "forms"                  # 'forms' (formas configuradas) | 'custom' (a la medida)
    scheme_id: Optional[str] = None      # una sola forma (opcional)
    enganche_pct: Optional[float] = None
    escritura_pct: Optional[float] = None
    meses: Optional[int] = None
    cliente: Optional[str] = None
    text_only: bool = False              # solo resumen de texto (no genera PDF)


def _money(v) -> str:
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "—"


def _quote_rows(payload: "QuotePdfBody", schemes, base, fi, fe):
    """Devuelve [(label, breakdown)] según modo."""
    import payment_schemes as ps
    if payload.mode == "custom":
        bd = ps.compute_custom(base or 0, payload.enganche_pct or 0, schemes,
                               escritura_pct=payload.escritura_pct, meses=payload.meses,
                               fecha_inicio=fi, fecha_entrega=fe)
        return [(f"A la medida (enganche {bd.get('firma_pct')}%)", bd)]
    sel = [s for s in schemes if (not payload.scheme_id or s.get("id") == payload.scheme_id)]
    return [(s.get("nombre") or "Forma", ps.compute_breakdown(base or 0, s, fecha_inicio=fi, fecha_entrega=fe)) for s in sel]


AMENITY_LABELS = {
    "gym": "Gimnasio", "alberca": "Alberca", "concierge": "Concierge", "roof": "Roof garden",
    "spa": "Spa", "sky_lounge": "Sky lounge", "cava": "Cava", "seguridad": "Seguridad 24/7",
    "salon_eventos": "Salón de eventos", "pet_friendly": "Pet friendly", "coworking": "Coworking",
    "cine": "Cine", "asadores": "Asadores", "ludoteca": "Ludoteca", "jardin": "Jardín",
    "elevador": "Elevador", "terraza": "Terraza", "business_center": "Business center",
    "rooftop": "Rooftop", "lobby": "Lobby", "estacionamiento_visitas": "Estac. visitas",
}


async def _fetch_quote_images(db, project_id, dev, limit=2):
    """Hasta `limit` imágenes para el PDF (BytesIO RGB JPEG). Assets locales primero,
    luego fotos seed (httpx). Normaliza a RGB para evitar el 'rojo' de los JPEG en CMYK."""
    from pathlib import Path
    import dev_assets
    cand = limit + 3  # candidatas de más (algunas se descartan)
    raw = []
    try:
        cur = db.dev_assets.find(
            {"development_id": project_id, "asset_type": {"$in": ["foto_render", "foto_avance"]}},
            {"_id": 0, "public_url": 1},
        ).sort("position", 1).limit(cand)
        async for a in cur:
            pu = a.get("public_url") or ""
            p = dev_assets.ASSET_UPLOAD_DIR / Path(pu).name
            if pu and p.exists():
                raw.append(p.read_bytes())
    except Exception:
        pass
    if not raw:
        try:
            import httpx
            from services.ai_safety import is_public_url_safe
            # C4 SSRF · sin redirects (evita rebote a un host interno) y validando
            # que la URL apunte a un host público (no localhost/IP privada/metadata).
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=False) as c:
                for u in (dev.get("photos") or [])[:cand]:
                    if not is_public_url_safe(u, label="dev_photo_fetch"):
                        continue
                    try:
                        r = await c.get(u)
                        if r.status_code == 200 and r.content:
                            raw.append(r.content)
                    except Exception:
                        pass
        except Exception:
            pass
    # Normaliza a RGB y guarda a archivo (ReportLab con rutas es confiable; BytesIO da bugs de render).
    out = []
    for idx, b in enumerate(raw):
        if len(out) >= limit:
            break
        try:
            from PIL import Image as PILImage
            im = PILImage.open(io.BytesIO(b))
            if im.mode != "RGB":
                im = im.convert("RGB")
            # Descarta placeholders rojos sólidos (loremflickr a veces los manda en el demo).
            r, g, bl = im.resize((1, 1)).getpixel((0, 0))
            if r > 175 and g < 70 and bl < 70:
                continue
            fn = dev_assets.ASSET_UPLOAD_DIR / f"_qimg_{project_id}_{len(out)}.jpg"
            im.save(str(fn), format="JPEG", quality=82)
            out.append(str(fn))
        except Exception:
            pass
    return out


def _render_quote_pdf(dev, unit, prog, images, payload, rows, base, meses_auto) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from datetime import datetime as _dt

    INK = colors.HexColor("#1E2230"); MUTE = colors.HexColor("#6B7385"); SUB = colors.HexColor("#434A5C")
    THEME = colors.HexColor("#6D4AFF"); AMBER = colors.HexColor("#C77F12"); GREEN = colors.HexColor("#15803d")
    LINE = colors.HexColor("#E6E8EE"); BG2 = colors.HexColor("#F4F5F8"); WHITE = colors.white

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=12 * mm, bottomMargin=10 * mm,
                            leftMargin=13 * mm, rightMargin=13 * mm, title="Cotización")
    W = doc.width
    styles = getSampleStyleSheet()
    stH1 = ParagraphStyle("h1", parent=styles["Title"], textColor=INK, fontSize=21, leading=23, alignment=0, spaceAfter=1)
    stSub = ParagraphStyle("sub", parent=styles["Normal"], textColor=MUTE, fontSize=9.5, leading=12)
    stSec = ParagraphStyle("sec", parent=styles["Normal"], textColor=THEME, fontSize=8.5, leading=11, fontName="Helvetica-Bold", spaceAfter=3)
    stSmall = ParagraphStyle("sm", parent=styles["Normal"], textColor=MUTE, fontSize=7.5, leading=10)
    stCardV = ParagraphStyle("cv", parent=styles["Normal"], fontSize=12.5, leading=14, textColor=INK, fontName="Helvetica-Bold")
    stCardS = ParagraphStyle("cs", parent=styles["Normal"], fontSize=6.5, leading=8, textColor=MUTE)
    stChipV = ParagraphStyle("chv", parent=styles["Normal"], fontSize=11, leading=13, textColor=INK, fontName="Helvetica-Bold", alignment=TA_CENTER)
    stChipL = ParagraphStyle("chl", parent=styles["Normal"], fontSize=6.3, leading=8, textColor=MUTE, alignment=TA_CENTER)
    stBody = ParagraphStyle("bd", parent=styles["Normal"], fontSize=8.5, leading=12, textColor=SUB)

    def card(label, value, accent, subtxt=None):
        lblS = ParagraphStyle("cl", parent=styles["Normal"], fontSize=6.5, leading=8, fontName="Helvetica-Bold", textColor=accent)
        inner = [[Paragraph(label.upper(), lblS)], [Paragraph(value, stCardV)]]
        if subtxt:
            inner.append([Paragraph(subtxt, stCardS)])
        t = Table(inner)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.7, LINE),
            ("LINEABOVE", (0, 0), (-1, 0), 2, accent),
            ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (0, 0), 6), ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
        ]))
        return t

    def chip(label, value):
        t = Table([[Paragraph(value, stChipV)], [Paragraph(label.upper(), stChipL)]])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BG2), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (0, 0), 6), ("BOTTOMPADDING", (0, 0), (0, 0), 1),
            ("TOPPADDING", (0, 1), (-1, 1), 0), ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
        ]))
        return t

    def row_of(flowables, gap=6):
        n = len(flowables)
        if not n:
            return Spacer(1, 0)
        cw = (W - gap * (n - 1)) / n
        t = Table([flowables], colWidths=[cw] * n)
        sty = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]
        sty += [("LEFTPADDING", (i, 0), (i, 0), gap / 2 if i else 0) for i in range(n)]
        sty += [("RIGHTPADDING", (i, 0), (i, 0), gap / 2 if i < n - 1 else 0) for i in range(n)]
        t.setStyle(TableStyle(sty))
        return t

    def prop_bar(eng, mens, escr, h=11):
        eng, mens, escr = max(0, eng), max(0, mens), max(0, escr)
        tot = eng + mens + escr or 100
        cw = [W * eng / tot, W * mens / tot, W * escr / tot]
        # evita celdas de ancho 0 (ReportLab no las pinta)
        cw = [max(0.1, x) for x in cw]
        t = Table([["", "", ""]], colWidths=cw, rowHeights=[h])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), THEME), ("BACKGROUND", (1, 0), (1, 0), AMBER), ("BACKGROUND", (2, 0), (2, 0), GREEN),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        return t

    def img_flowable(src, box_w, box_h):
        try:
            if hasattr(src, "seek"):
                src.seek(0)
            iw, ih = ImageReader(src).getSize()
            if hasattr(src, "seek"):
                src.seek(0)
            r = (iw / ih) if ih else 1.5
            w, h = box_w, box_w / r
            if h > box_h:
                h, w = box_h, box_h * r
            return Image(src, width=w, height=h)
        except Exception:
            return None

    el = []
    # — Encabezado —
    el.append(Paragraph(dev.get("name", "Proyecto"), stH1))
    titulo = "Cotización por unidad" if payload.scope == "unidad" else "Formas de pago del proyecto"
    bits = [titulo]
    if payload.scope == "unidad" and payload.unit_number:
        bits.append(f"Unidad {payload.unit_number}")
    if base:
        bits.append(f"Precio de lista <b>{_money(base)}</b>")
    el.append(Paragraph(" · ".join(bits), stSub))
    meta = _dt.now().strftime("%d/%m/%Y")
    if payload.cliente:
        meta = f"Cliente: <b>{payload.cliente}</b>  ·  {meta}"
    if meses_auto:
        meta += f"  ·  Plazo {meses_auto} meses"
    el.append(Paragraph(meta, stSub))
    el.append(Spacer(1, 8))

    # — Imágenes —
    imgs = [f for f in (img_flowable(s, (W - 6) / max(1, len(images)), 105) for s in (images or [])) if f]
    if imgs:
        ir = Table([imgs], colWidths=[W / len(imgs)] * len(imgs))
        ir.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                                ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        el.append(ir)
        el.append(Spacer(1, 10))

    # — Características (unidad o rangos del proyecto) —
    chips = []
    if payload.scope == "unidad" and unit:
        chips = [
            chip("Recámaras", str(unit.get("bedrooms", "—"))),
            chip("Baños", str(unit.get("bathrooms", "—"))),
            chip("Estac.", str(unit.get("parking_spots", "—"))),
            chip("m² total", str(unit.get("m2_total", "—"))),
            chip("Nivel", str(unit.get("level", "—"))),
            chip("Prototipo", str(unit.get("prototype", "—"))),
        ]
        if unit.get("orientation"):
            chips.append(chip("Orientación", str(unit.get("orientation"))))
    else:
        def _rng(v):
            if isinstance(v, (list, tuple)) and len(v) >= 2:
                a, b = v[0], v[1]
                return str(a) if a == b else f"{a}–{b}"
            return str(v)
        if dev.get("bedrooms_range"):
            chips.append(chip("Recámaras", _rng(dev.get("bedrooms_range"))))
        if dev.get("bathrooms_range"):
            chips.append(chip("Baños", _rng(dev.get("bathrooms_range"))))
        if dev.get("parking_range"):
            chips.append(chip("Estac.", _rng(dev.get("parking_range"))))
        if dev.get("m2_range"):
            chips.append(chip("m²", _rng(dev.get("m2_range"))))
        if dev.get("units_total"):
            chips.append(chip("Unidades", str(dev.get("units_total"))))
        if dev.get("stage"):
            chips.append(chip("Etapa", str(dev.get("stage")).capitalize()))
    if chips:
        el.append(row_of(chips, gap=5))
        el.append(Spacer(1, 12))

    # — Plan de pago —
    el.append(Paragraph("PLAN DE PAGO", stSec))
    if payload.mode == "custom" and rows:
        bd = rows[0][1]
        eng, mens, escr = bd.get("firma_pct", 0), bd.get("mensualidades_pct", 0), bd.get("escritura_pct", 0)
        el.append(prop_bar(eng, mens, escr))
        el.append(Spacer(1, 6))
        el.append(row_of([
            card("Enganche", f"{eng:.0f}%", THEME, _money(bd.get("firma")) if base else None),
            card("Mensualidades", f"{mens:.0f}%", AMBER, _money(bd.get("mensualidades_total")) if base else None),
            card("Al escriturar", f"{escr:.0f}%", GREEN, _money(bd.get("escrituracion")) if base else None),
        ]))
        if base:
            el.append(Spacer(1, 6))
            rest = bd.get("meses_restantes")
            if bd.get("mensualidades_total"):
                mens_val = (f"{_money(bd.get('mensualidad_restante'))}/mes" if rest else _money(bd.get("mensualidades_total")))
                mens_sub = (f"{rest} mensualidades" + (f" · entrega {dev.get('delivery_estimate')}" if dev.get("delivery_estimate") else "")) if rest else None
            else:
                mens_val, mens_sub = "—", None
            el.append(row_of([
                card("Precio final", _money(bd.get("precio_aplicado")), INK, (f"ahorra {_money(bd.get('ahorro'))}" if bd.get("ahorro", 0) > 0 else None)),
                card("Al firmar", _money(bd.get("firma")), INK, f"{eng:.0f}%"),
                card("Mensualidad", mens_val, INK, mens_sub),
                card("Al escriturar", _money(bd.get("escrituracion")), INK, f"{escr:.0f}%"),
            ]))
    else:
        header = ["Forma", "Enganche", "Mensualidad", "Al escriturar", "Precio final", "Ahorro"]
        data = [header]
        for label, bd in rows:
            firma = f"{bd.get('firma_pct',0):.0f}% · {_money(bd.get('firma'))}" if base else f"{bd.get('firma_pct',0):.0f}%"
            if bd.get("mensualidades_total"):
                rest = bd.get("meses_restantes")
                mens = (f"{_money(bd.get('mensualidad_restante'))}/mes" if rest else _money(bd.get("mensualidades_total"))) if base else f"{bd.get('mensualidades_pct',0):.0f}%"
            else:
                mens = "—"
            escr = f"{bd.get('escritura_pct',0):.0f}% · {_money(bd.get('escrituracion'))}" if base else f"{bd.get('escritura_pct',0):.0f}%"
            precio = _money(bd.get("precio_aplicado")) if base else "—"
            ahorro = _money(bd.get("ahorro")) if (base and bd.get("ahorro", 0) > 0) else "—"
            data.append([label, firma, mens, escr, precio, ahorro])
        tbl = Table(data, colWidths=[W * 0.22, W * 0.17, W * 0.18, W * 0.18, W * 0.14, W * 0.11])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BG2), ("TEXTCOLOR", (0, 0), (-1, 0), INK), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8), ("TEXTCOLOR", (0, 1), (0, -1), INK), ("TEXTCOLOR", (1, 1), (-1, -1), SUB),
            ("TEXTCOLOR", (4, 1), (4, -1), INK), ("TEXTCOLOR", (5, 1), (5, -1), GREEN),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ]))
        el.append(tbl)
    el.append(Spacer(1, 13))

    # — Amenidades · Avance · Ubicación (2 columnas) —
    left = []
    ams = [AMENITY_LABELS.get(a, str(a).replace("_", " ").capitalize()) for a in (dev.get("amenities") or [])]
    if ams:
        left.append(Paragraph("AMENIDADES", stSec))
        left.append(Paragraph("  ·  ".join(ams), stBody))
        left.append(Spacer(1, 8))
    if prog and prog.get("overall_percent") is not None:
        pct = prog.get("overall_percent", 0)
        etapa = (prog.get("current_stage") or "").replace("_", " ").capitalize()
        left.append(Paragraph("AVANCE DE OBRA", stSec))
        bar = Table([["", ""]], colWidths=[max(0.1, W * 0.46 * pct / 100), max(0.1, W * 0.46 * (100 - pct) / 100)], rowHeights=[8])
        bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), THEME), ("BACKGROUND", (1, 0), (1, 0), LINE),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                 ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        left.append(bar)
        left.append(Spacer(1, 3))
        left.append(Paragraph(f"<b>{pct}%</b> completado" + (f" · {etapa}" if etapa else ""), stBody))

    right = []
    full_addr = dev.get("address_full")
    cp = dev.get("postal_code")
    if not full_addr:
        parts = [x for x in [dev.get("street"), dev.get("colonia"), dev.get("alcaldia")] if x]
        full_addr = ", ".join(parts)
        if cp and f"CP {cp}" not in full_addr:
            full_addr += f", CP {cp}"
    if full_addr:
        right.append(Paragraph("UBICACIÓN", stSec))
        full = full_addr
        if dev.get("city") and dev.get("city") not in full:
            full += f", {dev.get('city')}"
        right.append(Paragraph(full, stBody))
        if dev.get("delivery_estimate"):
            right.append(Spacer(1, 6))
            right.append(Paragraph(f"<b>Entrega estimada:</b> {dev.get('delivery_estimate')}", stBody))

    if left or right:
        two = Table([[left or [Spacer(1, 0)], right or [Spacer(1, 0)]]], colWidths=[W * 0.52, W * 0.48])
        two.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0),
                                 ("LEFTPADDING", (1, 0), (1, 0), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                 ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        el.append(two)
        el.append(Spacer(1, 12))

    el.append(Paragraph("Esta cotización es informativa y no constituye una oferta vinculante. Precios sujetos a "
                        "cambio y a disponibilidad. Las mensualidades aplican durante la construcción (del inicio de "
                        "obra a la entrega).", stSmall))
    doc.build(el)
    return buf.getvalue()


def _quote_wa_text(dev, payload, rows, base) -> str:
    """Resumen en texto plano para enviar por WhatsApp."""
    name = dev.get("name", "el proyecto")
    head = (f"Cotización · {name}"
            + (f" · Unidad {payload.unit_number}" if (payload.scope == "unidad" and payload.unit_number) else "")
            + (f" · Lista {_money(base)}" if base else ""))
    lines = [head, ""]
    for label, bd in rows:
        if base:
            rest = bd.get("meses_restantes")
            mens = (f"{rest} mensualidades de {_money(bd.get('mensualidad_restante'))}" if rest and bd.get("mensualidades_total")
                    else (_money(bd.get("mensualidades_total")) if bd.get("mensualidades_total") else "—"))
            seg = (f"• {label}: precio {_money(bd.get('precio_aplicado'))}"
                   f" | enganche {bd.get('firma_pct',0):.0f}% ({_money(bd.get('firma'))})"
                   f" | mensualidad {mens}"
                   f" | escritura {_money(bd.get('escrituracion'))}")
            if bd.get("ahorro", 0) > 0:
                seg += f" | ahorro {_money(bd.get('ahorro'))}"
        else:
            seg = (f"• {label}: enganche {bd.get('firma_pct',0):.0f}%"
                   f" / mensualidades {bd.get('mensualidades_pct',0):.0f}%"
                   f" / escritura {bd.get('escritura_pct',0):.0f}%")
        lines.append(seg)
    return "\n".join(lines)


@router.post("/projects/{project_id}/quote-pdf")
async def quote_pdf(project_id: str, payload: QuotePdfBody, request: Request):
    """Genera un PDF de cotización (link público para WhatsApp) + resumen de texto."""
    user = await _auth(request)
    db = _db(request)
    import payment_schemes as ps
    import dev_assets
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    doc = await db.dev_payment_schemes.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {}
    schemes = doc.get("schemes") or ps.default_schemes()
    meta = await db.dev_project_meta.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0}
    ) or {}
    fi = doc.get("fecha_inicio") or _project_dates(dev, meta)[0]
    fe = doc.get("fecha_entrega") or _project_dates(dev, meta)[1]
    meses_auto = ps.auto_months(fi, fe)

    base = float(payload.precio_base or 0)
    rows = _quote_rows(payload, schemes, base, fi, fe)
    if not rows:
        raise HTTPException(400, "No hay formas de pago para cotizar")

    wa_text = _quote_wa_text(dev, payload, rows, base)
    if payload.text_only:
        return {"ok": True, "wa_text": wa_text}

    # Datos extra para el PDF: unidad (specs), avance de obra e imágenes.
    unit = None
    if payload.scope == "unidad" and (payload.unit_id or payload.unit_number):
        unit = next((u for u in (dev.get("units") or [])
                     if u.get("id") == payload.unit_id or u.get("unit_number") == payload.unit_number), None)
        if unit and payload.unit_id:
            ov = await db.developer_unit_overrides.find_one({"unit_id": payload.unit_id}, {"_id": 0})
            if ov:
                unit = {**unit, **{k: v for k, v in ov.items() if v is not None and k not in ("unit_id", "dev_id", "dev_org_id")}}
    prog = await db.project_construction_progress.find_one(
        {"project_id": project_id, "dev_org_id": _tenant(user)}, {"_id": 0, "overall_percent": 1, "current_stage": 1}
    )
    images = await _fetch_quote_images(db, project_id, dev)

    pdf_bytes = _render_quote_pdf(dev, unit, prog, images, payload, rows, base, meses_auto)
    fname = f"cotizacion_{project_id}_{_uid('q')}.pdf"
    (dev_assets.ASSET_UPLOAD_DIR / fname).write_bytes(pdf_bytes)
    pdf_url = f"/api/assets-static/{fname}"

    return {"ok": True, "pdf_url": pdf_url, "filename": fname, "wa_text": wa_text}


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


_HOLD_IDX_DONE = False


async def _ensure_hold_index(db):
    """Índice único PARCIAL: una unidad no puede tener 2 apartados ACTIVOS a la vez (anti doble-reserva)."""
    global _HOLD_IDX_DONE
    if _HOLD_IDX_DONE:
        return
    try:
        await db.unit_holds.create_index(
            [("unit_id", 1)], unique=True, name="uniq_active_hold",
            partialFilterExpression={"status": "active"},
        )
    except Exception:
        pass
    _HOLD_IDX_DONE = True


@router.post("/units/{unit_id}/hold")
async def create_hold(unit_id: str, payload: HoldPayload, request: Request):
    user = await _auth(request)
    db = _db(request)
    await _ensure_hold_index(db)

    # Check existing active hold (mensaje claro · fast path). La GARANTÍA atómica real es el índice
    # único parcial: si dos compradores apartan a la vez, el 2º insert revienta con DuplicateKey → 409.
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
    try:
        await db.unit_holds.insert_one(dict(hold))
    except Exception as e:
        # DuplicateKey del índice único parcial = otro comprador apartó esta unidad en la misma carrera.
        if "duplicate key" in str(e).lower() or e.__class__.__name__ == "DuplicateKeyError":
            raise HTTPException(409, "Esta unidad acaba de ser apartada por otra persona. Elige otra.")
        raise
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
    from tenant_scope import assert_dev_project
    assert_dev_project(user, dev_id)   # no liberar apartados de otra dev
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
# 4.9 INTERNAL USERS — SUPERSEDED BY Phase 14 Batch 37 (routes_internal_users.py)
# Old endpoints removed to avoid route collision. Schemas kept for backwards-compat
# read-only references (e.g., legacy invitation seed migration).
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


# NOTE: GET/POST/PATCH/DELETE /internal-users handlers removed — see routes_internal_users.py


# Legacy POST/PATCH/DELETE /internal-users handlers removed — see routes_internal_users.py


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
