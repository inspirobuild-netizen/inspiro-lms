import json
import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from ..config import get_settings
from .retry import is_retryable

logger = logging.getLogger(__name__)


class LlmError(Exception):
    """Raised when the LLM call fails or returns unusable output."""


class GroqClient:
    """Thin wrapper over Groq's OpenAI-compatible chat completions API."""

    def __init__(self) -> None:
        settings = get_settings()
        self._model = settings.groq_model
        self._client = httpx.AsyncClient(
            base_url=settings.groq_base_url,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            timeout=settings.llm_timeout_seconds,
        )

    async def close(self) -> None:
        await self._client.aclose()

    # Backoff reaches ~30s because Groq's limits are per-minute: the old 1-8s
    # ceiling retried three times inside a single rate-limit window and gave up
    # while still throttled.
    @retry(
        retry=retry_if_exception(is_retryable),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        resp = await self._client.post("/chat/completions", json=payload)
        # 429/5xx are retryable; raise so tenacity sees them. 4xx is returned
        # as-is for the caller to report with its body.
        if resp.status_code == 429 or resp.status_code >= 500:
            resp.raise_for_status()
        return resp

    async def chat(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        # Every failure leaves as LlmError. Previously an exhausted retry
        # reraised httpx.HTTPStatusError, which the routers' `except LlmError`
        # did not catch — a rate-limited article escaped as an unhandled 500
        # with a traceback instead of a clean 502.
        try:
            resp = await self._post(payload)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            logger.error(
                "Groq request failed after retries: status=%s body=%s",
                status,
                exc.response.text[:500],
            )
            raise LlmError(f"LLM request failed with status {status}") from exc
        except httpx.TransportError as exc:
            logger.error("Groq transport error after retries: %s", exc)
            raise LlmError("LLM transport error") from exc

        if resp.is_error:
            # Body included: without it a 400 is undiagnosable, which is exactly
            # how a broken model name or bad payload could hide for weeks.
            logger.error(
                "Groq request failed: status=%s body=%s", resp.status_code, resp.text[:500]
            )
            raise LlmError(f"LLM request failed with status {resp.status_code}")

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LlmError("LLM returned malformed response") from exc

    async def chat_json(self, system: str, user: str, **kwargs: Any) -> dict[str, Any]:
        """Chat with JSON-mode enforced and the result parsed."""
        raw = await self.chat(system, user, json_mode=True, **kwargs)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LlmError("LLM returned invalid JSON") from exc
        if not isinstance(parsed, dict):
            raise LlmError("LLM JSON was not an object")
        return parsed


_client: GroqClient | None = None


def get_groq() -> GroqClient:
    global _client
    if _client is None:
        _client = GroqClient()
    return _client


async def shutdown_groq() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
