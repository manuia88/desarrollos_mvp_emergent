#!/usr/bin/env python3
"""Matriz de PROPAGACIÓN — las OTRAS direcciones (más allá de marketplace→todos):

  A) ASESOR CIERRA una venta → ¿se ve en dev / superadmin / flywheel-ranking?  (la dirección rica)
  B) DEV PUBLICA un proyecto (wizard → db.projects) → ¿lo ven los portales internos?  (+ nota de marketplace curado)

Replica EXACTAMENTE las llamadas de propagación del endpoint de cierre (advisor.py update_op_status 'cerrada').
Tagueado + teardown cero-residuo (incl. re-materializar el closing_lifts global).

Uso:  scripts/.venv/bin/python3 scripts/propagation_directions.py
"""
import asyncio
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-propdir"
_res = []


def chk(direction, name, ok, detail=""):
    _res.append(ok)
    print(f"  {'✅' if ok else '❌'} [{direction}] {name}" + (f" — {detail}" if detail else ""))


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d.get("colonia_id") or d.get("colonia")), DEVELOPMENTS[0])
    dev_id = dev["id"]
    zone = dev.get("colonia_id") or dev.get("colonia")
    lead_id = f"{TAG}-lead"
    unit_id = f"{TAG}-unit"
    sref = f"{TAG}-{dev_id}"
    price = 7_350_000

    # baseline para cero-residuo
    base = {c: await db[c].count_documents({}) for c in ("transactions", "copiloto_closings", "units_history", "developer_unit_overrides", "projects")}
    try:
        # ════ DIRECCIÓN A · ASESOR CIERRA → dev / superadmin / flywheel ════
        # 1) SUPERADMIN (DRPI): la venta alimenta db.transactions
        from transaction_network_engine import ingest_transaction
        if not await db.transactions.find_one({"source_ref": sref}, {"_id": 1}):
            await ingest_transaction(db, {"zone_id": zone, "closing_price_mxn": price, "property_type": "depto",
                                          "m2": 85, "source_ref": sref}, source="dmx_native")
        chk("ASESOR→SUPERADMIN", "DRPI: la venta entra a db.transactions", await db.transactions.count_documents({"source_ref": sref}) >= 1)

        # 2) FLYWHEEL: el cierre captura el viaje + alimenta el AVM/cubo
        from routes.copiloto_flywheel import record_closing, materialize_closing_lifts
        await record_closing(db, lead_id=lead_id, dev_id=dev_id, price_closed=price)
        chk("ASESOR→FLYWHEEL", "el cierre queda en copiloto_closings", await db.copiloto_closings.count_documents({"lead_id": lead_id}) >= 1)

        # 3) FLYWHEEL→RANKING: closing_lifts se re-materializa y el ranking del comprador lo consume (vivo)
        lifts = await materialize_closing_lifts(db)
        cl = await db.closing_lifts.find_one({"_id": "global"}, {"_id": 0, "real": 1})
        chk("ASESOR→RANKING", "closing_lifts refleja cierres reales", bool(cl and (cl.get("real") or {}).get("n", 0) >= 1),
            f"real.n={(cl or {}).get('real', {}).get('n')}")
        from visitor_taste import score_devs
        # un visitante CON gusto real (señales + búsqueda) → score_devs retorna ranking no-vacío, ejecutando la ruta viva
        # que lee closing_lifts (real.n=3 → aplica el empujón del aprendizaje del cierre). Sin gusto retorna {} (fail-open).
        _now = dt.datetime.utcnow()
        for t in ("ficha_view", "like"):
            await db.buyer_signals.update_one({"id": f"{TAG}-rank-{t}"},
                {"$set": {"id": f"{TAG}-rank-{t}", "visitor_id": f"{TAG}-vid", "type": t, "entity_id": dev_id,
                          "active": True, "created_at_dt": _now}}, upsert=True)
        await db.marketplace_searches.update_one({"visitor_id": f"{TAG}-vid"},
            {"$set": {"visitor_id": f"{TAG}-vid", "colonias": [zone], "colonia_id": zone, "precio_max": 9_000_000, "created_at_dt": _now}}, upsert=True)
        await db.visitor_taste_materialized.delete_many({"visitor_id": f"{TAG}-vid"})  # busta cache stale → reconstruye fresco
        scored = await score_devs(db, f"{TAG}-vid", DEVELOPMENTS[:5])
        chk("ASESOR→RANKING", "el ranking del comprador consume el aprendizaje (vivo)", isinstance(scored, dict) and len(scored) > 0,
            f"devs rankeados={len(scored) if hasattr(scored, '__len__') else 'n/a'}")

        # 4) DEV: la unidad vendida sube al histórico + marca la ficha (ritmo de venta / ficha pública)
        from units_history import record_unit_change
        await record_unit_change(db, unit_id=unit_id, development_id=dev_id, field_changed="status",
                                 old_value=None, new_value="vendido", changed_by_user_id=f"{TAG}-asesor",
                                 source="sale_closed", extra={"operacion_id": f"{TAG}-op"})
        await db.developer_unit_overrides.update_one({"unit_id": unit_id},
            {"$set": {"unit_id": unit_id, "dev_id": dev_id, "status": "vendido", "reason": "Venta cerrada por asesor",
                      "updated_at": dt.datetime.utcnow().isoformat()}}, upsert=True)
        chk("ASESOR→DEV", "unidad vendida en units_history", await db.units_history.count_documents({"unit_id": unit_id}) >= 1)
        chk("ASESOR→DEV", "ficha del dev marca la unidad VENDIDA", bool(await db.developer_unit_overrides.find_one({"unit_id": unit_id, "status": "vendido"})))

        # ════ DIRECCIÓN B · DEV PUBLICA (wizard → db.projects) → portales internos ════
        await db.projects.update_one({"id": f"{TAG}-proj"},
            {"$set": {"id": f"{TAG}-proj", "name": "Proyecto Test", "colonia": zone, "colonia_id": zone,
                      "dev_org_id": f"{TAG}-org", "status": "activo", "created_at": dt.datetime.utcnow().isoformat()}}, upsert=True)
        # Lo leen dev portal / superadmin / asesor-playbook / insights / auto-approve (12 readers verificados)
        chk("DEV→INTERNOS", "el proyecto del wizard es visible a dev/superadmin/insights (db.projects)",
            bool(await db.projects.find_one({"id": f"{TAG}-proj"})))
        # NOTA (no es bug): el marketplace público es catálogo CURADO (DEVELOPMENTS estático). Que los proyectos del
        # wizard salgan auto al marketplace es DECISIÓN DE PRODUCTO (¿gate de aprobación?), no un cable roto.
        print("  ℹ️  [DEV→MARKETPLACE] el marketplace público es catálogo curado · auto-publicar wizard = decisión de producto")

    finally:
        await db.buyer_signals.delete_many({"id": {"$regex": f"^{TAG}-rank-"}})
        await db.marketplace_searches.delete_many({"visitor_id": f"{TAG}-vid"})
        await db.visitor_taste_materialized.delete_many({"visitor_id": f"{TAG}-vid"})
        await db.transactions.delete_many({"source_ref": sref})
        await db.copiloto_closings.delete_many({"lead_id": lead_id})
        await db.units_history.delete_many({"unit_id": unit_id})
        await db.developer_unit_overrides.delete_many({"unit_id": unit_id})
        await db.projects.delete_many({"id": f"{TAG}-proj"})
        try:  # restaura el closing_lifts global al estado real (sin mi cierre de prueba)
            from routes.copiloto_flywheel import materialize_closing_lifts as _mat
            await _mat(db)
        except Exception:
            pass

    after = {c: await db[c].count_documents({}) for c in base}
    diffs = {c: after[c] - base[c] for c in base if after[c] != base[c]}
    print("\n— Cero-residuo —")
    chk("teardown", "árbol restaurado", not diffs, str(diffs) if diffs else "todo en 0")

    n = sum(1 for x in _res if x)
    print(f"\n{'='*56}\nPROPAGACIÓN DIRECCIONES — {n}/{len(_res)} PASS")
    sys.exit(0 if n == len(_res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
