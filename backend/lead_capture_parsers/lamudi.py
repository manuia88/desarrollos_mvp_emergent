"""W5.ASR.5 Parte 1 — Parser Lamudi.

Detecta y extrae datos de leads provenientes de notificaciones Lamudi México.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional


class LamudiParser:
    parser_name = "lamudi"

    _FROM_SIGNALS = (
        "notifications@lamudi.com.mx",
        "noreply@lamudi.com.mx",
        "no-reply@lamudi.com.mx",
        "leads@lamudi.com.mx",
        "contacto@lamudi.com.mx",
    )
    _DOMAIN_SIGNAL = "lamudi.com.mx"
    _BRAND_SIGNAL = "lamudi"

    def match(self, raw_email: dict) -> bool:
        from_h = (raw_email.get("from") or raw_email.get("sender") or "").lower()
        subject = (raw_email.get("subject") or "").lower()
        body = (raw_email.get("html") or raw_email.get("text") or "").lower()

        if any(sig in from_h for sig in self._FROM_SIGNALS):
            return True
        if self._DOMAIN_SIGNAL in from_h:
            return True
        if self._DOMAIN_SIGNAL in body:
            return True
        # Subject como señal secundaria
        if self._BRAND_SIGNAL in subject and "contacto" in subject:
            return True
        return False

    def extract(self, raw_email: dict) -> Optional[Dict[str, Any]]:
        html = raw_email.get("html") or ""
        text = raw_email.get("text") or ""
        combined = html + "\n" + text

        name = self._extract_name(combined)
        email = self._extract_email(combined)
        phone = self._extract_phone(combined)
        message = self._extract_message(combined)
        listing_id = self._extract_listing_id(combined)
        listing_url = self._extract_listing_url(combined)

        if not email and not phone:
            return None

        return {
            "name": name,
            "email": email,
            "phone": phone,
            "message": message,
            "listing_id": listing_id,
            "listing_url": listing_url,
        }

    # ── Extractores ─────────────────────────────────────────────────────────

    def _extract_name(self, content: str) -> Optional[str]:
        patterns = [
            r"Nombre[:\s]+([^\n<]{2,80})",
            r"Nombre completo[:\s]+([^\n<]{2,80})",
            r"Name[:\s]+([^\n<]{2,80})",
            r"Contacto[:\s]+([^\n<]{2,80})",
        ]
        for pat in patterns:
            m = re.search(pat, content, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                if val:
                    return val[:100]
        return None

    def _extract_email(self, content: str) -> Optional[str]:
        EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
        for m in EMAIL_RE.finditer(content):
            email = m.group(0).lower()
            if "lamudi" not in email:
                return email
        return None

    def _extract_phone(self, content: str) -> Optional[str]:
        patterns = [
            r"(?:Tel[eé]fono|Cel[ular]*|M[oó]vil|Phone|Tel)[:\s]+([+\d\s\-\.\(\)]{7,20})",
            r"\b(\+?52[\s\-]?[1-9]\d{2}[\s\-]?\d{3}[\s\-]?\d{4})\b",
            r"\b(\+?52[\s\-]?[1-9]\d{9})\b",
            r"\b([1-9]\d{9})\b",
        ]
        for pat in patterns:
            m = re.search(pat, content, re.IGNORECASE)
            if m:
                raw = m.group(1).strip()
                cleaned = re.sub(r"[\s\-\.\(\)]", "", raw)
                if len(cleaned) >= 7:
                    return cleaned[:20]
        return None

    def _extract_message(self, content: str) -> Optional[str]:
        patterns = [
            r"Mensaje[:\s]+([^\n<]{5,500})",
            r"Comentario[:\s]+([^\n<]{5,500})",
            r"Consulta[:\s]+([^\n<]{5,500})",
            r"Descripci[oó]n[:\s]+([^\n<]{5,500})",
        ]
        for pat in patterns:
            m = re.search(pat, content, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                if len(val) >= 5:
                    return val[:500]
        return None

    def _extract_listing_id(self, content: str) -> Optional[str]:
        patterns = [
            r"lamudi\.com\.mx/[^/]+/[^/]+/(\d{5,12})",
            r"lamudi\.com\.mx/[^/]+/(\d{5,12})(?:\?|#|$|\.html)",
            r"propiedad[_\-]?id[:\s]+(\d{5,12})",
            r"listing[_\-]?id[:\s]+(\d{5,12})",
        ]
        for pat in patterns:
            m = re.search(pat, content, re.IGNORECASE)
            if m:
                return m.group(1)
        return None

    def _extract_listing_url(self, content: str) -> Optional[str]:
        m = re.search(
            r"https?://[^\s\"'<>]*lamudi\.com\.mx[^\s\"'<>]*",
            content,
            re.IGNORECASE,
        )
        return m.group(0)[:500] if m else None
