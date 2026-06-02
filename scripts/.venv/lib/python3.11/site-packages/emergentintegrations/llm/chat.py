"""Stub mínimo · cualquier llamada lanza NotImplementedError en runtime."""


class UserMessage:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


class LlmChat:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs

    def with_model(self, *args, **kwargs):
        return self

    def with_system_message(self, *args, **kwargs):
        return self

    def with_max_tokens(self, *args, **kwargs):
        return self

    async def send_message(self, *args, **kwargs):
        raise NotImplementedError(
            "emergentintegrations stub · feature LLM no disponible en local "
            "(requiere paquete privado de emergent.sh)"
        )
