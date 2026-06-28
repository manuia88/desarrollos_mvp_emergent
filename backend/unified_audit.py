"""LECTOR UNIFICADO DE AUDITORÍA — el superadmin ve TODA la actividad de los 3 portales en un solo timeline.

La actividad estaba fragmentada en trails por-portal (audit_log, developer_audit, lead_events, price_events,
engagement_events), cada uno con su esquema → la auditoría del superadmin solo leía audit_log y se perdía el resto.
Este módulo normaliza todos los trails a una forma común y los mezcla por tiempo. Cada entrada lleva su `source` para
que el superadmin filtre. NO migra ni duplica datos: lee los trails canónicos en su lugar (read-layer).

audit_immutable (copia Merkle anti-manipulación) queda fuera a propósito — tiene su propia página (Audit Chain).
"""
from typing import Any, Dict, List, Optional


def _ts(v) -> str:
    return str(v).replace(" ", "T") if v else ""


def _summ(payload) -> str:
    if isinstance(payload, dict):
        return " · ".join(f"{k}={str(v)[:30]}" for k, v in list(payload.items())[:3])
    return str(payload)[:80] if payload else ""


def _row(ts, uid, role, by_ai, action, etype, eid, source, summary):
    # actor ANIDADO → forma compatible con la página de auditoría existente (lee e.actor.user_id).
    return {"ts": ts, "actor": {"user_id": uid, "role": role, "by_ai": by_ai}, "action": action,
            "entity_type": etype, "entity_id": eid, "source": source, "summary": summary}


def _norm_audit_log(d):
    a = d.get("actor") or {}
    return _row(_ts(d.get("ts") or d.get("timestamp")), a.get("user_id") or d.get("resource") or "system",
                a.get("role") or "system", bool(a.get("by_ai")), d.get("action"),
                d.get("entity_type") or d.get("resource"), d.get("entity_id"), "audit_log",
                _summ(d.get("after") or d.get("payload")))


def _norm_developer_audit(d):
    return _row(_ts(d.get("ts")), d.get("user_id"), "developer", False, d.get("action"), "unit",
                d.get("unit_id"), "developer_audit", f"desarrollo {d.get('dev_id')}")


def _norm_lead_events(d):
    return _row(_ts(d.get("ts") or d.get("created_at")), d.get("owner_id"), "advisor", d.get("source") == "system",
                d.get("kind"), "lead", d.get("ref_id") or d.get("contacto_id"), "lead_events",
                d.get("title") or str(d.get("body") or "")[:60])


def _norm_price_events(d):
    return _row(_ts(d.get("changed_at")), d.get("changed_by"), "developer", False, "price_change", "unit",
                d.get("unit_id"), "price_events",
                f"${d.get('old_price')} → ${d.get('new_price')} ({d.get('delta_pct')}%) {d.get('label') or ''}".strip())


def _norm_engagement(d):
    return _row(_ts(d.get("created_at")), None, d.get("actor_type") or "cliente", False, "engagement", "project",
                d.get("project_id"), "engagement_events", f"unidad {d.get('unit_id')}")


# (colección, campo-ts, normalizador, portal)
SOURCES = [
    ("audit_log", "ts", _norm_audit_log, "todos"),
    ("developer_audit", "ts", _norm_developer_audit, "dev"),
    ("lead_events", "ts", _norm_lead_events, "asesor"),
    ("price_events", "changed_at", _norm_price_events, "dev"),
    ("engagement_events", "created_at", _norm_engagement, "marketplace"),
]
SOURCE_NAMES = [s[0] for s in SOURCES]


async def unified_entries(db, source: Optional[str] = None, entity_type: Optional[str] = None,
                          actor_user_id: Optional[str] = None, by_ai: Optional[bool] = None,
                          limit: int = 50, skip: int = 0) -> Dict[str, Any]:
    """Timeline unificado de los trails de acción de los 3 portales. Over-fetch por fuente + merge-sort por ts."""
    over = limit + skip + 100
    rows: List[Dict[str, Any]] = []
    counts: Dict[str, int] = {}
    for coll, tsf, norm, _portal in SOURCES:
        if source and source != coll:
            continue
        try:
            counts[coll] = await db[coll].count_documents({})
            async for d in db[coll].find({}, {"_id": 0}).sort(tsf, -1).limit(over):
                n = norm(d)
                if entity_type and n["entity_type"] != entity_type:
                    continue
                if actor_user_id and (n["actor"] or {}).get("user_id") != actor_user_id:
                    continue
                if by_ai is not None and bool((n["actor"] or {}).get("by_ai")) != by_ai:
                    continue
                rows.append(n)
        except Exception:
            continue
    rows.sort(key=lambda r: r["ts"] or "", reverse=True)
    return {"sources": counts, "total_trails": len(counts), "shown": len(rows[skip:skip + limit]),
            "entries": rows[skip:skip + limit]}
