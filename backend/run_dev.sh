#!/bin/zsh
# backend local con AUTO-RELOAD: la clase "proceso viejo" muere aquí (founder 07-15)
cd "$(dirname "$0")"
exec ../scripts/.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
