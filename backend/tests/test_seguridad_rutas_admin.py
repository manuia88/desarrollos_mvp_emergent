"""GATE PERMANENTE DE SEGURIDAD (nace de la auditoría del mapa v3, 2026-07-13).
Afirma que TODA ruta /api/superadmin y /api/admin tiene una guardia de autorización —
inline (_get_user+rol · _sa · _require_* · await require_superadmin), por token
(x-cron-token/ADMIN_ANALYTICS_TOKEN), o por dependencia de router. Si alguien agrega un
endpoint admin sin auth, este test truena. Estático a propósito: no necesita servidor vivo."""
import glob
import os
import re

_BACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # backend/

GUARDIAS = (
    "_sa(", "_su(", "_adm(", "_auth(", "_get_user(", "_get_user_optional(",
    "_require_superadmin", "_require_user", "_auth_asesor", "_auth_dev", "_auth_superadmin",
    "_require_advisor", "_require_authorized", "_require_access", "_require_developer",
    "_require_dev_or_superadmin", "require_superadmin", "get_current_user", "require_role",
    "assert_dev_org", "assert_tenant", "!= \"superadmin\"", "== \"superadmin\"",
    "x-cron-token", "x-hub-signature", "ADMIN_ANALYTICS_TOKEN", "GOOGLE_INGEST_TOKEN",
    "sync_apply(",  # delega a función guardada
)
_DEC = re.compile(r'(@(?:router|app)\.(?:get|post|put|patch|delete)\(\s*["\']([^"\']+)["\'])')


def _rutas_admin_sin_guardia():
    faltantes = []
    for p in glob.glob(os.path.join(_BACK, "routes", "*.py")) + [os.path.join(_BACK, "server.py")]:
        s = open(p, encoding="utf-8", errors="ignore").read()
        pref = re.search(r'APIRouter\([^)]*prefix\s*=\s*["\']([^"\']+)["\']', s)
        prefijo = pref.group(1) if pref else ""
        router_dep = bool(re.search(r"APIRouter\([^)]*dependencies\s*=", s))
        bloques = re.split(_DEC, s)
        for i in range(1, len(bloques) - 2, 3):
            ruta = prefijo + bloques[i + 1]
            cuerpo = bloques[i + 2][:3500]
            if not ruta.startswith(("/api/superadmin", "/api/admin")):
                continue
            if router_dep or any(g in cuerpo for g in GUARDIAS):
                continue
            faltantes.append(f"{p}:{ruta}")
    return faltantes


def test_toda_ruta_admin_tiene_guardia():
    faltantes = _rutas_admin_sin_guardia()
    assert not faltantes, (
        "Endpoints admin SIN guardia de autorización detectada — agrega auth o, si el guard usa "
        "un patrón nuevo, añádelo a GUARDIAS:\n  " + "\n  ".join(faltantes))
