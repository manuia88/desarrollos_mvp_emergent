"""Regresiones del BATCH 4 (auditoría forense · barrido IDOR de 380 endpoints públicos).

7 hallazgos CONFIRMADOS por verificación adversarial 3-lentes (auth-oculta / dato-no-sensible /
explotable-hoy). Estos tests fallan si alguien revierte un fix. Leen el .py de DISCO (patrón AUD-025:
importar server/routes inicializa un cliente LLM que contamina tests frágiles de otros módulos).
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


def test_aud027_property_intake_publico_no_filtra_leads():
    """[CRÍTICO] GET /api/studio/property-intake/public/{slug} (sin auth) NO debe devolver la PII de
    prospectos. La proyección de get_public_intake debe excluir leads/leads_count/last_lead_at."""
    src = _src("routes/studio_property_intake.py")
    m = re.search(r"async def get_public_intake\(.*?return\s*\{", src, re.S)
    assert m, "no se encontró get_public_intake"
    body = m.group(0)
    for campo in ('"leads": 0', '"leads_count": 0', '"last_lead_at": 0'):
        assert campo in body, f"la proyección del endpoint público debe excluir {campo} (IDOR de leads)"


def test_aud028_gentrificacion_superadmin_endpoints_protegidos():
    """POST persist + backfill de gentrificación exigen require_superadmin (antes: abiertos a anónimo)."""
    src = _src("routes/gentrificacion.py")
    assert "from permissions import require_superadmin" in src
    for fn in ("superadmin_persist_gentrificacion", "superadmin_backfill_gentrificacion"):
        m = re.search(rf"async def {fn}\(.*?\n(?=\n@router|\nasync def |\Z)", src, re.S)
        assert m, f"no se encontró {fn}"
        assert "await require_superadmin(request)" in m.group(0), \
            f"{fn} debe llamar require_superadmin (endpoint /api/superadmin/* estaba abierto)"


def test_aud029_studio_budgets_admin_solo_superadmin():
    """Los endpoints de administración global de presupuestos Studio son superadmin-only (asesor_admin
    es tenant-scoped → veía/mutaba presupuestos de otros tenants)."""
    src = _src("routes/studio.py")
    for fn in ("list_all_budgets", "update_budget_cap"):
        m = re.search(rf"async def {fn}\(.*?\n(?=\n@router|\nasync def |\Z)", src, re.S)
        assert m, f"no se encontró {fn}"
        code = "\n".join(ln for ln in m.group(0).splitlines() if not ln.strip().startswith("#"))
        assert 'user.role != "superadmin"' in code, \
            f"{fn} debe restringir a superadmin (fuga/mutación cross-tenant)"
        assert '"asesor_admin", "superadmin"' not in code, \
            f"{fn} sigue permitiendo asesor_admin (regresión cross-tenant AUD-029)"


def test_aud030_validate_code_rate_limited():
    """El oráculo público de invite-codes tiene rate-limit y la generación usa secrets (CSPRNG)."""
    src = _src("routes/private_beta.py")
    m = re.search(r"async def validate_code\(.*?\n(?=\n@router|\nasync def )", src, re.S)
    assert m and "_waitlist_rate_limit(_client_ip(request))" in m.group(0), \
        "validate_code debe rate-limitar por IP (enumeración de códigos)"
    eng = _src("private_beta_engine.py")
    assert "secrets.choice(CODE_ALPHABET)" in eng, "generación de código debe usar secrets (no random)"
    assert "import random" not in eng, "random ya no debe importarse (se usa secrets)"
