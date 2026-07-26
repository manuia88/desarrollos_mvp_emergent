"""Ubicación EXACTA de cada desarrollo cruzando su dirección contra el catastro de CDMX.

POR QUÉ (auditoría A–Z 07-25): sólo 1 de 116 desarrollos tenía coordenada exacta. Los otros 115
estaban puestos en el CENTRO DE SU COLONIA, así que en el mapa 7 edificios distintos de la Roma
caían en el mismo pin. La dirección real SÍ estaba guardada ("BRETAÑA 45, COL. ZACAHUITZCO, BENITO
JUÁREZ") — simplemente nunca se usó para encontrar el predio.

SIN API EXTERNA: `catastro_predios` (1,089,684 predios oficiales de SIGCDMX, restaurado del respaldo)
trae `calle` con nombre Y número, más `lat`/`lng` exactos. Es la misma información que daría Google
Maps, pero es tuya y no cuesta ni depende de nadie.

MÉTODO
  1. De la dirección se toma lo que va antes de la primera coma: ahí vive "calle + número".
  2. Se normaliza (sin acentos, sin abreviaturas de vialidad, sin dobles espacios).
  3. Se busca en el catastro un predio con la MISMA calle y el MISMO número, dentro de la alcaldía
     del desarrollo (para no confundir calles homónimas de otra demarcación).
  4. **Se verifica antes de escribir**: el predio encontrado debe caer a menos de 3 km del centro de
     la colonia declarada. Si cae más lejos, es otra calle con el mismo nombre y se descarta.
No se toca nada que no pase la verificación — mejor quedarse con la coordenada aproximada honesta
que poner una exacta equivocada.

USO:  python scripts/geo_exacta_desde_catastro.py [--aplicar]
"""
import asyncio
import math
import os
import re
import sys
import unicodedata

import motor.motor_asyncio

# Prefijos de vialidad que el catastro suele omitir y las listas sí traen.
_VIALIDAD = r"^(AV|AVE|AVENIDA|CALZ|CALZADA|BLVD|BLV|BOULEVARD|BLVRD|CALLE|CAM|CAMINO|PROL|PROLONGACION|PASEO|EJE|CDA|CERRADA|PRIV|PRIVADA|RETORNO|AND|ANDADOR)\.?\s+"
_MAX_KM = 3.0          # un predio a más de esto de su colonia es otra calle homónima


def norm(s) -> str:
    """Texto comparable: sin acentos, mayúsculas, sin puntuación ni dobles espacios."""
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().upper()
    t = re.sub(r"[.,;:#°]", " ", t)
    return " ".join(t.split())


def calle_y_numero(direccion: str):
    """'AV. REVOLUCIÓN 1412, COL. GUADALUPE INN' → ('REVOLUCION', '1412').

    Tolera lo que traen las listas reales:
      · paréntesis de apertura — "(Blvd. Adolfo López mateos 2004"
      · número con letra       — "Eje Central Lázaro Cárdenas 909A"
      · almohadilla            — "Tomas Alva Edison #106"
      · varios números         — "Ignacio L. Vallarta 7, 9" → se queda con el primero de la cabeza
    """
    cabeza = norm(str(direccion or "").split(",")[0])
    cabeza = cabeza.lstrip("( ").strip()
    cabeza = re.sub(_VIALIDAD, "", cabeza)
    # número exterior: dígitos con posible letra pegada (909A). Se toma el ÚLTIMO de la cabeza,
    # que es el patrón normal "<calle> <número>".
    nums = re.findall(r"\b(\d{1,5}[A-Z]?)\b", cabeza)
    if not nums:
        return (cabeza.strip() or None), None
    numero = nums[-1]
    calle = norm(cabeza[:cabeza.rfind(numero)])
    return (calle or None), numero


def km(lat1, lng1, lat2, lng2) -> float:
    """Distancia aproximada en kilómetros entre dos puntos."""
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def main(aplicar: bool):
    db = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)[os.environ["DB_NAME"]]

    devs = await db.developments.find(
        {}, {"_id": 0, "id": 1, "name": 1, "address": 1, "address_full": 1,
             "colonia": 1, "alcaldia": 1, "lat": 1, "lng": 1, "geo_confianza": 1}).to_list(500)
    print(f"════ {'APLICANDO' if aplicar else 'SIMULACIÓN'} · {len(devs)} desarrollos ════\n")

    exactas = lejos = sin_match = sin_direccion = 0
    for d in devs:
        direccion = d.get("address") or d.get("address_full")
        calle, numero = calle_y_numero(direccion)
        if not calle or not numero:
            sin_direccion += 1
            continue

        alc = norm(d.get("alcaldia"))
        col = norm(d.get("colonia"))
        # El catastro escribe la dirección de formas variadas y hay que tolerarlas todas:
        #   "Hortensia 119" · "Cl. HORTENSIA, 115 Dpto. 115-A" · "BLVRD MIGUEL DE CERVANTES, 595"
        #   · "Bretana Num 170 Local a"
        # O sea: prefijo de vialidad propio, coma antes del número, y "Num"/"No." de por medio.
        sep = r"[\s,]*(?:NUM|NO|N)?\.?[\s,]*"
        patron = re.compile(rf"(?:^|\b)(?:{_VIALIDAD})?{re.escape(calle)}{sep}{numero}\b", re.I)
        cands = await db.catastro_predios.find(
            {"calle": {"$regex": patron}},
            {"_id": 0, "calle": 1, "colonia": 1, "alcaldia": 1, "lat": 1, "lng": 1}
        ).limit(60).to_list(60)

        # RESPALDO — el número exacto no siempre está en el catastro (predios fusionados, obra
        # nueva, numeración cambiada). En vez de rendirse, se busca la MISMA CALLE en la MISMA
        # COLONIA y se toma el predio con el número más parecido: queda en la misma cuadra, que es
        # infinitamente mejor que el centro de la colonia. Se marca aparte, sin fingir exactitud.
        aproximado_por_calle = False
        if not cands and calle:
            pat_calle = re.compile(rf"(?:^|\b)(?:{_VIALIDAD})?{re.escape(calle)}\b", re.I)
            q = {"calle": {"$regex": pat_calle}}
            if col:
                q["colonia"] = {"$regex": re.escape(d.get("colonia") or ""), "$options": "i"}
            vecinos = await db.catastro_predios.find(
                q, {"_id": 0, "calle": 1, "colonia": 1, "alcaldia": 1, "lat": 1, "lng": 1}
            ).limit(80).to_list(80)
            if vecinos:
                try:
                    objetivo = int(re.sub(r"\D", "", numero) or 0)
                    def _dif(c):
                        m = re.search(r"\b(\d{1,5})\b", str(c.get("calle") or ""))
                        return abs(int(m.group(1)) - objetivo) if m else 9e9
                    vecinos.sort(key=_dif)
                except (TypeError, ValueError):
                    pass
                cands = vecinos[:10]
                aproximado_por_calle = True

        if not cands:
            sin_match += 1
            continue

        # Desempate en dos pasos:
        #  1. Cercanía administrativa: misma COLONIA (señal más fuerte), luego misma alcaldía.
        #  2. Entre los que quedan, **el más cercano** al punto que ya tiene el desarrollo (el
        #     centro de su colonia). Ciudad de México tiene decenas de "Insurgentes" y "Zaragoza";
        #     quedarse con el primer resultado ponía el edificio a 13 km. El más cercano al centro
        #     de su propia colonia es, por construcción, el correcto.
        por_colonia = [c for c in cands if col and norm(c.get("colonia")) == col]
        por_alcaldia = [c for c in cands if norm(c.get("alcaldia")) == alc]
        mismos = por_colonia or por_alcaldia or cands
        if d.get("lat") and d.get("lng"):
            mismos = sorted(mismos, key=lambda c: km(d["lat"], d["lng"], c.get("lat") or 0, c.get("lng") or 0)
                            if c.get("lat") else 9e9)
        elegido = mismos[0]

        # VERIFICACIÓN — y aquí está la lección: la primera versión comparaba contra la coordenada
        # que el desarrollo YA tenía, y esa coordenada es justo lo que estamos arreglando. Antonio
        # Caso 61 (San Rafael) tenía guardado 19.538, que es Gustavo A. Madero: 11 km fuera. Por eso
        # rechazaba el predio CORRECTO. Nunca verifiques contra el dato que estás corrigiendo.
        #
        # El ancla buena es el NOMBRE DE LA COLONIA, que no depende de coordenadas: si el predio del
        # catastro está en la misma colonia que declara el desarrollo, es el edificio.
        col_predio = norm(elegido.get("colonia"))
        col_ok = bool(col and col_predio and (col in col_predio or col_predio in col))
        dist = None
        if d.get("lat") and d.get("lng") and elegido.get("lat"):
            dist = km(d["lat"], d["lng"], elegido["lat"], elegido["lng"])

        if not col_ok:
            # Sin coincidencia de colonia, se exige cercanía al punto previo como segunda opinión.
            if dist is None or dist > _MAX_KM:
                lejos += 1
                print(f"  ⚠️  {str(d.get('name'))[:26]:26} «{calle} {numero}» → predio en "
                      f"«{elegido.get('colonia')}» pero el desarrollo dice «{d.get('colonia')}»"
                      f"{f' y está a {dist:.1f} km' if dist is not None else ''} → se descarta")
                continue

        exactas += 1
        _icono = "✅" if not aproximado_por_calle else "📍"
        if exactas <= 10:
            _v = "colonia coincide" if col_ok else f"{dist:.2f} km del punto previo"
            _extra = " · MISMA CUADRA (el número exacto no está en el catastro)" if aproximado_por_calle else ""
            print(f"  {_icono} {str(d.get('name'))[:26]:26} «{calle} {numero}» → {elegido.get('calle')} "
                  f"({elegido.get('colonia')}) · {_v}{_extra}")
        if aplicar:
            await db.developments.update_one({"id": d["id"]}, {"$set": {
                "lat": elegido["lat"], "lng": elegido["lng"],
                "center": [elegido["lng"], elegido["lat"]],
                # Honestidad: "exacta" sólo cuando el predio es el del número que dice la dirección.
                # Si se tomó el vecino más cercano de la misma calle, es "cuadra", no exacta.
                "geo_confianza": "cuadra" if aproximado_por_calle else "exacta",
                "geo_nivel": "calle" if aproximado_por_calle else "direccion",
                "geo_fuente": (f"catastro SIGCDMX · {'predio más cercano de la calle' if aproximado_por_calle else 'predio'} "
                               f"«{elegido.get('calle')}»"),
                "geo_verificado_at": "2026-07-26",
            }})

    print(f"\n  ubicaciones EXACTAS encontradas: {exactas}")
    print(f"  descartadas por caer lejos (calle homónima): {lejos}")
    print(f"  sin predio en el catastro: {sin_match}")
    print(f"  sin dirección utilizable: {sin_direccion}")
    if not aplicar:
        print("\n  (corre otra vez con --aplicar para escribir)")


if __name__ == "__main__":
    asyncio.run(main("--aplicar" in sys.argv))
