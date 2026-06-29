"""LAUNCH DATES — resolutor honesto de la fecha de lanzamiento (entrada al mercado) por desarrollo, para desbloquear
las métricas de VELOCIDAD (meses-para-vender, absorción) sin inventar fechas.

Jerarquía de fuente (la más precisa gana), cada una etiquetada:
  1) CAPTURADA — fecha_lanzamiento puesta por el dev/superadmin (development_overrides) o en los datos. (preciso)
  2) ESTIMADA por avance de obra — back-calc con delivery_estimate + construction_progress.% + last_update (todo real).
  3) ESTIMADA por etapa — default grueso por stage cuando no hay obra. (señal débil)
  4) sin dato — queda latente.

NO se inventan fechas: la estimación usa campos reales del desarrollo + supuesto estándar de avance lineal de obra.
La capa de captura (development_overrides) hace que cuando el dev escriba la fecha real, esta gane sobre la estimación.
"""
import datetime as dt
import re
from typing import Any, Dict, Optional, Tuple

_MESES_ES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
             "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
             "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
# defaults gruesos por etapa: meses que típicamente lleva en mercado (señal débil, etiquetada)
_STAGE_MESES = {"entrega_inmediata": 30, "exclusiva": 3, "en_construccion": 14, "construccion": 14, "preventa": 6}


def _parse_ym(s) -> Optional[dt.datetime]:
    """'2027-10' / '2025-08' / '2026' → datetime (día 1)."""
    if not s:
        return None
    m = re.match(r"^(\d{4})(?:-(\d{1,2}))?", str(s).strip())
    if not m:
        return None
    try:
        return dt.datetime(int(m.group(1)), int(m.group(2) or 1), 1)
    except (ValueError, TypeError):
        return None


def _parse_month_label(s) -> Optional[dt.datetime]:
    """'Marzo 2026' / 'Mar 2026' / 'Feb 2026' → datetime."""
    if not s:
        return None
    m = re.match(r"([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{4})", str(s).strip())
    if not m:
        return None
    mes = _MESES_ES.get(m.group(1).lower()[:3]) or _MESES_ES.get(m.group(1).lower())
    if not mes:
        return None
    try:
        return dt.datetime(int(m.group(2)), mes, 1)
    except (ValueError, TypeError):
        return None


def derive_launch(dev: Dict[str, Any], captured: Optional[str] = None) -> Tuple[Optional[dt.datetime], str, bool]:
    """Devuelve (fecha_lanzamiento, metodo, preciso). No inventa: usa dato real del desarrollo."""
    cap = captured or dev.get("fecha_lanzamiento")
    d = _parse_ym(cap)
    if d:
        return (d, "capturado", True)
    # 2) back-calc por avance de obra (todo real)
    cp = dev.get("construction_progress") or {}
    pct = cp.get("percentage")
    lu = _parse_month_label(cp.get("last_update"))
    de = _parse_ym(dev.get("delivery_estimate"))
    if isinstance(pct, (int, float)) and 0 < pct < 100 and lu and de and de > lu:
        meses_restantes = (de - lu).days / 30.0
        total = meses_restantes / (1 - pct / 100.0)          # duración total de obra (avance lineal)
        start = de - dt.timedelta(days=total * 30)
        if start < dt.datetime.utcnow():
            return (start, "estimado · avance de obra + entrega", False)
    # 3) default por etapa (señal débil)
    stage = str(dev.get("stage") or "").lower()
    if stage in _STAGE_MESES:
        return (dt.datetime.utcnow() - dt.timedelta(days=_STAGE_MESES[stage] * 30), "estimado · etapa", False)
    return (None, "sin dato", False)


async def load_overrides(db) -> Dict[str, str]:
    """Fechas de lanzamiento CAPTURADAS por el dev/superadmin (development_overrides.fecha_lanzamiento)."""
    out: Dict[str, str] = {}
    try:
        async for ov in db.development_overrides.find({"fecha_lanzamiento": {"$ne": None}}, {"_id": 0, "dev_id": 1, "fecha_lanzamiento": 1}):
            if ov.get("dev_id"):
                out[ov["dev_id"]] = ov["fecha_lanzamiento"]
    except Exception:
        pass
    return out


async def dev_launch_map(db) -> Dict[str, Tuple[Optional[dt.datetime], str, bool]]:
    """{dev_id: (fecha, metodo, preciso)} para todos los desarrollos — capturada gana sobre estimada."""
    from data_developments import DEVELOPMENTS
    ov = await load_overrides(db)
    return {d["id"]: derive_launch(d, captured=ov.get(d["id"])) for d in DEVELOPMENTS}


async def set_launch(db, dev_id: str, fecha_lanzamiento: str) -> Dict[str, Any]:
    """Captura/actualiza la fecha de lanzamiento real de un desarrollo (persistente, gana sobre la estimación)."""
    if not _parse_ym(fecha_lanzamiento):
        return {"ok": False, "error": "formato inválido — usa AAAA-MM (ej. 2025-08)"}
    await db.development_overrides.update_one(
        {"dev_id": dev_id}, {"$set": {"dev_id": dev_id, "fecha_lanzamiento": fecha_lanzamiento,
                                      "updated_at": dt.datetime.utcnow()}}, upsert=True)
    return {"ok": True, "dev_id": dev_id, "fecha_lanzamiento": fecha_lanzamiento}


def coverage(launch_map: Dict[str, Tuple]) -> Dict[str, int]:
    """Desglose de cobertura: cuántos capturados / estimados-obra / estimados-etapa / sin dato."""
    c = {"capturado": 0, "estimado · avance de obra + entrega": 0, "estimado · etapa": 0, "sin dato": 0}
    for _, metodo, _p in launch_map.values():
        c[metodo] = c.get(metodo, 0) + 1
    return c
