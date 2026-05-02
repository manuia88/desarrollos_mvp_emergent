"""Notifications probes."""
from diagnostic_engine import functional_probe


async def _notifications_writeable(db, project_id, user):
    try:
        # Probe write: insert + delete
        test_id = "diag_probe_test"
        await db.notifications.update_one(
            {"id": test_id},
            {"$set": {"id": test_id, "test": True, "created_at": "test"}},
            upsert=True,
        )
        await db.notifications.delete_one({"id": test_id})
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "db.notifications",
                "recommendation": f"Collection no escribible: {str(e)[:120]}"}
    return {"passed": True}


async def _bell_counter(db, project_id, user):
    if not user:
        return {"passed": True}
    # Bell counter = unread notifications for user
    count = await db.notifications.count_documents({
        "user_id": getattr(user, "user_id", None), "read": False,
    })
    return {"passed": True, "extra": {"unread": count}}


functional_probe("notifications_collection_writeable", "notifications", "high",
                 "Colección notifications escribible",
                 _notifications_writeable, "wiring_broken")
functional_probe("bell_counter_endpoints_respond", "notifications", "low",
                 "Bell counter responde con count válido",
                 _bell_counter, "wiring_broken")
