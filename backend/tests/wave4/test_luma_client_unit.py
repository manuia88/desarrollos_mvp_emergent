"""Wave 4 · Tests luma_client.py · 8 tests unidad sin red.

Cubre stub mode (env LUMA_API_KEY ausente → mock data) sin HTTP real:
- is_stub_mode (basado en LUMA_API_KEY presence)
- create_scan stub → retorna mock dict canónico
- get_scan_status stub → status=ready + stub URLs
- download_assets stub → escribe placeholder files
- _mock_scan shape (id, name, state)

NO testea path con API key real (requiere LUMA_API_KEY + red Luma).
NO testea _retry (requires HTTP mocking).
"""
from pathlib import Path

import pytest

import luma_client
from luma_client import (
    _mock_scan,
)

pytestmark = pytest.mark.unit


# ─── is_stub_mode ─────────────────────────────────────────────────────────────


def test_is_stub_mode_when_no_key(monkeypatch):
    """LUMA_API_KEY ausente → stub mode True."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    assert luma_client.is_stub_mode() is True


def test_is_stub_mode_when_key_present(monkeypatch):
    """LUMA_API_KEY presente → stub mode False."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "fake-key-abc123")
    assert luma_client.is_stub_mode() is False


# ─── _mock_scan ───────────────────────────────────────────────────────────────


def test_mock_scan_shape():
    """_mock_scan retorna dict con id/name/state/url stubs."""
    m = _mock_scan("test-unit-001")
    assert "id" in m
    assert m["name"] == "test-unit-001"
    assert m["state"] == "queued"
    assert m["id"].startswith("mock-luma-")


# ─── create_scan stub ────────────────────────────────────────────────────────


def test_create_scan_stub_returns_mock(monkeypatch):
    """create_scan en stub mode → dict con luma_scan_id + _stub=True."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    out = luma_client.create_scan(name="unit_test", capture_video_url=None)
    assert "luma_scan_id" in out
    assert out["status"] == "processing"
    assert out.get("_stub") is True


def test_create_scan_stub_with_video_url(monkeypatch):
    """create_scan stub funciona con o sin video_url."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    out = luma_client.create_scan(name="test", capture_video_url="https://x.com/y.mp4")
    assert out.get("_stub") is True
    assert "luma_scan_id" in out


# ─── get_scan_status stub ────────────────────────────────────────────────────


def test_get_scan_status_stub_returns_ready(monkeypatch):
    """get_scan_status stub → status='ready' + URLs sintéticas."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    out = luma_client.get_scan_status("any-luma-id")
    assert out["status"] == "ready"
    assert out.get("_stub") is True


def test_get_scan_status_stub_urls_for_all_formats(monkeypatch):
    """Stub status incluye URLs para splat/ply/spz/png."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    out = luma_client.get_scan_status("scan-x")
    assert out.get("splat_url", "").endswith(".splat")
    assert out.get("ply_url", "").endswith(".ply")
    assert out.get("spz_url", "").endswith(".spz")
    assert out.get("thumbnail_url", "").endswith(".png")


# ─── download_assets stub ────────────────────────────────────────────────────


def test_download_assets_stub_writes_placeholders(tmp_path, monkeypatch):
    """download_assets stub escribe archivos placeholder en target_dir."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    target = tmp_path / "test-scan"
    out = luma_client.download_assets("any-scan-id", target)
    # 4 formatos: splat/ply/spz/png
    assert set(out.keys()) == {"splat", "ply", "spz", "png"}
    # Cada archivo existe
    for fmt, path in out.items():
        p = Path(path)
        assert p.exists()
        assert p.stat().st_size > 0


def test_download_assets_stub_filenames_canonical(tmp_path, monkeypatch):
    """Stub usa nombres canónicos: scene.splat/ply/spz · thumbnail.png."""
    monkeypatch.setattr(luma_client, "LUMA_API_KEY", "")
    target = tmp_path / "scan-test-001"
    out = luma_client.download_assets("any", target)
    assert Path(out["splat"]).name == "scene.splat"
    assert Path(out["ply"]).name == "scene.ply"
    assert Path(out["spz"]).name == "scene.spz"
    assert Path(out["png"]).name == "thumbnail.png"
