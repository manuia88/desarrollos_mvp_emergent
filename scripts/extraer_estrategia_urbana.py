"""Extrae un proyecto de Estrategia Urbana desde su lista comparativa en PDF.

DOCTRINA APLICADA (ver PLAYBOOK_INGESTA_LISTAS.md + PATRON_ESTRATEGIA_URBANA.md):
  · D6 — el CÓDIGO mide, la IA no. Esto es parseo determinístico: cero API, cero adivinanza.
  · D2 — la fuente más granular gana. El `comparativo` trae los 4 esquemas MÁS `Nivel`,
    `M2 Interiores`, `Balcón`, `Garden/Roof` y `Mensualidades`, que las listas sueltas no tienen.
  · D3 — todo con linaje: cada unidad guarda el renglón crudo del que salió y de qué archivo.
  · L16 — las 4 columnas de precio NO son unidades distintas: son formas de pago del mismo depa.
  · L12 — se valida la ecuación de metros (interiores + balcón + roof ≈ total) EN la extracción.

DECISIÓN DEL FOUNDER (07-26): el precio publicado es el MÁS ALTO (el más financiado). Los demás
esquemas cuelgan como descuento, así el precio nunca sube respecto de lo anunciado, solo baja.

USO:  python scripts/extraer_estrategia_urbana.py <lista_comparativo.pdf> [--aplicar]
"""
import re
import subprocess
import sys

from typing import Any, Dict, List, Optional

# Tipología viene en inglés: "2Bed/1Bath", "Large Studio", "2Bed/2.5Bath Duplex".
# Un estudio NO es una recámara: es espacio abierto. Se marca 0 y el prototipo lo dice.
_TIPO = re.compile(r"(?i)(?:(\d+)\s*bed)?.*?(?:([\d.]+)\s*bath)?")


def _norm(s: str) -> str:
    return " ".join(str(s or "").split())


def tipologia(txt: str) -> Dict[str, Any]:
    """'2Bed/1Bath' → 2 rec / 1 baño · 'Large Studio' → estudio · 'PH … Duplex' → marca duplex."""
    t = _norm(txt)
    bajo = t.lower()
    rec = re.search(r"(\d+)\s*bed", bajo)
    ban = re.search(r"([\d.]+)\s*bath", bajo)
    out: Dict[str, Any] = {
        "bedrooms": float(rec.group(1)) if rec else (0.0 if "studio" in bajo else None),
        "bathrooms": float(ban.group(1)) if ban else None,
        "tipologia_fuente": t,
    }
    if "studio" in bajo:
        out["prototype"] = "estudio grande" if "large" in bajo else "estudio"
    elif rec:
        out["prototype"] = f"{rec.group(1)} rec"
    if "duplex" in bajo:
        out["duplex"] = True
    return out


def _f(v) -> Optional[float]:
    try:
        s = str(v).replace("$", "").replace(",", "").strip()
        return float(s) if s not in ("", "-", "0") or s == "0" else None
    except (TypeError, ValueError):
        return None


def leer_comparativo(pdf: str) -> Dict[str, Any]:
    """Devuelve {esquemas: [...], unidades: [...], periodo, version, avisos}.

    SE LEE POR POSICIÓN DE COLUMNA, no adivinando por palabras. `pdftotext -layout` conserva la
    alineación de la tabla, así que el encabezado dice exactamente dónde empieza y termina cada
    columna. El primer intento partía cada renglón en palabras y falló en tres cosas a la vez:
    tomaba "202" como nivel (porque es el primer entero que encuentra), pegaba "Large Studio" al
    campo Vista, y se comía el espacio entre columnas de esquema leyendo 3 donde hay 4.
    Con las columnas, cada dato cae donde debe aunque tenga espacios adentro.
    """
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"],
                         capture_output=True, text=True, timeout=120).stdout
    lineas = [l for l in txt.splitlines() if l.strip()]
    avisos: List[str] = []

    periodo = next((_norm(l.split(":", 1)[1]) for l in lineas if "período:" in l.lower()), None)
    version = next((m.group(0) for l in lineas if (m := re.search(r"\bV\d{1,3}\b", l))), None)

    cab = next((l for l in lineas if "Depto" in l and "Estatus" in l), None)
    if not cab:
        raise SystemExit("no encontré el encabezado de la tabla — ¿es un comparativo?")

    # Cada encabezado con su centro. NO se corta el renglón en tramos fijos: un valor puede ser más
    # ANCHO que su título y desbordarse sobre la columna vecina — "Sunken Garden" se comía los m²
    # interiores de 8 unidades, y el corte a ciegas los dejaba vacíos. En vez de eso, cada dato del
    # renglón se asigna a la columna cuyo CENTRO le queda más cerca, y los datos contiguos que caen
    # en la misma columna se vuelven a unir ("Sunken" + "Garden").
    cols = [(m.group().strip(), (m.start() + m.end()) / 2)
            for m in re.finditer(r"\S+(?:\s\S+)*?(?=\s{2,}|$)", cab)]
    limites = [(nom, c) for nom, c in cols]

    def _celdas(linea: str) -> List[str]:
        out = [[] for _ in limites]
        for m in re.finditer(r"\S+", linea):
            centro = (m.start() + m.end()) / 2
            i = min(range(len(limites)), key=lambda k: abs(limites[k][1] - centro))
            out[i].append(m.group())
        return [_norm(" ".join(p)) for p in out]

    idx = {nom.lower(): i for i, (nom, _) in enumerate(limites)}
    i_depto = idx.get("depto.", 0)
    i_nivel = idx.get("nivel", 1)
    i_tipo = idx.get("tipología", 2)
    i_vista = idx.get("vista", 3)
    i_int = idx.get("m2 interiores", 4)
    i_balc = idx.get("balcón", 5)
    i_roof = idx.get("garden/roof", 6)
    i_tot = idx.get("m2 totales", 7)
    i_est = idx.get("estatus", 8)
    i_mens = idx.get("mensualidades", 9)
    # las columnas de esquema son las que se llaman "10% 10% 80%", "90% 10%", …
    i_esq = [i for i, (nom, _) in enumerate(limites) if re.fullmatch(r"(?:\d{1,3}%\s*)+", nom)]
    esquemas_txt = [limites[i][0] for i in i_esq]
    if not esquemas_txt:
        raise SystemExit("no encontré las columnas de esquemas de pago en el encabezado")

    unidades = []
    for l in lineas:
        if "Depto" in l or "$" not in l:
            continue
        c = _celdas(l)
        clave = c[i_depto]
        precios = [_f(c[i]) for i in i_esq]
        if not clave or any(p is None for p in precios):
            continue
        unidades.append({
            "clave": clave,
            "nivel": _f(c[i_nivel]),
            "tipologia": c[i_tipo],
            "vista": c[i_vista],
            "interiores": _f(c[i_int]),
            "balcon": _f(c[i_balc]),
            "roof": _f(c[i_roof]),
            "m2_total": _f(c[i_tot]),
            "estatus": c[i_est],
            "mensualidades": _f(c[i_mens]),
            "precios": precios,
            "renglon": _norm(l),
        })

    # ── el descuento por esquema debe ser CONSTANTE; si no, es otra cosa ──────
    base_idx = 0                                    # la 1ª columna es la más cara (más financiada)
    descuentos = []
    for i in range(len(esquemas_txt)):
        pcts = [round((u["precios"][base_idx] - u["precios"][i]) / u["precios"][base_idx] * 100, 3)
                for u in unidades if u["precios"][base_idx]]
        # los roof gardens traen el mismo precio en los 4 esquemas → no participan del promedio
        pcts_reales = [p for p in pcts if p != 0.0] or [0.0]
        spread = max(pcts_reales) - min(pcts_reales)
        if spread > 0.15:
            avisos.append(f"el descuento del esquema «{esquemas_txt[i]}» NO es constante "
                          f"(varía {spread:.2f} puntos entre unidades) — revisar a mano")
        descuentos.append(round(sum(pcts_reales) / len(pcts_reales), 2))

    esquemas = []
    for i, e in enumerate(esquemas_txt):
        p = [float(x) for x in re.findall(r"(\d{1,3})%", e)]
        firma, mens_pct, escr = (p + [0, 0, 0])[:3] if len(p) == 3 else (p[0], 0.0, p[1])
        esquemas.append({
            "id": f"esq_{int(firma)}_{int(mens_pct)}_{int(escr)}",
            "nombre": ("Contado" if mens_pct == 0 and firma >= 80
                       else f"{int(firma)}% firma · {int(mens_pct)}% mensualidades · {int(escr)}% escritura"),
            "firma_pct": firma, "mensualidades_pct": mens_pct, "escritura_pct": escr,
            "descuento_pct": descuentos[i], "apartado_mxn": 50000, "meses_override": None,
            "etiqueta_fuente": e,
        })
    return {"esquemas": esquemas, "unidades": unidades, "periodo": periodo,
            "version": version, "avisos": avisos, "archivo": pdf.split("/")[-1]}


def a_unidad(u: Dict[str, Any], esquemas: List[Dict[str, Any]], archivo: str) -> Dict[str, Any]:
    """Traduce un renglón al vocabulario canónico del catálogo."""
    clave = u["clave"]
    es_roof = bool(re.match(r"(?i)^RG", clave)) or (not u["interiores"] and u["roof"])
    tipo_txt, vista = u["tipologia"], u["vista"]
    d: Dict[str, Any] = {
        "unit_number": clave,
        "level": int(u["nivel"]) if u["nivel"] else None,
        "vista": _norm(vista) if vista and vista != "0" else None,
        "m2_privative": u["interiores"] or None,
        "m2_balcony": u["balcon"] or None,
        "m2_roof_garden": u["roof"] or None,
        "m2_total": u["m2_total"],
        "size_m2": u["interiores"] or u["m2_total"],
        "size_m2_total": u["m2_total"],
        "status": "disponible" if (u["estatus"] or "").lower().startswith("libre") else _norm(u["estatus"]).lower(),
        "price": u["precios"][0],                 # founder 07-26: el MÁS ALTO es el publicado
        "price_mxn": u["precios"][0],
        "price_display": f"${u['precios'][0]:,.0f}",
        "meses_mensualidades": int(u["mensualidades"]) if u["mensualidades"] else None,
        "precio_por_esquema": {e["id"]: p for e, p in zip(esquemas, u["precios"])},
        # D3 · linaje: de qué archivo y qué renglón exacto salió esto
        "fuente_lista": {"archivo": archivo, "renglon": u["renglon"]},
    }
    if es_roof:
        d.update({"type": "roof_garden", "prototype": "roof garden",
                  "bedrooms": None, "bathrooms": None})
    else:
        d.update({"type": "depto", **tipologia(tipo_txt)})
    return d


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    pdf = sys.argv[1]
    aplicar = "--aplicar" in sys.argv
    r = leer_comparativo(pdf)

    print(f"════ {r['archivo']} ════")
    print(f"  período declarado: {r['periodo']}  ·  versión: {r['version']}")
    print(f"\n  ── ESQUEMAS DE PAGO ({len(r['esquemas'])}) ──")
    for e in r["esquemas"]:
        print(f"     {e['etiqueta_fuente']:16} → firma {e['firma_pct']:>4.0f}% · "
              f"mens {e['mensualidades_pct']:>4.0f}% · escr {e['escritura_pct']:>4.0f}% "
              f"· descuento {e['descuento_pct']:>5.2f}%")

    unidades = [a_unidad(u, r["esquemas"], r["archivo"]) for u in r["unidades"]]
    deptos = [u for u in unidades if u["type"] == "depto"]
    roofs = [u for u in unidades if u["type"] == "roof_garden"]

    print(f"\n  ── UNIDADES: {len(unidades)} ({len(deptos)} departamentos + {len(roofs)} roof gardens) ──")
    print(f"     {'unidad':8} {'niv':>3} {'rec':>4} {'baño':>5} {'int':>4} {'balc':>5} {'roof':>5} "
          f"{'total':>6} {'vista':16} {'precio':>13}")
    for u in unidades:
        print(f"     {u['unit_number']:8} {str(u['level'] or ''):>3} {str(u.get('bedrooms') or ''):>4} "
              f"{str(u.get('bathrooms') or ''):>5} {str(u['m2_privative'] or ''):>4} "
              f"{str(u['m2_balcony'] or ''):>5} {str(u['m2_roof_garden'] or ''):>5} "
              f"{str(u['m2_total'] or ''):>6} {str(u['vista'] or '')[:16]:16} "
              f"${u['price']:>12,.0f}")

    # ── L12 · la ecuación de metros se valida AQUÍ, no después ───────────────
    print("\n  ── VALIDACIÓN ──")
    malos = []
    for u in unidades:
        partes = sum(x for x in (u["m2_privative"], u["m2_balcony"], u["m2_roof_garden"]) if x)
        if u["m2_total"] and abs(partes - u["m2_total"]) > 1.01:
            malos.append(f"{u['unit_number']}: {partes:.0f} ≠ {u['m2_total']:.0f}")
    print(f"     metros (interiores+balcón+roof = total): "
          f"{'✅ cuadran las ' + str(len(unidades)) if not malos else '⚠️ ' + ', '.join(malos)}")
    sin_precio = [u["unit_number"] for u in unidades if not u["price"]]
    print(f"     todas con precio: {'✅' if not sin_precio else '⚠️ faltan ' + str(sin_precio)}")
    sin_nivel = [u["unit_number"] for u in unidades if u["level"] is None]
    print(f"     todas con nivel:  {'✅' if not sin_nivel else '⚠️ faltan ' + str(sin_nivel)}")
    dup = [k for k in {u["unit_number"] for u in unidades}
           if [x["unit_number"] for x in unidades].count(k) > 1]
    print(f"     sin duplicados:   {'✅' if not dup else '⚠️ repetidas: ' + str(dup)}")
    for a in r["avisos"]:
        print(f"     ⚠️ {a}")

    if deptos:
        precios = [u["price"] for u in deptos]
        print(f"\n     departamentos: desde ${min(precios):,.0f} hasta ${max(precios):,.0f}")
    if roofs:
        print(f"     roof gardens:  desde ${min(u['price'] for u in roofs):,.0f} "
              f"(NO cuentan para el 'desde' del edificio)")

    if not aplicar:
        print("\n  (simulación · no se escribió nada · corre con --aplicar para guardar)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
