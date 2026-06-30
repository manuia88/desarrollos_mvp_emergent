#!/usr/bin/env bash
# Batería COMPLETA de verificación cross-portal. Corre los 6 harnesses (invariantes, aislamiento, journey, propagación
# en ambas direcciones, concurrencia). Todo tagueado + cero-residuo. Uso: bash scripts/audit_all.sh
set -uo pipefail
cd "$(dirname "$0")/.."
PY=scripts/.venv/bin/python3
echo "═══ BATERÍA DE VERIFICACIÓN DMX ═══"
echo "1· smoke (invariantes):        $($PY scripts/smoke_e2e.py 2>&1 | tail -1)"
echo "2· aislamiento tenant:         $($PY scripts/tenant_isolation_probe.py 2>&1 | tail -1)"
echo "3· e2e cohorte (journey):      $($PY scripts/e2e_cohort.py 2>&1 | tail -1)"
echo "4· propagación marketplace→*:  $($PY scripts/propagation_matrix.py 2>&1 | tail -1)"
echo "5· propagación direcciones:    $($PY scripts/propagation_directions.py 2>&1 | tail -1)"
echo "6· concurrencia 1000:          $($PY scripts/concurrent_load.py 2>&1 | tail -1)"
echo "7· flywheel 4 portales:        $($PY scripts/flywheel_final.py 2>&1 | tail -1)"
