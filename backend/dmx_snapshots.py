"""
DMX · SNAPSHOTS TEMPORALES DE MERCADO — "el histórico ES el activo"
═══════════════════════════════════════════════════════════════════════════════
Store APPEND-ONLY: nunca se sobreescribe, siempre se inserta con timestamp. Cada
fila es una medida del cubo (precio_m2_cierre, absorcion_pct, demanda…) para un
nivel (unit/development/prototype/colonia/alcaldia/zona/cdmx) en un periodo, con
dims opcionales (celda del cubo: tipologia, banda_precio…). De aquí salen las
series de tiempo que alimentan: forecasting, momentum, gentrification velocity y
el self-improving loop (cada cierre real recalibra los modelos).

Formato largo (long) = ideal para series de tiempo y para el cubo OLAP. El estado
ACTUAL de cada entidad vive en su colección (dmx_units/zones/...); aquí vive su
EVOLUCIÓN. Founder ruling: snapshots desde el día 1, jamás overwrite.
"""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from pydantic import BaseModel

from dmx_unit_schema import COLLECTIONS

SNAP = COLLECTIONS["snapshots"]   # "dmx_market_snapshots"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _dump(m: BaseModel) -> dict:
    return m.model_dump() if hasattr(m, "model_dump") else m.dict()


class MarketSnapshot(BaseModel):
    tier: str                              # unit/development/prototype/colonia/alcaldia/zona/cdmx
    tier_id: str
    measure: str                           # clave de CUBE_MEASURES
    value: Optional[float] = None
    dims: Optional[Dict[str, Any]] = None  # celda del cubo: {tipologia, banda_precio, amenidad...}
    period: str                            # 'YYYY-MM' o 'YYYY-MM-DD'
    source: Optional[str] = None           # crm / avm / live_pulse / manual / ...
    computed_at: Optional[str] = None


async def ensure_indexes(db) -> None:
    col = db[SNAP]
    await col.create_index([("tier", 1), ("tier_id", 1), ("measure", 1), ("period", 1)])
    await col.create_index([("computed_at", -1)])


async def write_snapshot(db, *, tier: str, tier_id: str, measure: str, value: Optional[float],
                         period: str, dims: Optional[Dict[str, Any]] = None,
                         source: Optional[str] = None) -> str:
    """Inserta UNA medida (append-only · nunca update)."""
    doc = _dump(MarketSnapshot(tier=tier, tier_id=tier_id, measure=measure, value=value,
                               dims=dims, period=period, source=source, computed_at=_iso()))
    res = await db[SNAP].insert_one(doc)
    return str(res.inserted_id)


async def write_many(db, rows: List[Dict[str, Any]]) -> int:
    """Inserta muchas medidas de un jalón (append-only). rows = [{tier,tier_id,measure,value,period,...}]."""
    if not rows:
        return 0
    now = _iso()
    docs = [_dump(MarketSnapshot(computed_at=now, **r)) for r in rows]
    res = await db[SNAP].insert_many(docs)
    return len(res.inserted_ids)


async def read_timeseries(db, *, tier: str, tier_id: str, measure: str,
                          dims: Optional[Dict[str, Any]] = None, limit: int = 120) -> List[dict]:
    """Serie de tiempo (period asc). Dedup a la última computed_at por periodo (append-only puede repetir)."""
    q: Dict[str, Any] = {"tier": tier, "tier_id": tier_id, "measure": measure}
    if dims is not None:
        # match por SUBCAMPOS (F5): dims={gran:day} encuentra la fila-total {gran:day} sin exigir
        # igualdad exacta de documento — y permite drill con dims={gran:day, recamaras:2}.
        for k, v in dims.items():
            q[f"dims.{k}"] = v
    rows: List[dict] = []
    async for r in db[SNAP].find(q, {"_id": 0}):
        rows.append(r)
    rows.sort(key=lambda x: (x.get("period") or "", x.get("computed_at") or ""))
    latest: Dict[str, dict] = {}
    for r in rows:
        latest[r.get("period")] = r          # último computed_at por periodo gana
    series = sorted(latest.values(), key=lambda x: x.get("period") or "")
    return series[-limit:]


async def latest(db, *, tier: str, tier_id: str, measure: str,
                 dims: Optional[Dict[str, Any]] = None) -> Optional[dict]:
    q: Dict[str, Any] = {"tier": tier, "tier_id": tier_id, "measure": measure}
    if dims is not None:
        q["dims"] = dims
    return await db[SNAP].find_one(q, {"_id": 0}, sort=[("period", -1), ("computed_at", -1)])
