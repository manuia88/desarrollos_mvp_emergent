"""
valores_unitarios_engine — Valores Unitarios de Suelo OFICIALES 2026 (ING.2b · stub-ready).
═══════════════════════════════════════════════════════════════════════════════
Qué es: las tablas oficiales que publica la Gaceta Oficial CDMX (Código Fiscal · art. 129)
con el valor unitario de SUELO $/m² por "área de valor"/colonia catastral, vigentes para el
ejercicio fiscal en curso. Es la base oficial MÁS ACTUAL del valor del suelo (el `vsuelo` del SIG
es de 2022; estas tablas se actualizan cada año).

Por qué es OPCIONAL (no bloquea): el modelo suelo→comercial (ING.2 · comercial_value_model) YA
aprende la relación catastral→comercial de las ventas reales. Estas tablas son un REFUERZO: si se
cargan, damos el valor del suelo más reciente como ancla (sustituye al `vsuelo` 2022 por colonia).

Cero deuda (se construye aunque no haya dato): el conector está completo y honesto. Mientras no se
cargue la tabla (env `IE_VALORES_UNITARIOS_2026_URL` o carga manual de filas), responde no-op y el
sistema sigue usando el `vsuelo` 2022 del SIG. Al cargar la tabla, se autollenan las colonias.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.valores_unitarios")

_PERIODO = "2026"


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def status(db, city: str = "CDMX") -> Dict[str, Any]:
    """Estado del conector: cuántas colonias tienen valor unitario oficial cargado (honesto)."""
    con_dato = await db.colonias.count_documents(
        {"city": city, "valor_unitario_suelo": {"$ne": None}})
    fuente = await db.valores_unitarios_meta.find_one({"_id": city}, {"_id": 0})
    return {
        "ok": True, "city": city, "periodo": _PERIODO,
        "colonias_con_valor": con_dato,
        "fuente": fuente,
        "env_url_configurada": bool(os.environ.get("IE_VALORES_UNITARIOS_2026_URL")),
        "nota": (None if con_dato else
                 "Aún no se ha cargado la tabla oficial 2026. El sistema usa el valor catastral "
                 "del suelo (SIG 2022) mientras tanto. Carga la tabla (URL de la Gaceta o filas) "
                 "para anclar al valor más reciente."),
    }


async def ingest_rows(db, rows: List[Dict[str, Any]], city: str = "CDMX",
                      fuente: str = "carga_manual") -> Dict[str, Any]:
    """Carga filas {colonia_id, valor_suelo_m2[, valor_construccion_m2]} de la tabla oficial.
    Idempotente. Es la puerta única para cualquier origen (Gaceta, CSV, captura)."""
    n = 0
    for r in rows or []:
        cid = r.get("colonia_id") or r.get("id")
        vs = r.get("valor_suelo_m2") or r.get("valor_unitario_suelo")
        if not cid or not vs:
            continue
        try:
            vs = float(vs)
        except (TypeError, ValueError):
            continue
        if vs <= 0:
            continue
        upd = {"valor_unitario_suelo": round(vs), "valor_unitario_periodo": _PERIODO,
               "valor_unitario_fuente": fuente, "valor_unitario_at": _iso()}
        vc = r.get("valor_construccion_m2")
        if vc:
            try:
                upd["valor_unitario_construccion"] = round(float(vc))
            except (TypeError, ValueError):
                pass
        res = await db.colonias.update_one({"id": cid, "city": city}, {"$set": upd})
        if res.matched_count:
            n += 1
    if n:
        await db.valores_unitarios_meta.update_one(
            {"_id": city},
            {"$set": {"periodo": _PERIODO, "fuente": fuente, "colonias": n, "updated_at": _iso()}},
            upsert=True)
    return {"ok": True, "city": city, "cargadas": n,
            "nota": None if n else "Ninguna fila válida (faltan colonia_id o valor_suelo_m2)."}


async def ingest_from_source(db, url: Optional[str] = None, city: str = "CDMX") -> Dict[str, Any]:
    """Baja la tabla oficial desde la URL (Gaceta/datos abiertos) y la carga. Honesto: si no hay
    URL configurada o no es alcanzable, no inventa — deja el sistema con el SIG 2022."""
    url = url or os.environ.get("IE_VALORES_UNITARIOS_2026_URL")
    if not url:
        return {"ok": False, "reason": "Sin fuente configurada (env IE_VALORES_UNITARIOS_2026_URL). "
                "El conector está listo; al poner la URL de la Gaceta se autollenan las colonias."}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=40, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (DMX)"})
        if r.status_code != 200:
            return {"ok": False, "reason": f"La fuente respondió {r.status_code} — se conserva el SIG 2022."}
        # Parser fino del layout (CSV/JSON) se cierra al ver la tabla real; por ahora intenta JSON.
        try:
            data = r.json()
            rows = data if isinstance(data, list) else data.get("rows") or data.get("items") or []
        except Exception:
            return {"ok": False, "reason": "Tabla obtenida; el parser del formato real se finaliza al "
                    "confirmar el layout de la Gaceta. Mientras, carga filas con ingest_rows."}
        return await ingest_rows(db, rows, city=city, fuente="gaceta_oficial")
    except Exception as e:
        log.warning(f"[valores_unitarios] {e}")
        return {"ok": False, "reason": str(e)}


async def get_valor_unitario(db, colonia_id: str) -> Optional[int]:
    """Valor unitario de suelo OFICIAL 2026 ($/m²) de la colonia, si está cargado. None si no."""
    rec = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "valor_unitario_suelo": 1})
    return (rec or {}).get("valor_unitario_suelo")
