"""visitor_taste — el GUSTO del comprador PÚBLICO (visitor_id), HIPERGRANULAR, desde el espinazo + photo_tagger.

Paralelo público de `taste_profile.py` (que es asesor-only · asesor_swipe_events). Aprende de las señales de Atlax:
  - like/save (active)         → preferencia revelada POSITIVA (amplifica ×1.6 lo que vio en esas propiedades)
  - dismiss + motivo           → preferencia NEGATIVA (el porqué del NO) + atenúa lo que vio ahí
  - photo_dwell / photo_zoom   → tiempo/zoom por FOTO × los ATRIBUTOS de esa foto (cuarto + features: luz/vista/terraza)

Devuelve un perfil POSITIVO (cuartos·features·zonas·precio·amenidades) y uno NEGATIVO (qué evita) + un RESUMEN humano
para mostrárselo al comprador ("Atlax ya te conoce"). Reusa data_developments + photo_tagger (cero catálogo duplicado).
Cero PII (solo visitor_id anónimo). Fail-open en todo.
"""
import logging
from collections import Counter

log = logging.getLogger("dmx.visitor_taste")

ROOM_LABEL = {"sala": "salas con luz", "recamara": "recámaras", "bano": "baños", "cocina": "cocinas",
              "comedor": "comedores", "vista": "vistas", "terraza": "terrazas", "amenidad": "amenidades", "fachada": "fachadas"}
FEAT_LABEL = {"luz_natural": "mucha luz natural", "vista_ciudad": "vista a la ciudad", "vista_area_verde": "vista a áreas verdes",
              "terraza": "terraza", "doble_altura": "doble altura", "cocina_integral": "cocina integral", "acabados_lujo": "acabados de lujo"}
AMEN_LABEL = {"roof": "roof garden", "gym": "gym", "alberca": "alberca", "pet": "pet friendly", "cowork": "coworking", "seguridad": "seguridad", "jardines": "áreas verdes"}


def _devs_by_id():
    try:
        from data_developments import DEVELOPMENTS
        return {d.get("id"): d for d in DEVELOPMENTS}
    except Exception:  # noqa: BLE001
        return {}


async def build_visitor_taste(db, visitor_id: str):
    """Perfil de gusto granular de un visitante. None si no hay señal suficiente."""
    if not visitor_id or db is None:
        return None
    try:
        devs = _devs_by_id()
        # IDENTIDAD: une los dispositivos de la misma persona → el gusto la sigue cross-device (U1).
        try:
            from services.visitor_identity import resolve_visitors
            vids = await resolve_visitors(db, visitor_id)
        except Exception:  # noqa: BLE001
            vids = [visitor_id]
        liked, saved, dismissed = set(), set(), {}
        # V3-TASTE-DARK: la v3 (ficha unit-céntrica) emite "unit_save" con entity_id=dev_id ya resuelto → cuenta como
        # señal positiva (guardado) para que el gusto NO se apague al migrar a la ficha nueva. Aditivo, fail-soft.
        async for s in db.buyer_signals.find({"visitor_id": {"$in": vids}, "type": {"$in": ["like", "save", "unit_save"]}, "active": True}, {"_id": 0, "entity_id": 1, "type": 1}):
            if s.get("entity_id"):
                (liked if s["type"] == "like" else saved).add(s["entity_id"])
        pos_devs = liked | saved
        async for s in db.buyer_signals.find({"visitor_id": {"$in": vids}, "type": "dismiss"}, {"_id": 0, "entity_id": 1, "value": 1}):
            if s.get("entity_id"):
                dismissed[s["entity_id"]] = (s.get("value") or "").lower()

        # ── ATRIBUTOS por foto (dwell/zoom × tags de la foto) ────────────────────────
        room_score, feat_score, neg_attr = Counter(), Counter(), Counter()
        try:
            from photo_tagger import tag_from_url
        except Exception:  # noqa: BLE001
            tag_from_url = None
        if tag_from_url:
            async for s in db.buyer_signals.find({"visitor_id": {"$in": vids}, "type": {"$in": ["photo_dwell", "photo_zoom"]}}, {"_id": 0, "entity_id": 1, "value": 1, "dwell_ms": 1, "type": 1}):
                dev = devs.get(s.get("entity_id"))
                if not dev:
                    continue
                photos = dev.get("photos") or []
                try:
                    idx = int(s.get("value"))
                except (TypeError, ValueError):
                    idx = 0
                if idx < 0 or idx >= len(photos):
                    continue
                tags = tag_from_url(photos[idx]) or {}
                w = (s.get("dwell_ms") or 0) / 1000.0 if s["type"] == "photo_dwell" else 4.0  # zoom = interés fuerte (~4s)
                if w <= 0:
                    continue
                room, feats = tags.get("room"), (tags.get("features") or [])
                if s["entity_id"] in dismissed:
                    # tiempo en algo DESCARTADO = qué lo repele (perfil negativo)
                    if room:
                        neg_attr[room] += w
                    for f in feats:
                        neg_attr[f] += w
                else:
                    mult = 1.6 if s["entity_id"] in pos_devs else 1.0
                    if room and room != "interior":
                        room_score[room] += w * mult
                    for f in feats:
                        feat_score[f] += w * mult

        # ── zona + precio + amenidades desde lo GUSTADO / lo descartado ───────────────
        liked_col, rejected_col, prices, amen = Counter(), Counter(), [], Counter()
        for did in pos_devs:
            d = devs.get(did) or {}
            if d.get("colonia"):
                liked_col[d["colonia"]] += 1
            if d.get("price_from"):
                prices.append(d["price_from"])
            for a in (d.get("amenities") or []):
                amen[a] += 1
        for did, reason in dismissed.items():
            d = devs.get(did) or {}
            if d.get("colonia") and reason == "zona":
                rejected_col[d["colonia"]] += 1
        reasons = Counter(r for r in dismissed.values() if r)

        evita = []
        for k, _ in neg_attr.most_common(3):
            evita.append(FEAT_LABEL.get(k) or ROOM_LABEL.get(k) or k.replace("_", " "))

        profile = {
            "visitor_id": {"$in": vids},
            "rooms": [{"k": k, "label": ROOM_LABEL.get(k, k), "score": round(v, 1)} for k, v in room_score.most_common(4)],
            "features": [{"k": k, "label": FEAT_LABEL.get(k, k.replace("_", " ")), "score": round(v, 1)} for k, v in feat_score.most_common(4)],
            "zonas_gustan": [c for c, _ in liked_col.most_common(3)],
            "zonas_evita": [c for c, _ in rejected_col.most_common(2)],
            "precio_techo": max(prices) if prices else None,
            "amenidades": [AMEN_LABEL.get(a, a) for a, _ in amen.most_common(4)],
            "evita": evita,
            # claves CRUDAS para el ranking (no para mostrar) — el gusto hipergranular que ordena los resultados.
            "keys": {
                "rooms": [k for k, _ in room_score.most_common(5)],
                "features": [k for k, _ in feat_score.most_common(5)],
                "amenities": [a for a, _ in amen.most_common(6)],
                "evita": [k for k, _ in neg_attr.most_common(4)],
                "zonas_gustan": [str(c).lower() for c, _ in liked_col.most_common(4)],
                "zonas_evita": [str(c).lower() for c, _ in rejected_col.most_common(3)],
            },
            "motivos_no": [r for r, _ in reasons.most_common(3)],
            "n_gustadas": len(pos_devs), "n_descartadas": len(dismissed),
            "confianza": int(min(92, len(pos_devs) * 16 + sum(feat_score.values()) / 6 + sum(room_score.values()) / 6)),
        }
        profile["resumen"] = _resumen(profile)
        return profile if (profile["n_gustadas"] or profile["n_descartadas"] or profile["rooms"] or profile["features"]) else None
    except Exception as e:  # noqa: BLE001
        log.warning(f"[visitor_taste] fail-open: {e}")
        return None


def _resumen(p):
    """Frase humana para mostrarle al comprador: 'Atlax ya te conoce: …'."""
    likes = [x["label"] for x in (p.get("features") or [])][:2] + [x["label"] for x in (p.get("rooms") or [])][:1]
    bits = []
    if likes:
        bits.append("te gusta " + ", ".join(likes))
    if p.get("zonas_gustan"):
        bits.append("prefieres " + p["zonas_gustan"][0])
    if p.get("amenidades") and not likes:
        bits.append("buscas " + ", ".join(p["amenidades"][:2]))
    if p.get("evita"):
        bits.append("evitas " + p["evita"][0])
    return ("Atlax ya te conoce: " + " · ".join(bits) + ".") if bits else None


async def get_visitor_taste_cached(db, visitor_id):
    """Oportunidad #1: taste materializado (cache ~24h) en vez de recomputarlo en CADA ranking. Se invalida en cada
    señal que cambia el gusto → siempre fresco. Reusa resolve_visitors (la persona). Fail-open al cómputo directo."""
    from datetime import datetime as _dt
    try:
        from services.visitor_identity import resolve_visitors
        key = (await resolve_visitors(db, visitor_id) or [visitor_id])[0]
    except Exception:  # noqa: BLE001
        key = visitor_id
    try:
        doc = await db.visitor_taste_materialized.find_one({"visitor_id": key}, {"_id": 0, "taste": 1})
        if doc and "taste" in doc:
            return doc["taste"]
    except Exception:  # noqa: BLE001
        pass
    taste = await build_visitor_taste(db, visitor_id)
    try:
        # sanitiza: quita el campo 'visitor_id' (lleva {$in:...} = clave $ no almacenable); nada lo consume.
        store = {kk: vv for kk, vv in (taste or {}).items() if kk != "visitor_id"} if taste else None
        await db.visitor_taste_materialized.update_one(
            {"visitor_id": key},
            {"$set": {"visitor_id": key, "taste": store, "computed_at_dt": _dt.utcnow()}}, upsert=True)
    except Exception:  # noqa: BLE001
        pass
    return taste


async def invalidate_visitor_taste(db, visitor_id):
    """Borra el taste materializado de la persona (todos sus visitor_id) → fresco a la próxima."""
    try:
        from services.visitor_identity import resolve_visitors
        vids = await resolve_visitors(db, visitor_id) or [visitor_id]
    except Exception:  # noqa: BLE001
        vids = [visitor_id]
    try:
        await db.visitor_taste_materialized.delete_many({"visitor_id": {"$in": vids}})
    except Exception:  # noqa: BLE001
        pass


async def score_devs(db, visitor_id, devs):
    """Rankea una lista de desarrollos por el GUSTO HIPERGRANULAR del visitante: zona (gustada/evitada) · amenidades ·
    precio vs su techo · FEATURES de las fotos (luz/vista/terraza, vía photo_tagger) + perfil NEGATIVO. {dev_id: 0-100}.
    Vacío si no hay gusto → el caller cae al orden normal. Fail-open. Usado por /api/developments/casi para reordenar."""
    try:
        p = await get_visitor_taste_cached(db, visitor_id)   # #1: cache (recomputaba en cada búsqueda)
        if not p:
            return {}
        k = p.get("keys") or {}
        gustan, evita_z = set(k.get("zonas_gustan") or []), set(k.get("zonas_evita") or [])
        liked_amen = set(k.get("amenities") or [])
        liked_feat = set(k.get("features") or []) | set(k.get("rooms") or [])
        evita_attr = set(k.get("evita") or [])
        techo = p.get("precio_techo")
        try:
            from photo_tagger import tag_from_url
        except Exception:  # noqa: BLE001
            tag_from_url = None
        out = {}
        # #3 cerrar el aprendizaje: el ranking aprende de QUÉ CIERRA (lifts de cerebro materializados por el cierre).
        # Devs con recámaras que históricamente cierran reciben un empujón → el marketplace mejora SOLO con cada venta.
        rec_lift, real = {}, {}
        try:
            cl = await db.closing_lifts.find_one({"_id": "global"}, {"_id": 0, "recamaras": 1, "real": 1})
            rec_lift = (cl or {}).get("recamaras") or {}
            real = (cl or {}).get("real") or {}
        except Exception:  # noqa: BLE001
            pass
        real_n = int(real.get("n") or 0)
        real_rec = real.get("recamaras") or {}
        real_pre = real.get("precio") or {}
        _band = None
        if real_n >= 3:   # solo aprende de cierres reales cuando ya hay señal (≥3) — abajo de eso, ruido
            try:
                from cerebro_mercado_engine import _precio_band as _band
            except Exception:  # noqa: BLE001
                _band = None
        for d in (devs or []):
            did = d.get("id")
            if not did:
                continue
            s = 50.0
            col = (d.get("colonia") or "").lower()
            if col and col in gustan:
                s += 18
            elif col and col in evita_z:
                s -= 22
            s += min(18, 6 * len(set(d.get("amenities") or []) & liked_amen))
            pf = d.get("price_from")
            if techo and pf:
                if pf <= techo * 1.05:
                    s += 8
                elif pf > techo * 1.2:
                    s -= 10
            if tag_from_url and (liked_feat or evita_attr):
                attrs = set()
                for ph in (d.get("photos") or [])[:6]:
                    t = tag_from_url(ph) or {}
                    if t.get("room"):
                        attrs.add(t["room"])
                    for f in (t.get("features") or []):
                        attrs.add(f)
                s += min(15, 5 * len(attrs & liked_feat))
                s -= 6 * len(attrs & evita_attr)
            # recámaras del dev (rango) — base de los empujones por cierre. El gusto manda; los cierres nudgean.
            br = d.get("bedrooms_range") or d.get("recamaras_range") or []
            bvals = []
            if isinstance(br, (list, tuple)) and br:
                try:
                    bvals = list(range(int(br[0]), int(br[-1]) + 1))
                except (ValueError, TypeError):
                    bvals = []
            elif str(d.get("recamaras") or "").isdigit():
                bvals = [int(d["recamaras"])]
            if rec_lift:   # #3 catálogo-proxy (cold-start). Cuando ya hay cierres REALES (≥3) pesa la MITAD: la verdad
                # de campo (real, abajo) manda y el catálogo solo apoya → evita doble conteo (Audit B 🟠).
                best = max((rec_lift.get(str(v), 0) for v in bvals), default=0)
                s += max(-4.0, min(8.0, best * 0.3)) * (0.5 if real_n >= 3 else 1.0)
            if real_n >= 3:   # #B1 CIERRES REALES (ground truth): share por recámaras + banda de precio que de verdad cerró
                rshare = max((real_rec.get(str(v), 0) / real_n for v in bvals), default=0.0)
                s += max(-3.0, min(5.0, rshare * 5.0))
                if _band:
                    band = _band(d.get("price_from") or d.get("price"))
                    if band:
                        s += max(-2.0, min(3.0, (real_pre.get(band, 0) / real_n) * 3.0))
            out[did] = max(0.0, min(100.0, s))
        return out
    except Exception as e:  # noqa: BLE001
        log.warning(f"[visitor_taste] score_devs fail: {e}")
        return {}
