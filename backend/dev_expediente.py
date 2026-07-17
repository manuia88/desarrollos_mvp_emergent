"""EXPEDIENTE DE COMPORTAMIENTO POR DESARROLLADOR — cómo trabaja, aprendido de sus datos.

No es el perfil de portafolio (eso es perfil_dev.py): esto es su CONDUCTA observada:
  · convenciones     → qué convención de m² usa (aprendida de sus unidades con el motor
                       canónico auditor_catalogo.convencion_m2), cómo redacta su esquema
                       de pago y qué vocabulario de status maneja
  · cadencia_listas  → cada cuántos días actualiza su lista de precios (vigia_eventos)
  · peleas_generadas → cuántas peleas abiertas causó, por tipo (reusa peleas_registry)
  · solicitudes      → cuántos pedidos nuestros tiene sin responder y el más viejo
  · senal_de_venta   → patrones de venta observados ('retira planos al vender',
                       'quita renglones de la lista')

TODO derivado de datos reales; donde no hay evidencia el campo dice 'sin evidencia aún'
(regla dura: nunca inventar conducta). Además guarda un resumen corto en
vigia_manifiesto.patron_notas_auto (campo propio — JAMÁS pisa patron_notas del founder).
$0 — no llama a ninguna IA.
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime, timezone
from typing import Any, Dict, List

from auditor_catalogo import convencion_m2          # motor canónico — NO se duplica
from peleas_registry import edad_dias, peleas_abiertas

SIN_EVIDENCIA = "sin evidencia aún"

_PLANO_RE = re.compile(r"(?i)plano|arq[_ -]|cotas|s[oó]tano|nivel\s*\d")

CONVENCION_HUMANA = {
    "total_igual_privativos": "los m² totales de su lista = privativos (exteriores aparte)",
    "total_suma_exteriores": "los m² totales de su lista = privativos + exteriores",
}


# ─── lógica pura (testeable sin Mongo) ───────────────────────────────────────

def _evidencia_m2(units: List[Dict[str, Any]]) -> int:
    """Cuántas unidades tienen lo necesario para aprender la convención (hab+tot+ext)."""
    n = 0
    for u in units:
        hab = u.get("m2_privative") or u.get("size_m2")
        tot = u.get("m2_total") or u.get("size_m2_total")
        ext = any(u.get(k) for k in ("m2_balcony", "m2_terrace", "m2_roof_garden",
                                     "patio_m2"))
        if hab and tot and ext:
            n += 1
    return n


def cadencia_de(fechas_iso: List[str]) -> Dict[str, Any]:
    """De los timestamps de eventos lista_* → frecuencia promedio en días + última.
    Con <2 días distintos no hay cadencia que afirmar → sin evidencia aún."""
    dias = sorted({str(f)[:10] for f in fechas_iso if f})
    ultima = dias[-1] if dias else SIN_EVIDENCIA
    if len(dias) < 2:
        return {"frecuencia_dias": SIN_EVIDENCIA, "ultima": ultima,
                "n_actualizaciones": len(dias)}
    ds = [date.fromisoformat(d) for d in dias]
    brechas = [(b - a).days for a, b in zip(ds, ds[1:])]
    return {"frecuencia_dias": round(sum(brechas) / len(brechas), 1),
            "ultima": ultima, "n_actualizaciones": len(dias)}


def es_plano(nombre: str, carpeta: str = "") -> bool:
    return bool(_PLANO_RE.search(f"{nombre} {carpeta}"))


def _n(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def senal_de_venta(planos_eliminados: int, vendidas: int,
                   con_inventario_pelea: int) -> str:
    """Texto humano SOLO si hay evidencia (los dos patrones que ya observamos)."""
    señales: List[str] = []
    if planos_eliminados and vendidas:
        señales.append(f"retira planos al vender "
                       f"({_n(planos_eliminados, 'plano borrado', 'planos borrados')} "
                       f"del Drive · {_n(vendidas, 'unidad vendida', 'unidades vendidas')})")
    if con_inventario_pelea:
        señales.append(f"quita renglones de la lista sin marcar la venta "
                       f"({_n(con_inventario_pelea, 'unidad', 'unidades')} que el "
                       f"histórico sí trae)")
    return " · ".join(señales) or SIN_EVIDENCIA


def resumen_corto(exp: Dict[str, Any]) -> str:
    """El expediente en una línea — para vigia_manifiesto.patron_notas_auto."""
    conv = exp["convenciones"]["m2"]
    cad = exp["cadencia_listas"]
    sol = exp["solicitudes"]
    partes = [f"m²: {conv}",
              (f"listas cada ~{cad['frecuencia_dias']} días (última {cad['ultima']})"
               if cad["frecuencia_dias"] != SIN_EVIDENCIA
               else f"listas: {SIN_EVIDENCIA}"),
              f"peleas abiertas: {exp['peleas_generadas']['total']}",
              f"solicitudes sin responder: {sol['abiertas']}"
              + (f" (la más vieja lleva {sol['edad_max']} días)"
                 if sol["abiertas"] and sol["edad_max"] is not None else "")]
    if exp["senal_de_venta"] != SIN_EVIDENCIA:
        partes.append(f"señal de venta: {exp['senal_de_venta']}")
    hoy = datetime.now(timezone.utc).date().isoformat()
    return (f"[auto {hoy}] " + " · ".join(partes))[:600]


# ─── Mongo ───────────────────────────────────────────────────────────────────

async def expediente(db, dev_carpeta_o_org: str) -> Dict[str, Any]:
    """El expediente completo. Acepta la carpeta del Drive ('DESARROLLOS-CLASS'),
    el org_id ('org_gdc') o un alias parcial ('class' / 'gdc')."""
    m = await db.vigia_manifiesto.find_one(
        {"$or": [{"dev_carpeta": dev_carpeta_o_org},
                 {"dev_org_id": dev_carpeta_o_org}]}, {"_id": 0})
    if not m and dev_carpeta_o_org:
        # alias parcial ('class' → DESARROLLOS-CLASS · 'gdc' → org_gdc/CLIENTES EXTERNOS)
        rx = {"$regex": re.escape(dev_carpeta_o_org), "$options": "i"}
        m = await db.vigia_manifiesto.find_one(
            {"$or": [{"dev_carpeta": rx}, {"dev_org_id": rx}]}, {"_id": 0})
    org_id = (m or {}).get("dev_org_id") or dev_carpeta_o_org
    carpeta = (m or {}).get("dev_carpeta") or ""

    proyectos = await db.developments.find(
        {"developer_id": org_id},
        {"_id": 0, "id": 1, "name": 1, "esquema_pago_nota": 1}).to_list(300)
    dev_ids = [p["id"] for p in proyectos]
    units = await db.units.find(
        {"development_id": {"$in": dev_ids}},
        {"_id": 0, "status": 1, "status_nota": 1, "inventario_pelea": 1,
         "m2_privative": 1, "size_m2": 1, "m2_total": 1, "size_m2_total": 1,
         "m2_balcony": 1, "m2_terrace": 1, "m2_roof_garden": 1,
         "patio_m2": 1}).to_list(20000)

    encontrado = bool(m or proyectos)

    # convenciones (aprendidas, no asumidas)
    ev = _evidencia_m2(units)
    conv = convencion_m2(units) if ev >= 3 else None
    esquemas = sorted({f"{p.get('name') or p['id']}: {p['esquema_pago_nota']}"
                       for p in proyectos if p.get("esquema_pago_nota")})
    vocab = Counter((u.get("status") or "").strip().lower()
                    for u in units if u.get("status"))
    notas_status = sorted({u["status_nota"] for u in units if u.get("status_nota")})[:5]
    convenciones = {
        "m2": (f"{conv} — {CONVENCION_HUMANA[conv]} (aprendida de {ev} unidades)"
               if conv else SIN_EVIDENCIA),
        "esquema_pago": esquemas or SIN_EVIDENCIA,
        "vocabulario_status": dict(vocab.most_common()) or SIN_EVIDENCIA,
        "notas_de_status": notas_status,
    }

    # cadencia de listas (vigia_eventos lista_* de SU carpeta)
    fechas: List[str] = []
    if carpeta:
        async for e in db.vigia_eventos.find(
                {"dev": carpeta, "tipo": {"$regex": "^lista"}},
                {"_id": 0, "ts": 1}).limit(5000):
            if e.get("ts"):
                fechas.append(str(e["ts"]))
    cadencia = cadencia_de(fechas)

    # peleas que este dev generó (reusa el registro único)
    reg = await peleas_abiertas(db)
    suyas = [f for f in reg["peleas"]
             if (f.get("org_id") and f["org_id"] == org_id)
             or (f.get("development_id") and f["development_id"] in dev_ids)]
    peleas_generadas = {"total": len(suyas),
                        "por_tipo": dict(Counter(f["tipo"] for f in suyas))}

    # solicitudes nuestras sin responder (su colección, resuelta por etiqueta)
    abiertas, edad_max = 0, None
    etiqueta = "GDC" if "gdc" in f"{carpeta} {org_id}".lower() else \
               ("CLASS" if "class" in f"{carpeta} {org_id}".lower() else None)
    if etiqueta:
        col = "solicitudes_gdc" if etiqueta == "GDC" else "solicitudes_class"
        async for doc in db[col].find({}).limit(200):
            if (doc.get("estado") or "pendiente") != "pendiente":
                continue
            abiertas += 1
            e = edad_dias(doc)
            if e is not None and (edad_max is None or e > edad_max):
                edad_max = e

    # señal de venta (patrones observados en el Drive + el catálogo)
    vendidas = sum(1 for u in units
                   if (u.get("status") or "").lower() in ("vendida", "vendido", "sold"))
    planos_borrados = 0
    if carpeta:
        async for e in db.vigia_eventos.find(
                {"dev": carpeta, "tipo": "archivo_eliminado"},
                {"_id": 0, "archivo": 1}).limit(5000):
            a = e.get("archivo") or {}
            if es_plano(a.get("nombre") or "", a.get("carpeta") or ""):
                planos_borrados += 1
    con_inv_pelea = sum(1 for u in units if u.get("inventario_pelea"))

    exp = {
        "dev": carpeta or dev_carpeta_o_org,
        "org_id": org_id,
        "encontrado": encontrado,
        "proyectos": len(proyectos),
        "unidades": len(units),
        "convenciones": convenciones,
        "cadencia_listas": cadencia,
        "peleas_generadas": peleas_generadas,
        "solicitudes": {"abiertas": abiertas, "edad_max": edad_max},
        "senal_de_venta": senal_de_venta(planos_borrados, vendidas, con_inv_pelea),
    }
    exp["resumen"] = resumen_corto(exp)

    # persistir el resumen SIN tocar patron_notas del founder (campo aparte, $set puntual)
    if m and carpeta:
        await db.vigia_manifiesto.update_one(
            {"dev_carpeta": carpeta},
            {"$set": {"patron_notas_auto": exp["resumen"],
                      "patron_notas_auto_ts": datetime.now(timezone.utc).isoformat()}})
    return exp
