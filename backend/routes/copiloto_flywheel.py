"""
Flywheel del Copiloto — Etapa 7, MÁXIMA granularidad (2026-06-18).

Cuando una operación CIERRA, no guardamos un número: capturamos el VIAJE COMPLETO del comprador y lo volvemos el
átomo de entrenamiento que mejora TODO. El moat que se mejora solo (capa H · nadie puede copiar este histórico).

Un cierre captura, al máximo detalle:
  - LO QUE BUSCÓ (A): zona, presupuesto, crédito, recámaras, etapa, plazo, uso.
  - LO QUE COMPRÓ (outcome): el desarrollo y todos sus atributos.
  - EL DESAJUSTE (la joya): buscado vs comprado → ¿subió presupuesto? ¿cambió zona? ¿transigió en recámaras?
    = la elasticidad/willingness real del comprador.
  - LA CONDUCTA (C/D): likes, vistas, ¿le dio like a lo que compró?
  - EL RECORRIDO (embudo + tiempo): primera señal → cierre = ciclo de venta real.
  - EL PRECIO real vs AVM = el dato que vuelve el AVM "mercado" y no "oferta".

Alimenta: AVM (precio real → DRPI) · recomendador ("parecidos a los que CERRARON") · cubo superadmin (conversión/
compromiso/ciclo) · lookalike. Reusa on_deal_closed del Cerebro. Colección db.copiloto_closings (el atom).
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.routes_copiloto_flywheel")
router = APIRouter(tags=["copiloto-flywheel"])


def _rng_max(r):
    return (r[1] if isinstance(r, (list, tuple)) and len(r) == 2 else 0) or 0


async def record_closing(db, lead_id=None, visitor_id=None, dev_id=None, price_closed=None):
    """Captura el viaje COMPLETO de un cierre → el átomo de entrenamiento (máxima granularidad). Fail-open."""
    from data_developments import DEVELOPMENTS
    by_id = {d.get("id"): d for d in DEVELOPMENTS}
    now = datetime.utcnow()   # naive · consistente con created_at_dt que Mongo devuelve naive (evita tz mismatch)

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0}) if lead_id else None
    if lead and not visitor_id:
        visitor_id = lead.get("visitor_id")
    bp = (lead or {}).get("buyer_profile") or {}
    dev = by_id.get(dev_id) or {}

    # Conducta (C/D) del visitor.
    likes, vistas = [], 0
    if visitor_id:
        async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": "like", "active": True}, {"_id": 0, "entity_id": 1}):
            if s.get("entity_id"):
                likes.append(s["entity_id"])
        vistas = await db.buyer_signals.count_documents({"visitor_id": visitor_id, "type": "ficha_view"})
        first = await db.buyer_signals.find_one({"visitor_id": visitor_id}, {"_id": 0, "created_at_dt": 1}, sort=[("created_at_dt", 1)])
    else:
        first = None
    primera = (first or {}).get("created_at_dt")
    dias_a_cierre = round((now - primera).total_seconds() / 86400, 1) if primera else None

    # DESAJUSTE: buscado vs comprado (la elasticidad real — la joya del flywheel).
    pres = bp.get("presupuesto_max")
    pcomprado = dev.get("price_from")
    subio_pres = bool(pres and pcomprado and pcomprado > pres)
    pres_delta = round((pcomprado - pres) / pres * 100, 1) if (pres and pcomprado) else None
    zbuscadas = {str(c).strip().lower() for c in (bp.get("colonias") or [])}
    zcomprada = str(dev.get("colonia") or "").strip().lower()
    zona_match = (zcomprada in zbuscadas) if zbuscadas else None
    rec_buscadas = bp.get("recamaras_min")
    rec_match = (rec_buscadas is not None and _rng_max(dev.get("bedrooms_range")) >= rec_buscadas) if rec_buscadas else None

    doc = {
        "id": f"cls_{(lead_id or visitor_id or 'x')[-8:]}_{dev_id}",
        "lead_id": lead_id, "visitor_id": visitor_id, "dev_id": dev_id,
        "dev_name": dev.get("name"), "colonia": dev.get("colonia"),
        "closed_at": now.isoformat(), "closed_at_dt": now, "price_closed": price_closed,
        # A · lo que buscó
        "buscado": {k: bp.get(k) for k in ("colonias", "presupuesto_max", "recamaras_min", "banos_min", "stages", "plazo", "uso", "credito")},
        # outcome · lo que compró
        "comprado": {
            "colonia": dev.get("colonia"), "price_from": dev.get("price_from"), "price_m2": dev.get("price_m2_dev"),
            "recamaras": dev.get("bedrooms_range"), "amenities": dev.get("amenities"), "stage": dev.get("stage"),
            "developer": (dev.get("developer") or {}).get("name"), "delivery_estimate": dev.get("delivery_estimate"),
        },
        # la JOYA · desajuste/elasticidad
        "desajuste": {
            "subio_presupuesto": subio_pres, "presupuesto_delta_pct": pres_delta,
            "zona_match": zona_match, "cambio_zona": (zona_match is False),
            "recamaras_match": rec_match,
        },
        # C/D · conducta
        "conducta": {"likes": likes, "n_vistas": vistas, "dio_like_al_comprado": (dev_id in likes)},
        # recorrido · tiempo
        "recorrido": {"primera_senal": primera.isoformat() if primera else None, "dias_a_cierre": dias_a_cierre},
        # precio real vs AVM (alimenta el AVM)
        "precio_real_vs_listado_pct": (round((price_closed - pcomprado) / pcomprado * 100, 1) if (price_closed and pcomprado) else None),
        "origen": (lead or {}).get("source"),
    }
    await db.copiloto_closings.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)

    # Alimenta el AVM: el precio REAL de cierre como market_comp (el AVM pasa de "oferta" a "mercado").
    if price_closed and zcomprada:
        try:
            await db.market_comps_closings.update_one(
                {"colonia": zcomprada, "dev_id": dev_id},
                {"$set": {"colonia": zcomprada, "dev_id": dev_id, "price_closed": price_closed,
                          "price_m2": dev.get("price_m2_dev"), "closed_at_dt": now}}, upsert=True)
        except Exception:
            pass
    # #3 cerrar el aprendizaje: cada cierre re-materializa "qué cierra" → el ranking del comprador mejora SOLO.
    try:
        await materialize_closing_lifts(db)
    except Exception:
        pass
    return doc


async def materialize_closing_lifts(db) -> dict:
    """#3/#B1 cerrar el aprendizaje: materializa 'qué cierra' en db.closing_lifts → el ranking del comprador
    (visitor_taste.score_devs) lo lee EN VIVO y empuja lo que de verdad VENDE. Tras cada cierre + cron. Fail-open.
    Dos señales: (a) `recamaras` = lift del CATÁLOGO (cerebro_mercado_engine.lifts_por_factor) para cold-start;
    (b) `real` = distribución de los CIERRES REALES (copiloto_closings) por recámaras+banda de precio → el moat aprende
    de cada venta de verdad (antes solo recomputaba el catálogo estático = no aprendía). Reusa el motor, no duplica."""
    out = {"_id": "global", "recamaras": {}}
    try:
        from cerebro_mercado_engine import lifts_por_factor, _precio_band
        lf = await lifts_por_factor(db, "recamaras")
        if lf.get("suficiente_dato"):
            for o in (lf.get("opciones") or []):
                try:
                    rec = int(str(o["valor"]).split()[0])
                    out["recamaras"][str(rec)] = round(o.get("lift_pp") or 0, 1)
                except (ValueError, IndexError, KeyError):
                    pass
        # #B1 · aprender de CIERRES REALES (no del catálogo estático): distribución por factor desde copiloto_closings.
        # Ventana de recencia 18m: lo que cierra HOY pesa (no ventas de hace años) + acota el scan a escala (índice
        # closed_at_dt pendiente en B4). Incluye docs sin fecha (legacy/demo) por seguridad.
        from datetime import datetime as _dt, timedelta as _td
        _cut = _dt.utcnow() - _td(days=548)
        real = {"n": 0, "recamaras": {}, "precio": {}}
        async for cl in db.copiloto_closings.find(
                {"$or": [{"closed_at_dt": {"$gte": _cut}}, {"closed_at_dt": {"$exists": False}}]},
                {"_id": 0, "comprado": 1}):
            comp = cl.get("comprado") or {}
            real["n"] += 1
            br = comp.get("recamaras")
            vals = []
            if isinstance(br, (list, tuple)) and br:
                try:
                    vals = list(range(int(br[0]), int(br[-1]) + 1))
                except (ValueError, TypeError):
                    vals = []
            elif str(br or "").strip().isdigit():
                vals = [int(br)]
            for v in set(vals):   # cada cierre cuenta ≤1 por valor → share ≤ 1
                real["recamaras"][str(v)] = real["recamaras"].get(str(v), 0) + 1
            band = _precio_band(comp.get("price_from"))
            if band:
                real["precio"][band] = real["precio"].get(band, 0) + 1
        out["real"] = real
        from datetime import datetime as _dt
        out["computed_at"] = _dt.utcnow().isoformat()
        await db.closing_lifts.update_one({"_id": "global"}, {"$set": out}, upsert=True)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[flywheel] materialize_closing_lifts fail: {e}")
    return out


class CierreIn(BaseModel):
    lead_id: str | None = None
    visitor_id: str | None = None
    dev_id: str
    # C-03: cota dura — un cierre fuera de rango inmobiliario real envenena el AVM por colonia + el ranking global.
    price_closed: float | None = Field(None, ge=100_000, le=500_000_000)


@router.post("/api/copiloto/cierre")
async def cierre(b: CierreIn, request: Request):
    """Registra un cierre (demo/cron · en prod lo dispara on_deal_closed del asesor al marcar GANADO)."""
    # SEGURIDAD (pentest 3ª ola): antes SIN AUTH → cualquiera escribía market_comps_closings (alimenta el AVM) con
    # price_closed arbitrario = ENVENENAMIENTO del moat. Ahora exige sesión asesor/dev/superadmin o CRON_SECRET.
    import os as _os, hmac as _hmac
    from fastapi import HTTPException as _HTTPException
    _cron = _os.environ.get("CRON_SECRET", "")
    _hdr = request.headers.get("X-Cron-Secret", "")
    if not (_cron and _hdr and _hmac.compare_digest(_hdr, _cron)):
        from server import get_current_user
        _u = await get_current_user(request)
        _role = getattr(_u, "role", "") if _u else ""
        if _role not in ("advisor", "asesor_admin", "developer_admin", "developer_director", "superadmin"):
            raise _HTTPException(401, "No autorizado")
    try:
        db = request.app.state.db
        # C-03: el dev_id debe existir en el catálogo (no envenenar el AVM con un desarrollo inventado).
        from data_developments import DEVELOPMENTS_BY_ID
        if b.dev_id not in DEVELOPMENTS_BY_ID and not await db.developments.find_one({"id": b.dev_id}, {"_id": 1}):
            raise _HTTPException(400, "dev_id desconocido")
        doc = await record_closing(db, lead_id=b.lead_id, visitor_id=b.visitor_id, dev_id=b.dev_id, price_closed=b.price_closed)
        return {"ok": True, "atom": {"desajuste": doc["desajuste"], "dias_a_cierre": doc["recorrido"]["dias_a_cierre"]}}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[flywheel] cierre fail: {e}")
        return {"ok": False}


@router.get("/api/buyer/parecidos-cerraron")
async def parecidos_cerraron(request: Request, visitor_id: str, limit: int = 4):
    """Recomendación por CIERRES: dado el perfil del visitor, qué compraron OTROS con perfil parecido.
    "Parecidos a los que cerraron" — el moat. Reusa db.copiloto_closings."""
    try:
        db = request.app.state.db
        s = await db.marketplace_searches.find_one({"visitor_id": visitor_id}, {"_id": 0}, sort=[("created_at_dt", -1)]) or {}
        my_z = {str(c).strip().lower() for c in (s.get("colonias") or [])}
        my_pres = s.get("precio_max")
        from collections import Counter
        votes = Counter()
        meta = {}
        async for cl in db.copiloto_closings.find({}, {"_id": 0, "dev_id": 1, "dev_name": 1, "colonia": 1, "buscado": 1}):
            b = cl.get("buscado") or {}
            bz = {str(c).strip().lower() for c in (b.get("colonias") or [])}
            sim = (1 if (my_z & bz) else 0) + (1 if (my_pres and b.get("presupuesto_max") and abs(my_pres - b["presupuesto_max"]) / max(my_pres, 1) < 0.3) else 0)
            if sim > 0 and cl.get("dev_id"):
                votes[cl["dev_id"]] += sim
                meta[cl["dev_id"]] = {"name": cl.get("dev_name"), "colonia": cl.get("colonia")}
        top = [{"dev_id": k, "name": meta[k]["name"], "colonia": meta[k]["colonia"], "cierres": v} for k, v in votes.most_common(limit)]
        return {"ok": True, "parecidos_cerraron": top}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[flywheel] parecidos-cerraron fail: {e}")
        return {"ok": True, "parecidos_cerraron": []}
