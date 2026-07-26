"""Acentos correctos en lo que el comprador LEE: nombre, colonia, alcaldía y dirección.

POR QUÉ (auditoría A–Z 2026-07-26): 31 desarrollos salen al público con el nombre mal escrito
—"Medellin 360", "Cuauhtemoc 1193", "Miguel Angel 73", "Icon San Angel"— y el catálogo de colonias
tiene ~1,000 filas con "Alvaro Obregon", "Coyoacan", "Benito Juarez". Es lo primero que ve un
cliente en el título de la ficha, y se lee descuidado.

CÓMO, sin romper nada:
  · Se corrige SOLO por palabra completa, contra una lista cerrada de topónimos y nombres propios
    de la Ciudad de México. Nada de "ponerle acento a todo lo que parezca".
  · La palabra se reemplaza conservando su forma: si venía en MAYÚSCULAS sale en mayúsculas, si
    venía capitalizada sale capitalizada. Así "COYOACAN" → "COYOACÁN" y "Coyoacan" → "Coyoacán".
  · NUNCA se toca un campo que ya trae el acento bien puesto.
  · NO se tocan identificadores (id, slug), que dependen de ir sin acento para que las ligas no
    se rompan. Solo texto que se muestra.

USO:  python scripts/acentos_nombres_publicos.py [--aplicar]
"""
import asyncio
import os
import re
import sys

import motor.motor_asyncio

# Lista CERRADA: topónimos y nombres propios de CDMX que la gente escribe sin acento.
# Clave sin acento (en minúsculas) → forma correcta capitalizada.
ACENTOS = {
    # alcaldías
    "alvaro": "Álvaro", "obregon": "Obregón", "coyoacan": "Coyoacán",
    "cuauhtemoc": "Cuauhtémoc", "juarez": "Juárez", "tlahuac": "Tláhuac",
    "milpa": "Milpa", "iztapalapa": "Iztapalapa", "azcapotzalco": "Azcapotzalco",
    # colonias y calles frecuentes
    "medellin": "Medellín", "mexico": "México", "angel": "Ángel",
    "revolucion": "Revolución", "leon": "León", "colon": "Colón",
    "potosi": "Potosí", "merced": "Merced", "gomez": "Gómez",
    "maria": "María", "jose": "José", "martin": "Martín",
    "guadalquivir": "Guadalquivir", "anzures": "Anzures",
    "cesar": "César", "peru": "Perú", "japon": "Japón",
    "atzcapotzalco": "Azcapotzalco", "ampliacion": "Ampliación",
    "san": "San", "santa": "Santa",
    # palabras comunes de dirección
    "numero": "Número", "edificio": "Edificio", "torre": "Torre",
    "privada": "Privada", "cerrada": "Cerrada", "avenida": "Avenida",
    "division": "División", "estacion": "Estación", "jardin": "Jardín",
    "panteon": "Panteón", "bosque": "Bosque", "canada": "Canadá",
    "nativitas": "Nativitas", "portales": "Portales",
    "insurgentes": "Insurgentes", "condesa": "Condesa",
    "unico": "Único", "via": "Vía",
}
# Campos que el comprador ve. NO se incluyen id ni slug a propósito.
CAMPOS = ("name", "colonia", "alcaldia", "address", "address_full")


def _con_forma_de(original: str, correcta: str) -> str:
    """Devuelve `correcta` con la MISMA forma que traía `original` (MAYÚS / Capitalizada / minús)."""
    if original.isupper():
        return correcta.upper()
    if original[:1].isupper():
        return correcta[:1].upper() + correcta[1:]
    return correcta.lower()


def arregla(texto: str) -> str:
    """Pone el acento solo en las palabras de la lista, respetando mayúsculas y el resto del texto."""
    if not texto:
        return texto

    def _una(m: re.Match) -> str:
        palabra = m.group(0)
        correcta = ACENTOS.get(palabra.lower())
        # Si ya trae acento (la palabra no está en la lista tal cual), se deja intacta.
        return _con_forma_de(palabra, correcta) if correcta else palabra

    return re.sub(r"\b[A-Za-z]+\b", _una, texto)


async def main(aplicar: bool):
    db = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)[os.environ["DB_NAME"]]

    print(f"════ {'APLICANDO' if aplicar else 'SIMULACIÓN — no se escribe nada'} ════\n")
    tocados = campos_n = 0
    async for d in db.developments.find({}, {"_id": 0, "id": 1, **{c: 1 for c in CAMPOS}}):
        cambios = {}
        for c in CAMPOS:
            viejo = d.get(c)
            if not isinstance(viejo, str) or not viejo.strip():
                continue
            nuevo = arregla(viejo)
            if nuevo != viejo:
                cambios[c] = nuevo
        if not cambios:
            continue
        tocados += 1
        campos_n += len(cambios)
        if tocados <= 20:
            for c, v in cambios.items():
                print(f"  {c:13} «{d.get(c)}»  →  «{v}»")
        if aplicar:
            await db.developments.update_one({"id": d["id"]}, {"$set": cambios})

    print(f"\n  desarrollos corregidos: {tocados} · campos: {campos_n}")

    # EL OTRO LADO DE LA LIGA — los avisos del vigía guardan el nombre del proyecto como TEXTO, y
    # el bot de Telegram lo cruza contra `developments.name` por coincidencia de texto
    # (telegram_bot.py). Si se acentúa un lado y no el otro, el cruce deja de encontrar y las
    # tarjetas del vigía llegan sin contexto. Se corrigen juntos o no se corrige ninguno.
    pend = 0
    async for p in db.vigia_pendientes.find({"proyecto": {"$type": "string"}}, {"_id": 1, "proyecto": 1}):
        nuevo = arregla(p["proyecto"])
        if nuevo != p["proyecto"]:
            pend += 1
            if pend <= 6:
                print(f"  vigía         «{p['proyecto']}»  →  «{nuevo}»")
            if aplicar:
                await db.vigia_pendientes.update_one({"_id": p["_id"]}, {"$set": {"proyecto": nuevo}})
    print(f"  avisos del vigía realineados: {pend}")

    if not aplicar:
        print("  (corre otra vez con --aplicar para escribir)")


if __name__ == "__main__":
    asyncio.run(main("--aplicar" in sys.argv))
