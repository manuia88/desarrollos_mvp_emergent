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


# Tiers que pertenecen a UN tenant (la fila es dato del dev dueño); el resto son de MERCADO
# (colonia/alcaldia/zona/cdmx) = compartidas, las ve cualquiera. P7 (auditoría 07-20).
ENTITY_TIERS = frozenset({"unit", "development", "prototype"})


class MarketSnapshot(BaseModel):
    tier: str                              # unit/development/prototype/colonia/alcaldia/zona/cdmx
    tier_id: str
    measure: str                           # clave de CUBE_MEASURES
    value: Optional[float] = None
    dims: Optional[Dict[str, Any]] = None  # celda del cubo: {tipologia, banda_precio, amenidad...}
    period: str                            # 'YYYY-MM' o 'YYYY-MM-DD'
    source: Optional[str] = None           # crm / avm / live_pulse / manual / ...
    owner_org: Optional[str] = None        # P7: dueño (org/tenant) en tiers de ENTIDAD; None = mercado (compartido)
    computed_at: Optional[str] = None


def scope_filter_for(user_orgs: Optional[List[str]]) -> Dict[str, Any]:
    """P7: filtro para un lector dev-facing de snapshots. Deja pasar SIEMPRE las filas de mercado
    (owner_org None/ausente) y, de las de entidad, solo las del/los org(s) del usuario. superadmin
    pasa user_orgs=None → {} (god-view). Hoy el único lector es superadmin; esto deja el candado listo
    para cuando un dashboard del dev lea development/unit-tier directo."""
    if user_orgs is None:
        return {}
    return {"$or": [{"owner_org": None}, {"owner_org": {"$exists": False}},
                    {"owner_org": {"$in": list(user_orgs)}}]}


def _dims_hash(dims: Optional[Dict[str, Any]]) -> str:
    """Firma estable de la celda (dims) — idempotencia por (tier,tier_id,measure,period,dims)."""
    import hashlib
    import json
    return hashlib.sha1(json.dumps(dims or {}, sort_keys=True, default=str).encode()).hexdigest()[:16]


async def ensure_indexes(db) -> None:
    col = db[SNAP]
    # Palanca 5 (auditoría 07-20): antes append-only sin idempotencia → 78-86% de filas
    # redundantes. Índice ÚNICO por celda calendario; el upsert colapsa a la última corrida.
    await col.create_index([("tier", 1), ("tier_id", 1), ("measure", 1), ("period", 1), ("dims_hash", 1)],
                           unique=True, name="snap_celda_uniq")
    await col.create_index([("computed_at", -1)])


async def write_snapshot(db, *, tier: str, tier_id: str, measure: str, value: Optional[float],
                         period: str, dims: Optional[Dict[str, Any]] = None,
                         source: Optional[str] = None) -> str:
    """Upsert idempotente de UNA medida por celda (Palanca 5: antes append-only duplicaba)."""
    doc = _dump(MarketSnapshot(tier=tier, tier_id=tier_id, measure=measure, value=value,
                               dims=dims, period=period, source=source, computed_at=_iso()))
    doc["dims_hash"] = _dims_hash(dims)
    await db[SNAP].update_one(
        {"tier": tier, "tier_id": tier_id, "measure": measure, "period": period,
         "dims_hash": doc["dims_hash"]}, {"$set": doc}, upsert=True)
    return doc["dims_hash"]


async def write_many(db, rows: List[Dict[str, Any]]) -> int:
    """Upsert idempotente de muchas medidas (Palanca 5: antes insert_many duplicaba cada corrida)."""
    if not rows:
        return 0
    from pymongo import UpdateOne
    now = _iso()
    ops = []
    for r in rows:
        doc = _dump(MarketSnapshot(computed_at=now, **r))
        doc["dims_hash"] = _dims_hash(r.get("dims"))
        ops.append(UpdateOne(
            {"tier": doc["tier"], "tier_id": doc["tier_id"], "measure": doc["measure"],
             "period": doc["period"], "dims_hash": doc["dims_hash"]}, {"$set": doc}, upsert=True))
    res = await db[SNAP].bulk_write(ops, ordered=False)
    return (res.upserted_count or 0) + (res.modified_count or 0)


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
    # Palanca 5 (auditoría 07-20): antes dedup por 'period' SOLO → colapsaba el TOTAL de la colonia
    # con los drills por recámaras (dims distintos). Dedup por (period, dims) para no mezclar celdas.
    latest: Dict[tuple, dict] = {}
    for r in rows:
        latest[(r.get("period"), r.get("dims_hash") or _dims_hash(r.get("dims")))] = r
    series = sorted(latest.values(), key=lambda x: x.get("period") or "")
    return series[-limit:]


async def latest(db, *, tier: str, tier_id: str, measure: str,
                 dims: Optional[Dict[str, Any]] = None) -> Optional[dict]:
    q: Dict[str, Any] = {"tier": tier, "tier_id": tier_id, "measure": measure}
    if dims is not None:
        # Palanca 5/7: match por SUBCAMPOS (alineado con read_timeseries). Antes q["dims"]=dims exigía
        # igualdad EXACTA de documento → dims={gran:day} no encontraba la fila {gran:day, recamaras:2}.
        for k, v in dims.items():
            q[f"dims.{k}"] = v
    return await db[SNAP].find_one(q, {"_id": 0}, sort=[("period", -1), ("computed_at", -1)])
