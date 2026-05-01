# IE Engine — Fernet credential cipher

## Qué cifra

Toda la columna `credentials` de `ie_data_sources` (api keys, tokens, resource_ids)
se cifra con **Fernet AES-128-CBC + HMAC-SHA256** antes de ir a MongoDB.
Solo el backend con `IE_FERNET_KEY` puede descifrarla.

## Variable de entorno

```
IE_FERNET_KEY=<base64 urlsafe 32 bytes>
```

Está en `backend/.env`. **Nunca** debe entrar al repo (ya cubierto por `.gitignore`
+ `SECRETS_POLICY.md`).

## Generar una key nueva

```bash
python3 -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
```

Pega el resultado como valor de `IE_FERNET_KEY` en `backend/.env`.

## Rotación segura (3 pasos)

Cuando rotes la key (sospecha de leak, rotación periódica anual, etc.):

### 1. Descifra credenciales con la key vieja

```bash
cd /app/backend && python3 - <<'PY'
import asyncio, json, os
from cryptography.fernet import Fernet
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
old = Fernet(os.environ["IE_FERNET_KEY"].encode())

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    docs = await db.ie_data_sources.find({"credentials": {"$ne": None}}, {"_id": 0, "id": 1, "credentials": 1}).to_list(100)
    out = {d["id"]: json.loads(old.decrypt(d["credentials"].encode()).decode()) for d in docs}
    print(json.dumps(out, indent=2))

asyncio.run(main())
PY
```

### 2. Genera la key nueva y reemplaza

```bash
NEW_KEY=$(python3 -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
sed -i "s|^IE_FERNET_KEY=.*$|IE_FERNET_KEY=${NEW_KEY}|" /app/backend/.env
```

### 3. Re-cifra y guarda con la key nueva

Edita el script anterior — donde imprime el JSON, en su lugar abre un nuevo cipher
con la key nueva y escribe `db.ie_data_sources.update_one({"id": id}, {"$set": {"credentials": new_cipher.encrypt(json.dumps(creds).encode()).decode()}})`.

Reinicia: `sudo supervisorctl restart backend`.

## Recovery si pierdes la key

Las credenciales cifradas se vuelven irrecuperables. Mitigación:

1. Elimina las filas afectadas: `db.ie_data_sources.update_many({}, {"$set": {"credentials": null, "status": "blocked"}})`.
2. Re-genera `IE_FERNET_KEY` y reingresa las credenciales desde la UI
   `/superadmin/data-sources` → modal "Conectar".

## Testing local

Si `IE_FERNET_KEY` está ausente, el backend **deriva una key determinística desde
`JWT_SECRET`** para que el dev pod arranque. NO uses esto en producción — la
derivación deja la cifra atada al JWT, que rota en otros incidentes.
