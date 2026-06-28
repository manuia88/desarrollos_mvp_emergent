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
        liked, saved, dismissed = set(), set(), {}
        async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": {"$in": ["like", "save"]}, "active": True}, {"_id": 0, "entity_id": 1, "type": 1}):
            if s.get("entity_id"):
                (liked if s["type"] == "like" else saved).add(s["entity_id"])
        pos_devs = liked | saved
        async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": "dismiss"}, {"_id": 0, "entity_id": 1, "value": 1}):
            if s.get("entity_id"):
                dismissed[s["entity_id"]] = (s.get("value") or "").lower()

        # ── ATRIBUTOS por foto (dwell/zoom × tags de la foto) ────────────────────────
        room_score, feat_score, neg_attr = Counter(), Counter(), Counter()
        try:
            from photo_tagger import tag_from_url
        except Exception:  # noqa: BLE001
            tag_from_url = None
        if tag_from_url:
            async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": {"$in": ["photo_dwell", "photo_zoom"]}}, {"_id": 0, "entity_id": 1, "value": 1, "dwell_ms": 1, "type": 1}):
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
            "visitor_id": visitor_id,
            "rooms": [{"k": k, "label": ROOM_LABEL.get(k, k), "score": round(v, 1)} for k, v in room_score.most_common(4)],
            "features": [{"k": k, "label": FEAT_LABEL.get(k, k.replace("_", " ")), "score": round(v, 1)} for k, v in feat_score.most_common(4)],
            "zonas_gustan": [c for c, _ in liked_col.most_common(3)],
            "zonas_evita": [c for c, _ in rejected_col.most_common(2)],
            "precio_techo": max(prices) if prices else None,
            "amenidades": [AMEN_LABEL.get(a, a) for a, _ in amen.most_common(4)],
            "evita": evita,
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
