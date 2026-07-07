"""
gentrification_engine — Índice de GENTRIFICACIÓN / "zona subiendo" (0–100).
═══════════════════════════════════════════════════════════════════════════════
Pregunta que responde: ¿esta colonia está SUBIENDO (revalorizándose, mejorando)?
Es un índice DERIVADO y HONESTO (marca es_estimado=True): NO mide gentrificación con
un dato oficial único (no existe uno), la ESTIMA combinando 4 señales reales, cada una
con su fuente. Fail-soft: si falta una señal, usa las demás y BAJA la confianza.

NO inventa datos ni motores: REUSA los feeders/engines que ya existen en el repo.
  1. Plusvalía SHF de la alcaldía   → shf_engine.get_appreciation(db, alcaldia)
     (Índice SHF de Precios de la Vivienda · gob.mx · oficial). Mayor apreciación → sube.
  2. Trayectoria de crimen a la baja → colección `fgj_trajectory_zone` (feeder
     fgj_trajectory_ingest.py · FGJ datos.cdmx). trend_ratio<1 = crimen bajando → sube.
  3. Demanda reciente al alza        → colecciones `buyer_signals` y `marketplace_searches`
     (ambas con timestamp + colonia_slug). Más interés reciente vs. previo → sube.
     (Nota: ie_scores IE_COL_DEMANDA_NETA existe pero hoy es STUB value=None → NO se usa.)
  4. Edad / renovación del parque    → `catastro_predios.anio` por colonia (SIGCDMX).
     OJO: el campo es 'anio' y trae basura ('NA'/'0') → se filtra a rango 1900–2025.
     Parque joven o en renovación (año mediano más reciente) → sube.

PESOS (documentados · suman 1.0 cuando las 4 señales están presentes):
  · Plusvalía SHF ........... 0.35  (la señal más dura y oficial)
  · Crimen a la baja ........ 0.30  (mejora de seguridad = motor de gentrificación)
  · Demanda reciente ........ 0.20  (interés del mercado, señal viva pero muestra chica)
  · Edad / renovación ....... 0.15  (proxy estructural, cambia lento)
Si falta una señal, sus pesos se re-normalizan sobre las presentes y baja la confianza.

Salida: {colonia_id, score(0–100), nivel(alta/media/baja/estable),
         componentes:[{nombre, valor, fuente, peso}], es_estimado:True, confianza}.
El score se puede persistir en `colonia_valoracion` (campo `gentrification`).
"""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.gentrification_engine")

# ── Pesos base (documentados arriba). Se re-normalizan sobre las señales presentes. ──
_W_PLUSVALIA = 0.35
_W_CRIMEN = 0.30
_W_DEMANDA = 0.20
_W_EDAD = 0.15

# ── Rango válido de año de construcción (catastro trae 'NA'/'0'/años imposibles). ──
_ANIO_MIN = 1900
_ANIO_MAX = 2025

# ── Ventanas de demanda: como el histórico vivo es corto (~2 semanas), comparamos la
#    mitad reciente vs. la previa (momentum de interés). Honesto: muestra pequeña. ──
_DEMANDA_DIAS = 28          # ventana total observada
_DEMANDA_HALF = 14          # corte reciente vs. previo


def _slug(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _lin(x: float, x0: float, x1: float) -> float:
    """Normaliza x del rango [x0, x1] a [0, 100] (recortado). x0→0, x1→100."""
    if x1 == x0:
        return 50.0
    return _clamp((x - x0) / (x1 - x0) * 100.0)


# ═══════════════════════════════════════════════════════════════════════════════
# Componentes individuales (cada uno devuelve dict con valor 0–100 ó None si falta).
# ═══════════════════════════════════════════════════════════════════════════════

async def _componente_plusvalia(db, alcaldia: Optional[str]) -> Optional[Dict[str, Any]]:
    """Plusvalía SHF anual de la alcaldía (oficial). 3%→0, 8%→100. REUSA shf_engine."""
    try:
        from shf_engine import get_appreciation
        ap = await get_appreciation(db, alcaldia=alcaldia)
        pct = ap.get("plusvalia_anual_pct")
        if pct is None:
            return None
        return {
            "nombre": "plusvalia_shf",
            "etiqueta": "Plusvalía oficial (SHF)",
            "valor": round(_lin(float(pct), 3.0, 8.0), 1),
            "detalle_pct": float(pct),
            "es_propio": bool(ap.get("es_propio")),
            "fuente": ap.get("fuente") or "Índice SHF de Precios de la Vivienda (gob.mx)",
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[gentri] plusvalia: {e}")
        return None


async def _componente_crimen(db, colonia_id: str) -> Optional[Dict[str, Any]]:
    """Trayectoria de crimen (fgj_trajectory_zone). trend_ratio<1 = bajando = sube el score.
    ratio 1.3→0 (crimen subiendo mucho), 1.0→50 (estable), 0.7→100 (bajando mucho)."""
    try:
        doc = await db.fgj_trajectory_zone.find_one(
            {"zone_id": colonia_id},
            {"_id": 0, "trend_ratio": 1, "base_year": 1, "recent_year": 1,
             "base_count": 1, "recent_count": 1})
        if not doc or doc.get("trend_ratio") is None:
            return None
        ratio = float(doc["trend_ratio"])
        # Mapeo lineal: 1.3→0, 0.7→100  (invertido: menor ratio = mejor).
        valor = round(_clamp((1.3 - ratio) / (1.3 - 0.7) * 100.0), 1)
        return {
            "nombre": "crimen_trayectoria",
            "etiqueta": "Seguridad mejorando (crimen a la baja)",
            "valor": valor,
            "detalle_ratio": round(ratio, 3),
            "detalle": f"{doc.get('base_year')} ({doc.get('base_count')}) → "
                       f"{doc.get('recent_year')} ({doc.get('recent_count')}) carpetas FGJ",
            "fuente": "Trayectoria de delitos FGJ (datos.cdmx.gob.mx)",
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[gentri] crimen: {e}")
        return None


def _short_slug(colonia_id: str, name: Optional[str], alcaldia: Optional[str]) -> str:
    """Deriva el slug corto que usan buyer_signals/marketplace_searches (nombre de colonia,
    sin sufijo de alcaldía). p.ej. 'roma-norte-cuauhtemoc' → 'roma-norte'; 'Condesa'→'condesa'."""
    if name:
        return _slug(name)
    s = colonia_id
    alc = _slug(alcaldia) if alcaldia else ""
    if alc and s.endswith("-" + alc):
        s = s[: -(len(alc) + 1)]
    return s


async def _componente_demanda(db, colonia_id: str, name: Optional[str],
                              alcaldia: Optional[str]) -> Optional[Dict[str, Any]]:
    """Momentum de demanda reciente. REUSA buyer_signals + marketplace_searches (ambas con
    timestamp). Compara la mitad reciente vs. previa de la ventana. Más interés reciente = sube.
    Muestra chica → esta señal aporta poco y la confianza global lo refleja."""
    try:
        slug = _short_slug(colonia_id, name, alcaldia)
        now = datetime.now(timezone.utc)
        t_mid = now - timedelta(days=_DEMANDA_HALF)
        t_lo = now - timedelta(days=_DEMANDA_DIAS)
        recientes = 0
        previos = 0
        # buyer_signals (created_at_dt · colonia_slug) + marketplace_searches (created_at_dt · colonia_slug)
        for coll, field in (("buyer_signals", "colonia_slug"),
                            ("marketplace_searches", "colonia_slug")):
            try:
                q_base = {field: slug}
                recientes += await db[coll].count_documents(
                    {**q_base, "created_at_dt": {"$gte": t_mid}})
                previos += await db[coll].count_documents(
                    {**q_base, "created_at_dt": {"$gte": t_lo, "$lt": t_mid}})
            except Exception:  # noqa: BLE001
                continue
        total = recientes + previos
        if total == 0:
            return None  # sin señal de demanda → fail-soft (baja confianza)
        # Momentum: fracción reciente. 0.5 (estable)→50, todo reciente (1.0)→100, nada reciente→0.
        valor = round(_clamp(recientes / total * 100.0), 1)
        return {
            "nombre": "demanda_reciente",
            "etiqueta": "Demanda reciente al alza",
            "valor": valor,
            "detalle": f"{recientes} señales recientes vs {previos} previas ({slug})",
            "muestra_n": total,
            "fuente": "Interés de compradores (buyer_signals + marketplace_searches)",
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[gentri] demanda: {e}")
        return None


async def _componente_edad(db, name: Optional[str], alcaldia: Optional[str]) -> Optional[Dict[str, Any]]:
    """Edad/renovación del parque (catastro_predios.anio). Parque joven / en renovación = sube.
    Filtra 'anio' basura ('NA'/'0') al rango 1900–2025. Usa el año MEDIANO de construcción.
    1960 (muy viejo)→0, 2010 (nuevo)→100 → proxy de renovación reciente."""
    try:
        if not name:
            return None
        q: Dict[str, Any] = {"colonia": name}
        if alcaldia:
            q["alcaldia"] = alcaldia
        anios: List[int] = []
        cur = db.catastro_predios.find(q, {"_id": 0, "anio": 1}).limit(20000)
        async for p in cur:
            a = p.get("anio")
            try:
                ai = int(str(a).strip())
            except (TypeError, ValueError):
                continue
            if _ANIO_MIN <= ai <= _ANIO_MAX:
                anios.append(ai)
        if len(anios) < 20:  # muestra insuficiente → fail-soft
            return None
        med = int(median(anios))
        # 1960→0, 2010→100. Parque con año mediano más reciente = más nuevo/renovado.
        valor = round(_lin(float(med), 1960.0, 2010.0), 1)
        return {
            "nombre": "edad_parque",
            "etiqueta": "Parque joven / en renovación",
            "valor": valor,
            "detalle_anio_mediano": med,
            "muestra_n": len(anios),
            "fuente": "Catastro CDMX · año de construcción (SIGCDMX)",
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[gentri] edad: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# Score maestro
# ═══════════════════════════════════════════════════════════════════════════════

def _nivel(score: Optional[float]) -> str:
    if score is None:
        return "estable"
    if score >= 66:
        return "alta"
    if score >= 45:
        return "media"
    if score >= 30:
        return "baja"
    return "estable"


def _confianza(n_presentes: int, demanda_muestra: int) -> str:
    """Confianza honesta: baja si faltan señales o la muestra de demanda es minúscula."""
    if n_presentes >= 4 and demanda_muestra >= 15:
        return "media"      # nunca 'alta': es un índice estimado por diseño
    if n_presentes >= 3:
        return "media" if demanda_muestra >= 15 else "baja"
    if n_presentes >= 2:
        return "baja"
    return "muy_baja"


async def gentrification_score(db, colonia_id: str) -> Dict[str, Any]:
    """Índice 0–100 'zona subiendo' de una colonia. Combina 4 señales reales con pesos
    re-normalizados sobre las presentes. es_estimado=True siempre (honesto). Fail-soft."""
    col = await db.colonias.find_one(
        {"id": colonia_id}, {"_id": 0, "id": 1, "name": 1, "alcaldia": 1})
    name = (col or {}).get("name")
    alcaldia = (col or {}).get("alcaldia")

    plusvalia = await _componente_plusvalia(db, alcaldia)
    crimen = await _componente_crimen(db, colonia_id)
    demanda = await _componente_demanda(db, colonia_id, name, alcaldia)
    edad = await _componente_edad(db, name, alcaldia)

    raw = [
        (plusvalia, _W_PLUSVALIA),
        (crimen, _W_CRIMEN),
        (demanda, _W_DEMANDA),
        (edad, _W_EDAD),
    ]
    presentes = [(c, w) for c, w in raw if c is not None]
    componentes: List[Dict[str, Any]] = []
    score: Optional[float] = None

    if presentes:
        peso_total = sum(w for _c, w in presentes)
        acc = 0.0
        for c, w in presentes:
            peso_norm = round(w / peso_total, 3) if peso_total else 0.0
            acc += c["valor"] * peso_norm
            componentes.append({
                "nombre": c["nombre"],
                "etiqueta": c.get("etiqueta", c["nombre"]),
                "valor": c["valor"],
                "fuente": c["fuente"],
                "peso": peso_norm,
                "detalle": {k: v for k, v in c.items()
                            if k not in ("nombre", "etiqueta", "valor", "fuente")},
            })
        score = round(_clamp(acc), 1)

    demanda_muestra = (demanda or {}).get("muestra_n", 0) if demanda else 0
    confianza = _confianza(len(presentes), demanda_muestra)

    return {
        "colonia_id": colonia_id,
        "name": name,
        "alcaldia": alcaldia,
        "score": score,
        "nivel": _nivel(score),
        "componentes": componentes,
        "es_estimado": True,
        "confianza": confianza,
        "n_componentes": len(presentes),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "metodo": "índice derivado (plusvalía SHF + crimen a la baja + demanda reciente + "
                  "renovación del parque), pesos re-normalizados sobre señales presentes",
    }


async def persist_score(db, colonia_id: str, score_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Escribe el índice de gentrificación en `colonia_valoracion.gentrification` (upsert).
    Guarda un subconjunto compacto (sin recomputar la ficha entera)."""
    doc = score_doc or await gentrification_score(db, colonia_id)
    compact = {
        "score": doc.get("score"),
        "nivel": doc.get("nivel"),
        "confianza": doc.get("confianza"),
        "es_estimado": True,
        "n_componentes": doc.get("n_componentes"),
        "componentes": [
            {"nombre": c["nombre"], "valor": c["valor"], "fuente": c["fuente"], "peso": c["peso"]}
            for c in doc.get("componentes", [])
        ],
        "computed_at": doc.get("computed_at"),
    }
    try:
        await db.colonia_valoracion.update_one(
            {"colonia_id": colonia_id},
            {"$set": {"gentrification": compact, "colonia_id": colonia_id}},
            upsert=True)
        return {"ok": True, "colonia_id": colonia_id, "score": compact["score"]}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[gentri] persist {colonia_id}: {e}")
        return {"ok": False, "colonia_id": colonia_id, "error": str(e)[:200]}


async def persist_all(db, limit: Optional[int] = None) -> Dict[str, Any]:
    """Computa y persiste el índice para las colonias que tengan al menos una señal.
    Idempotente. Devuelve conteo escrito. Útil para un cron/backfill."""
    written = 0
    scanned = 0
    cur = db.colonias.find({}, {"_id": 0, "id": 1})
    async for c in cur:
        cid = c.get("id")
        if not cid:
            continue
        scanned += 1
        doc = await gentrification_score(db, cid)
        if doc.get("n_componentes", 0) >= 1:
            r = await persist_score(db, cid, doc)
            if r.get("ok"):
                written += 1
        if limit and written >= limit:
            break
    return {"ok": True, "scanned": scanned, "written": written}


def schedule_gentrification_cron(scheduler, db) -> None:
    """Registra el persist DIARIO del índice de gentrificación (04:45 MX, tras el recompute 02:00).
    Antes: solo on-read + endpoint manual → la colección persistida (que leen cubo/índices) quedaba
    stale. persist_all es idempotente y barato (solo colonias con ≥1 componente)."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
    except Exception:
        def wrap_apscheduler_job(fn, _job_id):  # noqa: ARG001
            return fn
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        wrap_apscheduler_job(persist_all, "gentrification_persist"),
        CronTrigger(hour=4, minute=45, timezone="America/Mexico_City"),
        args=[db], id="gentrification_persist", replace_existing=True, misfire_grace_time=3600,
    )
    log.info("[gentrif] cron de persist diario registrado (04:45 MX)")
