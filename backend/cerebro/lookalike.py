"""Lookalike sobre el espacio de embeddings — el sustrato del flywheel ("parecidos a los que cerraron").

Reusa rag_engine.embed_one (OpenAI text-embedding-3-small · 1536d) + colección dmx_embeddings.
Build-for-endstate: la infra (indexar + cosine top-k + hook al cierre) está completa HOY; se activa sola
cuando hay OPENAI_API_KEY + volumen de cierres/entidades. Sin volumen devuelve vacío honesto.
"""
import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.cerebro.lookalike")


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


async def index_entity(db, kind: str, ref_id: str, text: str, org_id: Optional[str] = None) -> Optional[str]:
    """Embed + guarda el vector de una entidad (won_deal / lead / property / zone) para lookalike."""
    if not ref_id or not text:
        return None
    try:
        from rag_engine import embed_one
        vec = await embed_one(text)
        if not vec:
            return None
        await db.dmx_embeddings.update_one(
            {"kind": kind, "ref_id": ref_id},
            {"$set": {"kind": kind, "ref_id": ref_id, "vector": vec,
                      "text": (text or "")[:500], "org_id": org_id}},
            upsert=True,
        )
        return ref_id
    except Exception as e:
        log.info(f"[lookalike] index skip (¿sin OPENAI_API_KEY o sin volumen?): {e}")
        return None


async def lookalike(db, kind: str, ref_id: Optional[str] = None, text: Optional[str] = None,
                    org_id: Optional[str] = None, top_k: int = 5) -> List[Dict[str, Any]]:
    """Top-k entidades del mismo `kind` más parecidas (cosine) a ref_id (o a un texto). Aísla por org si se pasa."""
    try:
        ref_vec = None
        if ref_id:
            d = await db.dmx_embeddings.find_one({"kind": kind, "ref_id": ref_id}, {"_id": 0, "vector": 1})
            ref_vec = (d or {}).get("vector")
        if not ref_vec and text:
            from rag_engine import embed_one
            ref_vec = await embed_one(text)
        if not ref_vec:
            return []
        q: Dict[str, Any] = {"kind": kind}
        if org_id:
            q["org_id"] = org_id
        out: List[Dict[str, Any]] = []
        async for e in db.dmx_embeddings.find(q, {"_id": 0, "ref_id": 1, "vector": 1, "text": 1}).limit(3000):
            if e.get("ref_id") == ref_id:
                continue
            out.append({"ref_id": e["ref_id"], "score": round(_cosine(ref_vec, e.get("vector") or []), 4),
                        "text": e.get("text")})
        out.sort(key=lambda x: x["score"], reverse=True)
        return out[:top_k]
    except Exception as e:
        log.info(f"[lookalike] query skip: {e}")
        return []
