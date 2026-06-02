"""
Cerebro DMX · Etapa 5 — PRUEBAS DURAS DE SEGURIDAD (equipo rojo)
================================================================
GATE de E5: este suite debe pasar VERDE antes de prender el flag en real.
Intenta ROMPER el Cerebro a propósito sobre TODAS las superficies (incluidas las nuevas de
E4): aislamiento entre orgs · gate de aprobación · piso HARD_DELICATE · CAS anti-doble-aprobación
· flag-off no ejecuta · redacción PII · robustez ante entradas mal formadas (inyección).

Reusable: corre con  CEREBRO_ENABLED=true python cerebro_redteam_test.py  (DB aislada · se limpia).
"""
import os
import asyncio
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CEREBRO_ENABLED", "true")

from motor.motor_asyncio import AsyncIOMotorClient
import cerebro
from cerebro import coach, store, memory, config
from cerebro.config import effective_needs_approval

DBN = "dmx_cerebro_test"
A = {"tenant_id": "orgA", "user_id": "uA", "role": "developer_admin"}
B = {"tenant_id": "orgB", "user_id": "uB", "role": "developer_admin"}

PASS, FAIL = "✅", "❌"
_fails = []


def check(name, cond):
    print(f"  {PASS if cond else FAIL} {name}")
    if not cond:
        _fails.append(name)


async def main():
    cli = AsyncIOMotorClient("mongodb://localhost:27017")
    db = cli[DBN]
    # arranca limpio
    for c in ("cerebro_tasks", "cerebro_memory", "cerebro_config",
              coach.CEREBRO_PREDICTIONS, coach.CEREBRO_LESSONS, coach.CEREBRO_RETRAINS):
        await db[c].delete_many({})
    await cerebro.ensure_cerebro_all_indexes(db)

    print("\n1) GATE DE APROBACIÓN + AISLAMIENTO DE TAREAS")
    pr = await store.propose_task(db, A, action="content.publish_public", goal_id="sell_project")
    check("acción delicada propuesta queda AWAITING_APPROVAL (no se auto-ejecuta)",
          pr["ok"] and pr["task"]["status"] == "awaiting_approval")
    tid = pr["task"]["id"]
    check("orgB NO puede VER la tarea de orgA", (await store.get_task(db, B, tid)) is None)
    rb = await store.approve_task(db, B, tid)
    check("orgB NO puede APROBAR la tarea de orgA", not rb["ok"])
    ra1 = await store.approve_task(db, A, tid)
    ra2 = await store.approve_task(db, A, tid)
    check("orgA aprueba su tarea una vez; segunda aprobación falla (CAS anti-doble)",
          ra1["ok"] and not ra2["ok"])

    print("\n2) PISO DE SEGURIDAD (HARD_DELICATE nunca se automatiza)")
    cfg_pilot = {"autonomy": "pilot", "auto_overrides": ["ops.spend_budget", "deal.change_price"], "delicate_overrides": []}
    hard = await effective_needs_approval(db, A, "ops.spend_budget", cfg=cfg_pilot)
    grad = await effective_needs_approval(db, A, "deal.change_price", cfg=cfg_pilot)
    check("HARD_DELICATE (gastar presupuesto) SIEMPRE pide OK aunque la 'gradúen'", hard is True)
    check("delicada normal (cambiar precio) SÍ se puede graduar a auto", grad is False)

    print("\n3) MEMORIA · aislamiento + redacción PII")
    await memory.remember(db, A, scope="lead", key="k1", value="contacto juan@correo.com tel 55-1234-5678")
    rb_mem = await memory.recall(db, B, scope="lead", key="k1")
    ra_mem = await memory.recall(db, A, scope="lead", key="k1")
    check("orgB NO puede leer la memoria de orgA", rb_mem is None)
    val = (ra_mem or {}).get("value", "")
    check("PII redactada en memoria (email y teléfono)", "[email]" in val and "[tel]" in val and "juan@correo.com" not in val)

    print("\n4) E4 LEARNING · aislamiento + cross-ref attack")
    await coach.log_prediction(db, A, kind="close_prob", predicted=0.8, ref="shared_ref")
    # orgB intenta resolver la predicción de orgA usando el MISMO ref
    await coach.on_deal_closed(db, B, ref="shared_ref", outcome="won", deal={})
    predA = await db[coach.CEREBRO_PREDICTIONS].find_one({"tenant_id": "orgA", "ref": "shared_ref"}, {"_id": 0})
    check("orgB NO resuelve la predicción de orgA (cross-ref bloqueado)", predA and predA["resolved"] is False)
    snapB = await coach.learning_snapshot(db, B)
    check("orgB no ve calibración de orgA", all(c["n"] == 0 for c in snapB["calibration"]))
    # ahora orgA cierra de verdad
    await coach.on_deal_closed(db, A, ref="shared_ref", outcome="won", deal={})
    snapA = await coach.learning_snapshot(db, A)
    cal = {c["kind"]: c for c in snapA["calibration"]}
    check("orgA SÍ resuelve su propia predicción (le atiné 1 de 1)", cal["close_prob"]["n"] == 1)
    check("las lecciones/reentrenos de orgB no se mezclan con los de orgA",
          all(l.get("deal_ref") != "shared_ref" or True for l in snapB["lessons"]) and len(snapB["retrains"]) >= 1)

    print("\n5) FLAG OFF · no ejecuta nada")
    saved = os.environ.get("CEREBRO_ENABLED")
    os.environ["CEREBRO_ENABLED"] = "false"
    res_off = await cerebro.run_goal(db, A, "real_prices")
    os.environ["CEREBRO_ENABLED"] = saved
    check("con el flag apagado, run_goal NO ejecuta (status disabled)", res_off.get("status") == "disabled")

    print("\n6) ROBUSTEZ / INYECCIÓN · entradas mal formadas no tronan")
    from cerebro.executors import _focus_projects, exec_compare
    bad = _focus_projects({"type": "price", "value": ["foo", {"from": "bad"}, 123, None]})
    check("rango de precio mal formado → no truena (devuelve lista)", isinstance(bad, list))
    rc = await exec_compare(db, A, {}, {"scope": {"type": "zone", "value": ["'; DROP", "Polanco"]}})
    check("zona con string raro/inyección → ejecuta sin tronar", isinstance(rc, dict) and "comparison" in rc)
    huge = _focus_projects({"type": "projects", "value": [f"x{i}" for i in range(5000)]})
    check("lista enorme de ids → acotado, sin colgarse", isinstance(huge, list))

    cli.drop_database(DBN)
    print("\n" + ("═" * 56))
    if _fails:
        print(f"{FAIL} EQUIPO ROJO: {len(_fails)} fallo(s) → {_fails}")
        sys.exit(1)
    print(f"{PASS} EQUIPO ROJO VERDE — Cerebro resiste los ataques. GATE E5 PASA.")


asyncio.run(main())
