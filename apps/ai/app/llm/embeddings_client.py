import logging

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from ..config import get_settings
from .retry import is_retryable

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
        retry=retry_if_exception(is_retryable),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    async def _post(self, texts: list[str]) -> httpx.Response:
        resp = await self._client.post(
            "/embeddings",
            json={"model": self._model, "input": texts, "dimensions": self._dim},
        )
        if resp.status_code == 429 or resp.status_code >= 500:
            resp.raise_for_status()
        return resp

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # Same leak as the Groq client: an exhausted retry used to reraise
        # httpx.HTTPStatusError, which callers catching EmbeddingsError never
        # saw. Everything now leaves as EmbeddingsError.
        try:
            resp = await self._post(texts)
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Embeddings failed after retries: status=%s body=%s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            raise EmbeddingsError(
                f"Embeddings request failed with status {exc.response.status_code}"
            ) from exc
        except httpx.TransportError as exc:
            logger.error("Embeddings transport error after retries: %s", exc)
            raise EmbeddingsError("Embeddings transport error") from exc

        if resp.is_error:
            logger.error(
                "Embeddings request failed: status=%s body=%s",
                resp.status_code,
                resp.text[:500],
            )
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
