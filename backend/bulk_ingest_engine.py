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
MAX_FILES_PER_FOLDER = 6000       # tope global de archivos listados por job (EDIFOR pegó 2000)
MAX_FILES_PER_PROJECT_LIST = 600  # tope de archivos LISTADOS por proyecto (el recon ve el árbol COMPLETO;
                                  # con 60 la lista de precios de Over quedó fuera y la IA nunca la vio)
# Modelo para EXTRACCIÓN (listas de precios + planos): Sonnet 5 (claude-sonnet-5, GA jun-2026 — verificado
# en docs oficiales platform.claude.com; Sonnet 4.6 ya es legacy). La disponibilidad/precios NO pueden salir
# mal (decisión founder 07-08). Haiku queda para tareas baratas del resto del sistema. Override por env.
BULK_INGEST_MODEL = os.environ.get("BULK_INGEST_MODEL", "claude-sonnet-5")
# Timeout LLM para la ingesta (job de fondo): Sonnet leyendo 15 docs + PDFs nativos tarda >60s legítimamente.
# El tope global de 60s (anti-DoS) sigue intacto para los caminos de usuario.
BULK_INGEST_LLM_TIMEOUT = float(os.environ.get("BULK_INGEST_LLM_TIMEOUT", "300"))
MAX_KEY_FILES_PER_PROJECT = 15    # PDFs DESCARGADOS+leídos por proyecto (datos primero + planos para
                                  # cruzar por unidad; a más, más costo de IA)
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
                "proceso", "documentos para contrato", "recorrido", "link fotos",
                # 07-08 · drives reales: versiones viejas contaminan · facturas/brokers/marketing no son proyectos
                "versiones antiguas", "version antigua", "old version", "facturas", "factura", "brokers",
                "broker", "registro", "contacto", "contact", "why ", "buying proc", "aniversary",
                "chill out", "maps & locations", "acerca de", "carta convenio", "cuenta bancaria")


def _folder_is_skip(name: str) -> bool:
    return any(k in (name or "").lower() for k in _SKIP_FOLDER)


_CONTAINER_KEYWORDS = ("developments", "desarrollos", "proyectos", "re-ventas", "reventas",
                       "casas premium", "townhouses", "torres", "inventario general")


def _folder_is_container(name: str) -> bool:
    # contiene palabra-contenedor (aunque traiga marca/número: "4_DEVELOPMENTS", "2.- PROYECTOS DE TSALACH")
    _n = (name or "").lower()
    if any(k in _n for k in _CONTAINER_KEYWORDS):
        return True
    return _folder_is_container_stopwords(name)


def _folder_is_container_stopwords(name: str) -> bool:
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


_FILE_URL_RE = re.compile(r"(?:spreadsheets|document|file)/d/([a-zA-Z0-9_-]{10,})")


def parse_drive_file_id(url: str) -> Optional[str]:
    """URL de ARCHIVO de Drive (Sheets/Docs/file) → id. Una lista de precios puede vivir directo en un
    Google Sheets multi-pestaña (founder 07-08) — se ingiere como proyecto de un solo archivo."""
    m = _FILE_URL_RE.search(url or "")
    return m.group(1) if m else None


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
    """Group files by parent_folder_id. Files at root → 1 group keyed by root id.
    Carpetas HOMÓNIMAS se FUSIONAN: el mismo proyecto suele venir partido en 2 carpetas con el mismo
    nombre (validación 07-08: dos 'AVC 1129' — una con fichas, otra con la lista de precios)."""
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
    # fusión por nombre normalizado (espacios/mayúsculas): "Albert 38 " == "Albert 38" · "BOLIVAR 577" == "Bolivar 577"
    merged: Dict[str, Dict[str, Any]] = {}
    for g in groups.values():
        norm = re.sub(r"\s+", " ", (g["parent_folder_name"] or "").strip().lower())
        if norm in merged and norm != "proyecto principal":
            merged[norm]["files"].extend(g["files"])
        else:
            merged[norm] = g
    return {g["parent_folder_id"]: g for g in merged.values()}


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
  "total_units": int|null (unidades TOTALES del EDIFICIO — búscalas en el brochure "X departamentos".
    Si SOLO tienes la lista de disponibilidad NO cuentes sus filas: eso es inventario disponible, usa null),
  "price_range": {"min_mxn": int|null, "max_mxn": int|null},
  "delivery_date": "string|null (fecha de entrega, p.ej. SEP/2026)",
  "maintenance_fee_mxn": int|null,
  "amenities": ["string", ...],
  "units": [
    {"unit_number": "string", "prototype": "string|null (tipo/modelo, p.ej. 'Tipo 02', 'B', 'PH')",
     "level": int|null (nivel/piso: dedúcelo del número — 201→2, 1105→11, PB/GH→0; null si no es deducible),
     "status": "disponible|apartado|vendido|null", "type": "depto|casa|townhouse|loft|garden house|penthouse",
     "bedrooms": int|null, "bathrooms": int|null, "size_m2": float|null, "size_m2_total": float|null,
     "m2_interior": float|null, "m2_balcony": float|null, "m2_terrace": float|null, "m2_roof_garden": float|null,
     "patio_m2": float|null,
     "storage_count": int|null (columna #BOD/bodegas: el NÚMERO; null si la columna está VACÍA),
     "parking": "string|null (cajones — copia el número EXACTO de la columna #EST)",
     "parking_type": "individual|tandem|null", "vista": "string|null (exterior/interior/parque…)",
     "price_mxn": int|null,
     "credito_mxn": int|null, "enganche_mxn": int|null, "reservacion_mxn": int|null,
     "contrato_mxn": int|null, "a_diferir_mxn": int|null}
  ],
  "_confidence": {"project_name": 0.0-1.0, "address": 0.0-1.0, "price": 0.0-1.0, "units": 0.0-1.0}
}
REGLA #1 — DISPONIBILIDAD (LA MÁS IMPORTANTE, prohibido equivocarse):
· La lista de precios/disponibilidad muestra el inventario DISPONIBLE HOY. Extrae unidades SOLO de la lista
  MÁS RECIENTE (mira la fecha en el documento). NO agregues deptos que solo aparecen en brochures, planos o
  cotizaciones viejas — si no están en la lista actual es porque probablemente YA SE VENDIERON.
· status "apartado"/"vendido" SOLO si el documento lo dice EXPLÍCITAMENTE (etiqueta, columna de estatus,
  texto "apartado"/"vendido"/"no disponible", tachado). Un renglón sombreado o de otro color NO es evidencia
  suficiente → déjalo "disponible". NUNCA adivines el estatus.
REGLA #2 — NO INVENTAR (copia exacta):
· Si la lista NO trae columna de recámaras/baños → null (el cruce de planos los completa después).
· #BOD/bodega vacío → storage_count null. NO asumas que hay bodega.
· Cajones (#EST): copia el número EXACTO de la fila. m²: copia los decimales tal cual (85.16, no 85).
REGLA #3 — FORMA DE PAGO: si la lista trae columnas de pago por unidad (CRÉDITO, ENGANCHE, RESERVACIÓN,
CONTRATO, A DIFERIR o similares), extráelas en los campos *_mxn. Son la base del cotizador.
CRUCE DE PLANOS: el DESGLOSE de m² (interior/balcón/terraza/roof) vive en los PLANOS. Si hay planos
("DEP-206", "Tipo 02", "Prototipo B"): 1) cruza por NÚMERO (DEP-206 → unidad 206); 2) cruza por PROTOTIPO
(depto 102 usa el plano del "Tipo 02") y asigna el desglose a TODAS las unidades de ese prototipo;
3) toma m2_interior, m2_balcony, m2_terrace, m2_roof_garden y verifica recámaras/baños.
PROTOTIPO POR TERMINACIÓN: los deptos que terminan igual suelen compartir prototipo (101/201/301 → "01" ·
202/302/402 → "02"). Si el plano o las configuraciones lo confirman (mismas recámaras/baños/m²), asigna esa
terminación como prototype. Si las configuraciones difieren, NO lo asumas.
FALLBACK DE PRECIO: si la lista da precio por PROTOTIPO (no por depto), asigna ese precio a cada unidad del
prototipo — no dejes price_mxn null si el prototipo tiene precio.
FICHAS POR DEPTO: si los documentos son FICHAS individuales (un PDF por depto: "Albert_PH1", "Depto_207"),
CADA ficha es UNA unidad DISPONIBLE — extrae su número (del nombre del archivo y el contenido), precio, m²
y características. El conjunto de fichas ES el inventario disponible.
PRODUCTO: si detectas que NO es vivienda nueva (oficinas/local/bodega/terreno/rentas/reventas), dilo en
"_producto" y NO inventes unidades residenciales.
En "_confidence" califica QUÉ TAN SEGURO estás (1.0 = explícito · 0.5 = inferido · 0.2 = adivinado). Sé honesto.
Si un campo no se puede determinar con certeza, usa null/array vacío. NO inventes datos.
Si no hay info clara del proyecto, devuelve {"project_name": "<carpeta>", "_low_confidence": true} y resto vacío.
Responde EXCLUSIVAMENTE con JSON, sin markdown."""


def _texto_ilegible(t: str) -> bool:
    """La capa de texto del PDF está CORRUPTA (validación AVC 07-08): glifos encimados
    ('$66666655555,,,000...') o columnas rotadas ('o ic e r P' = 'Precio' al revés). En esos casos el
    texto MIENTE — hay que leer el PDF como IMAGEN (visión)."""
    if not t:
        return False
    if re.search(r"(.)\1{9,}", t):                      # runs absurdos del mismo carácter
        return True
    low = t.lower()
    if any(k in low for k in ("oicerp", "otnematrap", "nedrag foor", "n ó ic a v r e s e r",
                              "o ic e r p", "s a z a r r e t")):   # palabras clave AL REVÉS/espaciadas
        return True
    return False


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
        # m² con DECIMALES (85.16, no 85) — el gate dorado cachó que aquí se redondeaba (int) y se perdía el dato
        s = _num(u.get("size_m2")); u["size_m2"] = round(float(s), 2) if (s is not None and s > 0) else None
        st = _num(u.get("size_m2_total")); u["size_m2_total"] = round(float(st), 2) if (st is not None and st > 0) else u.get("size_m2_total")
        b = _num(u.get("bedrooms")); u["bedrooms"] = int(b) if (b is not None and 0 <= b <= 20) else None
        ba = _num(u.get("bathrooms")); u["bathrooms"] = int(ba) if (ba is not None and 0 <= ba <= 20) else None
        clean_units.append(u)
    if "units" in data:
        data["units"] = clean_units
    return data


async def _geocode_address(address: str, colonia: Optional[str] = None,
                           alcaldia: Optional[str] = None) -> Tuple[Optional[float], Optional[float]]:
    """Geocodifica dirección → (lat, lng) vía Mapbox (token ya configurado), con sesgo a CDMX y fallback a
    colonia+alcaldía. Antes usaba Nominatim, que fallaba con direcciones MX sobre-formateadas y hacía mis-hits
    (RENTAS → Torreón). geocode_engine acota país=mx + proximidad + bbox ZMVM. Fail-soft (None, None)."""
    try:
        from geocode_engine import geocode
        return await geocode(address, colonia, alcaldia)
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
        pdf_docs = 0
        for b, mime, fname in file_payloads:
            texto = _extract_text_from_bytes(b, mime, fname)
            nm = (fname or "").lower()
            import base64 as _b64
            if texto and len(texto.strip()) >= 120 and not _texto_ilegible(texto):
                content_parts.append(f"\n=== {fname} ===\n{texto[:8000]}")
            elif (mime == "application/pdf" or nm.endswith(".pdf")) and pdf_docs < 3 and len(b) <= 10 * 1024 * 1024:
                # OCR (#2): PDF escaneado (poco/ningún texto) → DOCUMENTO nativo (Claude lee la imagen de la página)
                try:
                    from llm_client import ImageContent  # type: ignore
                    imagenes.append(ImageContent(image_base64=_b64.b64encode(b).decode(), media_type="application/pdf"))
                    content_parts.append(f"\n=== {fname} (PDF escaneado — leer imagen) ===")
                    pdf_docs += 1
                except Exception:  # noqa: BLE001
                    content_parts.append(f"- Archivo: {fname} [PDF sin texto]")
            elif mime.startswith("image/") or nm.endswith((".jpg", ".jpeg", ".png", ".webp")):
                try:
                    from llm_client import ImageContent  # type: ignore
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
            chat = chat.with_model("anthropic", BULK_INGEST_MODEL).with_max_tokens(8000).with_timeout(BULK_INGEST_LLM_TIMEOUT)
            _msg = UserMessage(text=user_text, file_contents=imagenes[:4]) if imagenes else UserMessage(text=user_text)
            resp = await chat.send_message(_msg)
            data = _parse_llm_json(resp or "")   # tolera fences, comas colgantes y JSON truncado
            if not isinstance(data, dict):
                # la IA devolvió una lista u otra cosa (p.ej. una carpeta que no es un proyecto) →
                # no reventar con 'list' object has no attribute 'get', cae a stub limpio.
                raise ValueError("La IA no devolvió un objeto de proyecto")
            # Validación de negocio: nunca dejar precios/m² imposibles entrar al catálogo.
            data = _sanitize_extraction(data)
            # Geocoding: la IA casi nunca trae lat/lng → completarlas de la dirección (fail-soft). El dato útil vive
            # en address/colonia/alcaldia (address_full suele venir null) → pasamos los tres a Mapbox.
            if data.get("lat") is None or data.get("lng") is None:
                _lat, _lng = await _geocode_address(
                    data.get("address_full") or data.get("address"),
                    data.get("colonia"), data.get("alcaldia"))
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


# ─── PASO 0 · RECONOCIMIENTO (founder 07-08: "que la IA lea la estructura para detectar patrones") ────────
# La IA ve el ÁRBOL COMPLETO de carpetas/archivos del proyecto (texto barato, sin descargas, SIN topes de 60)
# y produce el PLAN DE LECTURA: qué archivo es la lista de precios, cuál es brochure, cuáles son planos por
# prototipo, qué torres hay, qué falta. Así el pipeline funciona con CUALQUIER estructura de Drive — la de
# CLASS hoy o la del siguiente dev mañana — sin heurísticas ciegas. El plan queda guardado (linaje).

RECON_PROMPT = """Eres el RECONOCEDOR de carpetas de proyectos inmobiliarios. Te doy el árbol COMPLETO de
archivos de UN proyecto (carpeta/archivo, numerados). NO ves el contenido — solo nombres, carpetas y tipos.
Los nombres dicen qué contienen ("Disponibilidad y precios", "TORRE A", "PLANOS", "Presentación",
"101,201,301.pdf" = plano del prototipo que comparten esos deptos).

Devuelve SOLO JSON:
{
  "listas_precios": [índices de TODAS las listas de precios / disponibilidad / inventario — la fuente de
                     verdad del inventario. Busca por nombre Y carpeta, BILINGÜE: "lista de precios", "LP",
                     "precios", "PRECIOS X FECHA", "disponibilidad", "inventario", "inventory", "pricing",
                     "PREVENTA.pdf" (los devs suelen meter precios en su presentación de preventa)],
  "fichas_por_depto": [índices cuando el inventario NO es una lista sino UN PDF POR DEPTO
                       ("Albert_PH1.pdf", "AVC1129_Depto_207.pdf", "Sevilla_D005.pdf") — el CONJUNTO de
                       fichas ES la disponibilidad y cada una trae su precio. NO confundir con "opcion 2/3"
                       (variantes de pago de un mismo depto = cotizaciones, van en ninguno)],
  "brochure": [índices de presentación/brochure/factsheet (máx 2, el más completo primero)],
  "planos_prototipo": [índices de planos POR PROTOTIPO o por depto ("Tipo A", "101,201,301...", "DEP-206").
                       TODOS los que existan],
  "planos_nivel": [índices de plantas de NIVEL/conjunto ("PLANTA NIVEL 2", "conjunto")],
  "torres": ["A","B"] (si la estructura revela torres/fases; [] si no),
  "etapa_carpeta": "preventa|construccion|entrega_inmediata|agotado|null" (del NOMBRE de carpeta:
                    "- Entrega Inmediata", "(Preventa - Pre Sale)", "(VENDIDO)" → agotado),
  "producto": "residencial|oficinas|local|bodega|terreno|renta|reventa|mixto" (qué se vende aquí:
              "WORK LAB"/oficinas, "BODEGA", "RE-VENTAS", "Disponibles renta" NO son residencial nuevo),
  "faltantes": ["lista_precios"|"brochure"|"planos"] (lo que NO encontraste),
  "estructura": "1 línea: cómo está organizada esta carpeta"
}
IGNORA para extracción: "Versiones Antiguas"/old, Facturas, Brokers, Registro, marketing genérico
(aliados, why us, aniversary), cuentas bancarias, contratos, cartas (sensibles — jamás públicos).
REGLAS: si NO hay lista de precios, decláralo en faltantes — NUNCA propongas usar planos o cotizaciones como
inventario. Las cotizaciones individuales ("opcion 2", "cotización") NO son listas de precios. Responde SOLO JSON."""


async def recon_plan(project_name: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Paso 0: árbol completo → plan de lectura (1 llamada barata, solo texto). Fail-soft: {} = usar heurística."""
    from llm_client import LlmChat, UserMessage
    lines = [f"[{i}] {(f.get('immediate_folder') or '(raíz)')}/{f.get('name')} ({(f.get('mimeType') or '?').split('/')[-1]})"
             for i, f in enumerate(files)]
    tree = "\n".join(lines[:3000])   # tope de SEGURIDAD altísimo — el árbol es texto, no descargas
    try:
        chat = LlmChat(api_key="", session_id=f"recon-{secrets.token_urlsafe(6)}",
                       system_message=RECON_PROMPT).with_model("anthropic", BULK_INGEST_MODEL)\
            .with_max_tokens(2000).with_timeout(BULK_INGEST_LLM_TIMEOUT)
        resp = await chat.send_message(UserMessage(text=f"PROYECTO: {project_name}\nÁRBOL ({len(files)} archivos):\n{tree}"))
        plan = _parse_llm_json(resp or "")
        if not isinstance(plan, dict):
            return {}

        def _pick(key, cap):
            out = []
            for idx in (plan.get(key) or [])[:cap]:
                try:
                    out.append(files[int(idx)])
                except (ValueError, TypeError, IndexError):
                    continue
            return out
        return {
            "listas_precios": _pick("listas_precios", 8),
            "fichas_por_depto": _pick("fichas_por_depto", 45),
            "producto": str(plan.get("producto") or "residencial"),
            "brochure": _pick("brochure", 2),
            "planos_prototipo": _pick("planos_prototipo", 80),
            "planos_nivel": _pick("planos_nivel", 6),
            "torres": [t for t in (plan.get("torres") or []) if isinstance(t, str)][:6],
            "etapa_carpeta": plan.get("etapa_carpeta"),
            "faltantes": plan.get("faltantes") or [],
            "estructura": str(plan.get("estructura") or "")[:300],
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[bulk_ingest] recon falló ({project_name}): {e}")
        return {}


def _building_map_from_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """MAPA DEL EDIFICIO determinista (cero tokens): los nombres de los planos-por-prototipo ENUMERAN los
    deptos que comparten prototipo ("101,201,301,401.pdf" en carpeta "TORRE A"). De ahí salen las unidades
    TOTALES del edificio, niveles reales, depas por piso y la torre de cada depto — aunque la lista de
    precios solo traiga los disponibles."""
    unidades: Dict[str, Dict[str, Any]] = {}
    for f in (plan.get("planos_prototipo") or []):
        name = str(f.get("name") or "")
        folder = str(f.get("immediate_folder") or "")
        m = re.search(r"(?i)\btorre\s*([A-Z0-9]+)", folder + " " + name)
        torre = m.group(1).upper() if m else None
        base = re.sub(r"(?i)opci[oó]n\s*\d+|\.pdf$", "", name)
        for n in re.findall(r"\b(\d{3,4}[A-Za-z]?)\b", base):
            key = f"{torre or ''}-{n}".strip("-")
            unidades.setdefault(key, {"torre": torre, "numero": n})
    if not unidades:
        return {}
    niveles = []
    por_piso: Dict[str, int] = {}
    for u in unidades.values():
        m = re.fullmatch(r"(\d{3,4})[A-Za-z]?", u["numero"])
        if m:
            lv = int(m.group(1)[:-2])
            niveles.append(lv)
            k = f"{u['torre'] or ''}:{lv}"
            por_piso[k] = por_piso.get(k, 0) + 1
    return {
        "total_units_edificio": len(unidades),
        "max_level": max(niveles) if niveles else None,
        "depas_por_piso": max(por_piso.values()) if por_piso else None,
        "torres": sorted({u["torre"] for u in unidades.values() if u["torre"]}),
    }


# ─── PASE DE PLANOS (modo profundo) ───────────────────────────────────────────
# Las listas de precios casi nunca traen el DESGLOSE de m² (interior/balcón/terraza/roof) — eso vive en los
# PLANOS. Este pase lee SOLO los planos (2ª llamada a Claude, lotes de 3 PDFs) y cruza el desglose a las
# unidades por NÚMERO (DEP-206 → 206) o por PROTOTIPO (depto 102 usa el plano del "Tipo 02").

PLAN_PROMPT = """Eres un lector de PLANOS arquitectónicos de departamentos.
Para CADA plano adjunto lee su tabla/cuadro de áreas y devuelve SOLO JSON:
{"planos": [
  {"archivo": "nombre del archivo", "prototype": "string|null (Tipo 02, B, PH…)",
   "unit_number": "string|null (si el plano es de UN depto: DEP-206 → 206)",
   "bedrooms": int|null, "bathrooms": int|null,
   "m2_interior": float|null, "m2_balcony": float|null, "m2_terrace": float|null,
   "m2_roof_garden": float|null, "m2_total": float|null}
]}
Un plano puede ser por PROTOTIPO (aplica a varias unidades) o por DEPTO específico. null si el dato no
aparece — NO inventes. Responde EXCLUSIVAMENTE con JSON."""

# Archivos SENSIBLES (drives reales traen cuentas bancarias, contratos, cartas con nombres de clientes):
# se guardan como referencia interna pero NUNCA salen al público ni a Multimedia.
_SENSITIVE_RE = re.compile(r"(?i)cuenta|contrato|carta[ _-]?(oferta|apartado|convenio)|factura|\bcv[ _.]|curricul|"
                           r"comisi[oó]n|apartado|promesa|bur[oó]|ine\b|pasaporte|convenio")


def _is_sensitive_name(name: str) -> bool:
    return bool(_SENSITIVE_RE.search(name or ""))


_PLANO_KEYWORDS = ("plano", "planta tipo", "prototipo", "tipo ", "unidad", "depto", "departamento")
_PLAN_FIELDS = ("m2_interior", "m2_balcony", "m2_terrace", "m2_roof_garden")


_MESES = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,"julio":7,
          "agosto":8,"septiembre":9,"octubre":10,"noviembre":11,"diciembre":12}


def _fecha_de_nombre(name: str) -> Optional[str]:
    """'PRECIOS CADIZ 15 ABRIL 24'→'2024-04-15' · 'LP SLP96 MARZO 2025'→'2025-03-01' · '(10-04-24)'→'2024-04-10'.
    Para elegir la lista MÁS RECIENTE y fechar el histórico."""
    n = (name or "").lower()
    m = re.search(r"(\d{1,2})?\s*(" + "|".join(_MESES) + r")\s*(\d{2,4})", n)
    if m:
        d = int(m.group(1) or 1); mes = _MESES[m.group(2)]; a = int(m.group(3))
        a = a + 2000 if a < 100 else a
        return f"{a:04d}-{mes:02d}-{min(d,28):02d}"
    m = re.search(r"\((\d{1,2})-(\d{1,2})-(\d{2,4})\)", n)
    if m:
        d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = a + 2000 if a < 100 else a
        if 1 <= mes <= 12:
            return f"{a:04d}-{mes:02d}-{min(d,28):02d}"
    return None


def _is_plano(f: Dict[str, Any]) -> bool:
    """¿Este archivo parece un PLANO (por depto o por prototipo)? PDFs con nombre de plano/depto."""
    if f.get("mimeType") not in PDF_MIMES:
        return False
    n = ((f.get("name") or "") + " " + (f.get("immediate_folder") or "")).lower()
    return bool(re.search(r"dep[-_ ]?\d", n) or any(k in n for k in _PLANO_KEYWORDS)
                or any(k in n for k in _DEPRIO_PLANO))


def _needs_plan_pass(extracted: Dict[str, Any]) -> bool:
    """¿Vale la pena leer planos? Hay unidades y a la mayoría le falta el desglose de m²."""
    units = extracted.get("units") or []
    if not units:
        return False
    sin = sum(1 for u in units if not any(u.get(k) for k in _PLAN_FIELDS))
    return sin >= max(1, len(units) // 2)


def _norm_unit_no(s: Any) -> str:
    """Para CRUZAR PLANOS: 'DEP-206'/'Depto 206' → '206' · '102-A' → '102A' (token con dígitos, sin prefijos).
    OJO: colapsa GH01/PH01 → '01' — NO usar para identidad de unidad (usar _unit_identity)."""
    t = re.sub(r"(?i)\b(dep|depto|departamento|unidad|u)\b", " ", str(s or ""))
    t = re.sub(r"[^A-Za-z0-9 ]", "", t)          # quita guiones/puntos → '102-A' se vuelve '102A'
    m = re.findall(r"\d+[A-Za-z]*", t.replace(" ", ""))
    return (m[-1] if m else re.sub(r"[^A-Za-z0-9]", "", str(s or ""))).upper()


def _unit_identity(s: Any) -> str:
    """IDENTIDAD de unidad (comparar deptos entre listas): quita solo prefijos DEP/DEPTO/UNIDAD y separadores,
    CONSERVA letras significativas → 'GH01'≠'PH01'≠'101' (el gate dorado cachó la colisión GH01/PH01→'01')."""
    t = re.sub(r"(?i)^(departamento|depto|dep|unidad|u)[-_ .]*", "", str(s or "").strip())
    return re.sub(r"[^A-Za-z0-9]", "", t).upper()


def _norm_proto(s: Any) -> str:
    """'Tipo 02'/'Prototipo B' → '02'/'b' (comparable)."""
    t = re.sub(r"(?i)\b(tipo|prototipo|modelo|planta)\b", " ", str(s or ""))
    return re.sub(r"[^a-z0-9]", "", t.lower())


async def extract_plan_breakdowns(payloads: List[Tuple[bytes, str, str]]) -> Tuple[List[Dict[str, Any]], float]:
    """Lee planos en LOTES de 3 PDFs nativos por llamada. Devuelve (lista de desgloses, costo MXN). Fail-soft."""
    import base64 as _b64
    from llm_client import LlmChat, UserMessage, ImageContent
    out: List[Dict[str, Any]] = []
    cost = 0.0
    lote: List[Tuple[bytes, str]] = [(b, fn) for b, m, fn in payloads
                                     if len(b) <= 10 * 1024 * 1024][:9]  # tope 9 planos (3 lotes)
    for i in range(0, len(lote), 3):
        batch = lote[i:i + 3]
        try:
            imgs = [ImageContent(image_base64=_b64.b64encode(b).decode(), media_type="application/pdf")
                    for b, _ in batch]
            nombres = "\n".join(f"- {fn}" for _, fn in batch)
            chat = LlmChat(api_key="", session_id=f"plan-pass-{secrets.token_urlsafe(6)}",
                           system_message=PLAN_PROMPT).with_model("anthropic", BULK_INGEST_MODEL).with_max_tokens(4000).with_timeout(BULK_INGEST_LLM_TIMEOUT)
            resp = await chat.send_message(UserMessage(
                text=f"Planos adjuntos (en este orden):\n{nombres}\n\nDevuelve el JSON.", file_contents=imgs))
            data = _parse_llm_json(resp or "")
            if isinstance(data, dict):
                for p in (data.get("planos") or []):
                    if isinstance(p, dict):
                        out.append(p)
            cost += 0.50
        except Exception as e:  # noqa: BLE001
            log.warning(f"[bulk_ingest] pase de planos (lote {i // 3 + 1}): {e}")
    return out, cost


def _apply_plan_breakdowns(extracted: Dict[str, Any], planos: List[Dict[str, Any]]) -> int:
    """Cruza los desgloses de los planos a las unidades: 1º por número de depto, 2º por prototipo.
    Solo RELLENA (no pisa lo que la lista de precios ya trajo). Devuelve # unidades enriquecidas."""
    if not planos:
        return 0
    by_unit = {_norm_unit_no(p.get("unit_number")): p for p in planos if p.get("unit_number")}
    by_proto = {_norm_proto(p.get("prototype")): p for p in planos if p.get("prototype")}
    filled = 0
    for u in (extracted.get("units") or []):
        p = by_unit.get(_norm_unit_no(u.get("unit_number")))
        if not p:
            proto = _norm_proto(u.get("prototype") or u.get("type"))
            p = by_proto.get(proto) if proto else None
        if not p:
            continue
        antes = dict(u)
        for k in _PLAN_FIELDS + ("bedrooms", "bathrooms"):
            if u.get(k) is None and p.get(k) is not None:
                u[k] = p[k]
        if not u.get("size_m2_total") and p.get("m2_total"):
            u["size_m2_total"] = p["m2_total"]
        if not u.get("prototype") and p.get("prototype"):
            u["prototype"] = p["prototype"]
        if u != antes:
            filled += 1
    return filled


# ─── Prototipo por TERMINACIÓN (founder 07-08) ────────────────────────────────
# "101, 201, 301 es prototipo 01 · 202, 302, 402 es prototipo 02". Cuando la lista no trae prototipo
# explícito, la terminación del número lo delata — PERO solo se asume si las configuraciones del grupo
# COINCIDEN (mismas recámaras/baños y m² casi iguales). El pase de planos después lo confirma/enriquece.

def _derive_prototypes(extracted: Dict[str, Any]) -> int:
    units = extracted.get("units") or []
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for u in units:
        if u.get("prototype"):
            continue
        un = str(u.get("unit_number") or "").strip()
        m = re.fullmatch(r"(?:[A-Za-z]{0,4}[-_ ]?)?(\d{3,4})[-_ ]?([A-Za-z]?)", un)
        if not m:
            continue
        term = m.group(1)[-2:] + (m.group(2) or "").upper()   # 101→'01' · 1105→'05' · 302B→'02B'
        groups.setdefault(term, []).append(u)
    n = 0
    for term, us in groups.items():
        if len(us) < 2:
            continue   # un solo depto con esa terminación no prueba un prototipo
        beds = {u.get("bedrooms") for u in us if u.get("bedrooms") is not None}
        baths = {u.get("bathrooms") for u in us if u.get("bathrooms") is not None}
        m2s = [u.get("size_m2") or u.get("m2_interior") for u in us if (u.get("size_m2") or u.get("m2_interior"))]
        m2_ok = (not m2s) or (min(m2s) >= max(m2s) * 0.97)    # ±3% (variación por nivel)
        if len(beds) <= 1 and len(baths) <= 1 and m2_ok:
            for u in us:
                u["prototype"] = term
                n += 1
    return n


# ─── Clasificación de imágenes (founder 07-08) ────────────────────────────────
# Multimedia = SOLO renders. Foto real de obra → tab Avance de obra (con fecha). Foto de depto muestra →
# NO se muestra. Clasificamos al ingerir y guardamos image_kind en project_assets.

IMAGE_KIND_PROMPT = """Clasifica CADA imagen adjunta de un desarrollo inmobiliario. Tipos:
- render: imagen 3D/generada por computadora (fachada, interior idealizado, amenidad render, masterplan 3D)
- obra: FOTO REAL de construcción/avance de obra (estructura, andamios, obra gris, maquinaria, excavación)
- muestra: FOTO REAL de un depto muestra/piloto (amueblado o con acabados, para enseñar)
- otro: logos, mapas, planos escaneados, documentos, personas, cualquier otra cosa
Devuelve SOLO JSON: {"imagenes": [{"archivo": "nombre", "kind": "render|obra|muestra|otro"}]}
En el mismo ORDEN en que van adjuntas. Si dudas entre render y muestra: los renders tienen iluminación
perfecta/irreal y bordes limpios; las fotos reales tienen imperfecciones, reflejos y desorden natural."""


async def classify_project_images(payloads: List[Tuple[bytes, str, str]]) -> Dict[str, str]:
    """Clasifica imágenes en lotes de 4 → {filename: kind}. Fail-soft (dict parcial o vacío)."""
    import base64 as _b64
    from llm_client import LlmChat, UserMessage, ImageContent
    out: Dict[str, str] = {}
    lote = [(b, m, fn) for b, m, fn in payloads if len(b) <= 8 * 1024 * 1024][:24]
    for i in range(0, len(lote), 4):
        batch = lote[i:i + 4]
        try:
            imgs = [ImageContent(image_base64=_b64.b64encode(b).decode(),
                                 media_type=(m if (m or "").startswith("image/") else "image/jpeg"))
                    for b, m, _ in batch]
            nombres = "\n".join(f"{j + 1}. {fn}" for j, (_, _, fn) in enumerate(batch))
            chat = LlmChat(api_key="", session_id=f"img-kind-{secrets.token_urlsafe(6)}",
                           system_message=IMAGE_KIND_PROMPT).with_model("anthropic", BULK_INGEST_MODEL).with_max_tokens(1000).with_timeout(BULK_INGEST_LLM_TIMEOUT)
            resp = await chat.send_message(UserMessage(text=f"Imágenes adjuntas:\n{nombres}", file_contents=imgs))
            data = _parse_llm_json(resp or "")
            for p in (data.get("imagenes") or []) if isinstance(data, dict) else []:
                if isinstance(p, dict) and p.get("archivo") and p.get("kind") in ("render", "obra", "muestra", "otro"):
                    out[p["archivo"]] = p["kind"]
        except Exception as e:  # noqa: BLE001
            log.warning(f"[bulk_ingest] clasificación de imágenes (lote {i // 4 + 1}): {e}")
    return out


PIPELINE_VERSION = "v2-recon"   # cambiarla invalida los hashes → re-proceso completo con el pipeline nuevo


def _group_content_hash(files: List[Dict[str, Any]]) -> str:
    """Huella del CONTENIDO del proyecto en Drive (md5/modifiedTime/size de cada archivo, ya vienen en el
    listado — cero descargas). Si no cambió desde la última corrida procesada → no re-extraer (cero tokens)."""
    import hashlib
    parts = sorted(f"{f.get('id')}:{f.get('md5Checksum') or f.get('modifiedTime')}:{f.get('size')}"
                   for f in (files or []))
    return hashlib.md5((PIPELINE_VERSION + "|" + "|".join(parts)).encode()).hexdigest()


def validate_extraction(extracted: Dict[str, Any], plan: Dict[str, Any],
                        building: Dict[str, Any], project_name: str) -> Dict[str, Any]:
    """GATE DE CONSISTENCIA (gratis, corre en cada ingesta): ¿el dato extraído CUADRA? Devuelve score 0-100
    con las razones. Score bajo → el proyecto NO se auto-aprueba (founder: cero basura al marketplace)."""
    checks: List[Dict[str, Any]] = []

    def _c(nombre, ok, detalle=""):
        checks.append({"check": nombre, "ok": bool(ok), "detalle": detalle})

    units = extracted.get("units") or []
    # 1 · aritmética de m²: priv + balcón + terraza + roof ≈ total (±0.6 por redondeos)
    bad_m2 = []
    for u in units:
        tot = u.get("size_m2_total")
        parts = [u.get("m2_interior") or u.get("size_m2"), u.get("m2_balcony"),
                 u.get("m2_terrace"), u.get("m2_roof_garden"), u.get("patio_m2")]
        suma = sum(float(x) for x in parts if x)
        if tot and suma and abs(float(tot) - suma) > 0.6 and suma > (parts[0] or 0):
            bad_m2.append(f"{u.get('unit_number')}: {suma:.2f}≠{tot}")
    _c("aritmetica_m2", not bad_m2, "; ".join(bad_m2[:4]))
    # 2 · precio/m² sano (vivienda MX: 15k–250k por m²)
    raros = []
    for u in units:
        p, m2 = u.get("price_mxn"), (u.get("size_m2_total") or u.get("size_m2"))
        if p and m2 and not (15000 <= p / float(m2) <= 250000):
            raros.append(f"{u.get('unit_number')}: ${p/float(m2):,.0f}/m²")
    _c("precio_m2_sano", not raros, "; ".join(raros[:4]))
    # 3 · % de unidades con precio
    conp = sum(1 for u in units if u.get("price_mxn"))
    _c("cobertura_precio", (conp / len(units) >= 0.6) if units else True,
       f"{conp}/{len(units)} con precio")
    # 4 · ANTI-CONTAMINACIÓN: la lista elegida debe mencionar al proyecto (caza 'UNICO COYOACAN_LP'
    #     metida en la carpeta de ICON CONDESA)
    toks = [t for t in re.findall(r"[a-záéíóú0-9]{4,}", (project_name or "").lower())
            if t not in ("casa", "torre", "depto", "residencial", "preventa", "entrega", "inmediata")]
    conta = []
    for f in (plan.get("listas_precios") or []):
        fn = (f.get("name") or "").lower()
        if toks and not any(t in fn for t in toks) and re.search(r"[a-z]{4,}", fn.replace("lp", "")):
            otros = re.findall(r"[a-záéíóú]{5,}", fn)
            if otros and not any(t in fn for t in toks):
                conta.append(f.get("name"))
    _c("lista_es_del_proyecto", not conta, "; ".join(conta[:2]))
    # 5 · unidades ≤ edificio (si hay mapa)
    if building.get("total_units_edificio"):
        _c("unidades_vs_edificio", len(units) <= building["total_units_edificio"] + 2,
           f"{len(units)} listadas vs {building['total_units_edificio']} en edificio")
    # 6 · prototipos sanos (no m² como nombre: '92.48')
    protos_raros = {str(u.get("prototype")) for u in units
                    if u.get("prototype") and re.fullmatch(r"\d{2,3}\.\d+", str(u.get("prototype")))}
    _c("prototipos_sanos", not protos_raros, "; ".join(list(protos_raros)[:3]))
    # 7 · hay fuente de inventario
    _c("fuente_inventario", bool(plan.get("listas_precios") or plan.get("fichas_por_depto")),
       "sin lista ni fichas")

    ok_n = sum(1 for c in checks if c["ok"])
    score = round(ok_n / len(checks) * 100)
    return {"score": score, "publicable": score >= 85 and bool(units),
            "checks": checks}


def _parking_count(raw) -> int:
    """CONTEO de cajones desde el texto real de las listas (validación AVC 07-08): '28 y 29'→2 ·
    '34 down'→1 (es el NÚMERO del cajón, no el conteo) · '2'→2 · '07'→1 · 'incluido'→1 · vacío→0."""
    s = str(raw or "").strip()
    if not s:
        return 0
    toks = re.findall(r"\d+", s)
    if not toks:
        return 1
    if len(toks) > 1:
        return len(toks)                      # '28 y 29' = 2 cajones identificados
    t = toks[0]
    if len(t) == 1 and int(t) <= 6:
        return int(t)                          # '2' = conteo típico de lista
    return 1                                   # '34'/'07' = identificador de UN cajón


_PAY_KEYS = ("credito_mxn", "enganche_mxn", "reservacion_mxn", "contrato_mxn", "a_diferir_mxn")


def _payment_fields(u: Dict[str, Any], price: Optional[float]) -> Dict[str, Any]:
    """Extrae la FORMA DE PAGO por unidad (crédito/enganche/reservación/contrato/a diferir) + calcula los
    PORCENTAJES sobre el precio (la 'forma de pago base' que pidió el founder). Solo montos > 0."""
    out: Dict[str, Any] = {}
    for k in _PAY_KEYS:
        v = _num(u.get(k))
        out[k] = int(v) if (v is not None and v > 0) else None
    if price:
        for k in _PAY_KEYS:
            if out.get(k):
                out[k.replace("_mxn", "_pct")] = round(out[k] / float(price) * 100, 1)
    return out


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

    # GEO (belt): si la extracción no dejó coords, geocodifica aquí (Mapbox) desde address+colonia+alcaldía → el
    # proyecto cae en el mapa. Antes se perdía (call-site mandaba address_full null). Fail-soft.
    _lat, _lng = extracted.get("lat"), extracted.get("lng")
    if _lat is None or _lng is None:
        _lat, _lng = await _geocode_address(
            extracted.get("address_full") or extracted.get("address"), colonia, alcaldia)

    # REVERSE-COLONIA: si no se resolvió colonia_id pero ya hay coords, toma la colonia más cercana (punto→zona) →
    # el proyecto se conecta a la inteligencia de zona/absorción aunque el texto de colonia no fuera canónico.
    if not colonia_id and _lat is not None and _lng is not None:
        try:
            from estudio_mercado_engine import colonias_en_radio
            near = await colonias_en_radio(db, _lat, _lng, 1200)
            if near:
                colonia_id = near[0].get("id")
                colonia = colonia or near[0].get("name")
                alcaldia = alcaldia or near[0].get("alcaldia")
        except Exception as e:  # noqa: BLE001
            log.warning(f"[bulk_ingest] reverse-colonia falló: {e}")

    dev_doc = {
        "id": dev_id,
        "name": extracted.get("project_name") or item.get("source_files", [{}])[0].get("name", "Proyecto sin nombre"),
        "address": extracted.get("address_full") or extracted.get("address") or "",
        "colonia": colonia,
        "colonia_id": colonia_id,            # ← vínculo a la inteligencia de zona
        "alcaldia": alcaldia,
        "municipio": alcaldia,
        "lat": _lat,
        "lng": _lng,
        "developer_id": target_org,
        "dev_org_id": target_org,            # ← consistencia con el resto del sistema
        "total_units": int(extracted.get("total_units") or 0),
        "price_min_mxn": (extracted.get("price_range") or {}).get("min_mxn"),
        "price_max_mxn": (extracted.get("price_range") or {}).get("max_mxn"),
        "price_from": (extracted.get("price_range") or {}).get("min_mxn"),
        "delivery_estimate": extracted.get("delivery_date"),
        "maintenance_fee_mxn": extracted.get("maintenance_fee_mxn"),
        "amenities": extracted.get("amenities") or [],
        # etapa: si la entrega dice "inmediata" el proyecto YA está terminado — 'preventa' era contradictorio
        "stage": ("entrega" if re.search(r"(?i)inmediata", str(extracted.get("delivery_date") or ""))
                  else (extracted.get("stage") or "preventa")),
        "max_level": (extracted.get("_building") or {}).get("max_level"),
        "depas_por_piso": (extracted.get("_building") or {}).get("depas_por_piso"),
        "torres": (extracted.get("_building") or {}).get("torres") or [],
        "status": "active",
        "marketplace_published": "pending",   # aprobación pre-publicar (contenido ingerido → revisar antes de ir público)
        "source": "bulk_ingest",
        "source_job_id": item.get("job_id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.developments.insert_one(dict(dev_doc))

    # CABLE #2 → COTIZADOR + FILTRO + CUBO: escribir los campos COMPLETOS de unidad en el vocabulario CANÓNICO
    # (el mismo de la semilla y del front) + los nombres legacy (que lee el cubo). status en ESPAÑOL: la semilla y
    # el filtro "disponible" del marketplace comparan contra 'disponible'/'reservado'/'vendido' (auditoría 07-07).
    _ST = {"disponible": "disponible", "apartado": "reservado", "vendido": "vendido",
           "available": "disponible", "reserved": "reservado", "sold": "vendido"}
    for u in (extracted.get("units") or []):
        _sm2 = u.get("size_m2")
        _m2int = u.get("m2_interior") or _sm2               # interior/privativo (del plano cuando existe)
        _sm2t = u.get("size_m2_total") or u.get("size_m2")
        _price = u.get("price_mxn")
        _park_raw = u.get("parking")
        _park_n = _parking_count(_park_raw)
        # bodega: SOLO si la lista lo dice (#BOD con número o texto de bodega) — antes se inventaba
        _bod_n = _num(u.get("storage_count"))
        _bodega = bool(_bod_n and _bod_n > 0) or bool(u.get("storage"))
        unit_doc = {
            "id": f"unit_{secrets.token_urlsafe(10)}",
            "development_id": dev_id,
            "developer_id": target_org,
            "colonia_id": colonia_id,
            "unit_number": u.get("unit_number") or f"U{secrets.token_hex(3)}",
            "type": u.get("type") or "depto",
            "prototype": u.get("prototype") or u.get("type") or "depto",
            "level": u.get("level"),
            "bedrooms": u.get("bedrooms"),
            "bathrooms": u.get("bathrooms"),
            # canónico (front + filtros + semilla)
            "m2_privative": _m2int,
            "m2_total": _sm2t,
            # desglose de m² (del plano por depto/prototipo) → alimenta has_roof/terraza/balcón del cubo
            "m2_balcony": u.get("m2_balcony"),
            "m2_terrace": u.get("m2_terrace"),
            "m2_roof_garden": u.get("m2_roof_garden"),
            "patio_m2": u.get("patio_m2"),
            "parking_spots": _park_n,
            "parking_type": u.get("parking_type"),
            "vista": u.get("vista"),
            "bodega": _bodega,
            "storage_count": (int(_bod_n) if _bod_n and _bod_n > 0 else None),
            # forma de pago por unidad (crédito/enganche/reservación/contrato/a diferir + % sobre precio)
            **_payment_fields(u, _price),
            "price": _price,
            "price_display": (f"${int(_price):,}" if _price else None),
            # legacy (lo que lee dmx_cube_feed.db_unit_to_atom) — se conservan para no romper el cubo
            "size_m2": _sm2,
            "size_m2_total": _sm2t,
            "storage": u.get("storage"),        # bodega (texto original)
            "parking": _park_raw,               # cajón(es) (texto original)
            "price_mxn": _price,
            "status": _ST.get((u.get("status") or "").lower().strip(), "disponible"),
            "source": "bulk_ingest",
            "created_at": now,
        }
        await db.units.insert_one(dict(unit_doc))

    # Assets — store Drive references (+clasificación de imagen: render/obra/muestra → tabs correctos)
    _kinds = item.get("image_kinds") or {}
    for f in item.get("source_files", []):
        asset = {
            "id": f"asset_{secrets.token_urlsafe(10)}",
            "development_id": dev_id,
            "type": "drive_reference",
            "drive_file_id": f.get("file_id"),
            "filename": f.get("name"),
            "mime": f.get("mime"),
            "image_kind": _kinds.get(f.get("name")),
            "captured_at": now,               # fecha de extracción (avance de obra la muestra)
            "source": "bulk_ingest",
            "created_at": now,
        }
        await db.project_assets.insert_one(dict(asset))

    return dev_id


async def merge_into_dev(db, item: Dict[str, Any], target_dev_id: str) -> None:
    """UPSERT units (no duplicate unit_number) + APPEND assets + HISTÓRICOS del re-ingest (el moat de data):
    cada lista de precios nueva vs la anterior = deltas de PRECIO (price_events) y de ESTATUS (unit_status_events,
    vendido ⇒ días-para-vender). Antes el merge ni siquiera actualizaba el estatus → un depto 'vendido' en la
    lista nueva se quedaba 'disponible' y el delta se perdía para siempre."""
    extracted = effective_extracted(item)
    now = _iso()
    _ST = {"disponible": "disponible", "apartado": "reservado", "vendido": "vendido",
           "available": "disponible", "reserved": "reservado", "sold": "vendido"}
    dev = await db.developments.find_one({"id": target_dev_id}, {"_id": 0}) or {}
    for u in (extracted.get("units") or []):
        unit_no = u.get("unit_number")
        if not unit_no:
            continue
        existing = await db.units.find_one(
            {"development_id": target_dev_id, "unit_number": unit_no}, {"_id": 0},
        )
        _sm2 = u.get("size_m2")
        _price = u.get("price_mxn")
        _new_st = _ST.get((u.get("status") or "").lower().strip())  # None = la lista no trae estatus → no tocar
        if existing:
            upd: Dict[str, Any] = {
                "type": u.get("type") or existing.get("type"),
                "bedrooms": u.get("bedrooms") if u.get("bedrooms") is not None else existing.get("bedrooms"),
                "bathrooms": u.get("bathrooms") if u.get("bathrooms") is not None else existing.get("bathrooms"),
                "updated_at": now,
            }
            if _sm2:
                upd.update({"m2_privative": u.get("m2_interior") or _sm2, "size_m2": _sm2,
                            "m2_total": u.get("size_m2_total") or _sm2})
            # DESGLOSE de m² (del pase de planos) + campos finos — solo si la extracción los trae (no borrar lo que hay)
            for _k in ("m2_balcony", "m2_terrace", "m2_roof_garden", "patio_m2", "level",
                       "parking_type", "vista"):
                if u.get(_k) is not None:
                    upd[_k] = u.get(_k)
            if u.get("prototype"):
                upd["prototype"] = u.get("prototype")
            if u.get("parking") is not None:
                _pd = None  # (conteo real vía _parking_count)
                upd["parking_spots"] = int(_pd) if _pd else (1 if u.get("parking") else 0)
                upd["parking"] = u.get("parking")
            # BODEGA: la lista nueva es la verdad — se escribe SIEMPRE (antes el condicional dejaba vivo un
            # bodega=True inventado por una ingesta vieja; el gate dorado lo cachó en las 5 unidades de BM571).
            _bod_n = _num(u.get("storage_count"))
            upd["bodega"] = bool(_bod_n and _bod_n > 0) or bool(u.get("storage"))
            upd["storage_count"] = int(_bod_n) if (_bod_n and _bod_n > 0) else None
            # forma de pago por unidad (montos + % sobre el precio vigente)
            _pay = _payment_fields(u, _price or existing.get("price"))
            upd.update({k: v for k, v in _pay.items() if v is not None})
            # HISTÓRICO #1 · precio CAMBIÓ → price_events. Solo si había precio antes (rellenar un precio que
            # faltaba NO es un cambio de mercado → no ensuciar el histórico). Fail-open.
            old_price = existing.get("price") or existing.get("price_mxn")
            if _price and old_price and _price != old_price:
                try:
                    from routes.dev_price_history import record_price_event
                    await record_price_event(db, target_dev_id, existing, old_price, _price, dev=dev,
                                             source="reingesta", label="Lista de precios nueva (ingesta)")
                except Exception as e:  # noqa: BLE001
                    log.warning(f"[bulk_ingest] price_event: {e}")
            if _price:
                upd.update({"price": _price, "price_mxn": _price, "price_display": f"${int(_price):,}"})
            # HISTÓRICO #2 · estatus cambió → unit_status_events (vendido ⇒ días-para-vender REALES). Fail-open.
            old_st = existing.get("status")
            if _new_st and _new_st != old_st:
                upd["status"] = _new_st
                try:
                    ev = {"unit_id": existing.get("id"), "dev_id": target_dev_id, "unit_number": unit_no,
                          "old_status": old_st, "new_status": _new_st, "changed_at": now,
                          "source": "reingesta", "price": _price or old_price}
                    if _new_st == "vendido":
                        try:
                            import datetime as _dt
                            created = _dt.datetime.fromisoformat(str(existing.get("created_at")).replace("Z", "+00:00"))
                            ev["days_to_sell"] = max(0, (_dt.datetime.now(_dt.timezone.utc) - created).days)
                        except Exception:  # noqa: BLE001
                            pass
                        ev["sold_at"] = now
                    await db.unit_status_events.insert_one(ev)
                except Exception as e:  # noqa: BLE001
                    log.warning(f"[bulk_ingest] status_event: {e}")
            await db.units.update_one({"id": existing["id"]}, {"$set": upd})
        else:
            _pd = None  # (conteo real vía _parking_count)
            await db.units.insert_one({
                "id": f"unit_{secrets.token_urlsafe(10)}",
                "development_id": target_dev_id,
                "developer_id": dev.get("developer_id") or dev.get("dev_org_id"),
                "colonia_id": dev.get("colonia_id"),
                "unit_number": unit_no,
                "type": u.get("type") or "depto", "prototype": u.get("prototype") or u.get("type") or "depto",
                "bedrooms": u.get("bedrooms"),
                "bathrooms": u.get("bathrooms"),
                "m2_privative": u.get("m2_interior") or _sm2, "m2_total": u.get("size_m2_total") or _sm2,
                "m2_balcony": u.get("m2_balcony"), "m2_terrace": u.get("m2_terrace"),
                "m2_roof_garden": u.get("m2_roof_garden"),
                "parking_spots": _parking_count(u.get("parking")),
                "bodega": bool(u.get("storage")), "storage": u.get("storage"), "parking": u.get("parking"),
                "size_m2": _sm2, "price": _price, "price_mxn": _price,
                "price_display": (f"${int(_price):,}" if _price else None),
                "status": _new_st or "disponible",
                "source": "bulk_ingest_merge",
                "created_at": now,
            })
    # HECHOS DEL DEV (edificio/etapa/entrega): el re-ingest también refresca el doc del proyecto.
    try:
        _dev_patch: Dict[str, Any] = {}
        _b = extracted.get("_building") or {}
        if _b.get("total_units_edificio"):
            _dev_patch["total_units"] = _b["total_units_edificio"]
        if _b.get("max_level"):
            _dev_patch["max_level"] = _b["max_level"]
        if _b.get("depas_por_piso"):
            _dev_patch["depas_por_piso"] = _b["depas_por_piso"]
        if _b.get("torres"):
            _dev_patch["torres"] = _b["torres"]
        if extracted.get("stage"):
            _dev_patch["stage"] = extracted["stage"]
        if extracted.get("delivery_date"):
            _dev_patch["delivery_estimate"] = extracted["delivery_date"]
        if extracted.get("maintenance_fee_mxn"):
            _dev_patch["maintenance_fee_mxn"] = extracted["maintenance_fee_mxn"]
        if _dev_patch:
            _dev_patch["updated_at"] = now
            await db.developments.update_one({"id": target_dev_id}, {"$set": _dev_patch})
    except Exception as e:  # noqa: BLE001
        log.warning(f"[bulk_ingest] dev facts refresh: {e}")

    # REGLA DE DISPONIBILIDAD (founder 07-08): la lista de precios ES el inventario disponible HOY. Un depto
    # nuestro que YA NO aparece en la lista nueva → se VENDIÓ (por eso salió de la lista). Solo con lista
    # significativa (≥3 unidades) y solo sobre unidades que vinieron de ingesta (no toca ediciones del dev).
    # Registra unit_status_events con days_to_sell → absorción REAL del proyecto.
    new_nos = {_unit_identity(u.get("unit_number")) for u in (extracted.get("units") or []) if u.get("unit_number")}
    _anchored = item.get("anchored", True)   # sin lista de precios anclada NO se marca vendido (anti-falsos)
    if _anchored and len(new_nos) >= 3:
        async for old in db.units.find(
                {"development_id": target_dev_id, "status": {"$ne": "vendido"},
                 "source": {"$in": ["bulk_ingest", "bulk_ingest_merge"]}}, {"_id": 0}):
            if _unit_identity(old.get("unit_number")) in new_nos:
                continue
            try:
                ev = {"unit_id": old.get("id"), "dev_id": target_dev_id, "unit_number": old.get("unit_number"),
                      "old_status": old.get("status"), "new_status": "vendido", "changed_at": now,
                      "source": "reingesta_ausente", "price": old.get("price") or old.get("price_mxn"),
                      "sold_at": now, "nota": "ya no aparece en la lista de precios nueva"}
                try:
                    import datetime as _dt
                    created = _dt.datetime.fromisoformat(str(old.get("created_at")).replace("Z", "+00:00"))
                    ev["days_to_sell"] = max(0, (_dt.datetime.now(_dt.timezone.utc) - created).days)
                except Exception:  # noqa: BLE001
                    pass
                await db.units.update_one({"id": old["id"]}, {"$set": {"status": "vendido", "updated_at": now}})
                await db.unit_status_events.insert_one(ev)
                log.info(f"[bulk_ingest] {target_dev_id} unidad {old.get('unit_number')} → VENDIDO (ausente de la lista)")
            except Exception as e:  # noqa: BLE001
                log.warning(f"[bulk_ingest] ausente→vendido {old.get('unit_number')}: {e}")

    # las unidades cambiaron → re-sincroniza el átomo del dev (cubo/granularidad al día). Fail-open.
    try:
        from dmx_cube_feed import sync_ingested_to_atom
        await sync_ingested_to_atom(db, dev.get("developer_id") or dev.get("dev_org_id"))
    except Exception:  # noqa: BLE001
        pass

    # assets: UPSERT por archivo de Drive (antes cada re-ingesta APPENDEABA los mismos → duplicados sin fin)
    _kinds = item.get("image_kinds") or {}
    for f in item.get("source_files", []):
        if not f.get("file_id"):
            continue
        _set = {"filename": f.get("name"), "mime": f.get("mime"), "updated_at": now}
        if _kinds.get(f.get("name")):
            _set["image_kind"] = _kinds[f.get("name")]
        await db.project_assets.update_one(
            {"development_id": target_dev_id, "drive_file_id": f.get("file_id")},
            {"$set": _set,
             "$setOnInsert": {"id": f"asset_{secrets.token_urlsafe(10)}", "development_id": target_dev_id,
                              "type": "drive_reference", "drive_file_id": f.get("file_id"),
                              "captured_at": now, "source": "bulk_ingest_merge", "created_at": now}},
            upsert=True,
        )


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

        src_url = job.get("drive_folder_url", "")
        _dropbox_blobs: Dict[str, bytes] = {}

        async def _fetch(f: Dict[str, Any]) -> Tuple[bytes, str]:
            """Bytes de un archivo sin importar la FUENTE (Drive u Dropbox-zip)."""
            if _dropbox_blobs:
                return _dropbox_blobs[f["id"]], f.get("mimeType") or "application/octet-stream"
            return await _download_file_bytes(conn, f["id"], f.get("mimeType", ""))

        from dropbox_source import is_dropbox_url, fetch_tree as _dropbox_tree
        file_id = None if is_dropbox_url(src_url) else parse_drive_file_id(src_url)
        if is_dropbox_url(src_url):
            # DROPBOX (share público, sin token): zip → mismo árbol/pipeline
            files, _dropbox_blobs = await _dropbox_tree(src_url)
            root_name = (files[0]["id"].split("/")[0] if files else "Dropbox")
            groups = {"dropbox": {"parent_folder_name": root_name, "files": files}}
            # si el zip trae varias carpetas raíz → cada una es un proyecto
            _roots: Dict[str, List[Dict[str, Any]]] = {}
            for f in files:
                _roots.setdefault(f["id"].split("/")[0], []).append(f)
            if len(_roots) > 1:
                groups = {k: {"parent_folder_name": k, "files": v} for k, v in _roots.items()}
        elif file_id:
            # ARCHIVO directo (Google Sheets multi-pestaña = lista de precios viva)
            svc_meta = await asyncio.to_thread(
                lambda: __import__("drive_engine")._drive_service(conn).files().get(
                    fileId=file_id, fields="id,name,mimeType", supportsAllDrives=True).execute())
            f_entry = {"id": file_id, "name": svc_meta.get("name"), "mimeType": svc_meta.get("mimeType"),
                       "immediate_folder": None}
            groups = {"file": {"parent_folder_name": svc_meta.get("name") or "Hoja de precios",
                               "files": [f_entry]}}
            files = [f_entry]
        else:
            folder_id = parse_folder_id(src_url)
            if not folder_id:
                await db.bulk_ingest_jobs.update_one(
                    {"id": job_id},
                    {"$set": {"status": "failed", "completed_at": _iso(),
                              "error_log": [f"URL no reconocida: {src_url}"]}},
                )
                return
            files = await _list_folder_recursive(conn, folder_id)
            groups = _group_by_project(files, folder_id)

        dry_run = bool(job.get("dry_run"))
        only_project = (job.get("only_project") or "").strip().lower()
        for gkey, gdata in groups.items():
            project_name_hint = gdata["parent_folder_name"]
            if only_project and only_project not in (project_name_hint or "").lower():
                continue
            items_total += 1

            # DEDUP POR HASH (pipeline §3): si los archivos del proyecto NO cambiaron desde la última corrida
            # procesada, saltar la extracción completa (cero descargas, cero tokens). La huella sale del listado.
            content_hash = _group_content_hash(gdata["files"])
            try:
                _prev = await db.bulk_ingest_items.find_one(
                    {"target_dev_org_id": target_org, "project_folder_name": project_name_hint,
                     "source_content_hash": content_hash,
                     "decision": {"$in": ["approved", "merged", "skipped_unchanged"]}},
                    {"_id": 0, "inserted_dev_id": 1})
            except Exception:  # noqa: BLE001
                _prev = None
            if _prev and _prev.get("inserted_dev_id"):
                items_auto += 1
                await db.bulk_ingest_items.insert_one({
                    "id": f"bii_{secrets.token_urlsafe(10)}", "job_id": job_id,
                    "target_dev_org_id": target_org, "project_folder_name": project_name_hint,
                    "source_content_hash": content_hash, "decision": "skipped_unchanged",
                    "inserted_dev_id": _prev["inserted_dev_id"], "ai_cost_mxn": 0.0, "created_at": _iso(),
                })
                log.info(f"[bulk_ingest] {project_name_hint}: sin cambios en Drive → saltado (hash)")
                continue
            # PASO 0 · RECONOCIMIENTO: la IA lee el ÁRBOL COMPLETO y decide QUÉ leer (founder 07-08:
            # "que la IA lea la estructura para detectar patrones" — funciona con cualquier Drive).
            plan = await recon_plan(project_name_hint, gdata["files"])
            cost_mxn = 0.10 if plan else 0.0
            building = _building_map_from_plan(plan) if plan else {}
            if plan:
                log.info(f"[bulk_ingest] recon {gkey}: listas={len(plan.get('listas_precios') or [])} "
                         f"brochure={len(plan.get('brochure') or [])} planos={len(plan.get('planos_prototipo') or [])} "
                         f"torres={plan.get('torres')} faltantes={plan.get('faltantes')} · {plan.get('estructura')}")

            # SELECCIÓN DIRIGIDA por el plan: listas de precios (TODAS) + brochure. Fallback a la heurística
            # vieja SOLO si el recon falló por completo (fail-soft, nunca ciego a propósito).
            # listas con FECHA en el nombre → la MÁS RECIENTE primero (y esa fecha viaja al histórico)
            _listas = list(plan.get("listas_precios") or []) if plan else []
            if len(_listas) > 1:
                _listas.sort(key=lambda f: _fecha_de_nombre(f.get("name") or "") or "0000", reverse=True)
            _fichas = list(plan.get("fichas_por_depto") or []) if plan else []
            if plan and (_listas or _fichas or plan.get("brochure")):
                # forma fichas-por-depto: SIN lista, el conjunto de fichas es la disponibilidad (Drive DECA)
                key_files = _listas + (_fichas if not _listas else []) + list(plan.get("brochure") or [])
                sheets = [f for f in gdata["files"] if f.get("mimeType") in SPREADSHEET_MIMES
                          and _file_priority(f) >= 70][:2]
                key_files = key_files + [s for s in sheets if s.get("id") not in {k.get("id") for k in key_files}]
            else:
                docs = [f for f in gdata["files"] if f.get("mimeType") in (PDF_MIMES | NATIVE_DOC_MIMES)]
                sheets = [f for f in gdata["files"] if f.get("mimeType") in SPREADSHEET_MIMES]
                imgs = [f for f in gdata["files"] if (f.get("mimeType") or "").startswith("image/")]
                data_imgs = [f for f in imgs if _file_priority(f) >= 70]
                ranked = sorted(docs + data_imgs, key=_file_priority, reverse=True)
                key_files = ranked[:MAX_KEY_FILES_PER_PROJECT] + sheets[:2]
                key_files = key_files[:MAX_KEY_FILES_PER_PROJECT + 2]

            # Download (best-effort, don't fail entire item)
            payloads: List[Tuple[bytes, str, str]] = []
            for f in key_files:
                try:
                    data, eff_mime = await _fetch(f)
                    payloads.append((data, eff_mime, f.get("name", "")))
                except Exception as e:
                    error_log.append(f"download failed {f.get('id')}: {e}")

            async def _extract_desde_fichas(base_extracted, base_cost):
                """FICHAS-POR-DEPTO por LOTES: cada ficha = 1 unidad con su precio adentro. Devuelve (extracted, cost)."""
                _ex = base_extracted or {"project_name": project_name_hint}
                all_units = list(_ex.get("units") or [])
                ficha_payloads = []
                for pf in _fichas:
                    try:
                        pb, pm = await _fetch(pf)
                        ficha_payloads.append((pb, pm, pf.get("name", "")))
                    except Exception:  # noqa: BLE001
                        continue
                cst = base_cost
                for bi in range(0, len(ficha_payloads), 3):
                    batch = ficha_payloads[bi:bi + 3]
                    try:
                        ex_b, c_b = await extract_bulk_project(project_name_hint, batch)
                        cst += c_b
                        for u in (ex_b.get("units") or []):
                            if u.get("unit_number"):
                                all_units.append(u)
                        for k in ("address_full", "colonia", "alcaldia", "delivery_date",
                                  "maintenance_fee_mxn", "amenities", "price_range"):
                            if not _ex.get(k) and ex_b.get(k):
                                _ex[k] = ex_b[k]
                    except Exception as e:  # noqa: BLE001
                        error_log.append(f"ficha batch {bi // 3 + 1} failed {gkey}: {e}")
                _seen_u = {}
                for u in all_units:
                    k = _unit_identity(u.get("unit_number"))
                    if k not in _seen_u or (u.get("price_mxn") and not _seen_u[k].get("price_mxn")):
                        _seen_u[k] = u
                _ex["units"] = list(_seen_u.values())
                log.info(f"[bulk_ingest] {gkey}: fichas por lotes → {len(_ex['units'])} unidades "
                         f"({sum(1 for u in _ex['units'] if u.get('price_mxn'))} con precio)")
                return _ex, cst

            try:
                if _fichas and not _listas:
                    extracted, _c = await extract_bulk_project(project_name_hint, payloads[:2])  # brochure/contexto
                    extracted, cost_mxn = await _extract_desde_fichas(extracted, cost_mxn + _c)
                else:
                    extracted, _c = await extract_bulk_project(project_name_hint, payloads)
                    cost_mxn += _c
                    # FALLBACK lista→fichas: la lista existe pero no rindió unidades (escaneada/vieja/ilegible)
                    # y HAY fichas vivas → el inventario sale de las fichas (validación AVC 07-08).
                    if _fichas and not (extracted.get("units") or []):
                        log.info(f"[bulk_ingest] {gkey}: lista sin unidades → fallback a {len(_fichas)} fichas")
                        extracted, cost_mxn = await _extract_desde_fichas(extracted, cost_mxn)
            except Exception as e:
                extracted, _c = _stub_extraction(project_name_hint), 0.0
                error_log.append(f"extract failed {gkey}: {e}")

            # ANTI-FANTASMA (founder): sin lista de precios NO hay inventario — NUNCA inventar unidades desde
            # planos/cotizaciones. El proyecto va a revisión con el motivo claro.
            _anchored = bool(_listas or _fichas) if plan else bool(extracted.get("units"))
            if plan and not (_listas or _fichas):
                extracted["units"] = []
                extracted["_needs_review"] = "sin lista de precios NI fichas por depto visibles (recon)"
            # PRODUCTO: solo RESIDENCIAL nuevo entra al marketplace (founder: no oficinas/terrenos/rentas/reventas)
            _producto = (plan or {}).get("producto") or "residencial"
            if _producto not in ("residencial", "mixto"):
                extracted["_needs_review"] = f"producto excluido: {_producto} (solo residencial nuevo)"
                extracted["_producto"] = _producto
            if plan and plan.get("etapa_carpeta") == "agotado":
                extracted["_needs_review"] = "proyecto marcado VENDIDO/agotado en el Drive (histórico, no publicar)"

            # HECHOS DEL EDIFICIO (mapa determinista desde nombres de planos + carpeta):
            # unidades TOTALES reales, niveles, depas por piso, torres, etapa desde el nombre de carpeta.
            if building:
                extracted["_building"] = building
                if building.get("total_units_edificio"):
                    extracted["total_units"] = building["total_units_edificio"]
            if plan.get("etapa_carpeta") in ("preventa", "construccion", "entrega_inmediata"):
                extracted["stage"] = "entrega" if plan["etapa_carpeta"] == "entrega_inmediata" else plan["etapa_carpeta"]

            # PROTOTIPO POR TERMINACIÓN (founder): 101/201/301 → '01' cuando la lista no lo trae explícito,
            # validando que las configuraciones coincidan. ANTES del pase de planos (que cruza por prototipo).
            try:
                _np = _derive_prototypes(extracted)
                if _np:
                    log.info(f"[bulk_ingest] {gkey}: prototipo derivado por terminación en {_np} unidades")
            except Exception:  # noqa: BLE001
                pass

            # PASE DE PLANOS (modo profundo): si a las unidades les falta el desglose de m², leer los PLANOS
            # (2ª pasada) y cruzarlos por número de depto o prototipo. Fail-soft — nunca tira la ingesta.
            try:
                if _needs_plan_pass(extracted):
                    plano_files = (list(plan.get("planos_prototipo") or [])[:9] if plan
                                   else [f for f in gdata["files"] if _is_plano(f)][:9])
                    if plano_files:
                        plano_payloads: List[Tuple[bytes, str, str]] = []
                        for pf in plano_files:
                            try:
                                pb, pm = await _fetch(pf)
                                plano_payloads.append((pb, pm, pf.get("name", "")))
                            except Exception as e:  # noqa: BLE001
                                error_log.append(f"plano download failed {pf.get('id')}: {e}")
                        if plano_payloads:
                            desgloses, plan_cost = await extract_plan_breakdowns(plano_payloads)
                            n_filled = _apply_plan_breakdowns(extracted, desgloses)
                            cost_mxn += plan_cost
                            log.info(f"[bulk_ingest] pase de planos {gkey}: {len(desgloses)} planos leídos "
                                     f"→ {n_filled} unidades enriquecidas")
            except Exception as e:  # noqa: BLE001
                error_log.append(f"plan pass failed {gkey}: {e}")

            # CLASIFICACIÓN DE IMÁGENES (founder): render → Multimedia · foto de obra → Avance de obra ·
            # depto muestra → NO se muestra. Se clasifica al ingerir y viaja en item_doc → project_assets.
            image_kinds: Dict[str, str] = {}
            try:
                _all_imgs = [f for f in gdata["files"] if (f.get("mimeType") or "").startswith("image/")]
                # 1º por CARPETA (gratis y más fiable): DEPTO MUESTRA→muestra · RENDERS/INTERIORES/EXTERIORES/
                # AMENIDADES→render · FOTOS/OBRA/AVANCE/DRON→obra · sensibles→otro
                _FK = (("muestra", "muestra"), ("render", "render"), ("interior", "render"),
                       ("exterior", "render"), ("amenidad", "render"), ("amenities", "render"),
                       ("vistas", "render"), ("obra", "obra"), ("avance", "obra"), ("dron", "obra"),
                       ("fotos", "obra"))
                pend = []
                for f in _all_imgs:
                    nm = f.get("name") or ""
                    fol = (f.get("immediate_folder") or "").lower()
                    if _is_sensitive_name(nm):
                        image_kinds[nm] = "otro"
                        continue
                    kind = next((k for kw, k in _FK if kw in fol), None)
                    if kind:
                        image_kinds[nm] = kind
                    elif not nm.lower().endswith(".avif"):   # visión no soporta avif
                        pend.append(f)
                img_files = pend[:24]
                if img_files:
                    img_payloads: List[Tuple[bytes, str, str]] = []
                    for imf in img_files:
                        try:
                            ib, im = await _fetch(imf)
                            img_payloads.append((ib, im, imf.get("name", "")))
                        except Exception:  # noqa: BLE001
                            continue
                    if img_payloads:
                        image_kinds = await classify_project_images(img_payloads)
                        cost_mxn += 0.25 * max(1, len(img_payloads) // 4)
                        log.info(f"[bulk_ingest] {gkey}: {len(image_kinds)} imágenes clasificadas "
                                 f"({sum(1 for k in image_kinds.values() if k == 'render')} renders, "
                                 f"{sum(1 for k in image_kinds.values() if k == 'obra')} obra)")
            except Exception as e:  # noqa: BLE001
                error_log.append(f"image classify failed {gkey}: {e}")

            # W2.3 SA4 — feature_key tagging for AI cost observatory
            if cost_mxn > 0:
                try:
                    from ai_budget import track_ai_call
                    await track_ai_call(
                        db, target_org or "bulk_ingest", BULK_INGEST_MODEL,
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
            if decision == "auto_approve" and extracted.get("_needs_review"):
                decision = "pending_review"
            # Extracción FALLIDA (timeout/stub, sin unidades) → NUNCA auto-aprobar/mergear: a revisión con motivo.
            if decision == "auto_approve" and extracted.get("_low_confidence") and not (extracted.get("units") or []):
                decision = "pending_review"
                extracted["_needs_review"] = "extracción fallida o incompleta (timeout / sin datos legibles)"

            # GATE DE CONSISTENCIA: score de confianza + razones (siempre; gratis)
            validacion = validate_extraction(extracted, plan or {}, building, project_name_hint)
            if decision == "auto_approve" and not validacion["publicable"]:
                decision = "pending_review"
                extracted.setdefault("_needs_review",
                                     f"consistencia {validacion['score']}/100: " +
                                     "; ".join(c["check"] for c in validacion["checks"] if not c["ok"]))

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
                "source_content_hash": content_hash,   # dedup por hash en la próxima corrida
                "image_kinds": image_kinds,            # render/obra/muestra/otro → project_assets
                "recon_plan": {k: ([f.get("name") for f in v] if isinstance(v, list) and v and isinstance(v[0], dict) else v)
                               for k, v in (plan or {}).items()},   # LINAJE: qué leyó y por qué
                "validacion": validacion,              # score de consistencia 0-100 + checks
                "anchored": _anchored,                 # ¿hubo lista de precios? (gate de ausente=vendido)
                "extracted": extracted,
                "dedup": dedup,
                "decision": decision,
                "inserted_dev_id": None,
                "ai_cost_mxn": cost_mxn,
                "created_at": _iso(),
            }

            if dry_run:
                # SIMULACRO: guarda TODO el análisis (plan/extracción/validación) sin tocar la plataforma
                item_doc["decision"] = "dry_run"
                await db.bulk_ingest_items.insert_one(dict(item_doc))
                items_auto += 1
                continue

            _match_id = dedup.get("best_match_dev_id")
            if decision == "auto_approve" and _match_id and (score or 0) >= 0.85:
                # MATCH EXACTO → MERGE al dev existente (refresh de lista): actualiza precios/estatus y captura
                # los DELTAS (históricos). Antes insertaba como NUEVO → re-ingerir DUPLICABA el proyecto.
                try:
                    await merge_into_dev(db, item_doc, _match_id)
                    item_doc["decision"] = "merged"
                    item_doc["inserted_dev_id"] = _match_id
                    item_doc["decision_at"] = _iso()
                    items_auto += 1
                except Exception as e:
                    item_doc["decision"] = "failed"
                    item_doc["error"] = str(e)[:500]
                    items_failed += 1
                    error_log.append(f"merge failed {gkey}: {e}")
            elif decision == "auto_approve":
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

        # CARPETAS NUEVAS / RETIRADAS del Drive (pregunta del founder 07-08):
        # · Carpeta NUEVA → entra sola como proyecto nuevo (insert arriba, queda 'pending' de aprobar).
        # · Carpeta RETIRADA → el dev ingerido del org que NO apareció en este scan se MARCA
        #   missing_from_drive_at (visible en superadmin). NUNCA se borra ni despublica solo — decisión humana.
        try:
            if target_org and items_total > 0:
                seen_ids = set()
                async for it in db.bulk_ingest_items.find(
                        {"job_id": job_id, "inserted_dev_id": {"$nin": [None, ""]}},
                        {"_id": 0, "inserted_dev_id": 1}):
                    seen_ids.add(it["inserted_dev_id"])
                q_org = {"source": "bulk_ingest",
                         "$or": [{"dev_org_id": target_org}, {"developer_id": target_org}]}
                async for d in db.developments.find(q_org, {"_id": 0, "id": 1}):
                    if d["id"] in seen_ids:
                        await db.developments.update_one(
                            {"id": d["id"]},
                            {"$set": {"last_seen_in_drive": _iso()}, "$unset": {"missing_from_drive_at": ""}})
                    else:
                        await db.developments.update_one(
                            {"id": d["id"], "missing_from_drive_at": {"$exists": False}},
                            {"$set": {"missing_from_drive_at": _iso()}})
        except Exception as e:  # noqa: BLE001
            log.warning(f"[bulk_ingest] marca carpetas retiradas falló: {e}")

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


# ─── AUTO-REFRESH (#3) — re-ingesta periódica de las carpetas ya cargadas ─────

async def auto_refresh_bulk_ingests(db) -> Dict[str, Any]:
    """CRON: por cada dev con Drive conectado, re-corre su ÚLTIMA carpeta de ingesta. El dedup evita
    duplicados (proyectos existentes se fusionan/saltan; solo entran nuevos o cambios). Así, si el dev
    actualiza su lista de precios en Drive, el sistema lo recoge solo (sin que nadie apriete nada)."""
    seen: set = set()
    launched = 0
    cur = db.bulk_ingest_jobs.find(
        {"drive_folder_url": {"$nin": [None, ""]}, "source": {"$ne": "auto_refresh"}}
    ).sort("started_at", -1)
    async for j in cur:
        dev = j.get("target_dev_org_id")
        url = j.get("drive_folder_url")
        key = dev or url
        if not url or key in seen:
            continue
        seen.add(key)
        conn = await _resolve_drive_conn(db, dev)   # solo si hay Drive (OAuth o api-key)
        if not conn:
            continue
        job_id = f"bij_{secrets.token_urlsafe(10)}"
        await db.bulk_ingest_jobs.insert_one({
            "id": job_id, "drive_folder_url": url, "target_dev_org_id": dev,
            "status": "pending", "source": "auto_refresh",
            "items_total": 0, "started_at": _iso(), "error_log": [],
        })
        asyncio.create_task(run(db, job_id))
        launched += 1
    log.info(f"[bulk_ingest] auto-refresh lanzó {launched} re-ingestas")
    return {"auto_refreshed": launched}


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
