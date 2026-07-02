# Imagen de producción del backend FastAPI de DesarrollosMX.
# Contexto de build = ./backend (ver docker-compose.yml / render.yaml).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Librerías del SO para lxml / shapely / pillow / reportlab / cryptography.
# (La mayoría de deps traen wheels manylinux; esto es red de seguridad para builds desde fuente.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libxml2-dev libxslt1-dev \
      libgeos-dev \
      libjpeg-dev zlib1g-dev \
      curl \
 && rm -rf /var/lib/apt/lists/*

# Instala dependencias primero (capa cacheable).
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Código del backend.
COPY . .

# El puerto real lo inyecta la plataforma vía $PORT (Render/Railway); 8001 = fallback local.
EXPOSE 8001
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001}"]
