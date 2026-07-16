"""EL AUTOPILOTO DEL CATÁLOGO — Nivel 1 agentic: la línea de ensamble se recorre sola.

Orden founder (07-15): el operador que recorre el pipeline (vigía → extracción →
5 capas → juez → publicación) SIN humano, bajo PÓLIZA escrita. $0, sin IA: pura
política sobre los motores existentes. El founder pasa de operar a supervisar
excepciones: la Bandeja Única queda solo con lo que el autopiloto NO pudo.

LA PÓLIZA (visible en UI; cada decisión cita su regla + evidencia):
  A1 · aprobar lote      — SOLO si el Portón está limpio (0 errores Y 0 alertas)
  A2 · publicar dev      — SOLO si avance ≥80% + juez con gate ≥98% + 0 errores de auditoría
  A3 · preparar pedido   — hay huecos de fuente → el pedido queda LISTO (enviarlo es humano)
  A4 · escalar           — todo lo demás va a la Bandeja con su porqué escrito

NUNCA-SOLO (denylist dura, patrón de auto_pilot_engine.py del asesor): borrar,
deshacer lotes, editar precios/datos, despublicar, comisiones, enviar mensajes
externos. Aunque una regla futura lo intentara, el runner no tiene esos brazos.

Guardrails: kill switch (env AUTOPILOTO_CATALOGO=off), cap de acciones por corrida,
log append-only de CADA decisión (autopiloto_log) incluidas las escaladas,
fail-open (si algo truena → escala, jamás inventa).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

POLIZA: List[Dict[str, str]] = [
    {"regla": "A1", "accion": "aprobar lote",
     "solo_si": "el Portón está limpio: 0 errores y 0 alertas en la pre-auditoría",
     "si_no": "el lote se queda en la Bandeja con sus hallazgos"},
    {"regla": "A2", "accion": "publicar al marketplace",
     "solo_si": "avance ≥80% + juez con gate ≥98% + 0 errores de auditoría para ese desarrollo",
     "si_no": "queda como borrador; publicar bajo el 80% sigue siendo decisión del founder (con acuse)"},
    {"regla": "A3", "accion": "preparar el pedido al desarrollador",
     "solo_si": "hay huecos de fuente o preguntas del auditor — el texto queda listo para copiar/enviar",
     "si_no": "—"},
    {"regla": "A4", "accion": "escalar al founder",
     "solo_si": "cualquier caso fuera de A1–A3 — con el porqué escrito en el log",
     "si_no": "—"},
]

# lo que este runner NO puede hacer solo, jamás (defensa en profundidad)
NUNCA_SOLO = ("borrar", "deshacer", "editar", "despublicar", "comision", "comisión",
              "precio", "mensaje", "whatsapp", "telegram", "correo")

MAX_ACCIONES_DEFAULT = 20


def encendido() -> bool:
    return os.environ.get("AUTOPILOTO_CATALOGO", "on").lower() not in ("off", "0", "false")


# ─── deciders puros (aquí viven los tests) ────────────────────────────────────
def decidir_lote(pre_auditoria: Dict[str, Any]) -> Dict[str, Any]:
    """A1: el Portón manda. 0 errores Y 0 alertas → aprobar; si no → escalar.
    (Más estricto que el modo-lote manual, que solo exige 0 errores: la autonomía
    se gana con el estándar más alto.)"""
    resumen = (pre_auditoria or {}).get("resumen") or {}
    errores = resumen.get("error") or 0
    alertas = resumen.get("alerta") or 0
    if errores == 0 and alertas == 0:
        return {"accion": "aprobar", "regla": "A1",
                "evidencia": f"Portón limpio: 0 errores, 0 alertas, "
                             f"{resumen.get('aviso') or 0} aviso(s) informativos"}
    return {"accion": "escalar", "regla": "A4",
            "evidencia": f"Portón con {errores} error(es) y {alertas} alerta(s) — "
                         f"lo decide el founder en la Bandeja"}


def decidir_publicacion(avance_pct: Optional[float], juez_gate: bool,
                        errores_auditoria: int) -> Dict[str, Any]:
    """A2: publicar SOLO con los tres gates verdes. Cualquier gate caído → escalar."""
    caidos = []
    if (avance_pct or 0) < 80:
        caidos.append(f"avance {round(avance_pct or 0)}% (<80%)")
    if not juez_gate:
        caidos.append("juez sin gate ≥98%")
    if errores_auditoria > 0:
        caidos.append(f"{errores_auditoria} error(es) de auditoría")
    if not caidos:
        return {"accion": "publicar", "regla": "A2",
                "evidencia": f"avance {round(avance_pct or 0)}% + juez con gate + auditoría sin errores"}
    return {"accion": "escalar", "regla": "A4",
            "evidencia": "gates caídos: " + " · ".join(caidos)}


def _log(accion: str, objetivo: str, regla: str, evidencia: str,
         resultado: str) -> Dict[str, Any]:
    return {"ts": datetime.now(timezone.utc).isoformat(), "accion": accion,
            "objetivo": objetivo, "regla": regla, "evidencia": evidencia,
            "resultado": resultado}


# ─── el runner (Mongo solo aquí) ──────────────────────────────────────────────
async def correr_autopiloto(db, max_acciones: int = MAX_ACCIONES_DEFAULT) -> Dict[str, Any]:
    """Una pasada completa: lotes pendientes (A1) → publicables (A2) → pedidos (A3).
    Cada decisión — incluidas las escaladas — queda en autopiloto_log."""
    if not encendido():
        return {"ok": False, "nota": "autopiloto apagado (AUTOPILOTO_CATALOGO=off)"}
    import bulk_ingest_engine as bie
    from auditor_catalogo import pre_auditar_extraccion, ultima_auditoria
    acciones, registros = 0, []

    # A1 · lotes pendientes en la Bandeja
    async for item in db.bulk_ingest_items.find({"decision": "pending_review"}, {"_id": 0}):
        if acciones >= max_acciones:
            break
        try:
            d = decidir_lote(pre_auditar_extraccion(bie.effective_extracted(item)))
            objetivo = f"lote {item.get('project_name') or item.get('id')}"
            if d["accion"] == "aprobar":
                dev_id = await bie.insert_extracted_project(db, item)
                await db.bulk_ingest_items.update_one(
                    {"id": item["id"]},
                    {"$set": {"decision": "approved", "inserted_dev_id": dev_id,
                              "reviewer_user_id": "autopiloto",
                              "decision_at": datetime.now(timezone.utc).isoformat(),
                              "aprobado_via": "autopiloto_A1"}})
                registros.append(_log("aprobar_lote", objetivo, d["regla"],
                                      d["evidencia"], f"aprobado → dev {dev_id}"))
                acciones += 1
            else:
                registros.append(_log("escalar", objetivo, d["regla"], d["evidencia"],
                                      "queda en la Bandeja"))
        except Exception as e:  # noqa: BLE001 — fail-open: escala, no inventa
            registros.append(_log("escalar", f"lote {item.get('id')}", "A4",
                                  f"falló la evaluación: {str(e)[:120]}", "queda en la Bandeja"))

    # A2 · borradores con posible publicación
    from routes.dev_project_full import project_full, project_readiness
    async for dev in db.developments.find({"published": {"$ne": True}},
                                          {"_id": 0, "id": 1, "name": 1,
                                           "juez_gate": 1}):
        if acciones >= max_acciones:
            break
        try:
            rd = project_readiness(await project_full(db, dev["id"]))
            au = await ultima_auditoria(db, development_id=dev["id"], severidad="error")
            d = decidir_publicacion(rd.get("pct"), bool(dev.get("juez_gate")),
                                    len(au.get("hallazgos") or []))
            if d["accion"] == "publicar":
                await db.developments.update_one(
                    {"id": dev["id"]},
                    {"$set": {"published": True, "marketplace_published": True,
                              "published_at": datetime.now(timezone.utc).isoformat(),
                              "published_via": "autopiloto_A2"}})
                registros.append(_log("publicar", dev.get("name") or dev["id"],
                                      d["regla"], d["evidencia"], "publicado"))
                acciones += 1
            else:
                registros.append(_log("escalar", dev.get("name") or dev["id"],
                                      d["regla"], d["evidencia"], "sigue en borrador"))
        except Exception as e:  # noqa: BLE001
            registros.append(_log("escalar", dev.get("name") or dev["id"], "A4",
                                  f"falló la evaluación: {str(e)[:120]}", "sigue en borrador"))

    # A3 · pedidos listos (no envía: los deja preparados y fechados)
    from lista_pedidos import pedido_desarrollo
    async for dev in db.developments.find({}, {"_id": 0, "id": 1, "name": 1}):
        if acciones >= max_acciones:
            break
        try:
            p = await pedido_desarrollo(db, dev["id"])
            n_puntos = p.get("n_puntos") or 0
            if n_puntos == 0 or not p.get("texto"):
                continue
            prev = await db.pedidos_preparados.find_one({"development_id": dev["id"]},
                                                        {"_id": 0, "texto": 1})
            if prev and prev.get("texto") == p.get("texto"):
                continue                      # sin cambios: no re-preparar
            await db.pedidos_preparados.update_one(
                {"development_id": dev["id"]},
                {"$set": {"development_id": dev["id"], "texto": p["texto"],
                          "puntos": n_puntos, "preparado_via": "autopiloto_A3",
                          "ts": datetime.now(timezone.utc).isoformat()}}, upsert=True)
            registros.append(_log("preparar_pedido", dev.get("name") or dev["id"], "A3",
                                  f"{n_puntos} punto(s) abiertos con el dev",
                                  "pedido listo para enviar"))
            acciones += 1
        except Exception:  # noqa: BLE001 — el pedido es best-effort
            pass

    if registros:
        await db.autopiloto_log.insert_many([dict(r) for r in registros])
    hechas = sum(1 for r in registros if r["accion"] != "escalar")
    return {"ok": True, "acciones": hechas,
            "escaladas": sum(1 for r in registros if r["accion"] == "escalar"),
            "registros": registros}
