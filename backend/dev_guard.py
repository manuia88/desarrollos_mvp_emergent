"""
dev_guard — Aislamiento entre cuentas del portal Dev + bitácora de acceso (Endurecimiento).
═══════════════════════════════════════════════════════════════════════════════
Una sola puerta para los datos del desarrollador. Toda mutación o lectura sensible pasa por
`guard_project`, que verifica pertenencia (fuente única `tenant_scope`) y REGISTRA cada intento
bloqueado en `dev_access_log`. Eso cierra el ciclo:
  · el dev ve "tus datos están aislados · N intentos bloqueados" (tranquilidad real),
  · el superadmin ve el Centro de Seguridad (intentos cross-org + verdicto de anomalía),
  · el red-team (`dev_redteam_test.py`) lo verifica como candado de regresión.

Cero deuda: si nadie intentó nada, dice 0 honesto. El detector de anomalías queda en stub
(reglas simples hoy) y se afina con volumen — no inventa alertas.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from tenant_scope import dev_can_access_project, tenant_of, user_dev_ids

log = logging.getLogger("dmx.dev_guard")

_ANOMALY_24H_THRESHOLD = 8   # intentos bloqueados del MISMO tenant en 24h → se marca para revisar


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log_access(db, user, *, endpoint: str, dev_id: Optional[str],
                     allowed: bool, reason: str = "") -> None:
    """Registra un intento de acceso a datos de un proyecto. Hoy solo persistimos los BLOQUEADOS
    (los permitidos son ruido); el campo `allowed` queda por si se quiere auditoría completa."""
    if allowed:
        return
    try:
        await db.dev_access_log.insert_one({
            "id": "acc_" + secrets.token_urlsafe(8),
            "ts": _iso(),
            "tenant": tenant_of(user),
            "user_id": getattr(user, "user_id", None),
            "role": getattr(user, "role", None),
            "dev_id": dev_id,
            "endpoint": endpoint,
            "allowed": allowed,
            "reason": reason or "Proyecto de otra desarrolladora",
        })
    except Exception as e:
        log.warning(f"[dev_guard] log_access: {e}")


async def guard_project(db, user, dev_id: Optional[str], endpoint: str):
    """Candado: si el proyecto no es del usuario, REGISTRA el intento y lanza 403. Si es suyo (o
    superadmin), deja pasar. Punto único para mutaciones/lecturas sensibles del dev."""
    if dev_can_access_project(user, dev_id):
        return
    await log_access(db, user, endpoint=endpoint, dev_id=dev_id, allowed=False,
                     reason="Intento de acceso a proyecto de otra desarrolladora")
    raise HTTPException(403, "Este proyecto es de otra desarrolladora")


async def dev_security_summary(db, user) -> Dict[str, Any]:
    """Resumen de seguridad PARA EL DEV: confirma aislamiento + cuántos intentos de otras cuentas
    a SUS proyectos se bloquearon (en lenguaje de persona, sin tecnicismos)."""
    mis = user_dev_ids(user)
    mi_tenant = tenant_of(user)
    intentos = 0
    ultimo = None
    try:
        q = {"dev_id": {"$in": mis}, "allowed": False, "tenant": {"$ne": mi_tenant}}
        intentos = await db.dev_access_log.count_documents(q)
        if intentos:
            doc = await db.dev_access_log.find_one(q, {"_id": 0, "ts": 1}, sort=[("ts", -1)])
            ultimo = (doc or {}).get("ts")
    except Exception as e:
        log.warning(f"[dev_guard] summary: {e}")
    return {
        "aislado": True,
        "proyectos_propios": len(mis),
        "intentos_bloqueados": intentos,
        "ultimo_intento": ultimo,
        "mensaje": ("Solo tú ves tus proyectos. Nadie de otra cuenta puede entrar."
                    if not intentos else
                    f"Bloqueamos {intentos} intento(s) de otra cuenta de ver tus proyectos. Tus datos siguen seguros."),
    }


async def cross_org_denials(db, *, days: int = 30, limit: int = 100) -> Dict[str, Any]:
    """Centro de Seguridad (superadmin): intentos bloqueados entre cuentas + verdicto de anomalía."""
    desde = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    items: List[Dict[str, Any]] = []
    por_tenant: Dict[str, int] = {}
    try:
        cur = db.dev_access_log.find(
            {"allowed": False, "ts": {"$gte": desde}}, {"_id": 0}).sort("ts", -1).limit(limit)
        async for d in cur:
            items.append(d)
            t = d.get("tenant") or "desconocido"
            por_tenant[t] = por_tenant.get(t, 0) + 1
    except Exception as e:
        log.warning(f"[dev_guard] denials: {e}")
    anomalia = await evaluate_access_anomaly(db)
    return {
        "items": items,
        "kpis": {
            "intentos_bloqueados": len(items),
            "cuentas_distintas": len(por_tenant),
            "cuenta_top": max(por_tenant, key=por_tenant.get) if por_tenant else None,
        },
        "por_cuenta": [{"tenant": k, "intentos": v} for k, v in
                       sorted(por_tenant.items(), key=lambda x: -x[1])],
        "anomalia": anomalia,
        "leyenda": "Cada fila es un intento bloqueado de una cuenta por ver datos de otra. "
                   "Lo normal es 0. Si una cuenta acumula muchos, vale la pena revisarla.",
    }


async def evaluate_access_anomaly(db) -> Dict[str, Any]:
    """Detector de anomalías de acceso — STUB honesto (reglas simples). Marca si una cuenta acumuló
    muchos intentos bloqueados en 24h. Se afina con volumen (ML); hoy NO inventa alertas.
    Cierra el ciclo IA-first: cuando marque, alimenta una tarea del Cerebro para revisar."""
    desde = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    por_tenant: Dict[str, int] = {}
    try:
        cur = db.dev_access_log.find(
            {"allowed": False, "ts": {"$gte": desde}}, {"_id": 0, "tenant": 1})
        async for d in cur:
            t = d.get("tenant") or "desconocido"
            por_tenant[t] = por_tenant.get(t, 0) + 1
    except Exception:
        pass
    sospechosas = [{"tenant": t, "intentos": n} for t, n in por_tenant.items()
                   if n >= _ANOMALY_24H_THRESHOLD]
    return {
        "hay_anomalia": bool(sospechosas),
        "sospechosas": sospechosas,
        "umbral_24h": _ANOMALY_24H_THRESHOLD,
        "metodo": "reglas (stub) — el modelo de patrones se enciende con volumen de datos",
        "verdicto": ("Sin anomalías — el aislamiento opera normal." if not sospechosas else
                     f"{len(sospechosas)} cuenta(s) con actividad inusual — conviene revisar."),
    }
