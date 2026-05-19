# Cloudflare R2 · Setup guide para DMX Studio Asset Library

**Owner**: founder · **Tiempo estimado**: ~25 min · **Costo**: $0 hasta 10GB/mes (R2 free tier).

Esta guía cubre la configuración de Cloudflare R2 como backend de storage para
**W5.22 Z.1 Sub-C · Studio Asset Library + Mood Board**. Mientras las 4 env
vars `CLOUDFLARE_R2_*` no estén configuradas el backend funciona en **modo
stub** (presigned URLs retornan `null` · no rompe nada · solo no se pueden
subir/servir assets reales).

---

## ¿Por qué R2 y no S3?

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

## Paso 1 · Crear cuenta Cloudflare (skip si ya existe)

1. Ir a <https://dash.cloudflare.com/sign-up>
2. Email founder · password fuerte (1Password recomendado)
3. Verificar email · sin tarjeta de crédito requerida para R2 free tier
4. Anotar el `Account ID` que aparece en el sidebar derecho del dashboard

---

## Paso 2 · Habilitar R2 (Object Storage)

1. En el dashboard izquierdo: **R2 Object Storage**
2. Click **Purchase R2 Plan** (free tier · no requiere tarjeta hasta exceder 10GB)
3. Confirmar términos · plan **R2 Standard** (gratis hasta 10GB/mes)

Una vez habilitado verás la sección R2 con `Buckets` vacío.

---

## Paso 3 · Crear bucket `dmx-studio-assets`

1. Click **Create bucket**
2. **Bucket name**: `dmx-studio-assets` (debe matchear `CLOUDFLARE_R2_BUCKET` en `.env`)
3. **Location**: dejar en default (Cloudflare elige automáticamente · global edge)
4. **Default Storage Class**: `Standard`
5. Click **Create bucket**
6. (Opcional pero recomendado) En **Settings → Public Access**: dejar **OFF**
   por defecto · DMX sirve via presigned URLs · no exposición pública directa

---

## Paso 4 · Generar API token (Access Key + Secret)

1. R2 dashboard → **Manage R2 API Tokens**
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

## Paso 5 · Anotar S3 endpoint URL (auto-generado)

En la página del bucket aparece la línea:

```
S3 API: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Anotar el `<ACCOUNT_ID>` (32 chars hex · es el `Account ID` del Paso 1).

---

## Paso 6 · Configurar env vars en backend `.env`

Editar `backend/.env` (NO `.env.example` · que solo tiene placeholders):

```bash
# W5.22 Z.1 — Studio Brand Kit + Asset Library (Cloudflare R2)
CLOUDFLARE_R2_ACCOUNT_ID=<32-char-hex-del-paso-1>
CLOUDFLARE_R2_ACCESS_KEY=<access-key-del-paso-4>
CLOUDFLARE_R2_SECRET_KEY=<secret-del-paso-4>
CLOUDFLARE_R2_BUCKET=dmx-studio-assets
```

**Importante**:
- NO incluir `https://` en `CLOUDFLARE_R2_ACCOUNT_ID` · es solo el hex
- NO committear `backend/.env` · ya está en `.gitignore`
- Verificar `git status` después de editar · NO debe aparecer

Restart backend para tomar los nuevos valores:

```bash
cd backend && supervisorctl restart backend
# o si corre en docker:
docker compose restart backend
```

---

## Paso 7 · Verificación end-to-end

### 7.1 Backend logs

Buscar en logs al inicio:

```
[startup] studio_asset_library R2 connected · bucket=dmx-studio-assets
```

Si aparece `R2 client init failed: invalid credentials` → revisar Paso 4-6.

### 7.2 Test desde Python REPL

```bash
cd backend && python3 -c "
from studio_asset_library import _get_r2_client
client = _get_r2_client()
print('R2 OK' if client else 'R2 stub mode (env vars missing)')
"
```

### 7.3 Test upload via portal Studio

1. Login como developer · abrir `/portal/studio/assets`
2. Drag-and-drop una imagen pequeña (logo PNG ~50KB)
3. Verificar:
   - Imagen aparece en la grid sin error
   - Click en preview · imagen se carga
   - DevTools Network · ver que la URL es `https://<ACCOUNT_ID>.r2.cloudflarestorage.com/...`
   - Cloudflare R2 dashboard · bucket muestra 1 object

### 7.4 Rollback rápido

Si algo falla y necesitas volver a modo stub temporalmente:

```bash
# Comentar las 4 vars en backend/.env
sed -i '' 's/^CLOUDFLARE_R2/#CLOUDFLARE_R2/' backend/.env
supervisorctl restart backend
```

El backend volverá a `STUDIO_ADS_ENGINE=openai-stub` automáticamente · sin
romper nada para usuarios existentes.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `R2 client init failed: invalid credentials` | Paso 4 · access/secret mal copiados | Regenerar token Paso 4 |
| `bucket dmx-studio-assets does not exist` | Paso 3 · nombre incorrecto | Verificar `CLOUDFLARE_R2_BUCKET` matchea exactamente |
| Upload OK pero preview 403 | Presigned URL expirada (default 1h) | Refrescar página · re-fetch URL |
| Egress alto inesperado | CDN cache miss | Habilitar Cloudflare Cache Rules sobre bucket |

---

## Seguridad · LFPDPPP/GDPR

- Bucket es **privado por defecto** · acceso solo via presigned URLs con TTL 1h
- Token API tiene scope solo a `dmx-studio-assets` (no global)
- Backend nunca expone `CLOUDFLARE_R2_SECRET_KEY` en responses HTTP
- Audit log W4.17 registra `asset_uploaded` y `asset_deleted` actions

---

## Costos esperados H1 (mayo-octubre 2026)

| Métrica | H1 estimado | Free tier | Costo H1 |
|---|---|---|---|
| Storage | ~3GB | 10GB | $0 |
| Reads/mes | ~200K | 1M | $0 |
| Writes/mes | ~5K | 1M | $0 |
| Egress | ~2GB | ilimitado | $0 |
| **Total** | | | **$0/mes** |

Si DMX escala >10GB storage en H2 · costo R2: $0.015/GB/mes · 50GB = $0.75/mes.

---

**Última actualización**: 2026-05-19 (W5.22 Z.1.1 SUB-FIX-3)
**Mantenedor**: founder · revisar token rotation cada 12 meses.
