"""W4.7 Y.4B — Match Weights Adaptive Engine.

Cada org aprende sus propios pesos de matching lead↔proyecto a partir de datos
reales de conversión. Una org boutique aprende "el segmento pesa más para mis
leads"; otra aprende "la zona pesa más".

Collection: match_weights_per_org (UNIQUE por org_id)

Schema:
  { _id, org_id, weights {zona, precio, segment, amenidades, timing,
    behavioral_intent, disc_match}, sum_to_100 (validation), last_tuned_at,
    tuning_confidence (0-100), training_sample_size, version (auto-increment),
    is_default (bool), audit_log: [{changed_at, changed_by_user_id?,
    changed_by_system (bool), prev_weights, new_weights, reason}] }

Phase Y guard: master_switch + tier match_weights_adaptive ≥ T1 (read) / T2 (write)
Caps:
  - 1 auto-tune / semana automático
  - 5 manual changes / día / org T2+
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.agentic_crm.match_weights")

# ─── Defaults ─────────────────────────────────────────────────────────────────
DEFAULT_WEIGHTS: Dict[str, float] = {
    "zona":               0.30,
    "precio":             0.25,
    "segment":            0.20,
    "amenidades":         0.15,
    "timing":             0.10,
    "behavioral_intent":  0.00,
    "disc_match":         0.00,
}

ALLOWED_WEIGHT_KEYS = set(DEFAULT_WEIGHTS.keys())
MANUAL_CHANGES_CAP_PER_DAY = 5
AUTO_TUNE_MIN_INTERVAL_DAYS = 6  # evita 2 tunes en la misma semana


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sum_weights(w: Dict[str, float]) -> float:
    return sum(w.get(k, 0.0) for k in ALLOWED_WEIGHT_KEYS)


def _validate_weights(w: Dict[str, float]) -> Optional[str]:
    """Retorna mensaje de error o None si OK."""
    for k in w:
        if k not in ALLOWED_WEIGHT_KEYS:
            return f"Dimensión no reconocida: {k}"
        if not (0.0 <= w[k] <= 1.0):
            return f"Peso {k} debe estar entre 0 y 1 (recibido {w[k]})"
    total = sum(w.get(k, 0.0) for k in ALLOWED_WEIGHT_KEYS)
    if not (0.95 <= total <= 1.05):
        return (
            f"Los pesos deben sumar 1.0 ± 0.05 (suma actual: {total:.4f}). "
            "Ajusta los valores para que el total sea aproximadamente 100%."
        )
    return None


def _normalize_weights(w: Dict[str, float]) -> Dict[str, float]:
    """Normaliza para que la suma sea exactamente 1.0."""
    total = sum(w.get(k, 0.0) for k in ALLOWED_WEIGHT_KEYS)
    if total <= 0:
        return dict(DEFAULT_WEIGHTS)
    return {k: round(w.get(k, 0.0) / total, 6) for k in ALLOWED_WEIGHT_KEYS}


# ─── Engine ───────────────────────────────────────────────────────────────────
class MatchWeightsEngine:
    """Gestión de pesos de matching por org."""

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    # ── Phase Y guard ──────────────────────────────────────────────────────────
    async def _get_tier(self) -> str:
        try:
            from routes.phase_y_controls import get_phase_y_settings
            settings = await get_phase_y_settings(self.db, self.org_id)
            if not settings.get("agentic_enabled", False):
                return "disabled"
            return (settings.get("feature_tiers") or {}).get("match_weights_adaptive", "off")
        except Exception as exc:
            log.warning(f"[match_weights] tier check failed ({self.org_id}): {exc}")
            return "off"

    def _tier_num(self, tier: str) -> int:
        if not tier or tier in ("off", "disabled"):
            return 0
        try:
            return int(tier.replace("T", ""))
        except (ValueError, AttributeError):
            return 0

    # ── get_weights ───────────────────────────────────────────────────────────
    async def get_weights(self) -> Dict[str, Any]:
        """Retorna weights config del org.

        Si tier ≥ T1 y existe doc → org-specific.
        Sino → DEFAULT_WEIGHTS con is_default=True.
        """
        tier = await self._get_tier()
        if self._tier_num(tier) < 1:
            return {
                "org_id": self.org_id,
                "weights": dict(DEFAULT_WEIGHTS),
                "sum_to_100": True,
                "is_default": True,
                "last_tuned_at": None,
                "tuning_confidence": 0,
                "training_sample_size": 0,
                "version": 0,
                "tier": tier,
                "audit_log": [],
            }

        doc = await self.db.match_weights_per_org.find_one(
            {"org_id": self.org_id}, {"_id": 0},
        )
        if not doc:
            return {
                "org_id": self.org_id,
                "weights": dict(DEFAULT_WEIGHTS),
                "sum_to_100": True,
                "is_default": True,
                "last_tuned_at": None,
                "tuning_confidence": 0,
                "training_sample_size": 0,
                "version": 0,
                "tier": tier,
                "audit_log": [],
            }

        # Merge defaults for any missing keys
        merged_weights = {**DEFAULT_WEIGHTS}
        merged_weights.update(doc.get("weights") or {})
        total = _sum_weights(merged_weights)

        result = dict(doc)
        result["weights"] = merged_weights
        result["sum_to_100"] = (0.95 <= total <= 1.05)
        result.setdefault("is_default", False)
        result.setdefault("version", 0)
        result.setdefault("audit_log", [])
        result["tier"] = tier
        # Convert datetimes
        if isinstance(result.get("last_tuned_at"), datetime):
            result["last_tuned_at"] = result["last_tuned_at"].isoformat()
        return result

    # ── manual_set_weights ────────────────────────────────────────────────────
    async def manual_set_weights(
        self, weights_dict: Dict[str, float], user_id: str,
    ) -> Dict[str, Any]:
        """Upsert manual de pesos. Requiere T2+.

        Caps: 5 changes/day/org.
        Validation: sum = 1.0 ± 0.05.
        """
        tier = await self._get_tier()
        if self._tier_num(tier) < 2:
            raise MatchWeightsDisabledError(
                f"Match Weights (manual) requiere tier T2+. Tier actual: {tier or 'off'}"
            )

        # Validate
        clean = {k: float(v) for k, v in weights_dict.items() if k in ALLOWED_WEIGHT_KEYS}
        err = _validate_weights(clean)
        if err:
            raise MatchWeightsValidationError(err)

        # Daily manual cap check
        await self._check_manual_cap(user_id)

        # Get current doc for before snapshot
        before = await self._get_raw_doc()
        prev_weights = (before.get("weights") or DEFAULT_WEIGHTS).copy()
        version = int(before.get("version") or 0) + 1
        now = _now()

        audit_entry = {
            "changed_at": now.isoformat(),
            "changed_by_user_id": user_id,
            "changed_by_system": False,
            "prev_weights": prev_weights,
            "new_weights": clean,
            "reason": "manual_update",
        }

        update_doc = {
            "org_id": self.org_id,
            "weights": clean,
            "sum_to_100": True,
            "is_default": False,
            "last_tuned_at": now.isoformat(),
            "tuning_confidence": before.get("tuning_confidence", 0),
            "training_sample_size": before.get("training_sample_size", 0),
            "version": version,
            "updated_at": now.isoformat(),
        }

        await self.db.match_weights_per_org.update_one(
            {"org_id": self.org_id},
            {
                "$set": update_doc,
                "$push": {"audit_log": {"$each": [audit_entry], "$slice": -50}},
            },
            upsert=True,
        )

        try:
            from log_activity import log_activity
            await log_activity(self.db, {
                "type": "match_weights.manual_updated",
                "org_id": self.org_id,
                "user_id": user_id,
                "version": version,
                "weights": clean,
                "created_at": now,
            })
        except Exception as _e:
            log.warning("[audit] log_activity perdido (match_weights.manual_updated org %s v%s): %s",
                        self.org_id, version, _e)

        return await self.get_weights()

    # ── auto_tune ─────────────────────────────────────────────────────────────
    async def auto_tune(self) -> Dict[str, Any]:
        """Analiza últimos 50+ cierres y calcula pesos óptimos.

        Regresión logística simplificada: correlación dimensional con cierre.
        - sample_size < 30  → DEFAULT_WEIGHTS + confidence=0
        - sample_size 30-100→ blend 50/50 default + learned, confidence 30-70
        - sample_size > 100 → full learned, confidence 70-100
        """
        # Fetch closed leads with routing fit_breakdown for this org
        closed_routings, all_routings = await self._fetch_training_data()
        n_closed = len(closed_routings)
        n_total = len(all_routings)
        sample_size = n_total

        if n_closed < 5 or n_total < 30:
            return {
                "ok": True,
                "org_id": self.org_id,
                "learned_weights": dict(DEFAULT_WEIGHTS),
                "confidence": 0,
                "training_sample_size": sample_size,
                "reason": "insufficient_sample",
                "applied": False,
                "blend_ratio": 0.0,
            }

        # Compute dimensional averages for closed vs non-closed
        open_routings = [r for r in all_routings if r.get("_is_closed") is False]

        learned = self._compute_learned_weights(closed_routings, open_routings)

        # Compute confidence
        confidence = self._compute_confidence(sample_size, n_closed)

        # Blend with defaults based on sample size
        blend_ratio = self._blend_ratio(sample_size)
        final_weights = self._blend_weights(learned, dict(DEFAULT_WEIGHTS), blend_ratio)
        final_weights = _normalize_weights(final_weights)

        return {
            "ok": True,
            "org_id": self.org_id,
            "learned_weights": final_weights,
            "raw_learned_weights": learned,
            "confidence": confidence,
            "training_sample_size": sample_size,
            "n_closed": n_closed,
            "n_open": len(open_routings),
            "reason": "tuning_ok",
            "applied": False,
            "blend_ratio": round(blend_ratio, 3),
        }

    # ── apply_tuning ──────────────────────────────────────────────────────────
    async def apply_tuning(self) -> Dict[str, Any]:
        """Corre auto_tune y aplica si confidence > 50 y no hay override manual reciente.

        Respeta: 1 auto-tune/semana.
        """
        # Check cooldown
        raw_doc = await self._get_raw_doc()
        last_tuned = raw_doc.get("last_tuned_at")
        if last_tuned:
            if isinstance(last_tuned, str):
                try:
                    last_tuned = datetime.fromisoformat(last_tuned.replace("Z", "+00:00"))
                except Exception:
                    last_tuned = None
            if last_tuned:
                last_tuned_aware = (
                    last_tuned.replace(tzinfo=timezone.utc)
                    if last_tuned.tzinfo is None else last_tuned
                )
                days_since = (_now() - last_tuned_aware).total_seconds() / 86400
                if days_since < AUTO_TUNE_MIN_INTERVAL_DAYS:
                    return {
                        "ok": False,
                        "reason": "cooldown_active",
                        "days_since_last_tune": round(days_since, 1),
                        "applied": False,
                    }

        # Check for recent manual override (7 days) - if so, skip auto-apply
        manual_override = await self._recent_manual_override(days=7)

        tune_result = await self.auto_tune()
        confidence = tune_result.get("confidence", 0)
        applied = False

        if confidence > 50 and not manual_override:
            learned = tune_result.get("learned_weights") or dict(DEFAULT_WEIGHTS)
            await self._persist_tuned_weights(
                learned,
                confidence=confidence,
                sample_size=tune_result.get("training_sample_size", 0),
            )
            applied = True
            tune_result["applied"] = True
        else:
            if manual_override:
                tune_result["skip_reason"] = "manual_override_recent"
            elif confidence <= 50:
                tune_result["skip_reason"] = f"confidence_too_low ({confidence})"

        tune_result["applied"] = applied
        return tune_result

    # ── Internal helpers ──────────────────────────────────────────────────────
    async def _get_raw_doc(self) -> Dict[str, Any]:
        doc = await self.db.match_weights_per_org.find_one(
            {"org_id": self.org_id}, {"_id": 0},
        )
        return doc or {}

    async def _check_manual_cap(self, user_id: str) -> None:
        """Verifica cap de 5 cambios manuales/día/org."""
        today = _now().date().isoformat()
        count = await self.db.match_weights_per_org.count_documents(
            {"org_id": self.org_id,
             "audit_log": {"$elemMatch": {
                 "changed_by_system": False,
                 "changed_at": {"$gte": f"{today}T00:00:00"},
             }}},
        )
        # Count from embedded audit_log is not directly filterable this way,
        # so we use activity_log as the authoritative source
        since_today = datetime.fromisoformat(f"{today}T00:00:00").replace(tzinfo=timezone.utc)
        try:
            count_today = await self.db.activity_log.count_documents({
                "type": "match_weights.manual_updated",
                "org_id": self.org_id,
                "created_at": {"$gte": since_today},
            })
        except Exception:
            count_today = 0
        if count_today >= MANUAL_CHANGES_CAP_PER_DAY:
            raise MatchWeightsRateLimitError(
                f"Cap de {MANUAL_CHANGES_CAP_PER_DAY} cambios manuales/día excedido"
            )

    async def _fetch_training_data(
        self,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Obtiene routings de los últimos 180d con su estado de cierre."""
        since = _now() - timedelta(days=180)
        # Get all routings accepted/closed for this org in the period
        cur = self.db.lead_routings.find(
            {"org_id": self.org_id, "routed_at": {"$gte": since},
             "status": {"$in": ["accepted", "rejected", "reassigned"]}},
            {"_id": 0, "lead_id": 1, "fit_breakdown": 1, "status": 1},
        ).limit(500)
        routings = []
        async for r in cur:
            routings.append(r)

        if not routings:
            return [], []

        # Fetch lead status for each routing
        lead_ids = [r["lead_id"] for r in routings if r.get("lead_id")]
        lead_statuses: Dict[str, str] = {}
        if lead_ids:
            cur2 = self.db.leads.find(
                {"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "status": 1},
            ).limit(500)
            async for ld in cur2:
                lead_statuses[ld["id"]] = ld.get("status", "unknown")

        # Annotate routings with closed status
        all_annotated = []
        closed_annotated = []
        for r in routings:
            fb = r.get("fit_breakdown") or {}
            if not fb:
                continue  # skip if no breakdown
            lead_status = lead_statuses.get(r.get("lead_id"), "unknown")
            is_closed = lead_status in ("closed", "closed_won", "cerrado", "ganado")
            entry = {
                "zone": float(fb.get("zone", 0)),
                "segment": float(fb.get("segment", 0)),
                "capacity": float(fb.get("capacity", 0)),
                "conversion": float(fb.get("conversion", 0)),
                "schedule": float(fb.get("schedule", 10)),
                "_is_closed": is_closed,
            }
            all_annotated.append(entry)
            if is_closed:
                closed_annotated.append(entry)

        return closed_annotated, all_annotated

    def _compute_learned_weights(
        self,
        closed: List[Dict[str, Any]],
        open_leads: List[Dict[str, Any]],
    ) -> Dict[str, float]:
        """Calcula pesos via correlación dimensional cierre vs no-cierre.

        Mapping fit_breakdown → weight dimensions:
          zone      → zona
          conversion→ precio (proxy)
          segment   → segment
          capacity  → amenidades (proxy)
          schedule  → timing
        """
        if not closed:
            return dict(DEFAULT_WEIGHTS)

        def avg(data: List[Dict], key: str) -> float:
            vals = [d.get(key, 0) for d in data]
            return sum(vals) / len(vals) if vals else 0.0

        dims = ["zone", "conversion", "segment", "capacity", "schedule"]
        closed_avgs = {d: avg(closed, d) for d in dims}
        open_avgs = {d: avg(open_leads, d) for d in dims} if open_leads else {d: 0.0 for d in dims}

        # Raw importance = max(0, closed_avg - open_avg)
        importance = {d: max(0.0, closed_avgs[d] - open_avgs[d]) for d in dims}

        # If all importance values are 0 (no signal), fallback to defaults
        total_imp = sum(importance.values())
        if total_imp < 1.0:
            return dict(DEFAULT_WEIGHTS)

        # Normalize to weight space (5 core dimensions)
        # behavioral_intent and disc_match remain at 0 (future data)
        total_5core = sum(DEFAULT_WEIGHTS[k] for k in
                         ["zona", "precio", "segment", "amenidades", "timing"])  # = 1.0

        learned: Dict[str, float] = {
            "zona":               round(importance["zone"] / total_imp * total_5core, 6),
            "precio":             round(importance["conversion"] / total_imp * total_5core, 6),
            "segment":            round(importance["segment"] / total_imp * total_5core, 6),
            "amenidades":         round(importance["capacity"] / total_imp * total_5core, 6),
            "timing":             round(importance["schedule"] / total_imp * total_5core, 6),
            "behavioral_intent":  0.0,
            "disc_match":         0.0,
        }
        return learned

    def _blend_weights(
        self,
        learned: Dict[str, float],
        defaults: Dict[str, float],
        blend_ratio: float,
    ) -> Dict[str, float]:
        """Mezcla pesos aprendidos con defaults: ratio=1 → full learned, 0 → full default."""
        blended = {}
        for k in ALLOWED_WEIGHT_KEYS:
            blended[k] = learned.get(k, 0.0) * blend_ratio + defaults.get(k, 0.0) * (1 - blend_ratio)
        return blended

    def _blend_ratio(self, sample_size: int) -> float:
        """sample_size < 30 → 0 · 30-100 → 0.5 · >100 → linear to 1.0."""
        if sample_size < 30:
            return 0.0
        if sample_size <= 100:
            return 0.5
        # Gradual ramp from 100 → 200 samples: 0.5 → 1.0
        return min(1.0, 0.5 + (sample_size - 100) / 200.0)

    def _compute_confidence(self, sample_size: int, n_closed: int) -> int:
        """Confidence 0-100 basado en tamaño y calidad de la muestra."""
        if sample_size < 30 or n_closed < 5:
            return 0
        base = min(70, 30 + int((sample_size - 30) / 70 * 40))
        # Bonus for high conversion quality
        conv_rate = n_closed / sample_size if sample_size > 0 else 0
        if 0.05 <= conv_rate <= 0.40:
            base = min(100, base + 10)
        return base

    async def _persist_tuned_weights(
        self, weights: Dict[str, float], confidence: int, sample_size: int,
    ) -> None:
        """Guarda pesos auto-tunados en la colección."""
        before_doc = await self._get_raw_doc()
        prev_weights = (before_doc.get("weights") or DEFAULT_WEIGHTS).copy()
        version = int(before_doc.get("version") or 0) + 1
        now = _now()

        audit_entry = {
            "changed_at": now.isoformat(),
            "changed_by_user_id": None,
            "changed_by_system": True,
            "prev_weights": prev_weights,
            "new_weights": weights,
            "reason": f"auto_tune_confidence_{confidence}",
        }

        await self.db.match_weights_per_org.update_one(
            {"org_id": self.org_id},
            {
                "$set": {
                    "org_id": self.org_id,
                    "weights": weights,
                    "sum_to_100": True,
                    "is_default": False,
                    "last_tuned_at": now.isoformat(),
                    "tuning_confidence": confidence,
                    "training_sample_size": sample_size,
                    "version": version,
                    "updated_at": now.isoformat(),
                },
                "$push": {"audit_log": {"$each": [audit_entry], "$slice": -50}},
            },
            upsert=True,
        )

    async def _recent_manual_override(self, days: int = 7) -> bool:
        since = _now() - timedelta(days=days)
        try:
            count = await self.db.activity_log.count_documents({
                "type": "match_weights.manual_updated",
                "org_id": self.org_id,
                "created_at": {"$gte": since},
            })
            return count > 0
        except Exception:
            return False


# ─── Error types ──────────────────────────────────────────────────────────────
class MatchWeightsDisabledError(Exception):
    """Phase Y off o tier insuficiente."""


class MatchWeightsValidationError(Exception):
    """Validación de pesos fallida (suma != 1.0)."""


class MatchWeightsRateLimitError(Exception):
    """Cap de cambios manuales excedido."""


# ─── Cron entry ───────────────────────────────────────────────────────────────
async def run_match_weights_auto_tune_all_orgs(db) -> Dict[str, Any]:
    """Cron semanal lunes 03:30 MX.

    Itera orgs con tier match_weights_adaptive ≥ T1 y ejecuta apply_tuning().
    Solo aplica si confidence > 50 y sin manual override reciente.
    """

    # Find orgs with Phase Y enabled (sample from agentic settings)
    try:
        org_docs = await db.phase_y_settings.find(
            {"agentic_enabled": True}, {"_id": 0, "org_id": 1, "feature_tiers": 1},
        ).to_list(length=500)
    except Exception as exc:
        log.warning(f"[match_weights_cron] failed to load orgs: {exc}")
        return {"error": str(exc), "orgs_processed": 0}

    applied = 0
    skipped = 0
    errors = 0

    for org_doc in org_docs:
        org_id = org_doc.get("org_id")
        if not org_id:
            continue
        tier_raw = (org_doc.get("feature_tiers") or {}).get("match_weights_adaptive", "off")
        tier_num = 0
        if tier_raw and tier_raw != "off":
            try:
                tier_num = int(tier_raw.replace("T", ""))
            except (ValueError, AttributeError):
                pass
        if tier_num < 1:
            continue

        try:
            engine = MatchWeightsEngine(db, org_id)
            result = await engine.apply_tuning()
            if result.get("applied"):
                applied += 1
                log.info(
                    f"[match_weights_cron] org={org_id} confidence={result.get('confidence')} "
                    f"sample={result.get('training_sample_size')} APPLIED"
                )
            else:
                skipped += 1
                log.info(
                    f"[match_weights_cron] org={org_id} skip={result.get('skip_reason') or result.get('reason')}"
                )
        except Exception as exc:
            errors += 1
            log.warning(f"[match_weights_cron] org={org_id} error: {exc}")

    summary = {
        "orgs_processed": len(org_docs),
        "applied": applied,
        "skipped": skipped,
        "errors": errors,
        "ts": _now().isoformat(),
    }
    log.info(f"[match_weights_cron] done · {summary}")
    return summary


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_match_weights_indexes(db) -> None:
    """Índices para match_weights_per_org."""
    try:
        await db.match_weights_per_org.create_index(
            "org_id", unique=True, name="idx_match_weights_org_unique", background=True,
        )
        await db.match_weights_per_org.create_index(
            "last_tuned_at", name="idx_match_weights_tuned_at", background=True,
        )
        log.info("[match_weights] indexes OK")
    except Exception as exc:
        log.warning(f"[match_weights] ensure_indexes failed: {exc}")
