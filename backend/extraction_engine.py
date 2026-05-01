"""Phase 7.2 — Document Intelligence Structured Extraction Engine.

Pipeline:
  ocr_done → extraction_pending → extracted | extraction_failed

Per doc_type template (see recipes/extraction/__init__.py) drives:
  - JSON schema description in the prompt.
  - Light validation of expected keys.

Encryption:
  - di_extractions.extracted_data_enc → Fernet token (reuses IE_FERNET_KEY).
  - extracted_data is decrypted on-demand in API responses.

Budget:
  - Shared $5/session pool with narrative_engine via Mongo `narrative_budget` collection
    (we record cost_usd in the same place to keep one global cap).
"""

from __future__ import annotations

import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from document_intelligence import (
    encrypt_text, decrypt_text, decrypt_bytes,
)
from recipes.extraction import TEMPLATES, get_template, validate_extraction_keys

log = logging.getLogger("dmx.di.extraction")

EXTRACTION_PROMPT_VERSION = "1.0"
EXTRACTION_MODEL = "claude-sonnet-4-5-20250929"
EXTRACTION_MAX_TOKENS = 2000
EXTRACTION_TEMP_BASE = 0.0
EXTRACTION_TEMP_RETRY = 0.1
EXTRACTION_MAX_RETRIES = 2

# Pricing approx (Claude Sonnet 4.5)
PRICE_IN_PER_1K = 0.003
PRICE_OUT_PER_1K = 0.015
SESSION_BUDGET_CAP_USD = 5.0


def _now():
    return datetime.now(timezone.utc)


SYSTEM_PROMPT_TEMPLATE = """Eres un extractor preciso de datos legales y comerciales de documentos inmobiliarios mexicanos (es-MX).

REGLAS ABSOLUTAS:
1. SOLO devuelves un JSON válido, sin markdown, sin texto antes ni después.
2. Si NO encuentras un campo, devuelve `null`. JAMÁS inventes valores.
3. Para arrays, devuelve `[]` si no encuentras información.
4. Mantén exactamente las llaves del schema. No agregues ni renombres campos.
5. Números en MXN: enteros o decimales sin símbolos ni comas (ej. 12500000.50, no "$12,500,000.50").
6. Fechas en ISO (YYYY-MM-DD). Si solo hay año, usa YYYY-01-01 e incluye nota en otro campo si aplica.

CONTEXTO DEL DOCUMENTO: {description}

SCHEMA OBLIGATORIO:
{schema_json}

NOTAS ADICIONALES:
{hints}

Devuelve únicamente el JSON con esos campos. Si el OCR es ilegible o vacío, devuelve TODOS los campos con `null` o `[]`.
"""


def _build_system_prompt(doc_type: str) -> str:
    tpl = get_template(doc_type)
    return SYSTEM_PROMPT_TEMPLATE.format(
        description=tpl["description"],
        schema_json=json.dumps(tpl["schema"], ensure_ascii=False, indent=2),
        hints=tpl.get("hints") or "—",
    )


def _build_user_prompt(ocr_text: str) -> str:
    # Cap OCR text to keep prompt bounded; Claude 200K context, but pricier.
    text = (ocr_text or "").strip()
    if len(text) > 60_000:
        text = text[:60_000] + "\n\n[... texto truncado por longitud ...]"
    return f"TEXTO OCR DEL DOCUMENTO:\n\n{text}\n\nResponde con el JSON estricto siguiendo el schema."


async def _budget_used(db) -> float:
    """Total Claude cost spent in last 1h (rolling window) — shared with narrative."""
    cutoff = _now() - timedelta(hours=1)
    pipe = [
        {"$match": {"generated_at": {"$gte": cutoff}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_usd"}}},
    ]
    res_n = await db.ie_narratives.aggregate(pipe).to_list(length=1)
    res_e = await db.di_extractions.aggregate(pipe).to_list(length=1)
    base = float(res_n[0]["cost"]) if res_n else 0.0
    base += float(res_e[0]["cost"]) if res_e else 0.0
    return base


def _strip_markdown_json(s: str) -> str:
    """Claude sometimes wraps in ```json ... ``` despite instructions."""
    s = (s or "").strip()
    if s.startswith("```"):
        # Drop first line + last fence
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    return s


async def _call_claude(doc_id: str, doc_type: str, ocr_text: str, temperature: float) -> Dict[str, Any]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")

    system_prompt = _build_system_prompt(doc_type)
    user_prompt = _build_user_prompt(ocr_text)

    chat = LlmChat(
        api_key=api_key,
        session_id=f"di_extract_{doc_id}_{int(_now().timestamp())}",
        system_message=system_prompt,
    ).with_model("anthropic", EXTRACTION_MODEL)

    resp = await chat.send_message(UserMessage(text=user_prompt))
    raw = (resp or "").strip()

    in_tokens = (len(system_prompt) + len(user_prompt)) // 4
    out_tokens = len(raw) // 4
    cost = (in_tokens / 1000.0) * PRICE_IN_PER_1K + (out_tokens / 1000.0) * PRICE_OUT_PER_1K

    return {
        "raw": raw,
        "input_tokens": in_tokens,
        "output_tokens": out_tokens,
        "cost_usd": round(cost, 6),
        "model": EXTRACTION_MODEL,
        "temperature": temperature,
    }


def _parse_and_validate(raw: str, doc_type: str) -> tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    text = _strip_markdown_json(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return False, None, f"JSON inválido: {e}"
    if not isinstance(data, dict):
        return False, None, f"Respuesta no es objeto JSON (tipo {type(data).__name__})"
    ok, missing = validate_extraction_keys(doc_type, data)
    if not ok:
        return False, None, f"Faltan llaves requeridas: {missing}"
    return True, data, None


async def ensure_extraction_indexes(db) -> None:
    coll = db.di_extractions
    await coll.create_index("id", unique=True)
    await coll.create_index([("document_id", 1), ("generated_at", -1)])
    await coll.create_index("doc_type")


async def run_extraction(db, doc_id: str, *, force: bool = False) -> Dict[str, Any]:
    """Main entry. Loads doc, decrypts OCR, calls Claude, persists encrypted extraction."""
    doc = await db.di_documents.find_one({"id": doc_id})
    if not doc:
        return {"ok": False, "error": "doc_not_found"}

    if doc.get("status") not in ("ocr_done", "extracted", "extraction_pending", "extraction_failed"):
        return {"ok": False, "error": f"status_invalid:{doc.get('status')}"}

    doc_type = doc.get("doc_type") or "otro"

    # Decrypt OCR text
    enc = doc.get("ocr_text_enc")
    if not enc:
        await db.di_documents.update_one(
            {"id": doc_id},
            {"$set": {"status": "extraction_failed", "extraction_error": "ocr_text vacío"}},
        )
        return {"ok": False, "error": "ocr_text_empty"}
    ocr_text = decrypt_text(enc) if isinstance(enc, str) else ""

    # Budget gate
    spent = await _budget_used(db)
    if spent >= SESSION_BUDGET_CAP_USD:
        await db.di_documents.update_one(
            {"id": doc_id},
            {"$set": {"status": "extraction_failed", "extraction_error": f"budget_cap_reached: ${spent:.4f} ≥ ${SESSION_BUDGET_CAP_USD}"}},
        )
        return {"ok": False, "error": "budget_cap_reached"}

    await db.di_documents.update_one({"id": doc_id}, {"$set": {"status": "extraction_pending", "extraction_error": None}})

    last_err: Optional[str] = None
    last_call: Dict[str, Any] = {}
    parsed: Optional[Dict[str, Any]] = None

    # Up to 2 retries (3 attempts total)
    for attempt in range(EXTRACTION_MAX_RETRIES + 1):
        temperature = EXTRACTION_TEMP_BASE if attempt == 0 else EXTRACTION_TEMP_RETRY
        try:
            call = await _call_claude(doc_id, doc_type, ocr_text, temperature)
            last_call = call
        except Exception as e:
            last_err = f"claude_call_failed: {type(e).__name__}: {e}"
            log.exception(f"di.extract claude failed doc={doc_id} attempt={attempt}")
            await asyncio.sleep(0.6 * (attempt + 1))
            continue

        ok, data, err = _parse_and_validate(call["raw"], doc_type)
        if ok:
            parsed = data
            last_err = None
            break
        last_err = err

    if not parsed:
        await db.di_documents.update_one(
            {"id": doc_id},
            {"$set": {
                "status": "extraction_failed",
                "extraction_error": last_err or "unknown",
                "extraction_attempts": EXTRACTION_MAX_RETRIES + 1,
                "extraction_last_attempt_at": _now(),
            }},
        )
        # Persist diagnostic record (no extracted_data)
        await db.di_extractions.insert_one({
            "id": f"diex_{uuid.uuid4().hex[:14]}",
            "document_id": doc_id,
            "doc_type": doc_type,
            "schema_version": EXTRACTION_PROMPT_VERSION,
            "ok": False,
            "error": last_err,
            "model": last_call.get("model"),
            "input_tokens": last_call.get("input_tokens"),
            "output_tokens": last_call.get("output_tokens"),
            "cost_usd": last_call.get("cost_usd", 0.0),
            "raw_response": (last_call.get("raw") or "")[:5000],
            "generated_at": _now(),
        })
        return {"ok": False, "error": last_err}

    extr_id = f"diex_{uuid.uuid4().hex[:14]}"
    encrypted_data = encrypt_text(json.dumps(parsed, ensure_ascii=False))
    await db.di_extractions.insert_one({
        "id": extr_id,
        "document_id": doc_id,
        "doc_type": doc_type,
        "schema_version": EXTRACTION_PROMPT_VERSION,
        "ok": True,
        "extracted_data_enc": encrypted_data,
        "model": last_call.get("model"),
        "temperature": last_call.get("temperature"),
        "input_tokens": last_call.get("input_tokens"),
        "output_tokens": last_call.get("output_tokens"),
        "cost_usd": last_call.get("cost_usd", 0.0),
        "generated_at": _now(),
    })

    await db.di_documents.update_one(
        {"id": doc_id},
        {"$set": {
            "status": "extracted",
            "extraction_id": extr_id,
            "extraction_error": None,
            "extraction_attempts": 1,
            "extraction_last_attempt_at": _now(),
        }},
    )

    # Phase 7.3 — auto-trigger cross-check (if dev has ≥2 extracted docs)
    try:
        from cross_check_engine import auto_trigger_after_extraction
        await auto_trigger_after_extraction(db, doc.get("development_id"))
    except Exception as e:
        log.warning(f"di.cross_check auto_trigger failed: {e}")

    return {"ok": True, "extraction_id": extr_id, "data": parsed, "cost_usd": last_call.get("cost_usd", 0.0)}


# ─── Sanitize for API ─────────────────────────────────────────────────────────
def sanitize_extraction(extr: dict) -> dict:
    if not extr:
        return {}
    out = {k: v for k, v in extr.items() if k not in {"_id", "extracted_data_enc"}}
    enc = extr.get("extracted_data_enc")
    if enc:
        try:
            txt = decrypt_text(enc) if isinstance(enc, str) else ""
            out["extracted_data"] = json.loads(txt) if txt else None
        except Exception as e:
            out["extracted_data"] = None
            out["decrypt_error"] = str(e)
    else:
        out["extracted_data"] = None
    g = out.get("generated_at")
    if isinstance(g, datetime):
        out["generated_at"] = g.isoformat()
    return out


async def get_latest_extraction(db, doc_id: str) -> Optional[dict]:
    extr = await db.di_extractions.find_one(
        {"document_id": doc_id, "ok": True},
        sort=[("generated_at", -1)],
    )
    return sanitize_extraction(extr) if extr else None


async def auto_trigger_after_ocr(db, doc_id: str) -> None:
    """Hook called from document_intelligence.run_ocr_for_document on success."""
    try:
        await run_extraction(db, doc_id)
    except Exception as e:
        log.exception(f"di.auto_trigger_after_ocr failed doc={doc_id}: {e}")
