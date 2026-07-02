"""Feature: señales de feedback estructuradas (Batch 7). feedback_signals es liviano (sin LLM en el
path determinista) → tests de comportamiento reales."""
import asyncio

import feedback_signals as fs


def test_validador_cierra_taxonomia():
    """_valid_signals descarta claves/valores fuera de la taxonomía (defensa: cero texto libre / PII)."""
    raw = {
        "outcome": "no_interesado",
        "objeciones": [{"cat": "precio", "sub": "m2"}, {"cat": "HACK", "sub": "x"}],
        "atractores": ["ubicacion", "texto_libre_malicioso"],
        "perfil": {"tipo_comprador": "inversion", "uso": "INVALIDO"},
        "gap_producto": {"recamaras_deseadas": 3, "amenidad_faltante": "alberca", "precio_objetivo": 4_200_000},
        "competencia_motivo": "mas_barato",
        "campo_pirata": "DROP TABLE",
    }
    c = fs._valid_signals(raw)
    assert c["outcome"] == "no_interesado"
    assert c["objeciones"] == [{"cat": "precio", "sub": "m2"}]      # HACK descartado
    assert c["atractores"] == ["ubicacion"]                          # texto libre descartado
    assert c["perfil"] == {"tipo_comprador": "inversion"}            # uso inválido descartado
    assert c["gap_producto"]["recamaras_deseadas"] == 3
    assert c["competencia_motivo"] == "mas_barato"
    assert "campo_pirata" not in c


def test_validador_rechaza_texto_libre_en_objecion():
    # un intento de meter texto de conversación como sub-motivo se cae (no está en la taxonomía)
    c = fs._valid_signals({"objeciones": [{"cat": "precio", "sub": "el cliente dijo que su esposa..."}]})
    assert c["objeciones"] == [{"cat": "precio", "sub": None}]


class _Coll:
    def __init__(self, docs):
        self.docs = docs

    def find(self, q, proj=None):
        async def _gen():
            for d in self.docs:
                yield d
        return _gen()


class _DB:
    def __init__(self, docs):
        self.leads = _Coll(docs)


def test_aggregate_y_k_anonimato():
    docs = [
        {"colonia_id": "roma", "dev_org_id": "devA",
         "feedback_signals": {"objeciones": [{"cat": "precio"}], "atractores": ["ubicacion"]}},
        {"colonia_id": "roma", "dev_org_id": "devA", "feedback_signals": {"objeciones": [{"cat": "precio"}]}},
        {"colonia_id": "roma", "dev_org_id": "devA", "feedback_signals": {"objeciones": [{"cat": "ubicacion"}]}},
    ]
    agg = asyncio.run(fs.aggregate_feedback(_DB(docs), dev_ids=["devA"], min_n=3))
    assert agg["objeciones"]["precio"] == 2
    assert agg["atractores"]["ubicacion"] == 1
    assert "roma" in agg["objeciones_por_colonia"]   # 3 señales >= min_n
    # k-anonimato: con umbral alto, la colonia se oculta
    agg2 = asyncio.run(fs.aggregate_feedback(_DB(docs), dev_ids=["devA"], min_n=99))
    assert agg2["objeciones_por_colonia"] == {}


def test_auto_extract_determinista_sin_llm():
    """Sin LLM, auto_extract mapea los campos estructurados existentes (lost_reason/visit_outcome) a la taxonomía."""
    lead = {"id": "L1", "status": "cerrado_perdido", "lost_reason": "precio",
            "visit_outcome": "no", "payment_methods": ["contado"], "intent": "inversion", "notes": []}
    sig = asyncio.run(fs.auto_extract(None, lead))
    assert sig["outcome"] == "no_interesado"
    assert {"cat": "precio", "sub": "general"} in sig["objeciones"]
    assert sig["perfil"]["forma_pago"] == "contado"
    assert sig["perfil"]["tipo_comprador"] == "inversion"
