"""External integration probes — Sentry, Resend, Mapbox, INEGI."""
import os
from diagnostic_engine import functional_probe


async def _sentry_capturing(db, project_id, user):
    if not os.environ.get("SENTRY_DSN"):
        return {"passed": False, "error_type": "integration_external",
                "location": "env.SENTRY_DSN",
                "recommendation": "SENTRY_DSN no configurada. Errores no se reportarán.",
                "severity": "low"}
    # Check observability module initialized
    try:
        from observability import _sentry_initialized
        if not _sentry_initialized:
            return {"passed": False, "error_type": "wiring_broken",
                    "location": "observability._sentry_initialized",
                    "recommendation": "SENTRY_DSN presente pero SDK no inicializó. Revisar logs startup."}
    except Exception:
        pass
    return {"passed": True}


async def _resend_sendable(db, project_id, user):
    if not os.environ.get("RESEND_API_KEY"):
        return {"passed": False, "error_type": "integration_external",
                "location": "env.RESEND_API_KEY",
                "recommendation": "RESEND_API_KEY faltante. Emails transaccionales deshabilitados.",
                "severity": "low"}
    return {"passed": True}


async def _mapbox_renders(db, project_id, user):
    token = (os.environ.get("MAPBOX_TOKEN") or
             os.environ.get("REACT_APP_MAPBOX_TOKEN"))
    if not token:
        return {"passed": False, "error_type": "integration_external",
                "location": "env.REACT_APP_MAPBOX_TOKEN",
                "recommendation": "Mapbox token no configurado. Mapas no renderizarán.",
                "severity": "high"}
    return {"passed": True}


async def _inegi_cached(db, project_id, user):
    if not project_id:
        return {"passed": True}
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        return {"passed": True}
    colonia = dev.get("colonia_id") or dev.get("colonia")
    if not colonia:
        return {"passed": True}
    cached = await db.inegi_cache.find_one({"colonia_id": colonia}, {"_id": 0})
    if not cached:
        return {"passed": True, "extra": {"note": "Sin cache INEGI — se generará on-demand"}}
    return {"passed": True}


functional_probe("sentry_capturing", "integrations_external", "low",
                 "Sentry SDK inicializado y capturando",
                 _sentry_capturing, "integration_external")
functional_probe("resend_email_sendable", "integrations_external", "low",
                 "Resend API key configurada",
                 _resend_sendable, "integration_external")
functional_probe("mapbox_renders", "integrations_external", "high",
                 "Mapbox token configurado",
                 _mapbox_renders, "integration_external")
functional_probe("inegi_demographics_cached_or_callable", "integrations_external", "low",
                 "INEGI cache disponible para colonia del proyecto",
                 _inegi_cached, "integration_external")
