import hmac

from fastapi import Header, HTTPException

from .config import get_settings


async def verify_internal_key(x_internal_key: str = Header(default="")) -> None:
    """Service-to-service auth: only the Node API may call this service.

    Uses constant-time comparison. Never expose this service publicly —
    bind it to the internal Docker network only.
    """
    settings = get_settings()
    if not settings.internal_api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")
    if not hmac.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="Invalid internal key")
