#!/usr/bin/env python3
"""
audit_silent_excepts.py — Auditoría del patrón `except` silencioso (item #11 de la auditoría 2026-07-12).

Distingue lo INOFENSIVO (fail-soft/parse-fallback a propósito) de lo PELIGROSO (traga el error y devuelve
un default que se sirve como dato válido, SIN log). NO cambia código — solo REPORTA para poder rastrear
y bajar el número peligroso con el tiempo (fix caso por caso, nunca en masa: cambiar fail-soft intencional
rompe la degradación elegante).

Uso:  python scripts/audit/audit_silent_excepts.py [--strict N]
  --strict N  → exit 1 si los PELIGROSOS superan N (gate de CI opcional; default: sin gate).
"""
import re
import sys
import glob
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
DEFAULT_RET = re.compile(r"^\s*return\s*(0|0\.0|None|\[\]|\{\}|\"\")\s*$")


def scan():
    files = [
        f for f in glob.glob(os.path.join(ROOT, "**", "*.py"), recursive=True)
        if "/.venv/" not in f and "/tests/" not in f and "/venv/" not in f
    ]
    silent_pass = 0
    danger = []  # (file, line, return-default) — except → return default SIN log
    for f in files:
        try:
            lines = open(f, encoding="utf-8").read().splitlines()
        except Exception:
            continue
        for i, ln in enumerate(lines):
            s = ln.strip()
            if re.match(r"except\b.*:\s*pass\s*$", s):
                silent_pass += 1
                continue
            if re.match(r"except\b.*:\s*$", s):
                body = [lines[j].strip() for j in range(i + 1, min(i + 4, len(lines))) if lines[j].strip()]
                if not body:
                    continue
                if body[0] == "pass":
                    silent_pass += 1
                elif i + 1 < len(lines) and DEFAULT_RET.match(lines[i + 1]):
                    has_signal = any(("log" in b or "print(" in b or "raise" in b or "capture" in b) for b in body)
                    if not has_signal:
                        danger.append((os.path.relpath(f, ROOT), i + 2, body[0]))
    return silent_pass, danger


def main():
    silent_pass, danger = scan()
    print("=" * 64)
    print("AUDITORÍA · except silenciosos (backend)")
    print("=" * 64)
    print(f"  except ...: pass  (silenciosos, mayoría best-effort):  {silent_pass}")
    print(f"  PELIGROSOS (except → return default SIN log):           {len(danger)}")
    print("  → los peligrosos sirven un default (0/None/[]) como dato válido enmascarando el error.")
    print("    Revisar caso por caso: si es parse-fallback/fail-soft, OK; si oculta un fallo real, loguear.")
    print("-" * 64)
    for f, line, ret in sorted(danger):
        print(f"  {f}:{line}  {ret}")
    limit = None
    if "--strict" in sys.argv:
        try:
            limit = int(sys.argv[sys.argv.index("--strict") + 1])
        except Exception:
            limit = None
    if limit is not None and len(danger) > limit:
        print(f"\nFALLO: {len(danger)} peligrosos > umbral {limit}")
        sys.exit(1)


if __name__ == "__main__":
    main()
