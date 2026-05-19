"""W5.25 — Indexes for widget_embeds collection."""
from __future__ import annotations

import logging

log = logging.getLogger("dmx.widget_embed_indexes")


async def ensure_widget_embeds_index(db) -> None:
    """Create compound unique + sparse indexes on widget_embeds."""
    from pymongo import ASCENDING, DESCENDING

    try:
        await db.widget_embeds.create_index(
            [("widget_type", ASCENDING), ("slug", ASCENDING), ("hostname", ASCENDING)],
            unique=True,
            name="widget_embeds_unique",
        )
        await db.widget_embeds.create_index(
            [("hostname", ASCENDING)],
            name="widget_embeds_hostname",
        )
        await db.widget_embeds.create_index(
            [("widget_type", ASCENDING)],
            name="widget_embeds_widget_type",
        )
        await db.widget_embeds.create_index(
            [("last_seen_at", DESCENDING)],
            name="widget_embeds_last_seen_desc",
        )
        await db.widget_embeds.create_index(
            [("first_seen_at", DESCENDING)],
            name="widget_embeds_first_seen_desc",
        )
        log.info("[w5.25] widget_embeds indexes OK")
    except Exception as exc:
        log.warning(f"[w5.25] widget_embeds indexes setup failed (non-fatal): {exc}")
