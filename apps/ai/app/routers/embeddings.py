import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import verify_internal_key
from ..llm.embeddings_client import EmbeddingsError, get_embeddings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["embeddings"], dependencies=[Depends(verify_internal_key)])


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    dim: int


@router.post("/embeddings", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    settings = get_settings()
    if not settings.embeddings_api_key:
        raise HTTPException(status_code=503, detail="Embeddings provider not configured")

    # Guard payload size — providers reject huge inputs anyway
    texts = [t[:8000] for t in req.texts]

    try:
        vectors = await get_embeddings().embed(texts)
    except EmbeddingsError:
        logger.exception("Embedding failed")
        raise HTTPException(status_code=502, detail="Embeddings backend unavailable") from None

    return EmbedResponse(vectors=vectors, dim=settings.embeddings_dim)
