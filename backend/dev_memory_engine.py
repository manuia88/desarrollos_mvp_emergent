"""MEMORIA / CONTEXTO PERSISTENTE DEL DEV (lente Personal del plan Atlax).

El portal del dev no tenía memoria que lo "siguiera": las recomendaciones rechazadas guardaban un motivo pero
no re-alimentaban nada. Aquí se registra cada DECISIÓN del dev (qué aplicó/rechazó y por qué) + sus zonas de foco,
y se deriva un CONTEXTO que personaliza (su tesis, su tasa de aplicación, sus motivos de rechazo).
No depende del Cerebro (apagado por flag): memoria propia, liviana, siempre viva.
"""
import datetime as dt
from typing import Any, Dict, Optional


async def record_decision(db, *, user_id: Optional[str], org_id: Optional[str],
                          kind: str, ref_id: Optional[str] = None, meta: Optional[Dict] = None) -> None:
    """Graba una decisión del dev. kind: 'rec_applied' | 'rec_rejected' | 'action_taken' | 'zone_focus'. FAIL-SOFT."""
    try:
        await db.dev_memory.insert_one({
            "user_id": user_id, "org_id": org_id, "kind": kind, "ref_id": ref_id,
            "meta": meta or {}, "created_at": dt.datetime.utcnow(),
        })
    except Exception:
        pass


async def get_dev_context(db, *, user_id: Optional[str], org_id: Optional[str], dev_ids) -> Dict[str, Any]:
    """El contexto persistente del dev: zonas de foco + historial de decisiones + motivos + tesis inferida."""
    # Zonas de foco = colonias de sus desarrollos.
    zonas = []
    if dev_ids:
        async for d in db.developments.find({"id": {"$in": list(dev_ids)}}, {"colonia": 1}):
            if d.get("colonia"):
                zonas.append(d["colonia"])
    zonas = sorted(set(zonas))

    q: Dict[str, Any] = {}
    if user_id:
        q["user_id"] = user_id
    elif org_id:
        q["org_id"] = org_id
    aplicadas = await db.dev_memory.count_documents({**q, "kind": "rec_applied"})
    rechazadas = await db.dev_memory.count_documents({**q, "kind": "rec_rejected"})

    motivos: Dict[str, int] = {}
    async for r in db.dev_memory.find({**q, "kind": "rec_rejected"}, {"meta": 1}):
        m = (r.get("meta") or {}).get("reason")
        if m:
            motivos[m] = motivos.get(m, 0) + 1
    motivos_top = sorted(motivos.items(), key=lambda x: -x[1])[:3]

    total = aplicadas + rechazadas
    tasa = round(100 * aplicadas / total) if total else None

    tesis = None
    partes = []
    if zonas:
        partes.append(f"te enfocas en {', '.join(z.replace('-', ' ') for z in zonas[:3])}")
    if tasa is not None:
        partes.append(f"aplicas el {tasa}% de lo que el sistema te sugiere")
    if motivos_top:
        partes.append(f"sueles rechazar por {motivos_top[0][0]}")
    if partes:
        tesis = (" · ".join(partes))
        tesis = tesis[0].upper() + tesis[1:]

    # Decisiones recientes (timeline corto)
    recientes = []
    async for r in db.dev_memory.find(q, {"_id": 0, "kind": 1, "ref_id": 1, "meta": 1, "created_at": 1}).sort("created_at", -1).limit(8):
        recientes.append({
            "kind": r.get("kind"),
            "ref_id": r.get("ref_id"),
            "reason": (r.get("meta") or {}).get("reason"),
            "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), dt.datetime) else r.get("created_at"),
        })

    return {
        "zonas_foco": zonas,
        "decisiones": {"aplicadas": aplicadas, "rechazadas": rechazadas, "tasa_aplicacion_pct": tasa},
        "motivos_rechazo": [{"motivo": k, "n": v} for k, v in motivos_top],
        "tesis": tesis,
        "recientes": recientes,
    }


async def ensure_indexes(db) -> None:
    try:
        await db.dev_memory.create_index([("user_id", 1), ("kind", 1), ("created_at", -1)])
        await db.dev_memory.create_index([("org_id", 1), ("kind", 1)])
    except Exception:
        pass
