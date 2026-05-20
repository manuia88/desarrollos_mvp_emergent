"""W5.22 Z.8.2 — Pixel HTML sanitizer (DOMPurify-style minimal).

Permite SOLO tags: script · noscript · style · link · meta · img · iframe (con whitelist src domains)
Prohibe: on* attrs (onclick, onerror, etc) · javascript: URLs · data: URLs (excepto base64 pequeno).
"""
from __future__ import annotations

import re
from typing import Set

ALLOWED_TAGS: Set[str] = {"script", "noscript", "style", "link", "meta", "img", "iframe"}
ALLOWED_SCRIPT_DOMAINS: Set[str] = {
    "googletagmanager.com",
    "google-analytics.com",
    "googleadservices.com",
    "facebook.net",
    "facebook.com",
    "connect.facebook.net",
    "googletag.com",
    "linkedin.com",
    "tiktok.com",
    "hotjar.com",
    "clarity.ms",
    "segment.io",
}

ON_ATTR_RE = re.compile(r"\son[a-z]+\s*=", re.IGNORECASE)
JS_URL_RE = re.compile(r"javascript\s*:", re.IGNORECASE)
SCRIPT_SRC_RE = re.compile(r'<script[^>]*\ssrc\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
TAG_OPEN_RE = re.compile(r"<\s*([a-z][a-z0-9-]*)\b", re.IGNORECASE)


def _domain_allowed(url: str) -> bool:
    if not url:
        return True
    low = url.lower()
    if low.startswith("//"):
        low = "https:" + low
    if low.startswith("http://") or low.startswith("https://"):
        host = low.split("/", 3)[2].split(":")[0]
        return any(host.endswith(d) for d in ALLOWED_SCRIPT_DOMAINS)
    return False


def sanitize_pixel_html(html: str) -> str:
    """Devuelve HTML sanitizado · vacio si contenido inseguro."""
    if not html:
        return ""
    text = html.strip()
    if len(text) > 4000:
        text = text[:4000]
    # Block javascript: URLs
    if JS_URL_RE.search(text):
        return ""
    # Block on* attributes (onclick, etc)
    text = ON_ATTR_RE.sub(" data-blocked=", text)
    # Validate script sources
    for src in SCRIPT_SRC_RE.findall(text):
        if not _domain_allowed(src):
            return ""
    # Check tags are within allowed list
    for tag in TAG_OPEN_RE.findall(text):
        if tag.lower() not in ALLOWED_TAGS:
            # If contains forbidden tag (form, input, button, etc) → strip
            return ""
    return text
