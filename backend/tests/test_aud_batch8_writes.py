"""Regresiones del BATCH 8 (escrituras cross-tenant · doc AUTHZ_MODEL.md).

3 mutaciones cross-tenant confirmadas (AUD-059/060/061). Structural sobre .py de disco (patrón AUD-025):
verifican que el guard de propiedad esté presente en cada sink.
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


def test_aud059_create_hold_valida_unidad_en_dev():
    src = _src("routes/dev_batch1.py")
    m = re.search(r"async def create_hold\(.*?_ensure_hold_index", src, re.S).group(0)
    assert "_assert_unit_in_dev" in m, \
        "create_hold debe validar que la unidad del path sea del dev (anti-secuestro cross-tenant AUD-059)"


def test_aud060_release_hold_valida_unidad_en_dev():
    src = _src("routes/dev_batch1.py")
    m = re.search(r"async def release_hold\(.*?unit_holds\.update_one", src, re.S).group(0)
    assert "_assert_unit_in_dev" in m, \
        "release_hold debe validar la unidad→dev (AUD-060)"


def test_aud061_operacion_cierre_no_toca_lead_ajeno():
    src = _src("routes/advisor.py")
    # rama 'cerrada': contacto acotado por owner + assert_lead_owner antes de tocar db.leads
    m = re.search(r'if not _lid_op and op\.get\("contacto_id"\).*?leads\.update_one', src, re.S).group(0)
    assert '"owner_id": user.user_id' in m, "el contacto de cierre debe acotarse por owner (AUD-061)"
    assert "assert_lead_owner" in m, "debe validar dueño del lead antes de marcar cerrado_ganado (AUD-061)"
    # create_operacion valida propiedad del contacto
    co = re.search(r"async def create_operacion\(.*?asesor_operaciones\.insert_one", src, re.S).group(0)
    assert '{"id": payload.contacto_id, "owner_id": user.user_id}' in co, \
        "create_operacion debe validar que el contacto sea del asesor (AUD-061)"
