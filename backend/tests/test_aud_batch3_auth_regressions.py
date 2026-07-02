"""Regresiones del BATCH 3 (auditoría forense · núcleo auth) — AUD-021/022/023.

Los 3 son hallazgos de seguridad CONFIRMADOS por verificación adversarial. Estos tests fallan
si alguien revierte el fix.

NOTA (AUD-025): los checks estructurales leen el .py de DISCO (no `import server`/`routes.auth`)
a propósito — importar server inicializa un cliente LLM que contamina tests frágiles de otros
módulos (conversation_confidence_score asume un entorno sin LLM). Leer el fuente evita el side-effect.
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src(rel):
    return open(os.path.join(BACKEND, rel), encoding="utf-8").read()


def test_aud_021_account_blocked_guard_en_get_current_user():
    """get_current_user rechaza cuentas suspendidas en AMBAS ramas (sesión OAuth + JWT).
    Antes account_blocked solo se checaba en login-password → suspender no cortaba sesiones vivas."""
    src = _src("server.py")
    m = re.search(r"async def get_current_user\(.*?\n(?=async def |\ndef )", src, re.S)
    assert m, "no se encontró get_current_user"
    body = m.group(0)
    assert body.count("account_blocked") >= 2, \
        f"faltan las 2 guardias account_blocked (sesión + JWT) en get_current_user (hay {body.count('account_blocked')})"


def test_aud_022_magic_link_ip_no_confia_xff_primer_hop():
    """_ml_get_ip usa el client_ip canónico anti-spoof, NO X-Forwarded-For[0] (spoofeable)."""
    src = _src("routes/auth.py")
    m = re.search(r"def _ml_get_ip\(.*?\n(?=\ndef |\nasync def |\n@)", src, re.S)
    assert m, "no se encontró _ml_get_ip"
    body = m.group(0)
    assert "client_ip" in body, "el rate-limit de magic-link debe usar el client_ip canónico"
    assert 'split(",")[0]' not in body, "sigue tomando X-Forwarded-For[0] (spoofeable) — regresión AUD-022"


def test_aud_023_register_provisiona_tenant_unico_para_dev():
    """El registro de developer_admin provisiona un tenant PROPIO (no None→'default' compartido)."""
    src = _src("routes/auth.py")
    assert 'f"org_{user_id}"' in src, \
        "register debe provisionar tenant propio para developer_admin (AUD-023)"


def test_aud_023_tenant_of_aisla_orgs_distintas():
    """tenant_of de dos devs self-registrados da valores DISTINTOS (no colapsan al sentinel 'default').
    tenant_scope es liviano (sin cliente LLM) → importarlo es seguro."""
    from tenant_scope import tenant_of
    a = tenant_of({"tenant_id": "org_user_aaa", "role": "developer_admin"})
    b = tenant_of({"tenant_id": "org_user_bbb", "role": "developer_admin"})
    assert a != b, "dos devs distintos NO deben compartir tenant"
    assert a != "default" and b != "default", "un dev provisionado no debe caer al sentinel compartido"
