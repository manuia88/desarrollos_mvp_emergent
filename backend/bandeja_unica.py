"""LA BANDEJA ÚNICA — todo lo accionable del día, en UNA lista ordenada por valor.

Antes: 4 colas regadas (vigía, revisión de ingesta, pedidos a devs, hallazgos del auditor)
+ los leads calientes. El founder operaba de memoria. Ahora: una sola bandeja, cada item
con su tipo, su porqué, su link directo y su prioridad — inbox cero.

Prioridad (transparente): errores del auditor (100) > lotes por aprobar (90) > cambios de
lista del vigía (80) > leads calientes (70) > pedidos a devs (60) > alertas (50).
Puro/testeable en priorizar(); Mongo solo en bandeja(). $0.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def temperatura_lead(lead: Dict[str, Any], gangas_dev: int = 0) -> int:
    """Temperatura v1 (transparente): presupuesto declarado (40) + interacciones (30)
    + su dev tiene gangas activas (30)."""
    t = 0
    if lead.get("budget_mxn"):
        t += 40
    t += min(30, (lead.get("interactions") or 0) * 10)
    if gangas_dev:
        t += 30
    return t


def priorizar(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(items, key=lambda i: -i.get("prioridad", 0))


async def bandeja(db) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []

    # 1 · errores del auditor (dato roto = primero)
    from auditor_catalogo import ultima_auditoria
    au = await ultima_auditoria(db, severidad="error")
    for h in (au.get("hallazgos") or [])[:5]:
        items.append({"tipo": "dato_roto", "prioridad": 100, "icono": "🩺",
                      "titulo": f"{h.get('ref')}: {h.get('detalle', '')[:90]}",
                      "link": f"/superadmin/expediente/{h.get('development_id')}"
                      if h.get("development_id") else "/superadmin/inventario"})

    # 2 · lotes de ingesta esperando tu clic
    n_rev = await db.bulk_ingest_items.count_documents({"decision": "pending_review"})
    if n_rev:
        items.append({"tipo": "revision", "prioridad": 90, "icono": "🚦",
                      "titulo": f"{n_rev} lote(s) extraídos esperando tu aprobación "
                                f"(llegan pre-auditados)",
                      "link": "/superadmin/alta?tab=masiva&cola=1"})

    # 3 · el vigía detectó cambios
    async for p in db.vigia_pendientes.find({"estado": "pendiente"}, {"_id": 0}).limit(5):
        items.append({"tipo": "vigia", "prioridad": 80, "icono": "👁",
                      "titulo": f"{p.get('tipo', '').replace('_', ' ')}: "
                                f"{p.get('dev')}{' · ' + p['proyecto'] if p.get('proyecto') else ''}",
                      "link": "/superadmin/alta?tab=vigia"})

    # 4 · leads calientes (temperatura v1)
    from ficha_atomo import gangas_catalogo
    gangas = await gangas_catalogo(db, limite=50)
    gangas_por_dev: Dict[str, int] = {}
    for g in gangas:
        gangas_por_dev[g["development_id"]] = gangas_por_dev.get(g["development_id"], 0) + 1
    mostrados = 0
    async for ld in db.leads.find({"activo": {"$ne": False}, "_demo_home": {"$ne": True}},
                                  {"_id": 0}).limit(50):
        if mostrados >= 3:
            break
        t = temperatura_lead(ld, gangas_por_dev.get(ld.get("development_id")
                                                    or ld.get("project_id") or "", 0))
        if t >= 70:
            mostrados += 1
            items.append({"tipo": "lead", "prioridad": 70, "icono": "🔥",
                          "titulo": f"Lead caliente ({t}°): {ld.get('name') or 'sin nombre'}"
                                    + (f" · presupuesto ${ld['budget_mxn']:,.0f}"
                                       if ld.get("budget_mxn") else ""),
                          "link": "/superadmin/leads"})

    # 5 · pedidos a devs con puntos abiertos
    async for d in db.developments.find({"readiness_pct": {"$lt": 80}},
                                        {"_id": 0, "id": 1, "name": 1,
                                         "readiness_pct": 1}).limit(10):
        items.append({"tipo": "pedido", "prioridad": 60, "icono": "📋",
                      "titulo": f"{d.get('name')}: ficha al {d.get('readiness_pct')}% — "
                                f"copiar pedido y mandarlo al dev",
                      "link": f"/superadmin/expediente/{d['id']}"})

    # 6 · alertas del auditor (después de lo urgente)
    au2 = await ultima_auditoria(db, severidad="alerta")
    n_alertas = len(au2.get("hallazgos") or [])
    if n_alertas:
        items.append({"tipo": "alertas", "prioridad": 50, "icono": "⚠️",
                      "titulo": f"{n_alertas} alertas de datos (m² sin desglosar, "
                                f"planos faltantes…)",
                      "link": "/superadmin/inventario"})

    orden = priorizar(items)
    return {"items": orden, "n": len(orden),
            "al_dia": not orden}
