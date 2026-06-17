# Suite de auditorías estructurales (Candado 1 · anti-parches)

Convierte las reglas que antes dependían de "que cada quien se acuerde" en gates de CI.
Corre en cada push/PR (`.github/workflows/ci.yml`). Deterministas: fuerzan un stub del paquete
privado del LLM para dar el mismo resultado en local y CI.

## Scripts

- **`audit_tenant.py`** — el candado RLS-en-Mongo. Marca handlers de `routes/` que tocan una
  colección CON DUEÑO (leads, users, appointments, etc.) sin NINGÚN guard de tenant/auth en el
  cuerpo. **Falla el build** si aparece un handler NUEVO así (no en el baseline). Heurística:
  "toca colección-con-dueño Y el cuerpo no menciona ningún token de guard" (no "filtro dentro del
  find" — eso daría falsos positivos por el patrón guard-aparte + find-by-id).
- **`audit_routes.py`** — red del Candado 6. Snapshot del conteo de rutas; **falla si baja**
  (un router se dejó de registrar en silencio al cortar `server.py`). Correr antes/después de
  cada extracción.
- **`_app_routes.py`** — carga la tabla de rutas REAL importando el app (runtime, no regex).

## Uso

```bash
cd scripts/audit
python audit_tenant.py          # falla si hay handler nuevo sin guard
python audit_routes.py          # falla si bajó el conteo de rutas
```

## Cuándo correr `--update` (regenerar baseline)

Solo tras una revisión a ojo:
- `audit_tenant.py --update` — cuando agregas un endpoint que LEGÍTIMAMENTE no lleva guard de
  tenant (público por token, flujo de auth que toca `users` por naturaleza, etc.). Revisa que de
  verdad sea intencional antes de aceptarlo.
- `audit_routes.py --update` — cuando agregaste/quitaste rutas a propósito y quieres fijar el nuevo piso.

Los baselines (`tenant_baseline.json`, `routes_baseline.json`) se commitean: son el contrato.

## Pendiente (fast-follow, higiene no-bloqueante)
`audit_dead_ui` (componentes sin importador) + `audit_broken_cables` (llamadas del front a rutas
inexistentes). No son safety-critical (no sangran datos); su ROI es máximo al construir features.
