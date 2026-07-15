"""LA LISTA DE PEDIDOS — todo lo que hay que pedirle a cada desarrollador, en UN mensaje.

Antes vivía regado: faltantes del 80% en el Expediente, preguntas del Auditor en el Parte,
contradicciones del Cotejo en los moldes, y huecos de campos en cada ficha. El founder
perseguía todo de memoria. Ahora la plataforma REDACTA el pedido (listo para WhatsApp) y
él solo lo envía. Se regenera solo — al completarse algo, desaparece del pedido.

armar_pedido() es pura (testeable); pedido_desarrollo() junta las 4 fuentes. $0, sin IA.
"""
from __future__ import annotations

from typing import Any, Dict, List

# huecos por campo de unidad que vale la pena pedir en bloque (campo, etiqueta, a_quien)
CAMPOS_PEDIBLES = [
    ("parking_type", "tipo de cajón (techado/independiente)", "dev"),
    ("bodega", "bodega por unidad (¿tiene? ¿m²?)", "dev"),
    ("acabados", "nivel de acabados a la entrega", "dev"),
    ("mantenimiento_mxn", "cuota de mantenimiento mensual", "dev"),
    ("orientacion", "orientación por unidad (o el plano de conjunto por nivel)", "dev"),
    ("vista", "vista por unidad (calle/interior)", "dev"),
]


def armar_pedido(dev_nombre: str, faltantes_readiness: List[str],
                 preguntas_auditor: List[str], contradicciones: List[Dict[str, Any]],
                 huecos_campos: List[Dict[str, Any]]) -> Dict[str, Any]:
    secciones: List[Dict[str, Any]] = []
    if faltantes_readiness:
        secciones.append({"titulo": "Para poder publicar (el 80%)",
                          "puntos": faltantes_readiness})
    if preguntas_auditor:
        secciones.append({"titulo": "Dudas que encontró la auditoría de datos",
                          "puntos": preguntas_auditor})
    if contradicciones:
        secciones.append({"titulo": "Datos que no cuadran entre sus documentos",
                          "puntos": [
                              f"{c.get('etiqueta')}: la lista dice "
                              f"{(c.get('fuentes') or {}).get('lista')} y el plano "
                              f"{(c.get('fuentes') or {}).get('plano')}"
                              + (f" — {c['nota']}" if c.get("nota") else "")
                              for c in contradicciones[:6]]})
    if huecos_campos:
        secciones.append({"titulo": "Datos por unidad que completarían la ficha",
                          "puntos": [f"{h['etiqueta']} — falta en {h['n']} unidades"
                                     for h in huecos_campos]})
    lineas = [f"Hola equipo {dev_nombre} 👋 Para dejar su ficha completa en la "
              f"plataforma nos ayudaría lo siguiente:"]
    n = 1
    for sec in secciones:
        lineas.append(f"\n*{sec['titulo']}*")
        for p in sec["puntos"]:
            lineas.append(f"{n}. {p}")
            n += 1
    lineas.append("\nCon eso su desarrollo queda publicado con la ficha más completa "
                  "del mercado. ¡Gracias!")
    return {"dev": dev_nombre, "secciones": secciones, "n_puntos": n - 1,
            "texto": "\n".join(lineas) if secciones else "",
            "al_dia": not secciones}


async def pedido_desarrollo(db, development_id: str) -> Dict[str, Any]:
    d = await db.developments.find_one({"id": development_id}, {"_id": 0}) or {}
    # 1 · faltantes del 80%
    from routes.dev_project_full import project_full, project_readiness
    rd = project_readiness(await project_full(db, development_id))
    faltantes = [m.get("label") for m in (rd.get("missing") or [])]
    # 2 · preguntas del Auditor (última corrida, este dev)
    from auditor_catalogo import ultima_auditoria, preguntas_de_hallazgos
    au = await ultima_auditoria(db, development_id=development_id)
    preguntas = preguntas_de_hallazgos(au.get("hallazgos") or [])
    # 3 · contradicciones del Cotejo
    cot = await db.cotejo_datos.find_one({"development_id": development_id}, {"_id": 0})
    contras = [c for c in ((cot or {}).get("checks") or [])
               if c.get("veredicto") == "contradice"]
    # 4 · huecos por campo (agregados sobre unidades efectivas)
    from unidades_efectivas import unidades_efectivas
    units = await unidades_efectivas(db, {"development_id": development_id})
    huecos = []
    for campo, etiqueta, _quien in CAMPOS_PEDIBLES:
        n = sum(1 for u in units if not u.get(campo))
        if units and n > len(units) * 0.5:      # falta en la mayoría = pedirlo en bloque
            huecos.append({"campo": campo, "etiqueta": etiqueta, "n": n})
    # el pedido se dirige al DESARROLLADOR (CLASS), no al proyecto (Almina)
    nombre_dev = None
    if d.get("developer_id"):
        org = await db.dev_orgs.find_one({"tenant_id": d["developer_id"]}, {"_id": 0, "name": 1})
        if not org:
            org = await db.users.find_one({"tenant_id": d["developer_id"],
                                           "role": "developer_admin"}, {"_id": 0, "name": 1})
        nombre_dev = (org or {}).get("name")
    etiqueta = nombre_dev or d.get("name") or development_id
    if nombre_dev and d.get("name"):
        etiqueta = f"{nombre_dev} (proyecto {d['name']})"
    return {"development_id": development_id, "pct": rd.get("pct"),
            **armar_pedido(etiqueta, faltantes, preguntas, contras, huecos)}
