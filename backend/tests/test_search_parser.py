"""Batería de pruebas del parser de búsqueda natural (fallback DETERMINISTA, sin LLM).
Cubre las MUCHAS formas de expresar valores: dígitos, palabras, mixto, compuesto, rangos, operadores, tiempos.
Correr: ./scripts/.venv/bin/python backend/tests/test_search_parser.py  (con el backend en localhost:8000)."""
import json, sys, urllib.request

def parse(q):
    req = urllib.request.Request("http://localhost:8000/api/properties/search-ai",
        data=json.dumps({"query": q}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read()).get("filters", {})

# (query, campo, esperado).  Para listas: esperado ⊆ obtenido.
CASOS = [
    # --- Dinero: compuesto / palabras / mixto / magnitudes ---
    ("apartado de 2mil 500", "apartado_max", 2500),
    ("apartado de 10 mil", "apartado_max", 10000),
    ("con 2,500 de apartado", "apartado_max", 2500),
    ("enganche de medio millon", "enganche_max", 500000),
    ("enganche de quinientos mil", "enganche_max", 500000),
    ("enganche maximo 1.5 millones", "enganche_max", 1500000),
    ("enganche de 2 millones 500 mil", "enganche_max", 2500000),
    # --- Dinero: rangos + operadores ---
    ("enganche entre 500 y 700 mil", "enganche_max", 700000),
    ("enganche menor a 500 mil", "enganche_max", 500000),
    ("enganche hasta 800mil", "enganche_max", 800000),
    ("mensualidad de 15 mil", "mensualidad_max", 15000),
    ("mensualidades que no pasen de 20 mil", "mensualidad_max", 20000),
    # --- Precio (rango / tope / mixto) ---
    ("entre 5 y 50 millones", "max_price", 50000000),
    ("de 10 a 15 mdp", "max_price", 15000000),
    ("hasta 8 millones", "max_price", 8000000),
    ("entre 5 y 50 millones", "min_price", 5000000),
    # --- m² (rango, unidad al inicio o al final) ---
    ("100m2 a 250", "max_sqm", 250),
    ("entre 80 y 120 metros", "max_sqm", 120),
    ("100m2 a 250", "min_sqm", 100),
    # --- Tiempo: años / meses / días, dígitos y palabras ---
    ("a 2 años en preventa", "plazo", "mas_12"),
    ("entrega en 8 meses", "plazo", "6_12"),
    ("entrega en 90 dias", "plazo", "menos_3"),
    ("entrega en dos años", "plazo", "mas_12"),
    # --- Multi-zona + acentos ---
    ("en polanco o condesa, napoles", "colonia", ["polanco", "condesa", "napoles"]),
    # --- Recámaras / tipo / etapa / features ---
    ("3 recamaras 2 baños", "beds", 3),
    ("departamento en preventa", "stage", "preventa"),
    ("con balcon y roof garden privado", "unit_feature", ["balcon", "roof_garden"]),
]

ok, fail = 0, []
for q, k, exp in CASOS:
    got = parse(q).get(k)
    if isinstance(exp, list):
        passed = set(exp) <= set(got or [])
    else:
        passed = got == exp
    if passed: ok += 1
    else: fail.append((q, k, exp, got))

print(f"PASA: {ok}/{len(CASOS)}")
for q, k, exp, got in fail:
    print(f"  X '{q}' · {k}: esperaba {exp}, dio {got}")
sys.exit(0 if not fail else 1)
