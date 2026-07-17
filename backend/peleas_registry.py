"""REGISTRO ÚNICO DE PELEAS — todo dato en disputa entre fuentes, en un solo lugar.

Antes vivían regadas (doctrina: la pelea se documenta, nunca se esconde — pero estaban
en 4 rincones distintos de Mongo, invisibles como conjunto):
  · units.m2_pelea / precio_pelea / inventario_pelea / esquema_pelea / status_nota
  · developments.peleas_fuente (lista de textos, pelea a nivel proyecto)
  · solicitudes_gdc / solicitudes_class (lo que le pedimos al desarrollador)

Aquí se juntan TODAS en un registro uniforme:
  {tipo, desarrollo, unidad|None, detalle, edad_dias, ruta}

La RUTA dice cómo se resuelve cada una (clasificada por tipo, no adivinada):
  · 'auto'     → se resuelve sola con la próxima lista (precio, esquema, status)
  · 'otro_doc' → la resuelve otro documento por prioridad plano > lista > maestro (m²,
                 peleas entre fuentes del proyecto)
  · 'dev'      → requiere respuesta del desarrollador (inventario que el histórico sí
                 trae, solicitudes de datos faltantes) — estas son las que ENVEJECEN.

Lógica pura testeable (edad_dias / clasifica_ruta / filtra_envejecidas); Mongo solo en
los async. $0 — no llama a ninguna IA.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ─── clasificación de ruta por tipo (regla fija, documentada arriba) ─────────
RUTA_POR_TIPO = {
    "m2_pelea": "otro_doc",
    "pelea_fuente": "otro_doc",
    "precio_pelea": "auto",
    "esquema_pelea": "auto",
    "status_nota": "auto",
    "inventario_pelea": "dev",
    "solicitud": "dev",
}

RUTA_HUMANA = {
    "auto": "se resuelve sola con la próxima lista",
    "otro_doc": "la resuelve otro documento (plano > lista > maestro)",
    "dev": "requiere respuesta del desarrollador",
}

# campos de pelea que viven a nivel unidad
CAMPOS_UNIT = ("m2_pelea", "precio_pelea", "inventario_pelea", "esquema_pelea",
               "status_nota")


def clasifica_ruta(tipo: str) -> str:
    return RUTA_POR_TIPO.get(tipo, "dev")


def _a_fecha(v: Any) -> Optional[datetime]:
    """'2026-07-15T20:15:37+00:00' | '2026-07-17' | datetime → datetime aware (o None)."""
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str) and v:
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def edad_dias(doc: Dict[str, Any], hoy: Optional[datetime] = None) -> Optional[int]:
    """Días desde `fecha` si existe; si no, desde created_at del doc (ts cuenta como
    fecha en las solicitudes). Último recurso: el momento en que Mongo creó el _id."""
    hoy = hoy or datetime.now(timezone.utc)
    for k in ("fecha", "ts", "created_at"):
        dt = _a_fecha(doc.get(k))
        if dt:
            return max(0, (hoy - dt).days)
    oid = doc.get("_id")
    gen = getattr(oid, "generation_time", None)
    if gen:
        return max(0, (hoy - gen).days)
    return None


def fila_pelea(tipo: str, desarrollo: str, unidad: Optional[str], detalle: str,
               edad: Optional[int], development_id: Optional[str] = None,
               org_id: Optional[str] = None) -> Dict[str, Any]:
    """El renglón uniforme del registro (pura, testeable)."""
    ruta = clasifica_ruta(tipo)
    return {"tipo": tipo, "desarrollo": desarrollo, "unidad": unidad,
            "detalle": detalle, "edad_dias": edad, "ruta": ruta,
            "ruta_humana": RUTA_HUMANA[ruta],
            "development_id": development_id, "org_id": org_id}


def filtra_envejecidas(filas: List[Dict[str, Any]], umbral_dias: int = 10) -> List[Dict[str, Any]]:
    """Las de ruta 'dev' más viejas que el umbral — para recordatorio al desarrollador."""
    viejas = [f for f in filas
              if f.get("ruta") == "dev" and (f.get("edad_dias") or 0) > umbral_dias]
    return sorted(viejas, key=lambda f: -(f.get("edad_dias") or 0))


# ─── Mongo ───────────────────────────────────────────────────────────────────

async def peleas_abiertas(db) -> Dict[str, Any]:
    """TODAS las peleas abiertas, uniformes. Nada se esconde ni se resume de más."""
    # nombre humano + org de cada proyecto (para no enseñar ids crudos)
    devs: Dict[str, Dict[str, Any]] = {}
    async for d in db.developments.find(
            {}, {"_id": 0, "id": 1, "name": 1, "developer_id": 1}).limit(3000):
        devs[d["id"]] = d

    filas: List[Dict[str, Any]] = []

    # 1 · peleas a nivel UNIDAD (los 5 campos, cada uno un renglón)
    q = {"$or": [{c: {"$exists": True}} for c in CAMPOS_UNIT]}
    async for u in db.units.find(q, {c: 1 for c in CAMPOS_UNIT} |
                                 {"development_id": 1, "unit_number": 1,
                                  "created_at": 1, "_id": 1}).limit(5000):
        info = devs.get(u.get("development_id") or "") or {}
        for campo in CAMPOS_UNIT:
            detalle = u.get(campo)
            if not detalle:
                continue
            filas.append(fila_pelea(
                campo, info.get("name") or u.get("development_id") or "—",
                u.get("unit_number"), str(detalle), edad_dias(u),
                development_id=u.get("development_id"),
                org_id=info.get("developer_id")))

    # 2 · peleas a nivel PROYECTO (developments.peleas_fuente: lista de textos)
    async for d in db.developments.find(
            {"peleas_fuente": {"$exists": True, "$ne": []}},
            {"id": 1, "name": 1, "developer_id": 1, "peleas_fuente": 1,
             "created_at": 1, "_id": 1}).limit(500):
        for texto in (d.get("peleas_fuente") or []):
            filas.append(fila_pelea(
                "pelea_fuente", d.get("name") or d.get("id") or "—", None,
                str(texto), edad_dias(d),
                development_id=d.get("id"), org_id=d.get("developer_id")))

    # 3 · SOLICITUDES pendientes a los desarrolladores (lo que falta en la fuente)
    from routes.superadmin_leads import fila_solicitud   # REUSA el traductor a humano
    org_por_etiqueta = await _orgs_por_etiqueta(db)
    for col, etiqueta in (("solicitudes_class", "CLASS"), ("solicitudes_gdc", "GDC")):
        async for doc in db[col].find({}).limit(200):
            if (doc.get("estado") or "pendiente") != "pendiente":
                continue
            s = fila_solicitud(doc, etiqueta)
            detalle = s["que_falta"] + (f" — {s['por_que']}" if s["por_que"] else "")
            filas.append(fila_pelea(
                "solicitud", f"{etiqueta} · {s['proyecto']}", None, detalle,
                edad_dias(doc), org_id=org_por_etiqueta.get(etiqueta)))

    filas.sort(key=lambda f: -(f["edad_dias"] if f["edad_dias"] is not None else -1))
    return {"peleas": filas, "n": len(filas),
            "por_ruta": dict(Counter(f["ruta"] for f in filas)),
            "por_tipo": dict(Counter(f["tipo"] for f in filas))}


async def envejecidas(db, umbral_dias: int = 10) -> List[Dict[str, Any]]:
    """Las peleas que dependen del desarrollador y ya llevan más de `umbral_dias` días."""
    r = await peleas_abiertas(db)
    return filtra_envejecidas(r["peleas"], umbral_dias)


async def _orgs_por_etiqueta(db) -> Dict[str, str]:
    """CLASS/GDC → org_id real, leído del manifiesto del vigía (no hardcodeado)."""
    out: Dict[str, str] = {}
    async for m in db.vigia_manifiesto.find(
            {}, {"_id": 0, "dev_carpeta": 1, "dev_org_id": 1}).limit(20):
        s = f"{m.get('dev_carpeta') or ''} {m.get('dev_org_id') or ''}".lower()
        if "gdc" in s:
            out["GDC"] = m.get("dev_org_id") or ""
        elif "class" in s:
            out["CLASS"] = m.get("dev_org_id") or ""
    return out
