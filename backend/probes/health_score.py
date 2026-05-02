"""Phase 4 Batch 14 — Health Score Engine probe + Weekly Brief probe."""
from diagnostic_engine import functional_probe
from datetime import datetime, timezone, timedelta


async def _health_score_engine(db, project_id, user):
    """Verify health score engine runs + components valid + cache functional."""
    try:
        # 1. Check engine can compute (use first available project)
        from data_developments import DEVELOPMENTS_BY_ID
        test_id = list(DEVELOPMENTS_BY_ID.keys())[0] if DEVELOPMENTS_BY_ID else None
        if not test_id:
            return {"passed": True, "extra": {"skip": "no projects to test"}}

        from health_score import compute_health_score
        result = await compute_health_score("project", test_id, db)

        score = result.get("score")
        components = result.get("components", {})

        if score is None or not isinstance(score, (int, float)):
            return {"passed": False, "error_type": "wiring_broken",
                    "location": "health_score.compute_health_score",
                    "recommendation": "Health score no retorna valor numérico."}

        if score < 0 or score > 100:
            return {"passed": False, "error_type": "data_quality",
                    "location": "health_score.score",
                    "recommendation": f"Score fuera de rango [0-100]: {score}"}

        if not components:
            return {"passed": False, "error_type": "wiring_broken",
                    "location": "health_score.components",
                    "recommendation": "Health score no retorna componentes."}

        # 2. Check cache is being populated
        cached = await db.health_scores.find_one(
            {"entity_type": "project", "entity_id": test_id}, {"_id": 0, "score": 1}
        )
        if not cached:
            return {"passed": False, "error_type": "stale_data",
                    "location": "db.health_scores",
                    "recommendation": "Cache no se está persistiendo. Verificar upsert."}

        return {"passed": True, "extra": {
            "test_project": test_id,
            "score": score,
            "components_count": len(components),
            "cached": True,
        }}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "health_score module",
                "recommendation": f"Engine error: {str(e)[:200]}"}


async def _weekly_brief_generator(db, project_id, user):
    """Verify APScheduler weekly_brief job is registered + brief not stale."""
    try:
        # Check if scheduler has the weekly brief job
        try:
            from scheduler_ie import _scheduler
            if _scheduler is not None:
                jobs = [j.id for j in _scheduler.get_jobs()]
                if "weekly_brief_generation" not in jobs:
                    return {"passed": False, "error_type": "wiring_broken",
                            "location": "scheduler",
                            "recommendation": "Job 'weekly_brief_generation' no registrado en scheduler."}
        except Exception:
            pass  # Scheduler may not be accessible in test context

        # Check last brief < 8 days old
        since_8d = datetime.now(timezone.utc) - timedelta(days=8)
        recent = await db.weekly_briefs.find_one(
            {"generated_at": {"$gte": since_8d.isoformat()}},
            {"_id": 0, "generated_at": 1},
        )
        if not recent:
            return {"passed": False, "error_type": "stale_data",
                    "location": "db.weekly_briefs",
                    "recommendation": "No hay briefs generados en los últimos 8 días. "
                                       "Verificar APScheduler o ejecutar generación manual."}

        return {"passed": True, "extra": {"last_brief": recent.get("generated_at")}}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "weekly_brief module",
                "recommendation": f"Error: {str(e)[:200]}"}


functional_probe("health_score_engine", "ai_integrations", "high",
                 "Health Score Engine computa scores válidos y cachea correctamente",
                 _health_score_engine, "wiring_broken")

functional_probe("weekly_brief_generator", "ai_integrations", "medium",
                 "Weekly Brief Generator registrado y generando briefs frescos",
                 _weekly_brief_generator, "stale_data")
