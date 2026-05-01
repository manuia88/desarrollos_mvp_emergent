"""
IE Engine — manual upload helpers (Phase A3).

Responsibilities:
- File hashing (sha256) for dedupe
- Encoding detection (UTF-8 vs Latin-1) — datasets gov MX vienen mezclados
- CSV separator auto-detect (`,` vs `;`) using csv.Sniffer
- Streaming preview: first 5 rows + headers + detected meta
- parse_manual_upload(): turn a stored file into observation dicts the same way
  fetch() does for live connectors, so downstream pipelines treat them identically
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import chardet


# ─── Limits & MIME allowlist ─────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB hard cap

# Mime → human label for the audit row. We intentionally accept octet-stream
# because government CSVs frequently arrive without a proper Content-Type.
ALLOWED_MIMES = {
    "text/csv",
    "text/tab-separated-values",
    "application/csv",
    "application/json",
    "application/geo+json",
    "application/zip",
    "application/x-zip-compressed",
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "text/plain",
}

ALLOWED_EXTS = {".csv", ".tsv", ".json", ".geojson", ".zip", ".shp", ".pdf", ".xlsx", ".xls", ".txt"}


def upload_dir() -> Path:
    base = os.environ.get("IE_UPLOAD_DIR", "/app/backend/uploads/ie_engine")
    p = Path(base)
    p.mkdir(parents=True, exist_ok=True)
    return p


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_allowed(filename: str, mime: str) -> bool:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        return False
    if mime and mime not in ALLOWED_MIMES:
        # Allow some govt servers that send "text/plain" / blank; reject anything actively wrong.
        return mime.startswith("text/") or mime.startswith("application/")
    return True


# ─── Encoding detection (UTF-8 first, then chardet) ──────────────────────────
def detect_encoding(sample: bytes) -> str:
    if sample.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig"
    try:
        sample.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        guess = chardet.detect(sample)
        enc = (guess.get("encoding") or "latin-1").lower()
        # chardet sometimes guesses windows-1252 or iso-8859-1; both decode as latin-1 safely
        if enc in ("windows-1252", "iso-8859-1", "ascii"):
            return "latin-1"
        return enc or "latin-1"


# ─── CSV separator auto-detect ───────────────────────────────────────────────
def detect_csv_separator(text_sample: str) -> str:
    """csv.Sniffer with safe fallback. CDMX gov tends to use ';' in some datasets."""
    try:
        dialect = csv.Sniffer().sniff(text_sample, delimiters=";,\t|")
        return dialect.delimiter
    except csv.Error:
        # Heuristic fallback: pick the delimiter with the highest line-count variance
        first_line = text_sample.splitlines()[0] if text_sample else ""
        for d in (";", ",", "\t", "|"):
            if d in first_line:
                return d
        return ","


# ─── Preview: first 5 rows ───────────────────────────────────────────────────
def preview_csv(file_bytes: bytes, max_rows: int = 5) -> Dict[str, Any]:
    sample = file_bytes[:131072]  # 128 KB sniff window is plenty
    encoding = detect_encoding(sample)
    try:
        text_sample = sample.decode(encoding, errors="replace")
    except LookupError:
        text_sample = sample.decode("latin-1", errors="replace")
    sep = detect_csv_separator(text_sample)

    reader = csv.reader(io.StringIO(text_sample), delimiter=sep)
    rows = []
    headers: List[str] = []
    try:
        for i, row in enumerate(reader):
            if i == 0:
                headers = row
            else:
                rows.append(row)
            if i >= max_rows:
                break
    except csv.Error as e:
        return {
            "format": "csv",
            "encoding": encoding,
            "separator": sep,
            "headers": [],
            "rows": [],
            "error": f"CSV parse error: {e}",
        }

    return {
        "format": "csv",
        "encoding": encoding,
        "separator": sep,
        "headers": headers,
        "rows": rows,
        "estimated_rows": text_sample.count("\n"),
    }


def preview_json(file_bytes: bytes) -> Dict[str, Any]:
    try:
        data = json.loads(file_bytes.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as e:
        return {"format": "json", "error": f"JSON parse error: {e}"}
    if isinstance(data, list):
        first = data[:5]
        return {"format": "json", "kind": "array", "count": len(data), "first_5": first}
    if isinstance(data, dict) and "features" in data:
        feats = data.get("features", [])
        return {"format": "geojson", "kind": "FeatureCollection",
                "feature_count": len(feats), "first_5": feats[:5]}
    return {"format": "json", "kind": "object", "keys": list(data.keys())[:20]}


def build_preview(filename: str, file_bytes: bytes) -> Dict[str, Any]:
    ext = Path(filename or "").suffix.lower()
    if ext in (".json", ".geojson"):
        return preview_json(file_bytes)
    if ext == ".zip":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                names = zf.namelist()[:20]
                return {"format": "zip", "entries": names, "entry_count": len(zf.namelist())}
        except zipfile.BadZipFile:
            return {"format": "zip", "error": "Archivo ZIP corrupto."}
    if ext in (".csv", ".tsv", ".txt"):
        return preview_csv(file_bytes)
    if ext == ".pdf":
        return {"format": "pdf", "size_kb": round(len(file_bytes) / 1024, 1),
                "note": "Vista previa de PDF no implementada en Phase A3."}
    return {"format": ext.lstrip(".") or "unknown",
            "size_kb": round(len(file_bytes) / 1024, 1)}


# ─── Parse manual upload → observations (used at upload + reprocess time) ────
def parse_manual_upload(source_id: str, storage_path: str, original_name: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Returns (observations, error_message). NEVER raises. Empty list = unsupported format → caller marks status='ingested' with 0 records."""
    try:
        path = Path(storage_path)
        if not path.exists():
            return [], "Archivo no encontrado en disco"
        data = path.read_bytes()
    except OSError as e:
        return [], f"No pude leer el archivo: {e}"

    ext = Path(original_name).suffix.lower()
    now = datetime.now(timezone.utc)
    obs: List[Dict[str, Any]] = []

    if ext in (".csv", ".tsv", ".txt"):
        sample = data[:131072]
        enc = detect_encoding(sample)
        sep = detect_csv_separator(sample.decode(enc, errors="replace"))
        try:
            text = data.decode(enc, errors="replace")
            reader = csv.DictReader(io.StringIO(text), delimiter=sep)
            for row in reader:
                obs.append({
                    "source_id": source_id,
                    "zone_id": row.get("zone_id") or row.get("colonia") or row.get("colonia_id"),
                    "payload": row,
                    "fetched_at": now,
                    "is_stub": False,
                    "upload_id": None,  # filled by caller
                })
        except (csv.Error, UnicodeDecodeError) as e:
            return [], f"Error parseando CSV: {e}"
    elif ext in (".json", ".geojson"):
        try:
            parsed = json.loads(data.decode("utf-8", errors="replace"))
        except json.JSONDecodeError as e:
            return [], f"Error parseando JSON: {e}"
        items: List[Any]
        if isinstance(parsed, list):
            items = parsed
        elif isinstance(parsed, dict) and "features" in parsed:
            items = parsed["features"]
        else:
            items = [parsed]
        for it in items:
            obs.append({
                "source_id": source_id,
                "zone_id": (it.get("properties", {}).get("zone_id")
                            if isinstance(it, dict) else None),
                "payload": it,
                "fetched_at": now,
                "is_stub": False,
                "upload_id": None,
            })
    else:
        # Unsupported (zip/pdf/xlsx) — file kept for audit but no auto-parse in A3.
        return [], None

    return obs, None
