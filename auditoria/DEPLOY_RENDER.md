# Poner DesarrollosMX en producción por primera vez (Render + MongoDB Atlas)

> Hoy NO hay nada desplegado: la app corre solo en tu compu y `desarrollosmx.io` es la página
> placeholder de GoDaddy. Esta guía la pone en internet de verdad. Claude ya dejó listo el 90%
> (`backend/Dockerfile` + `render.yaml`); aquí van los pasos que solo tú puedes hacer (crear cuentas
> + pegar llaves). Una vez montado, **cada `git push` redeploya solo** — nunca más manual.
>
> Tiempo: ~40 min. Costo estimado: MongoDB Atlas gratis (M0) + Render ~$7-14/mes.

## Paso 1 · Base de datos (MongoDB Atlas) — ~10 min
1. Entra a https://www.mongodb.com/cloud/atlas → crea cuenta gratis.
2. "Build a Database" → **M0 (Free)** → región cercana (p.ej. `us-east`).
3. En **Database Access**: crea un usuario + contraseña (guárdalos).
4. En **Network Access**: "Add IP Address" → `0.0.0.0/0` (permitir desde cualquier lado; Render no da IP fija).
5. "Connect" → "Drivers" → copia el **connection string**. Se ve así:
   `mongodb+srv://USUARIO:CONTRASEÑA@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority`
   Ese texto completo es tu **`MONGO_URL`** (reemplaza USUARIO/CONTRASEÑA por los del paso 3).

## Paso 2 · Generar 2 secretos — ~2 min
Corre esto en tu terminal (dentro de la carpeta del proyecto) y guarda los resultados:
```
# IE_FERNET_KEY (cifrado en reposo):
scripts/.venv/bin/python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# ADMIN_PASSWORD (tu contraseña de superadmin — inventa una fuerte, NO uses 'Admin2026!')
```

## Paso 3 · Render — conectar el repo — ~10 min
1. Entra a https://render.com → **Sign up with GitHub** (autoriza el repo `desarrollos_mvp_emergent`).
2. Dashboard → **New +** → **Blueprint**.
3. Elige el repo → Render detecta `render.yaml` y muestra 2 servicios (**dmx-backend** y **dmx-frontend**). Dale **Apply**.
4. Render te pedirá las variables marcadas "sync:false". Pégalas en **dmx-backend**:
   - `MONGO_URL` → el string de Atlas (paso 1.5)
   - `ADMIN_PASSWORD` → tu contraseña de superadmin (paso 2)
   - `IE_FERNET_KEY` → la llave Fernet (paso 2)
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MAPBOX_TOKEN`, `STRIPE_WEBHOOK_SECRET` → tus llaves reales
     (están en tu `backend/.env` local; cópialas de ahí). Las opcionales (Apify/ElevenLabs/Twilio/R2)
     se pueden agregar después.
   - (`JWT_SECRET`, `LFPDPPP_SALT`, `CRON_SECRET`, etc. Render los genera solo — no toques.)
5. Deploy. El **backend** tarda unos minutos (construye el Docker). Cuando esté "Live", copia su URL
   (algo como `https://dmx-backend.onrender.com`).

## Paso 4 · Conectar frontend → backend — ~3 min
1. En Render → servicio **dmx-frontend** → **Environment** → variable `REACT_APP_BACKEND_URL` =
   la URL del backend del paso 3.5 (https completa).
2. Agrega también en **dmx-frontend → Environment** las banderas `REACT_APP_*` que ya usas en tu
   `frontend/.env` local para que producción arranque en la config correcta (importante:
   `REACT_APP_PRIVATE_BETA_MODE=false` para que la home pública cargue, no la lista de espera; +
   `REACT_APP_DEV_V2`, `LEADS_V2`, etc. y `REACT_APP_MAPBOX_TOKEN` si el mapa lo usa). Cópialas de tu
   `frontend/.env` local. **OJO:** no pongas `REACT_APP_LFPDPPP_SALT` en el front (se filtra al bundle;
   va solo en el backend).
3. **Manual Deploy → Deploy latest commit** (para que el frontend se reconstruya con esas variables).

## Paso 5 · Apuntar tu dominio de GoDaddy — ~10 min (+ propagación)
1. En Render → **dmx-frontend** → **Settings → Custom Domains** → agrega `desarrollosmx.io` y `www.desarrollosmx.io`.
   Render te dará registros DNS (un CNAME y/o un A).
2. Entra a GoDaddy → tu dominio → **DNS** → reemplaza los registros del web-builder por los que te dio Render.
   (Si quieres el API en `api.desarrollosmx.io`: agrega ese dominio al servicio **dmx-backend** y su CNAME en GoDaddy.)
3. Espera la propagación (minutos a ~1h). Render emite el certificado HTTPS solo.

## Paso 6 · Endurecer la base de datos (una sola vez) — ~2 min
Con el `MONGO_URL` de Atlas, corre desde tu terminal:
```
MONGO_URL="<tu string de Atlas>" DB_NAME="desarrollosmx" \
  scripts/.venv/bin/python3 backend/scripts/prod_db_hardening.py            # vista previa
MONGO_URL="<tu string de Atlas>" DB_NAME="desarrollosmx" \
  scripts/.venv/bin/python3 backend/scripts/prod_db_hardening.py --apply    # aplica
```
(Aísla tenants + borra cuentas demo. En una DB nueva no hará nada — es idempotente.)

## Paso 7 · Verificar
- Abre `https://desarrollosmx.io` → debe cargar tu app (no el placeholder de GoDaddy).
- `https://dmx-backend.onrender.com/api/health` → debe responder OK.
- Entra como superadmin: `admin@desarrollosmx.io` / la contraseña que pusiste en `ADMIN_PASSWORD`.

## De aquí en adelante
- **Cada `git push` a `main` → Render redeploya solo.** Ya no hay pasos manuales.
- Datos: producción arranca con una DB nueva (la app siembra el superadmin al arrancar). Tus datos locales
  se quedan locales; no se migran (son de dev/demo).
- Neo4j (Knowledge Graph) queda para después con Neo4j Aura (free) → setear `NEO4J_URI/USER/PASSWORD`.
- Archivos subidos (fotos/PDF): ya usan R2 (Cloudflare) si pones sus llaves; el disco de Render es efímero.

## Notas de costo
- MongoDB Atlas M0: **gratis** (512MB; suficiente para arrancar).
- Render: dmx-backend ~$7/mes (starter) · dmx-frontend estático **gratis**. Total ~$7/mes para empezar.
- Sube de plan solo si el tráfico/RAM lo pide.
