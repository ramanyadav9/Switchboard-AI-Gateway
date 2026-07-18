from functools import lru_cache

from fastembed import TextEmbedding


@lru_cache(maxsize=1)
def _get_model() -> TextEmbedding:
    return TextEmbedding(model_name="BAAI/bge-small-en-v1.5")


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    return list(model.embed(texts))


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
