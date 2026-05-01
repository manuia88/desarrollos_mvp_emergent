"""Phase 7.3 — Document Intelligence Cross-Check Engine.

Deterministic rules (NO Claude, NO LLM) that compare extracted_data across documents
of a development to surface inconsistencies before they hit the marketplace.

Each rule is applied independently. Missing inputs → result="inconclusive" (not a failure).

Rules registered (v1.0):
  R1 precio_escritura_vs_lp        delta > ±5% → warning
  R2 vigencia_predial              vencido → critical · monto_pagado null → warning
  R3 seduvi_vs_lp_unidades         LP.unidades > permiso_seduvi.unidades_autorizadas → critical
  R4 licencia_m2_total             sum(LP.m2) > licencia.m2_construccion × 1.05 → critical
  R5 rfc_constancia_vs_dev         constancia.rfc ≠ developments[dev_id].rfc → critical

Side-effects on success:
  - Persist N rows in `di_cross_checks` (one per rule per dev, replaces previous).
  - IE Engine recipes IE_PROY_RISK_LEGAL, IE_PROY_COMPLIANCE_SCORE, IE_PROY_QUALITY_DOCS
    consume these results via score_engine pseudo-source `_dmx_cross_checks`.
"""

from __future__ import annotations

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from document_intelligence import decrypt_text

log = logging.getLogger("dmx.di.crosscheck")

ENGINE_VERSION = "1.0"

# 10 canonical doc_types used to compute QUALITY_DOCS (excludes 'otro').
CANONICAL_DOC_TYPES = [
    "lp", "brochure", "escritura", "permiso_seduvi", "estudio_suelo",
    "licencia_construccion", "predial", "plano_arquitectonico",
    "contrato_cv", "constancia_fiscal",
]


def _now():
    return datetime.now(timezone.utc)


def _mk_id():
    return f"cc_{uuid.uuid4().hex[:14]}"


# ─── Helpers ──────────────────────────────────────────────────────────────────
async def _latest_extractions_by_type(db, dev_id: str) -> Dict[str, Dict[str, Any]]:
    """Returns {doc_type: {doc_id, extracted_data}} for the most recent OK extraction per doc_type."""
    cursor = db.di_documents.find(
        {"development_id": dev_id, "status": "extracted"},
        {"_id": 0},
    ).sort("created_at", -1)
    docs = [d async for d in cursor]
    seen: Dict[str, Dict[str, Any]] = {}
    for d in docs:
        dt = d.get("doc_type")
        if dt in seen:
            continue
        extr = await db.di_extractions.find_one(
            {"document_id": d["id"], "ok": True},
            sort=[("generated_at", -1)],
        )
        if not extr:
            continue
        try:
            data = json.loads(decrypt_text(extr.get("extracted_data_enc") or ""))
        except Exception:
            continue
        seen[dt] = {"doc_id": d["id"], "data": data, "filename": d.get("filename")}
    return seen


# ─── Rule base ────────────────────────────────────────────────────────────────
class CrossCheckRule:
    rule_id: str = ""
    description: str = ""
    requires: List[str] = []  # doc_types that must be present

    def applicable(self, extractions: Dict[str, Dict[str, Any]]) -> bool:
        return all(t in extractions for t in self.requires)

    def evaluate(self, extractions: Dict[str, Dict[str, Any]], dev: Dict[str, Any]) -> Dict[str, Any]:
        """Returns a dict ready to persist (without id/dev_id/created_at).
        Required keys: severity, result, expected, actual, delta_pct, referenced_document_ids, message."""
        raise NotImplementedError


def _result(severity: str, result: str, *, expected: Any = None, actual: Any = None,
            delta_pct: Optional[float] = None, refs: Optional[List[str]] = None,
            message: str = "") -> Dict[str, Any]:
    return {
        "severity": severity, "result": result,
        "expected": expected, "actual": actual,
        "delta_pct": delta_pct,
        "referenced_document_ids": refs or [],
        "message": message,
    }


# ─── R1: precio_escritura_vs_lp ───────────────────────────────────────────────
class PrecioEscrituraVsLpRule(CrossCheckRule):
    rule_id = "precio_escritura_vs_lp"
    description = "Precio promedio de la escritura vs precio mediano del LP — delta ±5% acepta."
    requires = ["escritura", "lp"]

    def evaluate(self, extractions, dev):
        esc = extractions["escritura"]["data"]
        lp = extractions["lp"]["data"]
        refs = [extractions["escritura"]["doc_id"], extractions["lp"]["doc_id"]]

        # Escritura no siempre tiene precio explícito; usamos precio del contrato_cv si está, sino superficie_total*precio_lote
        esc_price = None
        if isinstance(esc.get("superficie_total"), (int, float)) and esc.get("predio_referencia"):
            # Sin precio explícito en escritura → inconclusive
            pass
        # Use contrato_cv if available
        cv = extractions.get("contrato_cv")
        if cv and isinstance(cv.get("data", {}).get("precio"), (int, float)):
            esc_price = float(cv["data"]["precio"])
            refs.append(cv["doc_id"])

        # LP precio mediano de unidades
        unidades = (lp.get("unidades") or [])
        precios = [float(u["precio"]) for u in unidades if isinstance(u.get("precio"), (int, float))]
        if not precios:
            return _result("info", "inconclusive", refs=refs,
                           message="LP no tiene precios numéricos para comparar.")
        precios.sort()
        mid = precios[len(precios) // 2]

        if esc_price is None:
            return _result("info", "inconclusive", refs=refs,
                           message="Escritura/contrato sin precio explícito para comparar contra LP.")

        delta = (esc_price - mid) / mid * 100.0
        sev = "warning" if abs(delta) > 5.0 else "info"
        res = "fail" if sev == "warning" else "pass"
        return _result(sev, res, expected=mid, actual=esc_price,
                       delta_pct=round(delta, 2), refs=refs,
                       message=f"Delta {delta:+.2f}% vs mediana LP. Aceptable ±5%.")


# ─── R2: vigencia_predial ─────────────────────────────────────────────────────
class VigenciaPredialRule(CrossCheckRule):
    rule_id = "vigencia_predial"
    description = "Predial debe estar pagado y vigente."
    requires = ["predial"]

    def evaluate(self, extractions, dev):
        pred = extractions["predial"]["data"]
        ref = [extractions["predial"]["doc_id"]]

        monto = pred.get("monto_pagado")
        vig = pred.get("vigencia")

        # Vigencia
        vig_dt: Optional[datetime] = None
        if isinstance(vig, str):
            try:
                vig_dt = datetime.fromisoformat(vig.replace("Z", "+00:00"))
                if vig_dt.tzinfo is None:
                    vig_dt = vig_dt.replace(tzinfo=timezone.utc)
            except Exception:
                vig_dt = None

        if vig_dt and vig_dt < _now():
            return _result("critical", "fail", expected="vigencia ≥ hoy", actual=vig, refs=ref,
                           message=f"Predial vencido el {vig_dt.date().isoformat()}.")

        if monto is None or not isinstance(monto, (int, float)):
            return _result("warning", "fail", expected="monto_pagado numérico", actual=monto, refs=ref,
                           message="Falta `monto_pagado` numérico en predial.")

        if vig_dt is None:
            return _result("info", "inconclusive", refs=ref, message="Predial sin fecha de vigencia parseable.")

        return _result("info", "pass", expected="vigencia ≥ hoy + monto_pagado", actual={"vigencia": vig, "monto_pagado": monto}, refs=ref,
                       message=f"Predial vigente hasta {vig_dt.date().isoformat()} · ${monto:,.0f} pagados.")


# ─── R3: seduvi_vs_lp_unidades ────────────────────────────────────────────────
class SeduviVsLpUnidadesRule(CrossCheckRule):
    rule_id = "seduvi_vs_lp_unidades"
    description = "El LP no debe rebasar las unidades autorizadas por SEDUVI."
    requires = ["permiso_seduvi", "lp"]

    def evaluate(self, extractions, dev):
        seduvi = extractions["permiso_seduvi"]["data"]
        lp = extractions["lp"]["data"]
        refs = [extractions["permiso_seduvi"]["doc_id"], extractions["lp"]["doc_id"]]

        autoriz = seduvi.get("unidades_autorizadas")
        unidades = lp.get("unidades") or []

        if not isinstance(autoriz, (int, float)):
            return _result("info", "inconclusive", refs=refs,
                           message="Permiso SEDUVI sin `unidades_autorizadas` numérico.")
        if not unidades:
            return _result("info", "inconclusive", refs=refs,
                           message="LP sin unidades para comparar.")

        actual = len(unidades)
        if actual > int(autoriz):
            return _result("critical", "fail", expected=int(autoriz), actual=actual, refs=refs,
                           delta_pct=round((actual - autoriz) / autoriz * 100.0, 2),
                           message=f"LP declara {actual} unidades pero SEDUVI autoriza {int(autoriz)}.")
        return _result("info", "pass", expected=int(autoriz), actual=actual, refs=refs,
                       message=f"LP {actual} ≤ SEDUVI {int(autoriz)} unidades autorizadas.")


# ─── R4: licencia_m2_total ────────────────────────────────────────────────────
class LicenciaM2TotalRule(CrossCheckRule):
    rule_id = "licencia_m2_total"
    description = "La superficie total construida del LP no debe exceder la licencia × 1.05."
    requires = ["licencia_construccion", "lp"]

    def evaluate(self, extractions, dev):
        lic = extractions["licencia_construccion"]["data"]
        lp = extractions["lp"]["data"]
        refs = [extractions["licencia_construccion"]["doc_id"], extractions["lp"]["doc_id"]]

        m2_lic = lic.get("m2_construccion")
        unidades = lp.get("unidades") or []
        m2s = [float(u["m2"]) for u in unidades if isinstance(u.get("m2"), (int, float))]

        if not isinstance(m2_lic, (int, float)) or m2_lic <= 0:
            return _result("info", "inconclusive", refs=refs,
                           message="Licencia sin `m2_construccion` numérico.")
        if not m2s:
            return _result("info", "inconclusive", refs=refs,
                           message="LP sin m² por unidad para sumar.")

        sum_lp = sum(m2s)
        threshold = float(m2_lic) * 1.05
        delta = (sum_lp - m2_lic) / m2_lic * 100.0
        if sum_lp > threshold:
            return _result("critical", "fail", expected=float(m2_lic), actual=sum_lp,
                           delta_pct=round(delta, 2), refs=refs,
                           message=f"Σ m² LP={sum_lp:.0f} excede licencia ({float(m2_lic):.0f}) por {delta:+.1f}% (>5%).")
        return _result("info", "pass", expected=float(m2_lic), actual=sum_lp,
                       delta_pct=round(delta, 2), refs=refs,
                       message=f"Σ m² LP={sum_lp:.0f} dentro del 5% de la licencia ({float(m2_lic):.0f}).")


# ─── R5: rfc_constancia_vs_dev ────────────────────────────────────────────────
class RfcConstanciaVsDevRule(CrossCheckRule):
    rule_id = "rfc_constancia_vs_dev"
    description = "El RFC de la constancia fiscal debe coincidir con el developer registrado."
    requires = ["constancia_fiscal"]

    def evaluate(self, extractions, dev):
        const = extractions["constancia_fiscal"]["data"]
        ref = [extractions["constancia_fiscal"]["doc_id"]]
        rfc_ext = (const.get("rfc") or "").strip().upper()

        # Lookup developer rfc
        try:
            from data_developments import DEVELOPERS_BY_ID
            developer = DEVELOPERS_BY_ID.get(dev.get("developer_id")) or {}
        except Exception:
            developer = {}
        rfc_dev = (developer.get("rfc") or "").strip().upper()

        if not rfc_ext:
            return _result("warning", "fail", expected="RFC ≠ vacío", actual=rfc_ext, refs=ref,
                           message="Constancia fiscal sin `rfc` parseable.")
        if not rfc_dev:
            return _result("info", "inconclusive", refs=ref,
                           message="Developer sin RFC registrado en el catálogo (data_developers.rfc=null).")
        if rfc_ext != rfc_dev:
            return _result("critical", "fail", expected=rfc_dev, actual=rfc_ext, refs=ref,
                           message=f"RFC constancia ({rfc_ext}) no coincide con developer ({rfc_dev}).")
        return _result("info", "pass", expected=rfc_dev, actual=rfc_ext, refs=ref,
                       message=f"RFC coincide ({rfc_ext}).")


# ─── Engine ───────────────────────────────────────────────────────────────────
RULES: List[CrossCheckRule] = [
    PrecioEscrituraVsLpRule(),
    VigenciaPredialRule(),
    SeduviVsLpUnidadesRule(),
    LicenciaM2TotalRule(),
    RfcConstanciaVsDevRule(),
]
RULES_BY_ID: Dict[str, CrossCheckRule] = {r.rule_id: r for r in RULES}


async def ensure_cross_check_indexes(db) -> None:
    coll = db.di_cross_checks
    await coll.create_index([("development_id", 1), ("rule_id", 1)], unique=True)
    await coll.create_index([("development_id", 1), ("severity", 1)])
    await coll.create_index("created_at")
    await coll.create_index("id", unique=True)


async def run_cross_check(db, dev_id: str) -> Dict[str, Any]:
    """Run all rules, persist results (replace per rule), recompute IE recipes related."""
    try:
        from data_developments import DEVELOPMENTS_BY_ID
    except Exception:
        DEVELOPMENTS_BY_ID = {}
    dev = DEVELOPMENTS_BY_ID.get(dev_id)
    if not dev:
        return {"ok": False, "error": "dev_not_found"}

    extractions = await _latest_extractions_by_type(db, dev_id)
    extracted_count = len(extractions)

    persisted: List[Dict[str, Any]] = []
    inconclusive_count = 0
    critical_count = 0
    warning_count = 0
    pass_count = 0
    applicable_count = 0

    for rule in RULES:
        if not rule.applicable(extractions):
            # Persist as inconclusive so UI can render the rule with hint.
            doc = {
                "id": _mk_id(),
                "development_id": dev_id,
                "rule_id": rule.rule_id,
                "rule_description": rule.description,
                "severity": "info",
                "result": "inconclusive",
                "expected": None,
                "actual": None,
                "delta_pct": None,
                "referenced_document_ids": [],
                "message": f"Faltan documentos requeridos: {', '.join(t for t in rule.requires if t not in extractions)}",
                "created_at": _now(),
                "engine_version": ENGINE_VERSION,
            }
            inconclusive_count += 1
        else:
            applicable_count += 1
            try:
                ev = rule.evaluate(extractions, dev)
            except Exception as e:
                log.exception(f"cross_check rule {rule.rule_id} failed dev={dev_id}: {e}")
                ev = _result("warning", "fail", refs=[], message=f"Rule error: {type(e).__name__}: {e}")
            doc = {
                "id": _mk_id(),
                "development_id": dev_id,
                "rule_id": rule.rule_id,
                "rule_description": rule.description,
                "severity": ev["severity"],
                "result": ev["result"],
                "expected": ev["expected"],
                "actual": ev["actual"],
                "delta_pct": ev["delta_pct"],
                "referenced_document_ids": ev["referenced_document_ids"],
                "message": ev["message"],
                "created_at": _now(),
                "engine_version": ENGINE_VERSION,
            }
            if ev["result"] == "inconclusive":
                inconclusive_count += 1
                applicable_count -= 1
            elif ev["severity"] == "critical":
                critical_count += 1
            elif ev["severity"] == "warning":
                warning_count += 1
            else:
                pass_count += 1

        # Replace previous record for (dev_id, rule_id)
        await db.di_cross_checks.replace_one(
            {"development_id": dev_id, "rule_id": rule.rule_id},
            doc,
            upsert=True,
        )
        persisted.append(doc)

    summary = {
        "development_id": dev_id,
        "total_rules": len(RULES),
        "applicable": applicable_count,
        "passed": pass_count,
        "warnings": warning_count,
        "criticals": critical_count,
        "inconclusive": inconclusive_count,
        "extracted_count": extracted_count,
        "engine_version": ENGINE_VERSION,
        "computed_at": _now(),
    }

    # Trigger IE recipe recompute (fire-and-forget; safe to await for determinism)
    try:
        from score_engine import ScoreEngine
        engine = ScoreEngine(db)
        codes = ["IE_PROY_RISK_LEGAL", "IE_PROY_COMPLIANCE_SCORE", "IE_PROY_QUALITY_DOCS"]
        await engine.compute_many(dev_id, codes)
    except Exception as e:
        log.warning(f"cross_check IE recompute failed: {e}")

    # Phase 7.5 — auto-sync (pause if RISK_LEGAL=red; auto-apply if clean)
    try:
        from auto_sync_engine import auto_trigger_after_extraction
        await auto_trigger_after_extraction(db, dev_id)
    except Exception as e:
        log.warning(f"auto_sync auto_trigger failed: {e}")

    return {"ok": True, "summary": summary, "results": persisted}


# ─── Sanitize for API ─────────────────────────────────────────────────────────
def sanitize(doc: dict) -> dict:
    if not doc:
        return {}
    out = {k: v for k, v in doc.items() if k != "_id"}
    ca = out.get("created_at")
    if isinstance(ca, datetime):
        out["created_at"] = ca.isoformat()
    return out


async def get_dev_cross_check(db, dev_id: str) -> Dict[str, Any]:
    """Return latest results per rule + summary aggregates for the dev."""
    cursor = db.di_cross_checks.find({"development_id": dev_id})
    rows = [sanitize(d) async for d in cursor]
    rows.sort(key=lambda r: r["rule_id"])

    crit = sum(1 for r in rows if r["severity"] == "critical" and r["result"] == "fail")
    warn = sum(1 for r in rows if r["severity"] == "warning" and r["result"] == "fail")
    pass_ = sum(1 for r in rows if r["result"] == "pass")
    inc = sum(1 for r in rows if r["result"] == "inconclusive")
    return {
        "development_id": dev_id,
        "total_rules": len(RULES),
        "criticals": crit,
        "warnings": warn,
        "passed": pass_,
        "inconclusive": inc,
        "results": rows,
    }


async def has_critical(db, dev_id: str) -> bool:
    """GC-X4 helper: True if dev has any critical fail active."""
    n = await db.di_cross_checks.count_documents({
        "development_id": dev_id,
        "severity": "critical",
        "result": "fail",
    })
    return n > 0


async def auto_trigger_after_extraction(db, dev_id: str) -> None:
    """Hook called from extraction_engine after each successful extraction."""
    try:
        # Only run if dev has ≥ 2 extracted docs
        cnt = await db.di_documents.count_documents({"development_id": dev_id, "status": "extracted"})
        if cnt < 2:
            return
        await run_cross_check(db, dev_id)
    except Exception as e:
        log.exception(f"auto_trigger_after_extraction dev={dev_id}: {e}")
