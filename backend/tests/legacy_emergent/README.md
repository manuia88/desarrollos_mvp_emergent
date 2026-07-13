# Tests retirados · era Emergent (AUD-011 — resuelto 2026-07-13)

Estos archivos eran pruebas E2E contra el backend de la era Emergent (localhost:8001 /
preview.emergentagent.com), retirada el 2026-05-31 por decisión del founder. Llevaban meses
saltándose ("backend no vivo en :8001") e inflaban el conteo de skips de la suite.

Se RETIRAN (renombrados a `retired_*` para que pytest no los recolecte) en vez de borrarse:
la historia queda en git y el contenido sirve de referencia de qué cubría cada batch.
La cobertura vigente vive en los ~1,535 tests activos de `backend/tests/`.
