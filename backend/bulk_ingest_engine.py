"""W1.4 ZZ.1 — Bulk Drive Ingestion Engine.

Pipeline (async):
  1. Resolve folder_id from drive URL
  2. List Drive contents (recursive ANY depth → cada subcarpeta directa = 1 proyecto,
     hereda TODO lo anidado bajo ella; archivos sueltos en la raíz = 1 proyecto raíz)
  3. Per project: download up to 12 PDFs + 1 spreadsheet → Claude Haiku extract
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
MAX_FILES_PER_FOLDER = 2000       # tope global de archivos listados por job (seguridad)
MAX_FILES_PER_PROJECT_LIST = 60   # tope de archivos LISTADOS por proyecto (evita que un proyecto con
                                  # muchas fotos se coma el presupuesto global y tape a los demás)
MAX_KEY_FILES_PER_PROJECT = 12    # PDFs/planos DESCARGADOS+leídos por proyecto (a más, más costo de IA)
MAX_TREE_DEPTH = 10               # profundidad máxima al recorrer subcarpetas anidadas
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

# ─── Priorización de archivos para la extracción ──────────────────────────────
# La lista de precios / brochure / inventario tienen los DATOS (precio, disponibilidad, unidades).
# Los planos individuales, renders y fotos casi no aportan texto → van al final (y las imágenes se
# ingieren aparte como galería). Puntuamos por nombre de archivo + carpeta inmediata.
_PRIO_ALTA = ("precio", "disponibilidad", "lista de precio", "inventario", "cotiza", "disponible")
_PRIO_MEDIA = ("brochure", "presentaci", "ficha", "acabado", "amenidad", "memoria", "entrega")
_DEPRIO_PLANO = ("nivel ", "planta baja", "roof garden", "roofgarden", "semisotano", "semisótano",
                 "asignacion estacion", "asignación estacion", "conjunto")
_DEPRIO_VISUAL = ("render", "fachada", "interior", "patio", "foto", "detalle", "video")


def _file_priority(f: Dict[str, Any]) -> int:
    """Puntúa un archivo por lo probable que sea de DATOS. Alto = leer primero."""
    n = ((f.get("name") or "") + " " + (f.get("immediate_folder") or "")).lower()
    if any(k in n for k in _PRIO_ALTA):
        return 100
    if any(k in n for k in _PRIO_MEDIA):
        return 70
    # planos individuales por depto: H122_DEP-206, DEP 12, etc. → poco dato, al final
    if re.search(r"dep[-_ ]?\d", n) or any(k in n for k in _DEPRIO_PLANO):
        return -40
    if any(k in n for k in _DEPRIO_VISUAL):
        return -20
    return 10   # PDF genérico


# ─── Detección de carpetas-PROYECTO (cada dev arma su Drive distinto) ─────────
# Palabras de ESTATUS/FUNCIÓN: si el nombre de una carpeta es SOLO estas palabras, es un CONTENEDOR
# (p.ej. "ENTREGA INMEDIATA", "Fichas", "Desarrollos Vendidos") → hay que entrar a buscar los proyectos
# adentro. Si el nombre tiene además un identificador (p.ej. "Cervantes 101 - ENTREGA INMEDIATA"), es proyecto.
_FOLDER_STOPWORDS = {"preventa", "entrega", "inmediata", "vendido", "vendidos", "disponible",
                     "disponibles", "en", "venta", "y", "material", "informativo", "fichas", "ficha",
                     "cotizador", "rentas", "de", "del", "la", "el", "los", "las", "desarrollos",
                     "proyectos", "catalogo", "catálogo", "zona", "e", "inmediatas"}
# Carpetas que NO son proyectos ni contenedores de proyectos → saltar del todo
_SKIP_FOLDER = ("sin marca", "comision", "comisiones", "curriculum", "aliado", "plantilla", "formato",
                "escenario", "historico", "histórico", "inflacion", "inflación", "politica", "política",
                "proceso", "documentos para contrato", "recorrido", "link fotos")


def _folder_is_skip(name: str) -> bool:
    return any(k in (name or "").lower() for k in _SKIP_FOLDER)


def _folder_is_container(name: str) -> bool:
    """True si el nombre es SOLO palabras de estatus/función (→ contenedor, no proyecto)."""
    toks = [t for t in re.sub(r"[^\w\s]", " ", (name or "").lower()).split() if t]
    if not toks:
        return False
    residual = [t for t in toks if t not in _FOLDER_STOPWORDS]
    return len(residual) == 0


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
    """Devuelve una conexión Drive válida. Prefiere la OAuth del dev objetivo, luego cualquier OAuth
    conectada; si NO hay ninguna, cae a modo PÚBLICO con API key (solo lee carpetas compartidas
    'cualquiera con el link'). Así se puede ingerir un Drive público sin conectar cuenta."""
    coll = db.dev_drive_connections
    if target_dev_org_id:
        conn = await coll.find_one(
            {"developer_id": target_dev_org_id, "status": "connected"}, {"_id": 0},
        )
        if conn:
            return conn
    conn = await coll.find_one({"status": "connected"}, {"_id": 0})
    if conn:
        return conn
    api_key = os.environ.get("GOOGLE_DRIVE_API_KEY")
    if api_key:
        return {"_mode": "api_key", "api_key": api_key, "status": "connected",
                "email": "api_key(público)", "developer_id": target_dev_org_id}
    return None


# ─── Drive operations (sync wrappers via run_in_executor) ─────────────────────

async def _list_folder_recursive(conn: Dict[str, Any], folder_id: str) -> List[Dict[str, Any]]:
    """Todos los archivos bajo `folder_id` a CUALQUIER profundidad. Cada archivo se atribuye a la
    subcarpeta de PRIMER nivel de la que desciende (= el proyecto); los archivos sueltos en la raíz
    van al grupo raíz. Recorre subcarpetas anidadas (DFS, máx `MAX_TREE_DEPTH` niveles) hasta el tope
    global `MAX_FILES_PER_FOLDER`. Así una carpeta general → sub → sub-sub → … con PDFs adentro se
    agrupa bien: el proyecto es la subcarpeta directa y hereda TODO lo que cuelga de ella."""
    import time
    from drive_engine import _drive_service
    svc = await asyncio.to_thread(_drive_service, conn)
    is_api_key = bool(conn and conn.get("_mode") == "api_key")   # el key comparte cuota → throttle

    def _list_in(fid: str) -> List[Dict[str, Any]]:
        out = []
        q = f"'{fid}' in parents and trashed = false"
        page_token = None
        while True:
            # Reintenta con backoff si Google throttlea (API key comparte cuota / anti-abuso "Sorry…").
            resp = None
            for attempt in range(5):
                try:
                    resp = svc.files().list(
                        q=q, fields="files(id,name,mimeType,modifiedTime,size),nextPageToken",
                        pageSize=200, pageToken=page_token,
                        supportsAllDrives=True, includeItemsFromAllDrives=True,
                    ).execute()
                    break
                except Exception as e:  # noqa: BLE001
                    if attempt == 4:
                        log.warning(f"[bulk_ingest] list falló en {fid} tras reintentos: {str(e)[:120]}")
                        return out
                    time.sleep(1.5 * (2 ** attempt))   # 1.5s, 3s, 6s, 12s
            if is_api_key:
                time.sleep(0.25)   # respira entre páginas para no disparar el anti-abuso del key
            out.extend(resp.get("files", []) or [])
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return out

    root_items = await asyncio.to_thread(_list_in, folder_id)
    all_files: List[Dict[str, Any]] = []

    # Archivos sueltos en la raíz → grupo raíz
    for f in root_items:
        if f.get("mimeType") != FOLDER_MIME:
            all_files.append({**f, "parent_folder_id": folder_id, "parent_folder_name": ""})

    # Resolver las carpetas-PROYECTO reales: cada dev arma su Drive distinto. Las subcarpetas cuyo
    # nombre es SOLO estatus/función (PREVENTA, ENTREGA INMEDIATA, Fichas, Cotizador, Desarrollos
    # Vendidos…) son CONTENEDORES → se entra a buscar los proyectos adentro. Material/comisiones/CV se saltan.
    project_folders: List[Tuple[str, str]] = []   # (id, nombre)
    for top in root_items:
        if top.get("mimeType") != FOLDER_MIME:
            continue
        name = top.get("name") or ""
        if _folder_is_skip(name):
            continue
        if _folder_is_container(name):
            for sub in await asyncio.to_thread(_list_in, top["id"]):
                sname = sub.get("name") or ""
                if sub.get("mimeType") == FOLDER_MIME and not _folder_is_skip(sname):
                    project_folders.append((sub["id"], sname))
        else:
            project_folders.append((top["id"], name))

    # Cada carpeta-proyecto resuelta: recolecta TODO lo anidado (cualquier nivel)
    for proj_id, proj_name in project_folders:
        if len(all_files) >= MAX_FILES_PER_FOLDER:
            break
        stack: List[Tuple[str, int, str]] = [(proj_id, 1, proj_name)]   # (folder_id, depth, nombre carpeta)
        visited: set = set()
        proj_count = 0
        while stack and len(all_files) < MAX_FILES_PER_FOLDER and proj_count < MAX_FILES_PER_PROJECT_LIST:
            fid, depth, fname = stack.pop()
            if fid in visited or depth > MAX_TREE_DEPTH:
                continue
            visited.add(fid)
            for it in await asyncio.to_thread(_list_in, fid):
                if it.get("mimeType") == FOLDER_MIME:
                    stack.append((it["id"], depth + 1, it.get("name") or ""))
                else:
                    # todo lo que cuelga de la subcarpeta directa se atribuye a ESE proyecto;
                    # `immediate_folder` = la carpeta donde vive (señal "DISPONIBILIDAD Y PRECIOS" etc.)
                    all_files.append({**it, "parent_folder_id": proj_id, "parent_folder_name": proj_name,
                                      "immediate_folder": fname})
                    proj_count += 1
                    if proj_count >= MAX_FILES_PER_PROJECT_LIST or len(all_files) >= MAX_FILES_PER_FOLDER:
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
  "colonia": "string|null (SOLO el nombre de la colonia, p.ej. 'Santa María la Ribera')",
  "alcaldia": "string|null (alcaldía/municipio, p.ej. 'Cuauhtémoc')",
  "lat": null o float,
  "lng": null o float,
  "total_units": int,
  "price_range": {"min_mxn": int|null, "max_mxn": int|null},
  "delivery_date": "string|null (fecha de entrega, p.ej. SEP/2026)",
  "maintenance_fee_mxn": int|null,
  "amenities": ["string", ...],
  "units": [
    {"unit_number": "string", "status": "disponible|apartado|vendido|null", "type": "depto|casa|townhouse|loft",
     "bedrooms": int|null, "bathrooms": int|null, "size_m2": int|null, "size_m2_total": int|null,
     "storage": "string|null (bodega)", "parking": "string|null (cajones)", "price_mxn": int|null}
  ],
  "_confidence": {"project_name": 0.0-1.0, "address": 0.0-1.0, "price": 0.0-1.0, "units": 0.0-1.0}
}
IMPORTANTE: la LISTA DE PRECIOS / DISPONIBILIDAD es tu fuente principal — extrae CADA depto con su precio,
m², disponibilidad, bodega y cajón. Si un depto aparece "apartado"/"vendido" márcalo en status.
En "_confidence" califica QUÉ TAN SEGURO estás de cada grupo (1.0 = explícito en el documento · 0.5 = inferido · 0.2 = adivinado). Sé honesto: si el precio no aparece claro, pon price bajo.
Si un campo no se puede determinar con certeza, usa null/array vacío. NO inventes datos.
Si no hay info clara del proyecto, devuelve {"project_name": "<carpeta>", "_low_confidence": true} y resto vacío.
Responde EXCLUSIVAMENTE con JSON, sin markdown."""


def _extract_text_from_bytes(b: bytes, mime: str, fname: str) -> str:
    """Texto legible de bytes: PDF (pdfplumber), XLS/XLSX (openpyxl), CSV/TXT (decode). '' para
    imágenes (van por visión) o binarios. Best-effort, nunca lanza."""
    import io
    name = (fname or "").lower()
    try:
        if name.endswith((".csv", ".txt")) or mime in ("text/csv", "text/plain"):
            return b.decode("utf-8", errors="ignore")[:30000]
        if name.endswith(".pdf") or mime == "application/pdf":
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(b)) as pdf:
                    return "\n".join((pg.extract_text() or "") for pg in pdf.pages[:20])[:30000]
            except Exception as e:  # noqa: BLE001
                log.warning(f"[bulk_ingest] pdf text extract falló ({fname}): {e}")
                return ""
        if name.endswith((".xlsx", ".xls")) or "spreadsheet" in mime or mime == "application/vnd.ms-excel":
            try:
                from openpyxl import load_workbook
                wb = load_workbook(io.BytesIO(b), data_only=True, read_only=True)
                parts = []
                for ws in wb.worksheets:
                    # Filas como TABLA MARKDOWN (columnas explícitas) → la IA lee la tabla de unidades
                    # sin alucinar (antes era tab-separado, más ambiguo).
                    rows = [[("" if c is None else str(c).strip()) for c in row]
                            for row in ws.iter_rows(values_only=True)]
                    rows = [r for r in rows if any(cell for cell in r)]   # salta filas vacías
                    if not rows:
                        continue
                    width = max(len(r) for r in rows)
                    def _pad(r):
                        return r + [""] * (width - len(r))
                    parts.append(f"\n[Hoja: {ws.title}]")
                    parts.append("| " + " | ".join(_pad(rows[0])) + " |")
                    parts.append("| " + " | ".join(["---"] * width) + " |")
                    for r in rows[1:]:
                        parts.append("| " + " | ".join(_pad(r)) + " |")
                return "\n".join(parts)[:30000]
            except Exception as e:  # noqa: BLE001
                log.warning(f"[bulk_ingest] xlsx text extract falló ({fname}): {e}")
                return ""
    except Exception:  # noqa: BLE001
        pass
    return ""


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _sanitize_extraction(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validación de negocio: descarta valores imposibles (precios ≤0, m²≤0, recámaras/baños fuera de
    rango) → null en vez de basura. Evita que la IA meta -1, 0 o texto al catálogo."""
    if not isinstance(data, dict):
        return data
    pr = data.get("price_range")
    if isinstance(pr, dict):
        for k in ("min_mxn", "max_mxn"):
            v = _num(pr.get(k))
            pr[k] = int(v) if (v is not None and v > 0) else None
        if pr.get("min_mxn") and pr.get("max_mxn") and pr["min_mxn"] > pr["max_mxn"]:
            pr["min_mxn"], pr["max_mxn"] = pr["max_mxn"], pr["min_mxn"]
    tu = _num(data.get("total_units"))
    if tu is not None:
        data["total_units"] = int(tu) if 0 < tu <= 100000 else None
    clean_units = []
    for u in (data.get("units") or []):
        if not isinstance(u, dict):
            continue
        p = _num(u.get("price_mxn")); u["price_mxn"] = int(p) if (p is not None and p > 0) else None
        s = _num(u.get("size_m2")); u["size_m2"] = int(s) if (s is not None and s > 0) else None
        b = _num(u.get("bedrooms")); u["bedrooms"] = int(b) if (b is not None and 0 <= b <= 20) else None
        ba = _num(u.get("bathrooms")); u["bathrooms"] = int(ba) if (ba is not None and 0 <= ba <= 20) else None
        clean_units.append(u)
    if "units" in data:
        data["units"] = clean_units
    return data


async def _geocode_address(address: str) -> Tuple[Optional[float], Optional[float]]:
    """Geocodifica una dirección → (lat, lng) vía Nominatim (OSM · gratis · sin llave), acotado a MX.
    Fail-soft: (None, None) si falla. Completa lat/lng cuando la IA no los trae (casi siempre)."""
    if not (address or "").strip():
        return None, None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search",
                            params={"q": address, "format": "json", "limit": 1, "countrycodes": "mx"},
                            headers={"User-Agent": "DesarrollosMX/1.0 (ingest)"})
            arr = r.json()
            if isinstance(arr, list) and arr:
                return float(arr[0]["lat"]), float(arr[0]["lon"])
    except Exception as e:  # noqa: BLE001
        log.warning(f"[bulk_ingest] geocode falló: {e}")
    return None, None


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

        # Lee el CONTENIDO real de cada archivo (no solo el nombre): texto de PDF/XLS/CSV +
        # imágenes por visión. Antes solo mandaba filenames → la IA no podía llenar los campos.
        content_parts = [f"Proyecto (hint): {project_name_hint}\n"]
        imagenes = []
        for b, mime, fname in file_payloads:
            texto = _extract_text_from_bytes(b, mime, fname)
            if texto:
                content_parts.append(f"\n=== {fname} ===\n{texto[:8000]}")
            elif mime.startswith("image/") or (fname or "").lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                try:
                    from llm_client import ImageContent  # type: ignore
                    import base64 as _b64
                    imagenes.append(ImageContent(image_base64=_b64.b64encode(b).decode(),
                                                 media_type=mime if mime.startswith("image/") else "image/jpeg"))
                    content_parts.append(f"\n=== {fname} (imagen adjunta) ===")
                except Exception:  # noqa: BLE001
                    content_parts.append(f"- Archivo: {fname} ({mime})")
            else:
                content_parts.append(f"- Archivo: {fname} ({mime}) [sin texto legible]")
        user_text = "\n".join(content_parts) + "\n\nDevuelve el JSON estructurado con lo que encuentres en estos documentos."

        try:
            session_id = f"bulk-ingest-{secrets.token_urlsafe(8)}"
            chat = LlmChat(api_key=api_key, session_id=session_id, system_message=EXTRACTION_PROMPT)
            chat = chat.with_model("anthropic", "claude-haiku-4-5").with_max_tokens(8000)
            _msg = UserMessage(text=user_text, file_contents=imagenes[:4]) if imagenes else UserMessage(text=user_text)
            resp = await chat.send_message(_msg)
            data = _parse_llm_json(resp or "")   # tolera fences, comas colgantes y JSON truncado
            if not isinstance(data, dict):
                # la IA devolvió una lista u otra cosa (p.ej. una carpeta que no es un proyecto) →
                # no reventar con 'list' object has no attribute 'get', cae a stub limpio.
                raise ValueError("La IA no devolvió un objeto de proyecto")
            # Validación de negocio: nunca dejar precios/m² imposibles entrar al catálogo.
            data = _sanitize_extraction(data)
            # Geocoding: la IA casi nunca trae lat/lng → completarlas de la dirección (fail-soft).
            if data.get("lat") is None or data.get("lng") is None:
                _lat, _lng = await _geocode_address(data.get("address_full") or "")
                if _lat is not None and _lng is not None:
                    data["lat"], data["lng"], data["_geocoded"] = _lat, _lng, True
            # Approx cost: 0.50 MXN per call (Haiku ballpark) — caller side records
            # the budget event via track_ai_call (db handle lives there).
            return data, 0.50
        except Exception as e:
            log.warning(f"[bulk_ingest] extraction failed for {project_name_hint}: {e}")
            return _stub_extraction(project_name_hint), 0.0


def _parse_llm_json(text: str) -> Dict[str, Any]:
    """Parseo TOLERANTE del JSON que devuelve el LLM: quita ```fences```, aísla el objeto {…},
    borra comas colgantes y, si el JSON viene TRUNCADO (se acabó el presupuesto de tokens), lo
    cierra balanceando llaves/corchetes para rescatar lo que sí llegó. Lanza si no hay nada usable."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        pass
    i = raw.find("{")
    if i == -1:
        raise ValueError("sin objeto JSON en la respuesta")
    frag = raw[i:]
    # intento 1: hasta el último '}' + limpiar comas colgantes
    last = frag.rfind("}")
    if last != -1:
        cand = re.sub(r",\s*([}\]])", r"\1", frag[:last + 1])
        try:
            return json.loads(cand)
        except Exception:  # noqa: BLE001
            pass
    # intento 2: JSON truncado → volver al ÚLTIMO límite de elemento limpio (fuera de strings) y
    # cerrar los contenedores abiertos ahí. Rescata las unidades/campos que sí alcanzaron a llegar.
    stack: List[str] = []
    in_str = False
    esc = False
    snap_cut = -1
    snap_stack: List[str] = []
    for k, ch in enumerate(frag):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
            snap_cut, snap_stack = k + 1, list(stack)   # límite limpio tras cerrar un contenedor
        elif ch == ",":
            snap_cut, snap_stack = k + 1, list(stack)     # límite limpio tras un elemento
    if snap_cut == -1:
        raise ValueError("JSON truncado no rescatable")
    tail = frag[:snap_cut].rstrip().rstrip(",")
    closing = "".join("}" if c == "{" else "]" for c in reversed(snap_stack))
    return json.loads(re.sub(r",\s*([}\]])", r"\1", tail + closing))  # si falla, propaga → stub


def _stub_extraction(name: str) -> Dict[str, Any]:
    return {
        "project_name": name,
        "address_full": "",
        "lat": None, "lng": None,
        "total_units": 0,
        "price_range": {"min_mxn": None, "max_mxn": None},
        "amenities": [],
        "units": [],
        "_confidence": {"project_name": 0.2, "address": 0.0, "price": 0.0, "units": 0.0},
        "_low_confidence": True,
        "_stub": True,
    }


# ─── Dedup ────────────────────────────────────────────────────────────────────

_ADDR_FILLER = {"calle", "av", "avenida", "c", "col", "colonia", "no", "num", "numero",
                "int", "interior", "depto", "departamento", "piso", "cdmx", "mexico",
                "ciudad", "de", "del", "la", "el", "los", "las", "esq"}


def _norm_addr(s: str) -> str:
    """Normaliza nombre+dirección para dedup: sin acentos, sin puntuación, sin palabras de relleno
    (calle/av/col/#), espacios colapsados → matching más robusto que el fuzzy sobre texto crudo."""
    import unicodedata
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s)
    toks = [t for t in s.split() if t and t not in _ADDR_FILLER]
    return " ".join(toks)


async def find_dedup_matches(db, extracted: Dict[str, Any], target_dev_org_id: Optional[str]) -> Dict[str, Any]:
    """Return {best_match_dev_id, score, similar_matches[{dev_id,score,name}]}."""
    try:
        from rapidfuzz import fuzz
    except Exception:
        return {"best_match_dev_id": None, "score": None, "similar_matches": []}

    query_str = _norm_addr(f"{extracted.get('project_name', '')} {extracted.get('address_full', '')}")
    if not query_str:
        return {"best_match_dev_id": None, "score": None, "similar_matches": []}

    q: Dict[str, Any] = {}
    if target_dev_org_id:
        q["developer_id"] = target_dev_org_id

    matches: List[Tuple[str, float, str]] = []
    async for d in db.developments.find(q, {"_id": 0, "id": 1, "name": 1, "address": 1, "ciudad": 1}):
        cand = _norm_addr(f"{d.get('name', '')} {d.get('address', '')} {d.get('ciudad', '')}")
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

    # CABLE #1 → INTELIGENCIA DE ZONA: resolver colonia_id del catálogo. Sin esto, el development
    # NO se conecta a zone_scores / IE / walkability / gentrificación / plusvalía / absorción-por-zona.
    colonia_id = None
    colonia = extracted.get("colonia")
    alcaldia = extracted.get("alcaldia")
    try:
        from routes.wizard import _resolve_colonia_id
        colonia_id = await _resolve_colonia_id(db, colonia or extracted.get("address_full"), alcaldia)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[bulk_ingest] colonia_id no resuelto: {e}")

    dev_doc = {
        "id": dev_id,
        "name": extracted.get("project_name") or item.get("source_files", [{}])[0].get("name", "Proyecto sin nombre"),
        "address": extracted.get("address_full") or "",
        "colonia": colonia,
        "colonia_id": colonia_id,            # ← vínculo a la inteligencia de zona
        "alcaldia": alcaldia,
        "municipio": alcaldia,
        "lat": extracted.get("lat"),
        "lng": extracted.get("lng"),
        "developer_id": target_org,
        "dev_org_id": target_org,            # ← consistencia con el resto del sistema
        "total_units": int(extracted.get("total_units") or 0),
        "price_min_mxn": (extracted.get("price_range") or {}).get("min_mxn"),
        "price_max_mxn": (extracted.get("price_range") or {}).get("max_mxn"),
        "price_from": (extracted.get("price_range") or {}).get("min_mxn"),
        "delivery_estimate": extracted.get("delivery_date"),
        "maintenance_fee_mxn": extracted.get("maintenance_fee_mxn"),
        "amenities": extracted.get("amenities") or [],
        "status": "active",
        "marketplace_published": "pending",   # aprobación pre-publicar (contenido ingerido → revisar antes de ir público)
        "source": "bulk_ingest",
        "source_job_id": item.get("job_id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.developments.insert_one(dict(dev_doc))

    # CABLE #2 → COTIZADOR + FILTRO + CUBO: escribir los campos COMPLETOS de unidad (status real de
    # disponibilidad, bodega, cajón, m² total). Antes se perdían → cotizador vacío y filtro "disponible" roto.
    _ST = {"disponible": "available", "apartado": "reserved", "vendido": "sold",
           "available": "available", "reserved": "reserved", "sold": "sold"}
    for u in (extracted.get("units") or []):
        unit_doc = {
            "id": f"unit_{secrets.token_urlsafe(10)}",
            "development_id": dev_id,
            "developer_id": target_org,
            "colonia_id": colonia_id,
            "unit_number": u.get("unit_number") or f"U{secrets.token_hex(3)}",
            "type": u.get("type") or "depto",
            "bedrooms": u.get("bedrooms"),
            "bathrooms": u.get("bathrooms"),
            "size_m2": u.get("size_m2"),
            "size_m2_total": u.get("size_m2_total"),
            "storage": u.get("storage"),        # bodega
            "parking": u.get("parking"),        # cajón(es)
            "price_mxn": u.get("price_mxn"),
            "status": _ST.get((u.get("status") or "").lower().strip(), "available"),
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
            # Selección PRIORIZADA: primero los archivos de DATOS (lista de precios, disponibilidad,
            # brochure, inventario), luego genéricos; planos individuales/renders/fotos al final. Así la
            # lista de precios SIEMPRE se lee aunque haya 30 planos. Las hojas (inventario) siempre entran.
            docs = [f for f in gdata["files"] if f.get("mimeType") in (PDF_MIMES | NATIVE_DOC_MIMES)]
            sheets = [f for f in gdata["files"] if f.get("mimeType") in SPREADSHEET_MIMES]
            imgs = [f for f in gdata["files"] if (f.get("mimeType") or "").startswith("image/")]
            # imágenes SOLO si parecen de datos (lista de precios escaneada), no renders/fotos → visión
            data_imgs = [f for f in imgs if _file_priority(f) >= 70]
            ranked = sorted(docs + data_imgs, key=_file_priority, reverse=True)
            key_files = ranked[:MAX_KEY_FILES_PER_PROJECT] + sheets[:2]
            key_files = key_files[:MAX_KEY_FILES_PER_PROJECT + 2]

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

            # Gate de confianza por campo (upgrade #2): NO auto-aprobar un precio dudoso — a revisión
            # humana. Evita que la IA meta un precio adivinado al catálogo sin ojo encima.
            _conf = extracted.get("_confidence") or {}
            _price_conf = _conf.get("price")
            _has_price = bool((extracted.get("price_range") or {}).get("min_mxn"))
            if decision == "auto_approve" and _has_price and isinstance(_price_conf, (int, float)) and _price_conf < 0.6:
                decision = "pending_review"
                extracted["_needs_review"] = "precio de baja confianza (IA)"

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
        # CABLE #3: volcar las unidades ingeridas al átomo dmx_units → el Cubo OLAP / Demanda /
        # Absorción ya las ven (antes solo veían el seed). Best-effort, no rompe el job.
        try:
            from dmx_cube_feed import sync_ingested_to_atom
            res = await sync_ingested_to_atom(db, target_org)
            log.info(f"[bulk_ingest] átomo sincronizado: {res.get('synced')} units → dmx_units")
        except Exception as e:  # noqa: BLE001
            log.warning(f"[bulk_ingest] sync al átomo falló: {e}")
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


async def ingest_uploaded_files(db, job_id: str, project_name_hint: str,
                                payloads, target_org=None) -> None:
    """Ingesta por UPLOAD DIRECTO (PDF/XLS/imágenes de la compu, sin Drive) → MISMA tubería:
    Claude Haiku extrae y llena los campos → dedup → cola de revisión (auto-approve o pending).
    payloads = List[Tuple[bytes, mime, filename]]. Un batch = un proyecto."""
    try:
        try:
            extracted, cost_mxn = await extract_bulk_project(project_name_hint, payloads)
        except Exception as e:  # noqa: BLE001
            extracted, cost_mxn = _stub_extraction(project_name_hint), 0.0
            log.warning(f"[bulk_ingest] upload extract failed: {e}")
        if cost_mxn > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(db, target_org or "bulk_ingest", "claude-haiku-4-5", 0,
                                    "bulk_ingest_haiku", tokens_in=2000, tokens_out=400,
                                    feature_key="bulk_ingest_haiku")
            except Exception:  # noqa: BLE001
                pass
        try:
            dedup = await find_dedup_matches(db, extracted, target_org)
        except Exception:  # noqa: BLE001
            dedup = {"best_match_dev_id": None, "score": None, "similar_matches": []}
        score = dedup.get("score")
        decision = "auto_approve" if (score is None or score < 0.65 or score >= 0.85) else "pending_review"
        item_id = f"bii_{secrets.token_urlsafe(10)}"
        item_doc = {
            "id": item_id, "job_id": job_id, "target_dev_org_id": target_org,
            "source_files": [{"file_id": None, "name": fn, "mime": mm} for (_b, mm, fn) in payloads[:50]],
            "project_folder_name": project_name_hint, "extracted": extracted, "dedup": dedup,
            "decision": decision, "inserted_dev_id": None, "ai_cost_mxn": cost_mxn,
            "source": "upload", "created_at": _iso(),
        }
        items_auto = items_pending = items_failed = 0
        if decision == "auto_approve":
            try:
                new_dev_id = await insert_extracted_project(db, item_doc)
                item_doc.update(decision="approved", inserted_dev_id=new_dev_id, decision_at=_iso())
                items_auto = 1
            except Exception as e:  # noqa: BLE001
                item_doc.update(decision="failed", error=str(e)[:500]); items_failed = 1
        else:
            items_pending = 1
        await db.bulk_ingest_items.insert_one(dict(item_doc))
        await db.bulk_ingest_jobs.update_one({"id": job_id}, {"$set": {
            "status": "completed", "completed_at": _iso(), "items_total": 1,
            "items_auto_approved": items_auto, "items_pending_review": items_pending,
            "items_failed": items_failed}})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[bulk_ingest] upload job {job_id} failed: {e}")
        await db.bulk_ingest_jobs.update_one({"id": job_id}, {"$set": {
            "status": "failed", "completed_at": _iso(), "error_log": [str(e)[:300]]}})
