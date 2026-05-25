"""W7.AS.3.E (R2) — Conversation A/B Testing (ML loop).

Módulo PURO importable por conversation_engine (opcional). NO crea routes (la
UI se difiere a Round 3 · Terminal D NO añade routes para esto). NO toca
server/engine/asistente/UI.

Modelo: un test corre 2 system_prompts en paralelo, asignados 50/50 random
(determinista por conversación). Métrica primaria = lead_conversion. La
significancia estadística usa chi² (reusa W5.22 Z.8 A/B engine). El superadmin
elige ganador manualmente, o se auto-elige si chi² es significativo (p<0.05) y
n>=100.

Funciones públicas (4 "endpoints" superadmin, sin FastAPI):
  - create_test(db, name, prompt_a, prompt_b, tenant_id=None, split_pct=50) -> dict
  - list_tests(db, tenant_id=None) -> list
  - get_results(db, test_id) -> dict
  - pick_winner(db, test_id, variant=None) -> dict   (manual o auto)

Helpers de runtime (los invoca el engine, no superadmin):
  - assign(test_id, user_id, split_pct=50) -> "A"|"B"
  - record_event(db, test_id, variant, converted=False) -> None
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.conversation_ab")

AUTO_WINNER_MIN_N = 100     # n total mínimo para auto-pick


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _test_id() -> str:
    return f"abtest_{secrets.token_urlsafe(8)}"


# ─── Reuse W5.22 Z.8 A/B stat-sig (con fallback local autocontenido) ─────────

def _assign_variant(user_id: str, experiment_key: str, split_pct: int = 50) -> str:
    """Bucket determinista 50/50. Reusa ab_testing_engine; fallback local."""
    try:
        from ab_testing_engine import assign_variant
        return assign_variant(user_id, experiment_key, split_pct)
    except Exception:
        import hashlib
        if not user_id or not experiment_key:
            return "A"
        try:
            sp = max(0, min(100, int(split_pct)))
        except Exception:
            sp = 50
        h = hashlib.sha256(f"{user_id}:{experiment_key}".encode("utf-8")).hexdigest()
        return "A" if (int(h[:8], 16) % 100) < sp else "B"


def _chi_square(a_users: int, a_events: int, b_users: int, b_events: int) -> Dict[str, Any]:
    """chi² 2x2 sobre conversión. Reusa ab_testing_engine; fallback local."""
    try:
        from ab_testing_engine import _chi_square_significance
        return _chi_square_significance(a_users, a_events, b_users, b_events)
    except Exception:
        if min(a_users, b_users) < 30:
            return {"state": "insufficient_data", "min_per_arm": 30}
        a_no = max(0, a_users - a_events)
        b_no = max(0, b_users - b_events)
        total = a_users + b_users
        row1 = a_events + b_events
        row0 = a_no + b_no
        if row1 == 0 or row0 == 0 or total == 0:
            return {"state": "insufficient_data"}
        obs = [[a_events, a_no], [b_events, b_no]]
        chi2 = 0.0
        for i, row_total in enumerate((row1, row0)):
            for j, col_total in enumerate((a_users, b_users)):
                expected = (row_total * col_total) / total
                if expected <= 0:
                    continue
                chi2 += ((obs[i][j] - expected) ** 2) / expected
        crit = 3.84
        return {"state": "ok", "chi2": round(chi2, 3),
                "critical_value": crit, "significant": chi2 > crit}


# ─── Public API ──────────────────────────────────────────────────────────────

async def create_test(db, name: str, prompt_a: str, prompt_b: str,
                      tenant_id: Optional[str] = None, split_pct: int = 50) -> Dict[str, Any]:
    """Crea un A/B test de 2 system_prompts. Retorna el doc creado (sin _id)."""
    tid = _test_id()
    doc = {
        "_id": tid,
        "test_id": tid,
        "name": name,
        "tenant_id": tenant_id,
        "split_pct": int(split_pct),
        "status": "running",
        "variants": {
            "A": {"prompt": prompt_a, "users": 0, "conversions": 0},
            "B": {"prompt": prompt_b, "users": 0, "conversions": 0},
        },
        "winner": None,
        "created_at": _now(),
    }
    try:
        await db.conversation_ab_tests.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[ab] create_test persist fail: {exc}")
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


async def list_tests(db, tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lista los tests (opcionalmente filtra por tenant). FAIL-OPEN → []."""
    try:
        q: Dict[str, Any] = {}
        if tenant_id is not None:
            q["tenant_id"] = tenant_id
        cur = db.conversation_ab_tests.find(q, {"_id": 0})
        return [t async for t in cur]
    except Exception as exc:
        log.warning(f"[ab] list_tests fail-open: {exc}")
        return []


def assign(test_id: str, user_id: str, split_pct: int = 50) -> str:
    """Asigna la conversación/usuario a la variante A o B (determinista)."""
    return _assign_variant(user_id, test_id, split_pct)


async def record_event(db, test_id: str, variant: str, converted: bool = False) -> None:
    """Incrementa contadores de la variante (lo invoca el engine). Best-effort."""
    v = "A" if str(variant).upper() != "B" else "B"
    inc = {f"variants.{v}.users": 1}
    if converted:
        inc[f"variants.{v}.conversions"] = 1
    try:
        await db.conversation_ab_tests.update_one({"_id": test_id}, {"$inc": inc})
    except Exception as exc:
        log.debug(f"[ab] record_event skip: {exc}")


def _stats_from_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    variants = doc.get("variants") or {}
    a = variants.get("A") or {}
    b = variants.get("B") or {}
    a_u, a_c = int(a.get("users", 0)), int(a.get("conversions", 0))
    b_u, b_c = int(b.get("users", 0)), int(b.get("conversions", 0))
    sig = _chi_square(a_u, a_c, b_u, b_c)
    return {
        "test_id": doc.get("test_id"),
        "status": doc.get("status"),
        "A": {"users": a_u, "conversions": a_c,
              "rate": round(a_c / a_u, 4) if a_u else 0.0},
        "B": {"users": b_u, "conversions": b_c,
              "rate": round(b_c / b_u, 4) if b_u else 0.0},
        "n_total": a_u + b_u,
        "statistical_significance": sig,
        "winner": doc.get("winner"),
    }


async def get_results(db, test_id: str) -> Dict[str, Any]:
    """Resultados + chi² del test. FAIL-OPEN → {error}."""
    try:
        doc = await db.conversation_ab_tests.find_one({"_id": test_id})
        if not doc:
            return {"error": "not_found", "test_id": test_id}
        return _stats_from_doc(doc)
    except Exception as exc:
        log.warning(f"[ab] get_results fail-open: {exc}")
        return {"error": "internal", "test_id": test_id}


async def pick_winner(db, test_id: str, variant: Optional[str] = None) -> Dict[str, Any]:
    """Elige ganador. Manual si `variant` ∈ {A,B}; si None, auto sólo cuando
    chi² es significativo (p<0.05) y n>=100. FAIL-OPEN.
    """
    try:
        doc = await db.conversation_ab_tests.find_one({"_id": test_id})
        if not doc:
            return {"error": "not_found", "test_id": test_id}

        stats = _stats_from_doc(doc)

        # Manual.
        if variant is not None:
            v = str(variant).upper()
            if v not in ("A", "B"):
                return {"error": "invalid_variant", "test_id": test_id}
            await db.conversation_ab_tests.update_one(
                {"_id": test_id},
                {"$set": {"winner": v, "status": "completed", "decided_at": _now(),
                          "decision": "manual"}},
            )
            return {"test_id": test_id, "winner": v, "mode": "manual"}

        # Auto.
        sig = stats["statistical_significance"]
        n_total = stats["n_total"]
        if sig.get("state") == "ok" and sig.get("significant") and n_total >= AUTO_WINNER_MIN_N:
            winner = "A" if stats["A"]["rate"] >= stats["B"]["rate"] else "B"
            await db.conversation_ab_tests.update_one(
                {"_id": test_id},
                {"$set": {"winner": winner, "status": "completed",
                          "decided_at": _now(), "decision": "auto"}},
            )
            return {"test_id": test_id, "winner": winner, "mode": "auto",
                    "chi2": sig.get("chi2"), "n_total": n_total}

        return {"test_id": test_id, "winner": None, "mode": "auto",
                "reason": "not_significant_or_insufficient_n", "n_total": n_total,
                "statistical_significance": sig}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[ab] pick_winner fail-open: {exc}")
        return {"error": "internal", "test_id": test_id}
