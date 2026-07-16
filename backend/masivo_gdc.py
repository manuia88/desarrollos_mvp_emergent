"""EL MASIVO DE GDC — orquestador para el 2º desarrollador (formato distinto a CLASS).

GDC no tiene Excel maestro: la lista PDF (familia 'gdc', header-driven) es la fuente de
unidad. El resto del pipeline se REUSA igual que CLASS (cargar_lote → 8 capas → cobertura
→ auditoría → planos → estado). Lo propio de GDC:
  · nombre + dirección salen del NOMBRE de la carpeta: "Casa Condesa (Vasconcelos 107)"
  · estatus sale de la CARPETA PADRE (VENDIDO / PREVENTA / ENTREGA INMEDIATA)
  · datos de desarrollo (amenidades/acabados/entrega) viven en la presentación VISUAL
    → se pasan en `presentacion` (leídos en sesión o por el lector visual)
  · esquemas de pago múltiples ya vienen resueltos por extraer_gdc

Solo cargar_proyecto_gdc toca Mongo. $0. Puro/testeable en las helpers.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

DEVELOPER_GDC = "org_gdc"          # el desarrollador GDC (se crea al vuelo)

_STATUS_CARPETA = {"VENDIDO": "vendido", "PREVENTA": "preventa",
                   "ENTREGA INMEDIATA": "entrega inmediata"}


def nombre_y_direccion(folder_name: str) -> Tuple[str, Optional[str]]:
    """'CASA CONDESA (Vasconcelos 107)' → ('Casa Condesa', 'Vasconcelos 107').
    Sin paréntesis → (nombre, None)."""
    m = re.match(r"^\s*(.+?)\s*\((.+)\)\s*$", folder_name or "")
    if m:
        return m.group(1).strip().title(), m.group(2).strip()
    return (folder_name or "").strip().title(), None


def estatus_de_carpeta(carpeta_padre: str) -> Optional[str]:
    up = (carpeta_padre or "").upper()
    return next((v for k, v in _STATUS_CARPETA.items() if k in up), None)


def es_cdmx_residencial(nombre: str, direccion: Optional[str]) -> bool:
    """Filtro founder (07-16): solo CDMX + residencial. Fuera otras ciudades y oficinas.

    OJO (aprendizaje 07-16): 'Monterrey' y 'Medellín' son CALLES de la Roma (CDMX) —
    Casa Roma 240 (Monterrey 240), Vía Roma 386 (Monterrey 386), Casa Roma 269 (Medellín
    269) SON CDMX. No excluir por esos nombres; excluir solo CIUDADES reales inequívocas
    y las oficinas WorkLab (que ya caen por su propio nombre)."""
    txt = f"{nombre} {direccion or ''}".upper()
    fuera_ciudad = any(c in txt for c in (
        "TIJUANA", "PUERTO ESCONDIDO", "GUADALAJARA", "CANCÚN", "CANCUN", "MÉRIDA",
        "MERIDA", "QUERÉTARO", "QUERETARO", "PLAYA DEL CARMEN", "TULUM", "PERÚ",
        "PERU", "MIAMI", "MONTERREY, N", "MEDELLÍN, COL"))
    es_oficina = any(o in txt for o in ("WORK LAB", "WORKLAB", "WORK-LAB"))
    return not fuera_ciudad and not es_oficina


async def cargar_bodegas_gdc(db, dev_id: str, pdf_bytes: bytes,
                             archivo: str = "bodegas.pdf") -> Dict[str, Any]:
    """Inventario de BODEGAS (producto distinto al depto: sin recámaras) → colección
    propia `dev_bodegas`, NO ensucia el conteo de departamentos. Cada bodega guarda su
    renglón crudo (cero deuda). Idempotente por (development_id, clave)."""
    from extractores_layout import extraer_gdc_bodegas
    r = extraer_gdc_bodegas(pdf_bytes)
    if not r["unidades"]:
        return {"estado": "sin_bodegas"}
    for b in r["unidades"]:
        clave = b["unit_number"]
        await db.dev_bodegas.update_one(
            {"development_id": dev_id, "clave": clave},
            {"$set": {"development_id": dev_id, "clave": clave,
                      "nivel": b.get("nivel_texto"), "m2": b.get("size_m2"),
                      "price_mxn": b.get("price_mxn"), "status": b.get("status"),
                      "fuente": archivo, "fuente_lista": b}}, upsert=True)
    return {"estado": "cargadas", "bodegas": r["validacion"]["total"],
            "con_precio": r["validacion"]["con_precio"]}


async def cargar_proyecto_gdc(db, proyecto: Dict[str, Any]) -> Dict[str, Any]:
    """proyecto = {folder_name, carpeta_padre, unidades (de extraer_gdc), presentacion?,
    fuentes_pdf?, fuentes_meta?}. Crea/actualiza el dev y dispara el pipeline."""
    from datetime import datetime, timezone

    nombre, direccion = nombre_y_direccion(proyecto["folder_name"])
    estatus = estatus_de_carpeta(proyecto.get("carpeta_padre", ""))
    pres = proyecto.get("presentacion") or {}
    dev = await db.developments.find_one({"name": nombre}, {"_id": 0, "id": 1})
    dev_id = (dev or {}).get("id") or f"dev_gdc_{re.sub(r'[^a-z0-9]+', '_', nombre.lower()).strip('_')}"
    # asegurar el desarrollador GDC
    if not await db.dev_orgs.find_one({"tenant_id": DEVELOPER_GDC}):
        await db.dev_orgs.update_one({"tenant_id": DEVELOPER_GDC},
                                     {"$set": {"tenant_id": DEVELOPER_GDC, "name": "GDC",
                                               "slug": "gdc"}}, upsert=True)
    # campos CALCULADOS (no impresos en la lista GDC): el juez no debe buscarlos en el PDF
    derivados = proyecto.get("campos_derivados") or ["size_m2", "enganche_mxn", "credito_mxn"]
    # capa 7: la fuente de GDC es la LISTA (no hay Maestro) → columnas del header que no
    # capturamos = brecha de cobertura (vacío = capturamos todo lo que la lista trae)
    no_mapeadas = proyecto.get("columnas_no_mapeadas") or []
    campos = {"stage": estatus, "etapa_comercial": estatus, "campos_derivados": derivados,
              "fuente_unidad": "lista", "columnas_no_mapeadas": no_mapeadas}
    if not dev:
        await db.developments.insert_one({
            "id": dev_id, "name": nombre, "developer_id": DEVELOPER_GDC,
            "source": "masivo_gdc", "status": "active", "published": None,
            "address": (f"{direccion}, Ciudad de México" if direccion else None),
            "address_full": direccion,
            "acabados_entrega": pres.get("acabados"),
            "total_units": pres.get("total_units"),
            "created_at": datetime.now(timezone.utc).isoformat(), **campos})
    else:
        await db.developments.update_one({"id": dev_id}, {"$set": campos})
    from ingesta_directa import cargar_lote
    r = await cargar_lote(db, dev_id, proyecto["unidades"],
                          origen=proyecto.get("origen", "masivo_gdc"),
                          fuentes_pdf=proyecto.get("fuentes_pdf"),
                          fuentes_meta=proyecto.get("fuentes_meta"))
    # GPS desde la dirección (OSM, $0)
    try:
        from geocodificar import geocodificar_dev
        await geocodificar_dev(db, dev_id)
    except Exception:  # noqa: BLE001
        pass
    # PRESENTACIÓN (imagen): datos de desarrollo + renders + plantas → cierra las
    # dimensiones que la lista no trae (amenidades/características/entrega/renders/planos)
    extra: Dict[str, Any] = {}
    if pres:
        from presentacion_gdc import (guardar_datos_desarrollo, ingerir_plantas,
                                      ingerir_renders)
        extra["datos"] = await guardar_datos_desarrollo(db, dev_id, pres)
        if proyecto.get("presentacion_pdf"):
            extra["renders"] = await ingerir_renders(db, dev_id, proyecto["presentacion_pdf"])
        if proyecto.get("plantas_pdf"):
            extra["plantas"] = await ingerir_plantas(db, dev_id, proyecto["plantas_pdf"])
        try:                      # re-auditar: las nuevas dimensiones ya deben prender
            from auditoria_drive import auditar_dev
            await auditar_dev(db, dev_id)
        except Exception:  # noqa: BLE001
            pass
    return {"dev_id": dev_id, "nombre": nombre, "estatus": estatus, **extra,
            **{k: r[k] for k in ("unidades_antes", "unidades_despues", "moldes",
                                 "acta_id", "juez")}}
