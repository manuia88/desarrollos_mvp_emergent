# ACCESOS REQUERIDOS — lo NO_VERIFICABLE sin acceso externo

| Qué | Para verificar | Acceso necesario |
|---|---|---|
| Env vars de producción | fail-safe de arranque, defaults inseguros | valores reales (no los secretos, solo QUÉ está seteado) |
| Deploy real (Emergent/K8s) | pipeline, rollback, réplicas | acceso al panel Emergent o kubeconfig |
| MongoDB Atlas prod | índices reales, tamaños, backups/restore RPO-RTO | acceso lectura Atlas |
| Cloudflare R2/CDN | si CLOUDFLARE_R2_SETUP.md está implementado | panel Cloudflare |
| Sentry | cobertura real de errores front/back | panel Sentry |
