"""Shared retry predicate for the outbound LLM/embeddings HTTP clients."""

import httpx


def is_retryable(exc: BaseException) -> bool:
    """Transport blips and provider 429/5xx are worth another attempt.

    A 4xx other than 429 is a request problem — retrying it just burns the
    rate-limit budget and delays the real error.
    """
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status == 429 or status >= 500
    return False
