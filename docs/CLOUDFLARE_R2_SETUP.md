# Cloudflare R2 · Setup guide para DMX Studio Asset Library

**Owner**: founder · **Tiempo estimado**: ~25 min · **Costo**: $0 hasta 10GB/mes (R2 free tier).

Esta guía cubre la configuración de Cloudflare R2 como backend de storage para
**W5.22 Z.1 Sub-C · Studio Asset Library + Mood Board**. Mientras las 5 env
vars `CLOUDFLARE_R2_*` no estén configuradas el backend funciona en **modo
stub** (presigned URLs retornan `null` · no rompe nada · solo no se pueden
subir/servir assets reales).

---

## 1 · ¿Cuándo necesitas esto?

Solo necesitas configurar R2 cuando vayas a usar Studio en producción real
con fotos / videos / PDFs / scans 3DGS de clientes. **Si solo estás demoeando
DMX a inversionistas o probando UI**, el modo stub (sin R2) ya muestra toda
la interfaz funcional · con la única diferencia de que los uploads no
persisten físicamente.

Escenarios típicos donde SÍ configurar R2:

- Founder o developer va a hacer demo con fotos reales de un proyecto
- Cliente del portal Studio va a empezar a subir su biblioteca de assets
- Pipeline de generación de brochures/videos (Phase Z.4) necesita assets reales

Si NO aplica ninguno · puedes saltarte esta guía completa hasta que sea relevante.

---

## 2 · ¿Por qué R2 y no S3?

| | R2 | S3 |
|---|---|---|
| Egress cost | **$0/GB** | $0.09/GB |
| Free tier | 10GB storage + 1M reads/mes | 5GB · 12 meses |
| API | S3-compatible (boto3 funciona) | nativo |
| CDN | Cloudflare built-in (gratis) | CloudFront extra |
| Costo H1 estimado DMX | **$0** (asset library tamaño bajo) | ~$30/mes |

R2 es la elección obvia para H1. Migrar a S3 en H2 si DMX escala >100GB es
trivial (mismo API).

---

## 3 · Paso 1 · Crear cuenta Cloudflare (skip si ya existe)

1. Ir a <https://dash.cloudflare.com/sign-up>
2. Email founder · password fuerte (1Password recomendado)
3. Verificar email · sin tarjeta de crédito requerida para R2 free tier
4. Anotar el `Account ID` que aparece en el sidebar derecho del dashboard

---

## 4 · Paso 2 · Habilitar R2 (Object Storage)

1. En el dashboard izquierdo: **R2 Object Storage**
2. Click **Purchase R2 Plan** (free tier · no requiere tarjeta hasta exceder 10GB)
3. Confirmar términos · plan **R2 Standard** (gratis hasta 10GB/mes)

Una vez habilitado verás la sección R2 con `Buckets` vacío.

---

## 5 · Paso 3 · Crear bucket `dmx-studio-assets`

1. Click **Create bucket**
2. **Bucket name**: `dmx-studio-assets` (debe matchear `CLOUDFLARE_R2_BUCKET` en `.env`)
3. **Location**: dejar en default (Cloudflare elige automáticamente · global edge)
4. **Default Storage Class**: `Standard`
5. Click **Create bucket**

---

## 6 · Paso 4 · Generar Account API Token (Access Key + Secret)

1. R2 dashboard → **Manage R2 API Tokens** (importante: **Account API Token**, NO User token)
2. Click **Create API Token**
3. **Token name**: `dmx-studio-asset-library`
4. **Permissions**: `Object Read & Write`
5. **Specify bucket**: seleccionar `dmx-studio-assets` (NO "All buckets" · principio
   de mínimo privilegio · si tokens leakean solo afecta este bucket)
6. **TTL**: dejar en default (no expira · o setear a 1 año si prefieres rotación)
7. Click **Create API Token**
8. **CRÍTICO**: copiar a 1Password los 2 valores que aparecen:
   - `Access Key ID` (público · 32 chars hex)
   - `Secret Access Key` (privado · 64 chars hex · **NUNCA committear**)

Cloudflare NO muestra el secret de nuevo después de cerrar la página. Si lo
pierdes hay que revocar y crear uno nuevo.

---

## 7 · Paso 5 · Habilitar Public Development URL

⚠️ **Crítico**: sin este paso el backend serviría URLs S3 API que retornan
**400 Bad Request** desde el browser (requieren auth headers). El fix correcto
es exponer el bucket vía Public Development URL de Cloudflare (público
read-only · NO escribe).

1. R2 dashboard → bucket `dmx-studio-assets` → **Settings**
2. Buscar sección **Public Development URL**
3. Click **Enable** (Cloudflare genera un subdominio del tipo
   `pub-xxxxxxxxxxxxxxxx.r2.dev`)
4. **Anotar** la URL completa (ej. `https://pub-a1b2c3d4e5f6g7h8.r2.dev`)
   · esta va en `CLOUDFLARE_R2_PUBLIC_URL` (Paso 7)

Para producción profesional podés sustituir esta URL por un custom domain
(ej. `assets.desarrollosmx.io`) más adelante · ver sección 13 FAQ.

---

## 8 · Paso 6 · CORS Policy (permitir browser uploads)

Sin CORS el frontend no puede subir directamente al bucket via presigned
PUT URLs. Configurar:

1. R2 dashboard → bucket `dmx-studio-assets` → **Settings** → **CORS Policy**
2. Click **Add CORS Policy** · pegar este JSON:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://*.emergent.host",
      "https://desarrollosmx.io",
      "https://www.desarrollosmx.io"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD", "POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Click **Save** · cambios aplican en ~30 segundos
4. Si tu dominio de producción NO es desarrollosmx.io · ajustar `AllowedOrigins` antes

---

## 9 · Paso 7 · Configurar env vars en backend `.env`

Editar `backend/.env` (NO `.env.example` · que solo tiene placeholders):

```bash
# W5.22 Z.1 — Studio Brand Kit + Asset Library (Cloudflare R2)
CLOUDFLARE_R2_ACCOUNT_ID=<32-char-hex-del-paso-1>
CLOUDFLARE_R2_ACCESS_KEY=<access-key-del-paso-4>
CLOUDFLARE_R2_SECRET_KEY=<secret-del-paso-4>
CLOUDFLARE_R2_BUCKET=dmx-studio-assets
CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev   # del Paso 5
```

**Importante**:
- NO incluir `https://` en `CLOUDFLARE_R2_ACCOUNT_ID` · es solo el hex
- `CLOUDFLARE_R2_PUBLIC_URL` SÍ incluye `https://` (es URL completa)
- NO committear `backend/.env` · ya está en `.gitignore`
- Verificar `git status` después de editar · NO debe aparecer

---

## 10 · Paso 8 · Restart backend

Para que el backend tome las nuevas env vars:

```bash
# Si usas el script local de DMX:
./scripts/dev-down.sh && ./scripts/dev-up.sh

# O si corre con supervisor:
supervisorctl restart backend

# O si corre en docker:
docker compose restart backend
```

Buscar en los logs del startup:

```
[startup] studio_asset_library R2 connected · bucket=dmx-studio-assets
```

Si aparece `R2 client init failed: invalid credentials` → revisar Pasos 4 y 7.

---

## 11 · Paso 9 · Verificación end-to-end

### 11.1 Test desde Python REPL

```bash
cd backend && python3 -c "
from studio_asset_library import _get_r2_client
client = _get_r2_client()
print('R2 OK' if client else 'R2 stub mode (env vars missing)')
"
```

### 11.2 Test upload via portal Studio

1. Login como developer · abrir `/portal/studio/assets`
2. Drag-and-drop una imagen pequeña (logo PNG ~50KB)
3. Verificar:
   - Imagen aparece en la grid sin error
   - Click en preview · imagen se carga correctamente
   - DevTools Network · ver que la URL del `<img src>` es `https://pub-xxxx.r2.dev/...`
     (NO `r2.cloudflarestorage.com` · esa es S3 API y rompería)
   - Cloudflare R2 dashboard · bucket muestra 1 object

### 11.3 Rollback rápido

Si algo falla y necesitas volver a modo stub temporalmente:

```bash
# Comentar las 5 vars en backend/.env
sed -i '' 's/^CLOUDFLARE_R2/#CLOUDFLARE_R2/' backend/.env
./scripts/dev-down.sh && ./scripts/dev-up.sh
```

El backend volverá a presigned-URLs-null automáticamente · sin
romper nada para usuarios existentes (preview muestra estado vacío).

---

## 12 · Pipeline de procesamiento (opcional · Phase Z.4)

Una vez R2 esté activo, DMX puede procesar assets server-side usando
**Pillow** (ya instalado por W5.16 Social Cards Renderer) para generar
thumbnails, watermarks o variantes ad-hoc. Pipeline conceptual:

1. Upload llega a R2 vía presigned PUT
2. Backend dispara cron job (`studio_asset_pipeline_cron.py`) o función
   on-upload
3. Pillow lee el asset original desde R2 (boto3 `get_object`)
4. Genera N variantes (thumb 320×180 · medium 800×600 · social card overlay)
5. Persiste cada variante en R2 con prefijo `variants/{asset_id}/`
6. Actualiza `asset.variants[]` en MongoDB

**Esta pipeline NO está implementada en Z.1 base · se construye en Phase Z.4
si el founder decide priorizar generación automática de brochures/videos
con plantillas brand-aware.**

Reuso confirmado:
- Pillow (`pip install pillow` ya en `requirements.txt`)
- boto3 (instalado por Z.1 Sub-C para R2 client)
- social_cards_engine.py W5.16 ya tiene composición Pillow con tokens de marca
  · puede consumirse como librería interna

---

## 13 · Costos estimados (escala)

| Métrica | H1 estimado (DMX hoy) | Free tier | Costo H1 |
|---|---|---|---|
| Storage | ~3GB | 10GB | $0 |
| Reads/mes | ~200K | 1M | $0 |
| Writes/mes | ~5K | 1M | $0 |
| Egress | ~2GB | ilimitado | $0 |
| **Total** | | | **$0/mes** |

Proyección a escala (post-launch H2/H3):

| Escala | Storage | Egress | Costo R2/mes | Costo S3/mes |
|---|---|---|---|---|
| 100K fotos (~50GB) | 50GB | 100GB | **~$0.60** | ~$13.50 |
| 1M fotos (~500GB) | 500GB | 1TB | **~$7.50** | ~$103.50 |
| 10M fotos (~5TB) | 5TB | 10TB | **~$60** | ~$1,035 |

R2 storage: $0.015/GB/mes después de los primeros 10GB gratis.
R2 reads: $0.36 por millón después del primer millón gratis.
R2 egress: **siempre $0**.

---

## 14 · FAQ

**¿R2 vs S3?** R2 elimina costos de egress (el gasto dominante en S3 para
asset serving). Para DMX que sirve fotos al browser de clientes, R2 es 15-20×
más barato a escala.

**¿R2 vs Cloudflare Images?** Cloudflare Images es un servicio managed con
transformaciones automáticas (resize/format) y un costo fijo por imagen ($5
por 100K imágenes/mes). Es más caro pero más simple si no querés mantener
pipeline propio. R2 + Pillow propio nos da control total y costo escalable.
Decidimos R2 por costo + flexibilidad.

**¿Qué pasa si las env vars están vacías?** El backend funciona en **modo
stub**: el UI carga · drag-and-drop funciona en el frontend (browser-side) ·
pero la persistencia es null. Útil para demos sin compromisos de hosting.

**¿Puedo usar custom domain (`assets.desarrollosmx.io`) en lugar de R2.dev?**
Sí. Cloudflare R2 → bucket → Settings → Custom Domains → Connect Domain.
Requiere el dominio en Cloudflare DNS (o transferido). Después actualizás
`CLOUDFLARE_R2_PUBLIC_URL=https://assets.desarrollosmx.io` y restart backend.
No requiere cambios de código.

**¿Cómo migro a S3 si decidimos cambiar?** boto3 cliente es S3-compatible:
cambiás endpoint URL y credenciales · cero refactor. Migración de datos
existentes via `rclone sync` (~30 min para 10GB).

**¿Cómo veo cuánto storage estoy usando?** Cloudflare dashboard → R2 → bucket
muestra `Total Objects` y `Used Storage` en tiempo real.

---

## 15 · Rotación de credenciales

Best practice: rotar Access Key + Secret **cada 12 meses** o si sospechás
leak (commit accidental · screen share grabado · etc).

Proceso (~5 min · cero downtime):

1. R2 dashboard → **Manage R2 API Tokens**
2. Localizar token `dmx-studio-asset-library` · click **Roll**
3. Cloudflare genera nuevos `Access Key ID` + `Secret Access Key`
4. Copiar nuevos valores a 1Password
5. Actualizar `backend/.env` con los nuevos
6. Restart backend (`./scripts/dev-down.sh && ./scripts/dev-up.sh`)
7. Verificar logs `R2 connected` (paso 10) · confirmar upload portal funciona
8. (Opcional) Revocar el token viejo desde el dashboard una vez confirmado

Si necesitás revocar de emergencia (sospecha de leak): **Manage R2 API Tokens
→ Revoke** rompe el token inmediatamente. Backend caerá a modo stub hasta
que regeneres en el `.env`. Acceptable downtime: ~2 minutos.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `R2 client init failed: invalid credentials` | Paso 4 · access/secret mal copiados | Regenerar token Paso 4 |
| `bucket dmx-studio-assets does not exist` | Paso 3 · nombre incorrecto | Verificar `CLOUDFLARE_R2_BUCKET` matchea exactamente |
| Browser muestra 400 Bad Request en `<img>` | URL es S3 API en vez de R2.dev | Setear `CLOUDFLARE_R2_PUBLIC_URL` · Paso 5 |
| Upload OK pero preview 403 | Presigned URL expirada (default 1h) | Refrescar página · re-fetch URL |
| Browser bloquea upload con CORS error | Paso 6 falta · origin no permitido | Añadir origin al JSON CORS Policy |
| Egress alto inesperado | CDN cache miss | Habilitar Cloudflare Cache Rules sobre bucket |

---

## Seguridad · LFPDPPP/GDPR

- Bucket es **privado por defecto** · acceso solo via Public Development URL (read-only) + presigned URLs con TTL 1h para writes
- Token API tiene scope solo a `dmx-studio-assets` (no global)
- Backend nunca expone `CLOUDFLARE_R2_SECRET_KEY` en responses HTTP
- Audit log W4.17 registra `asset_uploaded` y `asset_deleted` actions
- Rotación recomendada: cada 12 meses (sección 15)

---

**Última actualización**: 2026-05-19 (W5.22 Z.1.1 SUB-FIX-4 · 14 secciones)
**Mantenedor**: founder · revisar token rotation cada 12 meses.
