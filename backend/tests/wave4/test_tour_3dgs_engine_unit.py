"""Wave 4 · Tests tour_3dgs_engine.py · 10 tests unidad sin DB.

Cubre helpers PUROS (no async · no Mongo · no Luma red):
- ALLOWED_FORMATS / ALLOWED_UPLOAD_EXTS catalog
- DEFAULT_VIEWER_CONFIG / DEFAULT_SETTINGS structure
- hash_ip (LFPDPPP salt · deterministic · 32-char hex)
- scan_dir (path under STORAGE_BASE · mkdir idempotent)
- _asset_url templating
- resolve_asset_path whitelist (rechaza ext no permitidas)
- _now_iso (ISO format con timezone)

NO testea register_scan/upload_local_scan/process_scan_async (async + Luma red).
"""
import pytest

from tour_3dgs_engine import (
    ALLOWED_FORMATS,
    ALLOWED_UPLOAD_EXTS,
    DEFAULT_SETTINGS,
    DEFAULT_VIEWER_CONFIG,
    MAX_UPLOAD_MB,
    STORAGE_BASE,
    _asset_url,
    _now_iso,
    hash_ip,
    resolve_asset_path,
    scan_dir,
)

pytestmark = pytest.mark.unit


# ─── ALLOWED_FORMATS / ALLOWED_UPLOAD_EXTS ───────────────────────────────────


def test_allowed_formats_canonical_set():
    """ALLOWED_FORMATS = {luma, polycam, upload_ply/spz/splat}."""
    assert ALLOWED_FORMATS == {
        "luma", "polycam", "upload_ply", "upload_spz", "upload_splat"
    }


def test_allowed_upload_exts_canonical():
    """ALLOWED_UPLOAD_EXTS = {ply, spz, splat}."""
    assert ALLOWED_UPLOAD_EXTS == {"ply", "spz", "splat"}


def test_max_upload_mb_positive():
    """MAX_UPLOAD_MB > 0 y razonable (<=1GB)."""
    assert 0 < MAX_UPLOAD_MB <= 1024


# ─── DEFAULT_VIEWER_CONFIG / DEFAULT_SETTINGS ────────────────────────────────


def test_default_viewer_config_has_camera_keys():
    """DEFAULT_VIEWER_CONFIG tiene camera_init_position/target/floor_y."""
    required = {"camera_init_position", "camera_init_target", "floor_y",
                "auto_rotate", "auto_rotate_speed", "exposure"}
    assert required.issubset(DEFAULT_VIEWER_CONFIG.keys())


def test_default_settings_keys():
    """DEFAULT_SETTINGS canónicos para 3DGS tour."""
    required = {"default_viewer_theme", "default_ui_mode",
                "enable_public_iframe", "embed_branding"}
    assert required.issubset(DEFAULT_SETTINGS.keys())


# ─── hash_ip (LFPDPPP compliance) ────────────────────────────────────────────


def test_hash_ip_deterministic():
    """Mismo IP → mismo hash (deterministic)."""
    h1 = hash_ip("192.168.1.1")
    h2 = hash_ip("192.168.1.1")
    assert h1 == h2


def test_hash_ip_different_ips():
    """IPs distintos → hashes distintos."""
    h1 = hash_ip("192.168.1.1")
    h2 = hash_ip("192.168.1.2")
    assert h1 != h2


def test_hash_ip_length_32():
    """hash_ip retorna primer 32 chars de sha256 hex."""
    h = hash_ip("8.8.8.8")
    assert len(h) == 32
    assert all(c in "0123456789abcdef" for c in h)


# ─── scan_dir ─────────────────────────────────────────────────────────────────


def test_scan_dir_under_storage_base(tmp_path, monkeypatch):
    """scan_dir genera path bajo STORAGE_BASE."""
    p = scan_dir("test-scan-id-123")
    assert str(p).startswith(str(STORAGE_BASE))
    assert p.name == "test-scan-id-123"
    assert p.exists()  # mkdir idempotent


# ─── _asset_url ───────────────────────────────────────────────────────────────


def test_asset_url_format():
    """_asset_url genera /api/tour-3dgs/scans/{id}/asset/scene.{ext}."""
    url = _asset_url("scan-001", "splat")
    assert url == "/api/tour-3dgs/scans/scan-001/asset/scene.splat"


def test_asset_url_supports_all_extensions():
    """_asset_url admite splat/ply/spz/png."""
    for ext in ("splat", "ply", "spz", "png"):
        url = _asset_url("xxx", ext)
        assert ext in url


# ─── resolve_asset_path whitelist ────────────────────────────────────────────


def test_resolve_asset_path_rejects_invalid_ext():
    """resolve_asset_path con ext no permitido → None."""
    assert resolve_asset_path("any-id", "scene", "exe") is None
    assert resolve_asset_path("any-id", "scene", "txt") is None


def test_resolve_asset_path_returns_none_when_missing():
    """resolve_asset_path con ext válido pero archivo no existe → None."""
    # ext ok (splat) pero scan_id sintético → None
    out = resolve_asset_path("nonexistent-scan-xxxxx", "scene", "splat")
    assert out is None


# ─── _now_iso ─────────────────────────────────────────────────────────────────


def test_now_iso_returns_iso_string():
    """_now_iso retorna string formato ISO con timezone."""
    s = _now_iso()
    assert isinstance(s, str)
    # ISO 8601 con +00:00 o Z
    assert "T" in s
    assert "+" in s or "Z" in s
