"""
Catálogo de recetas IE — legibilidad "qué alimenta · de qué fuente · cómo se conecta".
═══════════════════════════════════════════════════════════════════════════════
El motor de scores (score_engine + recipes/) NUNCA inventa números: una receta sin
fuente conectada queda en stub y se OCULTA al comprador. Eso es honesto pero invisible:
nadie sabe QUÉ está pendiente ni la UNA acción para prenderlo.

Este módulo cruza, en lenguaje normal:
  receta  →  qué muestra en el producto  →  qué fuente la alimenta  →  cómo conectarla.

Lo usan dos lugares:
  · superadmin GET /api/superadmin/recipes-coverage → consola "Cobertura de Datos"
    (qué está conectado / listo / pendiente, con la instrucción de conexión).
  · comprador/dev: la cobertura por zona marca lo pendiente como "datos en camino"
    (en vez de esconderlo) → confianza, no hueco.

Cuando el operador pega el resource_id (o sube el archivo) y sincroniza, la receta
se prende sola: el connector empieza a devolver obs reales → el score deja de ser stub.
Cero deuda: nada inventado, todo se autollena al llegar el dato.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# ── Qué muestra cada receta en el producto (lenguaje de persona normal) ──
# Solo las de cara al usuario / conectables. El resto cae al description de la receta.
RECIPE_INFO: Dict[str, Dict[str, str]] = {
    "IE_COL_SALUD": {
        "categoria": "Salud", "icono": "salud",
        "powers": "Hospitales y clínicas cerca de la zona (qué tan cubierta está en salud).",
    },
    "IE_COL_EDUCACION": {
        "categoria": "Escuelas", "icono": "escuela",
        "powers": "Escuelas y universidades cercanas (oferta educativa de la zona).",
    },
    "IE_COL_EDUCACION_CALIDAD": {
        "categoria": "Escuelas", "icono": "escuela",
        "powers": "Calidad de las escuelas (rankings SEP).",
    },
    "IE_COL_AGUA_CONFIABILIDAD": {
        "categoria": "Agua", "icono": "agua",
        "powers": "Qué tan confiable es el agua (cortes reportados por SACMEX).",
    },
    "IE_COL_LOCATEL": {
        "categoria": "Servicios 311", "icono": "locatel",
        "powers": "Reportes ciudadanos 311 (baches, luminarias, fugas) por zona.",
    },
    "IE_COL_SEGURIDAD": {
        "categoria": "Seguridad", "icono": "seguridad",
        "powers": "Seguridad de la zona (densidad de carpetas FGJ).",
    },
    "IE_COL_AIRE": {
        "categoria": "Aire", "icono": "aire",
        "powers": "Calidad del aire de la zona.",
    },
    "IE_COL_CLIMA_INUNDACION": {
        "categoria": "Riesgo", "icono": "riesgo",
        "powers": "Riesgo de inundación (Atlas de Riesgos + CONAGUA).",
    },
    "IE_COL_CLIMA_SISMO": {
        "categoria": "Riesgo", "icono": "riesgo",
        "powers": "Riesgo sísmico (microzonas del Atlas).",
    },
}

# Recetas de cara al comprador cuya ausencia debe mostrarse como "dato en camino".
USER_FACING_CODES = [
    "IE_COL_SALUD", "IE_COL_EDUCACION", "IE_COL_AGUA_CONFIABILIDAD",
    "IE_COL_LOCATEL", "IE_COL_SEGURIDAD", "IE_COL_AIRE",
    "IE_COL_CLIMA_INUNDACION", "IE_COL_CLIMA_SISMO",
]

# Instrucción de conexión por tipo de acceso de la fuente (lenguaje normal).
COMO_CONECTAR = {
    "ckan_resource": "Pega el ID del recurso (resource_id) del dataset en datos.cdmx.gob.mx y prueba la conexión.",
    "manual_upload": "Sube el archivo (shapefile/CSV) de la fuente — no necesita resource_id.",
    "api_key": "Configura la llave (API key) de la fuente.",
    "keyless_url": "Fuente pública: basta con sincronizar.",
    "wms_wfs": "Fuente geográfica pública (WMS/WFS): basta con sincronizar.",
    "external_paid": "Fuente de paga: requiere contrato + llave.",
}


def _source_configured(doc: Dict[str, Any], creds: Dict[str, str]) -> bool:
    """¿La fuente tiene lo necesario para devolver dato real?"""
    access = doc.get("access_mode")
    if access == "ckan_resource":
        return bool(creds.get("resource_id"))
    if access == "api_key":
        return any(bool(v) for v in creds.values())
    if access == "manual_upload":
        return (doc.get("records_total") or 0) > 0
    if access in ("keyless_url", "wms_wfs"):
        return bool(doc.get("endpoint"))
    return bool(creds)


def recipe_label(code: str, recipe: Any) -> Dict[str, str]:
    info = RECIPE_INFO.get(code)
    if info:
        return info
    return {"categoria": "Otros", "icono": "otros",
            "powers": getattr(recipe, "description", "") or code}


async def build_recipe_coverage(db) -> Dict[str, Any]:
    """Cruza recetas × fuentes × scores reales → estado + cómo conectar.

    Estados:
      · conectada — ya hay score real (o todas sus fuentes están configuradas y OK).
      · lista     — fuentes con credenciales puestas; falta sincronizar / devuelve stub aún.
      · pendiente — falta el resource_id / la subida del archivo.
      · interna   — receta derivada (sin fuente externa); depende de otras señales.
    """
    from score_engine import all_recipes

    # Fuentes en un mapa + credenciales desencriptadas (sin exponer secretos).
    try:
        from routes.ie_engine import decrypt_credentials
    except Exception:  # pragma: no cover
        def decrypt_credentials(_):
            return {}
    src_by_id: Dict[str, Dict[str, Any]] = {}
    async for d in db.ie_data_sources.find({}, {"_id": 0}):
        src_by_id[d["id"]] = d

    # ¿Qué codes tienen al menos un score real (no-stub) en cualquier zona?
    real_codes = set(await db.ie_scores.distinct("code", {"is_stub": False, "value": {"$ne": None}}))

    recipes = all_recipes()
    items: List[Dict[str, Any]] = []
    for code, recipe in recipes.items():
        deps = list(getattr(recipe, "dependencies", []) or [])
        label = recipe_label(code, recipe)

        if not deps:
            estado = "interna"
            fuentes = []
            como = "Se calcula a partir de otras señales del sistema; no se conecta una fuente directa."
        else:
            fuentes = []
            all_conf = True
            any_conf = False
            como_parts = []
            for sid in deps:
                sdoc = src_by_id.get(sid)
                if not sdoc:
                    all_conf = False
                    continue
                creds = decrypt_credentials(sdoc.get("credentials"))
                conf = _source_configured(sdoc, creds)
                all_conf = all_conf and conf
                any_conf = any_conf or conf
                fuentes.append({
                    "id": sid, "name": sdoc.get("name") or sid,
                    "access_mode": sdoc.get("access_mode"),
                    "configurada": conf, "last_status": sdoc.get("last_status", "never"),
                    "records_total": sdoc.get("records_total", 0),
                })
                como_parts.append(COMO_CONECTAR.get(sdoc.get("access_mode"), "Configura la fuente."))

            if code in real_codes:
                estado = "conectada"
            elif fuentes and all_conf:
                estado = "lista"
            elif any_conf:
                estado = "lista"
            else:
                estado = "pendiente"
            # Instrucción: la del primer source no configurado (la acción que falta).
            como = next((COMO_CONECTAR.get(f["access_mode"], "Configura la fuente.")
                         for f in fuentes if not f["configurada"]),
                        como_parts[0] if como_parts else "Sincroniza la fuente.")

        items.append({
            "code": code, "categoria": label["categoria"], "icono": label.get("icono", "otros"),
            "powers": label["powers"], "scope": getattr(recipe, "scope", "colonia"),
            "user_facing": code in USER_FACING_CODES,
            "estado": estado, "fuentes": fuentes, "como_conectar": como,
        })

    # Orden: pendientes de cara al usuario primero (lo que más mueve la aguja).
    rank = {"pendiente": 0, "lista": 1, "conectada": 2, "interna": 3}
    items.sort(key=lambda x: (rank.get(x["estado"], 9), not x["user_facing"], x["categoria"]))

    def _count(estado):
        return sum(1 for it in items if it["estado"] == estado)
    return {
        "items": items, "count": len(items),
        "kpis": {
            "conectadas": _count("conectada"), "listas": _count("lista"),
            "pendientes": _count("pendiente"), "internas": _count("interna"),
            "pendientes_user": sum(1 for it in items if it["estado"] in ("pendiente", "lista") and it["user_facing"]),
        },
    }


def pending_categories_for_zone(real_codes_in_zone: List[str]) -> List[Dict[str, str]]:
    """Para una zona: categorías de cara al usuario que aún NO tienen score real.

    Se muestra como 'datos en camino' en el comprador/dev (honesto, no hueco).
    Deduplica por categoría (Salud, Escuelas, Agua, …).
    """
    real = set(real_codes_in_zone or [])
    seen = set()
    out: List[Dict[str, str]] = []
    for code in USER_FACING_CODES:
        if code in real:
            continue
        info = RECIPE_INFO.get(code) or {}
        cat = info.get("categoria") or code
        if cat in seen:
            continue
        seen.add(cat)
        out.append({"categoria": cat, "icono": info.get("icono", "otros"), "powers": info.get("powers", "")})
    return out
