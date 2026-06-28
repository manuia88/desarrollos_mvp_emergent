"""B5.4 Capa 2 · Entender las fotos.

Convierte cada foto en {cuarto, características} para que el perfil de gusto (Capa 3)
pueda decir "se clavó en las SALAS con luz" en vez de solo "le gustó la propiedad".

Dos caminos (el sistema soporta ambos · se elige solo según la foto):
  - tag_from_url(url): saca el cuarto de las palabras del URL. Camino del DEMO
    (las fotos semilla son source.unsplash.com/?living-room,modern → 'sala'). Gratis, instantáneo.
  - tag_with_vision(url): IA de visión real para FOTOS REALES subidas por el asesor.
    Cableado y listo; se activa cuando existan fotos reales (las del demo están muertas).

Cache idempotente en `asesor_photo_tags` (una vez por dev_id+photo_idx).
"""

import os
import asyncio
from datetime import datetime, timezone
from urllib.parse import urlparse

# cuarto → palabras que lo delatan (en URL o en respuesta de visión)
ROOM_KEYWORDS = {
    "sala": ["living-room", "living", "sala", "lounge", "family-room"],
    "recamara": ["bedroom", "suite", "recamara", "master", "dormitorio"],
    "cocina": ["kitchen", "cocina", "pantry"],
    "bano": ["bathroom", "bath", "ensuite", "shower", "bano"],
    "comedor": ["dining", "comedor", "dining-room"],
    "terraza": ["terrace", "balcony", "rooftop", "patio", "terraza", "garden"],
    "vista": ["view", "skyline", "panoramic", "city-view", "vista"],
    "amenidad": ["pool", "gym", "spa", "lobby", "amenity", "amenities", "clubhouse"],
    "fachada": ["facade", "exterior", "building", "architecture", "fachada"],
}

# característica → palabras que la delatan
FEATURE_KEYWORDS = {
    "luz_natural": ["bright", "sunlight", "natural-light", "luminous", "sunny", "window"],
    "ventanal": ["floor-to-ceiling", "window", "glass", "ventanal"],
    "moderno": ["modern", "contemporary", "minimalist", "minimal"],
    "lujo": ["luxury", "luxe", "premium", "penthouse", "elegant"],
    "amplio": ["spacious", "open-plan", "open", "loft", "wide"],
    "vista_ciudad": ["skyline", "city-view", "panoramic", "cityscape"],
    "madera": ["wood", "wooden", "parquet", "hardwood", "madera"],
    "verde": ["garden", "green", "plants", "park", "trees"],
}

ROOM_ES = {
    "sala": "Sala", "recamara": "Recámara", "cocina": "Cocina", "bano": "Baño",
    "comedor": "Comedor", "terraza": "Terraza", "vista": "Vista", "amenidad": "Amenidad",
    "fachada": "Fachada", "interior": "Interior",
}

# URLs muertas (no se pueden taggear con visión) → forzar camino URL
DEAD_HOSTS = ("source.unsplash.com",)


def _now():
    return datetime.now(timezone.utc)


def _keywords_from_url(url: str):
    """Saca SOLO las palabras descriptivas del URL, sin el slug/sig ni las dimensiones.
    El `sig=<dev-slug>` (p.ej. altavista-polanco) NO se incluye: 'altavista' contiene
    'vista' y ensuciaba el match. Soporta unsplash ?a,b,c y fotos reales nombre-archivo."""
    try:
        p = urlparse(url)
        kws = []
        # query: PRIMER segmento — unsplash (?living-room,modern) o picsum/seed (?kw=bedroom,suite). Toma el valor tras
        # '=' (kw=…), pero NUNCA el slug del dev (&sig=… → 'altavista' contiene 'vista' y ensucia el match).
        first = (p.query or "").split("&")[0]
        if first and not first.startswith("sig="):
            val = first.split("=", 1)[1] if "=" in first else first
            kws += val.lower().split(",")
        # path de fotos reales (kitchen-modern.jpg) — sin dimensiones/extensión/ruido
        toks = p.path.lower().replace("/", " ").replace("-", " ").replace("_", " ").replace(".", " ").split()
        skip = {"featured", "jpg", "jpeg", "png", "webp", "photo", "image", "img"}
        kws += [t for t in toks if t not in skip and not any(ch.isdigit() for ch in t)]
        return [k.strip() for k in kws if k.strip()]
    except Exception:
        return []


def _match(keywords, table):
    """keywords → primera categoría que pegue (room) o todas (features)."""
    hits = []
    joined = " ".join(keywords)
    for cat, words in table.items():
        for w in words:
            if w in joined or w in keywords:
                hits.append(cat)
                break
    return hits


def tag_from_url(url: str) -> dict:
    """Camino demo/fallback: cuarto + características desde las palabras del URL."""
    kws = _keywords_from_url(url)
    rooms = _match(kws, ROOM_KEYWORDS)
    feats = _match(kws, FEATURE_KEYWORDS)
    room = rooms[0] if rooms else "interior"
    return {"room": room, "room_label": ROOM_ES.get(room, "Interior"),
            "features": feats[:4], "source": "url"}


def _is_taggable_image(url: str) -> bool:
    """¿Es una foto real que la visión puede leer? (no las muertas de unsplash source)."""
    if not url or not isinstance(url, str):
        return False
    host = (urlparse(url).netloc or "").lower()
    return not any(h in host for h in DEAD_HOSTS)


async def tag_with_vision(url: str) -> dict:
    """IA de visión real (OpenAI gpt-4o-mini). Para fotos reales subidas por el asesor.
    Si falla o no hay llave → cae a tag_from_url (nunca rompe el flujo)."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key or not _is_taggable_image(url):
        return tag_from_url(url)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        prompt = (
            "Eres un tasador inmobiliario. Mira la foto y responde SOLO un JSON: "
            '{"room":"<sala|recamara|cocina|bano|comedor|terraza|vista|amenidad|fachada|interior>",'
            '"features":["<hasta 4 de: luz_natural,ventanal,moderno,lujo,amplio,vista_ciudad,madera,verde>"]}'
        )

        def _call():
            r = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": url}},
                ]}],
                max_tokens=120, temperature=0,
            )
            return r.choices[0].message.content

        import json
        raw = await asyncio.to_thread(_call)
        raw = (raw or "").strip().strip("`")
        if raw.startswith("json"):
            raw = raw[4:].strip()
        data = json.loads(raw)
        room = str(data.get("room") or "interior").lower()
        feats = [str(f).lower() for f in (data.get("features") or [])][:4]
        return {"room": room, "room_label": ROOM_ES.get(room, "Interior"),
                "features": feats, "source": "vision"}
    except Exception:
        return tag_from_url(url)


async def ensure_tags(db, dev_id: str, photos: list, use_vision: bool = False) -> list:
    """Devuelve [{room, room_label, features, source}] por foto. Cachea en asesor_photo_tags.
    Idempotente: solo taggea las fotos que aún no están en cache."""
    if not dev_id or not photos:
        return []
    cached = {}
    try:
        async for d in db.asesor_photo_tags.find({"dev_id": dev_id}, {"_id": 0}):
            cached[d.get("photo_idx")] = d
    except Exception:
        pass
    out, new_docs = [], []
    for i, url in enumerate(photos):
        if i in cached:
            out.append(cached[i])
            continue
        if use_vision and _is_taggable_image(url):
            tag = await tag_with_vision(url)
        else:
            tag = tag_from_url(url)
        doc = {"dev_id": dev_id, "photo_idx": i, "photo_url": url,
               "room": tag["room"], "room_label": tag["room_label"],
               "features": tag["features"], "source": tag["source"], "ts": _now()}
        new_docs.append(doc)
        out.append(doc)
    if new_docs:
        try:
            await db.asesor_photo_tags.insert_many(new_docs, ordered=False)
        except Exception:
            pass
    return out
