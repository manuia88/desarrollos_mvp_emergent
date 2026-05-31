"""B5.4 Capa 3 · El perfil de gusto.

Une las 3 fuentes en un retrato del cliente:
  - Capa 1 (asesor_swipe_events): tiempo por foto, regresos, abrir detalle, velocidad de decisión.
  - Capa 2 (asesor_photo_tags): qué cuarto/característica es cada foto.
  - B5.3 (asesor_lead_properties): qué propiedades aceptó/rechazó + zona/precio.

Salida (asesor_taste_profile): cuartos que le importan, características, zona, precio,
en POSITIVO Y negativo, + nivel de confianza (no mostrar 92% con 1 swipe).

Honestidad: el tiempo tiene ruido → SIEMPRE se combina con lo explícito (👍/👎 + motivo).
El dwell de una foto cuenta como interés en ESE tipo de cuarto, amplificado si la
propiedad terminó gustando, atenuado si se rechazó. Los regresos pesan más que el tiempo.
"""

from collections import defaultdict, Counter
from datetime import datetime, timezone

POSITIVE_STATUS = {"le_gusto", "cita", "visitada", "oferta"}
STATUS_ALIAS = {"dispo": "por_verificar", "gusto": "le_gusto"}  # normaliza estatus viejos


def _st(item):
    return STATUS_ALIAS.get(item.get("status"), item.get("status")) if item else None

FEATURE_ES = {
    "luz_natural": "luz natural", "ventanal": "ventanales", "moderno": "estilo moderno",
    "lujo": "acabados premium", "amplio": "espacios amplios", "vista_ciudad": "vista a la ciudad",
    "madera": "madera", "verde": "áreas verdes",
}
ROOM_ES = {
    "sala": "salas", "recamara": "recámaras", "cocina": "cocinas", "bano": "baños",
    "comedor": "comedores", "terraza": "terrazas", "vista": "vistas", "amenidad": "amenidades",
    "fachada": "fachadas", "interior": "interiores",
}


def _now():
    return datetime.now(timezone.utc)


def _norm(d: dict, cap: int = 100):
    """dict {k:peso} → lista ordenada [{key,score 0-cap}] (relativo al máximo)."""
    if not d:
        return []
    mx = max(d.values()) or 1
    out = [{"key": k, "score": int(round(cap * v / mx))} for k, v in d.items()]
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


async def build_taste_profile(db, owner_id: str, contacto_id: str, persist: bool = True) -> dict:
    """Construye (y persiste) el perfil de gusto del lead. Idempotente, recalcula cada vez."""
    q = {"owner_id": owner_id, "contacto_id": contacto_id}

    items = await db.asesor_lead_properties.find(q, {"_id": 0}).to_list(300)
    items_by_id = {it.get("id"): it for it in items}
    dev_ids = list({it.get("dev_id") for it in items if it.get("dev_id")})

    # photo_tags de los devs en juego → (dev_id, photo_idx) → tag
    tags_by = {}
    if dev_ids:
        async for t in db.asesor_photo_tags.find({"dev_id": {"$in": dev_ids}}, {"_id": 0}):
            tags_by[(t.get("dev_id"), t.get("photo_idx"))] = t

    events = await db.asesor_swipe_events.find(q, {"_id": 0}).to_list(2000)

    rooms = defaultdict(float)
    room_labels = {}
    feats = defaultdict(float)
    n_photo, n_return, n_detail, n_decision = 0, 0, 0, 0

    def _item_mult(item):
        if not item:
            return 1.0
        st = _st(item)
        if st in POSITIVE_STATUS:
            return 1.6   # lo que miró en algo que le gustó pesa más
        if st == "descartada":
            return 0.7   # lo que miró en algo que rechazó pesa menos (pero no cero: la foto le llamó)
        return 1.0

    for ev in events:
        t = ev.get("type")
        item = items_by_id.get(ev.get("item_id"))
        mult = _item_mult(item)
        dev_id = ev.get("dev_id") or (item.get("dev_id") if item else None)
        tag = tags_by.get((dev_id, ev.get("photo_idx")))
        if t == "photo_view":
            n_photo += 1
            secs = (ev.get("dwell_ms") or 0) / 1000.0
            if tag and secs > 0:
                rooms[tag["room"]] += secs * mult
                room_labels[tag["room"]] = tag.get("room_label")
                for f in (tag.get("features") or []):
                    feats[f] += secs * 0.5 * mult
        elif t == "photo_return":
            n_return += 1
            if tag:
                rooms[tag["room"]] += 4.0 * mult   # regreso = señal fuerte
                room_labels[tag["room"]] = tag.get("room_label")
                for f in (tag.get("features") or []):
                    feats[f] += 2.0 * mult
        elif t in ("detail_open", "detail_dwell"):
            n_detail += 1
        elif t == "decision":
            n_decision += 1

    # B5.5 Upgrade B · señales de lo que el cliente ESCRIBIÓ por WhatsApp (asesor_text_signals).
    n_text = 0
    try:
        async for ts in db.asesor_text_signals.find(q, {"_id": 0}):
            for s in (ts.get("signals") or []):
                n_text += 1
                pol = s.get("polarity")
                wt = 28 if pol in ("pos", "wants") else 14 if pol == "neu" else 8
                if s.get("kind") == "room":
                    rooms[s["value"]] += wt
                    room_labels[s["value"]] = s.get("label") or room_labels.get(s["value"])
                elif s.get("kind") == "feature":
                    feats[s["value"]] += wt
    except Exception:
        pass

    # Zona y precio (preferencia revelada de los swipes — reusa la lógica de B5.3)
    liked_col, rejected_col, liked_prices = set(), set(), []
    budget_ceiling = None
    for it in items:
        col = (it.get("colonia") or "").strip()
        st = _st(it)
        price = it.get("price")
        if st in POSITIVE_STATUS:
            if col:
                liked_col.add(col)
            if price:
                liked_prices.append(int(price))
        elif st == "descartada":
            r = (it.get("pass_reason") or "").lower()
            if "presupuesto" in r and price:
                budget_ceiling = min(budget_ceiling, int(price)) if budget_ceiling else int(price)
            if "colonia" in r and col:
                rejected_col.add(col)

    rooms_n = [{"room": x["key"], "label": room_labels.get(x["key"]) or ROOM_ES.get(x["key"], x["key"]).capitalize(),
                "score": x["score"]} for x in _norm(rooms)][:4]
    feats_n = [{"key": x["key"], "label": FEATURE_ES.get(x["key"], x["key"]), "score": x["score"]}
               for x in _norm(feats)][:4]

    # Confianza: cuánta señal real hay (no inflar con pocos datos)
    signal = n_decision * 7 + n_photo * 1.5 + n_return * 4 + n_detail * 3 + len(liked_col) * 5 + n_text * 6
    confidence = int(min(92, max(8, round(signal))))
    conf_label = "alta" if confidence >= 70 else "media" if confidence >= 40 else "baja"

    typical = sorted(liked_prices)[len(liked_prices) // 2] if liked_prices else None

    profile = {
        "owner_id": owner_id, "contacto_id": contacto_id,
        "rooms": rooms_n, "features": feats_n,
        "zone": {"liked": sorted(liked_col), "rejected": sorted(rejected_col)},
        "price": {"ceiling": budget_ceiling, "typical": typical},
        "confidence": confidence, "confidence_label": conf_label,
        "signal_count": int(n_decision + n_photo + n_return + n_detail + n_text),
        "counts": {"decisions": n_decision, "photo_views": n_photo, "returns": n_return, "details": n_detail},
        "updated_at": _now(),
    }

    if persist:
        try:
            await db.asesor_taste_profile.update_one(
                q, {"$set": profile}, upsert=True)
        except Exception:
            pass
    profile.pop("_id", None)
    return profile


# B5.5 Upgrade B · extraer preferencias de lo que el cliente ESCRIBE por WhatsApp.
_ROOM_WORDS = {"cocina": "cocina", "sala": "sala", "recámara": "recamara", "recamara": "recamara",
               "cuarto": "recamara", "baño": "bano", "bano": "bano", "terraza": "terraza",
               "balcón": "terraza", "balcon": "terraza", "vista": "vista", "comedor": "comedor"}
_POS_WORDS = ["encanta", "me gusta", "me late", "amo", "perfecto", "hermosa", "hermoso", "bonita",
              "bonito", "amplia", "amplio", "grande", "luminos", "ideal", "espacioso", "me fascina"]
_NEG_WORDS = ["chica", "chico", "pequeñ", "pequen", "oscura", "oscuro", "fea", "feo", "caro", "cara",
              "lejos", "ruidos", "no me", "muy chico", "estrech"]


def _polarity_near(t: str, idx: int, window: int = 32) -> str:
    seg = t[max(0, idx - window): idx + window]
    neg = any(n in seg for n in _NEG_WORDS)
    pos = any(p in seg for p in _POS_WORDS)
    return "neg" if neg and not pos else "pos" if pos and not neg else "neu"


def extract_text_signals(text: str) -> dict:
    """Heurística ligera: de un WhatsApp del cliente → preferencias {cuarto/feature, polaridad}.
    Honesto: es heurístico (no NLP profundo); el asesor ve lo detectado y puede ignorar errores."""
    t = (text or "").lower()
    signals = []
    seen = set()
    for w, room in _ROOM_WORDS.items():
        i = t.find(w)
        if i >= 0 and room not in seen:
            seen.add(room)
            signals.append({"kind": "room", "value": room, "label": ROOM_ES.get(room, room),
                            "polarity": _polarity_near(t, i)})
    if any(x in t for x in ["luz", "luminos", "iluminad"]):
        signals.append({"kind": "feature", "value": "luz_natural", "label": "luz natural",
                        "polarity": "neg" if any(n in t for n in _NEG_WORDS[:8]) else "pos"})
    if any(x in t for x in ["amplia", "amplio", "grande", "espacios", "espacioso"]):
        signals.append({"kind": "feature", "value": "amplio", "label": "espacios amplios", "polarity": "pos"})
    if any(x in t for x in ["chica", "chico", "pequeñ", "pequen", "estrech"]):
        signals.append({"kind": "feature", "value": "amplio", "label": "espacios amplios", "polarity": "wants"})
    if any(x in t for x in ["moderno", "moderna", "contemporán", "contemporan"]):
        signals.append({"kind": "feature", "value": "moderno", "label": "estilo moderno", "polarity": "pos"})
    if any(x in t for x in ["caro", "cara", "presupuesto", "precio", "carísim"]):
        signals.append({"kind": "budget", "value": "precio", "label": "precio", "polarity": "neg"})
    pos = sum(t.count(w) for w in _POS_WORDS)
    neg = sum(t.count(w) for w in _NEG_WORDS)
    sentiment = "positivo" if pos > neg else "negativo" if neg > pos else "neutral"
    return {"signals": signals, "sentiment": sentiment}


async def build_prospect_intel(db, owner_id: str) -> dict:
    """B5.4 Capa 6 · El NORTE — inteligencia agregada de TODOS los prospectos del asesor.
    Convierte el gusto individual en producto/marketing: 'el 70% se clava en las cocinas',
    'preventa rechazada por el 40%', 'Altavista convierte 60%'. Alimenta el lado developer.
    Read-time, sin colección nueva. FAIL-OPEN."""
    profiles = await db.asesor_taste_profile.find({"owner_id": owner_id}, {"_id": 0}).to_list(2000)
    rooms, feats = defaultdict(float), defaultdict(float)
    room_labels, feat_labels = {}, {}
    top_room_count = Counter()
    signal_leads = 0
    for p in profiles:
        if (p.get("signal_count") or 0) < 1:
            continue
        signal_leads += 1
        for r in (p.get("rooms") or []):
            rooms[r["room"]] += r["score"]
            room_labels[r["room"]] = r["label"]
        for f in (p.get("features") or []):
            feats[f["key"]] += f["score"]
            feat_labels[f["key"]] = f["label"]
        if p.get("rooms"):
            top_room_count[p["rooms"][0]["room"]] += 1

    items = await db.asesor_lead_properties.find({"owner_id": owner_id}, {"_id": 0}).to_list(8000)
    by_dev = {}
    reject_reasons = Counter()
    total_likes = total_dislikes = 0
    for it in items:
        st = STATUS_ALIAS.get(it.get("status"), it.get("status"))
        dev = it.get("dev_id") or "?"
        d = by_dev.setdefault(dev, {"likes": 0, "dislikes": 0, "name": None})
        d["name"] = it.get("name") or dev
        if st in POSITIVE_STATUS:
            d["likes"] += 1
            total_likes += 1
        elif st == "descartada":
            d["dislikes"] += 1
            total_dislikes += 1
            r = (it.get("pass_reason") or "").strip()
            if r:
                reject_reasons[r] += 1

    top_rooms = [{"room": x["key"], "label": room_labels.get(x["key"], x["key"]), "score": x["score"]}
                 for x in _norm(rooms)][:4]
    top_features = [{"key": x["key"], "label": feat_labels.get(x["key"], x["key"]), "score": x["score"]}
                    for x in _norm(feats)][:4]

    devs = []
    for dev, d in by_dev.items():
        tot = d["likes"] + d["dislikes"]
        if tot == 0:
            continue
        devs.append({"dev_id": dev, "name": d["name"], "likes": d["likes"], "dislikes": d["dislikes"],
                     "accept_rate": int(round(100 * d["likes"] / tot))})
    devs.sort(key=lambda x: -(x["likes"] + x["dislikes"]))

    # Insights en lenguaje llano (lo que el founder pidió ver)
    insights = []
    if signal_leads and top_room_count:
        room, cnt = top_room_count.most_common(1)[0]
        pct = int(round(100 * cnt / signal_leads))
        insights.append(f"El {pct}% de tus prospectos se fija sobre todo en {room_labels.get(room, room).lower()}.")
    if top_features:
        insights.append("Lo que más les llama: " + ", ".join(f["label"] for f in top_features[:2]) + ".")
    if reject_reasons:
        rr, cnt = reject_reasons.most_common(1)[0]
        insights.append(f"Razón #1 de rechazo: «{rr}» ({cnt} {'vez' if cnt == 1 else 'veces'}).")
    if devs:
        best = max(devs, key=lambda x: x["accept_rate"])
        worst = min(devs, key=lambda x: x["accept_rate"])
        if best["likes"] + best["dislikes"] >= 2:
            insights.append(f"{best['name']} es la que mejor convierte ({best['accept_rate']}% 👍).")
        if worst["dev_id"] != best["dev_id"] and worst["dislikes"] >= 2:
            insights.append(f"{worst['name']} es la que más rechazan ({100 - worst['accept_rate']}% 👎).")

    return {
        "signal_leads": signal_leads,
        "top_rooms": top_rooms, "top_features": top_features,
        "by_development": devs[:8],
        "reject_reasons": [{"reason": r, "count": c} for r, c in reject_reasons.most_common(5)],
        "totals": {"likes": total_likes, "dislikes": total_dislikes},
        "insights": insights,
    }


def build_brief(items: list, taste: dict) -> dict:
    """B5.4 Capa 5 · Brief de venta — convierte el modelo en la acción #1 del asesor.
    No es un % más: es 'qué hacer ahora' según en qué etapa está el pipeline del lead."""
    by = defaultdict(int)
    for it in (items or []):
        by[_st(it)] += 1
    oferta, cita, visitada = by["oferta"], by["cita"], by["visitada"]
    liked, enviada, por_ver = by["le_gusto"], by["enviada"], by["por_verificar"]
    total = sum(by.values())

    if oferta:
        step = {"text": f"Tienes {oferta} en oferta — respáldala con el precio sugerido y cierra.", "cta": "oferta"}
    elif cita:
        step = {"text": f"Confirma horario de {cita} cita(s) con propietario/broker y arma el recorrido.", "cta": "recorrido"}
    elif visitada:
        step = {"text": "Ya visitó — recoge su feedback y empuja a oferta lo que le gustó.", "cta": "oferta"}
    elif liked:
        step = {"text": f"Le gustaron {liked} — agéndale visita a las de mayor match.", "cta": "agendar"}
    elif enviada:
        step = {"text": "Link enviado — espera sus swipes o mándale un recordatorio por WhatsApp.", "cta": "wa"}
    elif por_ver:
        step = {"text": f"Verifica disponibilidad de {por_ver} y mándale el link para que deslice.", "cta": "link"}
    elif total == 0:
        step = {"text": "Agrega 3-5 propiedades y manda el link Tinder para empezar a aprender su gusto.", "cta": "addprop"}
    else:
        step = {"text": "Manda el link de propiedades para que el cliente empiece a deslizar.", "cta": "link"}

    head = (taste or {}).get("summary") or ""
    avoid = []
    z = (taste or {}).get("zone", {}).get("rejected") or []
    if z:
        avoid.append("zonas " + ", ".join(z[:2]))
    ceil = (taste or {}).get("price", {}).get("ceiling")
    if ceil:
        avoid.append(f"arriba de ${ceil:,.0f}".replace(",", ","))
    return {"next_step": step, "headline": head, "avoid": avoid}


def taste_summary_line(profile: dict) -> str:
    """Una línea en español llano para el asesor: lo que le importa al lead."""
    if not profile:
        return ""
    bits = []
    rooms = [r["label"].lower() for r in (profile.get("rooms") or [])[:2]]
    feats = [f["label"] for f in (profile.get("features") or [])[:2]]
    if rooms:
        bits.append("se fija en " + " y ".join(rooms))
    if feats:
        bits.append("le importa " + " y ".join(feats))
    z = profile.get("zone", {}).get("liked") or []
    if z:
        bits.append("zona " + ", ".join(z[:2]))
    return " · ".join(bits)
