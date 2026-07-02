"""Regresiones del BATCH 1 de la auditoría forense (AUD-004..AUD-008).

Cada test demuestra el defecto corregido de forma ejecutable:
  · AUD-004/005/006/007: nombres indefinidos / shadowing (F821/F823) — ruff como oráculo
    sobre los archivos EXACTOS que estaban rotos. Rojo antes del fix, verde después.
  · AUD-005 (semántica): _build_pdf deriva el org del template — el branding B19.5 vuelve a vivir.
  · AUD-008: los 6 módulos con storage import-time IMPORTAN en una máquina sin /app escribible
    (antes: OSError en colección de pytest → 0 tests corrían).
"""
import ast
import importlib
import os
import subprocess
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXED_FILES = [
    "routes/comparable_alerts.py",   # AUD-004 Optional
    "routes/dev_batch5.py",          # AUD-005 org_id
    "routes/developer.py",           # AUD-006 logging shadowing
    "studio_listing_importer.py",    # AUD-007 timedelta
]


def test_aud_004_a_007_sin_nombres_indefinidos():
    """ruff F821/F823 = 0 en los archivos que estaban rotos (era 5 hallazgos)."""
    r = subprocess.run(
        [sys.executable, "-m", "ruff", "check", *FIXED_FILES,
         "--select", "F821,F823", "--output-format", "concise"],
        cwd=BACKEND, capture_output=True, text=True)
    assert r.returncode == 0, f"nombres indefinidos reintroducidos:\n{r.stdout}"


def test_aud_005_branding_deriva_org_del_template():
    """El bloque B19.5 ya no referencia un org_id inexistente: deriva del template."""
    src = open(os.path.join(BACKEND, "routes/dev_batch5.py"), encoding="utf-8").read()
    tree = ast.parse(src)
    fn = next(n for n in ast.walk(tree)
              if isinstance(n, ast.AsyncFunctionDef) and n.name == "_build_pdf")
    args = {a.arg for a in fn.args.args + fn.args.kwonlyargs}
    names_used = {n.id for n in ast.walk(fn) if isinstance(n, ast.Name)}
    # el bug era: usa org_id sin que exista ni como arg ni como asignación local
    assigned = {t.id for n in ast.walk(fn) if isinstance(n, ast.Assign)
                for t in n.targets if isinstance(t, ast.Name)}
    if "org_id" in names_used:
        assert "org_id" in args or "org_id" in assigned, \
            "_build_pdf usa org_id sin definirlo (regresión AUD-005)"
    # y el fix vigente: el org sale del template
    assert 'template.get("dev_org_id")' in src, "el branding ya no deriva el org del template"


def test_aud_008_modulos_importan_sin_app_dir():
    """Los 6 módulos con storage import-time deben importar aunque /app no exista/escriba."""
    sys.path.insert(0, BACKEND)
    for mod in ("fs_fallback", "free_audit_engine", "brochure_renderer", "dev_assets",
                "document_intelligence", "state_of_cdmx_engine", "tour_3dgs_engine"):
        importlib.import_module(mod)  # antes: OSError [Errno 30] en máquinas sin /app
