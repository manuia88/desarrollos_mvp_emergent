"""Document Intelligence — Phase 7.1 (Moat #2 base pipeline).

Goals:
- Encrypted upload (Fernet via IE_FERNET_KEY) of legal/commercial documents per development.
- Async OCR pipeline (pdfplumber for text PDFs, pytesseract+poppler for image PDFs / JPG / PNG).
- Multi-tenant guard: developer_admin → only documents of their own developments.
- Schema future-proof for Phase 7.2 (Claude structured extraction) + 7.3 (cross-checking).

Encryption strategy:
- File on disk: written encrypted with Fernet under /app/backend/uploads/document_intelligence/{doc_id}.bin
- ocr_text on Mongo: encrypted Fernet token stored in field ocr_text_enc.
- mime_type, sha256, sizes are NOT considered sensitive → stored plain.

NOTE: Phase 7.2 / 7.3 will live in a separate module (di_extraction.py) consuming `ocr_text` decrypted on-demand.
"""

from __future__ import annotations

import os
import uuid
import hashlib
import logging
import asyncio
import shutil
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

# OCR deps (installed in Phase 7.1)
try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None  # type: ignore

try:
    import pytesseract  # type: ignore
    from PIL import Image  # type: ignore
except Exception:
    pytesseract = None  # type: ignore
    Image = None  # type: ignore

try:
    import magic  # python-magic
except Exception:
    magic = None  # type: ignore


log = logging.getLogger("dmx.di")


# ─── Constants ────────────────────────────────────────────────────────────────
DI_UPLOAD_DIR = Path(os.environ.get("DI_UPLOAD_DIR", "/app/backend/uploads/document_intelligence"))
DI_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DI_MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB

DI_ALLOWED_EXT = {"pdf", "jpg", "jpeg", "png", "tif", "tiff"}

DI_DOC_TYPES = {
    "lp",                      # Lista de precios — tabulador
    "brochure",                # Brochure de marketing
    "escritura",               # Escritura pública notarial
    "permiso_seduvi",          # Permiso SEDUVI / uso de suelo
    "estudio_suelo",           # Mecánica de suelos
    "licencia_construccion",   # Licencia de construcción / obra
    "predial",                 # Impuesto predial / comprobante
    "plano_arquitectonico",    # Planos por tipo de unidad
    "contrato_cv",             # Contrato compra-venta
    "constancia_fiscal",       # Constancia situación fiscal SAT
    "otro",                    # Fallback
}

DI_DOC_TYPE_LABELS_ES = {
    "lp": "Lista de precios",
    "brochure": "Brochure",
    "escritura": "Escritura pública",
    "permiso_seduvi": "Permiso SEDUVI",
    "estudio_suelo": "Estudio de mecánica de suelos",
    "licencia_construccion": "Licencia de construcción",
    "predial": "Predial",
    "plano_arquitectonico": "Plano arquitectónico",
    "contrato_cv": "Contrato compra-venta",
    "constancia_fiscal": "Constancia fiscal",
    "otro": "Otro",
}

DI_STATUS = {"pending", "ocr_running", "ocr_done", "ocr_failed",
             "extraction_pending", "extracted", "extraction_failed"}


# ─── Fernet cipher (REUSE IE_FERNET_KEY) ──────────────────────────────────────
_cipher: Optional[Fernet] = None


def _get_cipher() -> Fernet:
    global _cipher
    if _cipher is not None:
        return _cipher
    raw = os.environ.get("IE_FERNET_KEY")
    if not raw:
        raise RuntimeError("IE_FERNET_KEY missing in environment — required for Document Intelligence encryption.")
    _cipher = Fernet(raw.encode() if isinstance(raw, str) else raw)
    return _cipher


def encrypt_bytes(data: bytes) -> bytes:
    return _get_cipher().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    return _get_cipher().decrypt(token)


def encrypt_text(text: str) -> str:
    return _get_cipher().encrypt(text.encode("utf-8")).decode("ascii")


def decrypt_text(token: str) -> str:
    if not token:
        return ""
    try:
        return _get_cipher().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        log.error("di.decrypt_text invalid token")
        return ""


# ─── Mongo indexes ────────────────────────────────────────────────────────────
async def ensure_di_indexes(db) -> None:
    docs = db.di_documents
    await docs.create_index([("development_id", 1), ("created_at", -1)])
    await docs.create_index([("status", 1)])
    await docs.create_index([("file_hash", 1)])
    await docs.create_index([("doc_type", 1)])
    await docs.create_index("id", unique=True)

    extr = db.di_extractions
    await extr.create_index("document_id")
    await extr.create_index("id", unique=True)


# ─── Hashing & file IO ────────────────────────────────────────────────────────
def sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def detect_mime(filename: str, data: bytes) -> str:
    if magic is not None:
        try:
            return magic.from_buffer(data, mime=True) or "application/octet-stream"
        except Exception:
            pass
    ext = (Path(filename).suffix or "").lower().lstrip(".")
    return {
        "pdf": "application/pdf",
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png",
        "tif": "image/tiff", "tiff": "image/tiff",
    }.get(ext, "application/octet-stream")


def write_encrypted_file(doc_id: str, data: bytes) -> str:
    path = DI_UPLOAD_DIR / f"{doc_id}.bin"
    enc = encrypt_bytes(data)
    path.write_bytes(enc)
    return str(path)


def read_encrypted_file(storage_path: str) -> bytes:
    p = Path(storage_path)
    if not p.exists():
        raise FileNotFoundError(storage_path)
    enc = p.read_bytes()
    return decrypt_bytes(enc)


# ─── OCR Engine ───────────────────────────────────────────────────────────────
def ocr_extract(file_bytes: bytes, mime_type: str, filename: str = "") -> dict:
    """
    Returns dict: {ok, text, pages, confidence, engine, error?}

    Strategy:
    - PDF: try pdfplumber first (fast, text-layer PDFs). If <50 chars total → fallback to OCR via tesseract on rendered pages (requires pdf2image / pdfplumber image conversion).
    - Image (jpg/png/tiff): pytesseract directly.
    """
    result = {
        "ok": False, "text": "", "pages": 0, "confidence": None,
        "engine": None, "error": None,
    }

    # Decide branch
    is_pdf = mime_type == "application/pdf" or filename.lower().endswith(".pdf")
    is_image = (mime_type or "").startswith("image/") or any(
        filename.lower().endswith(e) for e in (".jpg", ".jpeg", ".png", ".tif", ".tiff")
    )

    try:
        if is_pdf and pdfplumber is not None:
            text, pages = _extract_pdf_text_layer(file_bytes)
            if len(text.strip()) >= 50:
                result.update({
                    "ok": True, "text": text, "pages": pages,
                    "confidence": 0.95, "engine": "pdfplumber",
                })
                return result
            # fallback OCR
            if pytesseract is not None:
                text2, pages2, conf2 = _extract_pdf_via_ocr(file_bytes)
                result.update({
                    "ok": bool(text2.strip()),
                    "text": text2,
                    "pages": pages2 or pages,
                    "confidence": conf2,
                    "engine": "pdfplumber+tesseract_spa",
                    "error": None if text2.strip() else "OCR no produjo texto",
                })
                return result
            # No tesseract available
            result.update({
                "ok": bool(text.strip()), "text": text, "pages": pages,
                "confidence": 0.5 if text.strip() else 0.0,
                "engine": "pdfplumber",
                "error": None if text.strip() else "PDF sin capa de texto y tesseract no disponible",
            })
            return result

        if is_image and pytesseract is not None and Image is not None:
            text, conf = _extract_image_ocr(file_bytes)
            result.update({
                "ok": bool(text.strip()),
                "text": text, "pages": 1, "confidence": conf,
                "engine": "tesseract_spa",
                "error": None if text.strip() else "OCR no produjo texto",
            })
            return result

        result["error"] = f"Tipo no soportado para OCR: mime={mime_type}, filename={filename}"
        return result

    except Exception as e:
        log.exception("di.ocr_extract failed")
        result["error"] = f"{type(e).__name__}: {e}"
        return result


def _extract_pdf_text_layer(data: bytes) -> tuple[str, int]:
    if pdfplumber is None:
        return "", 0
    chunks: list[str] = []
    pages = 0
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tf:
        tf.write(data)
        tf.flush()
        with pdfplumber.open(tf.name) as pdf:
            pages = len(pdf.pages)
            for p in pdf.pages:
                t = p.extract_text() or ""
                if t:
                    chunks.append(t)
    return "\n\n".join(chunks).strip(), pages


def _extract_pdf_via_ocr(data: bytes) -> tuple[str, int, float]:
    """OCR each page rendered by pdfplumber (no pdf2image dependency)."""
    if pdfplumber is None or pytesseract is None or Image is None:
        return "", 0, 0.0
    chunks: list[str] = []
    confidences: list[float] = []
    pages = 0
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tf:
        tf.write(data)
        tf.flush()
        with pdfplumber.open(tf.name) as pdf:
            pages = len(pdf.pages)
            for page in pdf.pages:
                try:
                    pil = page.to_image(resolution=200).original
                    text, conf = _ocr_pil(pil)
                    if text:
                        chunks.append(text)
                    if conf is not None:
                        confidences.append(conf)
                except Exception as e:
                    log.warning(f"di.pdf_ocr page failed: {e}")
                    continue
    avg_conf = (sum(confidences) / len(confidences) / 100.0) if confidences else 0.0
    return "\n\n".join(chunks).strip(), pages, round(avg_conf, 3)


def _extract_image_ocr(data: bytes) -> tuple[str, float]:
    if pytesseract is None or Image is None:
        return "", 0.0
    import io
    pil = Image.open(io.BytesIO(data))
    if pil.mode not in ("RGB", "L"):
        pil = pil.convert("RGB")
    text, conf = _ocr_pil(pil)
    return text, conf


def _ocr_pil(pil) -> tuple[str, Optional[float]]:
    try:
        # extract data with confidence
        data = pytesseract.image_to_data(pil, lang="spa", output_type=pytesseract.Output.DICT)
        words = []
        confs = []
        for i, w in enumerate(data.get("text", [])):
            if w and w.strip():
                words.append(w)
                try:
                    c = float(data["conf"][i])
                    if c >= 0:
                        confs.append(c)
                except Exception:
                    pass
        text = " ".join(words).strip()
        avg = sum(confs) / len(confs) if confs else None
        return text, (round(avg / 100.0, 3) if avg is not None else None)
    except pytesseract.TesseractNotFoundError:
        log.error("tesseract binary not found")
        return "", None
    except Exception as e:
        # Fallback to plain image_to_string
        try:
            text = pytesseract.image_to_string(pil, lang="spa") or ""
            return text.strip(), None
        except Exception:
            log.warning(f"di.ocr_pil failed: {e}")
            return "", None


# ─── Public API: enqueue OCR job ──────────────────────────────────────────────
async def run_ocr_for_document(db, doc_id: str) -> None:
    """Async-safe OCR runner. Updates Mongo doc fields."""
    docs = db.di_documents
    doc = await docs.find_one({"id": doc_id})
    if not doc:
        log.error(f"di.run_ocr: doc {doc_id} not found")
        return

    await docs.update_one({"id": doc_id}, {"$set": {"status": "ocr_running"}})

    storage_path = doc.get("storage_path")
    mime = doc.get("mime_type") or ""
    filename = doc.get("filename") or ""

    try:
        file_bytes = await asyncio.to_thread(read_encrypted_file, storage_path)
    except Exception as e:
        await docs.update_one(
            {"id": doc_id},
            {"$set": {
                "status": "ocr_failed",
                "ocr_error": f"read_decrypt_failed: {e}",
                "processed_at": datetime.now(timezone.utc),
            }},
        )
        return

    res = await asyncio.to_thread(ocr_extract, file_bytes, mime, filename)

    update: dict = {
        "ocr_pages_count": res["pages"],
        "ocr_confidence": res["confidence"],
        "ocr_engine": res["engine"],
        "processed_at": datetime.now(timezone.utc),
    }
    if res["ok"]:
        # encrypt OCR text before saving
        update["ocr_text_enc"] = encrypt_text(res["text"][:500_000])  # cap 500K chars
        update["ocr_text_chars"] = len(res["text"])
        update["status"] = "ocr_done"
        update["ocr_error"] = None
    else:
        update["status"] = "ocr_failed"
        update["ocr_error"] = res.get("error") or "ocr_unknown_error"

    await docs.update_one({"id": doc_id}, {"$set": update})
    log.info(f"di.ocr done id={doc_id} status={update['status']} pages={update.get('ocr_pages_count')}")

    # Phase 7.2 — auto-trigger structured extraction on OCR success
    if update.get("status") == "ocr_done":
        try:
            from extraction_engine import auto_trigger_after_ocr
            asyncio.create_task(auto_trigger_after_ocr(db, doc_id))
        except Exception as e:
            log.warning(f"di.auto_trigger_after_ocr scheduling failed: {e}")


# ─── Sanitize for API responses ───────────────────────────────────────────────
def sanitize_document(doc: dict, *, include_ocr_preview: bool = False, ocr_preview_chars: int = 1500) -> dict:
    if not doc:
        return {}
    out = {k: v for k, v in doc.items() if k not in {"_id", "ocr_text_enc", "storage_path"}}
    # convert datetimes to iso
    for k in ("created_at", "processed_at", "expires_at",
              "period_relevant_start", "period_relevant_end"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    if include_ocr_preview:
        enc = doc.get("ocr_text_enc")
        if enc:
            text = decrypt_text(enc)
            out["ocr_preview"] = text[:ocr_preview_chars]
            out["ocr_preview_truncated"] = len(text) > ocr_preview_chars
        else:
            out["ocr_preview"] = None
            out["ocr_preview_truncated"] = False
    out["doc_type_label_es"] = DI_DOC_TYPE_LABELS_ES.get(out.get("doc_type"), out.get("doc_type"))
    return out


def utcnow():
    return datetime.now(timezone.utc)
