"""Catch-up + idempotencia del parte (founder 07-22: 'no recibí ninguna notificación').

Causa: en hosting local el backend puede no estar arriba a las 14:00 → el job del parte no dispara.
Fix: al arrancar, si ya pasó la hora y el parte de hoy no se mandó, se manda — SIN duplicar (registro
en partes_enviados por periodo+día). El bot/chat/generación ya funcionaban; el hueco era el disparo."""
import mongomock_motor
import pytest

import parte_engine as pe


@pytest.fixture()
def db():
    return mongomock_motor.AsyncMongoMockClient()["t"]


@pytest.mark.asyncio
async def test_no_duplica_si_ya_se_envio_hoy(db, monkeypatch):
    enviados = []

    async def fake_enviar(_db, periodo):
        enviados.append(periodo)
        return {"periodo": periodo, "texto": "x", "enviado": {"telegram": True, "correo": False}}

    monkeypatch.setattr(pe, "enviar_parte", fake_enviar)
    monkeypatch.setattr(pe, "cadencias_de_hoy", lambda hoy=None: ["diario"])

    # 1ª corrida (job de las 14:00): manda
    r1 = await pe.enviar_partes_del_dia(db)
    # marcar como enviado (lo haría enviar_parte real; aquí lo simulamos)
    from datetime import datetime, timezone
    fecha = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
    await db.partes_enviados.update_one({"periodo": "diario", "fecha": fecha},
                                        {"$set": {"periodo": "diario", "fecha": fecha, "telegram": True}},
                                        upsert=True)
    # 2ª corrida (catch-up de arranque): NO vuelve a mandar
    r2 = await pe.enviar_partes_del_dia(db, catch_up=True)
    assert r1 == ["diario"] and r2 == []          # el catch-up no duplica
    assert enviados == ["diario"]                  # enviar_parte se llamó UNA vez


@pytest.mark.asyncio
async def test_ya_enviado_hoy(db):
    from datetime import datetime, timezone
    fecha = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
    assert await pe._ya_enviado_hoy(db, "diario") is False
    await db.partes_enviados.insert_one({"periodo": "diario", "fecha": fecha, "telegram": True})
    assert await pe._ya_enviado_hoy(db, "diario") is True
    assert await pe._ya_enviado_hoy(db, "semanal") is False   # otro periodo, no confunde


@pytest.mark.asyncio
async def test_enviar_parte_registra_el_envio(db, monkeypatch):
    async def fake_generar(_db, periodo):
        return "texto del parte"

    async def fake_chat(_db):
        return 123

    async def fake_tg(method, payload):
        return {"ok": True}

    monkeypatch.setattr(pe, "generar_parte", fake_generar)
    import telegram_bot
    monkeypatch.setattr(telegram_bot, "_chat_vinculado", fake_chat)
    monkeypatch.setattr(telegram_bot, "_tg", fake_tg)

    r = await pe.enviar_parte(db, "diario")
    assert r["enviado"]["telegram"] is True
    # quedó registrado → catch-up no lo repetiría
    assert await pe._ya_enviado_hoy(db, "diario") is True
