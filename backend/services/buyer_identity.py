"""Resolvedor canónico de identidad comprador para el módulo asesor (E0.5).

Un contacto/lead del asesor → user_id del comprador → buyer_score, cruzando por
EMAIL exacto O TELÉFONO normalizado (últimos 10 dígitos). Reusa los normalizadores
de entity_resolution_engine (fuente única de normalización).

Reemplaza los JOIN email-only dispersos (advisor list_contactos, _contacto_user_id,
alertas). Antes: un contacto alta-manual sin email coincidente → score vacío aunque
el comprador exista con el mismo teléfono. Ahora también cruza por teléfono.

Escala: el índice por teléfono se arma en memoria desde usuarios que YA tienen
buyer_score (el conjunto relevante para el JOIN). A mayor volumen, persistir
users.phone_norm + índice Mongo y reemplazar build_buyer_index por una query directa.
"""
import logging
from typing import Optional, List, Dict, Tuple

from entity_resolution_engine import normalize_phone

log = logging.getLogger("dmx.buyer_identity")


def emails_of(doc: dict) -> List[str]:
    """Emails crudos del doc (lista `emails` + campo `email`). Sin lowercasing:
    preserva el match exacto que ya existía (no regresa comportamiento)."""
    out = list(doc.get("emails") or [])
    if doc.get("email"):
        out.append(doc["email"])
    return [e for e in out if e and isinstance(e, str)]


def phones_of(doc: dict) -> List[str]:
    """Teléfonos normalizados (últimos 10 dígitos) del doc (`phones` + `phone`)."""
    out = list(doc.get("phones") or [])
    if doc.get("phone"):
        out.append(doc["phone"])
    seen, res = set(), []
    for p in out:
        n = normalize_phone(p)
        if n and n not in seen:
            seen.add(n)
            res.append(n)
    return res


async def build_buyer_index(db) -> Tuple[Dict[str, str], Dict[str, str]]:
    """(email→uid, phone_norm→uid) de usuarios que tienen buyer_score.
    email keyed crudo (match exacto, como el JOIN previo); phone normalizado."""
    email_idx: Dict[str, str] = {}
    phone_idx: Dict[str, str] = {}
    uids = []
    async for s in db.buyer_scores.find({}, {"_id": 0, "user_id": 1}):
        if s.get("user_id"):
            uids.append(s["user_id"])
    if not uids:
        return email_idx, phone_idx
    async for u in db.users.find(
        {"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "email": 1, "phone": 1}
    ):
        uid = u.get("user_id")
        if not uid:
            continue
        if u.get("email"):
            email_idx.setdefault(u["email"], uid)
        pn = normalize_phone(u.get("phone"))
        if pn:
            phone_idx.setdefault(pn, uid)
    return email_idx, phone_idx


def resolve_with_index(doc: dict, email_idx: Dict[str, str], phone_idx: Dict[str, str]) -> Optional[str]:
    """Resuelve un doc contra índices ya construidos (para batch)."""
    for e in emails_of(doc):
        if e in email_idx:
            return email_idx[e]
    for p in phones_of(doc):
        if p in phone_idx:
            return phone_idx[p]
    return None


async def resolve_buyer_user_id(db, doc: dict) -> Optional[str]:
    """Resuelve UN contacto/lead → user_id. Email exacto primero (query barata),
    teléfono después (índice). None si no hay cuenta de comprador detrás."""
    emails = emails_of(doc)
    if emails:
        u = await db.users.find_one({"email": {"$in": emails}}, {"_id": 0, "user_id": 1})
        if u and u.get("user_id"):
            return u["user_id"]
    phones = phones_of(doc)
    if phones:
        _, phone_idx = await build_buyer_index(db)
        for p in phones:
            if p in phone_idx:
                return phone_idx[p]
    return None


async def buyer_score_for_doc(db, doc: dict) -> Optional[dict]:
    """{value,tier,delta_pct} del comprador detrás de un contacto/lead, o None."""
    uid = await resolve_buyer_user_id(db, doc)
    if not uid:
        return None
    s = await db.buyer_scores.find_one(
        {"user_id": uid}, {"_id": 0, "score": 1, "tier": 1, "delta_pct": 1}
    )
    if not s:
        return None
    return {"value": s.get("score", 0), "tier": s.get("tier", "cold"), "delta_pct": s.get("delta_pct", 0)}


async def attach_buyer_scores(db, contactos: List[dict]) -> None:
    """Mutar in-place: c['buyer_score'] = {value,tier,delta_pct} | None para cada
    contacto. Resuelve por email+teléfono y trae los scores en UNA query. FAIL-OPEN."""
    try:
        email_idx, phone_idx = await build_buyer_index(db)
        c_uid: Dict[int, Optional[str]] = {}
        need = set()
        for c in contactos:
            uid = resolve_with_index(c, email_idx, phone_idx)
            c_uid[id(c)] = uid
            if uid:
                need.add(uid)
        scores_map: Dict[str, dict] = {}
        if need:
            async for s in db.buyer_scores.find(
                {"user_id": {"$in": list(need)}},
                {"_id": 0, "user_id": 1, "score": 1, "tier": 1, "delta_pct": 1},
            ):
                scores_map[s["user_id"]] = {
                    "value": s.get("score", 0),
                    "tier": s.get("tier", "cold"),
                    "delta_pct": s.get("delta_pct", 0),
                }
        for c in contactos:
            uid = c_uid.get(id(c))
            c["buyer_score"] = scores_map.get(uid) if uid else None
    except Exception as e:
        log.warning(f"[buyer_identity] attach_buyer_scores failed: {e}")
        for c in contactos:
            c["buyer_score"] = None
