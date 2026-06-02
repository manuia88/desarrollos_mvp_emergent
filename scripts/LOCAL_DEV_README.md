# DMX · Local Dev (Mac)

Setup para correr DMX en tu Mac sin depender de emergent.
**Uso:** un solo comando arranca todo (`./scripts/dev-up.sh`).

---

## 1. Requisitos (verificar 1 sola vez)

Abre **Terminal** y pega esto. Debe responder con versiones (no "command not found"):

```bash
docker --version    # motor Docker (OrbStack o Docker Desktop) corriendo
node --version      # v20+ OK
python3 --version   # 3.9+ OK
```

Si te falta alguno:
- **OrbStack** (recomendado · más liviano que Docker Desktop): https://orbstack.dev
- **Docker Desktop** (alternativa): https://www.docker.com/products/docker-desktop/
- **Node**: https://nodejs.org (versión LTS)
- **Python3**: ya viene en macOS · si no, `brew install python`

⚠️ **El motor Docker (OrbStack o Docker Desktop) debe estar abierto antes de correr `dev-up.sh`**.

---

## 2. Arrancar todo

```bash
cd /Users/manuelacosta/Developer/desarrollos_mvp_emergent
./scripts/dev-up.sh
```

La **primera vez** tarda 3–5 min (instala deps Python + Node).
Las siguientes corridas: ~15 segundos.

Cuando termine verás:

```
Frontend → http://localhost:3000
Backend  → http://localhost:8000/docs
Mongo    → localhost:27017 (Docker dmx-local-mongo)
```

Abre **http://localhost:3000** en el navegador.

---

## 3. Login superadmin

| Campo    | Valor                |
|----------|----------------------|
| Email    | `admin@local.dmx.io` |
| Password | `localdev`           |

(El backend crea este usuario solo al arrancar la primera vez.)

---

## 4. Cargar data demo (opcional pero recomendado)

Para no ver pantallas vacías al picar botones:

```bash
source scripts/.venv/bin/activate
python3 scripts/dev-seed.py
```

Esto crea: 2 tenants, 3 proyectos, 5 leads, 10 contactos.
Es **idempotente** (corres 2 veces y no duplica).

---

## 5. Apagar

```bash
./scripts/dev-down.sh           # apaga backend + frontend · Mongo sigue viva
./scripts/dev-down.sh --all     # apaga TODO incluido Mongo
```

---

## 6. Ver logs cuando algo falla

```bash
tail -f scripts/logs/backend.log
tail -f scripts/logs/frontend.log
```

---

## 7. Errores comunes

### "Cannot connect to Docker daemon"
El motor Docker no está corriendo. Abre OrbStack (o Docker Desktop), espera a que diga "running" y reintenta.

### "Port 3000 already in use" / "Port 8000 already in use"
```bash
./scripts/dev-down.sh
./scripts/dev-up.sh
```

### Frontend muestra "Network Error" al login
El backend no respondió. Revisa `scripts/logs/backend.log`. Probable falta una env var.

### "command not found: yarn"
La primera vez `dev-up.sh` instala yarn automáticamente vía corepack. Si falla:
```bash
npm install -g yarn
```

### Pantalla en blanco en una sección
Falta data → corre el seed (paso 4) o esa feature requiere una API key externa (ver sección 8).

---

## 8. API keys externas (opcionales)

Algunas features no funcionan sin claves de servicios externos. Edita `backend/.env.local`:

| Variable           | Para qué sirve              | Dónde sacarla                      |
|--------------------|-----------------------------|------------------------------------|
| `EMERGENT_LLM_KEY` | LLM (chat, sugerencias)     | Tu cuenta emergent.sh              |
| `MAPBOX_TOKEN`     | Mapas                       | https://account.mapbox.com         |
| `OPENAI_API_KEY`   | OpenAI (fallback LLM)       | https://platform.openai.com        |
| `ANTHROPIC_API_KEY`| Claude API                  | https://console.anthropic.com      |

⚠️ **Usa claves DISTINTAS** a las de emergent (para no quemar quota).

Después de editar `.env.local`, reinicia: `./scripts/dev-down.sh && ./scripts/dev-up.sh`.

---

## 9. Qué NO hace este setup

- ❌ No pushea nada al repo de GitHub
- ❌ No toca el preview de emergent
- ❌ No modifica archivos del esqueleto del código
- ✅ Solo crea archivos nuevos en `scripts/` y `.env.local` (en gitignore)

---

## 10. Para devs: estructura

```
scripts/
├── dev-up.sh        # arranca todo
├── dev-down.sh      # apaga todo
├── dev-seed.py      # data demo
├── LOCAL_DEV_README.md  # este archivo
├── logs/            # backend.log, frontend.log, *.pid
├── dev-data/        # volumen persistente de Mongo
└── .venv/           # virtualenv Python (deps backend)
```

Mongo persiste en `scripts/dev-data/mongo/`. Para wipe total:
```bash
./scripts/dev-down.sh --all
rm -rf scripts/dev-data
```
