"""Señales de feedback estructuradas del proceso de lead × desarrollo (Batch 7 · feature founder).

PRINCIPIO DE PRIVACIDAD (doc AUTHZ_MODEL.md): la IA del copiloto del asesor (que SÍ puede leer la
conversación, es su herramienta) convierte el chat en ETIQUETAS estructuradas. El dev / el mercado ven
SOLO las etiquetas, NUNCA la conversación. Todas las señales son enums de una taxonomía cerrada →
seguras (sin texto libre de PII), agregables y anonimizables. Cada lead pertenece a UN desarrollo
(dev_org_id) → la señal ya está acotada por proyecto; un dev solo ve las de sus propios desarrollos.

Alimenta el "Modelo del Mundo de la Demanda" (reusa el eje colonia de demand_intelligence).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.feedback_signals")

# ─── Taxonomía cerrada (7 ejes) ─────────────────────────────────────────────────
# Eje 1 · desenlace
OUTCOMES = {"interesado", "no_interesado", "indeciso", "follow_up", "avanzo", "cerrado_ganado",
            "cerrado_perdido", "no_show"}
DROP_OFF = {"contacto", "pre_cita", "en_cita", "post_cita", "oferta", "escritura"}
# Eje 2 · motivo de no-avance (objeción) — categoría → sub-motivos
OBJECIONES: Dict[str, List[str]] = {
    "precio": ["general", "m2", "enganche", "mensualidad", "no_califico_credito"],
    "producto": ["recamaras", "m2", "distribucion", "acabados", "piso_nivel", "vista", "orientacion"],
    "amenidad": ["alberca", "gym", "roof", "pet_friendly", "coworking", "seguridad", "otra"],
    "ubicacion": ["zona", "lejos_trabajo", "inseguridad", "movilidad"],
    "entrega": ["preventa_larga", "queria_inmediata"],
    "financiamiento": ["no_califico", "tasa", "banco", "esquema_rigido"],
    "timing_cliente": ["explorando", "decision_familiar", "no_urgente", "se_echo_para_atras"],
    "confianza": ["reputacion_dev", "legal_escritura"],
    "competencia": ["prefirio_otra_opcion"],
}
# Eje 3 · atractores (qué SÍ le gustó)
ATRACTORES = {"precio", "ubicacion", "amenidades", "diseno", "entrega", "marca", "tamano", "financiamiento"}
# Eje 4 · perfil del comprador
PERFIL: Dict[str, List[str]] = {
    "tipo_comprador": ["primera_vivienda", "inversion", "segunda_casa", "upgrade", "downsize"],
    "uso": ["habitar", "rentar_largo", "rentar_corto", "especular"],
    "urgencia": ["0_3m", "3_6m", "6_12m", "mas_12m"],
    "forma_pago": ["contado", "credito_bancario", "infonavit_fovissste", "cofinanciamiento"],
    "composicion": ["soltero", "pareja", "familia_hijos", "adulto_mayor"],
}
# Eje 5 · gap producto↔demanda (lo que pidió) · Eje 6 · competencia (anonimizada)
COMPETENCIA_MOTIVO = {"mas_barato", "mejor_ubicacion", "entrega_mas_rapida", "mejor_producto", "otra"}


def _valid_signals(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Filtra `raw` dejando SOLO claves/valores de la taxonomía cerrada (defensa: cero texto libre)."""
    out: Dict[str, Any] = {}
    if not isinstance(raw, dict):
        return out
    # Eje 1
    if raw.get("outcome") in OUTCOMES:
        out["outcome"] = raw["outcome"]
    if raw.get("drop_off_stage") in DROP_OFF:
        out["drop_off_stage"] = raw["drop_off_stage"]
    # Eje 2 — objeciones: lista de {cat, sub?}
    objs = []
    for o in (raw.get("objeciones") or []):
        if not isinstance(o, dict):
            continue
        cat = o.get("cat")
        if cat in OBJECIONES:
            sub = o.get("sub") if o.get("sub") in OBJECIONES[cat] else None
            objs.append({"cat": cat, "sub": sub})
    if objs:
        out["objeciones"] = objs[:6]
    # Eje 3
    atr = [a for a in (raw.get("atractores") or []) if a in ATRACTORES]
    if atr:
        out["atractores"] = atr[:6]
    # Eje 4 — perfil anidado {tipo_comprador, uso, urgencia, forma_pago, composicion}
    perfil_in = raw.get("perfil") if isinstance(raw.get("perfil"), dict) else {}
    perfil = {}
    for k, allowed in PERFIL.items():
        if perfil_in.get(k) in allowed:
            perfil[k] = perfil_in[k]
    if perfil:
        out["perfil"] = perfil
    # Eje 5 — gap producto anidado (numéricos acotados + amenidad de la taxonomía)
    gap_in = raw.get("gap_producto") if isinstance(raw.get("gap_producto"), dict) else {}
    gap = {}
    for k in ("recamaras_deseadas", "m2_objetivo", "precio_objetivo"):
        v = gap_in.get(k)
        if isinstance(v, (int, float)) and 0 < v < 1e9:
            gap[k] = v
    if gap_in.get("amenidad_faltante") in OBJECIONES["amenidad"]:
        gap["amenidad_faltante"] = gap_in["amenidad_faltante"]
    if gap:
        out["gap_producto"] = gap
    # Eje 6 — competencia (sin nombrar tenant)
    if raw.get("competencia_motivo") in COMPETENCIA_MOTIVO:
        out["competencia_motivo"] = raw["competencia_motivo"]
    return out


async def record_feedback(db, lead_id: str, raw_signals: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
    """Valida contra la taxonomía y persiste en lead.feedback_signals (merge). La PROPIEDAD del lead
    se valida en el endpoint (assert_lead_owner) antes de llamar aquí."""
    clean = _valid_signals(raw_signals)
    if not clean:
        return {"ok": False, "reason": "sin señales válidas", "stored": {}}
    import datetime as _dt
    clean["_updated_at"] = _dt.datetime.utcnow().isoformat()
    clean["_by"] = actor_id
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {f"feedback_signals.{k}": v for k, v in clean.items()}},
    )
    return {"ok": True, "stored": clean}


_EXTRACT_SYS = (
    "Eres un analista de ventas inmobiliarias. Lee las notas/conversación del asesor con el cliente y "
    "devuelve SOLO un JSON con señales ESTRUCTURADAS (nunca texto libre ni PII). Claves permitidas: "
    "outcome, objeciones:[{cat,sub}], atractores:[], perfil:{tipo_comprador,uso,urgencia,forma_pago,composicion}, "
    "gap_producto:{recamaras_deseadas,m2_objetivo,precio_objetivo,amenidad_faltante}, competencia_motivo. "
    "Usa EXCLUSIVAMENTE los valores de la taxonomía provista. Si no hay señal para una clave, omítela."
)


async def auto_extract(db, lead: Dict[str, Any]) -> Dict[str, Any]:
    """Deriva señales estructuradas del lead. Base DETERMINISTA (mapea campos ya estructurados); si hay
    LLM disponible y notas, enriquece leyendo la conversación → SOLO emite etiquetas (no devuelve el texto)."""
    signals: Dict[str, Any] = {}
    # ── capa determinista (siempre corre, sin LLM) ──
    status = lead.get("status")
    vo = lead.get("visit_outcome")
    if vo in ("interes", "interesado"):
        signals["outcome"] = "interesado"
    elif vo in ("no", "no_interesado"):
        signals["outcome"] = "no_interesado"
    elif vo in ("follow-up", "follow_up"):
        signals["outcome"] = "follow_up"
    elif status == "cerrado_perdido":
        signals["outcome"] = "cerrado_perdido"
    elif status == "cerrado_ganado":
        signals["outcome"] = "cerrado_ganado"
    lr = lead.get("lost_reason")
    _LR_MAP = {  # motivos de pérdida legacy → taxonomía de objeción
        "precio": {"cat": "precio", "sub": "general"}, "caro": {"cat": "precio", "sub": "general"},
        "ubicacion": {"cat": "ubicacion", "sub": "zona"}, "financiamiento": {"cat": "financiamiento", "sub": "no_califico"},
        "no_califico": {"cat": "financiamiento", "sub": "no_califico"}, "entrega": {"cat": "entrega", "sub": "preventa_larga"},
        "competencia": {"cat": "competencia", "sub": "prefirio_otra_opcion"}, "no_show": {"cat": "timing_cliente", "sub": "no_urgente"},
    }
    if lr and _LR_MAP.get(lr):
        signals["objeciones"] = [_LR_MAP[lr]]
    pm = lead.get("payment_methods") or []
    if "contado" in pm:
        signals.setdefault("perfil", {})["forma_pago"] = "contado"
    elif any("credito" in str(p) or "banco" in str(p) for p in pm):
        signals.setdefault("perfil", {})["forma_pago"] = "credito_bancario"
    if lead.get("intent") in ("inversion", "invest"):
        signals.setdefault("perfil", {})["tipo_comprador"] = "inversion"

    # ── capa LLM (enriquecimiento opcional · lee notas, emite solo etiquetas) ──
    try:
        from llm_client import llm_available
        notes = lead.get("notes") or []
        if llm_available() and notes:
            from llm_client import LlmChat, UserMessage
            import json as _json
            notes_text = "\n".join((n.get("text") or "")[:200] for n in notes[-8:])
            tax = {"OBJECIONES": OBJECIONES, "ATRACTORES": sorted(ATRACTORES),
                   "PERFIL": PERFIL, "COMPETENCIA": sorted(COMPETENCIA_MOTIVO), "OUTCOMES": sorted(OUTCOMES)}
            chat = (LlmChat(session_id=f"fb_{lead.get('id','')}", system_message=_EXTRACT_SYS)
                    .with_model("anthropic", "claude-haiku-4-5-20251001").with_max_tokens(500))
            raw = await chat.send_message(UserMessage(
                text=f"TAXONOMÍA:\n{_json.dumps(tax, ensure_ascii=False)}\n\nNOTAS:\n{notes_text}\n\nDevuelve solo el JSON."))
            txt = (raw or "").strip()
            if "{" in txt:
                txt = txt[txt.index("{"): txt.rindex("}") + 1]
                llm_signals = _json.loads(txt)
                # merge: el LLM enriquece pero pasa por el MISMO validador (cierra la taxonomía)
                merged = {**signals, **_valid_signals(llm_signals)}
                signals = merged
    except Exception as e:  # noqa: BLE001
        log.info(f"[feedback_signals] auto_extract LLM skip: {e}")
    return _valid_signals(signals)


async def aggregate_feedback(db, dev_ids: Optional[List[str]] = None, min_n: int = 3) -> Dict[str, Any]:
    """Agrega lead.feedback_signals sobre el scope del caller (dev_ids=None → todo, solo superadmin).
    Devuelve distribución de objeciones/atractores/perfil + gap de producto por colonia. Aplica k-anonimato
    (min_n) por celda de colonia para no exponer un dato individualizable."""
    q: Dict[str, Any] = {"feedback_signals": {"$exists": True}}
    if dev_ids is not None:
        q["dev_org_id"] = {"$in": list(dev_ids)}
    obj_count: Dict[str, int] = {}
    atr_count: Dict[str, int] = {}
    perfil_count: Dict[str, Dict[str, int]] = {}
    by_colonia: Dict[str, Dict[str, int]] = {}
    gap_rec: List[float] = []
    n = 0
    async for lead in db.leads.find(q, {"_id": 0, "feedback_signals": 1, "colonia": 1, "colonia_id": 1}):
        fs = lead.get("feedback_signals") or {}
        n += 1
        for o in (fs.get("objeciones") or []):
            k = o.get("cat")
            if k:
                obj_count[k] = obj_count.get(k, 0) + 1
                col = lead.get("colonia_id") or lead.get("colonia") or "n/a"
                by_colonia.setdefault(col, {})
                by_colonia[col][k] = by_colonia[col].get(k, 0) + 1
        for a in (fs.get("atractores") or []):
            atr_count[a] = atr_count.get(a, 0) + 1
        for pk, pv in (fs.get("perfil") or {}).items():
            perfil_count.setdefault(pk, {})
            perfil_count[pk][pv] = perfil_count[pk].get(pv, 0) + 1
        rec = (fs.get("gap_producto") or {}).get("recamaras_deseadas")
        if isinstance(rec, (int, float)):
            gap_rec.append(rec)
    # k-anonimato: solo colonias con >= min_n señales
    by_colonia = {c: v for c, v in by_colonia.items() if sum(v.values()) >= min_n}
    return {
        "n_leads_con_feedback": n,
        "objeciones": dict(sorted(obj_count.items(), key=lambda kv: -kv[1])),
        "atractores": dict(sorted(atr_count.items(), key=lambda kv: -kv[1])),
        "perfil": perfil_count,
        "objeciones_por_colonia": by_colonia,
        "recamaras_deseadas_promedio": round(sum(gap_rec) / len(gap_rec), 1) if gap_rec else None,
        "k_anonimato_min": min_n,
    }
