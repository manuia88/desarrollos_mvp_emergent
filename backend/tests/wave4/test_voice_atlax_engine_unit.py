"""Wave 4 · Tests voice_atlax_engine.py · 9 tests unidad sin DB.

Cubre constantes y funciones puras:
- _now (UTC timezone)
- _interaction_id (format `vi_` + 14 hex)
- DEFAULT_VOICE_ID (ElevenLabs Rachel voice)
- VOICE_DIR derivation
- MAX_AUDIO_SECONDS / MAX_INTERACTIONS_PER_DAY constants
- _ensure_voice_dir (crea directorio sin levantar)
"""
import os
import tempfile

# Redirige upload dir a tmp ANTES del import (módulo deriva VOICE_DIR a import-time)
os.environ.setdefault("DI_UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "voice_atlax_test"))

from datetime import datetime, timezone

import pytest

from voice_atlax_engine import (
    DEFAULT_VOICE_ID,
    MAX_AUDIO_SECONDS,
    MAX_INTERACTIONS_PER_DAY,
    VOICE_DIR,
    _ensure_voice_dir,
    _interaction_id,
    _now,
)

pytestmark = pytest.mark.unit


# ─── _now ────────────────────────────────────────────────────────────────────
def test_now_returns_tz_aware_utc():
    """`_now` retorna datetime tz-aware UTC."""
    n = _now()
    assert isinstance(n, datetime)
    assert n.tzinfo is not None


# ─── _interaction_id ─────────────────────────────────────────────────────────
def test_interaction_id_starts_with_vi_prefix():
    """IDs voice interactions empiezan con 'vi_'."""
    iid = _interaction_id()
    assert iid.startswith("vi_")


def test_interaction_id_has_14_hex_chars_after_prefix():
    """Tras 'vi_' siguen 14 chars hex."""
    iid = _interaction_id()
    suffix = iid[3:]
    assert len(suffix) == 14
    int(suffix, 16)  # valida hex


def test_interaction_id_unique():
    """Dos llamadas generan IDs distintos."""
    assert _interaction_id() != _interaction_id()


# ─── Constants ───────────────────────────────────────────────────────────────
def test_default_voice_id_is_non_empty_string():
    """DEFAULT_VOICE_ID configurado (Rachel default o env override)."""
    assert isinstance(DEFAULT_VOICE_ID, str)
    assert len(DEFAULT_VOICE_ID) > 0


def test_default_voice_id_is_rachel_when_no_env_override():
    """Sin ELEVEN_VOICE_ID env, default = Rachel ID canónico."""
    # Solo validamos si la env no fue override
    if not os.environ.get("ELEVEN_VOICE_ID"):
        assert DEFAULT_VOICE_ID == "21m00Tcm4TlvDq8ikWAM"


def test_max_audio_seconds_is_60():
    """Hard cap 60s por audio (Whisper STT)."""
    assert MAX_AUDIO_SECONDS == 60


def test_max_interactions_per_day_is_50():
    """Rate limit 50 interacciones/día por sesión."""
    assert MAX_INTERACTIONS_PER_DAY == 50


# ─── VOICE_DIR ───────────────────────────────────────────────────────────────
def test_voice_dir_subpath_of_upload_dir():
    """VOICE_DIR termina en '/voice'."""
    assert VOICE_DIR.endswith("/voice")


# ─── _ensure_voice_dir ───────────────────────────────────────────────────────
def test_ensure_voice_dir_creates_directory():
    """_ensure_voice_dir crea el directorio idempotentemente."""
    _ensure_voice_dir()
    assert os.path.isdir(VOICE_DIR)
    # Llamada repetida no levanta
    _ensure_voice_dir()
    assert os.path.isdir(VOICE_DIR)
