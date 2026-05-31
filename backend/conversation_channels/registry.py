"""Registro central de canales (omnicanal · 2026-05-31).

UN solo lugar para definir un canal: su etiqueta, ícono, color, si es mensajería directa
(vive en whatsapp_messages) y cómo saber si está conectado. Agregar un canal = una entrada
aquí + su adapter .py. Lo consumen: los adaptadores, DM_CHANNELS, las stats y el frontend
(vía GET /api/asesor/channels). Per regla 'estado final': todos existen hoy, se autollenan
al conectar el proveedor.
"""
from __future__ import annotations

from typing import Any, Dict, List

from . import whatsapp_stub, messenger, instagram, linkedin, tiktok, youtube

# orden = orden de los chips en la bandeja
CHANNELS: List[Dict[str, Any]] = [
    {"key": "whatsapp",  "label": "WhatsApp",  "emoji": "💬", "color": "#1FA06A", "dm": True,  "mod": whatsapp_stub},
    {"key": "messenger", "label": "Messenger", "emoji": "📘", "color": "#0084FF", "dm": True,  "mod": messenger},
    {"key": "instagram", "label": "Instagram", "emoji": "📷", "color": "#C13584", "dm": True,  "mod": instagram},
    {"key": "linkedin",  "label": "LinkedIn",  "emoji": "💼", "color": "#0A66C2", "dm": True,  "mod": linkedin},
    {"key": "tiktok",    "label": "TikTok",    "emoji": "🎵", "color": "#111111", "dm": True,  "mod": tiktok},
    {"key": "youtube",   "label": "YouTube",   "emoji": "▶️", "color": "#FF0000", "dm": True,  "mod": youtube},
    {"key": "ai",        "label": "Atlax",     "emoji": "🤖", "color": "#5B37E0", "dm": False, "mod": None},
]

# canales de mensajería directa (sus mensajes viven en whatsapp_messages con campo `channel`)
DM_CHANNEL_KEYS = [c["key"] for c in CHANNELS if c["dm"]]


def _connected(c: Dict[str, Any]) -> bool:
    mod = c.get("mod")
    if c["key"] == "whatsapp":
        import os
        return os.environ.get("WHATSAPP_PROVIDER", "stub").lower() not in ("stub", "")
    if mod and hasattr(mod, "is_connected"):
        try:
            return bool(mod.is_connected())
        except Exception:
            return False
    return c["key"] == "ai"  # el chat IA siempre "disponible"


def public_channels() -> List[Dict[str, Any]]:
    """Para el frontend: metadata + estado de conexión (sin el módulo)."""
    return [{"key": c["key"], "label": c["label"], "emoji": c["emoji"], "color": c["color"],
             "dm": c["dm"], "connected": _connected(c)} for c in CHANNELS]
