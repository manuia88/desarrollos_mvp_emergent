"""Phase 4 Batch 15 — Calendar Provider abstraction + Google implementation.

CalendarProvider (ABC) defines the interface.
GoogleCalendarProvider wraps Google Calendar REST API with token encryption.
MicrosoftCalendarProvider is a stub (raises NotImplementedError / "coming_soon").

PROVIDERS registry: only 'google' is active.
Token encryption: Fernet via OAUTH_TOKEN_ENCRYPTION_KEY env var.
"""
from __future__ import annotations

import os
import uuid
import secrets
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx
from cryptography.fernet import Fernet

log = logging.getLogger("dmx.oauth_calendar")

# ─── Encryption ──────────────────────────────────────────────────────────────

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("OAUTH_TOKEN_ENCRYPTION_KEY") or os.environ.get("IE_FERNET_KEY")
        if not key:
            raise RuntimeError("OAUTH_TOKEN_ENCRYPTION_KEY not set")
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_token(token: str) -> str:
    return _get_fernet().encrypt(token.encode()).decode()


def decrypt_token(cipher: str) -> str:
    return _get_fernet().decrypt(cipher.encode()).decode()


# ─── Abstract base ────────────────────────────────────────────────────────────

class CalendarProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        """Return OAuth authorization URL with CSRF state."""

    @abstractmethod
    async def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchange authorization code → {access_token, refresh_token, expires_in, scope, email}."""

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh access token → {access_token, expires_in}."""

    @abstractmethod
    async def revoke_token(self, token: str) -> bool:
        """Revoke access token at provider. Returns True if successful."""

    @abstractmethod
    async def get_free_busy(
        self, access_token: str, calendar_id: str,
        time_min: datetime, time_max: datetime,
    ) -> List[Dict[str, str]]:
        """Return list of {start, end} busy intervals (ISO strings)."""

    @abstractmethod
    async def create_event(
        self, access_token: str, calendar_id: str,
        summary: str, start: datetime, end: datetime,
        description: str = "", attendee_email: str = "",
    ) -> Dict[str, Any]:
        """Create calendar event. Returns {event_id, html_link, ics}."""

    @abstractmethod
    async def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> bool:
        """Delete a calendar event. Returns True on success."""


# ─── Google Calendar Provider ─────────────────────────────────────────────────

_GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
_GOOGLE_REVOKE_URI = "https://oauth2.googleapis.com/revoke"
_GOOGLE_USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"
_GOOGLE_FREEBUSY_URI = "https://www.googleapis.com/calendar/v3/freeBusy"
_GOOGLE_EVENTS_URI = "https://www.googleapis.com/calendar/v3/calendars/{cal}/events"
_GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
]


class GoogleCalendarProvider(CalendarProvider):
    name = "google"

    def __init__(self):
        self.client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
        self.client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")

    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        scope = " ".join(_GOOGLE_SCOPES)
        params = (
            f"client_id={self.client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
            f"&scope={scope.replace(' ', '%20')}"
            f"&access_type=offline"
            f"&prompt=consent"
            f"&state={state}"
        )
        return f"{_GOOGLE_AUTH_URI}?{params}"

    async def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.post(_GOOGLE_TOKEN_URI, data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
        data = resp.json()
        if "error" in data:
            raise ValueError(f"Token exchange error: {data}")

        # Get user email
        email = ""
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                u = await c.get(_GOOGLE_USERINFO_URI, headers={
                    "Authorization": f"Bearer {data['access_token']}"
                })
                email = u.json().get("email", "")
        except Exception:
            pass

        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "expires_in": data.get("expires_in", 3600),
            "scope": data.get("scope", ""),
            "email": email,
        }

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.post(_GOOGLE_TOKEN_URI, data={
                "refresh_token": refresh_token,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "refresh_token",
            })
        data = resp.json()
        if "error" in data:
            raise ValueError(f"Token refresh error: {data}")
        return {
            "access_token": data["access_token"],
            "expires_in": data.get("expires_in", 3600),
        }

    async def revoke_token(self, token: str) -> bool:
        async with httpx.AsyncClient(timeout=10) as c:
            resp = await c.post(_GOOGLE_REVOKE_URI, params={"token": token})
        return resp.status_code == 200

    async def get_free_busy(
        self, access_token: str, calendar_id: str,
        time_min: datetime, time_max: datetime,
    ) -> List[Dict[str, str]]:
        body = {
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "items": [{"id": calendar_id}],
        }
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.post(_GOOGLE_FREEBUSY_URI, json=body, headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            })
        data = resp.json()
        if "error" in data:
            log.warning(f"[google] freeBusy error: {data}")
            return []
        calendars = data.get("calendars", {})
        cal_data = calendars.get(calendar_id, calendars.get("primary", {}))
        return cal_data.get("busy", [])

    async def create_event(
        self, access_token: str, calendar_id: str,
        summary: str, start: datetime, end: datetime,
        description: str = "", attendee_email: str = "",
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start.isoformat(), "timeZone": "America/Mexico_City"},
            "end":   {"dateTime": end.isoformat(),   "timeZone": "America/Mexico_City"},
        }
        if attendee_email:
            body["attendees"] = [{"email": attendee_email}]

        url = _GOOGLE_EVENTS_URI.format(cal=calendar_id)
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.post(url, json=body, headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            })
        data = resp.json()
        if "error" in data:
            raise ValueError(f"Create event error: {data}")

        return {
            "event_id": data.get("id", ""),
            "html_link": data.get("htmlLink", ""),
            "ics": _build_ics(summary, start, end, description),
        }

    async def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> bool:
        url = f"{_GOOGLE_EVENTS_URI.format(cal=calendar_id)}/{event_id}"
        async with httpx.AsyncClient(timeout=10) as c:
            resp = await c.delete(url, headers={"Authorization": f"Bearer {access_token}"})
        return resp.status_code in (200, 204)


# ─── Microsoft stub ───────────────────────────────────────────────────────────

class MicrosoftCalendarProvider(CalendarProvider):
    """Stub — Microsoft Calendar support coming soon."""
    name = "microsoft"

    _MSG = "Microsoft Calendar integration coming soon. Register MicrosoftCalendarProvider in PROVIDERS when credentials are configured."

    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        raise NotImplementedError(self._MSG)

    async def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        raise NotImplementedError(self._MSG)

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        raise NotImplementedError(self._MSG)

    async def revoke_token(self, token: str) -> bool:
        raise NotImplementedError(self._MSG)

    async def get_free_busy(self, access_token, calendar_id, time_min, time_max):
        raise NotImplementedError(self._MSG)

    async def create_event(self, access_token, calendar_id, summary, start, end,
                           description="", attendee_email=""):
        raise NotImplementedError(self._MSG)

    async def delete_event(self, access_token, calendar_id, event_id):
        raise NotImplementedError(self._MSG)


# ─── Provider registry ────────────────────────────────────────────────────────

PROVIDERS: Dict[str, CalendarProvider] = {
    "google": GoogleCalendarProvider(),
    # "microsoft": MicrosoftCalendarProvider(),  # Activate when credentials ready
}


def get_provider(provider: str) -> CalendarProvider:
    p = PROVIDERS.get(provider)
    if not p:
        raise ValueError(f"Provider '{provider}' not available. Active: {list(PROVIDERS)}")
    return p


# ─── DB helpers (token CRUD) ──────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


async def store_oauth_token(
    db, user_id: str, provider: str, token_data: Dict[str, Any],
) -> None:
    """Encrypt and upsert OAuth token record."""
    now = _now()
    expires_at = now + timedelta(seconds=token_data.get("expires_in", 3600))

    doc = {
        "user_id": user_id,
        "provider": provider,
        "access_token": encrypt_token(token_data["access_token"]),
        "refresh_token": encrypt_token(token_data.get("refresh_token", "")) if token_data.get("refresh_token") else "",
        "scope": token_data.get("scope", ""),
        "expires_at": expires_at.isoformat(),
        "calendar_id": token_data.get("calendar_id", "primary"),
        "email_connected": token_data.get("email", ""),
        "connected_at": now.isoformat(),
        "last_refreshed_at": now.isoformat(),
        "status": "active",
    }
    await db.oauth_tokens.replace_one(
        {"user_id": user_id, "provider": provider},
        doc, upsert=True,
    )


async def get_oauth_token(db, user_id: str, provider: str) -> Optional[Dict[str, Any]]:
    """Retrieve decrypted token or None."""
    doc = await db.oauth_tokens.find_one(
        {"user_id": user_id, "provider": provider}, {"_id": 0},
    )
    if not doc or doc.get("status") == "revoked":
        return None
    return doc


async def get_valid_access_token(db, user_id: str, provider: str) -> Optional[str]:
    """Return valid (possibly refreshed) access token or None."""
    doc = await get_oauth_token(db, user_id, provider)
    if not doc:
        return None

    expires_at = doc.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        # Refresh if <5 min remaining
        if expires_at - _now() < timedelta(minutes=5):
            try:
                refresh_token = decrypt_token(doc["refresh_token"]) if doc.get("refresh_token") else ""
                if not refresh_token:
                    return None
                prov = get_provider(provider)
                new_tokens = await prov.refresh_access_token(refresh_token)
                new_expires = _now() + timedelta(seconds=new_tokens.get("expires_in", 3600))
                await db.oauth_tokens.update_one(
                    {"user_id": user_id, "provider": provider},
                    {"$set": {
                        "access_token": encrypt_token(new_tokens["access_token"]),
                        "expires_at": new_expires.isoformat(),
                        "last_refreshed_at": _now().isoformat(),
                        "status": "active",
                    }},
                )
                return new_tokens["access_token"]
            except Exception as e:
                log.warning(f"[oauth] refresh failed for {user_id}/{provider}: {e}")
                return None

    try:
        return decrypt_token(doc["access_token"])
    except Exception:
        return None


async def refresh_all_expiring_tokens(db) -> int:
    """APScheduler job: refresh all tokens expiring in the next 30 min."""
    soon = (_now() + timedelta(minutes=30)).isoformat()
    count = 0
    async for doc in db.oauth_tokens.find(
        {"status": "active", "expires_at": {"$lte": soon}}, {"_id": 0},
    ):
        user_id = doc["user_id"]
        provider = doc["provider"]
        try:
            await get_valid_access_token(db, user_id, provider)
            count += 1
        except Exception as e:
            log.warning(f"[oauth_refresh] {user_id}/{provider}: {e}")
    return count


# ─── CSRF state store ─────────────────────────────────────────────────────────

_csrf_states: Dict[str, Dict[str, str]] = {}  # state → {user_id, provider, ts}


def generate_csrf_state(user_id: str, provider: str) -> str:
    state = secrets.token_urlsafe(32)
    _csrf_states[state] = {"user_id": user_id, "provider": provider, "ts": _now().isoformat()}
    # Cleanup old states
    cutoff = (_now() - timedelta(hours=1)).isoformat()
    expired = [k for k, v in _csrf_states.items() if v["ts"] < cutoff]
    for k in expired:
        _csrf_states.pop(k, None)
    return state


def consume_csrf_state(state: str) -> Optional[Dict[str, str]]:
    return _csrf_states.pop(state, None)


# ─── ICS helper ──────────────────────────────────────────────────────────────

def _build_ics(summary: str, start: datetime, end: datetime, description: str = "") -> str:
    fmt = "%Y%m%dT%H%M%SZ"
    uid = str(uuid.uuid4())
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DesarrollosMX//Calendar//ES",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTART:{start.strftime(fmt)}",
        f"DTEND:{end.strftime(fmt)}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines)


# ─── DB Indexes ───────────────────────────────────────────────────────────────

async def ensure_oauth_indexes(db):
    await db.oauth_tokens.create_index(
        [("user_id", 1), ("provider", 1)], unique=True, background=True,
    )
    await db.oauth_tokens.create_index("expires_at", background=True)
    await db.oauth_tokens.create_index("status", background=True)
    await db.availability_cache.create_index(
        [("project_id", 1), ("date_key", 1)], background=True,
    )
    await db.availability_cache.create_index("expires_at", background=True)
    await db.appointment_policies.create_index("project_id", unique=True, background=True)
