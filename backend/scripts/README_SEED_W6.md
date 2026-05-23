# W6 Synthetic Seeds

Scripts standalone que pueblan colecciones con data sintética realista para
visualizar 7 features W6 sin requerir actividad real de usuarios.

Todos los registros se marcan con `_seed_synthetic: True` para distinguirlos
de data real y limpiarlos selectivamente.

## Setup

Requiere `MONGO_URL` y `DB_NAME` en `backend/.env` o el entorno. Mismo
patrón que usa `server.py`.

```bash
cd /Users/manuelacosta/Developer/desarrollos_mvp_emergent
python backend/scripts/seed_w6_all.py --all
```

## Comandos

| Comando | Acción |
|---|---|
| `python backend/scripts/seed_w6_all.py --all` | Seedea las 7 features en orden + imprime tabla |
| `python backend/scripts/seed_w6_all.py --feature cq` | Solo construction_quality |
| `python backend/scripts/seed_w6_all.py --feature reviews` | Solo reviews_residents |
| `python backend/scripts/seed_w6_all.py --feature gov` | Solo gov_data_mx |
| `python backend/scripts/seed_w6_all.py --feature soc` | Solo soc_franchise |
| `python backend/scripts/seed_w6_all.py --feature workflows` | Solo workflows |
| `python backend/scripts/seed_w6_all.py --feature mcp` | Solo marketing_mcp |
| `python backend/scripts/seed_w6_all.py --feature qw` | Solo quick wins (templates + courses + factcheck) |
| `python backend/scripts/seed_w6_all.py --clean` | Limpia todos los seeds W6 |
| `python backend/scripts/seed_w6_construction_quality.py --count 30` | Override count individual |

## Idempotencia

Todos los scripts son **idempotentes**: re-ejecutarlos no duplica registros.
Las inserciones usan upsert por id natural o skip por external_id existente.

## Qué genera cada script

| Script | Collections | Volumen |
|---|---|---|
| `seed_w6_construction_quality.py` | `developments`, `construction_quality_signals`, `construction_quality_cache` | 15 devs + ~50 signals + scores |
| `seed_w6_reviews_residents.py` | `reviews_residents` | 60 reviews (60% pos / 25% neu / 15% neg) |
| `seed_w6_gov_data_mx.py` | `gov_data_mx_cache`, `gov_data_mx_uploads`, `gov_data_mx_runs` | 12 cache + 5 uploads + 3 runs |
| `seed_w6_soc_franchise.py` | `users`, `soc_franchise_cache`, `soc_franchise_history` | 20 asesores (5 plat/7 gold/5 silv/3 bronz) + 10 snapshots 7d |
| `seed_w6_workflows.py` | `workflows`, `workflow_runs` | 8 workflows + 20 runs (70% ok / 20% fail / 10% running) |
| `seed_w6_marketing_mcp.py` | `marketing_mcp_log`, `marketing_mcp_scheduled` | 25 publishes 30d + 3 scheduled |
| `seed_w6_quick_wins.py` | `projects`, `insights_courses`, `insights_factcheck_cache` | 5 templates + 8 duplicates + 5 courses + 10 factchecks |

## Limpieza

`--clean` borra solo los seeds:
- IDs con prefijo `seed-w6-*`
- Documentos con `_seed_synthetic: True`

No afecta data real producida por usuarios.

## Audit log

Cada script registra un entry `seed.w6.<feature>` en `audit_immutable`
con los counts agregados, hash encadenado y timestamp.

## Notas

- Scripts standalone: no modifican engines existentes
- Compatible con Mongo en supervisor o local
- Datos realistas CDMX: zonas reales (Polanco, Roma Norte, Condesa...), precios MXN 2-15M
- No crea usuarios reales con credenciales · solo entidades mockeadas
- Safe re-ejecutar 2+ veces; counts no se duplican
