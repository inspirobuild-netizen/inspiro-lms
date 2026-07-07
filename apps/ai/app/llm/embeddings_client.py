import logging

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ..config import get_settings

logger = logging.getLogger(__name__)


class EmbeddingsError(Exception):
    """Raised when the embeddings call fails or returns unusable output."""


class EmbeddingsClient:
    """OpenAI-compatible /embeddings client (Jina by default)."""

    def __init__(self) -> None:
        settings = get_settings()
        self._model = settings.embeddings_model
        self._dim = settings.embeddings_dim
        self._client = httpx.AsyncClient(
            base_url=settings.embeddings_base_url,
            headers={"Authorization": f"Bearer {settings.embeddings_api_key}"},
            timeout=30.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def embed(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.post(
            "/embeddings",
            json={"model": self._model, "input": texts, "dimensions": self._dim},
        )
        if resp.status_code == 429 or resp.status_code >= 500:
            resp.raise_for_status()
        if resp.is_error:
            logger.error("Embeddings request failed: status=%s", resp.status_code)
            raise EmbeddingsError(f"Embeddings request failed with status {resp.status_code}")

        data = resp.json()
        try:
            items = sorted(data["data"], key=lambda d: d["index"])
            vectors = [item["embedding"] for item in items]
        except (KeyError, TypeError) as exc:
            raise EmbeddingsError("Embeddings response malformed") from exc

        if len(vectors) != len(texts):
            raise EmbeddingsError("Embeddings count mismatch")
        return vectors


_client: EmbeddingsClient | None = None


def get_embeddings() -> EmbeddingsClient:
    global _client
    if _client is None:
        _client = EmbeddingsClient()
    return _client


async def shutdown_embeddings() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
