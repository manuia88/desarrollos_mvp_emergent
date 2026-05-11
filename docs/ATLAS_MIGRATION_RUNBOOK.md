# MongoDB Atlas Migration Runbook · DesarrollosMX

**Audiencia**: founder no-técnico · paso a paso visual.

**Cuándo ejecutar**: justo antes del lanzamiento real (primeros clientes pagando), no antes.

**Tiempo estimado**: 30-45 minutos.

**Reversible**: sí, mientras tengas el backup pre-migración.

---

## ¿Por qué migrar?

Hoy MongoDB vive **dentro de emergent**. Si emergent se cae o reinicia el sandbox, los datos pueden perderse.

MongoDB Atlas es el mismo MongoDB pero **gestionado por MongoDB Inc.** en la nube. Trae gratis:
- Backup automático cada 24h
- 99.9% uptime garantizado
- Free tier 512 MB (suficiente varios meses pre-launch)
- Acceso desde cualquier deployment (emergent, server propio, etc)

---

## Paso 1 · Crear cuenta Atlas (10 min)

1. Ir a https://www.mongodb.com/cloud/atlas/register
2. Registrarse con email `founder@desarrollosmx.io` (o el que prefieras)
3. Crear **organization**: "DesarrollosMX"
4. Crear **project**: "DMX-Production"
5. **Build a Database** → elegir tier **M0 (Free · 512 MB)**
   - Provider: AWS
   - Region: `us-east-1` (Virginia · menor latencia para MX)
   - Cluster name: `dmx-prod-cluster`

---

## Paso 2 · Configurar acceso (5 min)

**Security → Database Access:**
1. Add New Database User
2. Username: `dmx-app`
3. Password: generar uno fuerte (clic "Autogenerate Secure Password") · **GUARDARLO**
4. Database User Privileges: "Read and write to any database"
5. Save

**Security → Network Access:**
1. Add IP Address
2. Por simplicidad inicial: "Allow access from anywhere" (`0.0.0.0/0`)
   - ⚠️ Aceptable para tier M0 con auth fuerte. Post-launch restringir a IP de emergent + tu IP.
3. Confirm

---

## Paso 3 · Obtener la connection string (2 min)

1. Database → cluster `dmx-prod-cluster` → **Connect**
2. **Drivers** → Python · version 3.6+
3. Copiar la connection string · se ve así:
   ```
   mongodb+srv://dmx-app:<password>@dmx-prod-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Reemplazar `<password>` con el password real del paso 2
5. **Guardar esto en un lugar seguro** · es la llave maestra a tu DB

---

## Paso 4 · Backup pre-migración (5 min · CRÍTICO)

Antes de tocar nada, hacer copia de seguridad de los datos actuales en emergent.

En emergent chat, pegar este prompt:

> Ejecuta `mongodump --uri="$MONGO_URL" --gzip --archive=/app/backups/pre_atlas_migration_$(date +%Y%m%d).gz` y luego haz Save to GitHub del archivo. Si la carpeta /app/backups no existe, créala.

Resultado: archivo `.gz` con todos los datos · queda commiteado en el repo · respaldo permanente.

---

## Paso 5 · Migrar datos a Atlas (10 min)

En emergent chat, pegar este prompt:

> Ejecuta `mongorestore --uri="mongodb+srv://dmx-app:<TU_PASSWORD>@dmx-prod-cluster.xxxxx.mongodb.net/<DB_NAME>" --gzip --archive=/app/backups/pre_atlas_migration_<FECHA>.gz`
>
> Reemplaza `<TU_PASSWORD>`, `<DB_NAME>` y `<FECHA>` con los valores reales.
>
> Cuando termine, confirma cuántos documentos se restauraron por colección.

Resultado: tus datos ahora viven en Atlas.

---

## Paso 6 · Cambiar emergent para usar Atlas (3 min)

1. Abrir emergent → configuración del proyecto → **Environment Variables**
2. Buscar `MONGO_URL`
3. Cambiar el valor a la connection string del Paso 3
4. Save
5. Restart del backend (emergent lo hace automático al cambiar env vars)

A partir de aquí, **emergent escribe en Atlas**, no en su Mongo interna.

---

## Paso 7 · Verificación (5 min)

Test rápido para confirmar que todo funciona:

1. Abrir tu app en emergent preview
2. Crear un proyecto/lead nuevo de prueba
3. Refrescar
4. ¿Aparece? → migración exitosa ✅
5. En Atlas web UI: Database → Collections → ¿ves el documento nuevo?

Si algo falla:
- Revisar `MONGO_URL` esté bien pegada (sin espacios al inicio/fin)
- Revisar Network Access permite 0.0.0.0/0
- Revisar el password en la URL sea correcto

---

## Rollback (si algo sale mal)

1. En emergent env vars: cambiar `MONGO_URL` de vuelta al valor original (emergent debería tenerlo en su historial)
2. Restart backend
3. Datos pre-migración intactos en su Mongo interna
4. Datos creados durante migración → se pierden (estás antes de tener clientes reales · daño mínimo)

---

## Post-migración · próximos pasos

Una vez que Atlas esté vivo:

- ✅ Backups automáticos cada 24h gratis (M0)
- ⏳ Configurar alertas Atlas (email cuando uso >80%)
- ⏳ Cuando crezcas a M10 ($57/mes): backups continuos + point-in-time recovery
- ⏳ Restringir Network Access a IPs específicas (cuando estabilice infra producción)

---

## Resumen ejecutivo

| Paso | Quién | Tiempo |
|------|-------|--------|
| 1. Crear cuenta Atlas | Founder | 10 min |
| 2. Configurar acceso | Founder | 5 min |
| 3. Obtener connection string | Founder | 2 min |
| 4. Backup pre-migración | Emergent (prompt founder) | 5 min |
| 5. Migrar datos | Emergent (prompt founder) | 10 min |
| 6. Cambiar emergent env var | Founder | 3 min |
| 7. Verificación | Founder | 5 min |
| **Total** | | **~40 min** |

**Costo recurrente**: $0/mes hasta que pases 512 MB · luego M10 $57/mes.
