"""Tests de regresión — auditoría N3/N4 (los 3 loops de demanda cerrados).

Cubre el código nuevo de la auditoría:
  1. advisor_demand_bridge: materialización ANÓNIMA (cero PII), idempotencia, docs sin id se saltan,
     match llena matched_dev_ids y actualiza el espejo (unmet honesto).
  2. demand_feedback: el cierre marca la demanda satisfecha; los lectores la excluyen.
  3. cube_olap_engine._apply_dev_overrides: el cubo ve el precio/estado editado por el dev; fail-open.
"""
import pytest
import mongomock_motor

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["dmx_test"]


def _busqueda(**kw):
    base = {
        "id": "busq_t1", "owner_id": "as_1", "contacto_id": "c_1", "stage": "pendiente",
        "colonias": ["roma-norte"], "recamaras_min": 2, "banos_min": 1,
        "precio_max": 9_000_000, "notas": "PII secreta", "fuente": "referido",
        "matched_dev_ids": [], "created_at": "2026-07-01T00:00:00+00:00",
    }
    base.update(kw)
    return base


# ─── 1) advisor_demand_bridge ─────────────────────────────────────────────────

async def test_bridge_materializa_sin_pii(db):
    """La fila anónima NO debe cargar owner/contacto/notas/fuente (AUTHZ canónico)."""
    import advisor_demand_bridge as B
    await db.asesor_busquedas.insert_one(_busqueda())
    res = await B.materialize_asesor_busquedas(db)
    assert res["materialized"] == 1
    row = await db.marketplace_searches.find_one({"source": "asesor_anon"}, {"_id": 0})
    assert row is not None
    assert row["colonia_id"] == "roma-norte"
    assert row["precio_max"] == 9_000_000
    for pii in ("owner_id", "contacto_id", "notas", "fuente"):
        assert pii not in row, f"PII '{pii}' se fugó a la fila anónima"
    assert row["visitor_id"] is None


async def test_bridge_idempotente(db):
    """Re-correr el materializador NO duplica (upsert por dedup_key)."""
    import advisor_demand_bridge as B
    await db.asesor_busquedas.insert_one(_busqueda())
    await B.materialize_asesor_busquedas(db)
    await B.materialize_asesor_busquedas(db)
    assert await db.marketplace_searches.count_documents({"source": "asesor_anon"}) == 1


async def test_bridge_salta_docs_sin_id(db):
    """N4: un doc corrupto sin 'id' se salta — antes update_one({'id': None}) podía pisar docs ajenos."""
    import advisor_demand_bridge as B
    doc = _busqueda()
    doc.pop("id")
    await db.asesor_busquedas.insert_one(doc)
    res = await B.materialize_asesor_busquedas(db)
    assert res["materialized"] == 0
    assert await db.marketplace_searches.count_documents({}) == 0


async def test_match_llena_matched_y_espejo(db):
    """El RETORNO: match llena matched_dev_ids (owner-scoped) y el espejo deja de contar unmet."""
    import advisor_demand_bridge as B
    await db.asesor_busquedas.insert_one(_busqueda())
    await B.materialize_asesor_busquedas(db)
    res = await B.match_asesor_busquedas(db)
    assert res["matched"] == 1
    bq = await db.asesor_busquedas.find_one({"id": "busq_t1"}, {"_id": 0})
    assert bq["matched_dev_ids"], "matched_dev_ids debió llenarse (hay inventario seed en roma-norte)"
    mirror = await db.marketplace_searches.find_one({"source": "asesor_anon"}, {"_id": 0})
    assert mirror["unmet"] is False
    assert mirror["results_count"] == len(bq["matched_dev_ids"])


async def test_match_ignora_etapas_cerradas(db):
    """Búsquedas cerradas/ganadas no se re-matchean (ruido para el asesor)."""
    import advisor_demand_bridge as B
    await db.asesor_busquedas.insert_one(_busqueda(id="busq_t2", stage="ganada"))
    res = await B.match_asesor_busquedas(db)
    assert res["matched"] == 0


# ─── 2) demand_feedback ───────────────────────────────────────────────────────

async def test_cierre_marca_satisfecha_via_lead(db):
    """Cerrar (lead→visitor) marca satisfecha en searches + demanda_insatisfecha, sin reescribir unmet."""
    from demand_feedback import mark_demand_satisfied
    await db.leads.insert_one({"id": "lead_1", "visitor_id": "vis_1"})
    await db.marketplace_searches.insert_one({"id": "mks_1", "visitor_id": "vis_1", "unmet": True})
    await db.demanda_insatisfecha.insert_one({"dedup": "d1", "visitor_id": "vis_1", "zona": "roma-norte"})
    res = await mark_demand_satisfied(db, lead_id="lead_1")
    assert res == {"ok": True, "searches": 1, "insatisfecha": 1}
    s = await db.marketplace_searches.find_one({"id": "mks_1"}, {"_id": 0})
    assert s["satisfecha"] is True
    assert s["unmet"] is True, "unmet es HISTORIA (no se reescribe); los lectores excluyen por satisfecha"
    # los lectores de demanda viva la excluyen:
    viva = await db.marketplace_searches.count_documents({"unmet": True, "satisfecha": {"$ne": True}})
    assert viva == 0


async def test_cierre_sin_visitor_fail_open(db):
    """Sin visitor_id resoluble → no marca nada y NO rompe el flujo del cierre."""
    from demand_feedback import mark_demand_satisfied
    res = await mark_demand_satisfied(db, lead_id="lead_inexistente")
    assert res["ok"] is False


# ─── 3) cubo ve overrides del dev ─────────────────────────────────────────────

async def test_cubo_aplica_override_de_precio(db):
    """El precio editado por el dev (developer_unit_overrides) pisa el del seed en el cubo."""
    import cube_olap_engine as O
    units = [{"unit_id": "u1", "development_id": "dev1", "price": 5_000_000, "status": "disponible"}]
    await db.developer_unit_overrides.insert_one(
        {"unit_id": "u1", "dev_id": "dev1", "price": 6_100_000, "status": "apartado",
         "updated_by": "user_x", "reason": "ajuste"})
    out = await O._apply_dev_overrides(db, units)
    assert out[0]["price"] == 6_100_000
    assert out[0]["status"] == "apartado"
    # metadatos del override NO contaminan la unidad agregable
    assert "updated_by" not in out[0] and "reason" not in out[0]


async def test_cubo_override_sin_matches_no_toca(db):
    """Sin overrides para esas unidades, las filas quedan idénticas (fail-open)."""
    import cube_olap_engine as O
    units = [{"unit_id": "u9", "development_id": "dev9", "price": 1_000_000}]
    out = await O._apply_dev_overrides(db, units)
    assert out == units


async def test_kanon_demand_intel_shape():
    """N4: el umbral k-anon del cubo sigue siendo ≥3 (si cambia, revisar dev_market._KANON)."""
    import cube_olap_engine as O
    assert getattr(O, "_KANON_MIN", 3) == 3
