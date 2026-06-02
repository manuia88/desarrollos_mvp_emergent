"""
Cerebro DMX · Etapa 0 — MEMORIA GOBERNADA (el sustrato del Modelo del Mundo)
============================================================================
La memoria compartida que todos los agentes leen/escriben — pero SIEMPRE atada
a una org (tenant) y con gobierno: retención (TTL) + redacción de PII. Es el
"recuerda todo" del framework, hecho seguro. Etapa 0 = la interfaz + el candado;
el contenido rico (embeddings del Modelo del Mundo) crece en etapas posteriores.

Scopes de memoria (qué tipo de recuerdo es):
  - "lead"   : lo que el Cerebro sabe de un lead (perfil, señales)
  - "buyer"  : preferencias/gusto del comprador (alimenta el taste model)
  - "project": estado de un proyecto del dev
  - "world"  : agregado de mercado (no-PII · base del Modelo del Mundo)
"""
import re
from datetime import datetime, timezone, timedelta
from .contract import CEREBRO_MEMORY
from .guardrails import tenant_of

# Retención por scope (días). "world" no expira (agregado de mercado).
RETENTION_DAYS = {"lead": 365, "buyer": 540, "project": 730, "world": None}

# PII a redactar antes de guardar en memoria de agente (no guardamos crudo lo
# sensible: emails, teléfonos MX, RFC, CURP). El dato "duro" vive en su colección
# original; la memoria del Cerebro guarda señales, no PII.
_PII_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
    (re.compile(r"(?:\+?52\s?)?(?:\d[\s-]?){10}"), "[tel]"),
    (re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b"), "[rfc]"),
]


def redact_pii(value):
    """Reemplaza PII en strings (recursivo en dict/list). Defensa de privacidad."""
    if isinstance(value, str):
        out = value
        for pat, repl in _PII_PATTERNS:
            out = pat.sub(repl, out)
        return out
    if isinstance(value, dict):
        return {k: redact_pii(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_pii(v) for v in value]
    return value


def _now():
    return datetime.now(timezone.utc)


async def ensure_memory_indexes(db):
    col = db[CEREBRO_MEMORY]
    await col.create_index([("tenant_id", 1), ("scope", 1), ("key", 1)], unique=True)
    try:
        await col.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass


async def remember(db, user, *, scope, key, value, redact=True):
    """Escribe un recuerdo, atado a la org, con retención y PII redactada."""
    tid = tenant_of(user)
    now = _now()
    safe = redact_pii(value) if redact else value
    doc = {"tenant_id": tid, "scope": scope, "key": key, "value": safe, "updated_at": now.isoformat()}
    days = RETENTION_DAYS.get(scope)
    if days:
        doc["expires_at"] = now + timedelta(days=days)
    await db[CEREBRO_MEMORY].update_one(
        {"tenant_id": tid, "scope": scope, "key": key},
        {"$set": doc, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True,
    )
    return {"ok": True}


async def recall(db, user, *, scope, key):
    """Lee un recuerdo SOLO de la org del usuario (candado #1)."""
    return await db[CEREBRO_MEMORY].find_one(
        {"tenant_id": tenant_of(user), "scope": scope, "key": key}, {"_id": 0}
    )
