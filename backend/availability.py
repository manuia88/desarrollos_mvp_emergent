"""Phase 4 Batch 15 — Availability Engine + Auto-assign Policies.

Queries Google Calendar freeBusy for all asesores in pool,
intersects against working_hours + slot_duration + buffer,
and assigns appointments per policy (round_robin | pre_selected | load_balance).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.availability")

_DEFAULT_POLICY = {
    "policy_type": "round_robin",
    "asesor_pool": [],
    "working_hours": {
        "mon": [9, 18], "tue": [9, 18], "wed": [9, 18],
        "thu": [9, 18], "fri": [9, 18], "sat": [10, 14], "sun": None,
    },
    "slot_duration_min": 60,
    "buffer_min": 15,
    "max_concurrent_per_asesor": 1,
}

_DOW_MAP = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Policy helpers ───────────────────────────────────────────────────────────

async def get_policy(db, project_id: str) -> Dict[str, Any]:
    doc = await db.appointment_policies.find_one({"project_id": project_id}, {"_id": 0})
    if not doc:
        return {"project_id": project_id, **_DEFAULT_POLICY}
    return doc


async def upsert_policy(db, project_id: str, patch: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
    now = _now()
    patch.update({"project_id": project_id, "updated_at": now.isoformat(), "created_by": actor_user_id})
    await db.appointment_policies.replace_one({"project_id": project_id}, patch, upsert=True)
    return patch


# ─── Slot generation ─────────────────────────────────────────────────────────

def _slots_for_day(
    day: datetime,
    working_hours: Dict[str, Optional[List[int]]],
    slot_duration_min: int,
    buffer_min: int,
) -> List[Tuple[datetime, datetime]]:
    """Generate all candidate slots for a given day based on working_hours."""
    dow = _DOW_MAP[day.weekday()]
    hours = working_hours.get(dow)
    if not hours or len(hours) < 2:
        return []

    start_h, end_h = hours[0], hours[1]
    step = timedelta(minutes=slot_duration_min + buffer_min)
    duration = timedelta(minutes=slot_duration_min)

    slots: List[Tuple[datetime, datetime]] = []
    cursor = day.replace(hour=start_h, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
    day_end = day.replace(hour=end_h, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)

    while cursor + duration <= day_end:
        slots.append((cursor, cursor + duration))
        cursor += step

    return slots


def _busy_set(busy_intervals: List[Dict[str, str]]) -> List[Tuple[datetime, datetime]]:
    result = []
    for interval in busy_intervals:
        s = interval.get("start", "")
        e = interval.get("end", "")
        try:
            ts = datetime.fromisoformat(s.replace("Z", "+00:00"))
            te = datetime.fromisoformat(e.replace("Z", "+00:00"))
            result.append((ts, te))
        except Exception:
            pass
    return result


def _is_free(slot_start: datetime, slot_end: datetime,
              busy: List[Tuple[datetime, datetime]]) -> bool:
    for bs, be in busy:
        # Overlap if not (slot_end <= bs or slot_start >= be)
        if not (slot_end <= bs or slot_start >= be):
            return False
    return True


# ─── Main availability query ─────────────────────────────────────────────────

async def get_available_slots(
    db,
    project_id: str,
    date_from: datetime,
    date_to: datetime,
) -> List[Dict[str, Any]]:
    """
    Query freeBusy for all Google-connected asesores in pool,
    return list of available slots with available_asesor_ids.
    """
    policy = await get_policy(db, project_id)
    asesor_pool = policy.get("asesor_pool", [])
    working_hours = policy.get("working_hours", _DEFAULT_POLICY["working_hours"])
    slot_duration_min = policy.get("slot_duration_min", 60)
    buffer_min = policy.get("buffer_min", 15)

    if not asesor_pool:
        log.warning(f"[avail] No asesor_pool for project {project_id}")
        return []

    # Check cache (5 min TTL)
    date_key = f"{date_from.date()}_{date_to.date()}"
    cache_doc = await db.availability_cache.find_one(
        {"project_id": project_id, "date_key": date_key}, {"_id": 0},
    )
    if cache_doc:
        exp = cache_doc.get("expires_at", "")
        if exp and exp > _now().isoformat():
            return cache_doc.get("slots", [])

    # Fetch freeBusy for each asesor in pool
    from oauth_calendar import get_valid_access_token, get_oauth_token, PROVIDERS

    # Build busy map per asesor
    asesor_busy: Dict[str, List[Tuple[datetime, datetime]]] = {}
    asesor_warned = []

    for asesor_id in asesor_pool:
        token_doc = await get_oauth_token(db, asesor_id, "google")
        if not token_doc or token_doc.get("status") != "active":
            log.warning(f"[avail] Asesor {asesor_id} has no Google connection — skipping")
            asesor_warned.append(asesor_id)
            continue

        access_token = await get_valid_access_token(db, asesor_id, "google")
        if not access_token:
            log.warning(f"[avail] Could not get valid token for {asesor_id}")
            asesor_warned.append(asesor_id)
            continue

        try:
            prov = PROVIDERS["google"]
            cal_id = token_doc.get("calendar_id", "primary")
            busy_raw = await prov.get_free_busy(access_token, cal_id, date_from, date_to)
            asesor_busy[asesor_id] = _busy_set(busy_raw)
        except Exception as e:
            log.warning(f"[avail] freeBusy error for {asesor_id}: {e}")
            asesor_warned.append(asesor_id)

    if not asesor_busy:
        log.warning(f"[avail] No connected asesores for project {project_id}")
        return []

    # Generate slots per day in range
    slots: List[Dict[str, Any]] = []
    cursor_day = date_from.replace(hour=0, minute=0, second=0, microsecond=0)
    end_day = date_to.replace(hour=23, minute=59, second=59, microsecond=0)

    while cursor_day <= end_day:
        day_slots = _slots_for_day(cursor_day, working_hours, slot_duration_min, buffer_min)

        for slot_start, slot_end in day_slots:
            if slot_start < _now():
                continue
            # Which asesores are free at this slot?
            available_asesores = [
                aid for aid, busy in asesor_busy.items()
                if _is_free(slot_start, slot_end, busy)
            ]
            if available_asesores:
                slots.append({
                    "slot_start": slot_start.isoformat(),
                    "slot_end": slot_end.isoformat(),
                    "available_asesor_ids": available_asesores,
                    "duration_min": slot_duration_min,
                })

        cursor_day += timedelta(days=1)

    # Cache 5 min
    await db.availability_cache.replace_one(
        {"project_id": project_id, "date_key": date_key},
        {
            "project_id": project_id,
            "date_key": date_key,
            "slots": slots,
            "expires_at": (_now() + timedelta(minutes=5)).isoformat(),
            "warned_asesores": asesor_warned,
        },
        upsert=True,
    )

    return slots


# ─── Auto-assign ─────────────────────────────────────────────────────────────

async def _select_asesor_round_robin(
    db, project_id: str, available_ids: List[str],
) -> str:
    """Select asesor via FIFO rotation (last_assigned_at ordering)."""
    if not available_ids:
        raise ValueError("No asesores disponibles para round robin")

    # Get last_assigned_at for each asesor
    records = await db.appointment_assign_log.find(
        {"project_id": project_id, "asesor_id": {"$in": available_ids}},
        {"_id": 0, "asesor_id": 1, "assigned_at": 1},
        sort=[("assigned_at", -1)],
    ).to_list(len(available_ids) * 2)

    assigned_map = {r["asesor_id"]: r["assigned_at"] for r in records}
    # Sort by last assigned (oldest first = next in rotation)
    sorted_ids = sorted(available_ids, key=lambda x: assigned_map.get(x, "1970-01-01T00:00:00"))
    return sorted_ids[0]


async def _select_asesor_load_balance(
    db, available_ids: List[str],
) -> str:
    """Select asesor with fewest confirmed appointments today."""
    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    loads: Dict[str, int] = {aid: 0 for aid in available_ids}
    async for apt in db.appointments.find(
        {
            "asesor_id": {"$in": available_ids},
            "status": {"$in": ["confirmed", "pending"]},
            "datetime": {"$gte": today_start.isoformat(), "$lt": today_end.isoformat()},
        },
        {"_id": 0, "asesor_id": 1},
    ):
        aid = apt.get("asesor_id")
        if aid in loads:
            loads[aid] += 1

    return min(loads, key=loads.get)


async def assign_appointment(
    db,
    project_id: str,
    slot_start: str,
    slot_end: str,
    lead_id: str,
    lead_email: str = "",
    actor_user_id: str = "",
) -> Dict[str, Any]:
    """Select asesor per policy + create calendar event + store appointment."""
    from oauth_calendar import get_valid_access_token, get_oauth_token, PROVIDERS, _build_ics

    policy = await get_policy(db, project_id)
    policy_type = policy.get("policy_type", "round_robin")

    # Parse slot times
    slot_start_dt = datetime.fromisoformat(slot_start.replace("Z", "+00:00"))
    slot_end_dt = datetime.fromisoformat(slot_end.replace("Z", "+00:00"))
    if slot_start_dt.tzinfo is None:
        slot_start_dt = slot_start_dt.replace(tzinfo=timezone.utc)
    if slot_end_dt.tzinfo is None:
        slot_end_dt = slot_end_dt.replace(tzinfo=timezone.utc)

    # Get slots to find available asesores at this slot
    slots = await get_available_slots(db, project_id, slot_start_dt, slot_end_dt + timedelta(minutes=1))
    matching = [s for s in slots if s["slot_start"][:16] == slot_start[:16]]
    available_ids = matching[0]["available_asesor_ids"] if matching else policy.get("asesor_pool", [])

    if not available_ids:
        raise ValueError("No hay asesores disponibles para este slot")

    # Apply policy
    asesor_id: str
    if policy_type == "pre_selected":
        lead_doc = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0, "preferred_asesor_id": 1})
        preferred = lead_doc.get("preferred_asesor_id", "") if lead_doc else ""
        asesor_id = preferred if preferred in available_ids else available_ids[0]
    elif policy_type == "load_balance":
        asesor_id = await _select_asesor_load_balance(db, available_ids)
    else:  # round_robin (default)
        asesor_id = await _select_asesor_round_robin(db, project_id, available_ids)

    # Get project info for event summary
    project_name = project_id
    try:
        from projects_unified import get_project_by_slug
        proj = await get_project_by_slug(db, project_id)
        if proj:
            project_name = proj.get("name", project_id)
    except Exception:
        pass

    # Create Google Calendar event
    calendar_event_id = ""
    html_link = ""
    ics_data = ""

    token_doc = await get_oauth_token(db, asesor_id, "google")
    if token_doc and token_doc.get("status") == "active":
        try:
            access_token = await get_valid_access_token(db, asesor_id, "google")
            if access_token:
                prov = PROVIDERS["google"]
                cal_id = token_doc.get("calendar_id", "primary")
                event_result = await prov.create_event(
                    access_token, cal_id,
                    summary=f"Visita: {project_name}",
                    start=slot_start_dt,
                    end=slot_end_dt,
                    description=f"Lead: {lead_id}\nProyecto: {project_name}",
                    attendee_email=lead_email,
                )
                calendar_event_id = event_result.get("event_id", "")
                html_link = event_result.get("html_link", "")
                ics_data = event_result.get("ics", "")
        except Exception as e:
            log.warning(f"[assign] Calendar event creation failed for {asesor_id}: {e}")
            ics_data = _build_ics(
                f"Visita: {project_name}", slot_start_dt, slot_end_dt,
                f"Lead: {lead_id}",
            )
    else:
        # No calendar connected — generate ICS locally
        ics_data = _build_ics(
            f"Visita: {project_name}", slot_start_dt, slot_end_dt,
            f"Lead: {lead_id}",
        )

    # Store appointment
    appointment_id = str(uuid.uuid4())
    now = _now()
    appointment = {
        "id": appointment_id,
        "appointment_id": appointment_id,
        "project_id": project_id,
        "lead_id": lead_id,
        "asesor_id": asesor_id,
        "datetime": slot_start,
        "end_datetime": slot_end,
        "status": "confirmed",
        "type": "visita_presencial",
        "calendar_event_id": calendar_event_id,
        "calendar_provider": "google" if calendar_event_id else "none",
        "calendar_html_link": html_link,
        "policy_used": policy_type,
        "created_at": now.isoformat(),
        "created_by": actor_user_id,
    }
    await db.appointments.insert_one({**appointment})

    # Log rotation for round_robin
    await db.appointment_assign_log.insert_one({
        "project_id": project_id,
        "asesor_id": asesor_id,
        "appointment_id": appointment_id,
        "assigned_at": now.isoformat(),
    })

    # Activity log
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, actor_user_id, "system", "appointment_made",
            appointment_id, "appointment",
            metadata={"asesor_id": asesor_id, "project_id": project_id,
                       "slot": slot_start, "policy": policy_type},
        )
    except Exception:
        pass

    return {
        "appointment_id": appointment_id,
        "asesor_id": asesor_id,
        "slot_start": slot_start,
        "slot_end": slot_end,
        "calendar_event_id": calendar_event_id,
        "calendar_provider": appointment["calendar_provider"],
        "calendar_html_link": html_link,
        "policy_used": policy_type,
        "ics": ics_data,
    }
