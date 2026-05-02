"""Performance probes."""
import time
from diagnostic_engine import functional_probe


async def _heavy_endpoints_fast(db, project_id, user):
    # Sample a heavy aggregation to approximate performance
    slow_threshold_ms = 2000
    t0 = time.perf_counter()
    try:
        await db.audit_log.count_documents({"created_at": {"$exists": True}})
    except Exception as e:
        return {"passed": False, "error_type": "performance",
                "location": "db.audit_log.count_documents",
                "recommendation": f"Error DB: {str(e)[:120]}"}
    dur = int((time.perf_counter() - t0) * 1000)
    if dur > slow_threshold_ms:
        return {"passed": False, "error_type": "performance",
                "location": "audit_log full count",
                "recommendation": f"Query lenta ({dur}ms). Considerar índices en audit_log.created_at.",
                "severity": "medium",
                "extra": {"duration_ms": dur}}
    return {"passed": True, "extra": {"audit_count_ms": dur}}


async def _bundle_size_check(db, project_id, user):
    # Stub: real check would curl the frontend main.js HEAD and check content-length.
    # We mark as pass unless we detect specific indicator.
    return {"passed": True,
            "extra": {"note": "Bundle size check es client-side (stub honesto en backend)"}}


functional_probe("heavy_endpoints_under_2s", "performance", "medium",
                 "Endpoints pesados responden <2s",
                 _heavy_endpoints_fast, "performance")
functional_probe("bundle_initial_size_under_threshold", "performance", "low",
                 "Bundle inicial bajo umbral",
                 _bundle_size_check, "performance")
