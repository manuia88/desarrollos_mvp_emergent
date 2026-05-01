"""Phase 7.5 — Auto-Sync Engine.

Empuja extracted_data (Phase 7.2) al marketplace público mediante un overlay Mongo
que el endpoint público merge sobre el seed (`data_developments.DEVELOPMENTS`).

Mappings aplicados (per doc_type → fields):
  lp                    → developments.{price_from, price_to, unit_types_count} + units_overlay (upsert por unidad por tipo+planta)
  brochure              → developments.{description (locked-aware), amenities (merge dedup), search_keywords, hero_text}
  escritura             → developments.{legal_clauses_summary[], legal_verified=true, notario, no_escritura}
  plano_arquitectonico  → developments.floorplan_assets += {tipo_unidad, m2, distribucion, doc_id, orientacion}
  permiso_seduvi        → developments.{unidades_autorizadas, uso_suelo, altura_max, seduvi_no_oficio, seduvi_vigencia}
  licencia_construccion → developments.{m2_construccion_autorizados, licencia_no, licencia_vigencia, licencia_niveles}
  predial               → developments.predial_private (private — solo dev+superadmin via /developer/sync-preview, no expuesto al marketplace)
  constancia_fiscal     → developments.fiscal_private (privado, idem)

Pausa de auto-apply:
  - IE_PROY_RISK_LEGAL = red → pause; preview todavía calculable.
  - locked_fields = ["description"] etc → skip esos campos para auto-apply.

Audit log:
  - cada cambio aplicado: {audit_id, field, old, new, source_doc_id, applied_at, applied_by, can_revert}
  - revert restaura old; encadena nuevo audit revert.
"""

from __future__ import annotations

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from document_intelligence import decrypt_text

log = logging.getLogger("dmx.di.autosync")

ENGINE_VERSION = "1.0"

PUBLIC_FIELDS = {
    "description", "amenities", "search_keywords", "hero_text",
    "price_from", "price_to", "unit_types_count",
    "legal_clauses_summary", "legal_verified", "notario", "no_escritura",
    "floorplan_assets",
    "unidades_autorizadas", "uso_suelo", "altura_max", "seduvi_no_oficio", "seduvi_vigencia",
    "m2_construccion_autorizados", "licencia_no", "licencia_vigencia", "licencia_niveles",
}
PRIVATE_FIELDS = {"predial_private", "fiscal_private"}
ALL_OVERLAY_FIELDS = PUBLIC_FIELDS | PRIVATE_FIELDS


def _now():
    return datetime.now(timezone.utc)


def _mk_id(prefix="audit"):
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


# ─── Helpers ──────────────────────────────────────────────────────────────────
async def _latest_extractions_by_type(db, dev_id: str) -> Dict[str, Dict[str, Any]]:
    cursor = db.di_documents.find(
        {"development_id": dev_id, "status": "extracted"},
        {"_id": 0},
    ).sort("created_at", -1)
    docs = [d async for d in cursor]
    seen: Dict[str, Dict[str, Any]] = {}
    for d in docs:
        dt = d.get("doc_type")
        if dt in seen:
            continue
        extr = await db.di_extractions.find_one(
            {"document_id": d["id"], "ok": True},
            sort=[("generated_at", -1)],
        )
        if not extr:
            continue
        try:
            data = json.loads(decrypt_text(extr.get("extracted_data_enc") or ""))
        except Exception:
            continue
        seen[dt] = {"doc_id": d["id"], "data": data, "filename": d.get("filename")}
    return seen


async def get_overlay(db, dev_id: str) -> Dict[str, Any]:
    o = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0})
    if not o:
        return {
            "development_id": dev_id,
            "fields": {},
            "units_overlay": [],
            "locked_fields": [],
            "audit": [],
            "last_auto_sync_at": None,
            "auto_sync_paused_reason": None,
        }
    return o


async def _save_overlay(db, dev_id: str, overlay: Dict[str, Any]):
    overlay["development_id"] = dev_id
    overlay["updated_at"] = _now()
    await db.dev_overlays.replace_one({"development_id": dev_id}, overlay, upsert=True)


async def is_pricing_paused(db, dev_id: str) -> bool:
    """Pause auto-apply if IE_PROY_RISK_LEGAL is red."""
    s = await db.ie_scores.find_one({"zone_id": dev_id, "code": "IE_PROY_RISK_LEGAL"})
    return bool(s and not s.get("is_stub") and s.get("tier") == "red")


# ─── Seed lookup ─────────────────────────────────────────────────────────────
def _seed_dev(dev_id: str) -> Dict[str, Any]:
    from data_developments import DEVELOPMENTS_BY_ID
    return DEVELOPMENTS_BY_ID.get(dev_id) or {}


# ─── Mappings (one fn per doc_type, returns {fields, units_overlay?}) ────────
def _round_int(x):
    try:
        return int(round(float(x)))
    except Exception:
        return None


def map_lp(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    units = extracted.get("unidades") or []
    precios = [float(u["precio"]) for u in units if isinstance(u.get("precio"), (int, float))]
    fields: Dict[str, Any] = {}
    if precios:
        fields["price_from"] = _round_int(min(precios))
        fields["price_to"] = _round_int(max(precios))
    tipos = {u.get("tipo") for u in units if u.get("tipo")}
    if tipos:
        fields["unit_types_count"] = len(tipos)

    units_overlay: List[Dict[str, Any]] = []
    for i, u in enumerate(units):
        units_overlay.append({
            "id": f"u_lp_{i+1}",
            "tipo": u.get("tipo"),
            "bedrooms": u.get("recamaras"),
            "bathrooms": u.get("banos"),
            "area_sqm": u.get("m2"),
            "floor": u.get("planta"),
            "price": u.get("precio"),
            "status": (u.get("status") or "disponible").lower(),
            "is_auto_synced": True,
        })
    return {"fields": fields, "units_overlay": units_overlay}


def map_brochure(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    if extracted.get("description"):
        fields["description"] = (extracted["description"] or "").strip()[:1500]
    if extracted.get("hero_text"):
        fields["hero_text"] = extracted["hero_text"]
    am = [a for a in (extracted.get("amenidades") or []) if isinstance(a, str)]
    if am:
        # Merge with existing seed amenities (dedup case-insensitive)
        seed_am = (_seed_dev(dev_id).get("amenities") or [])
        seen = {x.lower(): x for x in seed_am}
        for a in am:
            seen.setdefault(a.lower(), a)
        fields["amenities"] = list(seen.values())
    kw = [k for k in (extracted.get("palabras_clave") or []) if isinstance(k, str)]
    if kw:
        fields["search_keywords"] = kw[:20]
    return {"fields": fields}


def map_escritura(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    if extracted.get("clausulas_importantes"):
        fields["legal_clauses_summary"] = list(extracted["clausulas_importantes"])[:6]
    if extracted.get("notario"):
        fields["notario"] = extracted["notario"]
    if extracted.get("no_escritura"):
        fields["no_escritura"] = extracted["no_escritura"]
    fields["legal_verified"] = True
    return {"fields": fields}


def map_plano(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    if not extracted:
        return {"fields": {}}
    asset = {
        "tipo_unidad": extracted.get("tipo_unidad"),
        "m2": extracted.get("m2"),
        "distribucion": extracted.get("distribucion") or [],
        "orientacion": extracted.get("orientacion"),
        "escala": extracted.get("escala"),
    }
    return {"fields": {"floorplan_assets": [asset]}}  # accumulator merge in apply


def map_seduvi(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    for src, dst in [
        ("unidades_autorizadas", "unidades_autorizadas"),
        ("uso_suelo", "uso_suelo"),
        ("altura_max", "altura_max"),
        ("no_oficio", "seduvi_no_oficio"),
        ("vigencia", "seduvi_vigencia"),
    ]:
        v = extracted.get(src)
        if v is not None:
            fields[dst] = v
    return {"fields": fields}


def map_licencia(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    for src, dst in [
        ("m2_construccion", "m2_construccion_autorizados"),
        ("no_licencia", "licencia_no"),
        ("vigencia", "licencia_vigencia"),
        ("niveles", "licencia_niveles"),
    ]:
        v = extracted.get(src)
        if v is not None:
            fields[dst] = v
    return {"fields": fields}


def map_predial(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    return {"fields": {"predial_private": {
        "cuenta_catastral": extracted.get("cuenta_catastral"),
        "vigencia": extracted.get("vigencia"),
        "monto_pagado": extracted.get("monto_pagado"),
        "estatus_pago": extracted.get("estatus_pago"),
    }}}


def map_constancia(extracted: Dict[str, Any], dev_id: str) -> Dict[str, Any]:
    return {"fields": {"fiscal_private": {
        "rfc": extracted.get("rfc"),
        "razon_social": extracted.get("razon_social"),
        "regimen": extracted.get("regimen"),
        "fecha_emision": extracted.get("fecha_emision"),
    }}}


MAPPERS = {
    "lp": map_lp,
    "brochure": map_brochure,
    "escritura": map_escritura,
    "plano_arquitectonico": map_plano,
    "permiso_seduvi": map_seduvi,
    "licencia_construccion": map_licencia,
    "predial": map_predial,
    "constancia_fiscal": map_constancia,
}


# ─── Preview / Apply / Revert ────────────────────────────────────────────────
async def compute_changes(db, dev_id: str) -> Dict[str, Any]:
    """Dry run — return list of (field, current_value, proposed_value, source_doc_id, has_conflict)."""
    seed = _seed_dev(dev_id)
    overlay = await get_overlay(db, dev_id)
    extractions = await _latest_extractions_by_type(db, dev_id)
    locked = set(overlay.get("locked_fields") or [])

    proposals: Dict[str, Dict[str, Any]] = {}
    floorplans_acc: List[Dict[str, Any]] = []
    units_overlay: Optional[List[Dict[str, Any]]] = None
    units_source_doc: Optional[str] = None

    for doc_type, mapper in MAPPERS.items():
        record = extractions.get(doc_type)
        if not record:
            continue
        m = mapper(record["data"], dev_id)
        for fname, fval in (m.get("fields") or {}).items():
            if doc_type == "plano_arquitectonico" and fname == "floorplan_assets":
                # accumulate
                floorplans_acc.extend(fval)
                continue
            proposals[fname] = {
                "value": fval,
                "source_doc_id": record["doc_id"],
                "source_doc_type": doc_type,
                "source_filename": record.get("filename"),
            }
        if m.get("units_overlay"):
            units_overlay = m["units_overlay"]
            units_source_doc = record["doc_id"]

    if floorplans_acc:
        proposals["floorplan_assets"] = {
            "value": floorplans_acc,
            "source_doc_id": None,
            "source_doc_type": "plano_arquitectonico",
            "source_filename": "varios",
        }

    # Build diff list
    diffs: List[Dict[str, Any]] = []
    overlay_fields = overlay.get("fields") or {}
    for fname, p in proposals.items():
        # Resolve current effective value (overlay > seed)
        current = overlay_fields.get(fname, seed.get(fname))
        proposed = p["value"]
        if current == proposed:
            continue  # nothing to do
        diffs.append({
            "field": fname,
            "current": current,
            "proposed": proposed,
            "source_doc_id": p["source_doc_id"],
            "source_doc_type": p["source_doc_type"],
            "source_filename": p["source_filename"],
            "is_locked": fname in locked,
            "is_private": fname in PRIVATE_FIELDS,
        })

    units_diff = None
    if units_overlay is not None:
        existing = overlay.get("units_overlay") or []
        if existing != units_overlay:
            units_diff = {
                "current_count": len(existing),
                "proposed_count": len(units_overlay),
                "source_doc_id": units_source_doc,
                "current_units": existing[:50],
                "proposed_units": units_overlay[:50],
            }

    paused = await is_pricing_paused(db, dev_id)

    return {
        "development_id": dev_id,
        "diffs": diffs,
        "units_diff": units_diff,
        "auto_sync_paused": paused,
        "auto_sync_paused_reason": "IE_PROY_RISK_LEGAL=red — resuelve cross-check críticos primero." if paused else None,
        "engine_version": ENGINE_VERSION,
    }


async def apply_changes(db, dev_id: str, *, applied_by: str = "system",
                        only_high_confidence: bool = False,
                        units_history_source: str = "auto_sync") -> Dict[str, Any]:
    """Apply pending diffs to the overlay. Skips locked & paused fields. Logs each change in audit[]."""
    paused = await is_pricing_paused(db, dev_id)
    if paused and only_high_confidence:
        return {"ok": False, "error": "auto_sync_paused", "reason": "IE_PROY_RISK_LEGAL=red"}

    overlay = await get_overlay(db, dev_id)
    locked = set(overlay.get("locked_fields") or [])
    overlay_fields = dict(overlay.get("fields") or {})

    changes = await compute_changes(db, dev_id)
    applied: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for d in changes["diffs"]:
        if d["field"] in locked:
            skipped.append({**d, "reason": "field_locked_by_developer"})
            continue
        old = overlay_fields.get(d["field"])
        overlay_fields[d["field"]] = d["proposed"]
        audit_entry = {
            "audit_id": _mk_id("audit"),
            "field": d["field"],
            "old": old,
            "new": d["proposed"],
            "source_doc_id": d["source_doc_id"],
            "source_doc_type": d["source_doc_type"],
            "applied_at": _now(),
            "applied_by": applied_by,
            "can_revert": True,
            "kind": "apply",
        }
        overlay.setdefault("audit", []).append(audit_entry)
        applied.append({"field": d["field"], "audit_id": audit_entry["audit_id"]})

    overlay["fields"] = overlay_fields

    # Units overlay
    if changes.get("units_diff"):
        # always full-replace (LP wins over previous LP)
        new_units = []
        # rehydrate from compute_changes by re-running mappers
        extractions = await _latest_extractions_by_type(db, dev_id)
        if "lp" in extractions:
            new_units = map_lp(extractions["lp"]["data"], dev_id).get("units_overlay", [])
            for u in new_units:
                u["source_doc_id"] = extractions["lp"]["doc_id"]
        old_units = overlay.get("units_overlay") or []
        overlay["units_overlay"] = new_units
        # Phase 7.9 — record per-unit field changes (precio, status, etc.)
        try:
            from units_history import diff_units_overlay_and_record
            await diff_units_overlay_and_record(
                db, development_id=dev_id,
                old_units=old_units, new_units=new_units,
                source=units_history_source,
                source_doc_id=extractions.get("lp", {}).get("doc_id"),
                changed_by_user_id=applied_by,
            )
        except Exception as e:
            import logging; logging.getLogger("dmx.auto_sync").warning(f"units_history diff failed: {e}")
        audit_entry = {
            "audit_id": _mk_id("audit"),
            "field": "units_overlay",
            "old_count": len(old_units),
            "new_count": len(new_units),
            "old": old_units,
            "new": new_units,
            "source_doc_id": extractions.get("lp", {}).get("doc_id"),
            "source_doc_type": "lp",
            "applied_at": _now(),
            "applied_by": applied_by,
            "can_revert": True,
            "kind": "apply_units",
        }
        overlay.setdefault("audit", []).append(audit_entry)
        applied.append({"field": "units_overlay", "audit_id": audit_entry["audit_id"]})

    overlay["last_auto_sync_at"] = _now()
    await _save_overlay(db, dev_id, overlay)

    # invalidate seed cache (live merge in _dev_public via async helper)
    try:
        from server import invalidate_dev_overlay_cache
        invalidate_dev_overlay_cache(dev_id)
    except Exception:
        pass

    return {
        "ok": True, "applied": applied, "skipped": skipped,
        "applied_count": len(applied), "skipped_count": len(skipped),
        "auto_sync_paused": paused,
    }


async def revert_audit(db, dev_id: str, audit_id: str, applied_by: str = "manual") -> Dict[str, Any]:
    overlay = await get_overlay(db, dev_id)
    audit = overlay.get("audit") or []
    target = next((a for a in audit if a.get("audit_id") == audit_id), None)
    if not target:
        return {"ok": False, "error": "audit_not_found"}
    if not target.get("can_revert"):
        return {"ok": False, "error": "not_revertable"}

    field = target["field"]
    if field == "units_overlay":
        overlay["units_overlay"] = target.get("old") or []
    else:
        if "fields" not in overlay:
            overlay["fields"] = {}
        old = target.get("old")
        if old is None:
            overlay["fields"].pop(field, None)
        else:
            overlay["fields"][field] = old

    # Mark original audit as no longer revertable; append new revert audit
    target["can_revert"] = False
    overlay.setdefault("audit", []).append({
        "audit_id": _mk_id("revert"),
        "field": field,
        "old": target.get("new"),
        "new": target.get("old"),
        "source_doc_id": target.get("source_doc_id"),
        "source_doc_type": target.get("source_doc_type"),
        "applied_at": _now(),
        "applied_by": applied_by,
        "can_revert": False,
        "kind": "revert",
        "reverted_audit_id": audit_id,
    })

    await _save_overlay(db, dev_id, overlay)

    try:
        from server import invalidate_dev_overlay_cache
        invalidate_dev_overlay_cache(dev_id)
    except Exception:
        pass

    return {"ok": True, "reverted_audit_id": audit_id}


# ─── Apply effective dev for marketplace ─────────────────────────────────────
async def get_effective_dev(db, dev_id: str) -> Dict[str, Any]:
    """Merge seed + overlay (overlay wins for synced fields, units_overlay replaces if present)."""
    seed = dict(_seed_dev(dev_id))
    if not seed:
        return {}
    overlay = await get_overlay(db, dev_id)
    fields = overlay.get("fields") or {}
    for k, v in fields.items():
        if k in PRIVATE_FIELDS:
            continue  # never expose to public
        seed[k] = v
    seed["_overlay_synced_fields"] = sorted(k for k in fields.keys() if k in PUBLIC_FIELDS)
    seed["last_auto_sync_at"] = overlay.get("last_auto_sync_at").isoformat() if overlay.get("last_auto_sync_at") else None
    units_overlay = overlay.get("units_overlay") or []
    if units_overlay:
        # Replace seed units with overlay (developer-published source of truth)
        seed["units"] = units_overlay
    return seed


async def get_audit(db, dev_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    overlay = await get_overlay(db, dev_id)
    audit = overlay.get("audit") or []
    audit_sorted = sorted(audit, key=lambda a: a.get("applied_at") or _now(), reverse=True)
    out = []
    for a in audit_sorted[:limit]:
        a2 = dict(a)
        ts = a2.get("applied_at")
        if isinstance(ts, datetime):
            a2["applied_at"] = ts.isoformat()
        out.append(a2)
    return out


# ─── Locked fields management ────────────────────────────────────────────────
async def set_field_lock(db, dev_id: str, field: str, locked: bool) -> Dict[str, Any]:
    overlay = await get_overlay(db, dev_id)
    locked_fields = set(overlay.get("locked_fields") or [])
    if locked:
        locked_fields.add(field)
    else:
        locked_fields.discard(field)
    overlay["locked_fields"] = sorted(locked_fields)
    await _save_overlay(db, dev_id, overlay)
    return {"ok": True, "locked_fields": overlay["locked_fields"]}


# ─── Auto-trigger ────────────────────────────────────────────────────────────
async def auto_trigger_after_extraction(db, dev_id: str) -> None:
    """Auto-apply if: no conflicts AND not paused. Otherwise enqueue review."""
    try:
        # If RISK_LEGAL=red → pause (don't auto-apply)
        if await is_pricing_paused(db, dev_id):
            log.info(f"auto_sync paused dev={dev_id} reason=risk_legal_red")
            overlay = await get_overlay(db, dev_id)
            overlay["auto_sync_paused_reason"] = "IE_PROY_RISK_LEGAL=red"
            await _save_overlay(db, dev_id, overlay)
            return
        # Apply (skip locked)
        await apply_changes(db, dev_id, applied_by="auto")
    except Exception as e:
        log.exception(f"auto_sync auto_trigger failed dev={dev_id}: {e}")


async def ensure_indexes(db) -> None:
    coll = db.dev_overlays
    await coll.create_index("development_id", unique=True)
