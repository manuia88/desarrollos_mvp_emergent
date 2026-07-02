"""Regresiones del BATCH 6 (auditoría forense · aislamiento multi-tenant).

Fugas cross-tenant CONFIRMADAS por verificación adversarial 3-lentes. Se arreglaron las 2 CRÍTICAS
(AUD-033/034) + 7 ALTAS (AUD-035..039). Estos tests fallan si alguien revierte un guard. Leen el .py
de DISCO (patrón AUD-025: importar routes/engines inicializa un cliente LLM que contamina otros tests).
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


def test_aud033_atlax_rag_scoped_a_publico():
    """El RAG del Atlax público se acota a scopes NO-PII (no expone leads a un anónimo)."""
    src = _src("atlax_engine.py")
    m = re.search(r"rag_res = await semantic_search\([^)]*\)", src)
    assert m and "PUBLIC_SEARCH_SCOPES" in m.group(0), \
        "atlax semantic_search debe pasar scopes_in=PUBLIC_SEARCH_SCOPES (fuga PII AUD-033)"


def test_aud034_ai_suggestions_autoriza_entidad():
    src = _src("ai_suggestions.py")
    assert "_authorize_entity" in src
    gs = re.search(r"async def get_suggestions\(.*?_get_or_generate", src, re.S)
    assert gs and "_authorize_entity" in gs.group(0), \
        "get_suggestions debe autorizar la entidad antes de leer PII (AUD-034)"
    auth = re.search(r"async def _authorize_entity\(.*?\n(?=\n@router|\nasync def )", src, re.S).group(0)
    assert "assert_lead_owner" in auth and "assert_db_project_owner" in auth


def test_aud035_tracking_links_fail_closed():
    src = _src("routes/tracking_links.py")
    ll = re.search(r"async def list_links\(.*?to_list\(500\)", src, re.S).group(0)
    assert "tenant_filter" in ll, "list_links debe usar tenant_filter (fail-closed) para admins"
    assert 'q["tenant_id"] = user.tenant_id' not in ll, "sigue el scoping fail-open (regresión AUD-035)"


def test_aud036_team_aggregated_fail_closed():
    src = _src("routes/team_aggregated.py")
    assert 'if user.role != "superadmin" and tenant:' not in src, "sigue saltando scope sin tenant (AUD-036)"
    assert "__no_tenant_fail_closed__" in src, "debe forzar cero-match cuando el admin no tiene tenant"


def test_aud037_briefing_engine_scoped():
    src = _src("briefing_engine.py")
    assert 'db.asesor_busquedas.find_one({"id": lead_id, **_scope_busq}' in src
    assert 'db.asesor_contactos.find_one({"id": contact_id, **_scope_cont}' in src


def test_aud038_visit_prep_y_casamentera_owner():
    ac = _src("routes/agentic_crm.py")
    # casamentera + generate_visit_prep deben llamar assert_lead_owner
    cas = re.search(r"async def casamentera\(.*?res = await compute_match", ac, re.S).group(0)
    assert "assert_lead_owner" in cas, "casamentera debe validar dueño del lead (AUD-038)"
    vp = re.search(r"async def generate_visit_prep\(.*?generate_dossier", ac, re.S).group(0)
    assert "assert_lead_owner" in vp, "generate_visit_prep debe validar dueño (fail-closed, AUD-038)"
    assert 'lead_org and getattr(user, "tenant_id", None) != lead_org' not in vp, \
        "sigue el check inline fail-open de dev_org_id (regresión AUD-038)"
    adt = _src("routes/asesor_daily_tools.py")
    for fn in ("visit_briefing_generate", "visit_briefing_get"):
        body = re.search(rf"async def {fn}\(.*?\n(?=\n@router|\nasync def )", adt, re.S).group(0)
        assert "_assert_appointment_owner" in body, f"{fn} debe autorizar la cita por tenant (AUD-038)"


def test_aud039_cerebro_enrich_owner():
    src = _src("cerebro/executors.py")
    ee = re.search(r"async def exec_enrich\(.*?\n(?=\nasync def |\n# )", src, re.S).group(0)
    assert "assert_lead_owner" in ee, "exec_enrich debe validar dueño del lead antes de enriquecer (AUD-039)"


def test_aud040_devmaster_comportamiento_none_check():
    src = _src("routes/superadmin_devmaster.py")
    assert "{} if dev_ids is None else" in src, \
        "_comportamiento debe usar chequeo None (dev_ids=[] → cero leads, no god-view) (AUD-040)"
    assert 'q = {"development_id": {"$in": list(dev_ids)}} if dev_ids else {}' not in src


def test_aud041_disputes_owner_antes_de_status():
    src = _src("routes/disputes.py")
    m = re.search(r'lead = await db\.leads\.find_one\(\{"id": lead_id\}.*?under_review', src, re.S).group(0)
    # el check de dueño (dev_org_id) debe aparecer ANTES del check de status under_review
    assert m.index("dev_org_id_lead") < m.index("under_review"), \
        "el check de dueño debe ir antes del status (oráculo de enumeración AUD-041)"


def test_aud042_workflow_test_valida_lead():
    src = _src("routes/workflows.py")
    tw = re.search(r"async def test_workflow\(.*?execute_workflow\(", src, re.S).group(0)
    assert "assert_lead_owner" in tw, "test_workflow debe validar dueño de body.lead_id (AUD-042)"
