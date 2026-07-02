# CHECKLIST DE DEPLOY — arreglos de seguridad + costo (auditoría 2026-07)

> Todo el código ya está en `main` (commit `9c19382d`). Esto es lo que falta hacer FUERA del código
> (config/infra/DB de prod) para que los arreglos protejan de verdad. Ordenado por urgencia.
> Relacionado: `HALLAZGOS.md`, `CORRECCIONES.md`, `PENDIENTES_APROBACION.md`.

## 0. AHORA MISMO (sin esperar deploy) — frenar los cargos de AirROI
- [ ] En las variables de entorno de **producción**, deja `IE_AIRROI_API_KEY` **en blanco**.
      Verificado: sin key el conector no hace ninguna llamada de red → corta los cargos al instante.

## 1. Deploy del código (`main` @ 9c19382d)
Activa, todos de golpe: freno de AirROI en los crons, cierre de la fuga de datos de prospectos
(AUD-027), gentrificación/budgets protegidos (AUD-028/029), rate-limit de invite-codes (AUD-030),
y los fixes de auth del Batch 3 (AUD-021/022/023).

## 2. Variables de entorno en prod (sin esto = fail-open o se rompe)
- [ ] `AIRROI_ENABLED=true` — (nuevo) freno de emergencia; ponlo `false` para apagar AirROI sin deploy.
- [ ] `DMX_ENV=production`
- [ ] `DMX_DEV_MODE` ausente o `false` (si `true` seedea cuentas demo con password público)
- [ ] `ADMIN_PASSWORD` ≠ `Admin2026!` (el default es público) — esto **rota la contraseña del superadmin
      `admin@desarrollosmx.io`; NO se borra la cuenta**, es tu admin real.
- [ ] `CORS_ORIGINS` = `https://desarrollosmx.io,https://www.desarrollosmx.io`
- [ ] `TRUSTED_PROXY_HOPS` = `1` (ingress) o `2` (si Cloudflare va delante)
- [ ] Secretos aleatorios (`JWT_SECRET` — el arranque ABORTA sin él —, `LFPDPPP_SALT`, `CRON_SECRET`,
      `LEAD_CAPTURE_SECRET`, `ERP_WEBHOOK_SECRET`) + `STRIPE_WEBHOOK_SECRET` (de tu panel de Stripe).
      Genera cada uno con (córrelo tú; el valor NUNCA pasa por el chat):
      ```
      python3 -c "import secrets; print(secrets.token_urlsafe(48))"     # uno por cada secreto de arriba
      python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # IE_FERNET_KEY
      ```

## 3. Acción una-sola-vez en la DB de prod — UN comando
- [ ] Correr el script de endurecimiento (aísla tenants AUD-023b + borra SOLO las 2 cuentas demo
      `@demo.com`; **NO toca `admin@desarrollosmx.io`**, tu superadmin real). Lee MONGO_URL/DB_NAME del
      entorno de prod → no pasas secretos a nadie. Idempotente, dry-run por defecto.
      ```
      python3 backend/scripts/prod_db_hardening.py            # dry-run: muestra qué haría
      python3 backend/scripts/prod_db_hardening.py --apply     # aplica
      ```

## 4. Cloudflare (infra)
- [ ] **Clickjacking**: Response Header Transform Rule → `X-Frame-Options: DENY` +
      `Content-Security-Policy: frame-ancestors 'none'` para todo el sitio (el HTML de los portales
      lo sirve el ingress sin este header; el API ya lo manda).
- [ ] Restringir el origen del ingress a las IPs de Cloudflare (rate-limit infalsificable).

## 5. Diferidos (bajos · NO bloquean prod)
- AUD-031: newsletter opt-out sin token firmado (ver PENDIENTES_APROBACION.md).
- Residuales del pentest 2026-06-27 (idempotencia webhooks, XFF log-only) — ya documentados.
